import { Telegraf } from 'telegraf';
import { env } from '../src/config/env.js';
import { logger } from '../src/utils/logger.js';

const webhookUrl = process.argv[2] || `${env.APP_BASE_URL}/webhook/telegram`;

async function configureWebhook() {
  if (!env.BOT_TOKEN || env.BOT_TOKEN.includes('FakeToken')) {
    logger.error('BOT_TOKEN is not configured in .env file');
    process.exit(1);
  }

  const bot = new Telegraf(env.BOT_TOKEN);

  if (process.argv[2] === 'delete') {
    logger.info('Deleting Telegram Webhook...');
    await bot.telegram.deleteWebhook({ drop_pending_updates: true });
    logger.info('Webhook deleted successfully. Bot is ready for polling.');
    process.exit(0);
  }

  logger.info({ webhookUrl }, 'Registering Telegram Webhook with secret token...');
  await bot.telegram.setWebhook(webhookUrl, {
    secret_token: env.TELEGRAM_WEBHOOK_SECRET,
    drop_pending_updates: true
  });

  const webhookInfo = await bot.telegram.getWebhookInfo();
  logger.info({ webhookInfo }, 'Webhook registered successfully!');
  process.exit(0);
}

configureWebhook().catch(err => {
  logger.error({ err: err.message }, 'Failed to configure webhook');
  process.exit(1);
});
