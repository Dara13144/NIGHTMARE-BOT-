import { Router } from 'express';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export function createWebhookRoutes(bot) {
  const router = Router();

  router.post('/telegram', async (req, res) => {
    // 1. Verify Telegram Webhook Secret Token
    const receivedSecret = req.headers['x-telegram-bot-api-secret-token'];
    if (env.TELEGRAM_WEBHOOK_SECRET && receivedSecret !== env.TELEGRAM_WEBHOOK_SECRET) {
      logger.warn({ receivedSecret }, 'Unauthorized Telegram webhook call rejected');
      return res.status(403).json({ error: 'Invalid secret token' });
    }

    try {
      await bot.handleUpdate(req.body, res);
      if (!res.headersSent) {
        res.status(200).send('OK');
      }
    } catch (err) {
      logger.error({ err }, 'Error handling Telegram webhook update');
      if (!res.headersSent) {
        res.status(500).json({ error: 'Webhook processing error' });
      }
    }
  });

  return router;
}
