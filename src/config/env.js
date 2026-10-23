import dotenv from 'dotenv';
import { z } from 'zod';
import { logger } from '../utils/logger.js';

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(3000),
  APP_BASE_URL: z.string().url().default('http://localhost:5000'),
  FRONTEND_URL: z.string().url().default('http://localhost:5000'),
  BOT_TOKEN: z.string().min(10).default('123456789:AAFakeTokenForDevelopmentTesting'),
  TELEGRAM_WEBHOOK_SECRET: z.string().min(8).default('nightmare_webhook_secret_dev_32'),
  ADMIN_TELEGRAM_IDS: z.string().default(''),
  SUPABASE_URL: z.string().url().default('https://mock-project-id.supabase.co'),
  SUPABASE_ANON_KEY: z.string().default('mock-anon-key'),
  SUPABASE_SERVICE_ROLE_KEY: z.string().default('mock-service-role-key'),
  SESSION_SECRET: z.string().min(16).default('nightmare_secure_session_secret_123456789!'),
  ENCRYPTION_KEY: z.string().min(16).default('nightmare_encryption_key_32_bytes_long!!'),
  ABA_PAYWAY_MERCHANT_ID: z.string().default('ec438921'),
  ABA_PAYWAY_API_KEY: z.string().default('mock_aba_api_key'),
  ABA_PAYWAY_BASE_URL: z.string().url().default('https://checkout-sandbox.payway.com.kh'),
  ABA_PAYWAY_CALLBACK_SECRET: z.string().default('mock_aba_callback_secret'),
  CUTLUY_API_KEY: z.string().default('ck_live_F5oQzk9wSVbWyADKeCSUp175scKL1Obq'),
  CUTLUY_WEBHOOK_SECRET: z.string().default('cutluy_webhook_secret_default'),
  CUTLUY_BASE_URL: z.string().url().default('https://cutluy.com'),
  LOG_LEVEL: z.string().default('info')
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  logger.warn({ errors: parsed.error.format() }, 'Environment validation issues detected. Using safe fallbacks.');
}

export const env = parsed.success ? parsed.data : envSchema.parse({});
