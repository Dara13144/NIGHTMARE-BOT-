import { describe, it, expect } from 'vitest';
import crypto from 'crypto';
import { CutluyService } from '../src/services/cutluy.service.js';
import { env } from '../src/config/env.js';

describe('CutLuy Bakong KHQR Gateway Integration', () => {
  it('detects live CutLuy API key is configured', () => {
    expect(CutluyService.isConfigured()).toBe(true);
  });

  it('verifies CutLuy webhook HMAC-SHA256 signature correctly', () => {
    const rawBody = JSON.stringify({
      id: 'evt-test-123',
      type: 'payment.completed',
      data: { payment: { reference_id: 'NM-TEST-001', amount: '15.00' } }
    });

    const timestamp = Math.floor(Date.now() / 1000);
    const expectedSig = crypto
      .createHmac('sha256', env.CUTLUY_WEBHOOK_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');

    const header = `t=${timestamp},v1=${expectedSig}`;

    const isValid = CutluyService.verifyWebhookSignature(header, rawBody);
    expect(isValid).toBe(true);
  });

  it('rejects CutLuy webhook signature if timestamp is expired (older than 5 min)', () => {
    const rawBody = '{"test":true}';
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 600; // 10 minutes ago
    const sig = crypto
      .createHmac('sha256', env.CUTLUY_WEBHOOK_SECRET)
      .update(`${expiredTimestamp}.${rawBody}`)
      .digest('hex');

    const header = `t=${expiredTimestamp},v1=${sig}`;
    const isValid = CutluyService.verifyWebhookSignature(header, rawBody);
    expect(isValid).toBe(false);
  });

  it('renders offline SVG QR code using uqr', () => {
    const qrString = '00020101021229330016cutluy_demo@bkrt010900000000052045999530384054041.505802KH63045F4B';
    const svg = CutluyService.renderSvgQr(qrString);

    expect(svg).toBeDefined();
    expect(svg).toContain('<svg');
    expect(svg).toContain('</svg>');
  });
});
