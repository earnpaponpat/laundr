-- ============================================================
-- FIX: Update scan trigger to use new status lifecycle
-- Date: 2026-04-18
-- ============================================================

CREATE OR REPLACE FUNCTION process_scan_event()
RETURNS TRIGGER AS $$
BEGIN

  IF NEW.event_type = 'checkout' THEN
    -- Picking stage: item enters batch.
    -- We keep status as 'clean'. The migration 20260418000100 removed 'in_transit'.
    -- The app handles setting the batch_id, but the trigger tracks the scan location.
    UPDATE linen_items
    SET last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'dispatch' THEN
    -- Truck leaves factory: item is now officially 'out'
    UPDATE linen_items
    SET status = 'out',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'checkin' THEN
    -- Item returns physically: becomes 'dirty'
    UPDATE linen_items
    SET status = 'dirty',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id,
        current_batch_id = NULL
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'qc_pass' THEN
    -- Pass QC: back to clean status, increment wash cycle
    UPDATE linen_items
    SET status = 'clean',
        wash_count = wash_count + 1,
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id,
        current_batch_id = NULL
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type IN ('qc_rewash', 'rewash') THEN
    UPDATE linen_items
    SET status = 'rewash',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id,
        current_batch_id = NULL
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type IN ('qc_reject', 'reject') THEN
    UPDATE linen_items
    SET status = 'rejected',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id,
        current_batch_id = NULL
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'wash_start' THEN
    UPDATE linen_items SET status = 'washing' WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'wash_done' THEN
    UPDATE linen_items SET status = 'drying' WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'dry_done' THEN
    UPDATE linen_items SET status = 'folding' WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'audit' THEN
    -- Location ping only
    UPDATE linen_items
    SET last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'found' THEN
    UPDATE linen_items SET status = 'dirty' WHERE id = NEW.item_id;

  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
