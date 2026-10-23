import { Markup } from 'telegraf';
import { env } from '../../config/env.js';
import { supabase } from '../../config/supabase.js';
import { ProductService } from '../../services/product.service.js';
import { WalletService } from '../../services/wallet.service.js';
import { DeliveryService } from '../../services/delivery.service.js';
import { InventoryService } from '../../services/inventory.service.js';
import { isValidTelegramUrl } from '../keyboards.js';
import { escapeHtml } from '../../utils/telegram.js';
import { logger } from '../../utils/logger.js';

// In-memory conversation state for admin awaiting stock text input
export const adminInputState = new Map();

/**
 * Check if a Telegram user ID is authorized as Store Admin
 */
export function isAdmin(telegramId) {
  if (!env.ADMIN_TELEGRAM_IDS) return false;
  const adminIds = env.ADMIN_TELEGRAM_IDS.split(',').map(s => s.trim());
  return adminIds.includes(String(telegramId));
}

/**
 * Main Admin Dashboard Home
 */
export async function handleAdminDashboard(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) {
    return ctx.reply('⛔ <b>Access Denied:</b> This command is restricted to NIGHTMARE STORE administrators only.', { parse_mode: 'HTML' });
  }

  try {
    // 1. Fetch live metrics
    const [ordersRes, profilesRes, accountsRes, codesRes] = await Promise.all([
      supabase.from('orders').select('id, total_amount, status, created_at'),
      supabase.from('profiles').select('id, balance', { count: 'exact' }),
      supabase.from('account_inventory').select('id, status'),
      supabase.from('code_inventory').select('id, status')
    ]);

    const orders = ordersRes.data || [];
    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(o => o.status === 'delivered').length;
    const paidOrders = orders.filter(o => o.status === 'paid').length;
    const pendingOrders = orders.filter(o => o.status === 'pending').length;

    const totalRevenue = orders
      .filter(o => o.status === 'paid' || o.status === 'delivered')
      .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);

    const totalCustomers = profilesRes.count || profilesRes.data?.length || 0;
    const availableAccounts = (accountsRes.data || []).filter(a => a.status === 'available').length;
    const availableCodes = (codesRes.data || []).filter(c => c.status === 'available').length;
    const totalStock = availableAccounts + availableCodes;

    const text = `🛡️ <b>NIGHTMARE STORE — ADMIN BOT CONTROL PANEL</b>\n\n` +
      `👑 <b>Admin:</b> ${escapeHtml(ctx.from.first_name || 'Admin')} (<code>${telegramId}</code>)\n` +
      `🌐 <b>Status:</b> 🟢 Operational (Port ${env.PORT})\n\n` +
      `📊 <b>REAL-TIME STORE METRICS:</b>\n` +
      `• Total Revenue: <b>$${totalRevenue.toFixed(2)} USD</b>\n` +
      `• Total Orders: <b>${totalOrders}</b>\n` +
      `   └ ✅ Delivered: <b>${deliveredOrders}</b>\n` +
      `   └ 💳 Paid: <b>${paidOrders}</b>\n` +
      `   └ ⏳ Pending: <b>${pendingOrders}</b>\n` +
      `• Registered Buyers: <b>${totalCustomers}</b>\n` +
      `• Available Stock: <b>${totalStock} items</b>\n` +
      `   └ 👤 Accounts: <b>${availableAccounts}</b>\n` +
      `   └ 🎮 Codes: <b>${availableCodes}</b>\n\n` +
      `⚡ <b>Quick Admin Slash Commands:</b>\n` +
      `• <code>/editproduct</code> — Open bot Product Editor\n` +
      `• <code>/editprice &lt;id&gt; &lt;price&gt;</code> — Edit product price\n` +
      `• <code>/edittitle &lt;id&gt; &lt;title&gt;</code> — Edit product title\n` +
      `• <code>/toggleproduct &lt;id&gt;</code> — Show/Hide product\n` +
      `• <code>/deleteproduct &lt;id&gt;</code> — Delete product\n` +
      `• <code>/deletecode &lt;code&gt;</code> — Delete unsold code\n` +
      `• <code>/deleteaccount &lt;id&gt;</code> — Delete unsold account\n` +
      `• <code>/addcode &lt;prod_id&gt; &lt;code&gt;</code> — Add single code\n` +
      `• <code>/bulkcodes &lt;prod_id&gt; &lt;c1, c2...&gt;</code> — Bulk import codes\n` +
      `• <code>/addaccount &lt;prod_id&gt; &lt;email:password&gt;</code> — Add account\n` +
      `• <code>/addbalance &lt;telegram_id&gt; &lt;amount&gt;</code> — Credit user\n` +
      `• <code>/deductbalance &lt;telegram_id&gt; &lt;amount&gt;</code> — Debit user\n` +
      `• <code>/broadcast &lt;message&gt;</code> — Announcement to all buyers\n` +
      `• <code>/user &lt;telegram_id&gt;</code> — Lookup buyer profile & balance`;

    const webAdminUrl = `${env.APP_BASE_URL}/admin`;
    const actionRows = [
      [
        Markup.button.callback('🛠️ Product Editor', 'admin_edit_products_menu'),
        Markup.button.callback('📦 Stock Report', 'admin_stock')
      ],
      [
        Markup.button.callback('➕ Add Rockstar Code', 'admin_add_code_menu'),
        Markup.button.callback('➕ Add Rockstar Account', 'admin_add_account_menu')
      ],
      [
        Markup.button.callback('📊 Detailed Stats', 'admin_stats'),
        Markup.button.callback('👥 Buyers List', 'admin_buyers')
      ],
      [
        Markup.button.callback('💳 Recent Orders', 'admin_orders'),
        Markup.button.callback('💰 Adjust Balance Guide', 'admin_balance_help')
      ],
      [
        Markup.button.callback('📢 Broadcast Help', 'admin_broadcast_help')
      ]
    ];

    if (isValidTelegramUrl(webAdminUrl)) {
      actionRows.push([Markup.button.url('🌐 Open Web Dashboard', webAdminUrl)]);
    }

    actionRows.push([
      Markup.button.callback('🔄 Refresh Metrics', 'menu_admin'),
      Markup.button.callback('🏠 Main Menu', 'back_to_menu')
    ]);

    const keyboard = Markup.inlineKeyboard(actionRows);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err }, 'Error opening admin dashboard');
    return ctx.reply(`❌ <b>Admin Error:</b> ${escapeHtml(err.message)}`, { parse_mode: 'HTML' });
  }
}

/**
 * Detailed Stock Breakdown View
 */
export async function handleAdminStock(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  if (!isAdmin(ctx.from?.id)) return;

  try {
    const products = await ProductService.getProducts({});

    let text = `📦 <b>REAL-TIME INVENTORY & STOCK REPORT</b>\n\n`;

    const accountProducts = products.filter(p => p.type === 'rockstar_account');
    const codeProducts = products.filter(p => p.type === 'rockstar_code');

    const totalAccounts = accountProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
    const totalCodes = codeProducts.reduce((sum, p) => sum + (p.stock || 0), 0);
    const grandTotal = totalAccounts + totalCodes;

    text += `📊 <b>TOTAL STORE INVENTORY:</b>\n` +
      `• 👤 <b>Rockstar Accounts:</b> ${totalAccounts > 0 ? `🟢 <b>${totalAccounts} units</b>` : '🔴 <i>0 available</i>'}\n` +
      `• 🎮 <b>Rockstar Codes:</b> ${totalCodes > 0 ? `🟢 <b>${totalCodes} units</b>` : '🔴 <i>0 available</i>'}\n` +
      `• 📦 <b>Combined Total:</b> <b>${grandTotal} units available</b>\n\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📦 <b>DETAILED PRODUCT BREAKDOWN:</b>\n\n`;

    if (!products || products.length === 0) {
      text += `<i>No products listed in catalog.</i>`;
    } else {
      for (const prod of products) {
        const inStock = prod.stock || 0;
        const icon = inStock > 0 ? '🟢' : '🔴';
        const typeBadge = prod.type === 'rockstar_account' ? '👤 Account' : '🎮 Code';
        const statusBadge = prod.is_active ? 'Active' : 'Hidden';
        text += `${icon} <b>${escapeHtml(prod.title)}</b>\n` +
          `   🏷️ ${typeBadge} | 💵 <b>$${Number(prod.price).toFixed(2)}</b>\n` +
          `   📊 Available Stock: <b>${inStock} units</b> (${statusBadge})\n\n`;
      }
    }

    const keyboard = Markup.inlineKeyboard([
      [
        { text: '➕ Add Rockstar Code', callback_data: 'admin_add_code_menu', style: 'success' },
        { text: '➕ Add Rockstar Account', callback_data: 'admin_add_account_menu', style: 'success' }
      ],
      [
        { text: '🛠️ Product Editor', callback_data: 'admin_edit_products_menu', style: 'primary' },
        { text: '🔄 Refresh Stock', callback_data: 'admin_stock', style: 'primary' }
      ],
      [
        { text: '🔙 Back to Admin Panel', callback_data: 'menu_admin', style: 'primary' },
        { text: '🏠 Main Menu', callback_data: 'back_to_menu', style: 'primary' }
      ]
    ]);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err }, 'Error displaying admin stock');
    return ctx.reply(`❌ Could not load stock report: ${escapeHtml(err.message)}`);
  }
}

/**
 * Recent Orders View
 */
export async function handleAdminOrders(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  if (!isAdmin(ctx.from?.id)) return;

  try {
    const { data: recentOrders } = await supabase
      .from('orders')
      .select('*, order_items (product_title, inventory_type)')
      .order('created_at', { ascending: false })
      .limit(6);

    let text = `💳 <b>RECENT STORE ORDERS (LAST 6)</b>\n\n`;

    if (!recentOrders || recentOrders.length === 0) {
      text += `<i>No orders placed yet.</i>`;
    } else {
      for (const o of recentOrders) {
        const itemTitle = o.order_items?.[0]?.product_title || 'Digital Product';
        const statusEmoji = o.status === 'delivered' ? '✅' : o.status === 'paid' ? '💳' : o.status === 'pending' ? '⏳' : '❌';

        text += `${statusEmoji} <code>${escapeHtml(o.order_number)}</code> — <b>$${Number(o.total_amount).toFixed(2)}</b>\n` +
          `   Item: <b>${escapeHtml(itemTitle)}</b>\n` +
          `   Buyer ID: <code>${o.telegram_id}</code> | Status: <b>${o.status.toUpperCase()}</b>\n` +
          `   Date: ${new Date(o.created_at).toLocaleTimeString()}\n\n`;
      }
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Admin Panel', 'menu_admin')],
      [Markup.button.callback('🏠 Main Menu', 'back_to_menu')]
    ]);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err }, 'Error viewing admin orders');
    return ctx.reply(`❌ Could not load orders: ${escapeHtml(err.message)}`);
  }
}

/**
 * Recent Buyers View
 */
export async function handleAdminBuyers(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  if (!isAdmin(ctx.from?.id)) return;

  try {
    const { data: buyers } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);

    let text = `👥 <b>REGISTERED STORE BUYERS (LAST 8)</b>\n\n`;

    if (!buyers || buyers.length === 0) {
      text += `<i>No buyer profiles found.</i>`;
    } else {
      for (const b of buyers) {
        const name = `${b.first_name || 'Customer'} ${b.last_name || ''}`.trim();
        const username = b.username ? `@${b.username}` : 'No username';
        const balance = Number(b.balance || 0).toFixed(2);

        text += `👤 <b>${escapeHtml(name)}</b> (${escapeHtml(username)})\n` +
          `   ID: <code>${b.telegram_id}</code> | Balance: <b>$${balance} USD</b>\n` +
          `   Joined: ${new Date(b.created_at).toLocaleDateString()}\n\n`;
      }
    }

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🔙 Back to Admin Panel', 'menu_admin')],
      [Markup.button.callback('🏠 Main Menu', 'back_to_menu')]
    ]);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err }, 'Error viewing buyers');
    return ctx.reply(`❌ Could not load buyers: ${escapeHtml(err.message)}`);
  }
}

/**
 * Balance Adjustment Command Handler:
 * Usage: /addbalance <telegram_id> <amount> [reason]
 */
export async function handleAddBalanceCommand(ctx) {
  const telegramId = ctx.from?.id;
  const parts = ctx.message.text.trim().split(/\s+/);

  if (!isAdmin(telegramId)) {
    const { handleTopupSelect, handleWalletMenu } = await import('./wallet.js');
    const amountVal = parts[1] ? parseFloat(parts[1]) : null;
    if (amountVal && !isNaN(amountVal) && amountVal > 0) {
      return handleTopupSelect(ctx, amountVal);
    }
    return handleWalletMenu(ctx);
  }

  let targetId = telegramId;
  let amount = 0;
  let reason = 'Admin Balance Credit';

  if (parts.length === 2) {
    amount = parseFloat(parts[1]);
  } else if (parts.length >= 3) {
    if (/^\d{6,}$/.test(parts[1])) {
      targetId = Number(parts[1]);
      amount = parseFloat(parts[2]);
      reason = parts.slice(3).join(' ') || 'Admin Credit via Telegram Bot';
    } else {
      amount = parseFloat(parts[1]);
      reason = parts.slice(2).join(' ') || 'Admin Credit via Telegram Bot';
    }
  } else {
    return ctx.reply(
      `ℹ️ <b>Add Balance Usage:</b>\n` +
      `• Add to yourself: <code>/addbalance &lt;amount&gt;</code>\n` +
      `• Add to customer: <code>/addbalance &lt;telegram_id&gt; &lt;amount&gt; [reason]</code>\n\n` +
      `Examples:\n` +
      `<code>/addbalance 10</code> (Add $10 to your balance)\n` +
      `<code>/addbalance 8361673413 25.00 VIP Bonus</code>`,
      { parse_mode: 'HTML' }
    );
  }

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Please enter a positive USD amount (e.g. <code>/addbalance 10</code>).', { parse_mode: 'HTML' });
  }

  try {
    const result = await WalletService.adminAdjustBalance({
      telegramId: targetId,
      amount,
      reason,
      adminId: String(telegramId)
    });

    return ctx.reply(
      `✅ <b>BALANCE CREDITED SUCCESSFULLY!</b>\n\n` +
      `Target User: <code>${targetId}</code>\n` +
      `Amount: <b>+$${amount.toFixed(2)} USD</b>\n` +
      `New User Balance: <b>$${Number(result?.new_balance || 0).toFixed(2)} USD</b>\n` +
      `Reason: ${escapeHtml(reason)}\n\n` +
      `<i>The customer has been notified via Telegram.</i>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error({ err, targetId, amount }, 'Error adding balance via bot');
    return ctx.reply(`❌ Error adding balance: ${escapeHtml(err.message)}`);
  }
}

/**
 * Balance Deduction Command Handler:
 * Usage: /deductbalance <telegram_id> <amount> [reason] or /deductbalance <amount> [reason]
 */
export async function handleDeductBalanceCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  let targetId = telegramId;
  let amount = 0;
  let reason = 'Admin Balance Debit';

  if (parts.length === 2) {
    amount = parseFloat(parts[1]);
  } else if (parts.length >= 3) {
    if (/^\d{6,}$/.test(parts[1])) {
      targetId = Number(parts[1]);
      amount = parseFloat(parts[2]);
      reason = parts.slice(3).join(' ') || 'Admin Debit via Telegram Bot';
    } else {
      amount = parseFloat(parts[1]);
      reason = parts.slice(2).join(' ') || 'Admin Debit via Telegram Bot';
    }
  } else {
    return ctx.reply(
      `ℹ️ <b>Deduct Balance Usage:</b>\n` +
      `• Deduct yourself: <code>/deductbalance &lt;amount&gt;</code>\n` +
      `• Deduct customer: <code>/deductbalance &lt;telegram_id&gt; &lt;amount&gt; [reason]</code>\n\n` +
      `Examples:\n` +
      `<code>/deductbalance 5</code>\n` +
      `<code>/deductbalance 8361673413 5.00 Manual Correction</code>`,
      { parse_mode: 'HTML' }
    );
  }

  if (isNaN(targetId) || isNaN(amount) || amount <= 0) {
    return ctx.reply('❌ Please enter a positive USD amount (e.g. <code>/deductbalance 5</code>).', { parse_mode: 'HTML' });
  }

  try {
    const result = await WalletService.adminAdjustBalance({
      telegramId: targetId,
      amount: -amount,
      reason,
      adminId: String(telegramId)
    });

    return ctx.reply(
      `✅ <b>BALANCE DEDUCTED SUCCESSFULLY!</b>\n\n` +
      `Target User: <code>${targetId}</code>\n` +
      `Amount: <b>-$${amount.toFixed(2)} USD</b>\n` +
      `New User Balance: <b>$${Number(result?.new_balance || 0).toFixed(2)} USD</b>\n` +
      `Reason: ${escapeHtml(reason)}`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error({ err, targetId, amount }, 'Error deducting balance via bot');
    return ctx.reply(`❌ Error deducting balance: ${escapeHtml(err.message)}`);
  }
}

/**
 * Broadcast Announcement Command Handler:
 * Usage: /broadcast <message>
 */
export async function handleBroadcastCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const text = ctx.message.text.replace(/^\/broadcast\s*/i, '').trim();
  if (!text) {
    return ctx.reply(
      `ℹ️ <b>Broadcast Usage:</b>\n<code>/broadcast &lt;announcement text&gt;</code>\n\nExample:\n<code>/broadcast 🎉 Special Weekend Promo! Use code WEEKEND for 10% off Rockstar accounts!</code>`,
      { parse_mode: 'HTML' }
    );
  }

  await ctx.reply('⏳ <i>Sending broadcast to all registered buyers...</i>', { parse_mode: 'HTML' });

  try {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('is_blocked', false);

    if (!profiles || profiles.length === 0) {
      return ctx.reply('ℹ️ No active customers found to broadcast to.');
    }

    let successCount = 0;
    let failCount = 0;

    const formattedMessage = `📢 <b>NIGHTMARE STORE ANNOUNCEMENT</b>\n\n${escapeHtml(text)}\n\n<i>— Store Management</i>`;

    for (const profile of profiles) {
      try {
        await ctx.telegram.sendMessage(profile.telegram_id, formattedMessage, { parse_mode: 'HTML' });
        successCount++;
        // Throttle to respect Telegram rate limits
        await new Promise(r => setTimeout(r, 40));
      } catch (err) {
        failCount++;
      }
    }

    return ctx.reply(
      `📢 <b>BROADCAST REPORT</b>\n\n` +
      `✅ Delivered: <b>${successCount} buyers</b>\n` +
      `❌ Failed: <b>${failCount}</b>\n` +
      `Total Targets: <b>${profiles.length}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    logger.error({ err }, 'Error during broadcast');
    return ctx.reply(`❌ Broadcast failed: ${escapeHtml(err.message)}`);
  }
}

/**
 * User Lookup Command Handler:
 * Usage: /user <telegram_id>
 */
export async function handleUserLookupCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply('ℹ️ <b>Usage:</b> <code>/user &lt;telegram_id&gt;</code>', { parse_mode: 'HTML' });
  }

  const targetId = Number(parts[1]);
  if (isNaN(targetId)) return ctx.reply('❌ Invalid Telegram ID');

  try {
    const [profileRes, ordersRes] = await Promise.all([
      supabase.from('profiles').select('*').eq('telegram_id', targetId).maybeSingle(),
      supabase.from('orders').select('id, total_amount, status').eq('telegram_id', targetId)
    ]);

    const user = profileRes.data;
    if (!user) return ctx.reply(`❌ Customer profile not found for Telegram ID <code>${targetId}</code>`, { parse_mode: 'HTML' });

    const orders = ordersRes.data || [];
    const totalSpent = orders
      .filter(o => o.status === 'paid' || o.status === 'delivered')
      .reduce((s, o) => s + Number(o.total_amount), 0);

    const text = `👤 <b>BUYER PROFILE LOOKUP</b>\n\n` +
      `ID: <code>${user.telegram_id}</code>\n` +
      `Name: <b>${escapeHtml(user.first_name || 'Customer')} ${escapeHtml(user.last_name || '')}</b>\n` +
      `Username: ${user.username ? '@' + escapeHtml(user.username) : 'None'}\n` +
      `💰 Wallet Balance: <b>$${Number(user.balance || 0).toFixed(2)} USD</b>\n` +
      `📦 Total Orders: <b>${orders.length}</b>\n` +
      `💵 Total Spent: <b>$${totalSpent.toFixed(2)} USD</b>\n` +
      `Status: <b>${user.is_blocked ? '⛔ Blocked' : '🟢 Active'}</b>\n` +
      `Joined: ${new Date(user.created_at).toLocaleString()}`;

    return ctx.reply(text, { parse_mode: 'HTML' });
  } catch (err) {
    return ctx.reply(`❌ Lookup error: ${escapeHtml(err.message)}`);
  }
}

/**
 * 0. Product Editor Menu: Browse and select products to edit
 */
export async function handleAdminProductEditorMenu(ctx, page = 1) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  try {
    const products = await ProductService.getProducts({});

    let text = `🛠️ <b>STORE PRODUCT EDITOR</b>\n\n` +
      `Manage pricing, titles, descriptions, live stock, and visibility directly from Telegram.\n\n` +
      `👇 <b>Select a product below to open its editor:</b>`;

    if (!products || products.length === 0) {
      text += `\n\n<i>No products found in store catalog.</i>`;
    }

    const pageSize = 5;
    const startIdx = (page - 1) * pageSize;
    const currentBatch = products.slice(startIdx, startIdx + pageSize);

    const buttons = [];
    for (const prod of currentBatch) {
      const stockBadge = prod.stock > 0 ? `[${prod.stock} in stock]` : '[Out of stock]';
      const label = `${prod.title} - $${Number(prod.price).toFixed(2)} ${stockBadge}`;
      buttons.push([Markup.button.callback(label, `admin_edit_prod_${prod.id}`)]);
    }

    const navRow = [];
    if (page > 1) {
      navRow.push(Markup.button.callback('⬅️ Prev', `admin_edit_page_${page - 1}`));
    }
    if (startIdx + pageSize < products.length) {
      navRow.push(Markup.button.callback('Next ➡️', `admin_edit_page_${page + 1}`));
    }
    if (navRow.length > 0) {
      buttons.push(navRow);
    }

    buttons.push([
      Markup.button.callback('➕ Add Rockstar Code', 'admin_add_code_menu'),
      Markup.button.callback('➕ Add Rockstar Account', 'admin_add_account_menu')
    ]);
    buttons.push([
      Markup.button.callback('🔙 Back to Admin Panel', 'menu_admin'),
      Markup.button.callback('🏠 Main Menu', 'back_to_menu')
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err }, 'Error loading product editor menu');
    return ctx.reply(`❌ Could not load product editor: ${escapeHtml(err.message)}`);
  }
}

/**
 * Product Editor Detail Card
 */
export async function handleAdminEditProductDetail(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  try {
    const product = await ProductService.getProductById(productId);
    if (!product) {
      return ctx.reply('❌ Product not found or has been deleted.');
    }

    const typeLabel = product.type === 'rockstar_account' ? '👤 Rockstar Transferable Account' : '🎮 Rockstar Activation Code';
    const statusLabel = product.is_active ? '🟢 ACTIVE (Visible in Store)' : '🔴 INACTIVE (Hidden from Buyers)';
    const stockStatus = (product.stock || 0) > 0 ? `🟢 <b>${product.stock} units available</b>` : '🔴 <b>Out of Stock (0 units)</b>';

    const text = `🛠️ <b>PRODUCT EDITOR CONTROL PANEL</b>\n\n` +
      `📦 <b>Title:</b> <b>${escapeHtml(product.title)}</b>\n` +
      `🔑 <b>Product ID:</b> <code>${product.id}</code>\n` +
      `🏷️ <b>Type:</b> ${typeLabel}\n` +
      `💰 <b>Price:</b> <b>$${Number(product.price).toFixed(2)} ${escapeHtml(product.currency || 'USD')}</b>\n` +
      `👁️ <b>Store Status:</b> ${statusLabel}\n` +
      `📊 <b>Live Stock:</b> ${stockStatus}\n` +
      `💻 <b>Platform:</b> ${escapeHtml(product.platform || 'PC')} | 🌍 <b>Region:</b> ${escapeHtml(product.region || 'Global')}\n\n` +
      `📝 <b>Description:</b>\n${escapeHtml(product.description || 'No description provided.')}\n\n` +
      `👇 <i>Choose a setting below to edit in real-time:</i>`;

    const stockAction = product.type === 'rockstar_account'
      ? `admin_prompt_acc_${product.id}`
      : `admin_prompt_code_${product.id}`;

    const toggleLabel = product.is_active ? '🔴 Hide from Store' : '🟢 Show in Store';

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('💰 Edit Price', `admin_edit_price_${product.id}`),
        Markup.button.callback('📝 Edit Title', `admin_edit_title_${product.id}`)
      ],
      [
        Markup.button.callback('📄 Edit Description', `admin_edit_desc_${product.id}`),
        Markup.button.callback(toggleLabel, `admin_toggle_prod_${product.id}`)
      ],
      [
        Markup.button.callback('➕ Add Stock', stockAction),
        Markup.button.callback('🗑️ Delete Product', `admin_delete_prod_prompt_${product.id}`)
      ],
      [
        Markup.button.callback('👁️ Buyer Preview', `view_prod_${product.id}`),
        Markup.button.callback('🔙 Product Editor List', 'admin_edit_products_menu')
      ],
      [
        Markup.button.callback('🛡️ Admin Panel', 'menu_admin')
      ]
    ]);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err, productId }, 'Error opening product edit detail');
    return ctx.reply(`❌ Could not load product: ${escapeHtml(err.message)}`);
  }
}

/**
 * Prompt Admin to confirm permanent deletion of a product
 */
export async function handleAdminPromptDeleteProduct(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  try {
    const product = await ProductService.getProductById(productId);
    if (!product) return ctx.reply('❌ Product not found or already deleted.');

    const text = `⚠️ <b>CONFIRM PERMANENT PRODUCT DELETION</b>\n\n` +
      `Are you sure you want to delete this product from NIGHTMARE STORE?\n\n` +
      `• <b>Product:</b> ${escapeHtml(product.title)}\n` +
      `• <b>Product ID:</b> <code>${product.id}</code>\n` +
      `• <b>Price:</b> $${Number(product.price).toFixed(2)} USD\n` +
      `• <b>Current Stock:</b> ${product.stock || 0} units\n\n` +
      `🚨 <b>WARNING:</b> This will permanently delete the product and its unsold inventory from the store. <i>This action cannot be undone.</i>`;

    const keyboard = Markup.inlineKeyboard([
      [
        Markup.button.callback('🗑️ YES, PERMANENTLY DELETE', `admin_delete_prod_confirm_${productId}`)
      ],
      [
        Markup.button.callback('❌ Cancel (Keep Product)', `admin_edit_prod_${productId}`)
      ]
    ]);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    return ctx.reply(`❌ Error preparing delete confirmation: ${escapeHtml(err.message)}`);
  }
}

/**
 * Confirm and execute permanent deletion of a product
 */
export async function handleAdminConfirmDeleteProduct(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery('🗑️ Deleting product...'); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  try {
    const product = await ProductService.getProductById(productId);
    const title = product?.title || productId;

    await ProductService.deleteProduct(productId);

    const text = `🗑️ <b>PRODUCT PERMANENTLY DELETED</b>\n\n` +
      `The product <b>${escapeHtml(title)}</b> (<code>${productId}</code>) has been permanently deleted from NIGHTMARE STORE database.`;

    const keyboard = Markup.inlineKeyboard([
      [Markup.button.callback('🛠️ Product Editor List', 'admin_edit_products_menu')],
      [Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]
    ]);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }

    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    logger.error({ err, productId }, 'Error deleting product');
    return ctx.reply(`❌ Failed to delete product: ${escapeHtml(err.message)}`);
  }
}

/**
 * Prompt Admin to send new price for product
 */
export async function handleAdminPromptEditPrice(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const product = await ProductService.getProductById(productId);
  if (!product) return ctx.reply('❌ Product not found.');

  adminInputState.set(telegramId, {
    action: 'awaiting_edit_price',
    productId: product.id,
    title: product.title,
    currentPrice: product.price
  });

  const text = `💰 <b>EDIT PRODUCT PRICE</b>\n\n` +
    `Product: <b>${escapeHtml(product.title)}</b> (<code>${product.id}</code>)\n` +
    `Current Price: <b>$${Number(product.price).toFixed(2)} USD</b>\n\n` +
    `Please <b>send the new price in USD</b> as a message (e.g. <code>12.99</code> or <code>19.99</code>):`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', `admin_edit_prod_${productId}`)]
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Prompt Admin to send new title for product
 */
export async function handleAdminPromptEditTitle(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const product = await ProductService.getProductById(productId);
  if (!product) return ctx.reply('❌ Product not found.');

  adminInputState.set(telegramId, {
    action: 'awaiting_edit_title',
    productId: product.id,
    title: product.title
  });

  const text = `📝 <b>EDIT PRODUCT TITLE</b>\n\n` +
    `Product ID: <code>${product.id}</code>\n` +
    `Current Title: <b>${escapeHtml(product.title)}</b>\n\n` +
    `Please <b>send the new title</b> as a message:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', `admin_edit_prod_${productId}`)]
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Prompt Admin to send new description for product
 */
export async function handleAdminPromptEditDesc(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const product = await ProductService.getProductById(productId);
  if (!product) return ctx.reply('❌ Product not found.');

  adminInputState.set(telegramId, {
    action: 'awaiting_edit_desc',
    productId: product.id,
    title: product.title
  });

  const text = `📄 <b>EDIT PRODUCT DESCRIPTION</b>\n\n` +
    `Product: <b>${escapeHtml(product.title)}</b>\n\n` +
    `Current Description:\n<i>${escapeHtml(product.description || 'None')}</i>\n\n` +
    `Please <b>send the new description</b> as a message:`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', `admin_edit_prod_${productId}`)]
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Toggle Product Visibility (Active / Inactive)
 */
export async function handleAdminToggleProduct(ctx, productId) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  try {
    const product = await ProductService.getProductById(productId);
    if (!product) {
      if (ctx.callbackQuery) await ctx.answerCbQuery('❌ Product not found');
      return;
    }

    const newStatus = !product.is_active;
    await ProductService.updateProduct(productId, { is_active: newStatus });

    if (ctx.callbackQuery) {
      try {
        await ctx.answerCbQuery(newStatus ? '🟢 Product is now visible to buyers' : '🔴 Product is now hidden from store');
      } catch {}
    }

    return handleAdminEditProductDetail(ctx, productId);
  } catch (err) {
    logger.error({ err, productId }, 'Error toggling product status');
    return ctx.reply(`❌ Failed to update status: ${escapeHtml(err.message)}`);
  }
}

/**
 * 1. Add Rockstar Code Menu: Choose which product to add codes to
 */
export async function handleAdminAddCodeMenu(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  if (!isAdmin(ctx.from?.id)) return;

  try {
    const products = await ProductService.getProducts({ type: 'rockstar_code' });

    let text = `🎮 <b>ADD ROCKSTAR ACTIVATION CODE(S)</b>\n\n` +
      `Select a product below to add codes, or use slash commands:\n\n` +
      `• <code>/addcode &lt;prod_id&gt; &lt;code&gt;</code>\n` +
      `• <code>/bulkcodes &lt;prod_id&gt; &lt;code1, code2...&gt;</code>\n\n` +
      `👇 <b>Choose product to add codes to:</b>`;

    const buttons = [];
    if (products && products.length > 0) {
      for (const p of products) {
        const stockBadge = p.stock > 0 ? `[${p.stock} in stock]` : '[0 in stock]';
        buttons.push([{
          text: `${p.title} - $${p.price} ${stockBadge}`,
          callback_data: `admin_prompt_code_${p.id}`,
          style: 'success'
        }]);
      }
    } else {
      text += `\n<i>No rockstar code products found.</i>`;
    }

    buttons.push([
      { text: '🔙 Back to Admin Panel', callback_data: 'menu_admin', style: 'primary' },
      { text: '🏠 Main Menu', callback_data: 'back_to_menu', style: 'primary' }
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }
    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    return ctx.reply(`❌ Error loading code products: ${err.message}`);
  }
}

/**
 * 2. Add Rockstar Account Menu: Choose which product to add accounts to
 */
export async function handleAdminAddAccountMenu(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  if (!isAdmin(ctx.from?.id)) return;

  try {
    const products = await ProductService.getProducts({ type: 'rockstar_account' });

    let text = `👤 <b>ADD ROCKSTAR ACCOUNT(S)</b>\n\n` +
      `Select a product below to add account stock, or use slash command:\n\n` +
      `• <code>/addaccount &lt;prod_id&gt; &lt;email:password&gt; [recovery]</code>\n\n` +
      `👇 <b>Choose product to add accounts to:</b>`;

    const buttons = [];
    if (products && products.length > 0) {
      for (const p of products) {
        const stockBadge = p.stock > 0 ? `[${p.stock} in stock]` : '[0 in stock]';
        buttons.push([{
          text: `${p.title} - $${p.price} ${stockBadge}`,
          callback_data: `admin_prompt_acc_${p.id}`,
          style: 'success'
        }]);
      }
    } else {
      text += `\n<i>No rockstar account products found.</i>`;
    }

    buttons.push([
      { text: '🔙 Back to Admin Panel', callback_data: 'menu_admin', style: 'primary' },
      { text: '🏠 Main Menu', callback_data: 'back_to_menu', style: 'primary' }
    ]);

    const keyboard = Markup.inlineKeyboard(buttons);

    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
      } catch {
        return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
      }
    }
    return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
  } catch (err) {
    return ctx.reply(`❌ Error loading account products: ${err.message}`);
  }
}

/**
 * Prompt Admin to send code text for a product
 */
export async function handleAdminPromptCodeInput(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const { data: product } = await supabase
    .from('products')
    .select('id, title')
    .eq('id', productId)
    .single();

  if (!product) return ctx.reply('❌ Product not found.');

  adminInputState.set(telegramId, {
    action: 'awaiting_code',
    productId: product.id,
    title: product.title
  });

  const text = `📥 <b>READY TO ADD CODE(S)</b>\n\n` +
    `Product: <b>${escapeHtml(product.title)}</b> (<code>${product.id}</code>)\n\n` +
    `Please <b>type or paste your activation code(s)</b> now and send it as a message:\n\n` +
    `• For 1 code: simply send <code>ROCK-1234-5678-ABCD</code>\n` +
    `• For multiple codes: paste them line-by-line\n\n` +
    `<i>Codes are automatically encrypted with AES-256-GCM.</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'cancel_admin_input')]
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Prompt Admin to send account text for a product
 */
export async function handleAdminPromptAccountInput(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const { data: product } = await supabase
    .from('products')
    .select('id, title')
    .eq('id', productId)
    .single();

  if (!product) return ctx.reply('❌ Product not found.');

  adminInputState.set(telegramId, {
    action: 'awaiting_account',
    productId: product.id,
    title: product.title
  });

  const text = `📥 <b>READY TO ADD ROCKSTAR ACCOUNT(S)</b>\n\n` +
    `Product: <b>${escapeHtml(product.title)}</b> (<code>${product.id}</code>)\n\n` +
    `Please <b>send the account credentials</b> in this format:\n` +
    `<code>email:password</code>\n` +
    `or with recovery:\n` +
    `<code>email:password:recovery_email</code>\n\n` +
    `<i>You can also paste multiple accounts, one per line. Credentials are encrypted with AES-256-GCM before saving.</i>`;

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.callback('❌ Cancel', 'cancel_admin_input')]
  ]);

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

/**
 * Cancel awaiting admin input
 */
export async function handleAdminCancelInput(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  adminInputState.delete(ctx.from?.id);
  return ctx.reply('❌ Action cancelled. Returning to /admin panel.', {
    ...Markup.inlineKeyboard([[Markup.button.callback('🛡️ Open Admin Panel', 'menu_admin')]])
  });
}

/**
 * Handle incoming text when admin is awaiting code or account input
 */
export async function handleAdminTextInput(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return false;

  const state = adminInputState.get(telegramId);
  if (!state) return false;

  const rawText = ctx.message?.text?.trim();
  if (!rawText) return false;

  // Don't intercept slash commands
  if (rawText.startsWith('/')) {
    adminInputState.delete(telegramId);
    return false;
  }

  adminInputState.delete(telegramId);

  if (state.action === 'awaiting_code') {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    if (lines.length === 1) {
      try {
        const added = await InventoryService.addCodeItem({
          product_id: state.productId,
          code: lines[0]
        });
        const { count } = await supabase.from('code_inventory').select('*', { count: 'exact', head: true }).eq('product_id', state.productId).eq('status', 'available');
        return ctx.reply(
          `✅ <b>ROCKSTAR CODE ADDED!</b>\n\n` +
          `Product: <b>${escapeHtml(state.title)}</b>\n` +
          `Code: <code>${escapeHtml(lines[0])}</code>\n` +
          `Current Available Stock: <b>${count || 1} units</b>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('➕ Add More Codes', `admin_prompt_code_${state.productId}`), Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]])
          }
        );
      } catch (err) {
        return ctx.reply(`❌ Failed to add code: ${escapeHtml(err.message)}`);
      }
    } else {
      // Bulk codes
      try {
        const result = await InventoryService.bulkImportCodes(state.productId, lines);
        const { count } = await supabase.from('code_inventory').select('*', { count: 'exact', head: true }).eq('product_id', state.productId).eq('status', 'available');
        return ctx.reply(
          `✅ <b>BULK CODES IMPORT COMPLETED!</b>\n\n` +
          `Product: <b>${escapeHtml(state.title)}</b>\n` +
          `• Successfully Added: <b>${result.successCount} codes</b>\n` +
          `• Duplicates Skipped: <b>${result.duplicateCount}</b>\n` +
          `• Total Available Stock: <b>${count} units</b>`,
          {
            parse_mode: 'HTML',
            ...Markup.inlineKeyboard([[Markup.button.callback('➕ Add More Codes', `admin_prompt_code_${state.productId}`), Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]])
          }
        );
      } catch (err) {
        return ctx.reply(`❌ Bulk import failed: ${escapeHtml(err.message)}`);
      }
    }
  }

  if (state.action === 'awaiting_account') {
    const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
    let successCount = 0;
    let failCount = 0;

    for (const line of lines) {
      const parts = line.split(':').map(p => p.trim());
      if (parts.length >= 2) {
        const email = parts[0];
        const password = parts[1];
        const recovery_info = parts[2] || '';
        try {
          await InventoryService.addAccountItem({
            product_id: state.productId,
            email,
            password,
            recovery_info,
            notes: 'Added via Telegram Bot'
          });
          successCount++;
        } catch {
          failCount++;
        }
      } else {
        failCount++;
      }
    }

    const { count } = await supabase.from('account_inventory').select('*', { count: 'exact', head: true }).eq('product_id', state.productId).eq('status', 'available');

    return ctx.reply(
      `✅ <b>ROCKSTAR ACCOUNT(S) ADDED!</b>\n\n` +
      `Product: <b>${escapeHtml(state.title)}</b>\n` +
      `• Successfully Added: <b>${successCount} accounts</b>\n` +
      (failCount > 0 ? `• Failed/Invalid Format: <b>${failCount}</b>\n` : '') +
      `• Current Available Stock: <b>${count} units</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('➕ Add More Accounts', `admin_prompt_acc_${state.productId}`), Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]])
      }
    );
  }

  if (state.action === 'awaiting_edit_price') {
    const newPrice = parseFloat(rawText.replace('$', '').trim());
    if (isNaN(newPrice) || newPrice < 0) {
      return ctx.reply('❌ Please enter a valid non-negative price (e.g. <code>14.99</code>).', {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('❌ Cancel', `admin_edit_prod_${state.productId}`)]])
      });
    }

    try {
      await ProductService.updateProduct(state.productId, { price: newPrice });
      return ctx.reply(
        `✅ <b>PRODUCT PRICE UPDATED!</b>\n\n` +
        `Product: <b>${escapeHtml(state.title)}</b>\n` +
        `New Price: <b>$${newPrice.toFixed(2)} USD</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🛠️ Product Editor', `admin_edit_prod_${state.productId}`)],
            [Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]
          ])
        }
      );
    } catch (err) {
      return ctx.reply(`❌ Failed to update price: ${escapeHtml(err.message)}`);
    }
  }

  if (state.action === 'awaiting_edit_title') {
    const newTitle = rawText.trim();
    if (!newTitle) {
      return ctx.reply('❌ Title cannot be empty.');
    }

    try {
      await ProductService.updateProduct(state.productId, { title: newTitle });
      return ctx.reply(
        `✅ <b>PRODUCT TITLE UPDATED!</b>\n\n` +
        `Old Title: <s>${escapeHtml(state.title)}</s>\n` +
        `New Title: <b>${escapeHtml(newTitle)}</b>`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🛠️ Product Editor', `admin_edit_prod_${state.productId}`)],
            [Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]
          ])
        }
      );
    } catch (err) {
      return ctx.reply(`❌ Failed to update title: ${escapeHtml(err.message)}`);
    }
  }

  if (state.action === 'awaiting_edit_desc') {
    const newDesc = rawText.trim();
    try {
      await ProductService.updateProduct(state.productId, { description: newDesc });
      return ctx.reply(
        `✅ <b>PRODUCT DESCRIPTION UPDATED!</b>\n\n` +
        `Product: <b>${escapeHtml(state.title)}</b>\n` +
        `New Description applied successfully!`,
        {
          parse_mode: 'HTML',
          ...Markup.inlineKeyboard([
            [Markup.button.callback('🛠️ Product Editor', `admin_edit_prod_${state.productId}`)],
            [Markup.button.callback('🛡️ Admin Panel', 'menu_admin')]
          ])
        }
      );
    } catch (err) {
      return ctx.reply(`❌ Failed to update description: ${escapeHtml(err.message)}`);
    }
  }

  return false;
}

/**
 * Slash Command: /addcode <productId> <code>
 */
export async function handleAddCodeCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    return ctx.reply(
      `ℹ️ <b>Add Code Usage:</b>\n<code>/addcode &lt;product_id&gt; &lt;code&gt;</code>\n\nExample:\n<code>/addcode prod-01 GTA5-XXXX-YYYY-ZZZZ</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = parts[1];
  const code = parts.slice(2).join(' ');

  try {
    await InventoryService.addCodeItem({ product_id: productId, code });
    return ctx.reply(`✅ <b>Code Added Successfully!</b>\nProduct ID: <code>${escapeHtml(productId)}</code>\nCode: <code>${escapeHtml(code)}</code>`, { parse_mode: 'HTML' });
  } catch (err) {
    return ctx.reply(`❌ Failed to add code: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /bulkcodes <productId> <code1, code2, ...>
 */
export async function handleBulkCodesCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const raw = ctx.message.text.replace(/^\/bulkcodes\s+/i, '').trim();
  const firstSpace = raw.indexOf(' ');
  if (firstSpace === -1) {
    return ctx.reply(
      `ℹ️ <b>Bulk Codes Usage:</b>\n<code>/bulkcodes &lt;product_id&gt; &lt;code1, code2, code3...&gt;</code>\n\nExample:\n<code>/bulkcodes prod-01 CODE-1, CODE-2, CODE-3</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = raw.slice(0, firstSpace).trim();
  const codesStr = raw.slice(firstSpace + 1).trim();
  const codeList = codesStr.split(/[,\n]+/).map(c => c.trim()).filter(Boolean);

  try {
    const result = await InventoryService.bulkImportCodes(productId, codeList);
    return ctx.reply(
      `✅ <b>Bulk Import Complete!</b>\nProduct: <code>${escapeHtml(productId)}</code>\nAdded: <b>${result.successCount}</b> | Skipped: <b>${result.duplicateCount}</b>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    return ctx.reply(`❌ Bulk import failed: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /addaccount <productId> <email:password> or <email> <password>
 */
export async function handleAddAccountCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    return ctx.reply(
      `ℹ️ <b>Add Account Usage:</b>\n<code>/addaccount &lt;product_id&gt; &lt;email:password&gt; [recovery]</code>\nor\n<code>/addaccount &lt;product_id&gt; &lt;email&gt; &lt;password&gt;</code>\n\nExample:\n<code>/addaccount prod-03 user@rockstar.com SecretPass123!</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = parts[1];
  let email, password, recovery_info;

  if (parts[2].includes(':')) {
    const subParts = parts[2].split(':');
    email = subParts[0];
    password = subParts[1];
    recovery_info = parts[3] || subParts[2] || '';
  } else {
    email = parts[2];
    password = parts[3];
    recovery_info = parts[4] || '';
  }

  if (!email || !password) {
    return ctx.reply('❌ Please specify both email and password.');
  }

  try {
    await InventoryService.addAccountItem({
      product_id: productId,
      email,
      password,
      recovery_info,
      notes: 'Added via /addaccount bot command'
    });

    return ctx.reply(
      `✅ <b>Rockstar Account Added Successfully!</b>\nProduct: <code>${escapeHtml(productId)}</code>\nEmail: <code>${escapeHtml(email)}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    return ctx.reply(`❌ Failed to add account: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /editproduct [productId]
 */
export async function handleEditProductCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length > 1) {
    const productId = parts[1];
    return handleAdminEditProductDetail(ctx, productId);
  }

  return handleAdminProductEditorMenu(ctx, 1);
}

/**
 * Slash Command: /editprice <productId> <newPrice>
 */
export async function handleEditPriceCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 3) {
    return ctx.reply(
      `ℹ️ <b>Edit Price Usage:</b>\n<code>/editprice &lt;product_id&gt; &lt;price&gt;</code>\n\nExample:\n<code>/editprice prod-01 14.99</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = parts[1];
  const newPrice = parseFloat(parts[2].replace('$', ''));

  if (isNaN(newPrice) || newPrice < 0) {
    return ctx.reply('❌ Please enter a valid non-negative price.');
  }

  try {
    const updated = await ProductService.updateProduct(productId, { price: newPrice });
    return ctx.reply(
      `✅ <b>Product Price Updated!</b>\nProduct: <b>${escapeHtml(updated.title)}</b>\nNew Price: <b>$${newPrice.toFixed(2)} USD</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🛠️ Product Editor', `admin_edit_prod_${productId}`)]])
      }
    );
  } catch (err) {
    return ctx.reply(`❌ Failed to update price: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /edittitle <productId> <newTitle>
 */
export async function handleEditTitleCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const raw = ctx.message.text.replace(/^\/edittitle\s+/i, '').trim();
  const firstSpace = raw.indexOf(' ');
  if (firstSpace === -1) {
    return ctx.reply(
      `ℹ️ <b>Edit Title Usage:</b>\n<code>/edittitle &lt;product_id&gt; &lt;new title&gt;</code>\n\nExample:\n<code>/edittitle prod-01 Grand Theft Auto V Premium (PC)</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = raw.slice(0, firstSpace).trim();
  const newTitle = raw.slice(firstSpace + 1).trim();

  try {
    const updated = await ProductService.updateProduct(productId, { title: newTitle });
    return ctx.reply(
      `✅ <b>Product Title Updated!</b>\nNew Title: <b>${escapeHtml(updated.title)}</b>`,
      {
        parse_mode: 'HTML',
        ...Markup.inlineKeyboard([[Markup.button.callback('🛠️ Product Editor', `admin_edit_prod_${productId}`)]])
      }
    );
  } catch (err) {
    return ctx.reply(`❌ Failed to update title: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /toggleproduct <productId>
 */
export async function handleToggleProductCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply(
      `ℹ️ <b>Toggle Visibility Usage:</b>\n<code>/toggleproduct &lt;product_id&gt;</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = parts[1];
  return handleAdminToggleProduct(ctx, productId);
}

/**
 * Slash Command: /deleteproduct <productId>
 */
export async function handleDeleteProductCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply(
      `ℹ️ <b>Delete Product Usage:</b>\n<code>/deleteproduct &lt;product_id&gt;</code>\n\nExample:\n<code>/deleteproduct prod-01</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const productId = parts[1];
  return handleAdminPromptDeleteProduct(ctx, productId);
}

/**
 * Slash Command: /deletecode <code>
 */
export async function handleDeleteCodeCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply(
      `ℹ️ <b>Delete Code Usage:</b>\n<code>/deletecode &lt;activation_code&gt;</code>\n\nExample:\n<code>/deletecode ROCK-1234-5678-ABCD</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const rawCode = parts.slice(1).join(' ').trim();
  try {
    const deleted = await InventoryService.deleteCode(rawCode);
    return ctx.reply(
      `🗑️ <b>Code Deleted Successfully!</b>\nCode: <code>${escapeHtml(rawCode)}</code>\nProduct ID: <code>${deleted?.product_id || 'N/A'}</code>`,
      { parse_mode: 'HTML' }
    );
  } catch (err) {
    return ctx.reply(`❌ Could not delete code: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /deleteaccount <inventoryId>
 */
export async function handleDeleteAccountCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  const parts = ctx.message.text.trim().split(/\s+/);
  if (parts.length < 2) {
    return ctx.reply(
      `ℹ️ <b>Delete Account Usage:</b>\n<code>/deleteaccount &lt;inventory_item_id&gt;</code>`,
      { parse_mode: 'HTML' }
    );
  }

  const itemId = parts[1];
  try {
    await InventoryService.deleteItem('account', itemId);
    return ctx.reply(`🗑️ <b>Rockstar Account Item Deleted!</b>\nItem ID: <code>${itemId}</code>`, { parse_mode: 'HTML' });
  } catch (err) {
    return ctx.reply(`❌ Could not delete account item: ${escapeHtml(err.message)}`);
  }
}

/**
 * Slash Command: /del or /delete (Chat Message Cleanup)
 */
export async function handleDeleteMessageCommand(ctx) {
  const telegramId = ctx.from?.id;
  if (!isAdmin(telegramId)) return;

  try {
    if (ctx.message.reply_to_message) {
      await ctx.deleteMessage(ctx.message.reply_to_message.message_id);
    }
    await ctx.deleteMessage(ctx.message.message_id);
  } catch (err) {
    // Non-critical if permissions do not allow deleting older messages
  }
}

