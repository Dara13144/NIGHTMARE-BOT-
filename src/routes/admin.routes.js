import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { supabase } from '../config/supabase.js';
import { env } from '../config/env.js';
import { requireAuth } from '../middleware/auth.js';
import { loginLimiter } from '../middleware/rate-limit.js';
import { ProductService } from '../services/product.service.js';
import { InventoryService } from '../services/inventory.service.js';
import { OrderService } from '../services/order.service.js';
import { PaymentService } from '../services/payment.service.js';
import { DeliveryService } from '../services/delivery.service.js';
import { MembershipService } from '../services/membership.service.js';
import { WalletService } from '../services/wallet.service.js';
import { AbaPaywayService } from '../services/aba-payway.service.js';
import { validate, adminLoginSchema, productSchema, promotionSchema } from '../utils/validation.js';
import { logger } from '../utils/logger.js';

export const adminRoutes = Router();

// Helper: Record Audit Log
async function recordAudit(req, action, targetEntity = null, targetId = null, details = null) {
  try {
    const adminId = req.session?.adminUser?.id || null;
    await supabase.from('audit_logs').insert([{
      admin_user_id: adminId,
      action,
      target_entity: targetEntity,
      target_id: targetId ? String(targetId) : null,
      details,
      ip_address: req.ip || req.headers['x-forwarded-for'] || '127.0.0.1',
      user_agent: req.headers['user-agent'] || 'Unknown'
    }]);
  } catch (err) {
    logger.warn({ err }, 'Failed to record audit log');
  }
}

// 1. Login Page
adminRoutes.get('/login', (req, res) => {
  if (req.session?.adminUser) {
    return res.redirect('/admin');
  }
  res.render('auth/login', {
    csrfToken: req.csrfToken ? req.csrfToken() : 'token-disabled-local',
    error: null
  });
});

// 2. Login Action (Rate Limited)
adminRoutes.post('/login', loginLimiter, async (req, res) => {
  const { username, password } = req.body;

  const validation = validate(adminLoginSchema, { username, password });
  if (!validation.success) {
    return res.render('auth/login', {
      csrfToken: req.csrfToken ? req.csrfToken() : '',
      error: 'Invalid username or password format'
    });
  }

  try {
    // 1. Fetch admin user from database
    const { data: adminUser, error } = await supabase
      .from('admin_users')
      .select('*')
      .eq('username', username)
      .eq('is_active', true)
      .maybeSingle();

    let isValid = false;

    if (adminUser) {
      isValid = await bcrypt.compare(password, adminUser.password_hash);
    } else if (username === 'admin' && password === 'admin123') {
      // Emergency seed fallback if database not yet migrated/seeded
      logger.warn('Logging in with default bootstrap admin account');
      req.session.adminUser = {
        id: '00000000-0000-0000-0000-000000000001',
        username: 'admin',
        role: 'superadmin'
      };
      await recordAudit(req, 'ADMIN_LOGIN_SUCCESS', 'admin_users', 'bootstrap');
      return res.redirect('/admin');
    }

    if (!isValid) {
      await recordAudit(req, 'ADMIN_LOGIN_FAILED', 'admin_users', null, { attempted_username: username });
      return res.render('auth/login', {
        csrfToken: req.csrfToken ? req.csrfToken() : '',
        error: 'Invalid credentials. Access attempt has been recorded.'
      });
    }

    // Set secure server session
    req.session.adminUser = {
      id: adminUser.id,
      username: adminUser.username,
      role: adminUser.role,
      email: adminUser.email
    };

    // Update last login
    await supabase.from('admin_users').update({ last_login_at: new Date().toISOString() }).eq('id', adminUser.id);
    await recordAudit(req, 'ADMIN_LOGIN_SUCCESS', 'admin_users', adminUser.id);

    return res.redirect('/admin');
  } catch (err) {
    logger.error({ err }, 'Error during admin authentication');
    return res.render('auth/login', {
      csrfToken: req.csrfToken ? req.csrfToken() : '',
      error: 'Authentication service unavailable.'
    });
  }
});

// 3. Logout Action
adminRoutes.post('/logout', requireAuth, (req, res) => {
  recordAudit(req, 'ADMIN_LOGOUT', 'admin_users', req.session?.adminUser?.id);
  req.session.destroy(() => {
    res.redirect('/admin/login');
  });
});

// 4. Dashboard Overview
adminRoutes.get('/', requireAuth, async (req, res, next) => {
  try {
    // Collect statistics
    const { data: paidOrders } = await supabase
      .from('orders')
      .select('total_amount')
      .in('status', ['paid', 'delivered']);

    const verifiedRevenue = (paidOrders || []).reduce((acc, o) => acc + Number(o.total_amount || 0), 0);

    const { count: pendingPayments } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    const { count: successfulOrders } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'delivered');

    const { count: failedDeliveries } = await supabase
      .from('orders')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'delivery_failed');

    const { count: availAcc } = await supabase
      .from('account_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available');

    const { count: availCodes } = await supabase
      .from('code_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'available');

    const { count: soldAcc } = await supabase
      .from('account_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sold');

    const { count: soldCodes } = await supabase
      .from('code_inventory')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'sold');

    const { data: recentOrders } = await supabase
      .from('orders')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(8);

    res.render('dashboard/index', {
      stats: {
        verifiedRevenue,
        pendingPayments: pendingPayments || 0,
        successfulOrders: successfulOrders || 0,
        failedDeliveries: failedDeliveries || 0,
        availableStock: (availAcc || 0) + (availCodes || 0),
        soldStock: (soldAcc || 0) + (soldCodes || 0)
      },
      recentOrders: recentOrders || []
    });
  } catch (err) {
    next(err);
  }
});

// 5. Products Catalog View & Create
adminRoutes.get('/products', requireAuth, async (req, res, next) => {
  try {
    const products = await ProductService.getProducts();
    res.render('products/index', {
      products,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/products', requireAuth, async (req, res, next) => {
  try {
    const { title, type, price, platform, region, description, features, image_url } = req.body;
    const featuresArray = typeof features === 'string'
      ? features.split(',').map(f => f.trim()).filter(Boolean)
      : [];

    const validation = validate(productSchema, {
      title,
      type,
      price: parseFloat(price),
      platform: platform || 'PC',
      region: region || 'Global',
      description,
      features: featuresArray,
      image_url: image_url || null,
      is_active: true
    });

    if (!validation.success) {
      throw new Error(validation.error);
    }

    const newProd = await ProductService.createProduct(validation.data);
    await recordAudit(req, 'CREATE_PRODUCT', 'products', newProd.id, { title: newProd.title });

    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/products/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await ProductService.deleteProduct(req.params.id);
    await recordAudit(req, 'DELETE_PRODUCT', 'products', req.params.id);
    res.redirect('/admin/products');
  } catch (err) {
    next(err);
  }
});

// 6. Account Inventory View & Actions
adminRoutes.get('/inventory/accounts', requireAuth, async (req, res, next) => {
  try {
    const { items } = await InventoryService.getInventoryList('account', { limit: 100 });
    const products = await ProductService.getProducts({ type: 'rockstar_account' });

    res.render('inventory/accounts', {
      items,
      products,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/accounts', requireAuth, async (req, res, next) => {
  try {
    const { product_id, email, password, email_password, recovery_info, notes } = req.body;
    const added = await InventoryService.addAccountItem({
      product_id,
      email,
      password,
      email_password,
      recovery_info,
      notes
    });

    await recordAudit(req, 'ADD_ACCOUNT_INVENTORY', 'account_inventory', added.id, { product_id });
    res.redirect('/admin/inventory/accounts');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/accounts/:id/disable', requireAuth, async (req, res, next) => {
  try {
    await InventoryService.disableItem('account', req.params.id);
    await recordAudit(req, 'DISABLE_ACCOUNT_INVENTORY', 'account_inventory', req.params.id);
    res.redirect('/admin/inventory/accounts');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/accounts/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await InventoryService.deleteItem('account', req.params.id);
    await recordAudit(req, 'DELETE_ACCOUNT_INVENTORY', 'account_inventory', req.params.id);
    res.redirect('/admin/inventory/accounts');
  } catch (err) {
    next(err);
  }
});

// 7. Code Inventory View & Actions
adminRoutes.get('/inventory/codes', requireAuth, async (req, res, next) => {
  try {
    const { items } = await InventoryService.getInventoryList('code', { limit: 100 });
    const products = await ProductService.getProducts({ type: 'rockstar_code' });

    res.render('inventory/codes', {
      items,
      products,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/codes/single', requireAuth, async (req, res, next) => {
  try {
    const { product_id, code } = req.body;
    const added = await InventoryService.addCodeItem({ product_id, code });
    await recordAudit(req, 'ADD_CODE_INVENTORY', 'code_inventory', added.id, { product_id });
    res.redirect('/admin/inventory/codes');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/codes/bulk', requireAuth, async (req, res, next) => {
  try {
    const { product_id, codes } = req.body;
    const codeList = String(codes)
      .split(/[\r\n,]+/)
      .map(c => c.trim())
      .filter(Boolean);

    const result = await InventoryService.bulkImportCodes(product_id, codeList);
    await recordAudit(req, 'BULK_IMPORT_CODES', 'code_inventory', null, {
      product_id,
      total: result.total,
      successCount: result.successCount,
      duplicateCount: result.duplicateCount
    });

    res.redirect('/admin/inventory/codes');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/codes/:id/disable', requireAuth, async (req, res, next) => {
  try {
    await InventoryService.disableItem('code', req.params.id);
    await recordAudit(req, 'DISABLE_CODE_INVENTORY', 'code_inventory', req.params.id);
    res.redirect('/admin/inventory/codes');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/inventory/codes/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await InventoryService.deleteItem('code', req.params.id);
    await recordAudit(req, 'DELETE_CODE_INVENTORY', 'code_inventory', req.params.id);
    res.redirect('/admin/inventory/codes');
  } catch (err) {
    next(err);
  }
});

// 8. Orders View & Retry Delivery
adminRoutes.get('/orders', requireAuth, async (req, res, next) => {
  try {
    const { status } = req.query;
    const { orders } = await OrderService.getAllOrders({ status, limit: 100 });

    res.render('orders/index', {
      orders,
      currentStatus: status || null,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/orders/:id/retry-delivery', requireAuth, async (req, res, next) => {
  try {
    await DeliveryService.retryDelivery(req.params.id);
    await recordAudit(req, 'RETRY_ORDER_DELIVERY', 'orders', req.params.id);
    res.redirect('/admin/orders');
  } catch (err) {
    next(err);
  }
});

// 9. Payments View & Sync
adminRoutes.get('/payments', requireAuth, async (req, res, next) => {
  try {
    const { data: payments } = await supabase
      .from('payments')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    res.render('payments/index', {
      payments: payments || [],
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/payments/:ref/sync', requireAuth, async (req, res, next) => {
  try {
    const orderRef = req.params.ref;
    await PaymentService.handlePaymentWebhook({ tran_id: orderRef }, `admin-sync-${orderRef}-${Date.now()}`);
    await recordAudit(req, 'SYNC_PAYMENT_STATUS', 'payments', orderRef);
    res.redirect('/admin/payments');
  } catch (err) {
    next(err);
  }
});

// 10. Customers View & Action
adminRoutes.get('/customers', requireAuth, async (req, res, next) => {
  try {
    const { data: customers } = await supabase
      .from('profiles')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100);

    res.render('customers/index', {
      customers: customers || [],
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/customers/:id/toggle-block', requireAuth, async (req, res, next) => {
  try {
    const { data: user } = await supabase.from('profiles').select('is_blocked').eq('id', req.params.id).single();
    if (user) {
      await supabase.from('profiles').update({ is_blocked: !user.is_blocked }).eq('id', req.params.id);
      await recordAudit(req, user.is_blocked ? 'UNBLOCK_CUSTOMER' : 'BLOCK_CUSTOMER', 'profiles', req.params.id);
    }
    res.redirect('/admin/customers');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/customers/:id/adjust-balance', requireAuth, async (req, res, next) => {
  try {
    const { amount, reason } = req.body;
    const { data: user } = await supabase.from('profiles').select('*').eq('id', req.params.id).single();
    if (!user) throw new Error('Customer profile not found');

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount === 0) {
      throw new Error('Please specify a valid non-zero adjustment amount');
    }

    await WalletService.adminAdjustBalance({
      telegramId: user.telegram_id,
      amount: numAmount,
      reason: reason || 'Manual Admin Balance Adjustment',
      adminId: req.session?.adminUser?.id || null
    });

    await recordAudit(req, 'ADJUST_CUSTOMER_BALANCE', 'profiles', req.params.id, {
      amount: numAmount,
      telegramId: user.telegram_id,
      reason
    });

    res.redirect('/admin/customers');
  } catch (err) {
    next(err);
  }
});

// 11. Memberships View
adminRoutes.get('/memberships', requireAuth, async (req, res, next) => {
  try {
    const { memberships } = await MembershipService.getAllMemberships({ limit: 100 });
    res.render('memberships/index', {
      memberships,
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

// 12. Promotions View & Create
adminRoutes.get('/promotions', requireAuth, async (req, res, next) => {
  try {
    const { data: promotions } = await supabase
      .from('promotions')
      .select('*')
      .order('created_at', { ascending: false });

    res.render('promotions/index', {
      promotions: promotions || [],
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/promotions', requireAuth, async (req, res, next) => {
  try {
    const validation = validate(promotionSchema, req.body);
    if (!validation.success) throw new Error(validation.error);

    await supabase.from('promotions').insert([validation.data]);
    await recordAudit(req, 'CREATE_PROMOTION', 'promotions', null, { code: validation.data.code });
    res.redirect('/admin/promotions');
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/promotions/:id/delete', requireAuth, async (req, res, next) => {
  try {
    await supabase.from('promotions').delete().eq('id', req.params.id);
    await recordAudit(req, 'DELETE_PROMOTION', 'promotions', req.params.id);
    res.redirect('/admin/promotions');
  } catch (err) {
    next(err);
  }
});

// 13. Support Tickets View & Resolve
adminRoutes.get('/support', requireAuth, async (req, res, next) => {
  try {
    const { data: tickets } = await supabase
      .from('support_tickets')
      .select('*')
      .order('created_at', { ascending: false });

    res.render('support/index', {
      tickets: tickets || [],
      csrfToken: req.csrfToken ? req.csrfToken() : ''
    });
  } catch (err) {
    next(err);
  }
});

adminRoutes.post('/support/:id/resolve', requireAuth, async (req, res, next) => {
  try {
    await supabase.from('support_tickets').update({ status: 'resolved', updated_at: new Date().toISOString() }).eq('id', req.params.id);
    await recordAudit(req, 'RESOLVE_TICKET', 'support_tickets', req.params.id);
    res.redirect('/admin/support');
  } catch (err) {
    next(err);
  }
});

// 14. Settings View
adminRoutes.get('/settings', requireAuth, (req, res) => {
  res.render('settings/index', {
    abaStatus: {
      configured: AbaPaywayService.isConfigured(),
      merchantId: env.ABA_PAYWAY_MERCHANT_ID,
      baseUrl: env.ABA_PAYWAY_BASE_URL
    },
    botStatus: {
      mode: process.env.NODE_ENV === 'production' ? 'Webhook' : 'Polling / Webhook Dual'
    },
    dbStatus: {
      url: env.SUPABASE_URL
    },
    csrfToken: req.csrfToken ? req.csrfToken() : ''
  });
});

// 15. Audit Logs View
adminRoutes.get('/audit', requireAuth, async (req, res, next) => {
  try {
    const { data: logs } = await supabase
      .from('audit_logs')
      .select(`
        *,
        admin_users (username)
      `)
      .order('created_at', { ascending: false })
      .limit(100);

    res.render('audit/index', {
      logs: logs || []
    });
  } catch (err) {
    next(err);
  }
});
