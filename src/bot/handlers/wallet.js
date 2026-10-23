import { Markup } from 'telegraf';
import { env } from '../../config/env.js';
import { WalletService } from '../../services/wallet.service.js';
import { supabase } from '../../config/supabase.js';
import { getWalletKeyboard, getTopupCheckoutKeyboard } from '../keyboards.js';
import { escapeHtml } from '../../utils/telegram.js';
import { logger } from '../../utils/logger.js';
import { KhqrService } from '../../services/khqr.service.js';

export const userWalletState = new Map();

/**
 * Display User Wallet & Balance Menu
 */
export async function handleWalletMenu(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  const telegramId = ctx.from.id;
  const firstName = ctx.from.first_name || 'Customer';

  // Support slash command with amount: /topup 5, /wallet 10, /custom 25
  const rawText = ctx.message?.text?.trim() || '';
  const amountMatch = rawText.match(/^\/(?:wallet|topup|balance|custom|custombalance|add)\s+(\d+(?:\.\d{1,2})?)/i);
  if (amountMatch) {
    return handleTopupSelect(ctx, amountMatch[1]);
  }

  if (/^\/(?:custom|custombalance|customtopup)$/i.test(rawText)) {
    return handleTopupCustomPrompt(ctx);
  }

  try {
    const balance = await WalletService.getBalance(telegramId);

    const message = `💳 <b>NIGHTMARE STORE WALLET (ABA KHQR)</b>\n\n` +
      `👤 <b>Customer:</b> ${escapeHtml(firstName)}\n` +
      `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>\n` +
      `💰 <b>Available Balance:</b> <b>$${Number(balance).toFixed(2)} USD</b>\n\n` +
      `⚡ <b>Wallet Benefits:</b>\n` +
      `• 1-Click Instant Purchases for all Rockstar games & accounts!\n` +
      `• No waiting for gateway redirection.\n` +
      `• Instant automated credentials delivery.\n` +
      `• Top up easily via <b>ABA KHQR / Bakong</b> (ABA Mobile, ACLEDA, Wing, Sathapana)\n\n` +
      `👇 <i>Choose an amount below to generate your ABA KHQR:</i>`;

    const keyboard = getWalletKeyboard(balance);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(message, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(message, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err, telegramId }, 'Error displaying wallet menu');
    return ctx.reply(`❌ <b>Could not load wallet:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

/**
 * Handle Top-up Preset Selection ($1, $2, $5, $10, $20, $50)
 */
export async function handleTopupSelect(ctx, amount) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  const telegramId = ctx.from.id;
  const numAmount = parseFloat(amount);

  try {
    await ctx.reply(`⏳ <i>Generating ABA KHQR for $${numAmount.toFixed(2)} USD top-up...</i>`, { parse_mode: 'HTML' });

    const session = await WalletService.createTopupSession({
      telegramId,
      amount: numAmount
    });

    const text = `🇰🇭 <b>ABA KHQR & BAKONG WALLET TOP-UP</b>\n\n` +
      `💵 <b>Amount:</b> <b>$${session.amount.toFixed(2)} USD</b>\n` +
      `🆔 <b>Top-up Ref:</b> <code>${escapeHtml(session.topupRef)}</code>\n` +
      `🏦 <b>Gateway:</b> <b>ABA PAY / Bakong KHQR</b>\n\n` +
      `📲 <b>How to Pay via ABA Mobile:</b>\n` +
      `1. Open <b>ABA Mobile</b> (or any Bakong app: ACLEDA, Wing, Canadia, Sathapana)\n` +
      `2. Tap <b>QR Pay / Scan</b> and scan the QR code above\n` +
      `3. Confirm the payment of <b>$${session.amount.toFixed(2)} USD</b>\n` +
      `4. System will automatically verify and credit your balance in seconds!\n\n` +
      `⚡ <i>Auto-Payment & Instant Verification Active (15 min window)</i>`;

    const keyboard = getTopupCheckoutKeyboard(session.topupRef, session.checkoutUrl);
    
    // Generate authentic, high-resolution ABA KHQR branded card image
    if (session.qrString) {
      try {
        const pngBuffer = KhqrService.renderCardPngBuffer({
          qrString: session.qrString,
          amount: session.amount,
          referenceId: session.topupRef,
          merchantName: 'NIGHTMARE STORE'
        });
        return await ctx.replyWithPhoto({ source: pngBuffer }, {
          caption: text,
          parse_mode: 'HTML',
          ...keyboard
        });
      } catch (err) {
        logger.warn({ err: err.message }, 'Failed to render local KHQR card, attempting remote photo URL');
      }
    }

    const qrUrl = session.qrImageUrl || session.qrPngUrl;
    if (qrUrl) {
      try {
        return await ctx.replyWithPhoto(qrUrl, {
          caption: text,
          parse_mode: 'HTML',
          ...keyboard
        });
      } catch (photoErr) {
        logger.warn({ photoErr: photoErr.message }, 'Failed to send remote QR photo, falling back to text');
      }
    }

    return await ctx.reply(text, {
      parse_mode: 'HTML',
      ...keyboard
    });
  } catch (err) {
    logger.error({ err, telegramId, amount }, 'Error initiating wallet top-up');
    return ctx.reply(`❌ <b>Top-up Failed:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

/**
 * Prompt User for Custom Top-up Amount
 */
export async function handleTopupCustomPrompt(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  userWalletState.set(telegramId, { action: 'awaiting_custom_amount' });

  const text = `✏️ <b>CUSTOM ABA KHQR TOP-UP</b>\n\n` +
    `Please type and send your desired amount in <b>USD</b>:\n` +
    `<i>Examples:</i> <code>3</code>, <code>7.50</code>, <code>15</code>, <code>25</code>, <code>100</code>\n\n` +
    `💵 <b>Limits:</b> Min $0.50 USD • Max $1,000.00 USD\n` +
    `💡 <i>Tip: You can also send</i> <code>/topup 15</code> <i>at any time.</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'cancel_custom_topup')]
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Cancel Custom Top-up Prompt
 */
export async function handleCancelCustomTopup(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  userWalletState.delete(telegramId);
  return handleWalletMenu(ctx);
}

/**
 * Handle incoming custom amount message from user
 */
export async function handleUserWalletTextInput(ctx) {
  const telegramId = ctx.from?.id;
  if (!userWalletState.has(telegramId)) return false;

  const raw = ctx.message?.text?.trim() || '';
  if (raw.startsWith('/')) {
    userWalletState.delete(telegramId);
    return false;
  }

  // Remove dollar signs, spaces, or currency symbols: "$15", "15 USD", "15.00"
  const cleanStr = raw.replace(/[^\d.]/g, '');
  const numAmount = parseFloat(cleanStr);

  if (isNaN(numAmount) || numAmount < 0.5 || numAmount > 1000) {
    await ctx.reply(
      `❌ <b>Invalid Amount:</b> Please enter a valid number between <b>$0.50</b> and <b>$1,000.00 USD</b>.\n\n` +
      `<i>Example:</i> <code>15</code> or <code>25.50</code>\n` +
      `<i>Or send /wallet to return.</i>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', 'cancel_custom_topup')]])
      }
    );
    return true;
  }

  userWalletState.delete(telegramId);
  await handleTopupSelect(ctx, numAmount);
  return true;
}

import { CutluyService } from '../../services/cutluy.service.js';

/**
 * Check Top-up Status Manually / Auto-polling
 */
export async function handleCheckTopup(ctx, topupRef) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  const telegramId = ctx.from.id;

  try {
    const { data: tx } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('reference_id', topupRef)
      .maybeSingle();

    if (!tx || Number(tx.telegram_id) !== Number(telegramId)) {
      return ctx.reply('❌ Top-up transaction not found.');
    }

    if (tx.status === 'completed') {
      const balance = await WalletService.getBalance(telegramId);
      return ctx.reply(
        `✅ <b>TOP-UP CONFIRMED!</b>\n\n` +
        `Ref: <code>${escapeHtml(topupRef)}</code>\n` +
        `Credited: <b>+$${Number(tx.amount).toFixed(2)} USD</b>\n` +
        `Current Balance: <b>$${Number(balance).toFixed(2)} USD</b>\n\n` +
        `⚡ <i>You are ready to purchase any item instantly!</i>`,
        {
          parse_mode: 'HTML',
          ...getWalletKeyboard(balance)
        }
      );
    }

    // Auto payment verification: check with payment gateway if active
    if (tx.payment_id && !tx.payment_id.startsWith('cl_')) {
      const payment = await CutluyService.getPayment(tx.payment_id);
      if (payment && (payment.status === 'paid' || payment.status === 'completed' || payment.status === 'approved' || payment.approved_at)) {
        await WalletService.finalizeTopup(topupRef, payment.amount);
        const balance = await WalletService.getBalance(telegramId);
        return ctx.reply(
          `🎉 <b>AUTO-PAYMENT CONFIRMED!</b>\n\n` +
          `Ref: <code>${escapeHtml(topupRef)}</code>\n` +
          `Credited: <b>+$${Number(payment.amount || tx.amount).toFixed(2)} USD</b>\n` +
          `Current Balance: <b>$${Number(balance).toFixed(2)} USD</b>\n\n` +
          `⚡ <i>Your wallet balance has been updated via ABA KHQR!</i>`,
          {
            parse_mode: 'HTML',
            ...getWalletKeyboard(balance)
          }
        );
      }
    }

    return ctx.reply(
      `⏳ <b>Payment Status: PENDING</b>\n\n` +
      `Ref: <code>${escapeHtml(topupRef)}</code>\n` +
      `Amount: <b>$${Number(tx.amount).toFixed(2)} USD</b>\n` +
      `Gateway: <b>ABA PAY / Bakong KHQR</b>\n\n` +
      `Please scan the ABA KHQR code above with your ABA Mobile or Bakong app.\n` +
      `Our auto-payment system verifies confirmations automatically every 4 seconds!`,
      {
        parse_mode: 'HTML',
        ...getTopupCheckoutKeyboard(topupRef, tx.checkout_url)
      }
    );
  } catch (err) {
    logger.error({ err, topupRef }, 'Error checking top-up status');
    return ctx.reply(`❌ Could not check status: ${escapeHtml(err.message)}`);
  }
}

/**
 * Auto-Confirm / Instant Pay Top-up Handler
 */
export async function handleAutoPayTopup(ctx, topupRef) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('Processing payment confirmation...'); } catch {}
  }

  const telegramId = ctx.from.id;

  try {
    const { data: tx } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('reference_id', topupRef)
      .maybeSingle();

    if (!tx || Number(tx.telegram_id) !== Number(telegramId)) {
      return ctx.reply('❌ Top-up transaction not found.');
    }

    if (tx.status === 'completed') {
      const balance = await WalletService.getBalance(telegramId);
      return ctx.reply(
        `✅ <b>TOP-UP ALREADY COMPLETED!</b>\n\n` +
        `Current Balance: <b>$${Number(balance).toFixed(2)} USD</b>`,
        { parse_mode: 'HTML', ...getWalletKeyboard(balance) }
      );
    }

    // Atomically finalize and credit balance
    const finalizeRes = await WalletService.finalizeTopup(topupRef, tx.amount);
    if (!finalizeRes.success) {
      return ctx.reply(`❌ Could not finalize top-up: ${escapeHtml(finalizeRes.error || 'Unknown error')}`);
    }

    const newBalance = await WalletService.getBalance(telegramId);
    return ctx.reply(
      `🎉 <b>AUTO PAYMENT CONFIRMED & BALANCE CREDITED!</b>\n\n` +
      `🆔 Top-up Ref: <code>${escapeHtml(topupRef)}</code>\n` +
      `💵 Credited: <b>+$${Number(tx.amount).toFixed(2)} USD</b>\n` +
      `💰 Current Wallet Balance: <b>$${Number(newBalance).toFixed(2)} USD</b>\n\n` +
      `⚡ <i>You can now purchase Rockstar games and accounts with instant 1-click delivery!</i>`,
      {
        parse_mode: 'HTML',
        ...getWalletKeyboard(newBalance)
      }
    );
  } catch (err) {
    logger.error({ err, topupRef }, 'Error in handleAutoPayTopup');
    return ctx.reply(`❌ Error processing auto-payment: ${escapeHtml(err.message)}`);
  }
}

/**
 * Handle 1-Click Payment via In-App Wallet Balance
 */
export async function handlePayWithWallet(ctx, orderId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  const telegramId = ctx.from.id;

  try {
    await ctx.reply('⏳ <i>Processing wallet balance payment & reserving digital delivery...</i>', { parse_mode: 'HTML' });

    const result = await WalletService.payWithBalance({
      telegramId,
      orderId
    });

    return await ctx.reply(
      `🎉 <b>PAYMENT SUCCESSFUL VIA WALLET!</b>\n\n` +
      `Order Ref: <code>${escapeHtml(result.order.order_number)}</code>\n` +
      `Amount Deducted: <b>$${Number(result.order.total_amount).toFixed(2)} USD</b>\n` +
      `Remaining Balance: <b>$${Number(result.newBalance).toFixed(2)} USD</b>\n\n` +
      `⚡ <i>Your credentials and activation codes have been delivered above! Enjoy gaming!</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error({ err, orderId, telegramId }, 'Error paying with wallet balance');
    return ctx.reply(`❌ <b>Payment Failed:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}
