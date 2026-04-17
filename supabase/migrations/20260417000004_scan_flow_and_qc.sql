-- ============================================================
-- SCAN FLOW & QUALITY CONTROL
-- Adds: in_transit, quality_check statuses
-- Adds: delivery_signed, inspection_pass, inspection_fail event types
-- Moves wash_count increment from checkin → inspection_pass
-- ============================================================

-- 1. Expand linen_items status enum
ALTER TABLE linen_items DROP CONSTRAINT linen_items_status_check;
ALTER TABLE linen_items ADD CONSTRAINT linen_items_status_check
  CHECK (status IN ('in_stock', 'in_transit', 'out', 'quality_check', 'rewash', 'rejected', 'lost'));

-- 2. Expand scan_events event_type enum
ALTER TABLE scan_events DROP CONSTRAINT scan_events_event_type_check;
ALTER TABLE scan_events ADD CONSTRAINT scan_events_event_type_check
  CHECK (event_type IN (
    'checkout',
    'delivery_signed',
    'checkin',
    'inspection_pass',
    'inspection_fail',
    'rewash',
    'reject',
    'audit'
  ));

-- 3. Replace trigger to handle full status flow
--
-- Correct operational flow:
--   checkout        → in_transit  (item on truck, not yet at client)
--   delivery_signed → out         (manifest signed, item now at client site)
--   checkin         → quality_check (item physically back at factory, awaiting inspection)
--   inspection_pass → in_stock    (clean, verified — wash_count increments HERE)
--   inspection_fail → rewash      (stained/damaged, goes to rewash queue)
--   rewash          → rewash      (direct rewash override, e.g. from rewash page)
--   reject          → rejected    (terminal state)
--   audit           → (no status change, only updates last_scan_at)
--
CREATE OR REPLACE FUNCTION process_scan_event()
RETURNS TRIGGER AS $$
BEGIN

  IF NEW.event_type = 'checkout' THEN
    UPDATE linen_items
    SET status = 'in_transit',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'delivery_signed' THEN
    UPDATE linen_items
    SET status = 'out',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'checkin' THEN
    -- Item arrives at factory gate — hold in quality_check until inspected
    -- wash_count is NOT incremented here; it increments on inspection_pass
    UPDATE linen_items
    SET status = 'quality_check',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'inspection_pass' THEN
    -- Item passed quality check: clean, usable, back in stock
    UPDATE linen_items
    SET status = 'in_stock',
        wash_count = wash_count + 1,
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'inspection_fail' THEN
    -- Item failed quality check: stained/damaged, send to rewash queue
    UPDATE linen_items
    SET status = 'rewash',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'rewash' THEN
    -- Manual rewash override (e.g. staff adds item directly to rewash page)
    UPDATE linen_items
    SET status = 'rewash',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'reject' THEN
    UPDATE linen_items
    SET status = 'rejected',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'audit' THEN
    -- Location ping only — status unchanged
    UPDATE linen_items
    SET last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
