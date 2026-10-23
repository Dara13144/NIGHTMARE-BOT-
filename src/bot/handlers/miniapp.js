import { Markup } from 'telegraf';
import { env } from '../../config/env.js';

export async function handleMiniAppCommand(ctx) {
  const lang = ctx.state?.lang || 'km';
  const url = (env.FRONTEND_URL || env.APP_BASE_URL || 'http://localhost:3000').trim();
  const isKm = lang === 'km';

  const text = isKm
    ? `📱 <b>NIGHTMARE STORE — កម្មវិធី Telegram Mini App</b>\n\n` +
      `សូមស្វាគមន៍មកកាន់ Mini App ផ្លូវការ! អ្នកអាចមើលទំនិញទាំងអស់ និងស្កេនទូទាត់ ABA KHQR ភ្លាមៗនៅក្នុង Telegram ដោយមិនចាំបាច់ចេញពីកម្មវិធីឡើយ។\n\n` +
      `⚡ <b>លក្ខណៈពិសេស៖</b>\n` +
      `• កាតាឡុកផលិតផល Rockstar Games ទាំងអស់\n` +
      `• ស្កេនទូទាត់ ABA KHQR & Bakong ដោយស្វ័យប្រវត្តិ\n` +
      `• ទទួលបានកូដ និងគណនីភ្លាមៗក្នុងរយៈពេល ៥ វិនាទី\n` +
      `• ពិនិត្យទឹកប្រាក់កាបូបលុយផ្ទាល់ខ្លួនក្នុង Mini App`
    : `📱 <b>NIGHTMARE STORE — Telegram Mini App</b>\n\n` +
      `Welcome to our official Telegram Mini App! Browse the full visual Rockstar catalog, inspect stock, and checkout with seamless ABA KHQR directly inside Telegram.\n\n` +
      `⚡ <b>Key Features:</b>\n` +
      `• Interactive visual catalog & real-time inventory\n` +
      `• Instant ABA KHQR & Bakong automatic settlement\n` +
      `• Automated 5-second digital credential delivery\n` +
      `• Live in-app wallet balance tracking`;

  const btn = url.startsWith('https://')
    ? Markup.button.webApp(isKm ? '🚀 បើកដំណើរការ Mini App' : '🚀 Launch Mini App Store', url)
    : Markup.button.url(isKm ? '🌐 បើកដំណើរការ Web Store' : '🌐 Open Storefront Web', url);

  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...Markup.inlineKeyboard([
      [btn],
      [{ text: isKm ? '🏠 ត្រឡប់ទៅម៉ឺនុយដើម' : '🏠 Main Menu', callback_data: 'back_to_menu', style: 'success' }]
    ])
  });
}
