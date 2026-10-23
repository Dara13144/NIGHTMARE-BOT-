import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import { encryptPayload, hashSecret } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DB_FILE = path.resolve(__dirname, '../../../database/local-database.json');

class LocalDatabaseStore {
  constructor() {
    this.dbFile = DB_FILE;
    this.tables = {
      categories: [
        { id: 'cat-01', name: 'Rockstar Codes', slug: 'rockstar-codes', description: 'Authorized activation keys', display_order: 1, is_active: true, created_at: new Date().toISOString() },
        { id: 'cat-02', name: 'Rockstar Accounts', slug: 'rockstar-accounts', description: 'Transferable accounts', display_order: 2, is_active: true, created_at: new Date().toISOString() }
      ],
      admin_users: [
        {
          id: 'admin-01',
          username: 'admin',
          email: 'admin@nightmare.store',
          password_hash: bcrypt.hashSync('AdminNightmare2026!', 10),
          role: 'superadmin',
          is_active: true,
          created_at: new Date().toISOString()
        }
      ],
      products: [
        {
          id: 'prod-01',
          category_id: 'cat-01',
          type: 'rockstar_code',
          title: 'Grand Theft Auto V — Premium Edition (PC Key)',
          description: 'Complete GTAV story mode, Grand Theft Auto Online, and Criminal Enterprise Starter Pack ($1,000,000 bonus cash).',
          price: 14.99,
          currency: 'USD',
          platform: 'PC / Rockstar Games Launcher',
          region: 'Global',
          features: ['Full Story Mode & GTA Online', 'Criminal Enterprise Pack', 'Instant Digital Delivery', 'Rockstar Launcher Key'],
          limitations: 'Requires PC running Windows 10/11 and Rockstar Games Launcher.',
          image_url: 'https://images.unsplash.com/photo-1542751371-adc38448a05e?auto=format&fit=crop&w=600&q=80',
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: 'prod-02',
          category_id: 'cat-01',
          type: 'rockstar_code',
          title: 'Red Dead Redemption 2 — Standard Edition (PC Key)',
          description: 'Winner of over 175 Game of the Year Awards. The epic tale of outlaw Arthur Morgan.',
          price: 19.99,
          currency: 'USD',
          platform: 'PC / Rockstar Games Launcher',
          region: 'Global',
          features: ['Full RDR2 Story Mode', 'Red Dead Online Access', 'Rockstar Social Club Activation', 'Authorized Key'],
          image_url: 'https://images.unsplash.com/photo-1511512578047-dfb367046420?auto=format&fit=crop&w=600&q=80',
          is_active: true,
          created_at: new Date().toISOString()
        },
        {
          id: 'prod-03',
          category_id: 'cat-02',
          type: 'rockstar_account',
          title: 'Grand Theft Auto V — Level 120 + $50M Bank Account',
          description: 'Authorized transferable PC Rockstar account with Level 120, maxed stats, and $50,000,000 in-game bank balance.',
          price: 29.99,
          currency: 'USD',
          platform: 'PC',
          region: 'Global',
          features: ['Rank 120 Character', '$50M Legit In-game Bank', 'Clean Non-Banned History', 'Full Email Access Transfer'],
          limitations: 'Email and password should be changed immediately following delivery.',
          image_url: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?auto=format&fit=crop&w=600&q=80',
          is_active: true,
          created_at: new Date().toISOString()
        }
      ],
      account_inventory: [
        {
          id: 'acc-inv-01',
          product_id: 'prod-03',
          status: 'available',
          encrypted_payload: encryptPayload({
            email: 'nightmare_rockstar_01@transfer.com',
            password: 'RockstarPassword2026!',
            email_password: 'EmailAccessSecret99!',
            recovery_info: 'Recovery Code: NM-849201'
          }),
          reserved_order_id: null,
          reserved_at: null,
          reservation_expires_at: null,
          sold_at: null,
          created_at: new Date().toISOString()
        },
        {
          id: 'acc-inv-02',
          product_id: 'prod-03',
          status: 'available',
          encrypted_payload: encryptPayload({
            email: 'nightmare_rockstar_02@transfer.com',
            password: 'RockstarPassword77!',
            email_password: 'EmailAccessSecret88!',
            recovery_info: 'Recovery Code: NM-992014'
          }),
          reserved_order_id: null,
          reserved_at: null,
          reservation_expires_at: null,
          sold_at: null,
          created_at: new Date().toISOString()
        }
      ],
      code_inventory: [
        {
          id: 'code-inv-01',
          product_id: 'prod-01',
          status: 'available',
          code_hash: hashSecret('NMGT-8492-ROCK-5821'),
          encrypted_payload: encryptPayload({ code: 'NMGT-8492-ROCK-5821', added_at: new Date().toISOString() }),
          reserved_order_id: null,
          reserved_at: null,
          reservation_expires_at: null,
          sold_at: null,
          created_at: new Date().toISOString()
        },
        {
          id: 'code-inv-02',
          product_id: 'prod-01',
          status: 'available',
          code_hash: hashSecret('NMGT-9921-GAME-4412'),
          encrypted_payload: encryptPayload({ code: 'NMGT-9921-GAME-4412', added_at: new Date().toISOString() }),
          reserved_order_id: null,
          reserved_at: null,
          reservation_expires_at: null,
          sold_at: null,
          created_at: new Date().toISOString()
        },
        {
          id: 'code-inv-03',
          product_id: 'prod-02',
          status: 'available',
          code_hash: hashSecret('NMRD-7721-WEST-8899'),
          encrypted_payload: encryptPayload({ code: 'NMRD-7721-WEST-8899', added_at: new Date().toISOString() }),
          reserved_order_id: null,
          reserved_at: null,
          reservation_expires_at: null,
          sold_at: null,
          created_at: new Date().toISOString()
        }
      ],
      profiles: [],
      orders: [],
      order_items: [],
      payments: [],
      payment_events: [],
      memberships: [],
      promotions: [
        {
          id: 'promo-01',
          code: 'NIGHTMARE10',
          description: 'Grand opening 10% discount on all orders',
          discount_percent: 10.0,
          max_uses: 100,
          used_count: 0,
          is_active: true,
          created_at: new Date().toISOString()
        }
      ],
      support_tickets: [],
      audit_logs: [],
      balance_transactions: []
    };

    if (fs.existsSync(this.dbFile)) {
      try {
        const raw = fs.readFileSync(this.dbFile, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          for (const [key, val] of Object.entries(parsed)) {
            if (Array.isArray(val) && val.length > 0) {
              this.tables[key] = val;
            }
          }
        }
      } catch (err) {
        logger.warn({ err: err.message }, 'Could not read local-database.json');
      }
    }
  }

  save() {
    try {
      const dir = path.dirname(this.dbFile);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(this.dbFile, JSON.stringify(this.tables, null, 2), 'utf8');
    } catch (err) {
      // ignore
    }
  }

  from(tableName) {
    if (!this.tables[tableName]) {
      this.tables[tableName] = [];
    }
    return new LocalQueryBuilder(this, tableName);
  }

  async rpc(funcName, params = {}) {
    if (funcName === 'reserve_product_inventory') {
      const { p_order_id, p_product_id, p_inventory_type, p_duration_minutes = 15 } = params;
      const product = this.tables.products.find(p => p.id === p_product_id);
      if (!product) return { data: { success: false, error: 'Product not found' }, error: null };

      const table = p_inventory_type === 'account' ? this.tables.account_inventory : this.tables.code_inventory;
      const availableItem = table.find(i => i.product_id === p_product_id && i.status === 'available');

      if (!availableItem) {
        return { data: { success: false, error: 'Out of stock' }, error: null };
      }

      const expiresAt = new Date(Date.now() + p_duration_minutes * 60 * 1000).toISOString();
      availableItem.status = 'reserved';
      availableItem.reserved_order_id = p_order_id;
      availableItem.reserved_at = new Date().toISOString();
      availableItem.reservation_expires_at = expiresAt;

      const orderItem = {
        id: crypto.randomUUID(),
        order_id: p_order_id,
        product_id: p_product_id,
        inventory_type: p_inventory_type,
        inventory_item_id: availableItem.id,
        price: product.price,
        product_title: product.title,
        created_at: new Date().toISOString()
      };
      this.tables.order_items.push(orderItem);

      const order = this.tables.orders.find(o => o.id === p_order_id);
      if (order) {
        order.reservation_expires_at = expiresAt;
      }

      return {
        data: {
          success: true,
          item_id: availableItem.id,
          inventory_type: p_inventory_type,
          product_title: product.title,
          price: product.price,
          expires_at: expiresAt
        },
        error: null
      };
    }

    if (funcName === 'release_expired_reservations') {
      let released_accounts = 0;
      let released_codes = 0;
      let expired_orders = 0;
      const now = new Date().toISOString();

      for (const item of this.tables.account_inventory) {
        if (item.status === 'reserved' && item.reservation_expires_at && item.reservation_expires_at < now) {
          item.status = 'available';
          item.reserved_order_id = null;
          item.reservation_expires_at = null;
          released_accounts++;
        }
      }

      for (const item of this.tables.code_inventory) {
        if (item.status === 'reserved' && item.reservation_expires_at && item.reservation_expires_at < now) {
          item.status = 'available';
          item.reserved_order_id = null;
          item.reservation_expires_at = null;
          released_codes++;
        }
      }

      for (const order of this.tables.orders) {
        if (order.status === 'pending' && order.reservation_expires_at && order.reservation_expires_at < now) {
          order.status = 'expired';
          expired_orders++;
        }
      }

      return {
        data: { released_accounts, released_codes, expired_orders },
        error: null
      };
    }

    if (funcName === 'finalize_order_payment') {
      const { p_order_id, p_payment_id, p_transaction_id, p_payment_method } = params;
      const order = this.tables.orders.find(o => o.id === p_order_id);
      if (!order) return { data: { success: false, error: 'Order not found' }, error: null };

      if (['paid', 'delivered'].includes(order.status)) {
        return { data: { success: true, already_processed: true, status: order.status }, error: null };
      }

      const items = this.tables.order_items.filter(i => i.order_id === p_order_id);
      for (const item of items) {
        if (item.inventory_type === 'account') {
          const inv = this.tables.account_inventory.find(a => a.id === item.inventory_item_id);
          if (inv) {
            inv.status = 'sold';
            inv.sold_at = new Date().toISOString();
          }
        } else {
          const inv = this.tables.code_inventory.find(c => c.id === item.inventory_item_id);
          if (inv) {
            inv.status = 'sold';
            inv.sold_at = new Date().toISOString();
          }
        }
      }

      const payment = this.tables.payments.find(p => p.id === p_payment_id || p.order_id === p_order_id);
      if (payment) {
        payment.status = 'paid';
        payment.transaction_id = p_transaction_id;
        payment.payment_method = p_payment_method || 'ABA PayWay';
        payment.verified_at = new Date().toISOString();
      }

      order.status = 'paid';
      order.paid_at = new Date().toISOString();

      return { data: { success: true, already_processed: false, order_id: p_order_id, status: 'paid' }, error: null };
    }

    if (funcName === 'add_profile_balance') {
      const { p_telegram_id, p_amount, p_ref, p_type = 'topup' } = params;
      let profile = this.tables.profiles.find(p => String(p.telegram_id) === String(p_telegram_id));
      if (!profile) {
        profile = {
          id: crypto.randomUUID(),
          telegram_id: Number(p_telegram_id),
          balance: 0.00,
          created_at: new Date().toISOString()
        };
        this.tables.profiles.push(profile);
      }

      const prevBalance = Number(profile.balance || 0);
      const newBalance = Number((prevBalance + Number(p_amount)).toFixed(2));
      profile.balance = newBalance;
      profile.updated_at = new Date().toISOString();

      let tx = this.tables.balance_transactions.find(t => t.reference_id === p_ref);
      if (tx) {
        tx.status = 'completed';
        tx.updated_at = new Date().toISOString();
      } else {
        this.tables.balance_transactions.push({
          id: crypto.randomUUID(),
          profile_id: profile.id,
          telegram_id: Number(p_telegram_id),
          amount: Number(p_amount),
          type: p_type,
          reference_id: p_ref,
          status: 'completed',
          created_at: new Date().toISOString()
        });
      }

      this.save();
      return {
        data: {
          success: true,
          previous_balance: prevBalance,
          added_amount: Number(p_amount),
          new_balance: newBalance
        },
        error: null
      };
    }

    if (funcName === 'deduct_profile_balance') {
      const { p_telegram_id, p_amount, p_ref } = params;
      const profile = this.tables.profiles.find(p => String(p.telegram_id) === String(p_telegram_id));
      if (!profile) return { data: { success: false, error: 'Profile not found' }, error: null };

      const currentBalance = Number(profile.balance || 0);
      if (currentBalance < Number(p_amount)) {
        return { data: { success: false, error: 'Insufficient wallet balance' }, error: null };
      }

      const newBalance = Number((currentBalance - Number(p_amount)).toFixed(2));
      profile.balance = newBalance;
      profile.updated_at = new Date().toISOString();

      this.tables.balance_transactions.push({
        id: crypto.randomUUID(),
        profile_id: profile.id,
        telegram_id: Number(p_telegram_id),
        amount: -Number(p_amount),
        type: 'purchase',
        reference_id: p_ref,
        status: 'completed',
        created_at: new Date().toISOString()
      });

      this.save();
      return {
        data: {
          success: true,
          previous_balance: currentBalance,
          deducted_amount: Number(p_amount),
          new_balance: newBalance
        },
        error: null
      };
    }

    return { data: null, error: null };
  }

  get storage() {
    return {
      from: (bucket) => ({
        upload: async (path, buffer, options) => {
          return { data: { path }, error: null };
        },
        getPublicUrl: (path) => ({
          data: { publicUrl: `/uploads/${path.split('/').pop()}` }
        })
      })
    };
  }
}

class LocalQueryBuilder {
  constructor(store, tableName) {
    this.store = store;
    this.tableName = tableName;
    this.filters = [];
    this.selectedFields = '*';
    this.isCountOnly = false;
    this.isSingle = false;
    this.limitCount = null;
    this.offsetIndex = 0;
  }

  select(fields = '*', options = {}) {
    this.selectedFields = fields;
    if (options.count) this.isCountOnly = true;
    return this;
  }

  eq(column, value) {
    this.filters.push(row => String(row[column]) === String(value));
    return this;
  }

  gt(column, value) {
    this.filters.push(row => row[column] > value);
    return this;
  }

  in(column, values) {
    this.filters.push(row => values.map(String).includes(String(row[column])));
    return this;
  }

  order(column, { ascending = true } = {}) {
    // sorting can be handled when resolving
    return this;
  }

  range(from, to) {
    this.offsetIndex = from;
    this.limitCount = to - from + 1;
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  maybeSingle() {
    this.isSingle = true;
    return this.resolve();
  }

  single() {
    this.isSingle = true;
    return this.resolve();
  }

  async resolve() {
    let rows = [...this.store.tables[this.tableName]];
    for (const f of this.filters) {
      rows = rows.filter(f);
    }

    const totalCount = rows.length;

    if (this.offsetIndex) {
      rows = rows.slice(this.offsetIndex);
    }
    if (this.limitCount !== null) {
      rows = rows.slice(0, this.limitCount);
    }

    // Attach relational joins if requested
    if (this.selectedFields.includes('categories')) {
      rows = rows.map(r => ({
        ...r,
        categories: this.store.tables.categories.find(c => c.id === r.category_id) || null
      }));
    }
    if (this.selectedFields.includes('products')) {
      rows = rows.map(r => ({
        ...r,
        products: this.store.tables.products.find(p => p.id === r.product_id) || null
      }));
    }
    if (this.selectedFields.includes('order_items')) {
      rows = rows.map(r => ({
        ...r,
        order_items: this.store.tables.order_items.filter(i => i.order_id === r.id)
      }));
    }
    if (this.selectedFields.includes('payments')) {
      rows = rows.map(r => ({
        ...r,
        payments: this.store.tables.payments.filter(p => p.order_id === r.id)
      }));
    }
    if (this.selectedFields.includes('profiles')) {
      rows = rows.map(r => ({
        ...r,
        profiles: this.store.tables.profiles.find(p => p.id === r.profile_id) || null
      }));
    }

    if (this.isSingle) {
      const data = rows[0] || null;
      return { data, count: totalCount, error: null };
    }

    return { data: rows, count: totalCount, error: null };
  }

  then(resolve, reject) {
    return this.resolve().then(resolve, reject);
  }

  insert(items) {
    const table = this.store.tables[this.tableName];
    const inserted = (Array.isArray(items) ? items : [items]).map(item => {
      const row = {
        id: item.id || crypto.randomUUID(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        ...item
      };
      table.push(row);
      return row;
    });

    this.store.save();
    return {
      select: () => ({
        single: async () => ({ data: inserted[0], error: null }),
        maybeSingle: async () => ({ data: inserted[0] || null, error: null }),
        then: (resolve) => resolve({ data: inserted, error: null })
      }),
      then: (resolve) => resolve({ data: inserted, error: null })
    };
  }

  upsert(items, options = {}) {
    const table = this.store.tables[this.tableName];
    const conflictCol = options.onConflict;
    const upserted = (Array.isArray(items) ? items : [items]).map(item => {
      let existingIndex = -1;
      if (conflictCol) {
        existingIndex = table.findIndex(r => String(r[conflictCol]) === String(item[conflictCol]));
      }
      if (existingIndex >= 0) {
        const merged = {
          ...table[existingIndex],
          ...item,
          updated_at: new Date().toISOString()
        };
        table[existingIndex] = merged;
        return merged;
      } else {
        const row = {
          id: item.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          ...item
        };
        table.push(row);
        return row;
      }
    });

    this.store.save();
    return {
      select: () => ({
        single: async () => ({ data: upserted[0], error: null }),
        maybeSingle: async () => ({ data: upserted[0] || null, error: null }),
        then: (resolve) => resolve({ data: upserted, error: null })
      }),
      then: (resolve) => resolve({ data: upserted, error: null })
    };
  }

  update(updates) {
    const table = this.store.tables[this.tableName];
    return {
      eq: (col, val) => {
        let updatedRow = null;
        for (const row of table) {
          if (String(row[col]) === String(val)) {
            Object.assign(row, updates, { updated_at: new Date().toISOString() });
            updatedRow = row;
          }
        }
        this.store.save();
        return {
          select: () => ({
            single: async () => ({ data: updatedRow, error: null }),
            then: (resolve) => resolve({ data: updatedRow ? [updatedRow] : [], error: null })
          }),
          then: (resolve) => resolve({ data: updatedRow ? [updatedRow] : [], error: null })
        };
      }
    };
  }

  delete() {
    return {
      eq: (col, val) => {
        const table = this.store.tables[this.tableName];
        if (table) {
          this.store.tables[this.tableName] = table.filter(r => String(r[col]) !== String(val));
        }
        this.store.save();
        return {
          select: () => ({
            single: () => Promise.resolve({ data: { success: true }, error: null }),
            then: (resolve) => resolve({ data: [{ success: true }], error: null })
          }),
          then: (resolve) => resolve({ data: null, error: null })
        };
      }
    };
  }
}

export const localDatabase = new LocalDatabaseStore();
