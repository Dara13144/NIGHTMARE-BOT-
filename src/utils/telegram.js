/**
 * Utility functions for Telegram message formatting and localization
 */

export function escapeHtml(text) {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export const messages = {
  en: {
    welcome: `🌑 <b>Welcome to NIGHTMARE STORE</b>\n\n🎮 <b>Your Digital Gaming Shop</b>\n\nBrowse authorized Rockstar account products and activation codes.\n\n⚡ Digital delivery\n📦 Live stock availability\n💳 ABA PayWay & Bakong KHQR checkout\n💰 In-app Wallet Balance\n🔒 Secure orders\n\n👇 <b>Tap the [Menu] button at the bottom-left to explore:</b>`,
    btn_shop: '🛒 Shop Products',
    btn_codes: '🎮 Rockstar Codes',
    btn_accounts: '👤 Rockstar Accounts',
    btn_stock: '📦 Stock Status',
    btn_orders: '💳 My Orders',
    btn_profile: '👤 My Profile',
    btn_wallet: '💰 Wallet / Add Balance',
    btn_premium: '⭐ Premium Membership',
    btn_promotions: '🎁 Promotions',
    btn_support: '💬 Contact Support',
    btn_language: '🌐 Language / ភាសា',
    btn_back: '⬅️ Back',
    btn_main_menu: '🏠 Main Menu',
    btn_buy_now: '🏪 Buy',
    btn_cancel: '❌ Cancel',
    stock_status_title: '📦 <b>LIVE STOCK STATUS</b>\n\nReal-time stock of authorized Rockstar items:\n',
    no_stock: '<i>Currently out of stock. Please check back soon!</i>',
    my_orders_title: '💳 <b>YOUR ORDER HISTORY</b>\n\n',
    no_orders: 'You have not placed any orders yet.',
    profile_title: '👤 <b>YOUR PROFILE</b>\n\n',
    premium_title: '⭐ <b>NIGHTMARE STORE VIP MEMBERSHIP</b>\n\nUnlock exclusive store benefits:\n• 5% discount on all Rockstar codes & accounts\n• Priority 24/7 delivery queue\n• Exclusive VIP gaming promotions\n• VIP customer badge\n\n<i>Note: This is a Nightmare Store VIP pass, not a Telegram Premium subscription.</i>',
    support_intro: '💬 <b>NIGHTMARE STORE SUPPORT</b>\n\nNeed assistance with an activation code, account transfer, or payment?\n\nSend your message below or contact admin directly at @darazzdev.',
    order_created: '🛒 <b>ORDER CREATED</b>\n\nOrder Ref: <code>{order_ref}</code>\nProduct: <b>{product_title}</b>\nAmount: <b>${amount} USD</b>\n\n⏳ <i>Inventory is reserved for 15 minutes. Please complete payment via ABA PayWay below:</i>',
    delivery_success: '🎉 <b>DELIVERY COMPLETED!</b>\n\nThank you for purchasing at <b>NIGHTMARE STORE</b>!\nOrder: <code>{order_ref}</code>\nItem: <b>{product_title}</b>\n\n<b>YOUR CREDENTIALS / CODE:</b>\n<pre>{credentials}</pre>\n\n⚠️ <i>Please keep these credentials secure. Do not share them with anyone.</i>'
  },
  km: {
    welcome: `🌑 <b>សូមស្វាគមន៍មកកាន់ NIGHTMARE STORE</b>\n\n🎮 <b>ហាងលក់ហ្គេមឌីជីថលរបស់អ្នក</b>\n\nស្វែងរកគណនី Rockstar Games ស្របច្បាប់ និងកូដ Activation Code ផ្លូវការ។\n\n⚡ ការដឹកជញ្ជូនឌីជីថលភ្លាមៗ\n📦 ស្តុកទំនិញជាក់ស្តែង\n💳 ទូទាត់តាម ABA PayWay & Bakong KHQR\n💰 ប្រព័ន្ធកាបូបលុយ Balance\n🔒 សុវត្ថិភាពខ្ពស់ 100%\n\n👇 <b>សូមចុចប៊ូតុង [Menu] នៅខាងឆ្វេងក្រោម ដើម្បីមើលជម្រើសទាំងអស់៖</b>`,
    btn_shop: '🛒 ទិញទំនិញ',
    btn_codes: '🎮 Rockstar Codes',
    btn_accounts: '👤 Rockstar Accounts',
    btn_stock: '📦 ពិនិត្យស្តុក',
    btn_orders: '💳 ការកុម្ម៉ង់របស់ខ្ញុំ',
    btn_profile: '👤 ព័ត៌មានផ្ទាល់ខ្លួន',
    btn_wallet: '💰 កាបូបលុយ / បញ្ចូលលុយ',
    btn_premium: '⭐ សមាជិកភាព Premium',
    btn_promotions: '🎁 ប្រូម៉ូសិន',
    btn_support: '💬 ផ្នែកបម្រើអតិថិជន',
    btn_language: '🌐 Language / ភាសា',
    btn_back: '⬅️ ត្រឡប់ក្រោយ',
    btn_main_menu: '🏠 ម៉ឺនុយដើម',
    btn_buy_now: '🏪 Buy (ទិញ)',
    btn_cancel: '❌ បោះបង់',
    stock_status_title: '📦 <b>ស្ថានភាពស្តុកទំនិញផ្ទាល់</b>\n\nស្តុកទំនិញ Rockstar ទាំងអស់ដែលមានបច្ចុប្បន្ន៖\n',
    no_stock: '<i>បច្ចុប្បន្នទំនិញនេះអស់ពីស្តុកហើយ។ សូមរង់ចាំការបញ្ចូលស្តុកថ្មី!</i>',
    my_orders_title: '💳 <b>ប្រវត្តិការកុម្ម៉ង់របស់អ្នក</b>\n\n',
    no_orders: 'អ្នកមិនទាន់មានប្រវត្តិបញ្ជាទិញនៅឡើយទេ។',
    profile_title: '👤 <b>ព័ត៌មានគណនីរបស់អ្នក</b>\n\n',
    premium_title: '⭐ <b>សមាជិកភាព VIP នៃ NIGHTMARE STORE</b>\n\nអត្ថប្រយោជន៍ពិសេសសម្រាប់សមាជិក VIP៖\n• បញ្ចុះតម្លៃ 5% លើគ្រប់កូដ និងគណនី Rockstar\n• អាទិភាពទទួលទំនិញលឿនរហ័ស 24/7\n• ប្រូម៉ូសិន VIP ផ្តាច់មុខ\n• សញ្ញាសម្គាល់ VIP Profile\n\n<i>ចំណាំ៖ នេះជាសមាជិកភាព VIP របស់ Nightmare Store មិនមែនជា Telegram Premium ទេ។</i>',
    support_intro: '💬 <b>ផ្នែកជំនួយ NIGHTMARE STORE</b>\n\nត្រូវការជំនួយអំពីកូដ, ការផ្ទេរគណនី ឬការទូទាត់ប្រាក់?\n\nសូមផ្ញើសាររបស់អ្នក ឬទាក់ទង Admin ផ្ទាល់តាម @darazzdev',
    order_created: '🛒 <b>ការកុម្ម៉ង់ត្រូវបានបង្កើត</b>\n\nលេខបញ្ជាទិញ៖ <code>{order_ref}</code>\nទំនិញ៖ <b>{product_title}</b>\nតម្លៃ៖ <b>${amount} USD</b>\n\n⏳ <i>ទំនិញត្រូវបានកក់ទុករយៈពេល 15 នាទី។ សូមបន្តការទូទាត់តាម ABA PayWay ខាងក្រោម៖</i>',
    delivery_success: '🎉 <b>ការដឹកជញ្ជូនបានជោគជ័យ!</b>\n\nសូមអរគុណសម្រាប់ការទិញទំនិញនៅ <b>NIGHTMARE STORE</b>!\nលេខកុម្ម៉ង់៖ <code>{order_ref}</code>\nមុខទំនិញ៖ <b>{product_title}</b>\n\n<b>ព័ត៌មានសម្ងាត់ / កូដរបស់អ្នក៖</b>\n<pre>{credentials}</pre>\n\n⚠️ <i>សូមរក្សាទុកព័ត៌មាននេះដោយសុវត្ថិភាព។ កុំចែករំលែកវាជាមួយនរណាម្នាក់ឡើយ។</i>'
  }
};

export function t(lang = 'km', key) {
  const dictionary = messages[lang] || messages.en;
  return dictionary[key] || messages.en[key] || key;
}
