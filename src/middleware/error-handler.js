import { logger } from '../utils/logger.js';

export function errorHandler(err, req, res, next) {
  logger.error({
    err: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip
  }, 'Unhandled request error');

  const statusCode = err.status || err.statusCode || 500;
  const message = statusCode === 500 && process.env.NODE_ENV === 'production'
    ? 'Internal server error. Please try again later.'
    : err.message || 'An error occurred';

  if (req.xhr || req.headers.accept?.includes('json')) {
    return res.status(statusCode).json({ error: message });
  }

  return res.status(statusCode).send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Error - NIGHTMARE STORE</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-black text-gray-200 min-h-screen flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-neutral-900 border border-red-900 rounded-lg p-6 shadow-2xl text-center">
        <h1 class="text-3xl font-bold text-red-500 mb-2">Error ${statusCode}</h1>
        <p class="text-gray-400 mb-6">${message}</p>
        <a href="/admin" class="inline-block bg-red-700 hover:bg-red-800 text-white font-semibold px-4 py-2 rounded transition">
          Return to Dashboard
        </a>
      </div>
    </body>
    </html>
  `);
}
