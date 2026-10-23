import { supabase } from '../config/supabase.js';
import { decryptPayload } from '../utils/encryption.js';
import { NotificationService } from './notification.service.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, messages } from '../utils/telegram.js';

export class DeliveryService {
  /**
   * Process automatic digital delivery for a paid order
   * @param {string} orderId 
   */
  static async deliverOrder(orderId) {
    // 1. Fetch order details
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      logger.error({ orderId, orderErr }, 'Order not found for delivery');
      return { success: false, error: 'Order not found' };
    }

    // Already delivered check
    if (order.status === 'delivered') {
      logger.info({ orderId }, 'Order already delivered');
      return { success: true, alreadyDelivered: true };
    }

    if (order.status !== 'paid' && order.status !== 'delivery_failed') {
      logger.warn({ orderId, status: order.status }, 'Cannot deliver order that is not paid or delivery_failed');
      return { success: false, error: `Invalid order status: ${order.status}` };
    }

    const items = order.order_items || [];
    if (items.length === 0) {
      logger.error({ orderId }, 'No order items found for order');
      return { success: false, error: 'No items in order' };
    }

    const deliveryPayloads = [];

    // 2. Fetch encrypted inventory records and decrypt strictly in backend
    for (const item of items) {
      let encryptedPayload = null;
      let title = item.product_title;

      if (item.inventory_type === 'account') {
        const { data: acc } = await supabase
          .from('account_inventory')
          .select('encrypted_payload')
          .eq('id', item.inventory_item_id)
          .single();
        encryptedPayload = acc?.encrypted_payload;
      } else {
        const { data: code } = await supabase
          .from('code_inventory')
          .select('encrypted_payload')
          .eq('id', item.inventory_item_id)
          .single();
        encryptedPayload = code?.encrypted_payload;
      }

      if (!encryptedPayload) {
        logger.error({ itemId: item.inventory_item_id }, 'Inventory payload missing');
        continue;
      }

      try {
        const decrypted = decryptPayload(encryptedPayload);
        deliveryPayloads.push({
          title,
          type: item.inventory_type,
          data: decrypted
        });
      } catch (decErr) {
        logger.error({ decErr, itemId: item.inventory_item_id }, 'Failed to decrypt delivery payload');
      }
    }

    if (deliveryPayloads.length === 0) {
      await supabase
        .from('orders')
        .update({
          status: 'delivery_failed',
          delivery_notes: 'Failed to decrypt credentials',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      return { success: false, error: 'Failed to retrieve delivery credentials' };
    }

    // 3. Format delivery message safely
    let credentialsText = '';
    for (const p of deliveryPayloads) {
      if (p.type === 'account') {
        const d = p.data;
        credentialsText += `🎮 Product: ${escapeHtml(p.title)}\n`;
        credentialsText += `📧 Email/Login: ${escapeHtml(d.email || d.login)}\n`;
        credentialsText += `🔑 Password: ${escapeHtml(d.password)}\n`;
        if (d.email_password) credentialsText += `📬 Email Password: ${escapeHtml(d.email_password)}\n`;
        if (d.recovery_info) credentialsText += `🛡️ Recovery Info: ${escapeHtml(d.recovery_info)}\n`;
        credentialsText += '\n';
      } else {
        const d = p.data;
        credentialsText += `🎮 Product: ${escapeHtml(p.title)}\n`;
        credentialsText += `🔑 Code: ${escapeHtml(d.code || d)}\n\n`;
      }
    }

    const message = `🎉 <b>DELIVERY COMPLETED!</b>\n\n` +
      `Thank you for your purchase at <b>NIGHTMARE STORE</b>!\n` +
      `Order Ref: <code>${escapeHtml(order.order_number)}</code>\n\n` +
      `<b>YOUR PURCHASED CREDENTIALS / CODES:</b>\n` +
      `<pre>${credentialsText.trim()}</pre>\n\n` +
      `⚠️ <i>Please secure and test your credentials immediately. Do not share them with anyone.</i>`;

    // 4. Send to customer's private Telegram chat
    const sendResult = await NotificationService.sendTelegram(order.telegram_id, message);

    if (sendResult.success) {
      // 5. Update order to delivered
      await supabase
        .from('orders')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          delivery_chat_id: order.telegram_id,
          delivery_message_id: sendResult.messageId,
          delivery_notes: 'Successfully delivered to customer via Telegram bot',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      logger.info({ orderId, orderNumber: order.order_number }, 'Order successfully delivered to customer');

      // 6. Notify admin (without leaking credentials)
      await NotificationService.notifyAdmins(
        `📦 Order <code>${escapeHtml(order.order_number)}</code> has been successfully delivered to user ID: ${order.telegram_id}.`
      );

      return { success: true };
    } else {
      // 7. Record delivery failure safely
      await supabase
        .from('orders')
        .update({
          status: 'delivery_failed',
          delivery_notes: `Telegram delivery error: ${sendResult.error}`,
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      logger.error({ orderId, error: sendResult.error }, 'Order delivery to Telegram chat failed');

      await NotificationService.notifyAdmins(
        `⚠️ <b>DELIVERY FAILED</b> for order <code>${escapeHtml(order.order_number)}</code>.\nReason: ${escapeHtml(sendResult.error)}\nAdmin intervention or manual retry required.`
      );

      return { success: false, error: sendResult.error };
    }
  }

  /**
   * Retry delivery for an order that experienced a delivery failure
   */
  static async retryDelivery(orderId) {
    logger.info({ orderId }, 'Retrying delivery for order');
    return this.deliverOrder(orderId);
  }
}
