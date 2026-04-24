-- Laundr Driver Mobile Seed
-- Creates demo auth accounts + trip/stops + outbound batch items for handheld testing
-- Idempotent: safe to re-run

BEGIN;

-- Compatibility guard:
-- some environments may not have dispatched_at on delivery_batches yet
ALTER TABLE delivery_batches
ADD COLUMN IF NOT EXISTS dispatched_at timestamptz;

DO $$
DECLARE
  v_org_id uuid;

  v_driver_user_id uuid;
  v_admin_user_id uuid;

  v_driver_email text := 'driver.demo@laundr.app';
  v_driver_password text := 'Driver@1234';
  v_driver_name text := 'Somchai Driver Demo';

  v_admin_email text := 'admin.demo@laundr.app';
  v_admin_password text := 'Admin@1234';
  v_admin_name text := 'Admin Demo';

  v_client_hilton uuid;
  v_client_hardrock uuid;

  v_cat_bs uuid;
  v_cat_bt uuid;

  v_order_1 uuid := 'f9100000-0000-0000-0000-000000000001';
  v_order_2 uuid := 'f9100000-0000-0000-0000-000000000002';

  v_batch_1 uuid := 'f9200000-0000-0000-0000-000000000001';
  v_batch_2 uuid := 'f9200000-0000-0000-0000-000000000002';

  v_trip_id uuid := 'f9300000-0000-0000-0000-000000000001';
  v_stop_1 uuid := 'f9400000-0000-0000-0000-000000000001';
  v_stop_2 uuid := 'f9400000-0000-0000-0000-000000000002';

  v_today date := CURRENT_DATE;
  v_now timestamptz := now();
BEGIN
  -- 1) Resolve org
  SELECT id INTO v_org_id
  FROM organizations
  ORDER BY created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    INSERT INTO organizations (name, slug)
    VALUES ('Seed Laundry Org', 'seed-laundry-org')
    RETURNING id INTO v_org_id;
  END IF;

  -- 2) Ensure base clients
  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Hilton Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO clients (org_id, name)
  VALUES (v_org_id, 'Hard Rock Hotel Pattaya')
  ON CONFLICT (org_id, name) DO NOTHING;

  SELECT id INTO v_client_hilton FROM clients WHERE org_id = v_org_id AND name = 'Hilton Pattaya' LIMIT 1;
  SELECT id INTO v_client_hardrock FROM clients WHERE org_id = v_org_id AND name = 'Hard Rock Hotel Pattaya' LIMIT 1;

  -- 3) Ensure base categories
  INSERT INTO linen_categories (org_id, name, lifespan_cycles, replacement_cost)
  VALUES (v_org_id, 'Bed Sheet', 180, 1200)
  ON CONFLICT (org_id, name) DO NOTHING;

  INSERT INTO linen_categories (org_id, name, lifespan_cycles, replacement_cost)
  VALUES (v_org_id, 'Bath Towel', 220, 700)
  ON CONFLICT (org_id, name) DO NOTHING;

  SELECT id INTO v_cat_bs FROM linen_categories WHERE org_id = v_org_id AND name = 'Bed Sheet' LIMIT 1;
  SELECT id INTO v_cat_bt FROM linen_categories WHERE org_id = v_org_id AND name = 'Bath Towel' LIMIT 1;

  -- 4) Create demo auth users (driver/admin) if missing
  SELECT id INTO v_driver_user_id FROM auth.users WHERE email = v_driver_email LIMIT 1;
  IF v_driver_user_id IS NULL THEN
    v_driver_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_driver_user_id,
      'authenticated',
      'authenticated',
      v_driver_email,
      crypt(v_driver_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_driver_name),
      now(),
      now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_driver_user_id,
      jsonb_build_object('sub', v_driver_user_id::text, 'email', v_driver_email),
      'email',
      v_driver_email,
      now(),
      now(),
      now()
    );
  END IF;

  SELECT id INTO v_admin_user_id FROM auth.users WHERE email = v_admin_email LIMIT 1;
  IF v_admin_user_id IS NULL THEN
    v_admin_user_id := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email,
      encrypted_password,
      email_confirmed_at,
      raw_app_meta_data,
      raw_user_meta_data,
      created_at,
      updated_at,
      confirmation_token,
      email_change,
      email_change_token_new,
      recovery_token
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_admin_user_id,
      'authenticated',
      'authenticated',
      v_admin_email,
      crypt(v_admin_password, gen_salt('bf')),
      now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('full_name', v_admin_name),
      now(),
      now(),
      '', '', '', ''
    );

    INSERT INTO auth.identities (
      id,
      user_id,
      identity_data,
      provider,
      provider_id,
      last_sign_in_at,
      created_at,
      updated_at
    ) VALUES (
      gen_random_uuid(),
      v_admin_user_id,
      jsonb_build_object('sub', v_admin_user_id::text, 'email', v_admin_email),
      'email',
      v_admin_email,
      now(),
      now(),
      now()
    );
  END IF;

  -- 5) Ensure profiles
  INSERT INTO profiles (id, org_id, full_name, role)
  VALUES (v_driver_user_id, v_org_id, v_driver_name, 'driver')
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    full_name = EXCLUDED.full_name,
    role = 'driver';

  INSERT INTO profiles (id, org_id, full_name, role)
  VALUES (v_admin_user_id, v_org_id, v_admin_name, 'admin')
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    full_name = EXCLUDED.full_name,
    role = 'admin';

  -- 6) Ensure clean inventory pool (for predictable seed)
  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'DRV-SEED-BS-' || LPAD(gs::text, 4, '0'), v_cat_bs, 'clean', 12, NULL
  FROM generate_series(1, 120) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'clean',
    current_batch_id = NULL;

  INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count, current_batch_id)
  SELECT v_org_id, 'DRV-SEED-BT-' || LPAD(gs::text, 4, '0'), v_cat_bt, 'clean', 10, NULL
  FROM generate_series(1, 80) gs
  ON CONFLICT (org_id, rfid_tag_id)
  DO UPDATE SET
    category_id = EXCLUDED.category_id,
    status = 'clean',
    current_batch_id = NULL;

  -- 7) Create two delivery orders for today's route
  INSERT INTO delivery_orders (
    id, org_id, order_number, client_id, driver_id,
    vehicle_plate, scheduled_date, status, notes, created_by
  ) VALUES
    (v_order_1, v_org_id, 'DRV-DO-0001', v_client_hilton, v_driver_user_id, 'กข-1234', v_today, 'dispatched', '[SEED] DRIVER_STOP_1', v_admin_user_id),
    (v_order_2, v_org_id, 'DRV-DO-0002', v_client_hardrock, v_driver_user_id, 'กข-1234', v_today, 'dispatched', '[SEED] DRIVER_STOP_2', v_admin_user_id)
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    driver_id = EXCLUDED.driver_id,
    vehicle_plate = EXCLUDED.vehicle_plate,
    scheduled_date = EXCLUDED.scheduled_date,
    status = EXCLUDED.status,
    notes = EXCLUDED.notes,
    created_by = EXCLUDED.created_by;

  INSERT INTO delivery_order_items (id, order_id, category_id, requested_qty, picked_qty, returned_qty)
  VALUES
    ('f9500000-0000-0000-0000-000000000001', v_order_1, v_cat_bs, 20, 20, 0),
    ('f9500000-0000-0000-0000-000000000002', v_order_1, v_cat_bt, 10, 10, 0),
    ('f9500000-0000-0000-0000-000000000003', v_order_2, v_cat_bs, 15, 15, 0),
    ('f9500000-0000-0000-0000-000000000004', v_order_2, v_cat_bt, 5,  5,  0)
  ON CONFLICT (id) DO UPDATE SET
    requested_qty = EXCLUDED.requested_qty,
    picked_qty = EXCLUDED.picked_qty,
    returned_qty = EXCLUDED.returned_qty;

  -- 8) Outbound batches
  INSERT INTO delivery_batches (
    id, org_id, client_id, order_id, batch_type,
    total_items, driver_id, status, dispatched_at
  ) VALUES
    (v_batch_1, v_org_id, v_client_hilton, v_order_1, 'outbound', 30, v_driver_user_id, 'dispatched', v_now - interval '50 minutes'),
    (v_batch_2, v_org_id, v_client_hardrock, v_order_2, 'outbound', 20, v_driver_user_id, 'dispatched', v_now - interval '30 minutes')
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    client_id = EXCLUDED.client_id,
    order_id = EXCLUDED.order_id,
    total_items = EXCLUDED.total_items,
    driver_id = EXCLUDED.driver_id,
    status = EXCLUDED.status,
    dispatched_at = EXCLUDED.dispatched_at;

  -- 9) Move exact items to OUT in each batch
  -- Reset only this seed namespace first
  UPDATE linen_items
  SET status = 'clean', current_batch_id = NULL
  WHERE org_id = v_org_id
    AND rfid_tag_id LIKE 'DRV-SEED-%';

  WITH take_bs AS (
    SELECT id FROM linen_items
    WHERE org_id = v_org_id
      AND rfid_tag_id LIKE 'DRV-SEED-BS-%'
      AND status = 'clean'
      AND current_batch_id IS NULL
    ORDER BY rfid_tag_id
    LIMIT 35
  )
  UPDATE linen_items li
  SET status = 'out', current_batch_id = CASE WHEN x.rn <= 20 THEN v_batch_1 ELSE v_batch_2 END
  FROM (
    SELECT id, row_number() OVER (ORDER BY id) AS rn
    FROM take_bs
  ) x
  WHERE li.id = x.id;

  WITH take_bt AS (
    SELECT id FROM linen_items
    WHERE org_id = v_org_id
      AND rfid_tag_id LIKE 'DRV-SEED-BT-%'
      AND status = 'clean'
      AND current_batch_id IS NULL
    ORDER BY rfid_tag_id
    LIMIT 15
  )
  UPDATE linen_items li
  SET status = 'out', current_batch_id = CASE WHEN x.rn <= 10 THEN v_batch_1 ELSE v_batch_2 END
  FROM (
    SELECT id, row_number() OVER (ORDER BY id) AS rn
    FROM take_bt
  ) x
  WHERE li.id = x.id;

  -- 10) Seed scan events for outbound manifest trace
  INSERT INTO scan_events (
    org_id, rfid_tag_id, item_id, event_type, client_id,
    gate_id, batch_id, order_id, source, scanned_by, created_at
  )
  SELECT
    v_org_id,
    li.rfid_tag_id,
    li.id,
    'dispatch',
    CASE WHEN li.current_batch_id = v_batch_1 THEN v_client_hilton ELSE v_client_hardrock END,
    'seed_driver',
    li.current_batch_id,
    CASE WHEN li.current_batch_id = v_batch_1 THEN v_order_1 ELSE v_order_2 END,
    'seed_driver_mobile',
    v_driver_user_id,
    v_now - interval '45 minutes'
  FROM linen_items li
  WHERE li.org_id = v_org_id
    AND li.current_batch_id IN (v_batch_1, v_batch_2)
    AND NOT EXISTS (
      SELECT 1 FROM scan_events se
      WHERE se.org_id = v_org_id
        AND se.item_id = li.id
        AND se.event_type = 'dispatch'
        AND se.source = 'seed_driver_mobile'
    );

  -- 11) Create today's trip and stops
  INSERT INTO delivery_trips (
    id, org_id, driver_id, route_id, scheduled_date, status, started_at
  ) VALUES (
    v_trip_id, v_org_id, v_driver_user_id, NULL, v_today, 'active', v_now - interval '35 minutes'
  )
  ON CONFLICT (id) DO UPDATE SET
    org_id = EXCLUDED.org_id,
    driver_id = EXCLUDED.driver_id,
    scheduled_date = EXCLUDED.scheduled_date,
    status = EXCLUDED.status,
    started_at = EXCLUDED.started_at;

  INSERT INTO trip_stops (
    id, trip_id, org_id, stop_no, order_id, client_id,
    expected_deliver_count, expected_collect_count,
    delivered_count, collected_count, delivered_tags, collected_tags,
    status, eta_at, arrived_at
  ) VALUES
    (
      v_stop_1, v_trip_id, v_org_id, 1, v_order_1, v_client_hilton,
      30, 25, 0, 0, '{}', '{}',
      'active', v_now + interval '10 minutes', v_now - interval '5 minutes'
    ),
    (
      v_stop_2, v_trip_id, v_org_id, 2, v_order_2, v_client_hardrock,
      20, 18, 0, 0, '{}', '{}',
      'pending', v_now + interval '65 minutes', NULL
    )
  ON CONFLICT (id) DO UPDATE SET
    trip_id = EXCLUDED.trip_id,
    org_id = EXCLUDED.org_id,
    stop_no = EXCLUDED.stop_no,
    order_id = EXCLUDED.order_id,
    client_id = EXCLUDED.client_id,
    expected_deliver_count = EXCLUDED.expected_deliver_count,
    expected_collect_count = EXCLUDED.expected_collect_count,
    status = EXCLUDED.status,
    eta_at = EXCLUDED.eta_at,
    arrived_at = EXCLUDED.arrived_at;

  -- 12) Attach batch -> trip stop for traceability
  UPDATE delivery_batches
  SET trip_id = v_trip_id,
      trip_stop_id = CASE WHEN id = v_batch_1 THEN v_stop_1 ELSE v_stop_2 END
  WHERE id IN (v_batch_1, v_batch_2)
    AND org_id = v_org_id;

END $$;

COMMIT;

-- Sanity checks
SELECT 'demo_auth_users' AS check_name, email
FROM auth.users
WHERE email IN ('driver.demo@laundr.app', 'admin.demo@laundr.app')
ORDER BY email;

SELECT 'driver_profile' AS check_name, p.id, p.full_name, p.role, p.org_id
FROM profiles p
JOIN auth.users u ON u.id = p.id
WHERE u.email = 'driver.demo@laundr.app';

SELECT 'driver_trip_today' AS check_name, t.id, t.status, t.scheduled_date, p.full_name AS driver_name
FROM delivery_trips t
JOIN profiles p ON p.id = t.driver_id
WHERE t.scheduled_date = CURRENT_DATE
ORDER BY t.created_at DESC;

SELECT 'trip_stops' AS check_name, ts.stop_no, c.name AS client, ts.status,
       ts.expected_deliver_count, ts.expected_collect_count
FROM trip_stops ts
LEFT JOIN clients c ON c.id = ts.client_id
WHERE ts.trip_id = 'f9300000-0000-0000-0000-000000000001'
ORDER BY ts.stop_no;
