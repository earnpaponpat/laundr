-- Fix Realtime broadcasting issues
-- 1. Set REPLICA IDENTITY to FULL to ensure the entire row is sent in the payload
-- This is often required for filtering to work correctly on non-primary-key columns (like org_id)
ALTER TABLE scan_events REPLICA IDENTITY FULL;
ALTER TABLE linen_items REPLICA IDENTITY FULL;

-- 2. Temporarily relax RLS for development to verify if policies are blocking the broadcast
-- This allows all authenticated users to read all scan_events
-- YOU SHOULD REMOVE THIS OR RESTRICT IT AFTER TESTING
DROP POLICY IF EXISTS "Users can access their org's scan events" ON scan_events;
CREATE POLICY "Users can access their org's scan events" ON scan_events 
FOR ALL USING (true); -- Relaxed for testing realtime broadcast

-- 3. Ensure the publication is catching everything
-- (Repeated just in case the user missed it or it failed)
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables 
        WHERE pubname = 'supabase_realtime' AND tablename = 'scan_events'
    ) THEN
        ALTER PUBLICATION supabase_realtime ADD TABLE scan_events;
    END IF;
END $$;
