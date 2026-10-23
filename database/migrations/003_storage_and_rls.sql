-- 003_storage_and_rls.sql
-- Row Level Security (RLS) & Storage Policies for NIGHTMARE STORE

-- 1. Enable Row Level Security (RLS)
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_users ENABLE ROW LEVEL SECURITY;
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE account_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE code_inventory ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
ALTER TABLE promotions ENABLE ROW LEVEL SECURITY;
ALTER TABLE support_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_jobs ENABLE ROW LEVEL SECURITY;

-- 2. Allow Service Role Full Access on all tables (Backend Server Uses Service Role)
CREATE POLICY service_role_all_profiles ON profiles TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_admin_users ON admin_users TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_categories ON categories TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_products ON products TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_account_inv ON account_inventory TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_code_inv ON code_inventory TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_orders ON orders TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_order_items ON order_items TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_payments ON payments TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_payment_events ON payment_events TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_memberships ON memberships TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_promotions ON promotions TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_support_tickets ON support_tickets TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_audit_logs ON audit_logs TO service_role USING (true) WITH CHECK (true);
CREATE POLICY service_role_all_notification_jobs ON notification_jobs TO service_role USING (true) WITH CHECK (true);

-- 3. Public Read Policies for Catalog Browsing
CREATE POLICY public_read_active_categories ON categories FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY public_read_active_products ON products FOR SELECT TO anon, authenticated USING (is_active = true);

-- CRITICAL: Zero public access to account_inventory and code_inventory (Strict Zero Trust)
-- Any public / anon access to account_inventory or code_inventory will be rejected by RLS.

-- 4. Supabase Storage Setup (Run if storage extension is available)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'product-images',
    'product-images',
    true,
    5242880, -- 5MB limit
    ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif']
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

-- Storage Policies for product-images bucket
CREATE POLICY "Public Access To Product Images"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'product-images');

CREATE POLICY "Service Role Upload Product Images"
ON storage.objects FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'product-images');

CREATE POLICY "Service Role Update Product Images"
ON storage.objects FOR UPDATE
TO service_role
USING (bucket_id = 'product-images');

CREATE POLICY "Service Role Delete Product Images"
ON storage.objects FOR DELETE
TO service_role
USING (bucket_id = 'product-images');
