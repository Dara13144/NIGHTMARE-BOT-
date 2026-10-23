import { createApp } from './app.js';
import { createBot } from './bot/bot.js';
import { env } from './config/env.js';
import { InventoryService } from './services/inventory.service.js';
import { AutoPaymentService } from './services/auto-payment.service.js';
import { logger } from './utils/logger.js';

async function bootstrap() {
  logger.info({ env: env.NODE_ENV, port: env.PORT }, 'Starting NIGHTMARE STORE application...');

  // 1. Initialize Telegram Bot
  const bot = createBot();

  // 2. Initialize Express Application
  const app = createApp(bot);

  // 3. Start HTTP Server
  const server = app.listen(env.PORT, async () => {
    logger.info(`🚀 NIGHTMARE STORE Server running at http://localhost:${env.PORT}`);

    // Setup Bot Launch (Webhook in Production, Polling in Local Development)
    const isProd = env.NODE_ENV === 'production' || (env.APP_BASE_URL && env.APP_BASE_URL.startsWith('https://'));

    if (isProd) {
      try {
        const webhookUrl = `${env.APP_BASE_URL}/webhook/telegram`;
        await bot.telegram.setWebhook(webhookUrl, {
          secret_token: env.TELEGRAM_WEBHOOK_SECRET
        });
        logger.info({ webhookUrl }, 'Telegram webhook registered successfully');
      } catch (err) {
        logger.error({ err: err.message }, 'Failed to set Telegram webhook in production mode');
      }
    } else {
      // Local development polling
      try {
        await bot.telegram.deleteWebhook({ drop_pending_updates: true });
        bot.launch().catch(err => {
          logger.warn({ err: err.message }, 'Bot polling error. Webhook handler remains active.');
        });
        logger.info('🤖 NIGHTMARE STORE Telegram Bot is LIVE and listening for updates');
      } catch (err) {
        logger.warn({ err: err.message }, 'Telegram bot initialization skipped (development mock mode)');
      }
    }
  });

  server.on('error', (err) => {
    logger.fatal({ err: err.message, code: err.code, port: env.PORT }, 'Server listen error. Check if port is already in use.');
    process.exit(1);
  });

  // 4. Background Workers:
  // A. Auto-Payment System: Real-time bank confirmation & automatic instant digital delivery
  AutoPaymentService.start(4000);

  // B. Safely release expired inventory reservations every 2 minutes
  const cleanupInterval = setInterval(async () => {
    try {
      const result = await InventoryService.releaseExpiredReservations();
      if (result.expired_orders > 0 || result.released_accounts > 0 || result.released_codes > 0) {
        logger.info({ result }, 'Expired inventory reservations safely released');
      }
    } catch (err) {
      // Avoid spamming logs if DB is not connected yet
    }
  }, 2 * 60 * 1000);

  // 5. Graceful Shutdown
  const shutdown = (signal) => {
    logger.info({ signal }, 'Graceful shutdown initiated');
    AutoPaymentService.stop();
    clearInterval(cleanupInterval);
    server.close(() => {
      bot.stop(signal);
      logger.info('Server and bot processes closed successfully');
      process.exit(0);
    });

    // Force exit if not cleanly closed in 10s
    setTimeout(() => {
      logger.error('Forced shutdown after timeout');
      process.exit(1);
    }, 10000);
  };

  process.once('SIGINT', () => shutdown('SIGINT'));
  process.once('SIGTERM', () => shutdown('SIGTERM'));
}

bootstrap().catch(err => {
  logger.fatal({ err }, 'Application failed to start');
  process.exit(1);
});
