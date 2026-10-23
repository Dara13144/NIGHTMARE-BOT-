-- 004_wallet_balance.sql
-- In-app Customer Wallet & Balance System

-- 1. Add balance column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS balance NUMERIC(10, 2) DEFAULT 0.00 CHECK (balance >= 0.00);

-- 2. Balance Transactions Ledger
CREATE TABLE IF NOT EXISTS balance_transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
    telegram_id BIGINT NOT NULL,
    amount NUMERIC(10, 2) NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('topup', 'purchase', 'admin_adjustment', 'refund')),
    reference_id TEXT UNIQUE NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed', 'cancelled')),
    checkout_url TEXT,
    payment_id TEXT,
    qr_string TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_balance_tx_telegram ON balance_transactions(telegram_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_ref ON balance_transactions(reference_id);
CREATE INDEX IF NOT EXISTS idx_balance_tx_status ON balance_transactions(status);

-- 3. Atomic Function to Add Balance
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
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    v_new_balance := COALESCE(v_profile.balance, 0.00) + p_amount;

    UPDATE profiles
    SET balance = v_new_balance,
        updated_at = now()
    WHERE telegram_id = p_telegram_id;

    UPDATE balance_transactions
    SET status = 'completed',
        updated_at = now()
    WHERE reference_id = p_ref;

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', v_profile.balance,
        'added_amount', p_amount,
        'new_balance', v_new_balance
    );
END;
$$;

-- 4. Atomic Function to Deduct Balance for Purchases
CREATE OR REPLACE FUNCTION deduct_profile_balance(
    p_telegram_id BIGINT,
    p_amount NUMERIC,
    p_ref TEXT
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
        RETURN jsonb_build_object('success', false, 'error', 'Profile not found');
    END IF;

    IF COALESCE(v_profile.balance, 0.00) < p_amount THEN
        RETURN jsonb_build_object('success', false, 'error', 'Insufficient wallet balance');
    END IF;

    v_new_balance := v_profile.balance - p_amount;

    UPDATE profiles
    SET balance = v_new_balance,
        updated_at = now()
    WHERE telegram_id = p_telegram_id;

    INSERT INTO balance_transactions (
        profile_id,
        telegram_id,
        amount,
        type,
        reference_id,
        status,
        notes
    ) VALUES (
        v_profile.id,
        p_telegram_id,
        -p_amount,
        'purchase',
        p_ref,
        'completed',
        'In-app purchase with wallet balance'
    );

    RETURN jsonb_build_object(
        'success', true,
        'previous_balance', v_profile.balance,
        'deducted_amount', p_amount,
        'new_balance', v_new_balance
    );
END;
$$;
