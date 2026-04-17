-- Add expected_return_by to delivery_batches
-- Cannot use GENERATED ALWAYS AS (timestamptz + interval is not immutable in PG)
-- Use a BEFORE INSERT trigger instead.

ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS expected_return_by TIMESTAMPTZ;

-- Backfill existing rows
UPDATE delivery_batches
SET expected_return_by = created_at + INTERVAL '3 days'
WHERE expected_return_by IS NULL;

-- Auto-set on every new batch
CREATE OR REPLACE FUNCTION set_batch_return_deadline()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.expected_return_by IS NULL THEN
    NEW.expected_return_by := NEW.created_at + INTERVAL '3 days';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER on_batch_created
BEFORE INSERT ON delivery_batches
FOR EACH ROW EXECUTE FUNCTION set_batch_return_deadline();
