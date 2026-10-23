import { supabase } from '../config/supabase.js';
import { AbaPaywayService } from './aba-payway.service.js';
import { CutluyService } from './cutluy.service.js';
import { DeliveryService } from './delivery.service.js';
import { WalletService } from './wallet.service.js';
import { logger } from '../utils/logger.js';

export class PaymentService {
  /**
   * Initialize payment checkout for an existing order (CutLuy Bakong KHQR / ABA PayWay)
   */
  static async initiatePayment(orderId) {
    const { data: order, error } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderId)
      .single();

    if (error || !order) {
      throw new Error('Order not found');
    }

    if (order.status !== 'pending') {
      throw new Error(`Order is in '${order.status}' status and cannot be paid`);
    }

    // 1. Try CutLuy Bakong KHQR integration first
    if (CutluyService.isConfigured()) {
      const cutluyResult = await CutluyService.createPayment({
        amount: order.total_amount,
        referenceId: order.order_number,
        currency: order.currency || 'USD'
      });

      if (cutluyResult.success) {
        await supabase
          .from('payments')
          .update({
            provider: 'cutluy',
            transaction_id: cutluyResult.paymentId,
            checkout_url: cutluyResult.checkoutUrl,
            qr_string: cutluyResult.qrString,
            qr_image_url: cutluyResult.qrImageUrl || cutluyResult.qrPngUrl || cutluyResult.qrSvgUrl,
            raw_response: cutluyResult.raw || null,
            updated_at: new Date().toISOString()
          })
          .eq('order_id', orderId);

        return {
          order,
          paymentResult: {
            success: true,
            provider: 'cutluy',
            checkoutUrl: cutluyResult.checkoutUrl,
            qrString: cutluyResult.qrString,
            qrImageUrl: cutluyResult.qrImageUrl || cutluyResult.qrPngUrl || cutluyResult.qrSvgUrl
          }
        };
      }
    }

    // 2. Fallback to ABA PayWay adapter
    const items = (order.order_items || []).map(i => ({
      name: i.product_title,
      quantity: 1,
      price: Number(i.price).toFixed(2)
    }));

    const result = await AbaPaywayService.createPaymentSession({
      orderRef: order.order_number,
      amount: order.total_amount,
      currency: order.currency || 'USD',
      items
    });

    if (result.success) {
      await supabase
        .from('payments')
        .update({
          provider: 'aba_payway',
          checkout_url: result.checkoutUrl,
          qr_string: result.qrString,
          qr_image_url: result.qrImageUrl,
          raw_response: result.raw,
          updated_at: new Date().toISOString()
        })
        .eq('order_id', orderId);
    }

    return {
      order,
      paymentResult: result
    };
  }

  /**
   * Handle CutLuy Webhook Event (payment.completed)
   * @param {object} event 
   */
  static async handleCutluyWebhook(event) {
    logger.info({ eventId: event.id, type: event.type }, 'Handling CutLuy webhook event');

    if (event.type !== 'payment.completed') {
      return { success: true, ignored: true, reason: 'Event type is not payment.completed' };
    }

    const paymentData = event.data?.payment;
    const orderRef = paymentData?.reference_id;

    if (!orderRef) {
      return { success: false, error: 'Missing reference_id in CutLuy event payload' };
    }

    // Check if this payment is a customer wallet top-up
    if (orderRef.startsWith('TOPUP-')) {
      logger.info({ orderRef, amount: paymentData?.amount }, 'Processing CutLuy payment for wallet top-up');
      return await WalletService.finalizeTopup(orderRef, paymentData?.amount);
    }

    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount')
      .eq('order_number', orderRef)
      .single();

    if (!order) {
      logger.error({ orderRef }, 'Order not found for CutLuy reference_id');
      return { success: false, error: 'Order not found' };
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('id, status')
      .eq('order_id', order.id)
      .single();

    // Idempotently finalize payment via PostgreSQL RPC
    const { data: finalizeData, error: finalizeErr } = await supabase.rpc('finalize_order_payment', {
      p_order_id: order.id,
      p_payment_id: payment?.id || null,
      p_transaction_id: paymentData.id || `CL-${Date.now()}`,
      p_payment_method: 'Bakong KHQR (CutLuy)'
    });

    if (finalizeErr) {
      logger.error({ finalizeErr }, 'Error finalizing CutLuy payment via RPC');
      return { success: false, error: finalizeErr.message };
    }

    // Trigger automated digital delivery
    const deliveryResult = await DeliveryService.deliverOrder(order.id);

    return {
      success: true,
      orderId: order.id,
      deliveryResult
    };
  }

  /**
   * Process and verify payment callback or webhook idempotently
   * @param {object} payload Received callback data
   * @param {string} idempotencyKey Unique key (e.g. from callback or hash)
   */
  static async handlePaymentWebhook(payload, idempotencyKey) {
    const orderRef = payload.tran_id || payload.order_ref || payload.merchant_order_ref;
    logger.info({ orderRef, idempotencyKey }, 'Processing payment callback event');

    if (!orderRef) {
      return { success: false, error: 'Missing order reference in callback' };
    }

    // 1. Check idempotency in payment_events table
    if (idempotencyKey) {
      const { data: existingEvent } = await supabase
        .from('payment_events')
        .select('id, is_valid')
        .eq('idempotency_key', idempotencyKey)
        .maybeSingle();

      if (existingEvent) {
        logger.info({ idempotencyKey }, 'Payment event already handled (idempotent ignore)');
        return { success: true, alreadyHandled: true };
      }
    }

    // 2. Fetch order & payment records
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status, total_amount, currency')
      .eq('order_number', orderRef)
      .single();

    if (!order) {
      logger.error({ orderRef }, 'Order matching callback reference not found');
      return { success: false, error: 'Order not found' };
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('id, status')
      .eq('order_id', order.id)
      .single();

    // 3. Strictly verify status directly with ABA PayWay check-transaction
    const checkResult = await AbaPaywayService.checkTransaction(orderRef);

    // Record the webhook event
    await supabase.from('payment_events').insert([{
      payment_id: payment?.id || null,
      event_type: 'callback_verification',
      idempotency_key: idempotencyKey || null,
      payload,
      is_valid: checkResult.isPaid,
      error_message: checkResult.isPaid ? null : (checkResult.error || 'Payment not verified by gateway')
    }]);

    if (!checkResult.isPaid) {
      logger.warn({ orderRef, checkResult }, 'Payment verification failed on gateway');
      return { success: false, error: 'Transaction not confirmed as paid by ABA PayWay' };
    }

    // Validate amount matches expected order amount
    if (checkResult.amount && Number(checkResult.amount) < Number(order.total_amount)) {
      logger.error({ expected: order.total_amount, received: checkResult.amount }, 'Payment amount mismatch!');
      return { success: false, error: 'Payment amount mismatch' };
    }

    // 4. Atomically finalize payment and order via PostgreSQL RPC
    const { data: finalizeData, error: finalizeErr } = await supabase.rpc('finalize_order_payment', {
      p_order_id: order.id,
      p_payment_id: payment.id,
      p_transaction_id: checkResult.transactionId || 'ABA-' + Date.now(),
      p_payment_method: checkResult.paymentMethod || 'ABA PayWay'
    });

    if (finalizeErr) {
      logger.error({ finalizeErr, orderId: order.id }, 'Error during finalize_order_payment RPC');
      return { success: false, error: finalizeErr.message };
    }

    logger.info({ orderId: order.id, finalizeData }, 'Order payment finalized');

    // 5. Trigger automated delivery
    const deliveryResult = await DeliveryService.deliverOrder(order.id);

    return {
      success: true,
      orderId: order.id,
      deliveryResult
    };
  }

  /**
   * Manually verify and sync transaction status
   */
  static async verifyAndSyncOrder(orderId) {
    const { data: order } = await supabase
      .from('orders')
      .select('id, order_number, status')
      .eq('id', orderId)
      .single();

    if (!order) {
      throw new Error('Order not found');
    }

    if (order.status === 'paid' || order.status === 'delivered') {
      return { status: order.status, isPaid: true };
    }

    const { data: payment } = await supabase
      .from('payments')
      .select('*')
      .eq('order_id', orderId)
      .maybeSingle();

    // Check CutLuy if provider is cutluy
    if (payment?.provider === 'cutluy' && payment?.transaction_id) {
      const cutluyPayment = await CutluyService.getPayment(payment.transaction_id);
      if (cutluyPayment && cutluyPayment.status === 'paid') {
        await this.handleCutluyWebhook({
          type: 'payment.completed',
          data: { payment: cutluyPayment }
        });
        return { status: 'paid', isPaid: true };
      }
    }

    // Fallback to ABA PayWay sync
    const checkResult = await AbaPaywayService.checkTransaction(order.order_number);
    if (checkResult.isPaid) {
      await this.handlePaymentWebhook({ tran_id: order.order_number }, `manual-sync-${order.order_number}-${Date.now()}`);
      return { status: 'paid', isPaid: true };
    }

    // Auto-payment verification in development mode
    if (env.NODE_ENV === 'development') {
      logger.info({ orderId }, 'Auto-Payment verifying pending order in development mode');
      await supabase.rpc('finalize_order_payment', {
        p_order_id: order.id,
        p_payment_id: payment?.id || null,
        p_transaction_id: `AUTO-${Date.now()}`,
        p_payment_method: 'ABA KHQR (Auto-Payment)'
      });
      await DeliveryService.deliverOrder(order.id);
      return { status: 'paid', isPaid: true };
    }

    return { status: order.status, isPaid: false };
  }
}
