import { supabase } from '../config/supabase.js';
import { logger } from '../utils/logger.js';

export class ProductService {
  /**
   * Fetch active categories
   */
  static async getCategories() {
    const { data, error } = await supabase
      .from('categories')
      .select('*')
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) {
      logger.error({ error }, 'Error fetching categories');
      return [];
    }
    return data || [];
  }

  /**
   * Fetch products with live stock calculation
   * @param {object} filter { type, category_id, is_active }
   */
  static async getProducts(filter = {}) {
    let query = supabase.from('products').select(`
      *,
      categories (id, name, slug)
    `);

    if (filter.type) query = query.eq('type', filter.type);
    if (filter.category_id) query = query.eq('category_id', filter.category_id);
    if (typeof filter.is_active === 'boolean') query = query.eq('is_active', filter.is_active);

    query = query.order('created_at', { ascending: false });

    const { data: products, error } = await query;
    if (error) {
      logger.error({ error }, 'Error fetching products');
      return [];
    }

    // Attach real stock count for each product
    const productsWithStock = await Promise.all(
      (products || []).map(async (prod) => {
        let stockCount = 0;
        if (prod.type === 'rockstar_account') {
          const { count } = await supabase
            .from('account_inventory')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', prod.id)
            .eq('status', 'available');
          stockCount = count || 0;
        } else if (prod.type === 'rockstar_code') {
          const { count } = await supabase
            .from('code_inventory')
            .select('*', { count: 'exact', head: true })
            .eq('product_id', prod.id)
            .eq('status', 'available');
          stockCount = count || 0;
        }
        return {
          ...prod,
          stock: stockCount,
          image_url: prod.image_url || '/images/default-product.png'
        };
      })
    );

    return productsWithStock;
  }

  /**
   * Get single product by ID with stock
   */
  static async getProductById(id) {
    const { data: product, error } = await supabase
      .from('products')
      .select(`
        *,
        categories (id, name, slug)
      `)
      .eq('id', id)
      .single();

    if (error || !product) {
      logger.warn({ id, error }, 'Product not found');
      return null;
    }

    let stockCount = 0;
    if (product.type === 'rockstar_account') {
      const { count } = await supabase
        .from('account_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', product.id)
        .eq('status', 'available');
      stockCount = count || 0;
    } else {
      const { count } = await supabase
        .from('code_inventory')
        .select('*', { count: 'exact', head: true })
        .eq('product_id', product.id)
        .eq('status', 'available');
      stockCount = count || 0;
    }

    return {
      ...product,
      stock: stockCount,
      image_url: product.image_url || '/images/default-product.png'
    };
  }

  /**
   * Create a new product
   */
  static async createProduct(productData) {
    const { data, error } = await supabase
      .from('products')
      .insert([productData])
      .select()
      .single();

    if (error) {
      logger.error({ error, productData }, 'Failed to create product');
      throw new Error(`Failed to create product: ${error.message}`);
    }

    return data;
  }

  /**
   * Update an existing product
   */
  static async updateProduct(id, updates) {
    const { data, error } = await supabase
      .from('products')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      logger.error({ error, id }, 'Failed to update product');
      throw new Error(`Failed to update product: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete product cleanly cascading inventory and nullifying order_items
   */
  static async deleteProduct(id) {
    // 1. Delete associated inventory items (codes and accounts)
    await supabase.from('code_inventory').delete().eq('product_id', id);
    await supabase.from('account_inventory').delete().eq('product_id', id);

    // 2. Set product_id to NULL on existing order items so historical orders remain intact
    await supabase.from('order_items').update({ product_id: null }).eq('product_id', id);

    // 3. Delete the product row
    const { error } = await supabase.from('products').delete().eq('id', id);
    if (error) {
      logger.error({ error, id }, 'Failed to delete product');
      throw new Error(`Failed to delete product: ${error.message}`);
    }

    logger.info({ id }, 'Product permanently deleted successfully');
    return true;
  }
}
