import crypto from 'crypto';
import { supabase } from '../config/supabase.js';
import { CutluyService } from './cutluy.service.js';
import { AbaPaywayService } from './aba-payway.service.js';
import { DeliveryService } from './delivery.service.js';
import { NotificationService } from './notification.service.js';
import { logger } from '../utils/logger.js';
import { escapeHtml } from '../utils/telegram.js';

export class WalletService {
  /**
   * Get user wallet balance
   */
  static async getBalance(telegramId) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('id, balance')
      .eq('telegram_id', Number(telegramId))
      .maybeSingle();

    return Number(profile?.balance || 0.00);
  }

  /**
   * Create Bakong KHQR Top-up Session for a user
   * @param {object} params { telegramId, amount }
   */
  static async createTopupSession({ telegramId, amount }) {
    const numAmount = parseFloat(Number(amount).toFixed(2));
    if (isNaN(numAmount) || numAmount < 0.10) {
      throw new Error('Minimum top-up amount is $0.10 USD');
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('id')
      .eq('telegram_id', Number(telegramId))
      .maybeSingle();

    const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const randStr = crypto.randomBytes(3).toString('hex').toUpperCase();
    const topupRef = `TOPUP-${dateStr}-${randStr}`;
    let qrString = null;
    let qrSvgUrl = null;
    let checkoutUrl = null;
    let paymentId = null;

    let qrImageUrl = null;

    if (AbaPaywayService.isConfigured()) {
      try {
        const abaSession = await AbaPaywayService.createPaymentSession({
          orderRef: topupRef,
          amount: numAmount,
          currency: 'USD',
          items: [{ name: `Wallet Top-up ($${numAmount})`, quantity: 1, price: numAmount }]
        });
        if (abaSession.success) {
          checkoutUrl = abaSession.checkoutUrl;
          qrString = abaSession.qrString;
          qrImageUrl = abaSession.qrImageUrl || (qrString ? `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(qrString)}` : null);
          qrSvgUrl = qrImageUrl;
          paymentId = `aba_${topupRef}`;
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not create ABA PayWay session, falling back to CutLuy ABA KHQR');
      }
    }

    if (!qrString) {
      const cutluyResult = await CutluyService.createPayment({
        amount: numAmount,
        referenceId: topupRef,
        currency: 'USD'
      });
      checkoutUrl = cutluyResult?.checkoutUrl;
      qrString = cutluyResult?.qrString || `bakong://${topupRef}?amount=${numAmount}&currency=USD&merchant=NIGHTMARE_STORE&bank=ABA`;
      qrImageUrl = cutluyResult?.qrImageUrl || cutluyResult?.qrPngUrl || `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(qrString)}`;
      qrSvgUrl = cutluyResult?.qrSvgUrl || qrImageUrl;
      paymentId = cutluyResult?.paymentId || `cl_${topupRef}`;
    }

    // 2. Insert into balance_transactions
    await supabase.from('balance_transactions').insert([{
      profile_id: profile?.id || null,
      telegram_id: Number(telegramId),
      amount: numAmount,
      type: 'topup',
      reference_id: topupRef,
      payment_id: paymentId,
      status: 'pending',
      checkout_url: checkoutUrl || null,
      qr_string: qrString || null,
      notes: `ABA KHQR Top-up of $${numAmount} USD`
    }]);

    return {
      topupRef,
      amount: numAmount,
      checkoutUrl,
      qrString,
      qrSvgUrl,
      qrImageUrl,
      paymentMethod: 'ABA KHQR'
    };
  }

  /**
   * Finalize a successful top-up after Bakong KHQR confirmation
   */
  static async finalizeTopup(topupRef, paidAmount) {
    logger.info({ topupRef, paidAmount }, 'Finalizing customer wallet top-up');

    // 1. Look up transaction
    const { data: tx } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('reference_id', topupRef)
      .maybeSingle();

    if (!tx) {
      logger.error({ topupRef }, 'Topup transaction record not found');
      return { success: false, error: 'Top-up transaction not found' };
    }

    if (tx.status === 'completed') {
      logger.info({ topupRef }, 'Top-up already completed (idempotent ignore)');
      return { success: true, alreadyCompleted: true };
    }

    const creditAmount = paidAmount ? Number(paidAmount) : Number(tx.amount);

    // 2. Add balance atomically via RPC
    const { data: rpcData, error: rpcErr } = await supabase.rpc('add_profile_balance', {
      p_telegram_id: tx.telegram_id,
      p_amount: creditAmount,
      p_ref: topupRef,
      p_type: 'topup'
    });

    if (rpcErr) {
      logger.error({ rpcErr, topupRef }, 'Error running add_profile_balance RPC');
      return { success: false, error: rpcErr.message };
    }

    const newBalance = rpcData?.new_balance ?? (await this.getBalance(tx.telegram_id));

    // 3. Send Telegram celebratory notification to customer
    const customerMsg = `🎉 <b>TOP-UP SUCCESSFUL!</b>\n\n` +
      `Amount Credited: <b>+$${creditAmount.toFixed(2)} USD</b>\n` +
      `Current Wallet Balance: <b>$${Number(newBalance).toFixed(2)} USD</b>\n\n` +
      `Ref: <code>${escapeHtml(topupRef)}</code>\n\n` +
      `💡 <i>You can now purchase any Rockstar code or account instantly with 1-click checkout!</i>`;

    await NotificationService.sendTelegram(tx.telegram_id, customerMsg);

    // 4. Notify admin
    await NotificationService.notifyAdmins(
      `💰 <b>WALLET TOP-UP:</b> User <code>${tx.telegram_id}</code> topped up <b>+$${creditAmount.toFixed(2)} USD</b> via Bakong KHQR. Ref: <code>${topupRef}</code>`
    );

    return {
      success: true,
      newBalance,
      credited: creditAmount
    };
  }

  /**
   * Instant 1-click purchase using in-app wallet balance
   */
  static async payWithBalance({ telegramId, orderId }) {
    const { data: order } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .eq('id', orderId)
      .single();

    if (!order) throw new Error('Order not found');
    if (order.status !== 'pending') throw new Error(`Order is already ${order.status}`);

    const amount = Number(order.total_amount);

    // 1. Atomically deduct balance
    const { data: deductResult, error: deductErr } = await supabase.rpc('deduct_profile_balance', {
      p_telegram_id: Number(telegramId),
      p_amount: amount,
      p_ref: order.order_number
    });

    if (deductErr || !deductResult?.success) {
      throw new Error(deductResult?.error || deductErr?.message || 'Insufficient wallet balance');
    }

    // 2. Finalize order payment
    const { data: payment } = await supabase
      .from('payments')
      .select('id')
      .eq('order_id', orderId)
      .maybeSingle();

    await supabase.rpc('finalize_order_payment', {
      p_order_id: orderId,
      p_payment_id: payment?.id || null,
      p_transaction_id: `WALLET-${order.order_number}`,
      p_payment_method: 'In-app Wallet Balance'
    });

    // 3. Deliver purchased items to Telegram chat immediately
    const deliveryResult = await DeliveryService.deliverOrder(orderId);

    return {
      success: true,
      order,
      newBalance: deductResult.new_balance,
      deliveryResult
    };
  }

  /**
   * Admin manual balance adjustment
   */
  static async adminAdjustBalance({ telegramId, amount, reason = 'Admin Adjustment', adminId = null }) {
    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount === 0) throw new Error('Invalid adjustment amount');

    const ref = `ADJ-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

    let result = null;
    if (numAmount > 0) {
      const { data } = await supabase.rpc('add_profile_balance', {
        p_telegram_id: Number(telegramId),
        p_amount: numAmount,
        p_ref: ref,
        p_type: 'admin_adjustment'
      });
      result = data;
    } else {
      const { data } = await supabase.rpc('deduct_profile_balance', {
        p_telegram_id: Number(telegramId),
        p_amount: Math.abs(numAmount),
        p_ref: ref
      });
      result = data;
    }

    // Notify customer
    const sign = numAmount > 0 ? '+' : '-';
    await NotificationService.sendTelegram(
      telegramId,
      `💼 <b>WALLET BALANCE ADJUSTMENT</b>\n\nAdjustment: <b>${sign}$${Math.abs(numAmount).toFixed(2)} USD</b>\nNote: ${escapeHtml(reason)}\nNew Balance: <b>$${Number(result?.new_balance || 0).toFixed(2)} USD</b>`
    );

    return result;
  }
}
