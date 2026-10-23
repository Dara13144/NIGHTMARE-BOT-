// NIGHTMARE STORE — Storefront Interactive Engine & ABA KHQR Checkout
document.addEventListener('DOMContentLoaded', () => {
  initProducts();
  initFilters();
  initModal();
  initStatusLookup();
});

let allProducts = [];
let currentFilter = 'all';
let activePollInterval = null;

// Fallback products if database has not returned yet
const DEFAULT_PRODUCTS = [
  {
    id: 'prod-rockstar-codes',
    title: 'Rockstar Games Activation Key (Global)',
    type: 'rockstar_code',
    price: 14.99,
    stock: 25,
    description: 'Genuine digital key redeemable globally on Rockstar Games Launcher. Instant automated key delivery.',
    image_url: '/images/rockstar-codes-banner.jpg'
  },
  {
    id: 'prod-rockstar-accounts',
    title: 'Rockstar Games Transferable Clean Account',
    type: 'rockstar_account',
    price: 9.99,
    stock: 18,
    description: 'Full-access email & password changeable Rockstar account. Clean stats, ready for GTA Online & FiveM.',
    image_url: '/images/rockstar-accounts-banner.jpg'
  }
];

async function initProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  try {
    const res = await fetch('/api/products');
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data) && data.length > 0) {
        allProducts = data;
      } else {
        allProducts = DEFAULT_PRODUCTS;
      }
    } else {
      allProducts = DEFAULT_PRODUCTS;
    }
  } catch (err) {
    console.warn('API error, using default products list:', err);
    allProducts = DEFAULT_PRODUCTS;
  }

  renderProducts();
}

function renderProducts() {
  const container = document.getElementById('productsGrid');
  if (!container) return;

  const filtered = allProducts.filter(p => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'rockstar_code') return p.type === 'rockstar_code' || p.category === 'rockstar_code';
    if (currentFilter === 'rockstar_account') return p.type === 'rockstar_account' || p.category === 'rockstar_account';
    return true;
  });

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 3rem; color: var(--text-dark);">
        <p style="font-size: 1.2rem; font-weight: 700; color: var(--text-muted); margin-bottom: 0.5rem;">No products found</p>
        <p style="font-size: 0.85rem;">Check back shortly or visit our Telegram Bot for live stock updates.</p>
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(prod => {
    const isCode = prod.type === 'rockstar_code' || prod.category === 'rockstar_code';
    const bannerImg = prod.image_url || (isCode ? '/images/rockstar-codes-banner.jpg' : '/images/rockstar-accounts-banner.jpg');
    const categoryName = isCode ? 'Rockstar Codes 🔑' : 'Rockstar Accounts 🎮';
    const isInStock = (prod.stock ?? 1) > 0;
    const priceFormatted = Number(prod.price || 0).toFixed(2);

    return `
      <div class="product-card" id="card-${prod.id}">
        <div class="product-card-top">
          <img src="${bannerImg}" alt="${escapeHtml(prod.title)}" class="product-thumb" loading="lazy" />
          <span class="product-category-tag">${categoryName}</span>
          <div class="product-stock-tag ${isInStock ? 'stock-in' : 'stock-out'}">
            <span>${isInStock ? '●' : '○'}</span>
            <span>${isInStock ? `In Stock: ${prod.stock}` : 'Sold Out'}</span>
          </div>
        </div>
        <div class="product-card-body">
          <h3 class="product-card-title">${escapeHtml(prod.title)}</h3>
          <p class="product-card-desc">${escapeHtml(prod.description || 'Authorized digital gaming asset. 100% genuine.')}</p>
          <div class="product-card-footer">
            <div class="product-price">
              <span class="price-val">$${priceFormatted}</span>
              <span class="price-sub">USD / INSTANT</span>
            </div>
            <button class="btn btn-khqr" onclick="openCheckoutModal('${prod.id}')" ${!isInStock ? 'disabled style="opacity: 0.5; cursor: not-allowed;"' : ''}>
              <span>⚡ Buy (ABA KHQR)</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function initFilters() {
  const tabs = document.querySelectorAll('.filter-tab');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      currentFilter = tab.getAttribute('data-filter') || 'all';
      renderProducts();
    });
  });
}

function initModal() {
  const overlay = document.getElementById('checkoutModal');
  const closeBtn = document.getElementById('closeModalBtn');

  if (closeBtn && overlay) {
    closeBtn.addEventListener('click', closeModal);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeModal();
    });
  }
}

function closeModal() {
  const overlay = document.getElementById('checkoutModal');
  if (overlay) overlay.classList.remove('active');
  if (activePollInterval) {
    clearInterval(activePollInterval);
    activePollInterval = null;
  }
}

// Global checkout modal opener
window.openCheckoutModal = async function(productId) {
  const overlay = document.getElementById('checkoutModal');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  if (!overlay || !body) return;

  const product = allProducts.find(p => String(p.id) === String(productId));
  if (!product) return;

  title.innerHTML = `<span>🛍️</span> <span>Checkout: ${escapeHtml(product.title)}</span>`;
  body.innerHTML = `
    <div style="text-align: center; padding: 2.5rem 1rem;">
      <div class="live-dot" style="margin: 0 auto 1rem; width: 12px; height: 12px;"></div>
      <p style="font-weight: 700; color: #fff; margin-bottom: 0.5rem;">Generating ABA KHQR Payment...</p>
      <p style="font-size: 0.8rem; color: var(--text-dark);">Connecting to National Bank of Cambodia Bakong network</p>
    </div>
  `;
  overlay.classList.add('active');

  try {
    const res = await fetch('/payments/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ productId: product.id })
    });
    const session = await res.json();

    if (!session.success) {
      body.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem;">
          <p style="color: var(--primary-red); font-weight: 800; margin-bottom: 1rem;">❌ ${escapeHtml(session.error || 'Failed to initialize order')}</p>
          <button class="btn btn-secondary" onclick="closeModal()">Close</button>
        </div>
      `;
      return;
    }

    renderActivePaymentScreen(session);
  } catch (err) {
    body.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem;">
        <p style="color: var(--primary-red); font-weight: 800; margin-bottom: 1rem;">❌ Connection error. Please try again.</p>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
    `;
  }
};

// Global top-up modal opener
window.openTopupModal = function(initialAmount = 5) {
  const overlay = document.getElementById('checkoutModal');
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  if (!overlay || !body) return;

  title.innerHTML = `<span>💳</span> <span>ABA KHQR Wallet Top-up</span>`;
  
  body.innerHTML = `
    <div>
      <p style="font-size: 0.85rem; color: var(--text-muted); margin-bottom: 1rem;">
        Select an amount to top up your NIGHTMARE STORE in-app balance via <b>ABA PAY / Bakong KHQR</b>:
      </p>

      <div class="amount-chips">
        <button class="chip-btn ${initialAmount === 1 ? 'selected' : ''}" onclick="selectChipAmount(1, this)">$1.00</button>
        <button class="chip-btn ${initialAmount === 2 ? 'selected' : ''}" onclick="selectChipAmount(2, this)">$2.00</button>
        <button class="chip-btn ${initialAmount === 5 ? 'selected' : ''}" onclick="selectChipAmount(5, this)">$5.00</button>
        <button class="chip-btn ${initialAmount === 10 ? 'selected' : ''}" onclick="selectChipAmount(10, this)">$10.00</button>
        <button class="chip-btn ${initialAmount === 20 ? 'selected' : ''}" onclick="selectChipAmount(20, this)">$20.00</button>
        <button class="chip-btn ${initialAmount === 50 ? 'selected' : ''}" onclick="selectChipAmount(50, this)">$50.00</button>
      </div>

      <div style="margin-bottom: 1.25rem;">
        <label style="display: block; font-size: 0.75rem; font-weight: 700; color: var(--text-muted); text-transform: uppercase; margin-bottom: 0.4rem;">
          Or Enter Custom Amount (USD)
        </label>
        <input type="number" id="customAmountInput" value="${initialAmount}" min="1" step="0.5" 
          style="width: 100%; padding: 0.75rem 1rem; background: var(--bg-input); border: 1px solid var(--border-subtle); border-radius: 10px; color: #fff; font-size: 1rem; font-weight: 800;" />
      </div>

      <button class="btn btn-khqr" style="width: 100%; padding: 0.85rem;" onclick="generateTopupKhqr()">
        <span>⚡ Generate ABA KHQR</span>
      </button>
    </div>
  `;

  overlay.classList.add('active');
};

window.selectChipAmount = function(amt, btn) {
  document.querySelectorAll('.chip-btn').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected');
  const input = document.getElementById('customAmountInput');
  if (input) input.value = amt;
};

window.generateTopupKhqr = async function() {
  const input = document.getElementById('customAmountInput');
  const amount = parseFloat(input?.value || '5');
  if (isNaN(amount) || amount < 0.5) {
    alert('Please enter a valid amount (minimum $0.50 USD)');
    return;
  }

  const body = document.getElementById('modalBody');
  body.innerHTML = `
    <div style="text-align: center; padding: 2.5rem 1rem;">
      <div class="live-dot" style="margin: 0 auto 1rem; width: 12px; height: 12px;"></div>
      <p style="font-weight: 700; color: #fff; margin-bottom: 0.5rem;">Generating ABA KHQR for $${amount.toFixed(2)} USD...</p>
      <p style="font-size: 0.8rem; color: var(--text-dark);">Connecting to CutLuy &amp; ABA PayWay Gateway</p>
    </div>
  `;

  try {
    const res = await fetch('/payments/create-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'topup', amount })
    });
    const session = await res.json();

    if (!session.success) {
      body.innerHTML = `
        <div style="text-align: center; padding: 2rem 1rem;">
          <p style="color: var(--primary-red); font-weight: 800; margin-bottom: 1rem;">❌ ${escapeHtml(session.error || 'Failed to initialize top-up')}</p>
          <button class="btn btn-secondary" onclick="openTopupModal()">Back</button>
        </div>
      `;
      return;
    }

    renderActivePaymentScreen(session);
  } catch (err) {
    body.innerHTML = `
      <div style="text-align: center; padding: 2rem 1rem;">
        <p style="color: var(--primary-red); font-weight: 800; margin-bottom: 1rem;">❌ Connection error. Please try again.</p>
        <button class="btn btn-secondary" onclick="openTopupModal()">Back</button>
      </div>
    `;
  }
};

function renderActivePaymentScreen(session) {
  const body = document.getElementById('modalBody');
  const ref = session.referenceId;
  const amount = Number(session.amount).toFixed(2);
  const checkoutUrl = session.checkoutUrl || `/payments/cutluy/checkout?ref=${ref}`;

  body.innerHTML = `
    <div style="text-align: center;">
      <!-- Amount and Reference Header -->
      <div style="margin-bottom: 1rem;">
        <span style="font-size: 0.7rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1.5px; color: var(--primary-red);">
          ABA PAY &bull; BAKONG KHQR
        </span>
        <h2 style="font-size: 2.2rem; font-weight: 900; color: #fff; margin: 0.2rem 0;">
          $${amount} <span style="font-size: 1rem; color: var(--text-muted);">USD</span>
        </h2>
        <p style="font-size: 0.75rem; color: var(--text-dark); font-family: var(--font-mono);">
          Reference: <code style="color: #fff; font-weight: 700;">${ref}</code>
        </p>
      </div>

      <!-- Real-time Generated ABA KHQR Image Card -->
      <div class="qr-card-wrapper" id="qrCardBox">
        <img src="/payments/qr/${ref}.png" alt="ABA KHQR" class="qr-image" />
      </div>

      <!-- Live Polling Status Indicator -->
      <div style="display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-bottom: 1rem;" id="liveStatusContainer">
        <span class="live-dot"></span>
        <span style="font-size: 0.8rem; font-weight: 700; color: var(--emerald);" id="statusLabel">
          Auto-Detection Active &bull; Waiting for Bank Scan...
        </span>
      </div>

      <!-- Action Buttons -->
      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
        ${checkoutUrl && !checkoutUrl.includes('localhost') ? `
          <a href="${checkoutUrl}" target="_blank" class="btn btn-khqr" style="width: 100%;">
            <span>🇰🇭 Open in ABA Mobile / Pay Online</span>
          </a>
        ` : ''}
        <a href="https://t.me/darastore_bot" target="_blank" class="btn btn-secondary" style="width: 100%; font-size: 0.8rem;">
          <span>🤖 Return to Telegram Bot (@darastore_bot)</span>
        </a>
      </div>
    </div>
  `;

  // Start polling every 2.5 seconds
  if (activePollInterval) clearInterval(activePollInterval);
  activePollInterval = setInterval(() => pollPaymentStatus(ref), 2500);
}

async function pollPaymentStatus(ref) {
  try {
    const res = await fetch(`/payments/status/${ref}`);
    if (!res.ok) return;
    const data = await res.json();

    if (data.isPaid) {
      if (activePollInterval) {
        clearInterval(activePollInterval);
        activePollInterval = null;
      }
      renderSuccessScreen(ref);
    }
  } catch (err) {
    // Ignore network blips during polling
  }
}

function renderSuccessScreen(ref) {
  const body = document.getElementById('modalBody');
  const title = document.getElementById('modalTitle');
  if (!body) return;

  if (title) title.innerHTML = `<span>🎉</span> <span>Payment Confirmed!</span>`;

  body.innerHTML = `
    <div style="text-align: center; padding: 1.5rem 1rem;">
      <div style="width: 64px; height: 64px; background: rgba(16, 185, 129, 0.15); border: 2px solid var(--emerald); border-radius: 50%; display: flex; align-items: center; justify-content: center; margin: 0 auto 1.25rem; font-size: 2rem;">
        ✅
      </div>
      <h3 style="font-size: 1.4rem; font-weight: 900; color: #fff; margin-bottom: 0.4rem;">
        PAYMENT CONFIRMED!
      </h3>
      <p style="font-size: 0.8rem; color: var(--emerald); font-weight: 700; text-transform: uppercase; letter-spacing: 1px; margin-bottom: 1.25rem;">
        Bakong KHQR Settled
      </p>

      <div style="background: rgba(255, 255, 255, 0.04); border: 1px solid var(--border-subtle); border-radius: 12px; padding: 1rem; text-align: left; font-size: 0.8rem; color: var(--text-muted); margin-bottom: 1.5rem;">
        <p style="margin-bottom: 0.4rem;"><b>Reference:</b> <code style="color: #fff;">${ref}</code></p>
        <p style="color: #fff; font-weight: 600;">⚡ Delivery Dispatched!</p>
        <p style="font-size: 0.75rem; color: var(--text-dark); margin-top: 0.2rem;">
          Your digital keys or credentials have been sent directly to your Telegram chat.
        </p>
      </div>

      <div style="display: flex; flex-direction: column; gap: 0.6rem;">
        <a href="https://t.me/darastore_bot" class="btn btn-primary" style="width: 100%;">
          <span>Open Telegram Chat (@darastore_bot)</span>
        </a>
        <button class="btn btn-secondary" onclick="closeModal()">Close</button>
      </div>
    </div>
  `;
}

function initStatusLookup() {
  const btn = document.getElementById('lookupBtn');
  const input = document.getElementById('lookupInput');
  if (!btn || !input) return;

  btn.addEventListener('click', () => {
    const val = input.value.trim();
    if (!val) {
      alert('Please enter an Order Number or Top-up Reference.');
      return;
    }
    window.location.href = `/payments/cutluy/checkout?ref=${encodeURIComponent(val)}`;
  });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
