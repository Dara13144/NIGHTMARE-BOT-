import crypto from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../utils/logger.js';

export class AbaPaywayService {
  /**
   * Check if live merchant credentials are configured
   */
  static isConfigured() {
    return Boolean(
      env.ABA_PAYWAY_MERCHANT_ID &&
      env.ABA_PAYWAY_API_KEY &&
      !env.ABA_PAYWAY_API_KEY.includes('mock')
    );
  }

  /**
   * Generate official PayWay HMAC-SHA512 signature
   * @param {string} rawString 
   * @returns {string} base64 encoded signature
   */
  static generateHash(rawString) {
    return crypto
      .createHmac('sha512', env.ABA_PAYWAY_API_KEY)
      .update(rawString)
      .digest('base64');
  }

  /**
   * Format current time as YYYYMMDDHHmmss for PayWay
   */
  static getReqTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return (
      d.getFullYear() +
      pad(d.getMonth() + 1) +
      pad(d.getDate()) +
      pad(d.getHours()) +
      pad(d.getMinutes()) +
      pad(d.getSeconds())
    );
  }

  /**
   * Create an official ABA PayWay Checkout Session
   * @param {object} params { orderRef, amount, currency, items, returnUrl }
   */
  static async createPaymentSession({ orderRef, amount, currency = 'USD', items = [], returnUrl }) {
    if (!this.isConfigured()) {
      logger.warn({ orderRef }, 'ABA PayWay merchant credentials not configured. Fails closed for security.');
      return {
        success: false,
        isConfigured: false,
        error: 'ABA PayWay merchant account is pending configuration. Please contact admin.'
      };
    }

    const reqTime = this.getReqTime();
    const formattedAmount = Number(amount).toFixed(2);
    const merchantId = env.ABA_PAYWAY_MERCHANT_ID;
    const base64Items = Buffer.from(JSON.stringify(items)).toString('base64');
    const returnUrlParam = returnUrl || `${env.APP_BASE_URL}/payments/callback?order_ref=${orderRef}`;

    // Standard ABA PayWay hash string
    const hashString = `${reqTime}${merchantId}${orderRef}${formattedAmount}${base64Items}${returnUrlParam}`;
    const hash = this.generateHash(hashString);

    const payload = {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: orderRef,
      amount: formattedAmount,
      items: base64Items,
      hash,
      return_url: returnUrlParam,
      currency: currency.toUpperCase(),
      type: 'purchase',
      payment_option: 'abapay_khqr' // Focus on ABA Pay & KHQR
    };

    try {
      const response = await fetch(`${env.ABA_PAYWAY_BASE_URL}/api/payment-gateway/v1/payments/purchase`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      logger.info({ orderRef, status: result.status }, 'ABA PayWay purchase API response received');

      if (result.status === 0 || result.status === '0') {
        return {
          success: true,
          isConfigured: true,
          checkoutUrl: result.payment_url || result.checkout_url,
          qrString: result.qr_string || result.abapay_deeplink,
          qrImageUrl: result.qr_image || null,
          raw: result
        };
      }

      return {
        success: false,
        isConfigured: true,
        error: result.description || 'Failed to initialize ABA PayWay session',
        raw: result
      };
    } catch (err) {
      logger.error({ err, orderRef }, 'Network error calling ABA PayWay purchase API');
      return {
        success: false,
        isConfigured: true,
        error: `Payment gateway unreachable: ${err.message}`
      };
    }
  }

  /**
   * Check official transaction status directly on ABA PayWay server
   * @param {string} orderRef 
   */
  static async checkTransaction(orderRef) {
    if (!this.isConfigured()) {
      return {
        success: false,
        isConfigured: false,
        isPaid: false,
        error: 'ABA PayWay credentials not configured'
      };
    }

    const reqTime = this.getReqTime();
    const merchantId = env.ABA_PAYWAY_MERCHANT_ID;
    const hashString = `${reqTime}${merchantId}${orderRef}`;
    const hash = this.generateHash(hashString);

    const payload = {
      req_time: reqTime,
      merchant_id: merchantId,
      tran_id: orderRef,
      hash
    };

    try {
      const response = await fetch(`${env.ABA_PAYWAY_BASE_URL}/api/payment-gateway/v1/payments/check-transaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const result = await response.json();
      logger.info({ orderRef, status: result.status, payment_status: result.payment_status }, 'ABA PayWay check-transaction result');

      // Status 0 and payment_status APPROVED or SUCCESS indicates verified payment
      const isPaid = (result.status === 0 || result.status === '0') &&
                     (result.payment_status === 'APPROVED' || result.payment_status === 'SUCCESS' || result.payment_status === 'PAID');

      return {
        success: true,
        isConfigured: true,
        isPaid,
        transactionId: result.apv || result.transaction_id || null,
        amount: result.total_amount || result.amount || null,
        currency: result.currency || 'USD',
        paymentMethod: result.payment_type || 'ABA PayWay',
        raw: result
      };
    } catch (err) {
      logger.error({ err, orderRef }, 'Error verifying transaction with ABA PayWay');
      return {
        success: false,
        isConfigured: true,
        isPaid: false,
        error: err.message
      };
    }
  }
}
