-- Security & RLS hardening
-- Fixes two production-blocking issues introduced during development:
--   1. scan_events RLS was left open (FOR ALL USING (true)) after realtime testing
--   2. get_current_org_id() fallback silently grants unauthenticated requests
--      access to the first organisation's data

-- ─── 1. Restore scan_events RLS ──────────────────────────────────────────────
-- Migration 20260417000002 dropped the proper policy and replaced it with
-- USING (true) "temporarily for testing". This restores org-scoped access.

DROP POLICY IF EXISTS "Users can access their org's scan events" ON scan_events;

CREATE POLICY "Users can access their org's scan events" ON scan_events
FOR ALL USING (org_id = get_current_org_id());

-- ─── 2. Remove dev fallback from get_current_org_id() ────────────────────────
-- The original function falls back to `SELECT id FROM organizations LIMIT 1`
-- when no profile row exists for the calling user. In production this means
-- any unauthenticated or profile-less request silently reads the first org's
-- data. The safe behaviour is to return NULL so RLS blocks the request.

CREATE OR REPLACE FUNCTION get_current_org_id()
RETURNS UUID AS $$
DECLARE
  _org_id UUID;
BEGIN
  SELECT org_id INTO _org_id
  FROM profiles
  WHERE id = auth.uid()
  LIMIT 1;

  RETURN _org_id;  -- NULL if no profile → RLS denies access
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
