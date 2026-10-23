import { supabase } from '../config/supabase.js';
import { decryptPayload } from '../utils/encryption.js';
import { NotificationService } from './notification.service.js';
import { logger } from '../utils/logger.js';
import { escapeHtml, messages } from '../utils/telegram.js';

export class DeliveryService {
  /**
   * Format Rockstar Activation Code Delivery Message
   */
  static formatCodeMessage(p, order) {
    const d = p.data || {};
    const codeVal = d.code || (typeof d === 'string' ? d : JSON.stringify(d));
    return `🎉 <b>DIGITAL DELIVERY SUCCESSFUL!</b> 🎮\n\n` +
      `Thank you for your purchase at <b>NIGHTMARE STORE</b>!\n` +
      `🆔 <b>Order Ref:</b> <code>${escapeHtml(order.order_number)}</code>\n` +
      `📦 <b>Product:</b> <b>${escapeHtml(p.title)}</b>\n\n` +
      `🔑 <b>Rockstar Activation Key:</b>\n` +
      `<code>${escapeHtml(codeVal)}</code>\n` +
      `<i>👆 (Tap the code above to copy it to your clipboard)</i>\n\n` +
      `📋 <b>How to Activate on Rockstar Games:</b>\n` +
      `1️⃣ Open <b>Rockstar Games Launcher</b> on PC\n` +
      `   <i>(or visit <a href="https://socialclub.rockstargames.com/activate">socialclub.rockstargames.com/activate</a>)</i>\n` +
      `2️⃣ Sign in to your Rockstar Games account\n` +
      `3️⃣ Click your <b>Profile Icon</b> in the top right corner\n` +
      `4️⃣ Select <b>Redeem Code</b>\n` +
      `5️⃣ Paste your activation key: <code>${escapeHtml(codeVal)}</code>\n` +
      `6️⃣ Click <b>Check</b> ➔ <b>Confirm</b> to permanently add the game to your library!\n\n` +
      `⚡ <i>Enjoy your game! If you need any assistance, tap Contact Support below.</i>`;
  }

  /**
   * Format Rockstar Account Delivery Message
   */
  static formatAccountMessage(p, order) {
    const d = p.data || {};
    const email = d.email || d.login || 'N/A';
    const password = d.password || 'N/A';
    const emailPassword = d.email_password || '';
    const recoveryInfo = d.recovery_info || '';
    const notes = d.notes || '';

    let msg = `🎉 <b>DIGITAL DELIVERY SUCCESSFUL!</b> 👤\n\n` +
      `Thank you for your purchase at <b>NIGHTMARE STORE</b>!\n` +
      `🆔 <b>Order Ref:</b> <code>${escapeHtml(order.order_number)}</code>\n` +
      `📦 <b>Product:</b> <b>${escapeHtml(p.title)}</b>\n\n` +
      `📧 <b>Social Club Email / Login:</b>\n` +
      `<code>${escapeHtml(email)}</code> <i>(Tap to copy)</i>\n\n` +
      `🔑 <b>Account Password:</b>\n` +
      `<code>${escapeHtml(password)}</code> <i>(Tap to copy)</i>\n\n`;

    if (emailPassword) {
      msg += `📬 <b>Linked Email Password:</b>\n` +
        `<code>${escapeHtml(emailPassword)}</code> <i>(Tap to copy)</i>\n\n`;
    }

    if (recoveryInfo) {
      msg += `🛡️ <b>Recovery Info / Warranty:</b>\n` +
        `<code>${escapeHtml(recoveryInfo)}</code>\n\n`;
    }

    if (notes) {
      msg += `📝 <b>Account Specifications:</b>\n` +
        `${escapeHtml(notes)}\n\n`;
    }

    msg += `🔒 <b>Crucial Account Security Steps:</b>\n` +
      `1️⃣ Sign in at <a href="https://socialclub.rockstargames.com">socialclub.rockstargames.com</a>\n` +
      `2️⃣ Go to <b>Settings ➔ Profile</b> and update the email to your personal email\n` +
      `3️⃣ Change the password immediately to your own strong password\n` +
      `4️⃣ Enable <b>2-Step Verification (2FA)</b> for 100% account security\n` +
      `5️⃣ Sign into Rockstar Games Launcher & play GTA V, GTA Online, and FiveM!\n\n` +
      `⚠️ <i>Please change all credentials immediately upon receipt. NIGHTMARE STORE is not responsible for accounts left unmanaged.</i>`;

    return msg;
  }

  /**
   * Get Delivery Navigation Keyboard
   */
  static getDeliveryKeyboard() {
    return {
      reply_markup: {
        inline_keyboard: [
          [{ text: '🛒 Browse More Games', callback_data: 'menu_products' }],
          [
            { text: '📜 My Orders', callback_data: 'menu_orders' },
            { text: '💬 Contact Support', callback_data: 'menu_support' }
          ],
          [{ text: '🏠 Main Menu', callback_data: 'back_to_menu' }]
        ]
      }
    };
  }

  /**
   * Process automatic digital delivery for a paid order
   * @param {string} orderId 
   */
  static async deliverOrder(orderId) {
    // 1. Fetch order details
    const { data: order, error: orderErr } = await supabase
      .from('orders')
      .select(`
        *,
        order_items (*)
      `)
      .eq('id', orderId)
      .single();

    if (orderErr || !order) {
      logger.error({ orderId, orderErr }, 'Order not found for delivery');
      return { success: false, error: 'Order not found' };
    }

    // Already delivered check
    if (order.status === 'delivered') {
      logger.info({ orderId }, 'Order already delivered');
      return { success: true, alreadyDelivered: true };
    }

    if (order.status !== 'paid' && order.status !== 'delivery_failed') {
      logger.warn({ orderId, status: order.status }, 'Cannot deliver order that is not paid or delivery_failed');
      return { success: false, error: `Invalid order status: ${order.status}` };
    }

    const items = order.order_items || [];
    if (items.length === 0) {
      logger.error({ orderId }, 'No order items found for order');
      return { success: false, error: 'No items in order' };
    }

    const deliveryPayloads = [];

    // 2. Fetch encrypted inventory records and decrypt strictly in backend
    for (const item of items) {
      let encryptedPayload = null;
      let title = item.product_title;

      const isAccount = item.inventory_type === 'account' || item.inventory_type === 'rockstar_account';

      if (isAccount) {
        const { data: acc } = await supabase
          .from('account_inventory')
          .select('encrypted_payload')
          .eq('id', item.inventory_item_id)
          .maybeSingle();
        encryptedPayload = acc?.encrypted_payload;
      } else {
        const { data: code } = await supabase
          .from('code_inventory')
          .select('encrypted_payload')
          .eq('id', item.inventory_item_id)
          .maybeSingle();
        encryptedPayload = code?.encrypted_payload;
      }

      // Safe fallback check across both tables if necessary
      if (!encryptedPayload) {
        const fallbackTable = isAccount ? 'code_inventory' : 'account_inventory';
        const { data: fb } = await supabase
          .from(fallbackTable)
          .select('encrypted_payload')
          .eq('id', item.inventory_item_id)
          .maybeSingle();
        encryptedPayload = fb?.encrypted_payload;
      }

      if (!encryptedPayload) {
        logger.error({ itemId: item.inventory_item_id, orderId }, 'Inventory payload missing for delivery');
        continue;
      }

      try {
        let decrypted = decryptPayload(encryptedPayload);
        if (typeof decrypted === 'string') {
          try {
            decrypted = JSON.parse(decrypted);
          } catch {
            decrypted = { code: decrypted };
          }
        }
        deliveryPayloads.push({
          title,
          type: isAccount ? 'account' : 'code',
          itemId: item.inventory_item_id,
          data: decrypted
        });
      } catch (decErr) {
        logger.error({ decErr, itemId: item.inventory_item_id }, 'Failed to decrypt delivery payload');
      }
    }

    if (deliveryPayloads.length === 0) {
      await supabase
        .from('orders')
        .update({
          status: 'delivery_failed',
          delivery_notes: 'Failed to decrypt credentials',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      return { success: false, error: 'Failed to retrieve delivery credentials' };
    }

    // 3. Mark inventory records permanently as sold
    for (const item of items) {
      const isAccount = item.inventory_type === 'account' || item.inventory_type === 'rockstar_account';
      const table = isAccount ? 'account_inventory' : 'code_inventory';
      await supabase
        .from(table)
        .update({
          status: 'sold',
          sold_at: new Date().toISOString(),
          reservation_expires_at: null,
          updated_at: new Date().toISOString()
        })
        .eq('id', item.inventory_item_id);
    }

    // 4. Send dedicated delivery messages to customer's private Telegram chat
    let lastMessageId = null;
    const keyboard = this.getDeliveryKeyboard();

    for (let i = 0; i < deliveryPayloads.length; i++) {
      const p = deliveryPayloads[i];
      const isLast = i === deliveryPayloads.length - 1;

      const messageText = p.type === 'account'
        ? this.formatAccountMessage(p, order)
        : this.formatCodeMessage(p, order);

      const sendOptions = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...(isLast ? keyboard : {})
      };

      const sendResult = await NotificationService.sendTelegram(order.telegram_id, messageText, sendOptions);

      if (sendResult.success) {
        lastMessageId = sendResult.messageId;
      } else {
        logger.error({ orderId, error: sendResult.error }, 'Failed to send delivery message to Telegram chat');
      }
    }

    if (lastMessageId) {
      // 5. Update order to delivered
      await supabase
        .from('orders')
        .update({
          status: 'delivered',
          delivered_at: new Date().toISOString(),
          delivery_chat_id: order.telegram_id,
          delivery_message_id: lastMessageId,
          delivery_notes: 'Successfully delivered to customer via Telegram bot',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      logger.info({ orderId, orderNumber: order.order_number }, 'Order successfully delivered to customer');

      // 6. Notify admin (without leaking sensitive credentials)
      await NotificationService.notifyAdmins(
        `📦 <b>AUTOMATIC ORDER DELIVERED!</b>\n\n` +
        `Order Ref: <code>${escapeHtml(order.order_number)}</code>\n` +
        `Customer Telegram ID: <code>${order.telegram_id}</code>\n` +
        `Delivered Items: <b>${deliveryPayloads.length}</b>`
      );

      return { success: true };
    } else {
      // 7. Record delivery failure safely
      await supabase
        .from('orders')
        .update({
          status: 'delivery_failed',
          delivery_notes: 'Telegram bot delivery transmission failed',
          updated_at: new Date().toISOString()
        })
        .eq('id', orderId);

      logger.error({ orderId }, 'Order delivery to Telegram chat failed completely');

      await NotificationService.notifyAdmins(
        `⚠️ <b>DELIVERY FAILED</b> for order <code>${escapeHtml(order.order_number)}</code>.\nCustomer ID: ${order.telegram_id}\nManual retry or customer contact required.`
      );

      return { success: false, error: 'Telegram message sending failed' };
    }
  }

  /**
   * Retrieve decrypted delivery messages for customer's order history lookup
   */
  static async getOrderDeliveryMessages(orderId, telegramId) {
    const { data: order } = await supabase
      .from('orders')
      .select('*, order_items (*)')
      .eq('id', orderId)
      .single();

    if (!order || Number(order.telegram_id) !== Number(telegramId)) {
      return null;
    }

    const messages = [];
    const items = order.order_items || [];

    for (const item of items) {
      const isAccount = item.inventory_type === 'account' || item.inventory_type === 'rockstar_account';
      const table = isAccount ? 'account_inventory' : 'code_inventory';

      let { data: inv } = await supabase
        .from(table)
        .select('encrypted_payload')
        .eq('id', item.inventory_item_id)
        .maybeSingle();

      if (!inv?.encrypted_payload) {
        const otherTable = isAccount ? 'code_inventory' : 'account_inventory';
        const { data: fallback } = await supabase
          .from(otherTable)
          .select('encrypted_payload')
          .eq('id', item.inventory_item_id)
          .maybeSingle();
        inv = fallback;
      }

      if (inv?.encrypted_payload) {
        try {
          let decrypted = decryptPayload(inv.encrypted_payload);
          if (typeof decrypted === 'string') {
            try { decrypted = JSON.parse(decrypted); } catch { decrypted = { code: decrypted }; }
          }
          const p = {
            title: item.product_title,
            type: isAccount ? 'account' : 'code',
            data: decrypted
          };
          const text = isAccount ? this.formatAccountMessage(p, order) : this.formatCodeMessage(p, order);
          messages.push(text);
        } catch (err) {
          logger.error({ err, itemId: item.inventory_item_id }, 'Error decrypting past order item');
        }
      }
    }

    return messages;
  }

  /**
   * Retry delivery for an order that experienced a delivery failure
   */
  static async retryDelivery(orderId) {
    logger.info({ orderId }, 'Retrying delivery for order');
    return this.deliverOrder(orderId);
  }
}
