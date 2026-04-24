-- Fix RLS so inserts/updates for orders work in app context
-- Existing policies used only USING and direct auth.uid() profile lookup,
-- which blocks INSERT for many valid app sessions.

-- delivery_orders
DROP POLICY IF EXISTS "org_isolation" ON delivery_orders;
CREATE POLICY "org_isolation" ON delivery_orders
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());

-- delivery_order_items
DROP POLICY IF EXISTS "org_isolation" ON delivery_order_items;
CREATE POLICY "org_isolation" ON delivery_order_items
FOR ALL
USING (
  EXISTS (
    SELECT 1
    FROM delivery_orders o
    WHERE o.id = delivery_order_items.order_id
      AND o.org_id = get_current_org_id()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM delivery_orders o
    WHERE o.id = delivery_order_items.order_id
      AND o.org_id = get_current_org_id()
  )
);

-- Keep consistency for future write paths
DROP POLICY IF EXISTS "org_isolation" ON production_batches;
CREATE POLICY "org_isolation" ON production_batches
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());

DROP POLICY IF EXISTS "org_isolation" ON client_par_levels;
CREATE POLICY "org_isolation" ON client_par_levels
FOR ALL
USING (org_id = get_current_org_id())
WITH CHECK (org_id = get_current_org_id());
