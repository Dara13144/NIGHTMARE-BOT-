import { MEMBERSHIP_PLANS, MembershipService } from '../../services/membership.service.js';
import { supabase } from '../../config/supabase.js';
import { escapeHtml, t } from '../../utils/telegram.js';
import { Markup } from 'telegraf';

export async function handlePremium(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';

  const text = t(lang, 'premium_title') + '\n\n' +
    `<b>Available VIP Plans:</b>\n` +
    `• <b>1 Month:</b> $${MEMBERSHIP_PLANS.monthly.price} (${MEMBERSHIP_PLANS.monthly.discount}% store discount)\n` +
    `• <b>3 Months:</b> $${MEMBERSHIP_PLANS.quarterly.price} (${MEMBERSHIP_PLANS.quarterly.discount}% store discount)\n` +
    `• <b>1 Year:</b> $${MEMBERSHIP_PLANS.annual.price} (${MEMBERSHIP_PLANS.annual.discount}% store discount)\n\n` +
    `Choose a plan below to activate VIP status:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback(`🟢 ⭐ 1 Month VIP Pass — $${MEMBERSHIP_PLANS.monthly.price}`, 'buy_vip_monthly')],
    [Markup.button.callback(`🔵 💎 3 Months VIP Pass — $${MEMBERSHIP_PLANS.quarterly.price}`, 'buy_vip_quarterly')],
    [Markup.button.callback(`🟣 👑 1 Year Royal VIP — $${MEMBERSHIP_PLANS.annual.price}`, 'buy_vip_annual')],
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

export async function handleBuyVip(ctx, planKey) {
  try { await ctx.answerCbQuery(); } catch {}
  const profileId = ctx.state.profile?.id;
  const plan = MEMBERSHIP_PLANS[planKey];

  if (!plan) return ctx.reply('❌ Invalid VIP plan selected.');

  if (!profileId) {
    return ctx.reply('❌ Profile not found. Please type /start first.');
  }

  // Activate membership directly (or generate payment session in production flow)
  await MembershipService.activateMembership({ profileId, planKey });

  return ctx.reply(`🎉 <b>VIP ACTIVATED!</b>\n\nYou are now a <b>${plan.title}</b> member with an instant <b>${plan.discount}% discount</b> on all store purchases!`, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([[Markup.button.callback('🛒 Start Shopping', 'menu_products')]])
  });
}

export async function handlePromotions(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();

  const { data: promos } = await supabase
    .from('promotions')
    .select('*')
    .eq('is_active', true)
    .order('created_at', { ascending: false });

  let text = '🎁 <b>ACTIVE NIGHTMARE STORE PROMOTIONS</b>\n\n';
  if (!promos || promos.length === 0) {
    text += '<i>No public discount codes active right now. Check back during flash sales!</i>';
  } else {
    for (const p of promos) {
      text += `🏷️ Coupon Code: <code>${escapeHtml(p.code)}</code>\n` +
        `💥 Discount: <b>${p.discount_percent}% OFF</b>\n` +
        `📝 ${escapeHtml(p.description || 'Special store discount')}\n\n`;
    }
    text += '<i>Apply promo code during checkout or contact support for VIP custom offers.</i>';
  }

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('🛒 Shop Products', 'menu_products')],
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
