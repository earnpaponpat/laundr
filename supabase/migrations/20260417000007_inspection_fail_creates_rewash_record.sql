-- When inspection_fail fires, automatically create a rewash_records row.
-- Previously the trigger only updated linen_items.status → rewash,
-- but the Rewash page reads rewash_records, so the queue showed 0.

CREATE OR REPLACE FUNCTION process_scan_event()
RETURNS TRIGGER AS $$
BEGIN

  IF NEW.event_type = 'checkout' THEN
    UPDATE linen_items
    SET status = 'in_transit',
        client_id = NEW.client_id,
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'delivery_signed' THEN
    UPDATE linen_items
    SET status = 'out',
        client_id = NEW.client_id,
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'checkin' THEN
    UPDATE linen_items
    SET status = 'quality_check',
        client_id = NULL,
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'inspection_pass' THEN
    UPDATE linen_items
    SET status = 'in_stock',
        wash_count = wash_count + 1,
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'inspection_fail' THEN
    -- 1. Update item status
    UPDATE linen_items
    SET status = 'rewash',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

    -- 2. Auto-create rewash_record so the Rewash page can see it
    --    Only insert if no unresolved record already exists for this item
    INSERT INTO rewash_records (org_id, item_id, client_id, reason, billable, resolved)
    SELECT
      NEW.org_id,
      NEW.item_id,
      NEW.client_id,
      'damage',   -- default reason; staff can update from the Rewash page
      true,
      false
    WHERE NOT EXISTS (
      SELECT 1 FROM rewash_records
      WHERE item_id = NEW.item_id
        AND resolved = false
    );

  ELSIF NEW.event_type = 'rewash' THEN
    -- Manual rewash override (e.g. added directly from Rewash page)
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
    UPDATE linen_items
    SET last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Backfill: items already stuck in rewash status with no rewash_record
INSERT INTO rewash_records (org_id, item_id, client_id, reason, billable, resolved)
SELECT
  li.org_id,
  li.id,
  li.client_id,
  'damage',
  true,
  false
FROM linen_items li
WHERE li.status = 'rewash'
  AND NOT EXISTS (
    SELECT 1 FROM rewash_records rr
    WHERE rr.item_id = li.id
      AND rr.resolved = false
  );
