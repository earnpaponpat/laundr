-- Laundr Phase 4 Seed: Production Queue + Par Level Alert
-- Idempotent: safe to re-run

BEGIN;

DO $$
DECLARE
  v_org_id uuid;

  v_client_hilton uuid;
  v_client_hardrock uuid;
  v_client_dusit uuid;
  v_client_fitness uuid;
  v_client_amari uuid;

  v_cat_bs uuid;
  v_cat_bt uuid;
  v_cat_apron uuid;
BEGIN
  -- 1) Resolve or create org
  SELECT id INTO v_org_id
  FROM organizations
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, slug)
    VALUES ('Seed Laundry Org', 'seed-laundry-org')
    RETURNING id INTO v_org_id;
  END IF;

  -- 2) Clients
  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Hilton Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Hard Rock Hotel Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Dusit Thani Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Fitness First Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Amari Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  SELECT id INTO v_client_hilton FROM clients WHERE org_id = v_org_id AND name = 'Hilton Pattaya' LIMIT 1;
  SELECT id INTO v_client_hardrock FROM clients WHERE org_id = v_org_id AND name = 'Hard Rock Hotel Pattaya' LIMIT 1;
  SELECT id INTO v_client_dusit FROM clients WHERE org_id = v_org_id AND name = 'Dusit Thani Pattaya' LIMIT 1;
  SELECT id INTO v_client_fitness FROM clients WHERE org_id = v_org_id AND name = 'Fitness First Pattaya' LIMIT 1;
  SELECT id INTO v_client_amari FROM clients WHERE org_id = v_org_id AND name = 'Amari Pattaya' LIMIT 1;

  -- 3) Categories
  INSERT INTO linen_categories (org_id, name, lifespan_cycles, replacement_cost)
  VALUES (v_org_id, 'Bed Sheet', 180, 1200)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO linen_categories (org_id, name, lifespan_cycles, replacement_cost)
  VALUES (v_org_id, 'Bath Towel', 220, 700)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO linen_categories (org_id, name, lifespan_cycles, replacement_cost)
  VALUES (v_org_id, 'Apron', 140, 450)
  ON CONFLICT (org_id, name) DO NOTHING;

  SELECT id INTO v_cat_bs FROM linen_categories WHERE org_id = v_org_id AND name = 'Bed Sheet' LIMIT 1;
  SELECT id INTO v_cat_bt FROM linen_categories WHERE org_id = v_org_id AND name = 'Bath Towel' LIMIT 1;
  SELECT id INTO v_cat_apron FROM linen_categories WHERE org_id = v_org_id AND name = 'Apron' LIMIT 1;

  -- 4) Clean stock baseline for Par-Level alert widget
  -- Bed Sheet clean = 280
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-CLEAN-BS-' || LPAD(gs::text, 4, '0'), v_cat_bs, 'clean', 8, NULL
  FROM generate_series(1, 280) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'clean',
    current_batch_id = NULL;

  -- Bath Towel clean = 210
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-CLEAN-BT-' || LPAD(gs::text, 4, '0'), v_cat_bt, 'clean', 6, NULL
  FROM generate_series(1, 210) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'clean',
    current_batch_id = NULL;

  -- Apron clean = 30
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-CLEAN-AP-' || LPAD(gs::text, 4, '0'), v_cat_apron, 'clean', 4, NULL
  FROM generate_series(1, 30) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'clean',
    current_batch_id = NULL;

  -- 5) Upcoming Orders (next 48h) for alert widget
  INSERT INTO delivery_orders (
    id, org_id, order_number, client_id, scheduled_date, status, notes
  ) VALUES (
    'f1000000-0000-0000-0000-000000000001', v_org_id, 'SEED-DO-HILTON-48H', v_client_hilton,
    (CURRENT_DATE + INTERVAL '1 day')::date, 'ready', '[SEED] PAR_ALERT_HILTON'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    scheduled_date = EXCLUDED.scheduled_date,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes;

  INSERT INTO delivery_orders (
    id, org_id, order_number, client_id, scheduled_date, status, notes
  ) VALUES (
    'f1000000-0000-0000-0000-000000000002', v_org_id, 'SEED-DO-HARDROCK-48H', v_client_hardrock,
    CURRENT_DATE::date, 'draft', '[SEED] PAR_ALERT_HARDROCK'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    scheduled_date = EXCLUDED.scheduled_date,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes;

  INSERT INTO delivery_orders (
    id, org_id, order_number, client_id, scheduled_date, status, notes
  ) VALUES (
    'f1000000-0000-0000-0000-000000000003', v_org_id, 'SEED-DO-DUSIT-48H', v_client_dusit,
    (CURRENT_DATE + INTERVAL '1 day')::date, 'draft', '[SEED] PAR_ALERT_DUSIT'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    scheduled_date = EXCLUDED.scheduled_date,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes;

  INSERT INTO delivery_order_items (id, order_id, category_id, requested_qty, picked_qty, returned_qty)
  VALUES
    ('f2000000-0000-0000-0000-000000000001', 'f1000000-0000-0000-0000-000000000001', v_cat_bs, 500, 0, 0),
    ('f2000000-0000-0000-0000-000000000002', 'f1000000-0000-0000-0000-000000000002', v_cat_bt, 200, 0, 0),
    ('f2000000-0000-0000-0000-000000000003', 'f1000000-0000-0000-0000-000000000003', v_cat_apron, 9, 0, 0)
  ON CONFLICT (id) DO UPDATE SET
    requested_qty = EXCLUDED.requested_qty;

  -- 6) Par level rows used by Create Order suggestions
  INSERT INTO client_par_levels (id, org_id, client_id, category_id, par_quantity, safety_buffer_pct)
  VALUES
    ('f3000000-0000-0000-0000-000000000001', v_org_id, v_client_hilton, v_cat_bs, 100, 10),
    ('f3000000-0000-0000-0000-000000000002', v_org_id, v_client_hilton, v_cat_bt, 50, 10),
    ('f3000000-0000-0000-0000-000000000003', v_org_id, v_client_hardrock, v_cat_bt, 80, 10)
  ON CONFLICT (client_id, category_id) DO UPDATE SET
    par_quantity = EXCLUDED.par_quantity,
    safety_buffer_pct = EXCLUDED.safety_buffer_pct;

  -- 7) Inbound batches + production batches across queue stages
  -- Dirty queue (queued)
  INSERT INTO delivery_batches (
    id, org_id, client_id, order_id, batch_type, total_items, status, returned_at, created_at
  ) VALUES (
    'f4000000-0000-0000-0000-000000000001', v_org_id, v_client_hilton, NULL, 'inbound', 147,
    'open', NOW() - INTERVAL '2.5 hours', NOW() - INTERVAL '2.5 hours'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    total_items = EXCLUDED.total_items,
    returned_at = EXCLUDED.returned_at,
    status = 'open';

  INSERT INTO production_batches (
    id, org_id, inbound_batch_id, status, created_at
  ) VALUES (
    'f5000000-0000-0000-0000-000000000001', v_org_id, 'f4000000-0000-0000-0000-000000000001', 'queued', NOW() - INTERVAL '2.5 hours'
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'queued',
    inbound_batch_id = EXCLUDED.inbound_batch_id,
    org_id = EXCLUDED.org_id;

  -- Washing
  INSERT INTO delivery_batches (
    id, org_id, client_id, order_id, batch_type, total_items, status, returned_at, created_at
  ) VALUES (
    'f4000000-0000-0000-0000-000000000002', v_org_id, v_client_amari, NULL, 'inbound', 200,
    'open', date_trunc('day', NOW()) + INTERVAL '08:30', date_trunc('day', NOW()) + INTERVAL '08:30'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    total_items = EXCLUDED.total_items,
    status = 'open';

  INSERT INTO production_batches (
    id, org_id, inbound_batch_id, status, wash_started_at, created_at
  ) VALUES (
    'f5000000-0000-0000-0000-000000000002', v_org_id, 'f4000000-0000-0000-0000-000000000002', 'washing',
    date_trunc('day', NOW()) + INTERVAL '09:00', date_trunc('day', NOW()) + INTERVAL '08:30'
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'washing',
    wash_started_at = EXCLUDED.wash_started_at,
    inbound_batch_id = EXCLUDED.inbound_batch_id,
    org_id = EXCLUDED.org_id;

  -- Drying
  INSERT INTO delivery_batches (
    id, org_id, client_id, order_id, batch_type, total_items, status, returned_at, created_at
  ) VALUES (
    'f4000000-0000-0000-0000-000000000003', v_org_id, v_client_hilton, NULL, 'inbound', 147,
    'open', date_trunc('day', NOW()) + INTERVAL '09:30', date_trunc('day', NOW()) + INTERVAL '09:30'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    total_items = EXCLUDED.total_items,
    status = 'open';

  INSERT INTO production_batches (
    id, org_id, inbound_batch_id, status, wash_started_at, wash_completed_at, dry_started_at, created_at
  ) VALUES (
    'f5000000-0000-0000-0000-000000000003', v_org_id, 'f4000000-0000-0000-0000-000000000003', 'drying',
    date_trunc('day', NOW()) + INTERVAL '09:00', date_trunc('day', NOW()) + INTERVAL '10:00',
    date_trunc('day', NOW()) + INTERVAL '10:30', date_trunc('day', NOW()) + INTERVAL '09:30'
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'drying',
    dry_started_at = EXCLUDED.dry_started_at,
    inbound_batch_id = EXCLUDED.inbound_batch_id,
    org_id = EXCLUDED.org_id;

  -- Folding / QC
  INSERT INTO delivery_batches (
    id, org_id, client_id, order_id, batch_type, total_items, status, returned_at, created_at
  ) VALUES (
    'f4000000-0000-0000-0000-000000000004', v_org_id, v_client_fitness, NULL, 'inbound', 440,
    'open', date_trunc('day', NOW()) + INTERVAL '08:00', date_trunc('day', NOW()) + INTERVAL '08:00'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    total_items = EXCLUDED.total_items,
    status = 'open';

  INSERT INTO production_batches (
    id, org_id, inbound_batch_id, status, wash_started_at, wash_completed_at, dry_started_at, dry_completed_at, fold_started_at, created_at
  ) VALUES (
    'f5000000-0000-0000-0000-000000000004', v_org_id, 'f4000000-0000-0000-0000-000000000004', 'folding',
    date_trunc('day', NOW()) + INTERVAL '08:30', date_trunc('day', NOW()) + INTERVAL '09:15',
    date_trunc('day', NOW()) + INTERVAL '09:30', date_trunc('day', NOW()) + INTERVAL '10:20',
    date_trunc('day', NOW()) + INTERVAL '10:45', date_trunc('day', NOW()) + INTERVAL '08:00'
  )
  ON CONFLICT (id) DO UPDATE SET
    status = 'folding',
    fold_started_at = EXCLUDED.fold_started_at,
    inbound_batch_id = EXCLUDED.inbound_batch_id,
    org_id = EXCLUDED.org_id;

  -- 8) Assign items into each production stage batch
  -- queued dirty: 147 items
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-DIRTY-Q-' || LPAD(gs::text, 4, '0'), v_cat_bs, 'dirty', 12, 'f4000000-0000-0000-0000-000000000001'
  FROM generate_series(1, 147) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'dirty',
    current_batch_id = 'f4000000-0000-0000-0000-000000000001';

  -- washing: 200 items
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-WASHING-' || LPAD(gs::text, 4, '0'), v_cat_bt, 'washing', 15, 'f4000000-0000-0000-0000-000000000002'
  FROM generate_series(1, 200) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'washing',
    current_batch_id = 'f4000000-0000-0000-0000-000000000002';

  -- drying: 147 items
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-DRYING-' || LPAD(gs::text, 4, '0'), v_cat_bs, 'drying', 16, 'f4000000-0000-0000-0000-000000000003'
  FROM generate_series(1, 147) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'drying',
    current_batch_id = 'f4000000-0000-0000-0000-000000000003';

  -- folding/qc: 440 items
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'SEED-FOLDING-' || LPAD(gs::text, 4, '0'), v_cat_bs, 'folding', 18, 'f4000000-0000-0000-0000-000000000004'
  FROM generate_series(1, 440) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'folding',
    current_batch_id = 'f4000000-0000-0000-0000-000000000004';

END $$;

COMMIT;

-- Quick sanity checks
SELECT 'linen_status_counts' AS check_name, status, COUNT(*)
FROM linen_items
GROUP BY status
ORDER BY status;

SELECT 'production_batches' AS check_name, status, COUNT(*)
FROM production_batches
GROUP BY status
ORDER BY status;

SELECT 'delivery_orders_48h' AS check_name, order_number, status, scheduled_date
FROM delivery_orders
WHERE order_number LIKE 'SEED-DO-%'
ORDER BY scheduled_date;
