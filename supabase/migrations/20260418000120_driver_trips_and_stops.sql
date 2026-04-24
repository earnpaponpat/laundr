-- Driver mobile workflow: trips/stops + factory notification feed

CREATE TABLE IF NOT EXISTS delivery_trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  route_id uuid REFERENCES routes(id) ON DELETE SET NULL,
  scheduled_date date NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'cancelled')),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_delivery_trips_driver_date
ON delivery_trips(driver_id, scheduled_date);

CREATE INDEX IF NOT EXISTS idx_delivery_trips_org_date
ON delivery_trips(org_id, scheduled_date);

CREATE TABLE IF NOT EXISTS trip_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES delivery_trips(id) ON DELETE CASCADE,
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  stop_no int NOT NULL,
  order_id uuid REFERENCES delivery_orders(id) ON DELETE SET NULL,
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,
  expected_deliver_count int NOT NULL DEFAULT 0,
  expected_collect_count int NOT NULL DEFAULT 0,
  delivered_count int NOT NULL DEFAULT 0,
  collected_count int NOT NULL DEFAULT 0,
  delivered_tags text[] NOT NULL DEFAULT '{}',
  collected_tags text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'completed', 'skipped')),
  eta_at timestamptz,
  arrived_at timestamptz,
  departed_at timestamptz,
  delivered_at timestamptz,
  collected_at timestamptz,
  delivered_signature text,
  received_by text,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(trip_id, stop_no)
);

CREATE INDEX IF NOT EXISTS idx_trip_stops_trip
ON trip_stops(trip_id, stop_no);

CREATE INDEX IF NOT EXISTS idx_trip_stops_org_status
ON trip_stops(org_id, status);

CREATE TABLE IF NOT EXISTS factory_notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL,
  level text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  title text NOT NULL,
  message text NOT NULL,
  is_read boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_factory_notifications_org_created
ON factory_notifications(org_id, created_at DESC);

ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS trip_id uuid REFERENCES delivery_trips(id) ON DELETE SET NULL;

ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS trip_stop_id uuid REFERENCES trip_stops(id) ON DELETE SET NULL;

ALTER TABLE delivery_trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE trip_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE factory_notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_isolation" ON delivery_trips;
CREATE POLICY "org_isolation" ON delivery_trips
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());

DROP POLICY IF EXISTS "org_isolation" ON trip_stops;
CREATE POLICY "org_isolation" ON trip_stops
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());

DROP POLICY IF EXISTS "org_isolation" ON factory_notifications;
CREATE POLICY "org_isolation" ON factory_notifications
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());
