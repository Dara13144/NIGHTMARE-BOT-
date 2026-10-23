import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import { doubleCsrf } from 'csrf-csrf';
import { env } from './config/env.js';
import { globalLimiter } from './middleware/rate-limit.js';
import { errorHandler } from './middleware/error-handler.js';
import { createWebhookRoutes } from './routes/webhook.routes.js';
import { paymentRoutes } from './routes/payment.routes.js';
import { productRoutes } from './routes/product.routes.js';
import { orderRoutes } from './routes/order.routes.js';
import { uploadRoutes } from './routes/upload.routes.js';
import { adminRoutes } from './routes/admin.routes.js';
import { logger } from './utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createApp(bot) {
  const app = express();

  // 1. Trust proxy for reverse proxy platforms (e.g. Render)
  app.set('trust proxy', 1);

  // 2. View Engine Setup (EJS)
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // 3. Static Files
  app.use(express.static(path.join(__dirname, '..', 'public')));

  // 4. Security Headers (Helmet configured for Telegram Mini App iframe embedding)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://telegram.org'],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.tailwindcss.com', 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
          connectSrc: ["'self'", 'https:', 'http:'],
          frameAncestors: ["'self'", 'https://web.telegram.org', 'https://*.telegram.org']
        }
      },
      crossOriginEmbedderPolicy: false,
      frameguard: false
    })
  );

  // 5. CORS
  app.use(cors({
    origin: true,
    credentials: true
  }));

  // 6. Global Rate Limiter
  app.use(globalLimiter);

  // 7. Request Body Parsing
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));
  app.use(cookieParser(env.SESSION_SECRET));

  // 8. Session Management
  app.use(
    session({
      name: 'nightmare_session',
      secret: env.SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        secure: env.NODE_ENV === 'production',
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000 // 24 hours
      }
    })
  );

  // 9. CSRF Protection for Web Forms
  const { generateToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => env.SESSION_SECRET,
    cookieName: 'nm_csrf',
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: env.NODE_ENV === 'production'
    },
    getTokenFromRequest: (req) => req.body?._csrf || req.headers['x-csrf-token']
  });

  // Provide CSRF token generator helper to views
  app.use((req, res, next) => {
    res.locals.csrfToken = generateToken(req, res);
    res.locals.currentUser = req.session?.adminUser || null;
    next();
  });

  // 10. Health Check Endpoint
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'UP',
      service: 'NIGHTMARE STORE',
      uptime: process.uptime(),
      timestamp: new Date().toISOString()
    });
  });

  // 11. Root Landing Page
  app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
  });

  // 12. Mount API and Web Routes
  if (bot) {
    app.use('/webhook', createWebhookRoutes(bot));
  }
  app.use('/payments', paymentRoutes);
  app.use('/webhooks/cutluy', paymentRoutes);

  // Direct root aliases for CutLuy Dashboard Configuration
  app.get('/thank-you', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect('/payments/thank-you' + (qs ? '?' + qs : ''));
  });
  app.get('/payment-failed', (req, res) => {
    const qs = new URLSearchParams(req.query).toString();
    res.redirect('/payments/payment-failed' + (qs ? '?' + qs : ''));
  });

  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);
  app.use('/api/upload', uploadRoutes);
  app.use('/admin', adminRoutes);

  // 13. Safe Error Handling
  app.use(errorHandler);

  return app;
}
