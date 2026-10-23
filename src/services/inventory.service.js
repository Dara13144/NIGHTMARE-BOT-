import { supabase } from '../config/supabase.js';
import { encryptPayload, hashSecret } from '../utils/encryption.js';
import { logger } from '../utils/logger.js';

export class InventoryService {
  /**
   * Add a single Rockstar Account to inventory
   */
  static async addAccountItem({ product_id, email, password, email_password, recovery_info, notes }) {
    const payload = {
      email,
      password,
      email_password: email_password || '',
      recovery_info: recovery_info || '',
      added_at: new Date().toISOString()
    };

    const encrypted = encryptPayload(payload);

    const { data, error } = await supabase
      .from('account_inventory')
      .insert([{
        product_id,
        status: 'available',
        encrypted_payload: encrypted,
        notes: notes || null
      }])
      .select('id, product_id, status, created_at')
      .single();

    if (error) {
      logger.error({ error, product_id }, 'Failed to insert account inventory');
      throw new Error(`Failed to add account: ${error.message}`);
    }

    return data;
  }

  /**
   * Add a single Rockstar Code to inventory with duplicate prevention
   */
  static async addCodeItem({ product_id, code }) {
    const cleanCode = String(code).trim().toUpperCase();
    const codeHash = hashSecret(cleanCode);

    // Check duplicate
    const { data: existing } = await supabase
      .from('code_inventory')
      .select('id')
      .eq('code_hash', codeHash)
      .maybeSingle();

    if (existing) {
      throw new Error(`Code has already been added to inventory previously.`);
    }

    const payload = { code: cleanCode, added_at: new Date().toISOString() };
    const encrypted = encryptPayload(payload);

    const { data, error } = await supabase
      .from('code_inventory')
      .insert([{
        product_id,
        status: 'available',
        code_hash: codeHash,
        encrypted_payload: encrypted
      }])
      .select('id, product_id, status, created_at')
      .single();

    if (error) {
      logger.error({ error, product_id }, 'Failed to insert code inventory');
      throw new Error(`Failed to add code: ${error.message}`);
    }

    return data;
  }

  /**
   * Bulk import codes from parsed text or CSV
   * @param {string} productId 
   * @param {string[]} codeList 
   */
  static async bulkImportCodes(productId, codeList) {
    const results = {
      total: codeList.length,
      successCount: 0,
      duplicateCount: 0,
      errors: []
    };

    const seenInBatch = new Set();
    const rowsToInsert = [];

    for (const rawCode of codeList) {
      const code = String(rawCode).trim().toUpperCase();
      if (!code || code.length < 4) continue;

      const codeHash = hashSecret(code);
      if (seenInBatch.has(codeHash)) {
        results.duplicateCount++;
        continue;
      }
      seenInBatch.add(codeHash);

      const payload = { code, added_at: new Date().toISOString() };
      rowsToInsert.push({
        product_id: productId,
        status: 'available',
        code_hash: codeHash,
        encrypted_payload: encryptPayload(payload)
      });
    }

    if (rowsToInsert.length === 0) {
      return results;
    }

    // Insert in batches of 100
    for (let i = 0; i < rowsToInsert.length; i += 100) {
      const batch = rowsToInsert.slice(i, i + 100);
      const { data, error } = await supabase
        .from('code_inventory')
        .insert(batch)
        .select('id');

      if (error) {
        // If unique constraint error, some items were duplicates
        logger.warn({ error }, 'Batch code insert encountered error, checking individual items');
        for (const item of batch) {
          try {
            await supabase.from('code_inventory').insert([item]);
            results.successCount++;
          } catch {
            results.duplicateCount++;
          }
        }
      } else {
        results.successCount += (data ? data.length : batch.length);
      }
    }

    return results;
  }

  /**
   * Atomically reserve inventory item for an order
   */
  static async reserveInventory(orderId, productId, inventoryType, durationMinutes = 15) {
    const { data, error } = await supabase.rpc('reserve_product_inventory', {
      p_order_id: orderId,
      p_product_id: productId,
      p_inventory_type: inventoryType,
      p_duration_minutes: durationMinutes
    });

    if (error) {
      logger.error({ error, orderId, productId }, 'RPC reserve_product_inventory failed');
      throw new Error(`Inventory reservation failed: ${error.message}`);
    }

    if (!data || !data.success) {
      throw new Error(data?.error || 'Item is out of stock');
    }

    return data;
  }

  /**
   * Release all expired inventory reservations
   */
  static async releaseExpiredReservations() {
    const { data, error } = await supabase.rpc('release_expired_reservations');
    if (error) {
      logger.error({ error }, 'RPC release_expired_reservations failed');
      return { released_accounts: 0, released_codes: 0, expired_orders: 0 };
    }
    return data;
  }

  /**
   * Disable a compromised inventory item
   */
  static async disableItem(inventoryType, itemId) {
    const table = inventoryType === 'account' ? 'account_inventory' : 'code_inventory';
    const { data, error } = await supabase
      .from(table)
      .update({ status: 'disabled', updated_at: new Date().toISOString() })
      .eq('id', itemId)
      .select('id, status')
      .single();

    if (error) {
      throw new Error(`Failed to disable inventory item: ${error.message}`);
    }
    return data;
  }

  /**
   * Fetch inventory items for admin view (never returns decrypted secrets)
   */
  static async getInventoryList(inventoryType, { status, productId, limit = 50, offset = 0 } = {}) {
    const table = inventoryType === 'account' ? 'account_inventory' : 'code_inventory';
    let query = supabase.from(table).select(`
      id,
      product_id,
      status,
      reserved_order_id,
      reserved_at,
      reservation_expires_at,
      sold_at,
      created_at,
      products (title, type, price)
    `, { count: 'exact' });

    if (status) query = query.eq('status', status);
    if (productId) query = query.eq('product_id', productId);

    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, count, error } = await query;
    if (error) {
      logger.error({ error, table }, 'Failed to fetch inventory list');
      return { items: [], total: 0 };
    }

    return { items: data || [], total: count || 0 };
  }

  /**
   * Delete an available inventory item by ID
   */
  static async deleteItem(inventoryType, itemId) {
    const table = inventoryType === 'account' ? 'account_inventory' : 'code_inventory';
    const { error } = await supabase
      .from(table)
      .delete()
      .eq('id', itemId);

    if (error) {
      throw new Error(`Failed to delete inventory item: ${error.message}`);
    }
    return true;
  }

  /**
   * Delete code by raw code string
   */
  static async deleteCode(rawCode) {
    const cleanCode = String(rawCode).trim().toUpperCase();
    const codeHash = hashSecret(cleanCode);
    const { error } = await supabase
      .from('code_inventory')
      .delete()
      .eq('code_hash', codeHash);

    if (error) {
      throw new Error(`Failed to delete code: ${error.message}`);
    }
    return true;
  }
}

