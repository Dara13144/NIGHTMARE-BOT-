import { supabase } from '../../config/supabase.js';
import { NotificationService } from '../../services/notification.service.js';
import { escapeHtml, t } from '../../utils/telegram.js';
import { Markup } from 'telegraf';
import crypto from 'crypto';

export async function handleSupport(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';

  const text = t(lang, 'support_intro');

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('💬 Contact Admin Directly', 'https://t.me/darazzdev')],
    [Markup.button.callback('🎫 Open Support Ticket', 'action_open_ticket')],
    [Markup.button.callback('🏠 Main Menu', 'back_to_menu')]
  ]);

  if (ctx.callbackQuery) {
    try {
      return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch {
      return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    }
  }

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

export async function handleOpenTicket(ctx) {
  await ctx.answerCbQuery();
  const telegramId = ctx.from.id;
  const profileId = ctx.state.profile?.id || null;
  const ticketNumber = `TICK-${Date.now().toString().slice(-6)}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert([{
      ticket_number: ticketNumber,
      profile_id: profileId,
      telegram_id: telegramId,
      subject: 'Inquiry via Telegram Bot',
      message: `Customer initiated support ticket via bot. Telegram user: ${ctx.from.username ? '@' + ctx.from.username : telegramId}`,
      status: 'open'
    }])
    .select()
    .single();

  if (error) {
    return ctx.reply('❌ Could not create support ticket at this moment. Please contact @darazzdev directly.');
  }

  // Notify admins
  await NotificationService.notifyAdmins(
    `🎫 <b>NEW SUPPORT TICKET:</b> <code>${ticketNumber}</code>\nUser: <code>${telegramId}</code> (${ctx.from.username ? '@' + ctx.from.username : 'No username'})\nStatus: Open`
  );

  return ctx.reply(`✅ <b>Support Ticket Created!</b>\n\nTicket Ref: <code>${ticketNumber}</code>\nOur team has been notified and will review your account inquiry shortly. You may also message @darazzdev directly with this ticket number.`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('🏠 Main Menu', 'back_to_menu')]])
  });
}
