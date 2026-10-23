import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { InventoryService } from './inventory.service.js';
import { MembershipService } from './membership.service.js';
import { logger } from '../utils/logger.js';

export class OrderService {
  /**
   * Generate clean order number, e.g. NM-20261022-8F3A
   */
  static generateOrderNumber() {
    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randStr = crypto.randomBytes(3).toString('hex').toUpperCase();
    return `NM-${dateStr}-${randStr}`;
  }

  /**
   * Create an order and atomically reserve the inventory
   */
  static async createOrder({ telegramId, productId, profileId = null, promoCode = null }) {
    // 1. Fetch product
    const { data: product, error: prodErr } = await supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .eq('is_active', true)
      .single();

    if (prodErr || !product) {
      throw new Error('Product not found or inactive');
    }

    let finalPrice = Number(product.price);

    // 2. Check VIP Membership discount if profileId provided
    if (profileId) {
      const membership = await MembershipService.getActiveMembership(profileId);
      if (membership && membership.discount_percentage) {
        const discountAmount = (finalPrice * Number(membership.discount_percentage)) / 100;
        finalPrice = Math.max(0.01, finalPrice - discountAmount);
      }
    }

    // 3. Check Promo Code if provided
    if (promoCode) {
      const { data: promo } = await supabase
        .from('promotions')
        .select('*')
        .eq('code', String(promoCode).toUpperCase())
        .eq('is_active', true)
        .maybeSingle();

      if (promo && Number(promo.discount_percent) > 0) {
        const promoDiscount = (finalPrice * Number(promo.discount_percent)) / 100;
        finalPrice = Math.max(0.01, finalPrice - promoDiscount);
      }
    }

    finalPrice = Number(finalPrice.toFixed(2));
    const orderNumber = this.generateOrderNumber();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    // 4. Create pending order row
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .insert([{
        order_number: orderNumber,
        profile_id: profileId,
        telegram_id: Number(telegramId),
        total_amount: finalPrice,
        currency: 'USD',
        status: 'pending',
        reservation_expires_at: expiresAt
      }])
      .select()
      .single();

    if (orderErr) {
      logger.error({ orderErr, orderNumber }, 'Failed to create order record');
      throw new Error(`Failed to create order: ${orderErr.message}`);
    }

    // 5. Atomically reserve inventory
    const inventoryType = product.type === 'rockstar_account' ? 'account' : 'code';
    try {
      await InventoryService.reserveInventory(order.id, product.id, inventoryType, 15);
    } catch (resErr) {
      // If reservation fails, mark order failed immediately
      await supabase.from('orders').update({ status: 'failed' }).eq('id', order.id);
      throw resErr;
    }

    // 6. Create initial pending payment record
    const { data: payment } = await supabase
      .from('payments')
      .insert([{
        order_id: order.id,
        merchant_order_ref: orderNumber,
        provider: 'aba_payway',
        amount: finalPrice,
        currency: 'USD',
        status: 'pending'
      }])
      .select()
      .single();

    return {
      order,
      payment,
      product,
      amount: finalPrice,
      expiresAt
    };
  }

  /**
   * Get single order by ID
   */
  static async getOrderById(orderId) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        payments (*)
      `)
      .eq('id', orderId)
      .single();

    if (error) return null;
    return data;
  }

  /**
   * Get order by reference number
   */
  static async getOrderByRef(orderNumber) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        payments (*)
      `)
      .eq('order_number', orderNumber)
      .maybeSingle();

    if (error) return null;
    return data;
  }

  /**
   * Strictly isolated user orders for Telegram customer
   */
  static async getUserOrders(telegramId, limit = 10) {
    const { data, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('telegram_id', Number(telegramId))
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      logger.error({ error, telegramId }, 'Error fetching user orders');
      return [];
    }
    return data || [];
  }

  /**
   * Get all orders for Admin Dashboard
   */
  static async getAllOrders({ status, limit = 50, offset = 0 } = {}) {
    let query = supabase
      .from('orders')
      .select(`
        *,
        order_items (*),
        payments (*)
      `, { count: 'exact' });

    if (status) query = query.eq('status', status);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      logger.error({ error }, 'Failed to fetch admin orders');
      return { orders: [], total: 0 };
    }
    return { orders: data || [], total: count || 0 };
  }
}
