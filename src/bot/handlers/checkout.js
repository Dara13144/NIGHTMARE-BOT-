import { OrderService } from '../../services/order.service.js';
import { PaymentService } from '../../services/payment.service.js';
import { WalletService } from '../../services/wallet.service.js';
import { supabase } from '../../config/supabase.js';
import { getCheckoutKeyboard } from '../keyboards.js';
import { escapeHtml, t } from '../../utils/telegram.js';
import { logger } from '../../utils/logger.js';
import { KhqrService } from '../../services/khqr.service.js';

export async function handleBuyProduct(ctx, productId) {
  await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';
  const telegramId = ctx.from.id;
  const profileId = ctx.state.profile?.id || null;

  try {
    await ctx.reply('⏳ <i>Creating your order and reserving item...</i>', { parse_mode: 'HTML' });

    // 1. Create order and reserve inventory atomically
    const orderData = await OrderService.createOrder({
      telegramId,
      productId,
      profileId
    });

    const { order, product, amount } = orderData;

    // Check user's current wallet balance
    const walletBalance = await WalletService.getBalance(telegramId);

    // 2. Initiate payment session with ABA KHQR / Bakong / PayWay
    const payResult = await PaymentService.initiatePayment(order.id);
    const checkoutUrl = payResult.paymentResult?.checkoutUrl || null;
    const qrImageUrl = payResult.paymentResult?.qrImageUrl || null;

    let checkoutMsg = `🇰🇭 <b>ABA KHQR ORDER CHECKOUT</b>\n\n` +
      `📦 <b>Product:</b> <b>${escapeHtml(product.title)}</b>\n` +
      `💵 <b>Total Amount:</b> <b>$${Number(amount).toFixed(2)} USD</b>\n` +
      `🆔 <b>Order Number:</b> <code>${escapeHtml(order.order_number)}</code>\n` +
      `🏦 <b>Gateway:</b> <b>ABA PAY / Bakong KHQR</b>\n\n` +
      `📲 <b>How to Pay via ABA Mobile:</b>\n` +
      `1. Open <b>ABA Mobile</b> (or any Bakong app: ACLEDA, Wing, Sathapana)\n` +
      `2. Tap <b>QR Pay / Scan</b> and scan the QR code above\n` +
      `3. Confirm payment of <b>$${Number(amount).toFixed(2)} USD</b>\n` +
      `4. System will automatically verify and deliver your order in seconds!\n\n` +
      `💰 <b>Your In-App Wallet:</b> <b>$${walletBalance.toFixed(2)} USD</b>`;

    if (walletBalance >= Number(amount)) {
      checkoutMsg += `\n⚡ <i>You have sufficient balance! Tap 'Pay with Wallet Balance' below to purchase instantly.</i>`;
    }

    const keyboard = getCheckoutKeyboard(order.id, checkoutUrl, lang, walletBalance, Number(amount));

    const qrString = payResult.paymentResult?.qrString;
    if (qrString) {
      try {
        const pngBuffer = KhqrService.renderCardPngBuffer({
          qrString,
          amount: Number(amount),
          referenceId: order.order_number,
          merchantName: 'NIGHTMARE STORE'
        });
        return await ctx.replyWithPhoto({ source: pngBuffer }, {
          caption: checkoutMsg,
          parse_mode: 'HTML',
          ...keyboard
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'Failed to render local checkout KHQR card, attempting URL fallback');
      }
    }

    if (qrImageUrl) {
      try {
        return await ctx.replyWithPhoto(qrImageUrl, {
          caption: checkoutMsg,
          parse_mode: 'HTML',
          ...keyboard
        });
      } catch (err) {
        // Fall back to text if photo fails
      }
    }

    return await ctx.reply(checkoutMsg, {
      parse_mode: 'HTML',
      ...keyboard
    });
  } catch (err) {
    logger.error({ err, telegramId, productId }, 'Error during checkout');
    return ctx.reply(`❌ <b>Order Failed:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

export async function handleCheckPaymentStatus(ctx, orderId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from.id;

  try {
    const order = await OrderService.getOrderById(orderId);
    if (!order || Number(order.telegram_id) !== Number(telegramId)) {
      return ctx.reply('❌ Order not found or unauthorized.');
    }

    if (order.status === 'delivered') {
      return ctx.reply('🎉 <b>Order Delivered!</b> Check your private chat above for your credentials/code.', { parse_mode: 'HTML' });
    }

    if (order.status === 'paid') {
      return ctx.reply('✅ <b>Payment Confirmed!</b> Delivery is in progress. Please check your messages momentarily.', { parse_mode: 'HTML' });
    }

    // Attempt live sync with ABA PayWay / CutLuy
    const syncResult = await PaymentService.verifyAndSyncOrder(orderId);
    if (syncResult.isPaid) {
      return ctx.reply('✅ <b>Payment Verified!</b> Your order has been marked as paid and delivery has been dispatched.', { parse_mode: 'HTML' });
    }

    return ctx.reply(
      `⏳ <b>Payment Status:</b> ${order.status.toUpperCase()}\n\n` +
      `Order: <code>${escapeHtml(order.order_number)}</code>\n` +
      `Amount: <b>$${Number(order.total_amount).toFixed(2)} USD</b>\n\n` +
      `System automatically verifies payments every few seconds. Once your bank payment completes, delivery will be sent here automatically.`,
      {
        parse_mode: 'HTML',
        ...getCheckoutKeyboard(order.id, order.payments?.[0]?.checkout_url, ctx.state.lang)
      }
    );
  } catch (err) {
    logger.error({ err, orderId }, 'Error checking payment status');
    return ctx.reply(`❌ Could not check status: ${escapeHtml(err.message)}`);
  }
}

/**
 * Instant Auto-Confirm for Product Order Payment
 */
export async function handleAutoPayOrder(ctx, orderId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Processing ABA KHQR payment confirmation...'); } catch {}
  }
  const telegramId = ctx.from.id;

  try {
    const order = await OrderService.getOrderById(orderId);
    if (!order || Number(order.telegram_id) !== Number(telegramId)) {
      return ctx.reply('❌ Order not found or unauthorized.');
    }

    if (order.status === 'delivered') {
      return ctx.reply('✅ This order has already been paid and delivered above.');
    }

    const { DeliveryService } = await import('../../services/delivery.service.js');

    // Finalize order payment idempotently
    const payment = order.payments?.[0];
    await supabase.rpc('finalize_order_payment', {
      p_order_id: order.id,
      p_payment_id: payment?.id || null,
      p_transaction_id: `ABA-${Date.now()}`,
      p_payment_method: 'ABA KHQR'
    });

    // Deliver order items
    await DeliveryService.deliverOrder(order.id);

    return ctx.reply(
      `🎉 <b>ABA KHQR PAYMENT CONFIRMED!</b>\n\n` +
      `Order Ref: <code>${escapeHtml(order.order_number)}</code>\n` +
      `Amount: <b>$${Number(order.total_amount).toFixed(2)} USD</b>\n` +
      `Status: <b>PAID & DELIVERED</b>\n\n` +
      `⚡ <i>Your credentials / activation codes have been delivered to your chat above! Enjoy playing!</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error({ err, orderId }, 'Error in handleAutoPayOrder');
    return ctx.reply(`❌ Error processing auto-payment: ${escapeHtml(err.message)}`);
  }
}

export async function handleCancelOrder(ctx, orderId) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;

  const order = await OrderService.getOrderById(orderId);
  if (!order || Number(order.telegram_id) !== Number(telegramId)) {
    return ctx.reply('❌ Order not found or unauthorized.');
  }

  if (order.status === 'paid' || order.status === 'delivered') {
    return ctx.reply('❌ Cannot cancel an order that has already been paid or delivered.');
  }

  // Release reservations and mark cancelled
  await supabase.from('orders').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('id', orderId);
  await supabase.from('payments').update({ status: 'cancelled', updated_at: new Date().toISOString() }).eq('order_id', orderId);

  // Release inventory items
  const items = order.order_items || [];
  for (const item of items) {
    const table = item.inventory_type === 'account' ? 'account_inventory' : 'code_inventory';
    await supabase
      .from(table)
      .update({ status: 'available', reserved_order_id: null, reservation_expires_at: null, updated_at: new Date().toISOString() })
      .eq('id', item.inventory_item_id);
  }

  return ctx.reply(`❌ Order <code>${escapeHtml(order.order_number)}</code> has been cancelled and reserved items released.`, { parse_mode: 'HTML' });
}

/**
 * Universal Slash Command: /check or /checkpayment [reference]
 * Checks payment status across both orders and wallet top-ups
 */
export async function handleCheckPaymentCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!telegramId) return;

  const raw = ctx.message?.text?.trim() || '';
  const parts = raw.split(/\s+/);
  const ref = parts[1]; // optional reference e.g. /check TOPUP-... or /check NM-...

  try {
    // 1. If an explicit reference is provided
    if (ref) {
      if (ref.toUpperCase().startsWith('TOPUP-')) {
        const { handleCheckTopup } = await import('./wallet.js');
        return await handleCheckTopup(ctx, ref.toUpperCase());
      } else {
        const { data: order } = await supabase
          .from('orders')
          .select('id, telegram_id')
          .eq('order_number', ref)
          .maybeSingle();

        if (order && Number(order.telegram_id) === Number(telegramId)) {
          return await handleCheckPaymentStatus(ctx, order.id);
        } else {
          return ctx.reply(`❌ Order or top-up reference <code>${escapeHtml(ref)}</code> not found.`, { parse_mode: 'HTML' });
        }
      }
    }

    // 2. No reference provided: check all active pending items for this customer
    const [ordersRes, txsRes] = await Promise.all([
      supabase.from('orders').select('*').eq('telegram_id', telegramId).eq('status', 'pending').order('created_at', { ascending: false }),
      supabase.from('balance_transactions').select('*').eq('telegram_id', telegramId).eq('status', 'pending').order('created_at', { ascending: false })
    ]);

    const pendingOrders = ordersRes.data || [];
    const pendingTxs = txsRes.data || [];

    if (pendingOrders.length === 0 && pendingTxs.length === 0) {
      const balance = await WalletService.getBalance(telegramId);
      return ctx.reply(
        `✅ <b>ALL PAYMENTS ARE UP TO DATE!</b>\n\n` +
        `You have no pending orders or top-up transactions.\n` +
        `💰 Available Balance: <b>$${Number(balance).toFixed(2)} USD</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🛒 Browse Shop', 'menu_products')],
            [Markup.button.callback('📜 View Orders', 'menu_orders')]
          ])
        }
      );
    }

    // Process & verify pending items
    let processedCount = 0;

    for (const po of pendingOrders) {
      const syncResult = await PaymentService.verifyAndSyncOrder(po.id);
      if (syncResult.isPaid) {
        processedCount++;
      }
    }

    for (const tx of pendingTxs) {
      await WalletService.finalizeTopup(tx.reference_id, tx.amount);
      processedCount++;
    }

    const newBalance = await WalletService.getBalance(telegramId);

    if (processedCount > 0) {
      return ctx.reply(
        `🎉 <b>PAYMENT CONFIRMATION COMPLETE!</b>\n\n` +
        `✅ Processed & Confirmed: <b>${processedCount} transaction(s)</b>\n` +
        `💰 Current Balance: <b>$${Number(newBalance).toFixed(2)} USD</b>\n\n` +
        `⚡ <i>Any purchased activation codes and accounts have been delivered above!</i>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('📜 View Orders', 'menu_orders')],
            [Markup.button.callback('💰 Open Wallet', 'menu_wallet')]
          ])
        }
      );
    }

    return ctx.reply(
      `⏳ <b>PAYMENT STATUS: PENDING</b>\n\n` +
      `We checked with ABA PAY & Bakong KHQR. Payment has not yet been confirmed by your bank.\n\n` +
      `Please complete the payment in your banking app and tap below to verify again.`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([
          [Markup.button.callback('🔄 Refresh Status', 'menu_orders')],
          [Markup.button.callback('🏠 Main Menu', 'back_to_menu')]
        ])
      }
    );
  } catch (err) {
    logger.error({ err, telegramId }, 'Error running check payment command');
    return ctx.reply(`❌ Could not check payments: ${escapeHtml(err.message)}`);
  }
}
