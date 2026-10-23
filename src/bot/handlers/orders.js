import { OrderService } from '../../services/order.service.js';
import { DeliveryService } from '../../services/delivery.service.js';
import { escapeHtml, t } from '../../utils/telegram.js';
import { Markup } from 'telegraf';

export async function handleOrders(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';
  const telegramId = ctx.from.id;

  const orders = await OrderService.getUserOrders(telegramId, 10);

  let text = t(lang, 'my_orders_title') + '\n\n';

  if (orders.length === 0) {
    text += t(lang, 'no_orders');
  } else {
    for (const o of orders) {
      const statusIcon = o.status === 'delivered' ? '✅' : o.status === 'paid' ? '💳' : o.status === 'pending' ? '⏳' : '❌';
      const itemsDesc = (o.order_items || []).map(i => i.product_title).join(', ') || 'Rockstar Product';

      text += `${statusIcon} <b>Order:</b> <code>${escapeHtml(o.order_number)}</code>\n` +
        `📦 <b>Item:</b> ${escapeHtml(itemsDesc)}\n` +
        `💰 <b>Amount:</b> $${Number(o.total_amount).toFixed(2)} ${o.currency}\n` +
        `📊 <b>Status:</b> <b>${o.status.toUpperCase()}</b>\n` +
        `📅 <b>Date:</b> ${new Date(o.created_at).toLocaleString()}\n\n`;
    }
  }

  const actionRows = [];

  // 1. Pending orders check payment buttons
  const pendingOrders = orders.filter(o => o.status === 'pending');
  for (const po of pendingOrders.slice(0, 2)) {
    actionRows.push([Markup.button.callback(`🔄 Check Payment: ${po.order_number}`, `check_pay_${po.id}`)]);
  }

  // 2. Delivered orders instant view buttons
  const deliveredOrders = orders.filter(o => o.status === 'delivered');
  for (const d of deliveredOrders.slice(0, 3)) {
    actionRows.push([Markup.button.callback(`🔑 View Code / Account: ${d.order_number}`, `view_delivery_${d.id}`)]);
  }

  actionRows.push([Markup.button.callback('🔄 Refresh Orders', 'menu_orders')]);
  actionRows.push([Markup.button.callback('🏠 Main Menu', 'back_to_menu')]);

  const keyboard = Markup.inlineKeyboard(actionRows);

  if (ctx.callbackQuery) {
    try {
      return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch {
      return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    }
  }

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Handle re-viewing purchased credentials / codes for a delivered order
 */
export async function handleViewDelivery(ctx, orderId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;

  try {
    const messages = await DeliveryService.getOrderDeliveryMessages(orderId, telegramId);

    if (!messages || messages.length === 0) {
      return ctx.reply('❌ Could not retrieve delivered credentials for this order or unauthorized.');
    }

    const keyboard = DeliveryService.getDeliveryKeyboard();

    for (let i = 0; i < messages.length; i++) {
      const isLast = i === messages.length - 1;
      await ctx.reply(messages[i], {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(isLast ? keyboard : {})
      });
    }
  } catch (err) {
    return ctx.reply(`❌ Error loading order credentials: ${escapeHtml(err.message)}`);
  }
}

