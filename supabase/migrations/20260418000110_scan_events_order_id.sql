-- Add order reference for scan event traceability
ALTER TABLE scan_events
ADD COLUMN IF NOT EXISTS order_id uuid REFERENCES delivery_orders(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_scan_events_order_id
ON scan_events(order_id)
WHERE order_id IS NOT NULL;
