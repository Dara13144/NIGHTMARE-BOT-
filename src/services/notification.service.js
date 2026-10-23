import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';
import { env } from '../config/env.js';

let botInstance = null;

export class NotificationService {
  /**
   * Set the active Telegraf bot instance for notifications
   */
  static setBot(bot) {
    botInstance = bot;
  }

  /**
   * Send a Telegram message safely
   * @param {number|string} chatId 
   * @param {string} text 
   * @param {object} options 
   */
  static async sendTelegram(chatId, text, options = { parse_mode: 'HTML' }) {
    if (!botInstance) {
      logger.warn({ chatId }, 'Bot instance not initialized for notifications');
      return { success: false, error: 'Bot instance not ready' };
    }

    try {
      const result = await botInstance.telegram.sendMessage(chatId, text, options);
      return { success: true, messageId: result.message_id };
    } catch (err) {
      logger.error({ err, chatId }, 'Failed to send Telegram message');
      return { success: false, error: err.message };
    }
  }

  /**
   * Notify administrators about significant store events
   */
  static async notifyAdmins(text) {
    if (!env.ADMIN_TELEGRAM_IDS) return;

    const adminIds = env.ADMIN_TELEGRAM_IDS.split(',').map(s => s.trim()).filter(Boolean);
    for (const adminId of adminIds) {
      await this.sendTelegram(adminId, `🔔 <b>[NIGHTMARE ADMIN ALERT]</b>\n\n${text}`);
    }
  }
}
