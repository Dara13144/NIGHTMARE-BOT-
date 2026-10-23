import pg from 'pg';
const { Client } = pg;

async function fixFk() {
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
    -- Ensure order_items does not block product deletion
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;
    ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL;

    -- Ensure inventory tables cascade delete when a product is deleted
    ALTER TABLE code_inventory DROP CONSTRAINT IF EXISTS code_inventory_product_id_fkey;
    ALTER TABLE code_inventory ADD CONSTRAINT code_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;

    ALTER TABLE account_inventory DROP CONSTRAINT IF EXISTS account_inventory_product_id_fkey;
    ALTER TABLE account_inventory ADD CONSTRAINT account_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
  `;

  await client.query(sql);
  console.log('Successfully updated product foreign key constraints to ON DELETE SET NULL and CASCADE!');
  await client.end();
}

fixFk().catch(err => {
  console.error('Error fixing foreign keys:', err);
  process.exit(1);
});
