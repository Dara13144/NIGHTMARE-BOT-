import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createBot } from '../src/bot/bot.js';

describe('Admin Web Server & API Security', () => {
  const bot = createBot();
  const app = createApp(bot);

  it('GET /health returns 200 OK and UP status', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('UP');
    expect(res.body.service).toBe('NIGHTMARE STORE');
  });

  it('protects admin routes by redirecting unauthenticated requests to login', async () => {
    const res = await request(app).get('/admin/products');
    expect(res.status).toBe(302);
    expect(res.header.location).toBe('/admin/login');
  });

  it('rejects Telegram webhook requests with invalid or missing secret token header', async () => {
    const res = await request(app)
      .post('/webhook/telegram')
      .send({ update_id: 12345 });

    expect(res.status).toBe(403);
    expect(res.body.error).toContain('Invalid secret token');
  });
});
