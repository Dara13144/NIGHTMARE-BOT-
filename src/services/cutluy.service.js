import crypto from 'crypto';
import { renderSVG } from 'uqr';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';
import { KhqrService } from './khqr.service.js';

export class CutluyService {
  /**
   * Check if live CutLuy API key is configured
   */
  static isConfigured() {
    return Boolean(env.CUTLUY_API_KEY && env.CUTLUY_API_KEY.startsWith('ck_'));
  }

  /**
   * Create CutLuy KHQR payment session
   * @param {object} params { amount, referenceId, currency }
   */
  static async createPayment({ amount, referenceId, currency = 'USD' }) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'CutLuy API key is not configured'
      };
    }

    const payload = {
      amount: parseFloat(Number(amount).toFixed(2)),
      reference_id: String(referenceId),
      currency: currency.toUpperCase()
    };

    try {
      const response = await fetch(`${env.CUTLUY_BASE_URL}/v1/payments`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${env.CUTLUY_API_KEY}`,
          'Content-Type': 'application/json',
          'User-Agent': 'NightmareStore/1.0'
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(6000)
      });

      if (response.ok) {
        const payment = await response.json();
        logger.info({ referenceId, paymentId: payment.id, status: payment.status }, 'CutLuy payment created');
        const qrString = payment.qr_string;
        const qrPngUrl = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&data=${encodeURIComponent(qrString)}`;
        return {
          success: true,
          paymentId: payment.id,
          status: payment.status,
          amount: payment.amount,
          currency: payment.currency,
          referenceId: payment.reference_id,
          qrString,
          checkoutUrl: payment.checkout_url,
          qrSvgUrl: `https://cutluy.com/api/render/khqr/${encodeURIComponent(qrString)}.svg`,
          qrPngUrl,
          qrImageUrl: qrPngUrl,
          raw: payment
        };
      }

      const text = await response.text();
      logger.warn({ status: response.status, body: text.slice(0, 150) }, 'CutLuy API responded with non-200, activating compliant ABA KHQR engine');

      const fallbackUrl = `${env.APP_BASE_URL || ''}/payments/cutluy/checkout?ref=${referenceId}&amount=${payload.amount}`;
      const khqrData = KhqrService.buildKhqrString({
        amount: payload.amount,
        referenceId,
        merchantName: 'MAO DARA NADYTOPUP'
      });
      const localQrPngUrl = `${env.APP_BASE_URL || ''}/payments/qr/${referenceId}.png`;

      return {
        success: true,
        isFallback: true,
        paymentId: `cl_${referenceId}`,
        status: 'pending',
        amount: payload.amount,
        currency: 'USD',
        referenceId,
        checkoutUrl: fallbackUrl,
        qrString: khqrData,
        qrSvgUrl: localQrPngUrl,
        qrPngUrl: localQrPngUrl,
        qrImageUrl: localQrPngUrl
      };
    } catch (err) {
      logger.error({ err, referenceId }, 'Error calling CutLuy payment endpoint, activating local KHQR fallback');
      const fallbackUrl = `${env.APP_BASE_URL || ''}/payments/cutluy/checkout?ref=${referenceId}&amount=${payload.amount}`;
      const khqrData = KhqrService.buildKhqrString({
        amount: payload.amount,
        referenceId,
        merchantName: 'MAO DARA NADYTOPUP'
      });
      const localQrPngUrl = `${env.APP_BASE_URL || ''}/payments/qr/${referenceId}.png`;

      return {
        success: true,
        isFallback: true,
        paymentId: `cl_${referenceId}`,
        status: 'pending',
        amount: payload.amount,
        currency: 'USD',
        referenceId,
        checkoutUrl: fallbackUrl,
        qrString: khqrData,
        qrSvgUrl: localQrPngUrl,
        qrPngUrl: localQrPngUrl,
        qrImageUrl: localQrPngUrl
      };
    }
  }

  /**
   * Check status of a payment via CutLuy
   * @param {string} paymentId 
   */
  static async getPayment(paymentId) {
    if (!this.isConfigured() || paymentId.startsWith('cl_')) {
      return null;
    }

    try {
      const response = await fetch(`${env.CUTLUY_BASE_URL}/v1/payments/${paymentId}`, {
        headers: {
          Authorization: `Bearer ${env.CUTLUY_API_KEY}`,
          'User-Agent': 'NightmareStore/1.0'
        },
        signal: AbortSignal.timeout(5000)
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (err) {
      logger.error({ err, paymentId }, 'Error retrieving CutLuy payment');
      return null;
    }
  }

  /**
   * Render offline SVG QR code using uqr (with Level H error correction)
   * @param {string} qrString 
   */
  static renderSvgQr(qrString) {
    if (!qrString) return '';
    try {
      return renderSVG(qrString, { ecc: 'H' });
    } catch {
      return '';
    }
  }

  /**
   * Verify official CutLuy webhook signature
   * @param {string} signatureHeader 
   * @param {string|Buffer} rawBody 
   */
  static verifyWebhookSignature(signatureHeader, rawBody) {
    if (!signatureHeader) return false;

    try {
      const parts = Object.fromEntries(
        signatureHeader.split(',').map(p => {
          const idx = p.indexOf('=');
          return [p.slice(0, idx), p.slice(idx + 1)];
        })
      );

      if (!parts.t || !parts.v1) return false;

      const rawBodyStr = Buffer.isBuffer(rawBody) ? rawBody.toString('utf8') : String(rawBody);
      const expected = crypto
        .createHmac('sha256', env.CUTLUY_WEBHOOK_SECRET)
        .update(`${parts.t}.${rawBodyStr}`)
        .digest('hex');

      const fresh = Math.abs(Date.now() / 1000 - Number(parts.t)) < 300; // 5 min freshness
      const valid = fresh && crypto.timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));

      return Boolean(valid);
    } catch (err) {
      logger.error({ err }, 'CutLuy webhook signature verification error');
      return false;
    }
  }

  /**
   * Get CutLuy account usage & remaining balance
   */
  static async getUsage() {
    try {
      const res = await fetch(`${env.CUTLUY_BASE_URL}/v1/usage`, {
        headers: {
          Authorization: `Bearer ${env.CUTLUY_API_KEY}`,
          'User-Agent': 'NightmareStore/1.0'
        }
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }
}
