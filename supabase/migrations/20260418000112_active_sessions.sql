-- Active picking/return session tracking (MVP)
CREATE TABLE IF NOT EXISTS active_sessions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id uuid REFERENCES organizations(id) ON DELETE CASCADE,
  order_id uuid REFERENCES delivery_orders(id) ON DELETE CASCADE,
  batch_id uuid REFERENCES delivery_batches(id) ON DELETE CASCADE,
  session_type text CHECK (session_type IN ('picking','return')),
  gate_id text,
  started_by uuid REFERENCES profiles(id) ON DELETE SET NULL,
  started_at timestamptz DEFAULT now(),
  last_activity_at timestamptz DEFAULT now(),
  is_active bool DEFAULT true,
  items_scanned int DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_active_sessions_one_active_per_org
ON active_sessions(org_id)
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_active_sessions_order_active
ON active_sessions(order_id, is_active);

-- Batch lifecycle status for operational visibility
ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS status text DEFAULT 'open'
CHECK (status IN ('open','picking','dispatched','closed'));

ALTER TABLE active_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON active_sessions;
CREATE POLICY "org_isolation" ON active_sessions
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());
