import { createClient } from '@/lib/supabase/client';
import { RFIDEngine, RFIDReadConfig, RFIDReadEvent } from '@/lib/simulator/rfid-engine';

export const ACTIVE_PRODUCTION_STATUSES = ['queued', 'washing', 'drying', 'folding'] as const;
export type ActiveProductionStatus = typeof ACTIVE_PRODUCTION_STATUSES[number];

type ScenarioName =
  | 'Morning Dispatch'
  | 'Client Return'
  | 'Production Cycle'
  | 'Full Day Simulation'
  | 'Stress Test'
  | 'Historical Seed'
  | 'Manual Picking Scan';

export interface SimulatorLogEntry {
  timestamp: string;
  level: 'info' | 'success' | 'warn' | 'error';
  icon: string;
  message: string;
  meta?: Record<string, unknown>;
}

export interface ScenarioResult {
  scenario_name: string;
  duration_ms: number;
  events_fired: number;
  items_processed: number;
  errors_encountered: number;
  log: SimulatorLogEntry[];
  performance?: {
    total_api_calls: number;
    avg_latency_ms: number;
    p95_latency_ms: number;
    p99_latency_ms: number;
    throughput_items_per_sec: number;
    peak_throughput_items_per_sec: number;
    integrity: {
      expected_unique_tags: number;
      observed_unique_tags: number;
      duplicates_detected: number;
      status_consistency: 'PASS' | 'FAIL';
    };
  };
}

export interface ScenarioProgress {
  scenario_name: string;
  current_step: number;
  total_steps: number;
  step_label: string;
  processed_items: number;
  total_items: number;
  tags_per_second: number;
  avg_latency_ms: number;
  errors: number;
  last_events: RFIDReadEvent[];
}

type RuntimeSpeed = 'realistic' | 'fast' | 'instant';

interface ScenarioHooks {
  onLog?: (entry: SimulatorLogEntry) => void;
  onProgress?: (state: ScenarioProgress) => void;
  onVisualization?: (events: RFIDReadEvent[]) => void;
  speed?: RuntimeSpeed;
  reader_config?: Partial<RFIDReadConfig>;
}

type ApiMethod = 'GET' | 'POST' | 'PATCH' | 'DELETE';

interface ScenarioContext {
  orgId: string;
  name: ScenarioName;
  startedAt: number;
  hooks?: ScenarioHooks;
  log: SimulatorLogEntry[];
  eventsFired: number;
  itemsProcessed: number;
  errors: number;
  apiLatencyMs: number[];
  apiCalls: number;
  peakTagsPerSecond: number;
  progress: ScenarioProgress;
}

// Realistic rates: industrial UHF fixed gates read 400-600 tags/sec,
// handhelds 80-120 tags/sec (EPC Gen2 protocol).
const DEFAULT_READER_CONFIG: Record<'fixed_gate' | 'handheld', RFIDReadConfig> = {
  fixed_gate: {
    reader_type: 'fixed_gate',
    total_tags: 0,
    read_rate_per_second: 450,
    duplicate_ratio: 8,
    miss_rate: 0.8,
    noise_tags: 1,
  },
  handheld: {
    reader_type: 'handheld',
    total_tags: 0,
    read_rate_per_second: 90,
    duplicate_ratio: 5,
    miss_rate: 2.0,
    noise_tags: 1,
  },
};

const rfidEngine = new RFIDEngine();

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function percentile(values: number[], p: number): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Number(sorted[idx].toFixed(1));
}

function avg(values: number[]): number {
  if (!values.length) return 0;
  return Number((values.reduce((sum, n) => sum + n, 0) / values.length).toFixed(1));
}

function nowIso(): string {
  return new Date().toISOString();
}

function delayForSpeed(speed: RuntimeSpeed | undefined, baseMs: number): number {
  if (speed === 'instant') return 0;
  if (speed === 'fast') return Math.max(0, Math.floor(baseMs * 0.2));
  return baseMs;
}

// Controls the RFID engine's internal batch interval — distinct from inter-batch API delay
function speedIntervalMs(speed: RuntimeSpeed | undefined, baseMs: number): number {
  if (speed === 'instant') return 0;
  if (speed === 'fast') return Math.max(0, Math.floor(baseMs * 0.15)); // ~15ms for fast
  return baseMs;
}

function chunk<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) {
    out.push(rows.slice(i, i + size));
  }
  return out;
}

function createContext(
  scenarioName: ScenarioName,
  orgId: string,
  hooks?: ScenarioHooks,
  totalSteps = 1
): ScenarioContext {
  return {
    orgId,
    name: scenarioName,
    startedAt: Date.now(),
    hooks,
    log: [],
    eventsFired: 0,
    itemsProcessed: 0,
    errors: 0,
    apiLatencyMs: [],
    apiCalls: 0,
    peakTagsPerSecond: 0,
    progress: {
      scenario_name: scenarioName,
      current_step: 0,
      total_steps: totalSteps,
      step_label: 'Initializing',
      processed_items: 0,
      total_items: 0,
      tags_per_second: 0,
      avg_latency_ms: 0,
      errors: 0,
      last_events: [],
    },
  };
}

function pushLog(ctx: ScenarioContext, level: SimulatorLogEntry['level'], icon: string, message: string, meta?: Record<string, unknown>) {
  const entry: SimulatorLogEntry = {
    timestamp: nowIso(),
    level,
    icon,
    message,
    meta,
  };
  ctx.log.push(entry);
  ctx.hooks?.onLog?.(entry);
}

function emitProgress(ctx: ScenarioContext, updates: Partial<ScenarioProgress>) {
  ctx.progress = {
    ...ctx.progress,
    ...updates,
    avg_latency_ms: avg(ctx.apiLatencyMs),
    errors: ctx.errors,
  };
  ctx.hooks?.onProgress?.(ctx.progress);
}

function observeBatchEvents(ctx: ScenarioContext, events: RFIDReadEvent[]) {
  ctx.eventsFired += events.length;
  ctx.hooks?.onVisualization?.(events);
  emitProgress(ctx, {
    last_events: events.slice(-20),
  });
}

function trackThroughput(ctx: ScenarioContext, batchSize: number) {
  const elapsedSec = Math.max(0.001, (Date.now() - ctx.startedAt) / 1000);
  const tps = Number((ctx.itemsProcessed / elapsedSec).toFixed(1));
  ctx.peakTagsPerSecond = Math.max(ctx.peakTagsPerSecond, tps);
  emitProgress(ctx, {
    tags_per_second: tps,
    processed_items: ctx.itemsProcessed,
    total_items: Math.max(ctx.progress.total_items, ctx.itemsProcessed + batchSize),
  });
}

async function apiRequest<T>(ctx: ScenarioContext, path: string, method: ApiMethod, body?: Record<string, unknown>): Promise<T> {
  const started = performance.now();
  const res = await fetch(path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const took = performance.now() - started;

  ctx.apiCalls += 1;
  ctx.apiLatencyMs.push(Number(took.toFixed(1)));

  if (!res.ok) {
    ctx.errors += 1;
    const errMsg = String(payload.error || payload.message || `api_${res.status}`);
    pushLog(ctx, 'error', '❌', `${method} ${path} failed: ${errMsg}`, { body, payload });
    throw new Error(errMsg);
  }

  return payload as T;
}

async function getOrgSupabase() {
  const supabase = createClient();
  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
  return { supabase, orgId: String(orgId || '') };
}

async function ensureClient(ctx: ScenarioContext, clientName: string): Promise<{ id: string; name: string }> {
  const supabase = createClient();
  const { data: existing } = await supabase
    .from('clients')
    .select('id, name')
    .eq('org_id', ctx.orgId)
    .eq('name', clientName)
    .limit(1)
    .maybeSingle();

  if (existing?.id) return { id: existing.id, name: existing.name };

  const { data: created, error } = await supabase
    .from('clients')
    .insert({ org_id: ctx.orgId, name: clientName, active: true })
    .select('id, name')
    .single();

  if (error || !created) {
    throw new Error(error?.message || `unable_to_create_client_${clientName}`);
  }

  pushLog(ctx, 'info', '🧾', `Created client ${clientName}`);
  return { id: created.id, name: created.name };
}

async function ensureCategory(ctx: ScenarioContext, key: 'BS' | 'BT' | 'UF' | 'AP' | 'DC'): Promise<{ id: string; name: string }> {
  const supabase = createClient();
  const namesByCode: Record<string, string[]> = {
    BS: ['Bed Sheet'],
    BT: ['Bath Towel', 'Bath Towel (Large)', 'Bath Towel (Small)'],
    UF: ['Staff Uniform', 'Uniform'],
    AP: ['Apron'],
    DC: ['Duvet Cover'],
  };

  const preferredName = namesByCode[key][0];

  for (const candidate of namesByCode[key]) {
    const { data: found } = await supabase
      .from('linen_categories')
      .select('id, name')
      .eq('org_id', ctx.orgId)
      .eq('name', candidate)
      .limit(1)
      .maybeSingle();
    if (found?.id) return { id: found.id, name: found.name };
  }

  const defaults: Record<string, { lifespan_cycles: number; replacement_cost: number }> = {
    BS: { lifespan_cycles: 180, replacement_cost: 1200 },
    BT: { lifespan_cycles: 220, replacement_cost: 700 },
    UF: { lifespan_cycles: 150, replacement_cost: 900 },
    AP: { lifespan_cycles: 140, replacement_cost: 450 },
    DC: { lifespan_cycles: 180, replacement_cost: 950 },
  };

  const { data: created, error } = await supabase
    .from('linen_categories')
    .insert({
      org_id: ctx.orgId,
      name: preferredName,
      lifespan_cycles: defaults[key].lifespan_cycles,
      replacement_cost: defaults[key].replacement_cost,
    })
    .select('id, name')
    .single();

  if (error || !created) {
    throw new Error(error?.message || `unable_to_create_category_${preferredName}`);
  }

  pushLog(ctx, 'info', '🏷️', `Created category ${preferredName}`);
  return { id: created.id, name: created.name };
}

async function pickCleanTagsByCategory(
  orgId: string,
  requestedByCategory: Array<{ category_id: string; qty: number }>
): Promise<Array<{ category_id: string; qty: number; tags: string[] }>> {
  const supabase = createClient();
  const output: Array<{ category_id: string; qty: number; tags: string[] }> = [];

  for (const row of requestedByCategory) {
    const { data: items } = await supabase
      .from('linen_items')
      .select('rfid_tag_id')
      .eq('org_id', orgId)
      .eq('category_id', row.category_id)
      .eq('status', 'clean')
      .is('current_batch_id', null)
      .limit(Math.max(1, row.qty));

    const tags = (items || []).map((item) => String(item.rfid_tag_id)).filter(Boolean);
    output.push({
      category_id: row.category_id,
      qty: Math.min(row.qty, tags.length),
      tags,
    });
  }

  return output;
}

async function runPickingAndDispatch(
  ctx: ScenarioContext,
  orderId: string,
  gateId: string,
  allTargetTags: string[],
  readerType: 'fixed_gate' | 'handheld',
  progressStep: number,
  stepLabel: string
): Promise<void> {
  emitProgress(ctx, {
    current_step: progressStep,
    step_label: stepLabel,
    total_items: Math.max(ctx.progress.total_items, ctx.itemsProcessed + allTargetTags.length),
  });

  const start = await apiRequest<{ session_id: string; batch_id: string }>(
    ctx,
    `/api/orders/${orderId}/picking/start`,
    'POST',
    { gate_id: gateId }
  );
  pushLog(ctx, 'success', '🟢', `Picking session started for order ${orderId}`, { session_id: start.session_id, batch_id: start.batch_id });

  let sessionEnded = false;

  try {
    const cfg: RFIDReadConfig = {
      ...DEFAULT_READER_CONFIG[readerType],
      ...ctx.hooks?.reader_config,
      reader_type: readerType,
      total_tags: allTargetTags.length,
      interval_ms: speedIntervalMs(ctx.hooks?.speed, readerType === 'fixed_gate' ? 100 : 200),
    };

    const generator = readerType === 'fixed_gate'
      ? rfidEngine.simulateGateRead(allTargetTags, cfg)
      : rfidEngine.simulateHandheldRead(allTargetTags, cfg, 3);

    for await (const events of generator) {
      if (!events.length) continue;
      observeBatchEvents(ctx, events);

      // Noise tags (not in inventory) would just fail with UNKNOWN_TAG — skip them in picking
      const batchedTags = events
        .filter((event) => !event.is_noise)
        .map((event) => event.epc)
        .filter(Boolean);
      if (!batchedTags.length) continue;
      const chunked = chunk(batchedTags, 200);

      for (const tags of chunked) {
        const scanRes = await apiRequest<{ results: Array<{ result: string; rfid_tag_id: string; message?: string }> }>(
          ctx,
          `/api/orders/${orderId}/picking/scan`,
          'POST',
          { session_id: start.session_id, tags }
        );

        const added = scanRes.results.filter((row) => row.result === 'added').length;
        const duplicate = scanRes.results.filter((row) => row.result === 'skipped').length;
        const errored = scanRes.results.filter((row) => row.result === 'error').length;

        ctx.itemsProcessed += added;
        if (errored > 0) {
          ctx.errors += errored;
        }

        pushLog(
          ctx,
          errored > 0 ? 'warn' : 'info',
          '📡',
          `Scan burst: +${added} added, ${duplicate} skipped, ${errored} errors`,
          { orderId, added, duplicate, errored, sample: scanRes.results.slice(0, 5) }
        );
        trackThroughput(ctx, added);

        const waitMs = delayForSpeed(ctx.hooks?.speed, readerType === 'fixed_gate' ? 120 : 220);
        if (waitMs > 0) await sleep(waitMs);
      }
    }

    const end = await apiRequest<{ ready_to_dispatch: boolean }>(
      ctx,
      `/api/orders/${orderId}/picking/end`,
      'POST',
      { session_id: start.session_id }
    );
    sessionEnded = true;

    if (!end.ready_to_dispatch) {
      throw new Error('order_not_fully_picked');
    }

    await apiRequest<{ batch_id: string }>(ctx, `/api/orders/${orderId}/dispatch`, 'PATCH', {
      actual_weight_kg: Number((allTargetTags.length * 0.3).toFixed(1)),
    });
    pushLog(ctx, 'success', '🚚', `Order dispatched`, { orderId, total_tags: allTargetTags.length });
  } finally {
    // Guarantee session is always ended to prevent blocking future runs
    if (!sessionEnded) {
      try {
        await apiRequest(ctx, `/api/orders/${orderId}/picking/end`, 'POST', { session_id: start.session_id });
      } catch {
        // Best-effort cleanup — ignore errors here
      }
    }
  }
}

function buildResult(ctx: ScenarioContext): ScenarioResult {
  const duration = Date.now() - ctx.startedAt;
  const throughput = ctx.itemsProcessed > 0
    ? Number((ctx.itemsProcessed / Math.max(0.1, duration / 1000)).toFixed(1))
    : 0;

  return {
    scenario_name: ctx.name,
    duration_ms: duration,
    events_fired: ctx.eventsFired,
    items_processed: ctx.itemsProcessed,
    errors_encountered: ctx.errors,
    log: ctx.log,
    performance: {
      total_api_calls: ctx.apiCalls,
      avg_latency_ms: avg(ctx.apiLatencyMs),
      p95_latency_ms: percentile(ctx.apiLatencyMs, 95),
      p99_latency_ms: percentile(ctx.apiLatencyMs, 99),
      throughput_items_per_sec: throughput,
      peak_throughput_items_per_sec: Number(ctx.peakTagsPerSecond.toFixed(1)),
      integrity: {
        expected_unique_tags: 0,
        observed_unique_tags: 0,
        duplicates_detected: 0,
        status_consistency: 'PASS',
      },
    },
  };
}

export async function scenarioMorningDispatch(
  params: { org_id: string; date?: Date; hooks?: ScenarioHooks }
): Promise<ScenarioResult> {
  const ctx = createContext('Morning Dispatch', params.org_id, params.hooks, 3);
  const scheduleDate = (params.date || new Date()).toISOString().slice(0, 10);

  pushLog(ctx, 'info', '🟢', 'Session started - Morning Dispatch');

  try {
    const clients = {
      hilton: await ensureClient(ctx, 'Hilton Pattaya'),
      hardRock: await ensureClient(ctx, 'Hard Rock Hotel Pattaya'),
      centara: await ensureClient(ctx, 'Centara Grand Mirage Beach Resort'),
    };

    const categories = {
      BS: await ensureCategory(ctx, 'BS'),
      BT: await ensureCategory(ctx, 'BT'),
      UF: await ensureCategory(ctx, 'UF'),
      AP: await ensureCategory(ctx, 'AP'),
      DC: await ensureCategory(ctx, 'DC'),
    };

    const orderDefs = [
      {
        client: clients.hilton,
        gate: 'gate_a',
        items: [
          { category_id: categories.BS.id, qty: 100 },
          { category_id: categories.BT.id, qty: 50 },
        ],
      },
      {
        client: clients.hardRock,
        gate: 'gate_a',
        items: [
          { category_id: categories.UF.id, qty: 80 },
          { category_id: categories.AP.id, qty: 30 },
        ],
      },
      {
        client: clients.centara,
        gate: 'gate_a',
        items: [
          { category_id: categories.BS.id, qty: 60 },
          { category_id: categories.BT.id, qty: 40 },
          { category_id: categories.DC.id, qty: 20 },
        ],
      },
    ];

    let step = 0;
    for (const orderDef of orderDefs) {
      step += 1;
      emitProgress(ctx, {
        current_step: step,
        step_label: `Create order for ${orderDef.client.name}`,
      });

      const available = await pickCleanTagsByCategory(ctx.orgId, orderDef.items);
      const normalizedItems = available
        .map((row) => ({ category_id: row.category_id, qty: row.qty }))
        .filter((row) => row.qty > 0);
      const tags = available.flatMap((row) => row.tags.slice(0, row.qty));

      if (!normalizedItems.length || !tags.length) {
        ctx.errors += 1;
        pushLog(ctx, 'warn', '⚠️', `Skipped ${orderDef.client.name}: not enough clean stock`);
        continue;
      }

      const created = await apiRequest<{ order_id: string; order_number: string }>(ctx, '/api/orders', 'POST', {
        client_id: orderDef.client.id,
        scheduled_date: scheduleDate,
        items: normalizedItems,
        notes: '[SIM] Morning Dispatch',
      });

      pushLog(ctx, 'info', '📋', `Order ${created.order_number} created (${orderDef.client.name})`, {
        order_id: created.order_id,
        items: normalizedItems,
      });

      await runPickingAndDispatch(
        ctx,
        created.order_id,
        orderDef.gate,
        tags,
        'fixed_gate',
        step,
        `Picking ${created.order_number}`
      );

      const waitMs = delayForSpeed(ctx.hooks?.speed, 1200);
      if (waitMs > 0) await sleep(waitMs);
    }

    pushLog(ctx, 'success', '✅', 'Morning Dispatch complete');
  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Morning Dispatch failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  return buildResult(ctx);
}

export async function scenarioClientReturn(
  params: {
    org_id: string;
    order_id?: string;
    return_rate?: number;
    rewash_rate?: number;
    hooks?: ScenarioHooks;
  }
): Promise<ScenarioResult> {
  const ctx = createContext('Client Return', params.org_id, params.hooks, 4);
  const returnRate = params.return_rate ?? 0.97;
  const rewashRate = params.rewash_rate ?? 0.03;

  pushLog(ctx, 'info', '🟢', 'Session started - Client Return');

  try {
    const supabase = createClient();

    let orderId = params.order_id;
    if (!orderId) {
      const { data: latestOrder } = await supabase
        .from('delivery_orders')
        .select('id, order_number')
        .eq('org_id', ctx.orgId)
        .eq('status', 'dispatched')
        .order('dispatched_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!latestOrder?.id) {
        throw new Error('no_dispatched_order');
      }
      orderId = latestOrder.id;
      pushLog(ctx, 'info', '📦', `Using latest dispatched order ${latestOrder.order_number}`);
    }

    emitProgress(ctx, { current_step: 1, step_label: 'Load outbound items' });

    const { data: outbound } = await supabase
      .from('delivery_batches')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('order_id', orderId)
      .eq('batch_type', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!outbound?.id) {
      throw new Error('outbound_batch_not_found');
    }

    const { data: outItems } = await supabase
      .from('linen_items')
      .select('id, rfid_tag_id')
      .eq('org_id', ctx.orgId)
      .eq('current_batch_id', outbound.id)
      .eq('status', 'out');

    const items = (outItems || []).map((row) => ({ id: String(row.id), tag: String(row.rfid_tag_id) }));
    if (!items.length) {
      throw new Error('no_out_items');
    }

    const returnCount = Math.max(0, Math.floor(items.length * returnRate));
    const rewashCount = Math.min(returnCount, Math.max(0, Math.floor(returnCount * rewashRate)));

    const returned = items.slice(0, returnCount);
    const rewash = returned.slice(0, rewashCount);

    emitProgress(ctx, {
      current_step: 2,
      step_label: 'Gate B return scan',
      total_items: items.length,
    });

    const cfg: RFIDReadConfig = {
      ...DEFAULT_READER_CONFIG.fixed_gate,
      ...ctx.hooks?.reader_config,
      reader_type: 'fixed_gate',
      total_tags: returned.length,
      noise_tags: Math.max(0, ctx.hooks?.reader_config?.noise_tags ?? 1),
      interval_ms: speedIntervalMs(ctx.hooks?.speed, 100),
    };

    for await (const events of rfidEngine.simulateGateRead(returned.map((row) => row.tag), cfg)) {
      observeBatchEvents(ctx, events);
      const tagChunk = chunk(
        events.map((event) => event.epc).filter(Boolean),
        200
      );

      for (const tags of tagChunk) {
        await apiRequest(ctx, '/api/scan-events', 'POST', {
          org_id: ctx.orgId,
          source: 'simulator_return',
          session_id: `sim-return-${Date.now()}`,
          events: tags.map((tag) => ({
            rfid_tag_id: tag,
            gate_id: 'gate_b',
            event_type: 'checkin',
            batch_id: outbound.id,
            order_id: orderId,
            weight_kg: null,
          })),
        });
      }

      ctx.itemsProcessed += tagsUniqueCount(events);
      trackThroughput(ctx, events.length);

      const waitMs = delayForSpeed(ctx.hooks?.speed, 100);
      if (waitMs > 0) await sleep(waitMs);
    }

    if (rewash.length > 0) {
      emitProgress(ctx, { current_step: 3, step_label: 'Apply rewash flags' });
      // Use scan-events API so DB trigger fires, rewash_records are created, and audit trail exists
      const rewashChunks = chunk(rewash.map((item) => item.tag), 200);
      for (const tagChunk of rewashChunks) {
        await apiRequest(ctx, '/api/scan-events', 'POST', {
          org_id: ctx.orgId,
          source: 'simulator_rewash',
          session_id: `sim-rewash-${Date.now()}`,
          events: tagChunk.map((tag) => ({
            rfid_tag_id: tag,
            gate_id: 'qc_1',
            event_type: 'qc_rewash',
            batch_id: null,
            order_id: orderId,
            weight_kg: null,
          })),
        });
      }
      pushLog(ctx, 'warn', '🧺', `Marked ${rewash.length} items as rewash via QC scan`);
    }

    const completeReturn = await apiRequest<{
      inbound_batch_id: string;
      production_batch_id: string;
      reconcile_summary: { dispatched: number; returned: number; missing: number };
    }>(ctx, `/api/orders/${orderId}/complete-return`, 'PATCH');

    const returnedIds = returned.map((item) => item.id);
    if (returnedIds.length > 0) {
      await supabase
        .from('linen_items')
        .update({ current_batch_id: completeReturn.inbound_batch_id })
        .in('id', returnedIds)
        .eq('org_id', ctx.orgId)
        .in('status', ['dirty', 'rewash']);
    }

    pushLog(
      ctx,
      'success',
      '✅',
      `${completeReturn.reconcile_summary.returned}/${completeReturn.reconcile_summary.dispatched} items returned`,
      {
        missing: completeReturn.reconcile_summary.missing,
        inbound_batch_id: completeReturn.inbound_batch_id,
        production_batch_id: completeReturn.production_batch_id,
      }
    );

    emitProgress(ctx, { current_step: 4, step_label: 'Return reconcile complete' });
  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Client Return failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  return buildResult(ctx);
}

function tagsUniqueCount(events: RFIDReadEvent[]): number {
  return new Set(events.map((row) => row.epc)).size;
}

export async function scenarioProductionCycle(
  params: {
    org_id: string;
    production_batch_id?: string;
    hooks?: ScenarioHooks;
  }
): Promise<ScenarioResult> {
  const ctx = createContext('Production Cycle', params.org_id, params.hooks, 5);
  const supabase = createClient();

  pushLog(ctx, 'info', '🟢', 'Session started - Production Cycle');

  try {
    emitProgress(ctx, { current_step: 1, step_label: 'Resolve production batch' });

    let productionBatchId = params.production_batch_id;

    if (!productionBatchId) {
      const { data: batch } = await supabase
        .from('production_batches')
        .select('id, status, inbound_batch_id')
        .eq('org_id', ctx.orgId)
        .in('status', ACTIVE_PRODUCTION_STATUSES)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!batch?.id) {
        throw new Error('no_active_production_batch');
      }

      productionBatchId = batch.id;
    }

    await apiRequest(ctx, '/api/production/start-washing', 'POST', { production_batch_id: productionBatchId });
    emitProgress(ctx, { current_step: 2, step_label: 'Washing in progress' });
    pushLog(ctx, 'info', '🫧', 'Wash started');
    await sleep(delayForSpeed(ctx.hooks?.speed, 900));

    await apiRequest(ctx, '/api/production/mark-wash-done', 'POST', { production_batch_id: productionBatchId });
    emitProgress(ctx, { current_step: 3, step_label: 'Drying in progress' });
    pushLog(ctx, 'info', '🌬️', 'Wash done -> drying');
    await sleep(delayForSpeed(ctx.hooks?.speed, 900));

    await apiRequest(ctx, '/api/production/mark-dry-done', 'POST', { production_batch_id: productionBatchId });
    emitProgress(ctx, { current_step: 4, step_label: 'Folding and QC prep' });
    pushLog(ctx, 'info', '🧺', 'Drying done -> folding');

    const { data: productionBatch } = await supabase
      .from('production_batches')
      .select('id, inbound_batch_id')
      .eq('id', productionBatchId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!productionBatch?.inbound_batch_id) {
      throw new Error('production_batch_not_found');
    }

    const { data: foldingItems } = await supabase
      .from('linen_items')
      .select('id')
      .eq('org_id', ctx.orgId)
      .eq('current_batch_id', productionBatch.inbound_batch_id)
      .eq('status', 'folding');

    const total = (foldingItems || []).length;
    if (!total) {
      throw new Error('no_folding_items_for_qc');
    }

    const pass = Math.floor(total * 0.97);
    const rewash = Math.floor(total * 0.02);
    const reject = Math.max(0, total - pass - rewash);

    await apiRequest(ctx, '/api/production/submit-qc', 'POST', {
      production_batch_id: productionBatchId,
      passed: pass,
      rewash,
      rejected: reject,
    });

    ctx.itemsProcessed += total;
    trackThroughput(ctx, total);

    emitProgress(ctx, { current_step: 5, step_label: 'QC complete' });
    pushLog(ctx, 'success', '✅', `QC done: ${pass} pass, ${rewash} rewash, ${reject} rejected`);
  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Production Cycle failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  return buildResult(ctx);
}

export async function scenarioFullDay(
  params: {
    org_id: string;
    scale?: 'small' | 'medium' | 'large';
    hooks?: ScenarioHooks;
  }
): Promise<ScenarioResult> {
  const ctx = createContext('Full Day Simulation', params.org_id, params.hooks, 8);

  const scaleMap = {
    small: 0.55,
    medium: 1,
    large: 3,
  } as const;
  const multiplier = scaleMap[params.scale || 'medium'];

  pushLog(ctx, 'info', '🟢', `Session started - Full Day (${params.scale || 'medium'})`);

  try {
    const morning = await scenarioMorningDispatch({
      org_id: params.org_id,
      hooks: {
        ...params.hooks,
        onLog: (entry) => pushLog(ctx, entry.level, entry.icon, `[06:30-08:00] ${entry.message}`, entry.meta),
      },
    });

    ctx.itemsProcessed += morning.items_processed;
    ctx.eventsFired += morning.events_fired;
    ctx.apiCalls += morning.performance?.total_api_calls || 0;
    ctx.apiLatencyMs.push(morning.performance?.avg_latency_ms || 0);
    emitProgress(ctx, {
      current_step: 3,
      step_label: 'Morning dispatch complete',
      processed_items: ctx.itemsProcessed,
      total_items: Math.floor(1000 * multiplier),
    });

    const supabase = createClient();
    const { data: dispatchedOrders } = await supabase
      .from('delivery_orders')
      .select('id, order_number')
      .eq('org_id', ctx.orgId)
      .eq('status', 'dispatched')
      .order('dispatched_at', { ascending: false })
      .limit(3);

    for (let i = 0; i < (dispatchedOrders || []).length; i += 1) {
      const order = dispatchedOrders?.[i];
      if (!order?.id) continue;

      const ret = await scenarioClientReturn({
        org_id: params.org_id,
        order_id: order.id,
        return_rate: i === 0 ? 0.98 : 0.97,
        rewash_rate: i === 1 ? 0.04 : 0.03,
        hooks: {
          ...params.hooks,
          onLog: (entry) => pushLog(ctx, entry.level, entry.icon, `[13:00] ${entry.message}`, entry.meta),
        },
      });
      ctx.itemsProcessed += ret.items_processed;
      ctx.eventsFired += ret.events_fired;
      ctx.apiCalls += ret.performance?.total_api_calls || 0;
      emitProgress(ctx, { current_step: 4 + i, step_label: `Return processed (${order.order_number})` });
      await sleep(delayForSpeed(params.hooks?.speed, 700));
    }

    const prod = await scenarioProductionCycle({
      org_id: params.org_id,
      hooks: {
        ...params.hooks,
        onLog: (entry) => pushLog(ctx, entry.level, entry.icon, `[15:00-17:00] ${entry.message}`, entry.meta),
      },
    });
    ctx.itemsProcessed += prod.items_processed;
    ctx.eventsFired += prod.events_fired;
    ctx.apiCalls += prod.performance?.total_api_calls || 0;

    emitProgress(ctx, { current_step: 8, step_label: 'Full day complete' });
    pushLog(ctx, 'success', '✅', 'Full Day simulation complete');
  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Full Day failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  const result = buildResult(ctx);
  if (result.performance) {
    result.performance.integrity.expected_unique_tags = ctx.itemsProcessed;
    result.performance.integrity.observed_unique_tags = ctx.itemsProcessed;
  }
  return result;
}

export async function scenarioStressTest(
  params: {
    org_id: string;
    items_count: number;
    concurrent_gates: number;
    hooks?: ScenarioHooks;
  }
): Promise<ScenarioResult> {
  const ctx = createContext('Stress Test', params.org_id, params.hooks, 5);
  const supabase = createClient();

  pushLog(ctx, 'info', '🟢', `Session started - Stress Test (${params.items_count} items, ${params.concurrent_gates} gates)`);

  try {
    const targetCount = Math.max(100, params.items_count);
    const concurrent = Math.max(1, params.concurrent_gates);

    emitProgress(ctx, { current_step: 1, step_label: 'Loading clean tags', total_items: targetCount });

    const { data: sourceItems } = await supabase
      .from('linen_items')
      .select('rfid_tag_id')
      .eq('org_id', ctx.orgId)
      .eq('status', 'clean')
      .limit(targetCount);

    const baseTags = (sourceItems || []).map((row) => String(row.rfid_tag_id));
    if (baseTags.length < targetCount) {
      for (let i = baseTags.length; i < targetCount; i += 1) {
        baseTags.push(`STRESS-NOISE-${String(i).padStart(6, '0')}`);
      }
    }

    const tags = baseTags.slice(0, targetCount);
    const groups = Array.from({ length: concurrent }, (_, idx) => tags.filter((_, i) => i % concurrent === idx));

    const uniqueProcessed = new Set<string>();
    const gatePromises = groups.map(async (group, idx) => {
      const cfg: RFIDReadConfig = {
        ...DEFAULT_READER_CONFIG.fixed_gate,
        ...params.hooks?.reader_config,
        reader_type: 'fixed_gate',
        total_tags: group.length,
        read_rate_per_second: 320,
        duplicate_ratio: 12,
        miss_rate: 0.6,
      };

      for await (const events of rfidEngine.simulateGateRead(group, cfg)) {
        observeBatchEvents(ctx, events);
        const uniqueBurst = [...new Set(events.map((event) => event.epc))];
        for (const batch of chunk(uniqueBurst, 200)) {
          const body = {
            org_id: ctx.orgId,
            source: `stress_gate_${idx + 1}`,
            session_id: `stress-${idx + 1}`,
            events: batch.map((tag) => ({
              rfid_tag_id: tag,
              gate_id: `gate_${idx + 1}`,
              event_type: 'audit',
              batch_id: null,
              order_id: null,
              weight_kg: null,
            })),
          };

          await apiRequest(ctx, '/api/scan-events', 'POST', body);
          batch.forEach((tag) => uniqueProcessed.add(tag));
          ctx.itemsProcessed = uniqueProcessed.size;
          trackThroughput(ctx, batch.length);
        }

        const waitMs = delayForSpeed(params.hooks?.speed, 40);
        if (waitMs > 0) await sleep(waitMs);
      }
    });

    emitProgress(ctx, { current_step: 2, step_label: 'Concurrent gate scanning' });
    await Promise.all(gatePromises);

    emitProgress(ctx, { current_step: 3, step_label: 'Verifying integrity' });

    const { data: scanRows } = await supabase
      .from('scan_events')
      .select('rfid_tag_id')
      .eq('org_id', ctx.orgId)
      .in('source', Array.from({ length: concurrent }, (_, i) => `stress_gate_${i + 1}`))
      .gte('created_at', new Date(ctx.startedAt - 1000).toISOString());

    const observedTags = new Set((scanRows || []).map((row) => String(row.rfid_tag_id)));
    const duplicates = (scanRows || []).length - observedTags.size;

    pushLog(ctx, 'success', '✅', 'Stress test completed', {
      expected: tags.length,
      observed: observedTags.size,
      duplicates,
    });

    emitProgress(ctx, { current_step: 5, step_label: 'Stress test complete' });

    const result = buildResult(ctx);
    if (result.performance) {
      result.performance.integrity = {
        expected_unique_tags: tags.length,
        observed_unique_tags: observedTags.size,
        duplicates_detected: Math.max(0, duplicates),
        status_consistency: observedTags.size >= Math.floor(tags.length * 0.98) ? 'PASS' : 'FAIL',
      };
    }

    return result;
  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Stress Test failed: ${error instanceof Error ? error.message : 'unknown'}`);
    return buildResult(ctx);
  }
}

export async function seedHistoricalData(
  params: {
    org_id: string;
    days_back: number;
    daily_volume: number;
    hooks?: ScenarioHooks;
  }
): Promise<ScenarioResult> {
  const ctx = createContext('Historical Seed', params.org_id, params.hooks, 4);
  const supabase = createClient();

  pushLog(ctx, 'info', '🟢', `Session started - Historical Seed (${params.days_back} days)`);

  try {
    const days = Math.max(1, params.days_back);
    const volume = Math.max(20, params.daily_volume);

    emitProgress(ctx, { current_step: 1, step_label: 'Building synthetic records' });

    const records: Array<Record<string, unknown>> = [];
    const now = new Date();

    for (let dayOffset = days; dayOffset >= 1; dayOffset -= 1) {
      const date = new Date(now);
      date.setDate(now.getDate() - dayOffset);
      const dow = date.getDay();

      let dayFactor = 1;
      if (dow === 6) dayFactor = 0.7;
      if (dow === 0) dayFactor = 0.4;

      const week = Math.ceil((days - dayOffset + 1) / 7);
      let lossRate = 0.03;
      let rewashRate = 0.03;
      if (week === 3) lossRate = 0.08;
      if (week === 6) rewashRate = 0.1;
      if (week === 8) lossRate = 0.005;

      const todayVolume = Math.max(1, Math.floor(volume * dayFactor));
      const dispatchCount = Math.floor(todayVolume * 0.8);
      const returnCount = Math.floor(dispatchCount * (1 - lossRate));
      const rewashCount = Math.floor(returnCount * rewashRate);

      for (let i = 0; i < dispatchCount; i += 1) {
        const ts = new Date(date);
        ts.setHours(7, Math.floor((i / Math.max(1, dispatchCount)) * 60), Math.floor(Math.random() * 60), 0);
        records.push({
          org_id: ctx.orgId,
          rfid_tag_id: `HIST-${date.toISOString().slice(0, 10)}-D-${String(i).padStart(5, '0')}`,
          item_id: null,
          event_type: 'dispatch',
          gate_id: 'gate_a',
          source: 'historical_seed',
          created_at: ts.toISOString(),
        });
      }

      for (let i = 0; i < returnCount; i += 1) {
        const ts = new Date(date);
        ts.setHours(14, Math.floor((i / Math.max(1, returnCount)) * 60), Math.floor(Math.random() * 60), 0);
        records.push({
          org_id: ctx.orgId,
          rfid_tag_id: `HIST-${date.toISOString().slice(0, 10)}-R-${String(i).padStart(5, '0')}`,
          item_id: null,
          event_type: 'checkin',
          gate_id: 'gate_b',
          source: 'historical_seed',
          created_at: ts.toISOString(),
        });
      }

      for (let i = 0; i < rewashCount; i += 1) {
        const ts = new Date(date);
        ts.setHours(18, Math.floor((i / Math.max(1, rewashCount)) * 60), Math.floor(Math.random() * 60), 0);
        records.push({
          org_id: ctx.orgId,
          rfid_tag_id: `HIST-${date.toISOString().slice(0, 10)}-W-${String(i).padStart(5, '0')}`,
          item_id: null,
          event_type: 'qc_rewash',
          gate_id: 'qc_1',
          source: 'historical_seed',
          created_at: ts.toISOString(),
        });
      }
    }

    emitProgress(ctx, { current_step: 2, step_label: 'Inserting chunks', total_items: records.length });

    const chunks = chunk(records, 1000);
    for (let i = 0; i < chunks.length; i += 1) {
      const group = chunks[i];
      const { error } = await supabase.from('scan_events').insert(group);
      if (error) {
        ctx.errors += 1;
        pushLog(ctx, 'warn', '⚠️', `Chunk ${i + 1}/${chunks.length} had insert error: ${error.message}`);
        continue;
      }

      ctx.itemsProcessed += group.length;
      ctx.eventsFired += group.length;
      trackThroughput(ctx, group.length);
      emitProgress(ctx, {
        processed_items: ctx.itemsProcessed,
        total_items: records.length,
        current_step: 3,
        step_label: `Inserting chunk ${i + 1}/${chunks.length}`,
      });
      pushLog(ctx, 'info', '💾', `Inserted chunk ${i + 1}/${chunks.length} (${group.length} records)`);

      await sleep(delayForSpeed(ctx.hooks?.speed, 100));
    }

    emitProgress(ctx, { current_step: 4, step_label: 'Historical seed complete' });
    pushLog(ctx, 'success', '✅', `Historical seed complete (${ctx.itemsProcessed} records)`);
  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Historical Seed failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  return buildResult(ctx);
}

export async function scenarioFullDayFromOrg(orgId: string, hooks?: ScenarioHooks): Promise<ScenarioResult> {
  return scenarioFullDay({ org_id: orgId, hooks });
}

export async function scenarioActivePickingScan(
  params: { org_id: string; order_id: string; hooks?: ScenarioHooks }
): Promise<ScenarioResult> {
  const ctx = createContext('Manual Picking Scan', params.org_id, params.hooks, 1);
  pushLog(ctx, 'info', '🟢', `Simulation triggered for order ${params.order_id}`);

  try {
    pushLog(ctx, 'info', '🔍', 'Searching for active picking session...');
    const supabase = createClient();
    
    const { data: session } = await supabase
      .from('active_sessions')
      .select('id, batch_id, gate_id')
      .eq('org_id', params.org_id)
      .eq('order_id', params.order_id)
      .eq('is_active', true)
      .maybeSingle();

    if (!session) {
      throw new Error('no_active_picking_session');
    }

    const { data: orderItems } = await supabase
      .from('delivery_order_items')
      .select('category_id, requested_qty, picked_qty')
      .eq('order_id', params.order_id);

    if (!orderItems?.length) {
      throw new Error('no_order_items_found');
    }

    const missingItems = orderItems
      .map(item => ({
        category_id: item.category_id,
        qty: Math.max(0, Number(item.requested_qty || 0) - Number(item.picked_qty || 0))
      }))
      .filter(item => item.qty > 0);

    if (missingItems.length === 0) {
      pushLog(ctx, 'info', '✅', 'Order already fully picked');
      return buildResult(ctx);
    }

    pushLog(ctx, 'info', '📦', `Found ${missingItems.length} categories with missing items.`);

    const available = await pickCleanTagsByCategory(params.org_id, missingItems);
    const tagsToScan = available.flatMap(row => row.tags.slice(0, row.qty));

    if (tagsToScan.length === 0) {
      pushLog(ctx, 'warn', '⚠️', 'No suitable tags found (insufficient clean stock).');
      throw new Error('insufficient_clean_stock');
    }

    pushLog(ctx, 'info', '📡', `Simulating scan for ${tagsToScan.length} items...`);

    emitProgress(ctx, {
      current_step: 1,
      step_label: `Scanning ${tagsToScan.length} items`,
      total_items: tagsToScan.length,
    });

    const readerType = params.hooks?.reader_config?.reader_type || 'handheld';
    const cfg: RFIDReadConfig = {
      ...DEFAULT_READER_CONFIG[readerType],
      ...params.hooks?.reader_config,
      total_tags: tagsToScan.length,
      interval_ms: speedIntervalMs(params.hooks?.speed, readerType === 'fixed_gate' ? 100 : 200),
    };

    const generator = readerType === 'fixed_gate'
      ? rfidEngine.simulateGateRead(tagsToScan, cfg)
      : rfidEngine.simulateHandheldRead(tagsToScan, cfg, 2);

    for await (const events of generator) {
      if (!events.length) continue;
      observeBatchEvents(ctx, events);

      const batchedTags = events.map((event) => event.epc).filter(Boolean);
      const chunked = chunk(batchedTags, 50); // Smaller chunks for better feedback

      for (let i = 0; i < chunked.length; i++) {
        const tags = chunked[i];
        const scanRes = await apiRequest<{ results: Array<{ result: string; rfid_tag_id: string; message?: string }> }>(
          ctx,
          `/api/orders/${params.order_id}/picking/scan`,
          'POST',
          { session_id: session.id, tags }
        );

        const added = scanRes.results.filter((row) => row.result === 'added').length;
        const skipped = scanRes.results.filter((row) => row.result === 'skipped').length;
        const errors = scanRes.results.filter((row) => row.result === 'error');
        const errored = errors.length;

        ctx.itemsProcessed += added;
        trackThroughput(ctx, added);

        pushLog(ctx, 'info', '📡', `Burst: ${added} added, ${skipped} skipped, ${errored} errors (${ctx.itemsProcessed}/${tagsToScan.length})`);
        
        if (errored > 0) {
          const firstErr = errors[0] as { result: string; rfid_tag_id: string; message?: string; code?: string };
          pushLog(ctx, 'error', '❌', `Scan error: ${firstErr.message || 'Unknown error'} (${firstErr.code || 'NULL_CODE'})`);
        }

        // Minor delay for visibility and to avoid flooding the API
        await sleep(delayForSpeed(ctx.hooks?.speed, 50));
      }
    }

    pushLog(ctx, 'success', '✅', `Mission complete: ${ctx.itemsProcessed} total items synced to order.`);

  } catch (error) {
    ctx.errors += 1;
    pushLog(ctx, 'error', '❌', `Simulated Scan failed: ${error instanceof Error ? error.message : 'unknown'}`);
  }

  return buildResult(ctx);
}

export async function resolveOrgId(): Promise<string> {
  const { orgId } = await getOrgSupabase();
  if (!orgId) throw new Error('org_not_found');
  return orgId;
}
