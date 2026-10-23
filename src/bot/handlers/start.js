import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getMainMenuKeyboard, getLanguageKeyboard, getPersistentReplyKeyboard } from '../keyboards.js';
import { isAdmin } from './admin.js';
import { t } from '../../utils/telegram.js';
import { supabase } from '../../config/supabase.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const BANNER_FILE = path.resolve(__dirname, '../../../public/images/nightmare-banner.png');

export async function handleStart(ctx) {
  const lang = ctx.state.lang || 'km';
  const text = t(lang, 'welcome');
  const hasBanner = fs.existsSync(BANNER_FILE);
  const adminUser = isAdmin(ctx.from?.id);

  // Guarantee native Telegram [Menu] button is active on bottom-left
  try {
    await ctx.setChatMenuButton({ type: 'commands' });
  } catch {}

  if (ctx.callbackQuery) {
    try {
      await ctx.answerCbQuery();
    } catch {}

    // If previous message was a category photo, switch media back to main banner
    if (hasBanner) {
      try {
        return await ctx.editMessageMedia({
          type: 'photo',
          media: { source: BANNER_FILE },
          caption: text,
          parse_mode: 'HTML'
        });
      } catch {}
    }

    try {
      return await ctx.editMessageCaption(text, {
        parse_mode: 'HTML',
        reply_markup: { inline_keyboard: [] }
      });
    } catch {
      try {
        return await ctx.editMessageText(text, {
          parse_mode: 'HTML',
          reply_markup: { inline_keyboard: [] }
        });
      } catch {
        // If message cannot be edited (e.g. from submenus that changed types)
        if (hasBanner) {
          return await ctx.replyWithPhoto({ source: BANNER_FILE }, {
            caption: text,
            parse_mode: 'HTML',
            ...getPersistentReplyKeyboard(lang, adminUser)
          });
        }
        return await ctx.reply(text, {
          parse_mode: 'HTML',
          ...getPersistentReplyKeyboard(lang, adminUser)
        });
      }
    }
  }

  // Send banner photo with welcome caption and bottom persistent system menu buttons
  if (hasBanner) {
    try {
      return await ctx.replyWithPhoto({ source: BANNER_FILE }, {
        caption: text,
        parse_mode: 'HTML',
        ...getPersistentReplyKeyboard(lang, adminUser)
      });
    } catch (err) {
      // fallback to regular text reply if photo fails
    }
  }

  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...getPersistentReplyKeyboard(lang, adminUser)
  });
}

export async function handleLanguageMenu(ctx) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const text = '🌐 <b>Choose your preferred language / សូមជ្រើសរើសភាសារបស់អ្នក៖</b>';
  const keyboard = getLanguageKeyboard();

  if (ctx.callbackQuery) {
    try {
      return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch {
      return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    }
  }

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

export async function handleSetLanguage(ctx, langCode) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const telegramId = ctx.from.id;

  await supabase
    .from('profiles')
    .update({ language_code: langCode, updated_at: new Date().toISOString() })
    .eq('telegram_id', telegramId);

  ctx.state.lang = langCode;
  const replyText = langCode === 'km' ? '✅ បានប្តូរភាសាទៅជាភាសាខ្មែរជោគជ័យ!' : '✅ Language changed to English successfully!';

  await ctx.reply(replyText);
  return handleStart(ctx);
}
