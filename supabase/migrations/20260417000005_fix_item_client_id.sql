-- Fix: trigger was not updating linen_items.client_id on checkout/checkin
-- Result: Location column showed "-" even after item was delivered to a client
--
-- Rule:
--   checkout / delivery_signed → assign client_id from the scan event
--   checkin                    → clear client_id (item is back at factory)

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
    UPDATE linen_items
    SET status = 'rewash',
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'rewash' THEN
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
