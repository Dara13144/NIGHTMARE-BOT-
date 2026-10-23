-- 001_initial_schema.sql
-- NIGHTMARE STORE Full Production Schema

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- Profiles (Telegram Users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    telegram_id BIGINT UNIQUE NOT NULL,
    username TEXT,
    first_name TEXT,
    last_name TEXT,
    language_code TEXT DEFAULT 'km',
    is_blocked BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_profiles_telegram_id ON profiles(telegram_id);

-- Admin Users for Dashboard
CREATE TABLE IF NOT EXISTS admin_users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'admin' CHECK (role IN ('admin', 'superadmin', 'support')),
    telegram_id BIGINT,
    is_active BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_admin_users_username ON admin_users(username);
CREATE INDEX IF NOT EXISTS idx_admin_users_email ON admin_users(email);

-- Categories
CREATE TABLE IF NOT EXISTS categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    display_order INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_categories_slug ON categories(slug);

-- Products Catalog
CREATE TABLE IF NOT EXISTS products (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
    type TEXT NOT NULL CHECK (type IN ('rockstar_account', 'rockstar_code')),
    title TEXT NOT NULL,
    description TEXT,
    image_url TEXT,
    price NUMERIC(10, 2) NOT NULL CHECK (price >= 0),
    currency TEXT DEFAULT 'USD',
    platform TEXT DEFAULT 'PC',
    region TEXT DEFAULT 'Global',
    features TEXT[] DEFAULT '{}',
    limitations TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_products_type ON products(type);
CREATE INDEX IF NOT EXISTS idx_products_is_active ON products(is_active);

-- Rockstar Account Inventory (Encrypted secrets)
CREATE TABLE IF NOT EXISTS account_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'disabled')),
    encrypted_payload TEXT NOT NULL, -- AES-256-GCM encrypted JSON payload
    reserved_order_id UUID,
    reserved_at TIMESTAMPTZ,
    reservation_expires_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_account_inv_prod_status ON account_inventory(product_id, status);
CREATE INDEX IF NOT EXISTS idx_account_inv_reservation ON account_inventory(status, reservation_expires_at);

-- Rockstar Activation Codes Inventory (Encrypted secrets)
CREATE TABLE IF NOT EXISTS code_inventory (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    product_id UUID NOT NULL REFERENCES products(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'reserved', 'sold', 'disabled')),
    code_hash TEXT UNIQUE NOT NULL, -- SHA-256 hex digest for duplicate prevention
    encrypted_payload TEXT NOT NULL, -- AES-256-GCM encrypted JSON payload
    reserved_order_id UUID,
    reserved_at TIMESTAMPTZ,
    reservation_expires_at TIMESTAMPTZ,
    sold_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_code_inv_prod_status ON code_inventory(product_id, status);
CREATE INDEX IF NOT EXISTS idx_code_inv_code_hash ON code_inventory(code_hash);
CREATE INDEX IF NOT EXISTS idx_code_inv_reservation ON code_inventory(status, reservation_expires_at);

-- Orders
CREATE TABLE IF NOT EXISTS orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_number TEXT UNIQUE NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    telegram_id BIGINT NOT NULL,
    total_amount NUMERIC(10, 2) NOT NULL CHECK (total_amount >= 0),
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'delivered', 'delivery_failed', 'failed', 'cancelled', 'expired', 'refunded')),
    reservation_expires_at TIMESTAMPTZ,
    paid_at TIMESTAMPTZ,
    delivered_at TIMESTAMPTZ,
    delivery_notes TEXT,
    delivery_chat_id BIGINT,
    delivery_message_id BIGINT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_orders_telegram_id ON orders(telegram_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_number ON orders(order_number);

-- Order Items
CREATE TABLE IF NOT EXISTS order_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    product_id UUID REFERENCES products(id) ON DELETE SET NULL,
    inventory_type TEXT NOT NULL CHECK (inventory_type IN ('account', 'code')),
    inventory_item_id UUID NOT NULL,
    price NUMERIC(10, 2) NOT NULL,
    product_title TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id ON order_items(order_id);

-- Payments (ABA PayWay)
CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
    merchant_order_ref TEXT UNIQUE NOT NULL,
    provider TEXT DEFAULT 'aba_payway',
    amount NUMERIC(10, 2) NOT NULL,
    currency TEXT DEFAULT 'USD',
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'paid', 'failed', 'cancelled', 'expired', 'refunded')),
    transaction_id TEXT,
    payment_method TEXT,
    checkout_url TEXT,
    qr_string TEXT,
    qr_image_url TEXT,
    raw_response JSONB,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_merchant_ref ON payments(merchant_order_ref);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);

-- Payment Events / Webhook Logs (Idempotency)
CREATE TABLE IF NOT EXISTS payment_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    payment_id UUID REFERENCES payments(id) ON DELETE SET NULL,
    event_type TEXT NOT NULL,
    idempotency_key TEXT UNIQUE,
    payload JSONB NOT NULL,
    is_valid BOOLEAN DEFAULT true,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_payment_events_key ON payment_events(idempotency_key);

-- Memberships
CREATE TABLE IF NOT EXISTS memberships (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    tier TEXT NOT NULL DEFAULT 'VIP' CHECK (tier IN ('VIP', 'PRO', 'ELITE')),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled')),
    discount_percentage NUMERIC(5, 2) DEFAULT 5.00,
    start_date TIMESTAMPTZ NOT NULL DEFAULT now(),
    end_date TIMESTAMPTZ NOT NULL,
    auto_renew BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_memberships_profile ON memberships(profile_id, status);

-- Promotions
CREATE TABLE IF NOT EXISTS promotions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    description TEXT,
    discount_percent NUMERIC(5, 2) CHECK (discount_percent > 0 AND discount_percent <= 100),
    max_uses INT,
    used_count INT DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    starts_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_promotions_code ON promotions(code);

-- Support Tickets
CREATE TABLE IF NOT EXISTS support_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_number TEXT UNIQUE NOT NULL,
    profile_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    telegram_id BIGINT NOT NULL,
    subject TEXT NOT NULL,
    message TEXT NOT NULL,
    status TEXT DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'resolved', 'closed')),
    admin_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_support_tickets_status ON support_tickets(status);

-- Audit Logs
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_user_id UUID REFERENCES admin_users(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    target_entity TEXT,
    target_id TEXT,
    details JSONB,
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Notification Jobs Queue
CREATE TABLE IF NOT EXISTS notification_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    chat_id BIGINT NOT NULL,
    message TEXT NOT NULL,
    parse_mode TEXT DEFAULT 'HTML',
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'failed')),
    attempts INT DEFAULT 0,
    error_message TEXT,
    scheduled_at TIMESTAMPTZ DEFAULT now(),
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notification_jobs_status ON notification_jobs(status, scheduled_at);
