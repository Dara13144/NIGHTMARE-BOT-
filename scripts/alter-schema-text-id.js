import pg from 'pg';
const { Client } = pg;

async function alterSchema() {
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
    -- Allow TEXT IDs for flexible product identifiers
    ALTER TABLE code_inventory DROP CONSTRAINT IF EXISTS code_inventory_product_id_fkey;
    ALTER TABLE account_inventory DROP CONSTRAINT IF EXISTS account_inventory_product_id_fkey;
    ALTER TABLE order_items DROP CONSTRAINT IF EXISTS order_items_product_id_fkey;

    ALTER TABLE products ALTER COLUMN id TYPE TEXT USING id::text;
    ALTER TABLE products ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;

    ALTER TABLE code_inventory ALTER COLUMN product_id TYPE TEXT USING product_id::text;
    ALTER TABLE account_inventory ALTER COLUMN product_id TYPE TEXT USING product_id::text;
    ALTER TABLE order_items ALTER COLUMN product_id TYPE TEXT USING product_id::text;

    ALTER TABLE code_inventory ADD CONSTRAINT code_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    ALTER TABLE account_inventory ADD CONSTRAINT account_inventory_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE;
    ALTER TABLE order_items ADD CONSTRAINT order_items_product_id_fkey FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE RESTRICT;

    -- Update add_profile_balance to auto-create profile if missing
    CREATE OR REPLACE FUNCTION add_profile_balance(
        p_telegram_id BIGINT,
        p_amount NUMERIC,
        p_ref TEXT,
        p_type TEXT DEFAULT 'topup'
    )
    RETURNS JSONB
    LANGUAGE plpgsql
    SECURITY DEFINER
    AS $$
    DECLARE
        v_profile RECORD;
        v_new_balance NUMERIC(10, 2);
    BEGIN
        SELECT * INTO v_profile FROM profiles WHERE telegram_id = p_telegram_id FOR UPDATE;

        IF NOT FOUND THEN
            INSERT INTO profiles (telegram_id, balance, first_name)
            VALUES (p_telegram_id, p_amount, 'Customer')
            RETURNING * INTO v_profile;
            v_new_balance := p_amount;
        ELSE
            v_new_balance := COALESCE(v_profile.balance, 0.00) + p_amount;
            UPDATE profiles
            SET balance = v_new_balance,
                updated_at = now()
            WHERE telegram_id = p_telegram_id;
        END IF;

        UPDATE balance_transactions
        SET status = 'completed',
            updated_at = now()
        WHERE reference_id = p_ref;

        RETURN jsonb_build_object(
            'success', true,
            'telegram_id', p_telegram_id,
            'previous_balance', COALESCE(v_profile.balance, 0.00),
            'new_balance', v_new_balance,
            'amount_added', p_amount,
            'reference_id', p_ref
        );
    END;
    $$;
  `;

  await client.query(sql);
  console.log('Schema successfully upgraded to flexible TEXT IDs & resilient auto-profile creation!');

  await client.end();
}

alterSchema().catch(err => {
  console.error('Alter failed:', err.message);
  process.exit(1);
});
