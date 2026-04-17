---------- TABLES ----------

-- Organizations
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    settings JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Profiles (extends auth.users)
CREATE TABLE profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    full_name TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'manager', 'staff', 'driver')) DEFAULT 'staff',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Clients
CREATE TABLE clients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    contact_name TEXT,
    contact_phone TEXT,
    contact_email TEXT,
    address TEXT,
    active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, name)
);

-- Linen Categories
CREATE TABLE linen_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    lifespan_cycles INT NOT NULL DEFAULT 200,
    replacement_cost NUMERIC(10, 2),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, name)
);

-- Linen Items
CREATE TABLE linen_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rfid_tag_id TEXT NOT NULL,
    category_id UUID REFERENCES linen_categories(id) ON DELETE SET NULL,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    status TEXT NOT NULL CHECK (status IN ('in_stock', 'out', 'rewash', 'rejected', 'lost')) DEFAULT 'in_stock',
    wash_count INT NOT NULL DEFAULT 0,
    last_scan_at TIMESTAMPTZ,
    last_scan_location TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(org_id, rfid_tag_id)
);

-- Scan Events
CREATE TABLE scan_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    rfid_tag_id TEXT NOT NULL,
    item_id UUID REFERENCES linen_items(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL CHECK (event_type IN ('checkout', 'checkin', 'rewash', 'reject', 'audit')),
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    gate_id TEXT,
    batch_id UUID,
    source TEXT,
    scanned_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Routes
CREATE TABLE routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    vehicle_plate TEXT,
    status TEXT NOT NULL CHECK (status IN ('pending', 'active', 'completed')) DEFAULT 'pending',
    scheduled_at TIMESTAMPTZ,
    stops JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Delivery Batches
CREATE TABLE delivery_batches (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE CASCADE,
    batch_type TEXT NOT NULL CHECK (batch_type IN ('outbound', 'inbound')),
    route_id UUID REFERENCES routes(id) ON DELETE SET NULL,
    total_items INT DEFAULT 0,
    returned_items INT DEFAULT 0,
    manifest_signed BOOLEAN DEFAULT false,
    signed_by TEXT,
    driver_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Rewash Records
CREATE TABLE rewash_records (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    item_id UUID REFERENCES linen_items(id) ON DELETE CASCADE,
    client_id UUID REFERENCES clients(id) ON DELETE SET NULL,
    reason TEXT NOT NULL CHECK (reason IN ('stain', 'damage', 'special_treatment', 'other')),
    billable BOOLEAN DEFAULT true,
    resolved BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);

---------- INDEXES ----------
CREATE INDEX idx_linen_items_rfid_tag_id ON linen_items(rfid_tag_id);
CREATE INDEX idx_linen_items_org_id ON linen_items(org_id);
CREATE INDEX idx_linen_items_client_id ON linen_items(client_id);
CREATE INDEX idx_linen_items_status ON linen_items(status);

CREATE INDEX idx_scan_events_rfid_tag_id ON scan_events(rfid_tag_id);
CREATE INDEX idx_scan_events_org_id ON scan_events(org_id);
CREATE INDEX idx_scan_events_created_at ON scan_events(created_at);

---------- RLS POLICIES (Multi-tenant) ----------
-- Required helper function for getting the current auth user's org_id
CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS UUID AS $$
  DECLARE
    _org_id UUID;
  BEGIN
    -- 1. Try to find org linked to user profile
    SELECT org_id INTO _org_id FROM profiles WHERE id = auth.uid() LIMIT 1;
    IF _org_id IS NOT NULL THEN
      RETURN _org_id;
    END IF;

    -- 2. Fallback for Development: Use the first organization found if no profile exists
    -- This allows data to be visible during early development phases
    SELECT id INTO _org_id FROM organizations LIMIT 1;
    RETURN _org_id;
  END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE linen_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE linen_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE scan_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE delivery_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE rewash_records ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Users can view their own organization" ON organizations 
FOR ALL USING (id = get_current_org_id());

CREATE POLICY "Users can access their org's profiles" ON profiles 
FOR ALL USING (org_id = get_current_org_id() OR id = auth.uid());

CREATE POLICY "Users can access their org's clients" ON clients 
FOR ALL USING (org_id = get_current_org_id());

CREATE POLICY "Users can access their org's categories" ON linen_categories 
FOR ALL USING (org_id = get_current_org_id());

CREATE POLICY "Users can access their org's items" ON linen_items 
FOR ALL USING (org_id = get_current_org_id());

CREATE POLICY "Users can access their org's scan events" ON scan_events 
FOR ALL USING (org_id = get_current_org_id());

CREATE POLICY "Users can access their org's routes" ON routes 
FOR ALL USING (org_id = get_current_org_id());

CREATE POLICY "Users can access their org's batches" ON delivery_batches 
FOR ALL USING (org_id = get_current_org_id());

CREATE POLICY "Users can access their org's rewash records" ON rewash_records 
FOR ALL USING (org_id = get_current_org_id());

---------- TRIGGERS ----------

-- Trigger function to update wash_count and status on scan_events
CREATE OR REPLACE FUNCTION process_scan_event()
RETURNS TRIGGER AS $$
BEGIN
  -- 1. Check if the event_type is 'checkin' to increment wash_count
  -- 2. Update status and last_scan info based on the event
  
  IF NEW.event_type = 'checkin' THEN
    UPDATE linen_items 
    SET 
        status = 'in_stock', 
        wash_count = wash_count + 1, 
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'checkout' THEN
    UPDATE linen_items 
    SET 
        status = 'out', 
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'rewash' THEN
    UPDATE linen_items 
    SET 
        status = 'rewash', 
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'reject' THEN
    UPDATE linen_items 
    SET 
        status = 'rejected', 
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;

  ELSIF NEW.event_type = 'audit' THEN
    -- For audit, we just update the scan location/time but keep the same status
    UPDATE linen_items 
    SET 
        last_scan_at = NEW.created_at,
        last_scan_location = NEW.gate_id
    WHERE id = NEW.item_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- The actual trigger attached to scan_events table
CREATE TRIGGER on_scan_event_inserted
AFTER INSERT ON scan_events
FOR EACH ROW
EXECUTE FUNCTION process_scan_event();
