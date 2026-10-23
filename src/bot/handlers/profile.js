import { MembershipService } from '../../services/membership.service.js';
import { WalletService } from '../../services/wallet.service.js';
import { supabase } from '../../config/supabase.js';
import { escapeHtml, t } from '../../utils/telegram.js';
import { Markup } from 'telegraf';

export async function handleProfile(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';
  const profile = ctx.state.profile;
  const telegramId = ctx.from.id;

  const membership = profile?.id ? await MembershipService.getActiveMembership(profile.id) : null;
  const balance = await WalletService.getBalance(telegramId);

  // Count user orders
  const { count } = await supabase
    .from('orders')
    .select('*', { count: 'exact', head: true })
    .eq('telegram_id', telegramId);

  const vipBadge = membership ? `⭐ VIP Member (${membership.discount_percentage}% OFF)` : 'Standard Customer';

  const text = t(lang, 'profile_title') +
    `👤 <b>Name:</b> ${escapeHtml(ctx.from.first_name || 'Customer')} ${escapeHtml(ctx.from.last_name || '')}\n` +
    `🆔 <b>Telegram ID:</b> <code>${telegramId}</code>\n` +
    `🏷️ <b>Username:</b> ${ctx.from.username ? '@' + escapeHtml(ctx.from.username) : 'None'}\n` +
    `💰 <b>Wallet Balance:</b> <b>$${balance.toFixed(2)} USD</b>\n` +
    `👑 <b>Tier:</b> <b>${vipBadge}</b>\n` +
    `📦 <b>Total Orders:</b> ${count || 0}\n` +
    `🌐 <b>Language:</b> ${profile?.language_code === 'en' ? 'English (🇬🇧)' : 'ភាសាខ្មែរ (🇰🇭)'}\n`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('💳 Top-up Wallet Balance', 'menu_wallet')],
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
