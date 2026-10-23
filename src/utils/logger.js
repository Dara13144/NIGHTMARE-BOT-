import pino from 'pino';

const isDev = process.env.NODE_ENV !== 'production';

export const logger = pino({
  level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'password',
      'password_hash',
      'encrypted_payload',
      'api_key',
      'secret',
      'token',
      'code',
      'credentials',
      'ABA_PAYWAY_API_KEY',
      'BOT_TOKEN',
      'SUPABASE_SERVICE_ROLE_KEY'
    ],
    censor: '[REDACTED]'
  },
  transport: isDev
    ? {
        target: 'pino-pretty',
        options: {
          colorize: true,
          translateTime: 'SYS:standard',
          ignore: 'pid,hostname'
        }
      }
    : undefined
});
