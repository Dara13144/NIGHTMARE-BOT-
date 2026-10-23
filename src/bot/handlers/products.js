import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { ProductService } from '../../services/product.service.js';
import { getProductListKeyboard, getProductDetailKeyboard } from '../keyboards.js';
import { isAdmin } from './admin.js';
import { escapeHtml, t } from '../../utils/telegram.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CODES_BANNER = path.resolve(__dirname, '../../../public/images/rockstar-codes-banner.jpg');
const ACCOUNTS_BANNER = path.resolve(__dirname, '../../../public/images/rockstar-accounts-banner.jpg');
const DEFAULT_BANNER = path.resolve(__dirname, '../../../public/images/nightmare-banner.png');

export async function handleProducts(ctx, type = 'all', page = 1) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }

  const lang = ctx.state.lang || 'km';
  const filter = { is_active: true };
  if (type === 'accounts') filter.type = 'rockstar_account';
  if (type === 'codes') filter.type = 'rockstar_code';

  const products = await ProductService.getProducts(filter);

  if (products.length === 0) {
    const emptyText = `🎮 <b>NIGHTMARE STORE CATALOG</b>\n\n${t(lang, 'no_stock')}`;
    return ctx.reply(emptyText, { parse_mode: 'HTML' });
  }

  const titleHeader = type === 'accounts'
    ? '👤 <b>ROCKSTAR ACCOUNT PRODUCTS</b>'
    : type === 'codes'
      ? '🎮 <b>ROCKSTAR ACTIVATION CODES</b>'
      : '🛒 <b>ALL ROCKSTAR PRODUCTS</b>';

  const text = `${titleHeader}\n\nSelect a product below to view specifications, live stock, and purchase:`;
  const keyboard = getProductListKeyboard(products, type, page, 5);

  let bannerFile = null;
  if (type === 'codes' && fs.existsSync(CODES_BANNER)) {
    bannerFile = CODES_BANNER;
  } else if (type === 'accounts' && fs.existsSync(ACCOUNTS_BANNER)) {
    bannerFile = ACCOUNTS_BANNER;
  } else if (type === 'all' && fs.existsSync(DEFAULT_BANNER)) {
    bannerFile = DEFAULT_BANNER;
  }

  if (bannerFile) {
    if (ctx.callbackQuery) {
      try {
        return await ctx.editMessageMedia(
          {
            type: 'photo',
            media: { source: bannerFile },
            caption: text,
            parse_mode: 'HTML'
          },
          keyboard
        );
      } catch (mediaErr) {
        try {
          return await ctx.editMessageCaption(text, {
            parse_mode: 'HTML',
            ...keyboard
          });
        } catch (captionErr) {
          try {
            await ctx.deleteMessage();
          } catch {}
          return await ctx.replyWithPhoto(
            { source: bannerFile },
            {
              caption: text,
              parse_mode: 'HTML',
              ...keyboard
            }
          );
        }
      }
    }

    try {
      return await ctx.replyWithPhoto(
        { source: bannerFile },
        {
          caption: text,
          parse_mode: 'HTML',
          ...keyboard
        }
      );
    } catch (err) {
      // Fallback to text reply below
    }
  }

  if (ctx.callbackQuery) {
    try {
      return await ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
    } catch {
      return await ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
    }
  }

  return ctx.reply(text, { parse_mode: 'HTML', ...keyboard });
}

export async function handleViewProduct(ctx, productId) {
  if (ctx.callbackQuery) {
    try { await ctx.answerCbQuery(); } catch {}
  }
  const lang = ctx.state.lang || 'km';

  const product = await ProductService.getProductById(productId);
  if (!product) {
    return ctx.reply('❌ Product not found or has been removed.');
  }

  const featuresList = (product.features || []).map(f => `• ${escapeHtml(f)}`).join('\n') || '• Official authorized license';
  const stockText = product.stock > 0
    ? `✅ <b>In Stock:</b> ${product.stock} units available`
    : `❌ <b>Out of Stock</b> (Check back soon)`;

  const caption = `🎮 <b>${escapeHtml(product.title)}</b>\n\n` +
    `💰 <b>Price:</b> $${product.price} ${escapeHtml(product.currency || 'USD')}\n` +
    `💻 <b>Platform:</b> ${escapeHtml(product.platform || 'PC')}\n` +
    `🌍 <b>Region:</b> ${escapeHtml(product.region || 'Global')}\n` +
    `📦 <b>Status:</b> ${stockText}\n\n` +
    `📝 <b>Description:</b>\n${escapeHtml(product.description || 'NIGHTMARE STORE Authorized Digital Item')}\n\n` +
    `✨ <b>Features:</b>\n${featuresList}\n\n` +
    (product.limitations ? `⚠️ <i>Note: ${escapeHtml(product.limitations)}</i>\n` : '');

  const adminUser = isAdmin(ctx.from?.id);
  const keyboard = getProductDetailKeyboard(product.id, product.stock > 0, lang, adminUser);

  // Send photo if valid external image URL or local category banner, otherwise fallback to text
  let photoSource = null;
  if (product.image_url && product.image_url.startsWith('http')) {
    photoSource = product.image_url;
  } else if (product.type === 'rockstar_code' && fs.existsSync(CODES_BANNER)) {
    photoSource = { source: CODES_BANNER };
  } else if (product.type === 'rockstar_account' && fs.existsSync(ACCOUNTS_BANNER)) {
    photoSource = { source: ACCOUNTS_BANNER };
  }

  if (photoSource) {
    try {
      return await ctx.replyWithPhoto(photoSource, {
        caption,
        parse_mode: 'HTML',
        ...keyboard
      });
    } catch {
      // Fallback if image load fails
      return ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
    }
  }

  return ctx.reply(caption, { parse_mode: 'HTML', ...keyboard });
}

export async function handleStockStatus(ctx) {
  if (ctx.callbackQuery) await ctx.answerCbQuery();
  const lang = ctx.state.lang || 'km';

  const products = await ProductService.getProducts({ is_active: true });

  let text = t(lang, 'stock_status_title') + '\n';
  if (products.length === 0) {
    text += t(lang, 'no_stock');
  } else {
    for (const p of products) {
      const typeLabel = p.type === 'rockstar_account' ? '👤 Account' : '🎮 Code';
      const indicator = p.stock > 0 ? `🟢 ${p.stock} available` : '🔴 Out of Stock';
      text += `<b>${escapeHtml(p.title)}</b>\nType: ${typeLabel} | Price: $${p.price}\nStock: ${indicator}\n\n`;
    }
  }

  return ctx.reply(text, {
    parse_mode: 'HTML',
    ...getProductListKeyboard(products, 'all', 1, 5)
  });
}
