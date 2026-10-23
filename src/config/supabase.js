import { createClient } from '@supabase/supabase-js';
import { env } from './env.js';
import { localDatabase } from './local-store.js';
import { logger } from '../utils/logger.js';

let client = null;

const isMock = !env.SUPABASE_URL ||
               env.SUPABASE_URL.includes('mock') ||
               !env.SUPABASE_SERVICE_ROLE_KEY ||
               env.SUPABASE_SERVICE_ROLE_KEY.includes('mock');

if (!isMock) {
  try {
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false
      }
    });
    logger.info({ url: env.SUPABASE_URL }, 'Connected to live Supabase PostgreSQL database');
  } catch (err) {
    logger.warn({ err: err.message }, 'Live Supabase initialization failed, falling back to local database store');
    client = localDatabase;
  }
} else {
  logger.info('Using high-performance local database store for NIGHTMARE STORE');
  client = localDatabase;
}

export const supabase = client;
