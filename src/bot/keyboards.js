import { Markup } from 'telegraf';
import { t } from '../utils/telegram.js';

export function getMainMenuKeyboard(lang = 'km', isAdmin = false) {
  const rows = [
    [
      { text: t(lang, 'btn_codes'), callback_data: 'menu_codes' },
      { text: t(lang, 'btn_accounts'), callback_data: 'menu_accounts' }
    ],
    [
      { text: t(lang, 'btn_wallet'), callback_data: 'menu_wallet' },
      { text: t(lang, 'btn_orders'), callback_data: 'menu_orders' }
    ],
    [
      { text: t(lang, 'btn_profile'), callback_data: 'menu_profile' },
      { text: t(lang, 'btn_premium'), callback_data: 'menu_premium' }
    ],
    [
      { text: t(lang, 'btn_promotions'), callback_data: 'menu_promotions' },
      { text: t(lang, 'btn_support'), callback_data: 'menu_support' }
    ],
    [
      { text: t(lang, 'btn_language'), callback_data: 'menu_language' }
    ]
  ];

  if (isAdmin) {
    rows.push([
      { text: '🛡️ Admin Dashboard', callback_data: 'menu_admin' }
    ]);
  }

  return Markup.inlineKeyboard(rows);
}

export function getPersistentReplyKeyboard(lang = 'km', isAdmin = false) {
  const rows = [
    [
      { text: t(lang, 'btn_shop') },
      { text: t(lang, 'btn_stock') }
    ],
    [
      { text: t(lang, 'btn_codes') },
      { text: t(lang, 'btn_accounts') }
    ],
    [
      { text: t(lang, 'btn_wallet') },
      { text: t(lang, 'btn_orders') }
    ],
    [
      { text: t(lang, 'btn_profile') },
      { text: t(lang, 'btn_premium') }
    ],
    [
      { text: t(lang, 'btn_promotions') },
      { text: t(lang, 'btn_support') }
    ],
    [
      { text: t(lang, 'btn_language') }
    ]
  ];

  if (isAdmin) {
    rows.push([{ text: '🛡️ Admin Dashboard' }]);
  }

  return Markup.keyboard(rows).resize();
}

export function getLanguageKeyboard() {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('🇰🇭 ភាសាខ្មែរ (Khmer)', 'set_lang_km'),
      Markup.button.callback('🇬🇧 English', 'set_lang_en')
    ],
    [Markup.button.callback('🏠 Back to Menu', 'back_to_menu')]
  ]);
}

export function getProductListKeyboard(products, type = 'all', page = 1, pageSize = 5) {
  const buttons = [];
  const startIdx = (page - 1) * pageSize;
  const currentBatch = products.slice(startIdx, startIdx + pageSize);

  for (const prod of currentBatch) {
    const stockIndicator = prod.stock > 0 ? `[In Stock: ${prod.stock}]` : '[Out of Stock]';
    buttons.push([
      {
        text: `${prod.title} - $${prod.price} ${stockIndicator}`,
        callback_data: `view_prod_${prod.id}`,
        style: 'success'
      }
    ]);
  }

  const navRow = [];
  if (page > 1) {
    navRow.push({ text: '⬅️ Prev', callback_data: `page_${type}_${page - 1}`, style: 'success' });
  }
  if (startIdx + pageSize < products.length) {
    navRow.push({ text: 'Next ➡️', callback_data: `page_${type}_${page + 1}`, style: 'success' });
  }
  if (navRow.length > 0) {
    buttons.push(navRow);
  }

  buttons.push([{ text: '🏠 Main Menu', callback_data: 'back_to_menu', style: 'success' }]);
  return Markup.inlineKeyboard(buttons);
}

export function getProductDetailKeyboard(productId, isInStock, lang = 'km', isAdmin = false) {
  const buttons = [];
  if (isInStock) {
    buttons.push([{ text: '⚡ ' + t(lang, 'btn_buy_now') + ' ($)', callback_data: `buy_prod_${productId}`, style: 'success' }]);
  }
  if (isAdmin) {
    buttons.push([
      { text: '🛠️ Edit Product (Admin)', callback_data: `admin_edit_prod_${productId}`, style: 'danger' },
      { text: '🗑️ Delete Product', callback_data: `admin_delete_prod_prompt_${productId}`, style: 'danger' }
    ]);
  }
  buttons.push([
    { text: '⬅️ Back to Products', callback_data: 'menu_products', style: 'success' },
    { text: '🏠 Main Menu', callback_data: 'back_to_menu', style: 'success' }
  ]);
  return Markup.inlineKeyboard(buttons);
}

export function isValidTelegramUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') return false;
    if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1' || parsed.hostname === '0.0.0.0' || parsed.hostname.endsWith('.local')) return false;
    return true;
  } catch {
    return false;
  }
}

export function getCheckoutKeyboard(orderId, checkoutUrl, lang = 'km', walletBalance = 0, orderAmount = 0) {
  const buttons = [];
  
  if (walletBalance >= orderAmount && orderAmount > 0) {
    buttons.push([Markup.button.callback(`💎 Pay with Wallet Balance ($${walletBalance.toFixed(2)})`, `pay_wallet_${orderId}`)]);
  } else {
    buttons.push([Markup.button.callback(`💰 Wallet: $${walletBalance.toFixed(2)} (Top-up)`, 'menu_wallet')]);
  }

  if (isValidTelegramUrl(checkoutUrl)) {
    buttons.push([Markup.button.url('🇰🇭 Open ABA / Bakong Checkout', checkoutUrl)]);
  }
  buttons.push([
    Markup.button.callback('❌ Cancel Order', `cancel_order_${orderId}`),
    Markup.button.callback('🏠 Main Menu', 'back_to_menu')
  ]);
  return Markup.inlineKeyboard(buttons);
}

export function getWalletKeyboard(balance = 0) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('$1', 'topup_amount_1'),
      Markup.button.callback('$2', 'topup_amount_2'),
      Markup.button.callback('$5', 'topup_amount_5')
    ],
    [
      Markup.button.callback('$10', 'topup_amount_10'),
      Markup.button.callback('$20', 'topup_amount_20'),
      Markup.button.callback('$50', 'topup_amount_50')
    ],
    [
      Markup.button.callback('✏️ Custom Amount ($)', 'topup_custom')
    ],
    [
      Markup.button.callback('🔄 Refresh Balance', 'menu_wallet'),
      Markup.button.callback('🏠 Main Menu', 'back_to_menu')
    ]
  ]);
}

export function getTopupCheckoutKeyboard(topupRef, checkoutUrl) {
  const buttons = [
    [
      Markup.button.callback('💰 Back to Wallet', 'menu_wallet'),
      Markup.button.callback('🏠 Main Menu', 'back_to_menu')
    ]
  ];
  return Markup.inlineKeyboard(buttons);
}
