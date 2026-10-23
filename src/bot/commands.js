import { env } from '../config/env.js';
import { handleStart, handleLanguageMenu } from './handlers/start.js';
import { handleMiniAppCommand } from './handlers/miniapp.js';
import { handleCheckPaymentCommand } from './handlers/checkout.js';
import { handleProducts, handleStockStatus } from './handlers/products.js';
import { handleAccounts } from './handlers/accounts.js';
import { handleCodes } from './handlers/codes.js';
import { handleOrders } from './handlers/orders.js';
import { handleProfile } from './handlers/profile.js';
import { handleWalletMenu } from './handlers/wallet.js';
import { handlePremium, handlePromotions } from './handlers/premium.js';
import { handleSupport } from './handlers/support.js';
import {
  handleAdminDashboard,
  handleAddBalanceCommand,
  handleDeductBalanceCommand,
  handleBroadcastCommand,
  handleUserLookupCommand,
  handleAddCodeCommand,
  handleBulkCodesCommand,
  handleAddAccountCommand,
  handleEditProductCommand,
  handleEditPriceCommand,
  handleEditTitleCommand,
  handleToggleProductCommand,
  handleDeleteProductCommand,
  handleDeleteCodeCommand,
  handleDeleteAccountCommand,
  handleDeleteMessageCommand
} from './handlers/admin.js';
import { logger } from '../utils/logger.js';

export function registerBotCommands(bot) {
  // 1. Slash Commands Registration
  bot.command('start', handleStart);
  bot.command(['app', 'miniapp', 'webapp', 'store'], handleMiniAppCommand);
  bot.command(['buy', 'shop', 'products'], async (ctx) => {
    const raw = ctx.message?.text?.trim() || '';
    const parts = raw.split(/\s+/);
    if (parts.length > 1 && parts[1]) {
      const prodId = parts[1];
      const { handleBuyProduct } = await import('./handlers/checkout.js');
      return handleBuyProduct(ctx, prodId);
    }
    return handleProducts(ctx, 'all', 1);
  });
  bot.command('accounts', handleAccounts);
  bot.command('codes', handleCodes);
  bot.command('stock', handleStockStatus);
  bot.command(['wallet', 'balance', 'topup', 'custom', 'custombalance'], handleWalletMenu);
  bot.command('orders', handleOrders);
  bot.command('profile', handleProfile);
  bot.command('premium', handlePremium);
  bot.command('promotions', handlePromotions);
  bot.command('language', handleLanguageMenu);
  bot.command('support', handleSupport);
  bot.command(['admin', 'dashboard'], handleAdminDashboard);
  bot.command(['editproduct', 'productedit', 'editor'], handleEditProductCommand);
  bot.command('editprice', handleEditPriceCommand);
  bot.command('edittitle', handleEditTitleCommand);
  bot.command('toggleproduct', handleToggleProductCommand);
  bot.command(['deleteproduct', 'delproduct', 'removeproduct'], handleDeleteProductCommand);
  bot.command(['deletecode', 'delcode'], handleDeleteCodeCommand);
  bot.command(['deleteaccount', 'delaccount'], handleDeleteAccountCommand);
  bot.command(['delete', 'del'], handleDeleteMessageCommand);
  bot.command('addcode', handleAddCodeCommand);
  bot.command('bulkcodes', handleBulkCodesCommand);
  bot.command('addaccount', handleAddAccountCommand);
  bot.command('addbalance', handleAddBalanceCommand);
  bot.command('deductbalance', handleDeductBalanceCommand);
  bot.command('broadcast', handleBroadcastCommand);
  bot.command('user', handleUserLookupCommand);
  bot.command(['check', 'checkpayment', 'verify'], handleCheckPaymentCommand);
  bot.command('help', handleStart);

  // 2. Persistent System Menu Button Text Handlers (Khmer & English)
  bot.hears([/.*(Mini App|Web App|ហាង Mini App)/i], handleMiniAppCommand);
  bot.hears([/.*(Shop Products|ទិញទំនិញ|Buy|🏪|🟢 🏪)/i], (ctx) => handleProducts(ctx, 'all', 1));
  bot.hears([/.*(Stock Status|ពិនិត្យស្តុក)/i], handleStockStatus);
  bot.hears([/.*(Wallet|កាបូបលុយ|Add Balance|បញ្ចូលលុយ)/i], handleWalletMenu);
  bot.hears([/.*(Rockstar Codes|Codes)/i], handleCodes);
  bot.hears([/.*(Rockstar Accounts|Accounts)/i], handleAccounts);
  bot.hears([/.*(My Orders|ការកុម្ម៉ង់របស់ខ្ញុំ|Orders)/i], handleOrders);
  bot.hears([/.*(My Profile|ព័ត៌មានផ្ទាល់ខ្លួន|Profile)/i], handleProfile);
  bot.hears([/.*(Premium Membership|សមាជិកភាព Premium|Premium|VIP|⭐|💎|👑)/i], handlePremium);
  bot.hears([/.*(Promotions|ប្រូម៉ូសិន)/i], handlePromotions);
  bot.hears([/.*(Contact Support|ផ្នែកបម្រើអតិថិជន|Support)/i], handleSupport);
  bot.hears([/.*(Language|ភាសា)/i], handleLanguageMenu);
  bot.hears([/.*(Main Menu|ម៉ឺនុយដើម)/i], handleStart);
  bot.hears([/.*(Admin Dashboard|ផ្ទាំងគ្រប់គ្រង)/i], handleAdminDashboard);
  bot.hears([/.*(Check Payment|ពិនិត្យការទូទាត់)/i], handleCheckPaymentCommand);

  // 3. Set official bot command list in Telegram menu
  bot.telegram.setMyCommands([
    { command: 'start', description: 'Start NIGHTMARE STORE' },
    { command: 'app', description: '📱 Launch Telegram Mini App Store' },
    { command: 'buy', description: '🏪 Browse & Buy Rockstar Products' },
    { command: 'check', description: 'Check payment status of orders/top-ups' },
    { command: 'wallet', description: 'Check balance & top-up wallet' },
    { command: 'codes', description: 'Rockstar activation codes' },
    { command: 'accounts', description: 'Rockstar transferable accounts' },
    { command: 'stock', description: 'Live stock status' },
    { command: 'orders', description: 'Your order history' },
    { command: 'profile', description: 'Your profile and VIP status' },
    { command: 'language', description: 'Switch language (Khmer/English)' },
    { command: 'support', description: 'Contact customer support' }
  ]).catch(err => {
    logger.warn({ err: err.message }, 'Could not set Telegram MyCommands list');
  });

  // 4. Force native Telegram chat Menu button activation
  const webAppUrl = (env.FRONTEND_URL || env.APP_BASE_URL || '').trim();
  const menuButtonConfig = webAppUrl.startsWith('https://')
    ? { type: 'web_app', text: '🛍️ Store', web_app: { url: webAppUrl } }
    : { type: 'commands' };

  bot.telegram.setChatMenuButton({
    menu_button: menuButtonConfig
  }).catch(err => {
    logger.warn({ err: err.message }, 'Could not set Telegram ChatMenuButton');
  });
}
