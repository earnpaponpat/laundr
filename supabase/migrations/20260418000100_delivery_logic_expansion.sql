-- ============================================================
-- Delivery/Production Business Logic Expansion
-- Date: 2026-04-18
-- Applies requested SQL in exact order
-- ============================================================

-- ━━━ 1. Expand linen_items status ━━━
-- Backup check first
SELECT DISTINCT status FROM linen_items;

-- Remove old constraint
ALTER TABLE linen_items
DROP CONSTRAINT IF EXISTS linen_items_status_check;

-- Migrate existing statuses to the new lifecycle first
-- Old -> New mapping:
-- in_stock -> clean
-- in_transit -> out
-- quality_check -> dirty
UPDATE linen_items SET status = 'clean'
WHERE status = 'in_stock';

UPDATE linen_items SET status = 'out'
WHERE status = 'in_transit';

UPDATE linen_items SET status = 'dirty'
WHERE status = 'quality_check';

-- Add new constraint with full lifecycle statuses
ALTER TABLE linen_items
ADD CONSTRAINT linen_items_status_check
CHECK (status IN (
  'clean',     -- พร้อมส่ง (เดิมคือ in_stock)
  'out',       -- อยู่ที่ client
  'dirty',     -- รับกลับแล้ว รอซัก
  'washing',   -- ในเครื่องซัก
  'drying',    -- ในเครื่องอบ
  'folding',   -- รอ QC
  'rewash',    -- ต้องซักซ้ำ
  'rejected',  -- เสียหาย
  'lost'       -- หาย
));

-- ━━━ 2. Add current_batch_id to linen_items ━━━
ALTER TABLE linen_items
ADD COLUMN IF NOT EXISTS current_batch_id uuid
REFERENCES delivery_batches(id)
DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_linen_items_current_batch
ON linen_items(current_batch_id)
WHERE current_batch_id IS NOT NULL;

-- ━━━ 3. Create delivery_orders table ━━━
CREATE TABLE IF NOT EXISTS delivery_orders (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) NOT NULL,
  order_number text NOT NULL,
  client_id uuid REFERENCES clients(id) NOT NULL,
  driver_id uuid REFERENCES profiles(id),
  vehicle_plate text,
  scheduled_date date NOT NULL,
  status text DEFAULT 'draft' NOT NULL,
  notes text,
  created_by uuid REFERENCES profiles(id),
  created_at timestamptz DEFAULT now(),
  dispatched_at timestamptz,
  completed_at timestamptz,
  CONSTRAINT delivery_orders_status_check
  CHECK (status IN (
    'draft','picking','ready',
    'dispatched','completed','cancelled'
  ))
);

CREATE TABLE IF NOT EXISTS delivery_order_items (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id uuid REFERENCES delivery_orders(id) ON DELETE CASCADE,
  category_id uuid REFERENCES linen_categories(id),
  requested_qty int NOT NULL DEFAULT 0,
  picked_qty int NOT NULL DEFAULT 0,
  returned_qty int NOT NULL DEFAULT 0,
  CONSTRAINT positive_qty CHECK (requested_qty >= 0)
);

-- ━━━ 4. Add order_id to delivery_batches ━━━
ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS order_id uuid
REFERENCES delivery_orders(id);

ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS batch_type text DEFAULT 'outbound'
CHECK (batch_type IN ('outbound','inbound'));

ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS weight_kg numeric;

ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- ━━━ 5. Create production_batches table ━━━
CREATE TABLE IF NOT EXISTS production_batches (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) NOT NULL,
  inbound_batch_id uuid REFERENCES delivery_batches(id),
  status text DEFAULT 'queued' NOT NULL,
  CHECK (status IN (
    'queued','washing','drying','folding','completed'
  )),
  wash_started_at timestamptz,
  wash_completed_at timestamptz,
  dry_started_at timestamptz,
  dry_completed_at timestamptz,
  fold_started_at timestamptz,
  qc_passed int DEFAULT 0,
  qc_rewash int DEFAULT 0,
  qc_rejected int DEFAULT 0,
  qc_by uuid REFERENCES profiles(id),
  qc_at timestamptz,
  created_at timestamptz DEFAULT now()
);

-- ━━━ 6. Create client_par_levels table ━━━
CREATE TABLE IF NOT EXISTS client_par_levels (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) NOT NULL,
  client_id uuid REFERENCES clients(id) NOT NULL,
  category_id uuid REFERENCES linen_categories(id) NOT NULL,
  par_quantity int NOT NULL DEFAULT 0,
  safety_buffer_pct int DEFAULT 10,
  created_at timestamptz DEFAULT now(),
  UNIQUE(client_id, category_id)
);

-- ━━━ 7. Add new scan event types ━━━
ALTER TABLE scan_events
DROP CONSTRAINT IF EXISTS scan_events_event_type_check;

-- Migrate existing event types to the new lifecycle first
-- Old -> New mapping:
-- delivery_signed -> dispatch
-- inspection_pass -> qc_pass
-- inspection_fail -> qc_rewash
UPDATE scan_events SET event_type = 'dispatch'
WHERE event_type = 'delivery_signed';

UPDATE scan_events SET event_type = 'qc_pass'
WHERE event_type = 'inspection_pass';

UPDATE scan_events SET event_type = 'qc_rewash'
WHERE event_type = 'inspection_fail';

ALTER TABLE scan_events
ADD CONSTRAINT scan_events_event_type_check
CHECK (event_type IN (
  'checkout',    -- picking stage, item enters batch
  'dispatch',    -- truck leaves factory
  'checkin',     -- item returns dirty
  'qc_pass',     -- QC passed, item becomes clean
  'qc_rewash',   -- needs rewash
  'qc_reject',   -- permanently rejected
  'wash_start',  -- entered washing machine
  'wash_done',   -- washing complete
  'dry_done',    -- drying complete
  'audit',       -- stock count
  'rewash',      -- flagged for rewash
  'reject',      -- flagged as rejected
  'found'        -- lost item found
));

ALTER TABLE scan_events
ADD COLUMN IF NOT EXISTS weight_kg numeric;

-- ━━━ 8. Add auto order_number generation ━━━
CREATE OR REPLACE FUNCTION generate_order_number()
RETURNS TRIGGER AS $$
DECLARE
  next_num int;
  year_str text;
BEGIN
  year_str := TO_CHAR(NOW(), 'YYYY');
  SELECT COUNT(*) + 1 INTO next_num
  FROM delivery_orders
  WHERE org_id = NEW.org_id
  AND EXTRACT(YEAR FROM created_at) = EXTRACT(YEAR FROM NOW());

  NEW.order_number := 'DO-' || year_str || '-' ||
                      LPAD(next_num::text, 4, '0');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_order_number ON delivery_orders;
CREATE TRIGGER set_order_number
BEFORE INSERT ON delivery_orders
FOR EACH ROW EXECUTE FUNCTION generate_order_number();

-- ━━━ 9. Enable RLS on new tables ━━━
ALTER TABLE delivery_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_order_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE production_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE client_par_levels ENABLE ROW LEVEL SECURITY;

-- RLS policies (users see only their org)
DROP POLICY IF EXISTS "org_isolation" ON delivery_orders;
CREATE POLICY "org_isolation" ON delivery_orders
  USING (org_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "org_isolation" ON delivery_order_items;
CREATE POLICY "org_isolation" ON delivery_order_items
  USING (order_id IN (
    SELECT id FROM delivery_orders WHERE org_id = (
      SELECT org_id FROM profiles WHERE id = auth.uid()
    )
  ));

DROP POLICY IF EXISTS "org_isolation" ON production_batches;
CREATE POLICY "org_isolation" ON production_batches
  USING (org_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));

DROP POLICY IF EXISTS "org_isolation" ON client_par_levels;
CREATE POLICY "org_isolation" ON client_par_levels
  USING (org_id = (
    SELECT org_id FROM profiles WHERE id = auth.uid()
  ));
