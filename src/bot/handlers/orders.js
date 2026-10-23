import { OrderService } from '../../services/order.service.js';
import { escapeHtml, t } from '../../utils/telegram.js';
import { Markup } from 'telegraf';

export async function handleOrders(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';
  const telegramId = ctx.from.id;

  const orders = await OrderService.getUserOrders(telegramId, 10);

  let text = t(lang, 'my_orders_title');

  if (orders.length === 0) {
    text += t(lang, 'no_orders');
  } else {
    for (const o of orders) {
      const statusIcon = o.status === 'delivered' ? '✅' : o.status === 'paid' ? '💳' : o.status === 'pending' ? '⏳' : '❌';
      const itemsDesc = (o.order_items || []).map(i => i.product_title).join(', ') || 'Rockstar Product';

      text += `${statusIcon} <b>Order:</b> <code>${escapeHtml(o.order_number)}</code>\n` +
        `📦 <b>Item:</b> ${escapeHtml(itemsDesc)}\n` +
        `💰 <b>Amount:</b> $${o.total_amount} ${o.currency}\n` +
        `📊 <b>Status:</b> ${o.status.toUpperCase()}\n` +
        `📅 <b>Date:</b> ${new Date(o.created_at).toLocaleString()}\n\n`;
    }
  }

  const actionRows = [];
  const pendingOrders = orders.filter(o => o.status === 'pending');
  for (const po of pendingOrders.slice(0, 3)) {
    actionRows.push([Markup.button.callback(`🔄 Check Payment: ${po.order_number}`, `check_pay_${po.id}`)]);
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
