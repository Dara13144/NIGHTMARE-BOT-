import { Router } from 'express';
import express from 'express';
import { PaymentService } from '../services/payment.service.js';
import { CutluyService } from '../services/cutluy.service.js';
import { OrderService } from '../services/order.service.js';
import { WalletService } from '../services/wallet.service.js';
import { ProductService } from '../services/product.service.js';
import { KhqrService } from '../services/khqr.service.js';
import { paymentLimiter } from '../middleware/rate-limit.js';
import { logger } from '../utils/logger.js';
import { supabase } from '../config/supabase.js';

export const paymentRoutes = Router();

// 1. CutLuy Webhook Handler
const handleCutluyWebhookRoute = async (req, res) => {
  const signature = req.headers['x-cutluy-signature'];
  const rawBody = req.body;

  logger.info({ signature }, 'Received CutLuy webhook notification');

  // Support both Buffer and parsed JSON object
  const rawBodyStr = Buffer.isBuffer(rawBody)
    ? rawBody.toString('utf8')
    : (typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody));

  // Verify signature if secret configured
  const isValid = CutluyService.verifyWebhookSignature(signature, rawBodyStr);
  if (!isValid && process.env.NODE_ENV === 'production') {
    logger.warn('Rejected CutLuy webhook with invalid signature');
    return res.status(400).send('invalid signature');
  }

  try {
    const event = (typeof rawBody === 'object' && !Buffer.isBuffer(rawBody))
      ? rawBody
      : JSON.parse(rawBodyStr);
    const result = await PaymentService.handleCutluyWebhook(event);
    return res.status(200).json(result);
  } catch (err) {
    logger.error({ err }, 'Error parsing CutLuy webhook body');
    return res.status(400).send('bad request');
  }
};

paymentRoutes.post('/cutluy/webhook', handleCutluyWebhookRoute);
paymentRoutes.post('/cutluy', handleCutluyWebhookRoute);

// 2. Success Redirect URL (/thank-you)
paymentRoutes.get('/thank-you', async (req, res) => {
  const orderRef = req.query.ref || req.query.order_ref || req.query.reference_id || req.query.tran_id;

  if (orderRef) {
    try {
      // Sync status with payment provider if needed
      await PaymentService.handlePaymentWebhook({ tran_id: orderRef }, `thankyou-redirect-${orderRef}-${Date.now()}`);
    } catch {}
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Successful — NIGHTMARE STORE</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-black text-gray-100 min-h-screen flex items-center justify-center p-4 font-sans">
      <div class="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl text-center">
        <!-- Success Emerald Medallion -->
        <div class="w-20 h-20 bg-emerald-950/80 border-2 border-emerald-500 text-emerald-400 rounded-full flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-950">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>

        <h1 class="text-2xl font-black text-white tracking-wider mb-2">PAYMENT SUCCESSFUL!</h1>
        <p class="text-xs uppercase tracking-widest text-emerald-400 font-mono mb-4">Bakong KHQR Confirmed</p>

        ${orderRef ? `<p class="text-xs text-gray-400 mb-4">Order Ref: <code class="text-red-400 font-bold">${orderRef}</code></p>` : ''}

        <div class="bg-neutral-950 border border-neutral-800 rounded-xl p-4 mb-6 text-left space-y-2">
          <div class="flex items-center space-x-2 text-xs text-gray-300">
            <span>⚡</span>
            <span><b>Instant Digital Delivery:</b> Active</span>
          </div>
          <div class="flex items-center space-x-2 text-xs text-gray-300">
            <span>📦</span>
            <span>Your activation codes / credentials have been delivered directly to your <b>Telegram Chat</b>.</span>
          </div>
        </div>

        <div class="space-y-3">
          <a href="https://t.me/darastore_bot" class="block w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 px-6 rounded-xl text-sm uppercase tracking-wider transition shadow-lg shadow-red-950">
            Open Telegram App (@darastore_bot)
          </a>
          <a href="https://t.me/darazzdev" class="block w-full bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-semibold py-2.5 px-6 rounded-xl text-xs transition border border-neutral-700">
            Contact Admin (@darazzdev)
          </a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// 3. Failure Redirect URL (/payment-failed)
paymentRoutes.get('/payment-failed', async (req, res) => {
  const orderRef = req.query.ref || req.query.order_ref || req.query.reference_id || req.query.tran_id;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Payment Incomplete — NIGHTMARE STORE</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-black text-gray-100 min-h-screen flex items-center justify-center p-4 font-sans">
      <div class="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 shadow-2xl text-center">
        <!-- Failure Amber Icon -->
        <div class="w-20 h-20 bg-amber-950/80 border-2 border-amber-500 text-amber-400 rounded-full flex items-center justify-center mx-auto mb-5 shadow-xl shadow-amber-950">
          <svg class="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2.5" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path>
          </svg>
        </div>

        <h1 class="text-2xl font-black text-white tracking-wider mb-2">PAYMENT NOT COMPLETED</h1>
        <p class="text-xs uppercase tracking-widest text-amber-400 font-mono mb-4">Transaction Cancelled or Expired</p>

        <p class="text-xs text-gray-400 leading-relaxed mb-6">
          Your payment was not completed. If your reserved time has not expired, you can retry from your order history in the Telegram bot.
        </p>

        <div class="space-y-3">
          <a href="https://t.me/darastore_bot" class="block w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3.5 px-6 rounded-xl text-sm uppercase tracking-wider transition shadow-lg shadow-red-950">
            Return to Bot (@darastore_bot)
          </a>
          <a href="https://t.me/darazzdev" class="block w-full bg-neutral-800 hover:bg-neutral-700 text-gray-300 font-semibold py-2.5 px-6 rounded-xl text-xs transition border border-neutral-700">
            Need Help? Chat with @darazzdev
          </a>
        </div>
      </div>
    </body>
    </html>
  `);
});

// 2. CutLuy Dynamic KHQR Checkout Page
paymentRoutes.get('/cutluy/checkout', async (req, res) => {
  const orderRef = req.query.ref || req.query.order_ref;
  if (!orderRef) return res.status(400).send('Missing reference');

  let totalAmount = 0;
  let status = 'PENDING';
  let qrString = null;
  let subTitle = 'Authorized Rockstar Games Store';

  if (orderRef.startsWith('TOPUP-')) {
    const { data: tx } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('reference_id', orderRef)
      .maybeSingle();

    if (!tx) return res.status(404).send('Top-up transaction not found');
    totalAmount = Number(tx.amount);
    status = tx.status;
    qrString = tx.qr_string || `bakong://${orderRef}?amount=${tx.amount}&currency=USD&merchant=NIGHTMARE_STORE`;
    subTitle = 'NIGHTMARE STORE In-App Wallet Top-up';
  } else {
    const order = await OrderService.getOrderByRef(orderRef);
    if (!order) return res.status(404).send('Order not found');
    totalAmount = Number(order.total_amount);
    status = order.status;
    qrString = order.payments?.[0]?.qr_string;
  }

  const qrSvg = qrString ? CutluyService.renderSvgQr(qrString) : null;
  const qrSvgUrl = qrString ? `https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(qrString)}` : null;

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Bakong KHQR Payment — NIGHTMARE STORE</title>
      <script src="https://cdn.tailwindcss.com"></script>
      <style>
        @keyframes pulse-border {
          0%, 100% { border-color: rgba(220, 38, 38, 0.4); }
          50% { border-color: rgba(220, 38, 38, 1); }
        }
        .anim-pulse { animation: pulse-border 2s infinite ease-in-out; }
      </style>
    </head>
    <body class="bg-black text-gray-100 min-h-screen flex items-center justify-center p-4 font-sans">
      <div class="mx-auto w-full max-w-sm">
        <div id="paymentCard" class="overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 shadow-2xl transition duration-300">
          
          <!-- Red Header with Wordmark -->
          <div class="flex items-center justify-between bg-red-700 px-5 py-3.5 text-white">
            <div class="flex items-center space-x-2">
              <span class="font-black tracking-widest text-sm uppercase">NIGHTMARE STORE</span>
            </div>
            <span class="text-[11px] font-bold uppercase tracking-wider bg-red-950/80 px-2 py-0.5 rounded border border-red-800">
              Bakong KHQR
            </span>
          </div>

          <!-- Merchant + Amount with tear line -->
          <div class="relative border-b border-dashed border-neutral-800 px-6 py-4 pb-3">
            <div class="absolute -top-px right-0 h-0 w-0 border-t-[20px] border-l-[20px] border-t-red-700 border-l-transparent"></div>
            <div class="flex items-center gap-2 mb-1">
              <div class="w-5 h-5 rounded-full bg-red-950 border border-red-600 flex items-center justify-center text-[10px] font-bold text-red-400">NM</div>
              <h3 class="text-xs text-gray-400 font-medium">${subTitle}</h3>
            </div>
            <div class="flex items-baseline justify-between mt-2">
              <div class="flex items-baseline gap-1.5">
                <span class="text-3xl font-black text-white">$${totalAmount.toFixed(2)}</span>
                <span class="text-xs font-bold text-gray-400">USD</span>
              </div>
              <span id="statusBadge" class="text-[10px] font-bold uppercase px-2 py-0.5 rounded ${status === 'completed' || status === 'paid' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'bg-amber-950 text-amber-400 border border-amber-800'}">
                ${status.toUpperCase()}
              </span>
            </div>
          </div>

          <!-- QR Section -->
          <div class="p-5 flex flex-col items-center justify-center">
            <div id="qrContainer" class="w-full flex items-center justify-center">
              <img src="/payments/qr/${orderRef}.png" alt="ABA KHQR" class="w-full max-w-[320px] rounded-2xl shadow-2xl border border-neutral-700 mx-auto" />
            </div>

            <p class="mt-4 text-center text-xs text-gray-400">
              Scan with <b>ABA Mobile</b>, <b>Bakong</b>, or any banking app
            </p>
          </div>
        </div>

        <div class="mt-4 text-center space-y-2">
          <p id="timerText" class="text-xs text-gray-500 font-mono">
            ⏳ Waiting for payment confirmation...
          </p>
          <a href="https://t.me/darastore_bot" class="inline-block text-xs text-red-400 hover:underline">
            &larr; Return to Telegram Bot
          </a>
        </div>
      </div>

      <!-- Real-time Status Polling -->
      <script>
        const orderRef = "${orderRef}";
        const pollInterval = setInterval(async () => {
          try {
            const res = await fetch('/payments/status/' + orderRef);
            const data = await res.json();

            if (data.isPaid) {
              clearInterval(pollInterval);
              document.getElementById('statusBadge').className = 'text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800';
              document.getElementById('statusBadge').innerText = 'PAID & CONFIRMED';
              document.getElementById('timerText').innerHTML = '🎉 <b>Payment Received!</b> Check your Telegram chat.';
              document.getElementById('qrContainer').innerHTML = '<div class="text-center py-8"><svg class="w-16 h-16 text-emerald-500 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg><p class="text-black font-bold text-sm">Payment Verified</p></div>';
            }
          } catch {}
        }, 3000);
      </script>
    </body>
    </html>
  `);
});

// 3. Real-time Status Check Endpoint
paymentRoutes.get('/status/:orderRef', async (req, res) => {
  const ref = req.params.orderRef;
  if (!ref) return res.status(400).json({ error: 'Missing reference' });

  if (ref.startsWith('TOPUP-')) {
    const { data: tx } = await supabase
      .from('balance_transactions')
      .select('*')
      .eq('reference_id', ref)
      .maybeSingle();

    if (!tx) return res.status(404).json({ error: 'Top-up not found' });
    return res.json({
      status: tx.status,
      isPaid: tx.status === 'completed',
      orderNumber: tx.reference_id
    });
  }

  const order = await OrderService.getOrderByRef(ref);
  if (!order) return res.status(404).json({ error: 'Order not found' });
  return res.json({
    status: order.status,
    isPaid: order.status === 'paid' || order.status === 'delivered',
    orderNumber: order.order_number
  });
});

// 3b. Live User Wallet Balance Endpoint (for Telegram Mini App & Storefront)
paymentRoutes.get('/balance/:telegramId', async (req, res) => {
  try {
    const { telegramId } = req.params;
    const balance = await WalletService.getBalance(telegramId);
    return res.json({ success: true, telegramId: Number(telegramId), balance });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 4. Official server-to-server webhook notification callback for ABA PayWay
paymentRoutes.post('/callback', paymentLimiter, async (req, res) => {
  try {
    const payload = req.body;
    const idempotencyKey = req.headers['idempotency-key'] || payload.tran_id || `pay-cb-${Date.now()}`;

    logger.info({ payload }, 'Received payment webhook callback from gateway');

    const result = await PaymentService.handlePaymentWebhook(payload, idempotencyKey);

    if (result.success) {
      return res.status(200).json({ status: 'success', message: 'Payment verified and processed' });
    } else {
      return res.status(400).json({ status: 'failed', error: result.error });
    }
  } catch (err) {
    logger.error({ err }, 'Error processing payment webhook callback');
    return res.status(500).json({ status: 'error', error: err.message });
  }
});

// 5. Customer return redirect URL
paymentRoutes.get('/callback', async (req, res) => {
  const orderRef = req.query.order_ref || req.query.tran_id;

  if (orderRef) {
    try {
      await PaymentService.handlePaymentWebhook({ tran_id: orderRef }, `return-redirect-${orderRef}-${Date.now()}`);
    } catch (err) {
      logger.warn({ err, orderRef }, 'Auto-sync on return redirect notice');
    }
  }

  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <title>Payment Received - NIGHTMARE STORE</title>
      <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-black text-gray-100 min-h-screen flex items-center justify-center p-4">
      <div class="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-xl p-8 shadow-2xl text-center">
        <div class="w-16 h-16 bg-red-950 text-red-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-800">
          <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
          </svg>
        </div>
        <h1 class="text-2xl font-black text-red-500 tracking-wider mb-2">NIGHTMARE STORE</h1>
        <p class="text-sm font-semibold text-gray-400 mb-6">Order Reference: <code class="text-white">${orderRef || 'Processing'}</code></p>
        <p class="text-gray-300 text-sm leading-relaxed mb-6">
          Thank you! Your payment is confirmed. Your purchased credentials or activation codes have been sent to your <b>Telegram Chat</b>.
        </p>
        <a href="https://t.me/darastore_bot" class="block w-full bg-red-700 hover:bg-red-800 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-red-950">
          Open Telegram App
        </a>
      </div>
    </body>
    </html>
  `);
});

// 6. Manual status verification endpoint
paymentRoutes.post('/verify/:orderRef', async (req, res) => {
  try {
    const { orderRef } = req.params;
    const result = await PaymentService.handlePaymentWebhook({ tran_id: orderRef }, `manual-${orderRef}-${Date.now()}`);
    return res.json(result);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// 7. Render Authentic ABA KHQR Card PNG
paymentRoutes.get('/qr/:ref.png', async (req, res) => {
  const ref = req.params.ref;
  if (!ref) return res.status(400).send('Missing reference');

  try {
    let amount = 1.0;
    let qrString = null;
    let merchantName = 'NIGHTMARE STORE';

    if (ref.startsWith('TOPUP-')) {
      const { data: tx } = await supabase
        .from('balance_transactions')
        .select('*')
        .eq('reference_id', ref)
        .maybeSingle();

      if (tx) {
        amount = Number(tx.amount) || 1.0;
        qrString = tx.qr_string;
      }
    } else {
      const order = await OrderService.getOrderByRef(ref);
      if (order) {
        amount = Number(order.total_amount) || 1.0;
        qrString = order.payments?.[0]?.qr_string;
      }
    }

    if (!qrString) {
      qrString = KhqrService.buildKhqrString({
        amount,
        referenceId: ref,
        merchantName: 'MAO DARA NADYTOPUP'
      });
    }

    const pngBuffer = KhqrService.renderCardPngBuffer({
      qrString,
      amount,
      referenceId: ref,
      merchantName: 'NIGHTMARE STORE'
    });

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'public, max-age=60');
    return res.send(pngBuffer);
  } catch (err) {
    logger.error({ err: err.message, ref }, 'Error generating KHQR PNG image card');
    return res.status(500).send('Failed to render ABA KHQR image');
  }
});

// 8. Create Web Checkout or Top-up Session for UI
paymentRoutes.post('/create-session', async (req, res) => {
  try {
    const { type, productId, amount, telegramId } = req.body;
    const effectiveTelegramId = telegramId ? Number(telegramId) : 8361673413;

    // Wallet Top-up
    if (type === 'topup' || (!productId && amount)) {
      const numAmount = Math.max(1, parseFloat(Number(amount).toFixed(2)) || 1);
      const session = await WalletService.createTopupSession({
        telegramId: effectiveTelegramId,
        amount: numAmount
      });

      return res.json({
        success: true,
        referenceId: session.topupRef,
        amount: session.amount,
        qrString: session.qrString,
        qrImageUrl: `/payments/qr/${session.topupRef}.png`,
        checkoutUrl: session.checkoutUrl || `/payments/cutluy/checkout?ref=${session.topupRef}`,
        status: 'pending'
      });
    }

    // Product Purchase
    if (!productId) {
      return res.status(400).json({ error: 'Missing productId' });
    }

    const product = await ProductService.getProductById(productId);
    if (!product) return res.status(404).json({ error: 'Product not found' });
    if (product.stock <= 0) return res.status(400).json({ error: 'Product is currently out of stock' });

    const orderData = await OrderService.createOrder({
      telegramId: effectiveTelegramId,
      productId: product.id
    });

    const payResult = await PaymentService.initiatePayment(orderData.order.id);
    const checkoutUrl = payResult.paymentResult?.checkoutUrl || `/payments/cutluy/checkout?ref=${orderData.order.order_number}`;
    const qrString = payResult.paymentResult?.qrString;

    return res.json({
      success: true,
      orderId: orderData.order.id,
      referenceId: orderData.order.order_number,
      amount: Number(product.price),
      productTitle: product.title,
      qrString,
      qrImageUrl: `/payments/qr/${orderData.order.order_number}.png`,
      checkoutUrl,
      status: orderData.order.status
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Error creating payment session from web');
    return res.status(500).json({ error: err.message });
  }
});
