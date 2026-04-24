-- ============================================================
-- SQL Function to Reset and Seed Default Mockup Data
-- Date: 2026-04-18
-- ============================================================

CREATE OR REPLACE FUNCTION reset_to_default(p_org_id UUID, p_user_id UUID)
RETURNS JSONB AS $$
DECLARE
  v_count_items INT := 0;
  v_count_orders INT := 0;
  v_cat record;
  v_client_id UUID;
  v_order_id UUID;
  v_trip_id UUID;
  v_hyatt_order_id UUID;
  v_hilton_order_id UUID;
  v_hyatt_id UUID;
  v_hilton_id UUID;
  v_driver_id UUID;
BEGIN
  -- 1. CLEANUP (Strict FK Order)
  DELETE FROM factory_notifications WHERE org_id = p_org_id;
  DELETE FROM trip_stops WHERE org_id = p_org_id;
  DELETE FROM delivery_trips WHERE org_id = p_org_id;
  DELETE FROM scan_events WHERE org_id = p_org_id;
  DELETE FROM active_sessions WHERE org_id = p_org_id;
  DELETE FROM production_batches WHERE org_id = p_org_id;
  DELETE FROM rewash_records WHERE org_id = p_org_id;
  UPDATE linen_items SET current_batch_id = NULL WHERE org_id = p_org_id;
  DELETE FROM delivery_order_items WHERE order_id IN (SELECT id FROM delivery_orders WHERE org_id = p_org_id);
  DELETE FROM delivery_orders WHERE org_id = p_org_id;
  DELETE FROM delivery_batches WHERE org_id = p_org_id;
  DELETE FROM routes WHERE org_id = p_org_id;
  DELETE FROM client_par_levels WHERE org_id = p_org_id;
  DELETE FROM linen_items WHERE org_id = p_org_id;
  DELETE FROM linen_categories WHERE org_id = p_org_id;
  DELETE FROM clients WHERE org_id = p_org_id;

  -- 2. SYNC DEMO USERS
  UPDATE profiles SET org_id = p_org_id WHERE id = p_user_id;

  SELECT id INTO v_driver_id FROM profiles 
  WHERE org_id = p_org_id AND (full_name ILIKE '%Somchai%' OR role = 'driver')
  ORDER BY (CASE WHEN full_name ILIKE '%Somchai%' THEN 0 ELSE 1 END)
  LIMIT 1;

  IF v_driver_id IS NOT NULL THEN
     UPDATE profiles SET org_id = p_org_id WHERE id = v_driver_id;
  ELSE
     v_driver_id := p_user_id;
  END IF;

  -- 3. SEED CATEGORIES & ITEMS (Total 15,000)
  FOR v_cat IN 
    SELECT * FROM (VALUES 
      ('King Bed Sheet', 'KBS', 1200), ('Queen Bed Sheet', 'QBS', 1000), 
      ('Single Bed Sheet', 'SBS', 800), ('Pillow Case', 'PC', 150), 
      ('Bath Towel', 'BT', 450), ('Hand Towel', 'HT', 200),
      ('Face Towel', 'FT', 100), ('Bath Mat', 'BM', 300), 
      ('King Duvet Cover', 'KDC', 1800), ('Queen Duvet Cover', 'QDC', 1500), 
      ('Single Duvet Cover', 'SDC', 1200), ('Blanket', 'BL', 2500),
      ('Table Cloth (L)', 'TCL', 800), ('Table Cloth (M)', 'TCM', 600), 
      ('Napkin', 'NP', 80), ('Apron', 'AP', 350), 
      ('Chef Coat', 'CC', 950), ('Staff Uniform', 'SU', 750),
      ('Pool Towel', 'PT', 500), ('Spa Robe', 'SR', 1100)
    ) AS t(name, prefix, cost)
  LOOP
    INSERT INTO linen_categories (org_id, name, replacement_cost)
    VALUES (p_org_id, v_cat.name, v_cat.cost)
    RETURNING id INTO v_order_id; -- Temporary reuse of variable

    INSERT INTO linen_items (org_id, rfid_tag_id, category_id, status, wash_count)
    SELECT p_org_id, 'T-' || v_cat.prefix || '-' || LPAD(gs::text, 4, '0'), v_order_id, 'clean', 5
    FROM generate_series(1, 750) AS gs;
    
    v_count_items := v_count_items + 750;
  END LOOP;

  -- 4. SEED CLIENTS & DISPATCHED ORDERS
  INSERT INTO clients (org_id, name, address) VALUES (p_org_id, 'Hyatt Regency Pattaya', 'Beach Rd') RETURNING id INTO v_hyatt_id;
  INSERT INTO clients (org_id, name, address) VALUES (p_org_id, 'Hilton Pattaya', 'Central Festival') RETURNING id INTO v_hilton_id;
  
  INSERT INTO delivery_orders (org_id, client_id, scheduled_date, status, notes, order_number)
  VALUES (p_org_id, v_hyatt_id, CURRENT_DATE, 'dispatched', 'Master Seed Hyatt', 'DO-2026-0001')
  RETURNING id INTO v_hyatt_order_id;
  
  INSERT INTO delivery_orders (org_id, client_id, scheduled_date, status, notes, order_number)
  VALUES (p_org_id, v_hilton_id, CURRENT_DATE, 'dispatched', 'Master Seed Hilton', 'DO-2026-0003')
  RETURNING id INTO v_hilton_order_id;

  -- 5. SYNC TRIP
  INSERT INTO delivery_trips (org_id, driver_id, scheduled_date, status, started_at)
  VALUES (p_org_id, v_driver_id, CURRENT_DATE, 'active', now())
  RETURNING id INTO v_trip_id;

  INSERT INTO trip_stops (trip_id, org_id, stop_no, order_id, client_id, expected_deliver_count, status)
  VALUES 
    (v_trip_id, p_org_id, 1, v_hyatt_order_id, v_hyatt_id, 150, 'active'),
    (v_trip_id, p_org_id, 2, v_hilton_order_id, v_hilton_id, 150, 'pending');

  RETURN jsonb_build_object('success', true, 'items', v_count_items, 'driver_id', v_driver_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
