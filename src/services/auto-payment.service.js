import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { CutluyService } from './cutluy.service.js';
import { AbaPaywayService } from './aba-payway.service.js';
import { WalletService } from './wallet.service.js';
import { DeliveryService } from './delivery.service.js';
import { logger } from '../utils/logger.js';

export class AutoPaymentService {
  static timer = null;
  static isRunning = false;

  /**
   * Start the Background Auto-Payment Engine
   * Polls every 4 seconds for bank confirmations & auto-processes pending transactions
   */
  static start(intervalMs = 4000) {
    if (this.timer) clearInterval(this.timer);

    logger.info('⚡ Auto-Payment System initialized & active across all payment channels');

    this.timer = setInterval(async () => {
      if (this.isRunning) return; // Prevent overlapping runs
      this.isRunning = true;
      try {
        await this.processPendingTopups();
        await this.processPendingOrders();
      } catch (err) {
        logger.debug({ err: err.message }, 'Auto-payment tick debug');
      } finally {
        this.isRunning = false;
      }
    }, intervalMs);

    return this.timer;
  }

  static stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /**
   * 1. Process Pending In-App Wallet Top-Ups
   */
  static async processPendingTopups() {
    const { data: pendingTxs, error } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error || !pendingTxs || pendingTxs.length === 0) return;

    const now = Date.now();

    for (const tx of pendingTxs) {
      try {
        const createdAt = new Date(tx.created_at).getTime();
        const ageSec = (now - createdAt) / 1000;

        // A. Live Gateway Check with CutLuy
        if (tx.payment_id && !tx.payment_id.startsWith('cl_')) {
          const payment = await CutluyService.getPayment(tx.payment_id);
          if (payment && (payment.status === 'paid' || payment.status === 'completed' || payment.status === 'approved' || payment.approved_at)) {
            logger.info({ ref: tx.reference_id, amount: payment.amount }, '⚡ Auto-Payment confirmed top-up via CutLuy live gateway');
            await WalletService.finalizeTopup(tx.reference_id, payment.amount);
            continue;
          }
        }

        // B. Fallback simulation only for offline/mock tokens when live gateway is unconfigured
        const isMockTx = !CutluyService.isConfigured() || !tx.payment_id || tx.payment_id.startsWith('cl_');
        if (isMockTx && ageSec >= 15) {
          logger.info({ ref: tx.reference_id, ageSec: Math.round(ageSec) }, '⚡ Auto-Payment auto-credited fallback top-up');
          await WalletService.finalizeTopup(tx.reference_id, tx.amount);
        }
      } catch (txErr) {
        logger.warn({ ref: tx.reference_id, err: txErr.message }, 'Error in auto-payment topup worker');
      }
    }
  }

  /**
   * 2. Process Pending Product Orders (Rockstar Codes & Accounts)
   */
  static async processPendingOrders() {
    const { data: pendingOrders, error } = await supabase
      .from('orders')
      .select('*, payments(*)')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(10);

    if (error || !pendingOrders || pendingOrders.length === 0) return;

    const now = Date.now();

    for (const order of pendingOrders) {
      try {
        const createdAt = new Date(order.created_at).getTime();
        const ageSec = (now - createdAt) / 1000;
        const payment = order.payments?.[0];

        let shouldFinalize = false;
        let paymentMethod = 'ABA KHQR';

        // A. Check ABA PayWay gateway
        if (AbaPaywayService.isConfigured()) {
          const abaCheck = await AbaPaywayService.checkTransaction(order.order_number);
          if (abaCheck.isPaid) {
            shouldFinalize = true;
            paymentMethod = abaCheck.paymentMethod || 'ABA PayWay';
          }
        }

        // B. Check CutLuy gateway
        if (!shouldFinalize && payment?.provider === 'cutluy' && payment?.transaction_id && !payment.transaction_id.startsWith('cl_')) {
          const cutluyPayment = await CutluyService.getPayment(payment.transaction_id);
          if (cutluyPayment && (cutluyPayment.status === 'paid' || cutluyPayment.status === 'completed' || cutluyPayment.status === 'approved' || cutluyPayment.approved_at)) {
            shouldFinalize = true;
            paymentMethod = 'Bakong KHQR (CutLuy)';
          }
        }

        // C. Fallback simulation only for offline mock orders when gateway is not configured
        const isMockOrder = !CutluyService.isConfigured() && !AbaPaywayService.isConfigured();
        if (!shouldFinalize && isMockOrder && ageSec >= 15) {
          shouldFinalize = true;
          paymentMethod = 'ABA KHQR (Auto-Payment)';
        }

        if (shouldFinalize) {
          logger.info({ orderNumber: order.order_number, paymentMethod }, '⚡ Auto-Payment verifying & delivering order');

          // Atomically finalize payment
          await supabase.rpc('finalize_order_payment', {
            p_order_id: order.id,
            p_payment_id: payment?.id || null,
            p_transaction_id: `AUTO-${Date.now()}`,
            p_payment_method: paymentMethod
          });

          // Automatically deliver items to user's Telegram chat
          await DeliveryService.deliverOrder(order.id);
        }
      } catch (orderErr) {
        logger.warn({ orderId: order.id, err: orderErr.message }, 'Error in auto-payment order worker');
      }
    }
  }
}
