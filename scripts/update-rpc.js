import pg from 'pg';
const { Client } = pg;

async function updateRpc() {
  const client = new Client({
    host: 'aws-0-ap-southeast-1.pooler.supabase.com',
    port: 5432,
    user: 'postgres.otrdauyyhibxldqcfxqu',
    password: 'NIGHTMARESTORE1122',
    database: 'postgres',
    ssl: { rejectUnauthorized: false }
  });

  await client.connect();
  console.log('Connected to Supabase PostgreSQL!');

  const sql = `
  -- Drop old version with UUID parameter if exists
  DROP FUNCTION IF EXISTS reserve_product_inventory(UUID, UUID, TEXT, INT);

  -- Create new version with TEXT product_id
  CREATE OR REPLACE FUNCTION reserve_product_inventory(
      p_order_id UUID,
      p_product_id TEXT,
      p_inventory_type TEXT,
      p_duration_minutes INT DEFAULT 15
  )
  RETURNS JSONB
  LANGUAGE plpgsql
  SECURITY DEFINER
  AS $$
  DECLARE
      v_item_id UUID;
      v_product_title TEXT;
      v_price NUMERIC(10, 2);
      v_expires_at TIMESTAMPTZ;
  BEGIN
      -- Verify product exists and get details
      SELECT title, price INTO v_product_title, v_price
      FROM products
      WHERE id = p_product_id AND is_active = true;

      IF NOT FOUND THEN
          RETURN jsonb_build_object('success', false, 'error', 'Product not found or inactive');
      END IF;

      v_expires_at := now() + (p_duration_minutes || ' minutes')::interval;

      -- Atomically lock and reserve one available inventory item
      IF p_inventory_type = 'account' THEN
          SELECT id INTO v_item_id
          FROM account_inventory
          WHERE product_id = p_product_id AND status = 'available'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED;

          IF v_item_id IS NULL THEN
              RETURN jsonb_build_object('success', false, 'error', 'Out of stock');
          END IF;

          UPDATE account_inventory
          SET status = 'reserved',
              reserved_order_id = p_order_id,
              reserved_at = now(),
              reservation_expires_at = v_expires_at,
              updated_at = now()
          WHERE id = v_item_id;

      ELSIF p_inventory_type = 'code' THEN
          SELECT id INTO v_item_id
          FROM code_inventory
          WHERE product_id = p_product_id AND status = 'available'
          ORDER BY created_at ASC
          LIMIT 1
          FOR UPDATE SKIP LOCKED;

          IF v_item_id IS NULL THEN
              RETURN jsonb_build_object('success', false, 'error', 'Out of stock');
          END IF;

          UPDATE code_inventory
          SET status = 'reserved',
              reserved_order_id = p_order_id,
              reserved_at = now(),
              reservation_expires_at = v_expires_at,
              updated_at = now()
          WHERE id = v_item_id;
      ELSE
          RETURN jsonb_build_object('success', false, 'error', 'Invalid inventory type');
      END IF;

      -- Record Order Item
      INSERT INTO order_items (
          order_id,
          product_id,
          inventory_type,
          inventory_item_id,
          price,
          product_title
      ) VALUES (
          p_order_id,
          p_product_id,
          p_inventory_type,
          v_item_id,
          v_price,
          v_product_title
      );

      -- Update order reservation expiration
      UPDATE orders
      SET reservation_expires_at = v_expires_at,
          updated_at = now()
      WHERE id = p_order_id;

      RETURN jsonb_build_object(
          'success', true,
          'item_id', v_item_id,
          'inventory_type', p_inventory_type,
          'product_title', v_product_title,
          'price', v_price,
          'expires_at', v_expires_at
      );
  END;
  $$;
  `;

  await client.query(sql);
  console.log('Successfully updated reserve_product_inventory RPC on Supabase!');
  await client.end();
}

updateRpc().catch(err => {
  console.error('Error updating RPC:', err);
  process.exit(1);
});
