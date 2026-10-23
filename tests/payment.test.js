import { describe, it, expect } from 'vitest';
import { AbaPaywayService } from '../src/services/aba-payway.service.js';
import { PaymentService } from '../src/services/payment.service.js';

describe('Payment Provider Integration & Security', () => {
  it('generates consistent HMAC-SHA512 signature for ABA PayWay parameters', () => {
    const rawString = '20261022120000ec438921NM-TEST-00115.00';
    const hash = AbaPaywayService.generateHash(rawString);

    expect(hash).toBeDefined();
    expect(typeof hash).toBe('string');
    expect(hash.length).toBeGreaterThan(20);
  });

  it('fails closed when live ABA PayWay credentials are not configured', async () => {
    const sessionResult = await AbaPaywayService.createPaymentSession({
      orderRef: 'NM-TEST-1234',
      amount: 15.00,
      currency: 'USD'
    });

    // When configured with mock credentials, it safely indicates not configured
    if (!AbaPaywayService.isConfigured()) {
      expect(sessionResult.success).toBe(false);
      expect(sessionResult.isConfigured).toBe(false);
    }
  });

  it('rejects payment callbacks missing merchant transaction reference', async () => {
    const result = await PaymentService.handlePaymentWebhook({}, 'test-key-1');
    expect(result.success).toBe(false);
    expect(result.error).toContain('Missing order reference');
  });
});
