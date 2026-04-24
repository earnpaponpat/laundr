-- ============================================================
-- Integrity & correctness fixes
-- Date: 2026-04-18
-- ============================================================

-- ━━━ 1. Fix order_number trigger to use Asia/Bangkok timezone ━━━
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num int;
  year_str text;
  bkk_now timestamptz;
BEGIN
  bkk_now := NOW() AT TIME ZONE 'Asia/Bangkok';
  year_str := TO_CHAR(bkk_now, 'YYYY');

  SELECT COUNT(*) + 1 INTO next_num
  FROM delivery_orders
  WHERE org_id = NEW.org_id
    AND EXTRACT(YEAR FROM (created_at AT TIME ZONE 'Asia/Bangkok')) = EXTRACT(YEAR FROM bkk_now);

  NEW.order_number := 'DO-' || year_str || '-' || LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger is already created in migration 000100; replace function is enough.

-- ━━━ 2. Add ON DELETE CASCADE to delivery_batches.order_id ━━━
-- Drop existing FK then re-add with CASCADE
ALTER TABLE delivery_batches
  DROP CONSTRAINT IF EXISTS delivery_batches_order_id_fkey;

ALTER TABLE delivery_batches
  ADD CONSTRAINT delivery_batches_order_id_fkey
  FOREIGN KEY (order_id)
  REFERENCES delivery_orders(id)
  ON DELETE CASCADE;

-- ━━━ 3. Add CHECK constraint: par_quantity >= 0 ━━━
ALTER TABLE client_par_levels
  DROP CONSTRAINT IF EXISTS client_par_levels_par_quantity_check;

ALTER TABLE client_par_levels
  ADD CONSTRAINT client_par_levels_par_quantity_check
  CHECK (par_quantity >= 0);

-- ━━━ 4. Composite index for getActiveSessionForOrder queries ━━━
CREATE INDEX IF NOT EXISTS idx_active_sessions_order_type_active
ON active_sessions(order_id, session_type, is_active);
