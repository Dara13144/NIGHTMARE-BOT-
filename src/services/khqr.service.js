import { renderSVG } from 'uqr';
import { Resvg } from '@resvg/resvg-js';
import { logger } from '../utils/logger.js';

/**
 * Calculates standard EMVCo CRC-16 (CCITT-FALSE) checksum
 * Polynomial: 0x1021, Initial: 0xFFFF
 */
export function calculateEmvcoCrc16(str) {
  let crc = 0xFFFF;
  for (let i = 0; i < str.length; i++) {
    crc ^= (str.charCodeAt(i) << 8);
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) {
        crc = ((crc << 1) ^ 0x1021) & 0xFFFF;
      } else {
        crc = (crc << 1) & 0xFFFF;
      }
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

/**
 * Format an EMVCo TLV (Tag-Length-Value) element
 */
function formatTlv(tag, value) {
  const strVal = String(value ?? '');
  const len = String(strVal.length).padStart(2, '0');
  return `${tag}${len}${strVal}`;
}

export class KhqrService {
  /**
   * Build a compliant Bakong / ABA KHQR EMVCo payload string
   */
  static buildKhqrString({
    amount,
    referenceId,
    merchantName = 'MAO DARA NADYTOPUP',
    merchantCity = 'PHNOM PENH',
    currency = 'USD'
  }) {
    const formattedAmount = Number(amount).toFixed(2);
    const currencyCode = currency === 'KHR' ? '116' : '840';

    // Tag 30: Merchant Account Information (ABA Bank)
    const tag00 = formatTlv('00', 'abaakhppxxx@abaa');
    const tag01 = formatTlv('01', '126091623292571');
    const tag02 = formatTlv('02', 'ABA Bank');
    const tag30 = formatTlv('30', `${tag00}${tag01}${tag02}`);

    // Tag 62: Additional Data Template
    const sub01 = formatTlv('01', String(referenceId)); // Bill Number / Ref
    const sub03 = formatTlv('03', 'NIGHTMARE_STORE');  // Store Label
    const tag62 = formatTlv('62', `${sub01}${sub03}`);

    const payloadWithoutCrc =
      formatTlv('00', '01') +             // Payload Format Indicator
      formatTlv('01', '12') +             // Point of Initiation (12 = Dynamic)
      tag30 +                             // Merchant Account Info
      formatTlv('52', '7832') +           // Merchant Category Code (Digital Goods / Entertainment)
      formatTlv('53', currencyCode) +     // Currency (840 = USD)
      formatTlv('54', formattedAmount) +  // Amount
      formatTlv('58', 'KH') +             // Country
      formatTlv('59', merchantName) +     // Merchant Name
      formatTlv('60', merchantCity) +     // City
      tag62 +                             // Additional Data
      '6304';                             // CRC placeholder

    const checksum = calculateEmvcoCrc16(payloadWithoutCrc);
    return `${payloadWithoutCrc}${checksum}`;
  }

  /**
   * Render an authentic ABA KHQR branded card SVG
   */
  static renderCardSvg({ qrString, amount, referenceId, merchantName = 'NIGHTMARE STORE' }) {
    const numAmount = Number(amount).toFixed(2);
    const rawQrSvg = renderSVG(qrString, { ecc: 'M' });
    
    // Extract inner path elements from raw uqr SVG to embed cleanly
    const pathsMatch = rawQrSvg.match(/<svg[^>]*>([\s\S]*?)<\/svg>/i);
    const qrInner = pathsMatch ? pathsMatch[1] : rawQrSvg;
    
    // Get viewbox or width/height of the raw QR code
    const sizeMatch = rawQrSvg.match(/viewBox="0 0 (\d+) (\d+)"/i) || rawQrSvg.match(/width="(\d+)" height="(\d+)"/i);
    const rawSize = sizeMatch ? Number(sizeMatch[1]) : 256;
    const targetSize = 360;
    const scale = (targetSize / rawSize).toFixed(4);
    const qrOffsetX = Math.round((560 - targetSize) / 2);
    const qrOffsetY = 225;

    return `<?xml version="1.0" encoding="UTF-8"?>
<svg width="560" height="740" viewBox="0 0 560 740" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="headerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#E11D48"/>
      <stop offset="100%" stop-color="#BE123C"/>
    </linearGradient>
    <filter id="cardShadow" x="-10%" y="-10%" width="120%" height="120%">
      <feDropShadow dx="0" dy="8" stdDeviation="16" flood-color="#000000" flood-opacity="0.12"/>
    </filter>
  </defs>

  <!-- Background Card -->
  <rect width="560" height="740" rx="28" fill="#FFFFFF"/>
  <rect width="560" height="740" rx="28" fill="none" stroke="#E2E8F0" stroke-width="2"/>

  <!-- Top KHQR Red Header Banner -->
  <path d="M 0 28 A 28 28 0 0 1 28 0 L 532 0 A 28 28 0 0 1 560 28 L 560 95 L 0 95 Z" fill="url(#headerGrad)"/>

  <!-- KHQR Wordmark -->
  <text x="280" y="52" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="28" font-weight="900" fill="#FFFFFF" text-anchor="middle" letter-spacing="4">KHQR</text>
  <text x="280" y="80" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="12" font-weight="700" fill="#FFE4E6" text-anchor="middle" letter-spacing="1.5">ABA PAY &amp; BAKONG ACCEPTED</text>

  <!-- Merchant Info -->
  <text x="280" y="142" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#64748B" text-anchor="middle" letter-spacing="1">MERCHANT: ${merchantName.toUpperCase()}</text>
  
  <!-- Amount -->
  <text x="280" y="184" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="36" font-weight="900" fill="#0F172A" text-anchor="middle">$${numAmount} USD</text>

  <!-- QR Outer Box -->
  <rect x="80" y="205" width="400" height="400" rx="20" fill="#FFFFFF" stroke="#F1F5F9" stroke-width="3"/>
  <rect x="90" y="215" width="380" height="380" rx="16" fill="#FFFFFF"/>

  <!-- Scannable QR Matrix -->
  <g transform="translate(${qrOffsetX}, ${qrOffsetY}) scale(${scale})">
    ${qrInner}
  </g>

  <!-- Reference ID -->
  ${referenceId ? `<text x="280" y="632" font-family="Courier, monospace" font-size="11" font-weight="700" fill="#94A3B8" text-anchor="middle">REF: ${referenceId}</text>` : ''}

  <!-- Footer Instructions & Accepted Apps -->
  <text x="280" y="670" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="13" font-weight="800" fill="#334155" text-anchor="middle">Scan with ABA Mobile or any Bakong App</text>
  <text x="280" y="696" font-family="-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" font-size="11" font-weight="600" fill="#94A3B8" text-anchor="middle">ABA Bank • ACLEDA • Wing • Sathapana • Canadia • Bakong</text>
</svg>`;
  }

  /**
   * Render ABA KHQR card as a crisp PNG Buffer
   */
  static renderCardPngBuffer({ qrString, amount, referenceId, merchantName, width = 560 }) {
    try {
      const svg = this.renderCardSvg({ qrString, amount, referenceId, merchantName });
      const resvg = new Resvg(svg, {
        fitTo: { mode: 'width', value: width }
      });
      return resvg.render().asPng();
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to render KHQR PNG buffer via Resvg');
      throw err;
    }
  }
}
