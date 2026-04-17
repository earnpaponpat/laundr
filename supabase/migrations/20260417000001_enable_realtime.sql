-- Enable Realtime for the tables that need it
-- Explicitly add tables to the supabase_realtime publication
BEGIN;
  -- Add scan_events to publication
  ALTER PUBLICATION supabase_realtime ADD TABLE scan_events;
  
  -- Add linen_items to publication (useful for inventory list updates)
  ALTER PUBLICATION supabase_realtime ADD TABLE linen_items;

  -- Ensure the publication exists (fallback for self-hosted or non-standard setups)
  -- Note: Supabase managed projects already have this publication.
COMMIT;
