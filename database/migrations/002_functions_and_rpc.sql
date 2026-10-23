-- 002_functions_and_rpc.sql
-- Transaction-safe PostgreSQL RPC functions for NIGHTMARE STORE

-- 1. Reserve Product Inventory Atomically
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

-- 2. Safely Release Expired Reservations
CREATE OR REPLACE FUNCTION release_expired_reservations()
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_released_accounts INT := 0;
    v_released_codes INT := 0;
    v_expired_orders INT := 0;
BEGIN
    -- Release expired account reservations
    WITH released AS (
        UPDATE account_inventory
        SET status = 'available',
            reserved_order_id = NULL,
            reserved_at = NULL,
            reservation_expires_at = NULL,
            updated_at = now()
        WHERE status = 'reserved' AND reservation_expires_at < now()
        RETURNING id
    )
    SELECT count(*) INTO v_released_accounts FROM released;

    -- Release expired code reservations
    WITH released AS (
        UPDATE code_inventory
        SET status = 'available',
            reserved_order_id = NULL,
            reserved_at = NULL,
            reservation_expires_at = NULL,
            updated_at = now()
        WHERE status = 'reserved' AND reservation_expires_at < now()
        RETURNING id
    )
    SELECT count(*) INTO v_released_codes FROM released;

    -- Mark related pending orders as expired
    WITH expired AS (
        UPDATE orders
        SET status = 'expired',
            updated_at = now()
        WHERE status = 'pending' AND reservation_expires_at < now()
        RETURNING id
    )
    SELECT count(*) INTO v_expired_orders FROM expired;

    -- Mark related pending payments as expired
    UPDATE payments
    SET status = 'expired',
        updated_at = now()
    WHERE status = 'pending' AND order_id IN (
        SELECT id FROM orders WHERE status = 'expired'
    );

    RETURN jsonb_build_object(
        'released_accounts', v_released_accounts,
        'released_codes', v_released_codes,
        'expired_orders', v_expired_orders
    );
END;
$$;

-- 3. Atomically Finalize Order and Mark Inventory Sold
CREATE OR REPLACE FUNCTION finalize_order_payment(
    p_order_id UUID,
    p_payment_id UUID,
    p_transaction_id TEXT,
    p_payment_method TEXT DEFAULT 'ABA PayWay'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_order RECORD;
    v_item RECORD;
BEGIN
    -- Lock order row
    SELECT * INTO v_order
    FROM orders
    WHERE id = p_order_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Order not found');
    END IF;

    -- Check if already finalized (Idempotency)
    IF v_order.status IN ('paid', 'delivered') THEN
        RETURN jsonb_build_object('success', true, 'already_processed', true, 'status', v_order.status);
    END IF;

    -- Mark order items as permanently sold
    FOR v_item IN SELECT * FROM order_items WHERE order_id = p_order_id LOOP
        IF v_item.inventory_type = 'account' THEN
            UPDATE account_inventory
            SET status = 'sold',
                sold_at = now(),
                reservation_expires_at = NULL,
                updated_at = now()
            WHERE id = v_item.inventory_item_id;
        ELSIF v_item.inventory_type = 'code' THEN
            UPDATE code_inventory
            SET status = 'sold',
                sold_at = now(),
                reservation_expires_at = NULL,
                updated_at = now()
            WHERE id = v_item.inventory_item_id;
        END IF;
    END LOOP;

    -- Update payment
    UPDATE payments
    SET status = 'paid',
        transaction_id = p_transaction_id,
        payment_method = p_payment_method,
        verified_at = now(),
        updated_at = now()
    WHERE (p_payment_id IS NOT NULL AND id = p_payment_id)
       OR (p_payment_id IS NULL AND order_id = p_order_id);

    -- Update order to paid
    UPDATE orders
    SET status = 'paid',
        paid_at = now(),
        updated_at = now()
    WHERE id = p_order_id;

    RETURN jsonb_build_object(
        'success', true,
        'already_processed', false,
        'order_id', p_order_id,
        'status', 'paid'
    );
END;
$$;
