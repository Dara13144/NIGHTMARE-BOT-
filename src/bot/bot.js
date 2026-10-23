import { Telegraf } from 'telegraf';
import { env } from '../config/env.js';
import { userMiddleware } from './middleware.js';
import { registerBotCommands } from './commands.js';
import { handleStart, handleLanguageMenu, handleSetLanguage } from './handlers/start.js';
import { handleProducts, handleViewProduct, handleStockStatus } from './handlers/products.js';
import { handleAccounts } from './handlers/accounts.js';
import { handleCodes } from './handlers/codes.js';
import { handleBuyProduct, handleCheckPaymentStatus, handleAutoPayOrder, handleCancelOrder } from './handlers/checkout.js';
import { handleOrders } from './handlers/orders.js';
import { handleProfile } from './handlers/profile.js';
import {
  handleWalletMenu,
  handleTopupSelect,
  handleCheckTopup,
  handleAutoPayTopup,
  handlePayWithWallet,
  handleTopupCustomPrompt,
  handleCancelCustomTopup,
  handleUserWalletTextInput,
  userWalletState
} from './handlers/wallet.js';
import { handlePremium, handleBuyVip, handlePromotions } from './handlers/premium.js';
import { handleSupport, handleOpenTicket } from './handlers/support.js';
import {
  handleAdminDashboard,
  handleAdminStock,
  handleAdminOrders,
  handleAdminBuyers,
  handleAdminProductEditorMenu,
  handleAdminEditProductDetail,
  handleAdminPromptEditPrice,
  handleAdminPromptEditTitle,
  handleAdminPromptEditDesc,
  handleAdminToggleProduct,
  handleAdminPromptDeleteProduct,
  handleAdminConfirmDeleteProduct,
  handleAdminAddCodeMenu,
  handleAdminAddAccountMenu,
  handleAdminPromptCodeInput,
  handleAdminPromptAccountInput,
  handleAdminCancelInput,
  handleAdminTextInput,
  adminInputState
} from './handlers/admin.js';
import { NotificationService } from '../services/notification.service.js';
import { logger } from '../utils/logger.js';

export function createBot() {
  const bot = new Telegraf(env.BOT_TOKEN);

  // Global user middleware
  bot.use(userMiddleware);

  // Handle interactive admin stock text input (for adding codes and accounts)
  bot.use(async (ctx, next) => {
    if (ctx.message?.text && !ctx.message.text.startsWith('/') && adminInputState.has(ctx.from?.id)) {
      const handled = await handleAdminTextInput(ctx);
      if (handled) return;
    }
    return next();
  });

  // Handle interactive custom wallet topup input
  bot.use(async (ctx, next) => {
    if (ctx.message?.text && !ctx.message.text.startsWith('/') && userWalletState.has(ctx.from?.id)) {
      const handled = await handleUserWalletTextInput(ctx);
      if (handled) return;
    }
    return next();
  });

  // Register Slash Commands
  registerBotCommands(bot);

  // 1. Menu Navigation Action Handlers
  bot.action('back_to_menu', handleStart);
  bot.action('menu_products', (ctx) => handleProducts(ctx, 'all', 1));
  bot.action('menu_accounts', handleAccounts);
  bot.action('menu_codes', handleCodes);
  bot.action('menu_stock', handleStockStatus);
  bot.action('menu_wallet', handleWalletMenu);
  bot.action('menu_orders', handleOrders);
  bot.action('menu_profile', handleProfile);
  bot.action('menu_premium', handlePremium);
  bot.action('menu_promotions', handlePromotions);
  bot.action('menu_support', handleSupport);
  bot.action('menu_language', handleLanguageMenu);
  bot.action('action_open_ticket', handleOpenTicket);

  // Admin Dashboard Actions
  bot.action('menu_admin', handleAdminDashboard);
  bot.action('admin_stats', handleAdminDashboard);
  bot.action('admin_stock', handleAdminStock);
  bot.action('admin_orders', handleAdminOrders);
  bot.action('admin_buyers', handleAdminBuyers);
  bot.action('admin_edit_products_menu', (ctx) => handleAdminProductEditorMenu(ctx, 1));
  bot.action(/^admin_edit_page_(\d+)$/, (ctx) => handleAdminProductEditorMenu(ctx, parseInt(ctx.match[1], 10)));
  bot.action(/^admin_edit_prod_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminEditProductDetail(ctx, ctx.match[1]));
  bot.action(/^admin_edit_price_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminPromptEditPrice(ctx, ctx.match[1]));
  bot.action(/^admin_edit_title_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminPromptEditTitle(ctx, ctx.match[1]));
  bot.action(/^admin_edit_desc_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminPromptEditDesc(ctx, ctx.match[1]));
  bot.action(/^admin_toggle_prod_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminToggleProduct(ctx, ctx.match[1]));
  bot.action(/^admin_delete_prod_prompt_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminPromptDeleteProduct(ctx, ctx.match[1]));
  bot.action(/^admin_delete_prod_confirm_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminConfirmDeleteProduct(ctx, ctx.match[1]));
  bot.action('admin_add_code_menu', handleAdminAddCodeMenu);
  bot.action('admin_add_account_menu', handleAdminAddAccountMenu);
  bot.action(/^admin_prompt_code_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminPromptCodeInput(ctx, ctx.match[1]));
  bot.action(/^admin_prompt_acc_([a-zA-Z0-9\-]+)$/, (ctx) => handleAdminPromptAccountInput(ctx, ctx.match[1]));
  bot.action('cancel_admin_input', handleAdminCancelInput);
  bot.action('admin_balance_help', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    return ctx.reply('💰 <b>Balance Adjustment Usage:</b>\n\nTo credit balance:\n<code>/addbalance &lt;telegram_id&gt; &lt;amount&gt; [reason]</code>\n\nTo debit balance:\n<code>/deductbalance &lt;telegram_id&gt; &lt;amount&gt; [reason]</code>\n\nExample:\n<code>/addbalance 8361673413 10.00 VIP Bonus</code>', { parse_mode: 'HTML' });
  });
  bot.action('admin_broadcast_help', async (ctx) => {
    try { await ctx.answerCbQuery(); } catch {}
    return ctx.reply('📢 <b>Broadcast Announcement Usage:</b>\n\n<code>/broadcast &lt;announcement text&gt;</code>\n\nExample:\n<code>/broadcast 🎮 Weekend sale is live! 10% off all Rockstar items!</code>', { parse_mode: 'HTML' });
  });

  // 2. Language switching
  bot.action('set_lang_km', (ctx) => handleSetLanguage(ctx, 'km'));
  bot.action('set_lang_en', (ctx) => handleSetLanguage(ctx, 'en'));

  // 3. VIP plan purchase
  bot.action('buy_vip_monthly', (ctx) => handleBuyVip(ctx, 'monthly'));
  bot.action('buy_vip_quarterly', (ctx) => handleBuyVip(ctx, 'quarterly'));
  bot.action('buy_vip_annual', (ctx) => handleBuyVip(ctx, 'annual'));

  // 4. Product Pagination Pattern
  bot.action(/^page_(all|accounts|codes)_(\d+)$/, (ctx) => {
    const type = ctx.match[1];
    const page = parseInt(ctx.match[2], 10);
    return handleProducts(ctx, type, page);
  });

  // 5. View Product Detail Pattern
  bot.action(/^view_prod_([a-f0-9\-]+)$/, (ctx) => {
    const productId = ctx.match[1];
    return handleViewProduct(ctx, productId);
  });

  // 6. Buy Product Pattern
  bot.action(/^buy_prod_([a-f0-9\-]+)$/, (ctx) => {
    const productId = ctx.match[1];
    return handleBuyProduct(ctx, productId);
  });

  // 7. Check Payment Status Pattern
  bot.action(/^check_pay_([a-f0-9\-]+)$/, (ctx) => {
    const orderId = ctx.match[1];
    return handleCheckPaymentStatus(ctx, orderId);
  });

  // 7b. Auto-Confirm Product Order Payment Pattern
  bot.action(/^auto_pay_order_([a-f0-9\-]+)$/, (ctx) => {
    const orderId = ctx.match[1];
    return handleAutoPayOrder(ctx, orderId);
  });

  // 8. Cancel Order Pattern
  bot.action(/^cancel_order_([a-f0-9\-]+)$/, (ctx) => {
    const orderId = ctx.match[1];
    return handleCancelOrder(ctx, orderId);
  });

  // 9. Wallet Top-up Amount Selection Pattern
  bot.action(/^topup_amount_(\d+)$/, (ctx) => {
    const amount = ctx.match[1];
    return handleTopupSelect(ctx, amount);
  });

  // 9b. Custom Wallet Top-up Amount Prompt & Cancel Actions
  bot.action('topup_custom', handleTopupCustomPrompt);
  bot.action('cancel_custom_topup', handleCancelCustomTopup);

  // 10. Check Top-up Status Pattern
  bot.action(/^check_topup_([a-zA-Z0-9\-]+)$/, (ctx) => {
    const topupRef = ctx.match[1];
    return handleCheckTopup(ctx, topupRef);
  });

  // 10b. Auto-Confirm Top-up Pattern
  bot.action(/^auto_pay_topup_([a-zA-Z0-9\-]+)$/, (ctx) => {
    const topupRef = ctx.match[1];
    return handleAutoPayTopup(ctx, topupRef);
  });

  // 11. Instant Pay with Wallet Balance Pattern
  bot.action(/^pay_wallet_([a-f0-9\-]+)$/, (ctx) => {
    const orderId = ctx.match[1];
    return handlePayWithWallet(ctx, orderId);
  });

  // Global Error Handler
  bot.catch((err, ctx) => {
    logger.error({ err: err.message, update: ctx.update }, 'Telegram bot runtime error');
    try {
      ctx.reply('⚠️ An unexpected error occurred while processing your request. Please try again or contact support.');
    } catch {}
  });

  // Bind bot instance to notification service
  NotificationService.setBot(bot);

  return bot;
}
