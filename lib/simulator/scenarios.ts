import { createClient } from '@/lib/supabase/client';
import { ScanEventPayload } from '@/lib/rfid/scan-processor';

export type SpeedMode = 'slow' | 'normal' | 'fast';

const getDelayMs = (speed: SpeedMode) => {
  if (speed === 'slow') return 1000;
  if (speed === 'normal') return 300;
  return 0;
};

const delay = (ms: number) => new Promise(res => setTimeout(res, ms));

export interface SimulationProgress {
  current: number;
  total: number;
  message: string;
  isComplete: boolean;
  logs: any[]; // To append to UI
}

type ProgressCallback = (progress: SimulationProgress) => void;

async function fireEvent(payload: any, url = '/api/scan-events') {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  return res.json();
}

export async function runScanOut(
  orgId: string,
  clientId: string,
  gateId: string,
  count: number,
  speed: SpeedMode,
  onProgress: ProgressCallback
) {
  const supabase = createClient();

  onProgress({ current: 0, total: count, message: 'Querying items...', isComplete: false, logs: [] });

  const { data: items, error } = await supabase
    .from('linen_items')
    .select('rfid_tag_id')
    .eq('org_id', orgId)
    .eq('status', 'in_stock')
    .limit(count);

  if (error || !items) {
    onProgress({ current: 0, total: count, message: `Error: ${error?.message}`, isComplete: true, logs: [] });
    return;
  }

  const tagIds = items.map(i => i.rfid_tag_id);
  const actualCount = tagIds.length;

  if (actualCount === 0) {
    onProgress({ current: 0, total: count, message: 'No items in stock to scan out.', isComplete: true, logs: [] });
    return;
  }

  // Create a delivery_batch so reconcile can group this shipment
  const { data: batch } = await supabase
    .from('delivery_batches')
    .insert({
      org_id: orgId,
      client_id: clientId,
      batch_type: 'outbound',
      total_items: actualCount,
      driver_id: null,
    })
    .select('id')
    .single();

  const batchId = batch?.id ?? null;

  const logs = [];
  for (let i = 0; i < actualCount; i++) {
    const rfid = tagIds[i];

    // Step 1: checkout at factory gate → in_transit
    await fireEvent({
      org_id: orgId, rfid_tag_id: rfid, gate_id: gateId,
      event_type: 'checkout', client_id: clientId, batch_id: batchId, source: 'simulator'
    });

    // Step 2: delivery_signed at client site → out
    await fireEvent({
      org_id: orgId, rfid_tag_id: rfid, gate_id: `${gateId}_delivery`,
      event_type: 'delivery_signed', client_id: clientId, batch_id: batchId, source: 'simulator'
    });

    const logEntry = { org_id: orgId, rfid_tag_id: rfid, gate_id: gateId, event_type: 'checkout→delivery_signed', client_id: clientId, batch_id: batchId, timestamp: new Date().toISOString() };
    logs.push(logEntry);

    onProgress({
      current: i + 1,
      total: actualCount,
      message: `Scanning OUT... ${i + 1}/${actualCount}`,
      isComplete: i === actualCount - 1,
      logs: [logs[logs.length - 1]]
    });

    if (getDelayMs(speed) > 0) {
      await delay(getDelayMs(speed));
    }
  }
}

export async function runScanIn(
  orgId: string,
  clientId: string,
  gateId: string,
  count: number,
  speed: SpeedMode,
  onProgress: ProgressCallback
) {
  const supabase = createClient();
  
  onProgress({ current: 0, total: count, message: 'Querying OUT items...', isComplete: false, logs: [] });

  const { data: items, error } = await supabase
    .from('linen_items')
    .select('rfid_tag_id')
    .eq('org_id', orgId)
    .eq('client_id', clientId)
    .eq('status', 'out')
    .limit(count);

  if (error || !items) {
    onProgress({ current: 0, total: count, message: `Error: ${error?.message}`, isComplete: true, logs: [] });
    return;
  }

  const tagIds = items.map(i => i.rfid_tag_id);
  const actualCount = tagIds.length;
  
  if (actualCount === 0) {
    onProgress({ current: 0, total: count, message: 'No items found for this client.', isComplete: true, logs: [] });
    return;
  }

  const logs = [];
  for (let i = 0; i < actualCount; i++) {
    const rfid = tagIds[i];
    const isDamaged = Math.random() < 0.05; // 5% chance of damage found at QC

    // Step 1: checkin at factory gate (quality_check)
    await fireEvent({
      org_id: orgId, rfid_tag_id: rfid, gate_id: gateId,
      event_type: 'checkin', client_id: clientId, source: 'simulator'
    });

    // Step 2: inspection result — pass or fail
    await fireEvent({
      org_id: orgId, rfid_tag_id: rfid, gate_id: `${gateId}_qc`,
      event_type: isDamaged ? 'inspection_fail' : 'inspection_pass',
      client_id: clientId, source: 'simulator'
    });

    const logEntry = { org_id: orgId, rfid_tag_id: rfid, gate_id: gateId, event_type: isDamaged ? 'checkin→inspection_fail' : 'checkin→inspection_pass', client_id: clientId, timestamp: new Date().toISOString() };
    logs.push(logEntry);

    onProgress({
      current: i + 1,
      total: actualCount,
      message: `Scanning IN... ${i + 1}/${actualCount}`,
      isComplete: i === actualCount - 1,
      logs: [logs[logs.length - 1]]
    });

    if (getDelayMs(speed) > 0) {
      await delay(getDelayMs(speed));
    }
  }
}

export async function runHandheldAudit(
  orgId: string,
  gateId: string,
  speed: SpeedMode,
  onProgress: ProgressCallback
) {
  const supabase = createClient();
  
  onProgress({ current: 0, total: 0, message: 'Querying items for Audit...', isComplete: false, logs: [] });

  const { data: items, error } = await supabase
    .from('linen_items')
    .select('rfid_tag_id')
    .eq('org_id', orgId)
    .eq('status', 'in_stock');

  if (error || !items) {
    onProgress({ current: 0, total: 0, message: `Error: ${error?.message}`, isComplete: true, logs: [] });
    return;
  }

  const tagIds = items.map(i => i.rfid_tag_id);
  const actualCount = tagIds.length;
  
  if (actualCount === 0) {
    onProgress({ current: 0, total: 0, message: 'No items in stock to audit.', isComplete: true, logs: [] });
    return;
  }

  const logs = [];
  for (let i = 0; i < actualCount; i++) {
    const rfid = tagIds[i];
    const payload = {
      org_id: orgId,
      rfid_tag_id: rfid,
      gate_id: gateId,
      event_type: 'audit',
      source: 'simulator_audit'
    };

    await fireEvent(payload);
    logs.push({ ...payload, timestamp: new Date().toISOString() });
    
    onProgress({
      current: i + 1,
      total: actualCount,
      message: `Auditing... ${i + 1}/${actualCount}`,
      isComplete: i === actualCount - 1,
      logs: [logs[logs.length - 1]]
    });

    if (getDelayMs(speed) > 0) {
      await delay(getDelayMs(speed));
    }
  }
}

export async function runSimulateLoss(
  orgId: string,
  onProgress: ProgressCallback
) {
  const supabase = createClient();
  
  onProgress({ current: 0, total: 0, message: 'Finding items to lose...', isComplete: false, logs: [] });

  const limit = Math.floor(Math.random() * 3) + 1; // 1 to 3 items

  const { data: items, error } = await supabase
    .from('linen_items')
    .select('id, rfid_tag_id')
    .eq('org_id', orgId)
    .eq('status', 'out')
    .limit(limit);

  if (error || !items || items.length === 0) {
    onProgress({ current: 0, total: 0, message: `No out-of-stock items found to lose.`, isComplete: true, logs: [] });
    return;
  }

  const itemIds = items.map(i => i.id);
  const { error: updateError } = await supabase
    .from('linen_items')
    .update({ status: 'lost' })
    .in('id', itemIds);

  if (updateError) {
    onProgress({ current: 0, total: 0, message: `Update failed: ${updateError.message}`, isComplete: true, logs: [] });
    return;
  }

  const logEntries = items.map(i => ({
    org_id: orgId,
    rfid_tag_id: i.rfid_tag_id,
    gate_id: 'simulator',
    event_type: 'SIMULATED_LOSS',
    client_id: null,
    source: 'simulator_loss',
    timestamp: new Date().toISOString()
  }));

  onProgress({
    current: items.length,
    total: items.length,
    message: `Lost ${items.length} item(s) directly.`,
    isComplete: true,
    logs: logEntries
  });
}

export async function runScanOutViaRoute(
  orgId: string,
  routeId: string,
  speed: SpeedMode,
  onProgress: ProgressCallback
) {
  const supabase = createClient();

  onProgress({ current: 0, total: 0, message: 'Fetching route...', isComplete: false, logs: [] });

  const { data: route, error } = await supabase
    .from('routes')
    .select('*')
    .eq('id', routeId)
    .eq('org_id', orgId)
    .single();

  if (error || !route) {
    onProgress({ current: 0, total: 0, message: 'Route not found.', isComplete: true, logs: [] });
    return;
  }

  const stops = route.stops as any[];
  const totalItems = stops.reduce((sum: number, s: any) => sum + (s.item_count || 0), 0);
  let scanned = 0;

  for (let stopIdx = 0; stopIdx < stops.length; stopIdx++) {
    const stop = stops[stopIdx];
    const itemCount = stop.item_count || 10;
    const batchId = stop.batch_id;

    onProgress({ current: scanned, total: totalItems, message: `Stop ${stopIdx + 1}/${stops.length}: fetching items...`, isComplete: false, logs: [] });

    const { data: items } = await supabase
      .from('linen_items')
      .select('rfid_tag_id')
      .eq('org_id', orgId)
      .eq('status', 'in_stock')
      .limit(itemCount);

    const tags = items?.map(i => i.rfid_tag_id) ?? [];

    for (let i = 0; i < tags.length; i++) {
      await fireEvent({
        org_id: orgId, rfid_tag_id: tags[i], gate_id: 'route_gate',
        event_type: 'checkout', client_id: stop.client_id, batch_id: batchId,
        source: 'simulator_route',
      });

      scanned++;
      const logEntry = {
        org_id: orgId, rfid_tag_id: tags[i], gate_id: 'route_gate',
        event_type: 'checkout', client_id: stop.client_id, batch_id: batchId,
        timestamp: new Date().toISOString(),
      };
      onProgress({
        current: scanned, total: totalItems,
        message: `Stop ${stopIdx + 1}/${stops.length}: checkout ${i + 1}/${tags.length}`,
        isComplete: false, logs: [logEntry],
      });

      if (getDelayMs(speed) > 0) await delay(getDelayMs(speed));
    }

    // Sign the manifest — Fix B fires delivery_signed events for all items in this batch
    await fetch(`/api/routes/${routeId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stopIndex: stopIdx,
        status: 'delivered',
        signature: 'SIM_AUTO',
        signed_by: 'Simulator',
      }),
    });

    const signLog = { event_type: 'manifest_signed', batch_id: batchId, timestamp: new Date().toISOString() };
    onProgress({
      current: scanned, total: totalItems,
      message: `Stop ${stopIdx + 1}/${stops.length}: manifest signed → delivery_signed fired`,
      isComplete: stopIdx === stops.length - 1,
      logs: [signLog],
    });
  }
}

// Helper to look up client ID by name prefix
async function getClientIdByName(orgId: string, nameSearch: string) {
  const supabase = createClient();
  const { data } = await supabase
    .from('clients')
    .select('id')
    .eq('org_id', orgId)
    .ilike('name', `%${nameSearch}%`)
    .limit(1)
    .single();
  return data?.id;
}

export async function runFullDaySimulation(
  orgId: string,
  onProgress: ProgressCallback
) {
  const speed = 'fast';
  
  try {
    const hiltonId = await getClientIdByName(orgId, 'Hilton');
    const hardRockId = await getClientIdByName(orgId, 'Hard Rock');

    if (!hiltonId || !hardRockId) {
      onProgress({ current: 0, total: 0, message: 'Wait, required clients not found.', isComplete: true, logs: [] });
      return;
    }

    // Wrap onProgress to avoid early complete
    const handleProgress = (stepName: string, p: SimulationProgress, isLastStep = false) => {
      onProgress({
        ...p,
        message: `[${stepName}] ${p.message}`,
        isComplete: isLastStep && p.isComplete
      });
    };

    // Step 1: OUT 80 Hilton
    await runScanOut(orgId, hiltonId, 'gate_a', 80, speed, p => handleProgress('Step 1/5: Out Hilton', p));
    
    // Step 2: OUT 60 Hard Rock
    await runScanOut(orgId, hardRockId, 'gate_a', 60, speed, p => handleProgress('Step 2/5: Out Hard Rock', p));

    // Step 3: Wait 3 seconds
    onProgress({ current: 0, total: 0, message: '[Step 3/5] Waiting 3 seconds...', isComplete: false, logs: [] });
    await delay(3000);

    // Step 4: IN 78 Hilton (2 missing)
    await runScanIn(orgId, hiltonId, 'gate_b', 78, speed, p => handleProgress('Step 4/5: In Hilton', p));

    // Step 5: IN 60 Hard Rock
    await runScanIn(orgId, hardRockId, 'gate_b', 60, speed, p => handleProgress('Step 5/5: In Hard Rock', p, true));

  } catch (err: any) {
    onProgress({ current: 0, total: 0, message: `Full day error: ${err.message}`, isComplete: true, logs: [] });
  }
}
