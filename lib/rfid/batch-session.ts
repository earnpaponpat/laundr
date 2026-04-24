import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import { runPickingValidations, type ValidationResult } from '@/lib/rfid/picking-validator';
import type { LinenStatus } from '@/lib/rfid/status-machine';

const categorySchema = z.union([
  z.object({ name: z.string() }),
  z.array(z.object({ name: z.string() })),
  z.null(),
]);

function resolveCategoryName(raw: unknown, fallback = 'Unknown Category'): string {
  const parsed = categorySchema.safeParse(raw);
  if (!parsed.success) return fallback;
  if (!parsed.data) return fallback;
  if (Array.isArray(parsed.data)) return parsed.data[0]?.name ?? fallback;
  return parsed.data.name;
}

export interface SessionError {
  rfid_tag_id: string;
  error_code: string;
  error_message: string;
  timestamp: Date;
}

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const sessionTagCache = new Map<string, { tags: Set<string>; createdAt: number }>();
const sessionErrorCache = new Map<string, SessionError[]>();

export interface BatchSession {
  session_id: string;
  org_id: string;
  order_id: string;
  batch_id: string;
  session_type: 'picking' | 'return';
  started_at: Date;
  started_by: string | null;
  gate_id: string;
  scanned_tags: Set<string>;
  items_added: number;
  items_rejected: number;
  errors: SessionError[];
}

export type AddItemResult = {
  rfid_tag_id: string;
  result: 'added' | 'skipped' | 'error' | 'ask_user';
  code?: string;
  message?: string;
  item?: { category_name: string; status: string };
  order_progress?: {
    category_name: string;
    picked: number;
    requested: number;
    complete: boolean;
  };
};

function evictStaleSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessionTagCache.entries()) {
    if (now - entry.createdAt > SESSION_TTL_MS) {
      sessionTagCache.delete(id);
      sessionErrorCache.delete(id);
    }
  }
}

function getOrInitSessionTags(sessionId: string): Set<string> {
  const existing = sessionTagCache.get(sessionId);
  if (existing) return existing.tags;
  const entry = { tags: new Set<string>(), createdAt: Date.now() };
  sessionTagCache.set(sessionId, entry);
  return entry.tags;
}

function pushSessionError(sessionId: string, error: SessionError): void {
  const list = sessionErrorCache.get(sessionId) || [];
  list.push(error);
  sessionErrorCache.set(sessionId, list);
}

async function getActiveSession(sessionId: string, orgId?: string) {
  const supabase = await createClient();
  let query = supabase
    .from('active_sessions')
    .select('id, org_id, order_id, batch_id, session_type, gate_id, started_by, started_at, items_scanned, is_active')
    .eq('id', sessionId)
    .eq('is_active', true)
    .limit(1);

  if (orgId) {
    query = query.eq('org_id', orgId);
  }

  const { data, error } = await query.maybeSingle();
  if (error || !data) {
    return null;
  }

  return data;
}

async function getOrderCompletion(orderId: string) {
  const supabase = await createClient();
  const { data: rows } = await supabase
    .from('delivery_order_items')
    .select('requested_qty, picked_qty, linen_categories(name)')
    .eq('order_id', orderId);

  const completion: Record<string, { picked: number; requested: number; pct: number; complete: boolean }> = {};
  let allComplete = true;

  for (const row of rows || []) {
    const categoryName = resolveCategoryName(row.linen_categories);

    const picked = Number(row.picked_qty || 0);
    const requested = Number(row.requested_qty || 0);
    const pct = requested > 0 ? Math.min(100, Math.round((picked / requested) * 100)) : 0;
    const complete = picked >= requested;
    if (!complete) allComplete = false;

    completion[categoryName] = { picked, requested, pct, complete };
  }

  return { completion, allComplete };
}

export async function startPickingSession(params: {
  org_id: string;
  order_id: string;
  gate_id: string;
  started_by: string | null;
}): Promise<{ session_id: string; batch_id: string }> {
  const supabase = await createClient();

  const { data: activeExisting } = await supabase
    .from('active_sessions')
    .select('id, order_id, batch_id, last_activity_at, started_at')
    .eq('org_id', params.org_id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (activeExisting) {
    if (activeExisting.order_id === params.order_id) {
      return {
        session_id: activeExisting.id,
        batch_id: activeExisting.batch_id,
      };
    }

    // Auto-close stale sessions (idle > 30 min) from crashed/incomplete runs
    const lastActivity = activeExisting.last_activity_at ?? activeExisting.started_at;
    const idleMs = Date.now() - new Date(String(lastActivity)).getTime();
    const STALE_THRESHOLD_MS = 30 * 60 * 1000;

    if (idleMs < STALE_THRESHOLD_MS) {
      throw new Error('another_active_session_exists_for_org');
    }

    await supabase
      .from('active_sessions')
      .update({ is_active: false, last_activity_at: new Date().toISOString() })
      .eq('id', activeExisting.id)
      .eq('org_id', params.org_id);

    sessionTagCache.delete(activeExisting.id);
    sessionErrorCache.delete(activeExisting.id);
  }

  const { data: order } = await supabase
    .from('delivery_orders')
    .select('id, org_id, status, client_id, driver_id')
    .eq('id', params.order_id)
    .eq('org_id', params.org_id)
    .maybeSingle();

  if (!order) {
    throw new Error('order_not_found');
  }

  if (order.status !== 'draft' && order.status !== 'picking') {
    throw new Error('order_not_pickable');
  }

  let batchId = '';
  const { data: existingBatch } = await supabase
    .from('delivery_batches')
    .select('id')
    .eq('org_id', params.org_id)
    .eq('order_id', params.order_id)
    .eq('batch_type', 'outbound')
    .neq('status', 'closed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingBatch?.id) {
    batchId = existingBatch.id;
  } else {
    const { data: lineRows } = await supabase
      .from('delivery_order_items')
      .select('requested_qty')
      .eq('order_id', params.order_id);

    const requestedTotal = (lineRows || []).reduce((sum, row) => sum + Number(row.requested_qty || 0), 0);

    const { data: createdBatch, error: createBatchError } = await supabase
      .from('delivery_batches')
      .insert({
        org_id: params.org_id,
        order_id: params.order_id,
        client_id: order.client_id,
        batch_type: 'outbound',
        total_items: requestedTotal,
        driver_id: order.driver_id,
        status: 'picking',
      })
      .select('id')
      .single();

    if (createBatchError || !createdBatch) {
      throw new Error(createBatchError?.message || 'batch_create_failed');
    }

    batchId = createdBatch.id;
  }

  const sessionId = crypto.randomUUID();
  const { error: sessionError } = await supabase.from('active_sessions').insert({
    id: sessionId,
    org_id: params.org_id,
    order_id: params.order_id,
    batch_id: batchId,
    session_type: 'picking',
    gate_id: params.gate_id,
    started_by: params.started_by,
    is_active: true,
    items_scanned: 0,
  });

  if (sessionError) {
    throw new Error(sessionError.message);
  }

  await supabase
    .from('delivery_orders')
    .update({ status: 'picking' })
    .eq('id', params.order_id)
    .eq('org_id', params.org_id);

  await supabase
    .from('delivery_batches')
    .update({ status: 'picking' })
    .eq('id', batchId)
    .eq('org_id', params.org_id);

  evictStaleSessions();
  sessionTagCache.set(sessionId, { tags: new Set<string>(), createdAt: Date.now() });
  sessionErrorCache.set(sessionId, []);

  return { session_id: sessionId, batch_id: batchId };
}

export async function addItemToBatch(params: {
  session_id: string;
  rfid_tag_id: string;
  org_id: string;
  allow_wrong_category?: boolean;
  allow_over_pick?: boolean;
}): Promise<AddItemResult> {
  const supabase = await createClient();
  const session = await getActiveSession(params.session_id, params.org_id);
  if (!session) {
    return {
      rfid_tag_id: params.rfid_tag_id,
      result: 'error',
      code: 'SESSION_NOT_FOUND',
      message: 'Session not found or inactive',
    };
  }

  const scannedTags = getOrInitSessionTags(params.session_id);
  if (scannedTags.has(params.rfid_tag_id)) {
    return {
      rfid_tag_id: params.rfid_tag_id,
      result: 'skipped',
      code: 'DUPLICATE',
      message: 'Duplicate in current session',
    };
  }

  const { data: itemData } = await supabase
    .from('linen_items')
    .select('id, org_id, status, current_batch_id, category_id, linen_categories(name)')
    .eq('rfid_tag_id', params.rfid_tag_id)
    .limit(1)
    .maybeSingle();

  // Guard: item already belongs to this exact batch (in-memory cache was lost across
  // serverless instances). Treat as duplicate rather than failing with IN_OTHER_BATCH.
  if (itemData?.current_batch_id === session.batch_id) {
    scannedTags.add(params.rfid_tag_id); // Repopulate cache so future reads are fast-pathed
    return {
      rfid_tag_id: params.rfid_tag_id,
      result: 'skipped',
      code: 'DUPLICATE',
      message: 'Already in current batch',
    };
  }

  const categoryName = resolveCategoryName(itemData?.linen_categories);

  const { data: orderItemData } = itemData?.category_id
    ? await supabase
        .from('delivery_order_items')
        .select('category_id, requested_qty, picked_qty, linen_categories(name)')
        .eq('order_id', session.order_id)
        .eq('category_id', itemData.category_id)
        .limit(1)
        .maybeSingle()
    : { data: null };

  const orderCategoryName = resolveCategoryName(orderItemData?.linen_categories, categoryName);

  const validation: ValidationResult = runPickingValidations({
    rfid_tag_id: params.rfid_tag_id,
    session_org_id: params.org_id,
    isDuplicate: scannedTags.has(params.rfid_tag_id),
    item: itemData
      ? {
          id: itemData.id,
          org_id: itemData.org_id,
          status: itemData.status,
          current_batch_id: itemData.current_batch_id,
          category_id: itemData.category_id,
          category_name: categoryName,
        }
      : null,
    orderItem: orderItemData
      ? {
          category_id: orderItemData.category_id,
          category_name: orderCategoryName,
          picked_qty: Number(orderItemData.picked_qty || 0),
          requested_qty: Number(orderItemData.requested_qty || 0),
        }
      : null,
    allowWrongCategory: params.allow_wrong_category,
    allowOverPick: params.allow_over_pick,
  });

  if (!validation.valid) {
    const now = new Date();
    if (validation.action !== 'SKIP') {
      pushSessionError(params.session_id, {
        rfid_tag_id: params.rfid_tag_id,
        error_code: validation.code || 'VALIDATION_ERROR',
        error_message: validation.message || 'Validation failed',
        timestamp: now,
      });

      await supabase
        .from('active_sessions')
        .update({
          last_activity_at: now.toISOString(),
        })
        .eq('id', params.session_id)
        .eq('org_id', params.org_id);
    }

    return {
      rfid_tag_id: params.rfid_tag_id,
      result: validation.action === 'ASK_USER' ? 'ask_user' : validation.action === 'SKIP' ? 'skipped' : 'error',
      code: validation.code,
      message: validation.message,
      item: itemData
        ? {
            category_name: categoryName,
            status: itemData.status,
          }
        : undefined,
    };
  }

  if (!itemData || !itemData.category_id) {
    return {
      rfid_tag_id: params.rfid_tag_id,
      result: 'error',
      code: 'INVALID_ITEM',
      message: 'Item missing category',
    };
  }

  const nowIso = new Date().toISOString();

  const { error: updateItemError } = await supabase
    .from('linen_items')
    .update({ current_batch_id: session.batch_id })
    .eq('id', itemData.id)
    .eq('org_id', params.org_id);

  if (updateItemError) {
    return {
      rfid_tag_id: params.rfid_tag_id,
      result: 'error',
      code: 'ITEM_UPDATE_FAILED',
      message: updateItemError.message,
    };
  }

  const scanInsertPayload: Record<string, unknown> = {
    org_id: params.org_id,
    order_id: session.order_id,
    batch_id: session.batch_id,
    item_id: itemData.id,
    rfid_tag_id: params.rfid_tag_id,
    event_type: 'checkout',
    gate_id: session.gate_id,
    source: `picking_session:${params.session_id}`,
    scanned_by: session.started_by,
    created_at: nowIso,
  };

  const { error: scanError } = await supabase.from('scan_events').insert(scanInsertPayload);
  if (scanError) {
    delete scanInsertPayload.order_id;
    const { error: fallbackScanError } = await supabase.from('scan_events').insert(scanInsertPayload);
    if (fallbackScanError) {
      return {
        rfid_tag_id: params.rfid_tag_id,
        result: 'error',
        code: 'SCAN_EVENT_FAILED',
        message: fallbackScanError.message,
      };
    }
  }

  if (orderItemData) {
    await supabase
      .from('delivery_order_items')
      .update({ picked_qty: Number(orderItemData.picked_qty || 0) + 1 })
      .eq('order_id', session.order_id)
      .eq('category_id', itemData.category_id);
  }

  await supabase
    .from('active_sessions')
    .update({
      items_scanned: Number(session.items_scanned || 0) + 1,
      last_activity_at: nowIso,
    })
    .eq('id', params.session_id)
    .eq('org_id', params.org_id);

  scannedTags.add(params.rfid_tag_id);

  const { data: updatedOrderItem } = await supabase
    .from('delivery_order_items')
    .select('picked_qty, requested_qty, linen_categories(name)')
    .eq('order_id', session.order_id)
    .eq('category_id', itemData.category_id)
    .limit(1)
    .maybeSingle();

  const updatedCategoryName = resolveCategoryName(updatedOrderItem?.linen_categories, categoryName);

  const picked = Number(updatedOrderItem?.picked_qty || (orderItemData?.picked_qty || 0) + 1);
  const requested = Number(updatedOrderItem?.requested_qty || orderItemData?.requested_qty || 0);

  return {
    rfid_tag_id: params.rfid_tag_id,
    result: 'added',
    item: {
      category_name: categoryName,
      status: 'clean',
    },
    order_progress: {
      category_name: updatedCategoryName,
      picked,
      requested,
      complete: requested > 0 ? picked >= requested : false,
    },
  };
}

export interface BatchScanSummary {
  session_items_count: number;
  order_completion: Record<string, { picked: number; requested: number; pct: number; complete: boolean }>;
  all_complete: boolean;
}

/**
 * Batch-optimised scan processor.
 * Phase 1 reads and Phase 3 writes both run in parallel via Promise.all(),
 * reducing total RTTs to ~2 regardless of tag or category count.
 *
 * RTT budget: 1 (parallel reads) + 0 (in-memory validation) + 1 (parallel writes) = ~2 RTTs
 */
export async function addItemsToBatch(params: {
  session_id: string;
  order_id: string;
  rfid_tag_ids: string[];
  org_id: string;
  overrides?: Record<string, { allow_wrong_category?: boolean; allow_over_pick?: boolean }>;
}): Promise<{ results: AddItemResult[]; summary: BatchScanSummary }> {
  const empty: BatchScanSummary = { session_items_count: 0, order_completion: {}, all_complete: false };
  if (!params.rfid_tag_ids.length) return { results: [], summary: empty };

  const supabase = await createClient();

  // ── Phase 1: All reads in parallel (1 RTT) ──────────────────────────────────
  const [session, { data: rawOrderItems }, { data: rawItems }] = await Promise.all([
    getActiveSession(params.session_id, params.org_id),
    supabase
      .from('delivery_order_items')
      .select('category_id, requested_qty, picked_qty, linen_categories(name)')
      .eq('order_id', params.order_id),
    supabase
      .from('linen_items')
      .select('id, rfid_tag_id, org_id, status, current_batch_id, category_id, linen_categories(name)')
      .in('rfid_tag_id', params.rfid_tag_ids)
      .eq('org_id', params.org_id),
  ]);

  if (!session) {
    return {
      results: params.rfid_tag_ids.map((tag) => ({
        rfid_tag_id: tag,
        result: 'error' as const,
        code: 'SESSION_NOT_FOUND',
        message: 'Session not found or inactive',
      })),
      summary: empty,
    };
  }

  type OI = { category_id: string; category_name: string; picked_qty: number; requested_qty: number };
  const orderItemsByCategory = new Map<string, OI>();
  for (const oi of rawOrderItems ?? []) {
    orderItemsByCategory.set(String(oi.category_id), {
      category_id: String(oi.category_id),
      category_name: resolveCategoryName(oi.linen_categories),
      picked_qty: Number(oi.picked_qty || 0),
      requested_qty: Number(oi.requested_qty || 0),
    });
  }

  type ItemRow = {
    id: string; rfid_tag_id: string; org_id: string; status: string;
    current_batch_id: string | null; category_id: string | null; category_name: string;
  };
  const itemsByTag = new Map<string, ItemRow>();
  for (const raw of rawItems ?? []) {
    itemsByTag.set(String(raw.rfid_tag_id), {
      id: String(raw.id),
      rfid_tag_id: String(raw.rfid_tag_id),
      org_id: String(raw.org_id),
      status: String(raw.status),
      current_batch_id: raw.current_batch_id ? String(raw.current_batch_id) : null,
      category_id: raw.category_id ? String(raw.category_id) : null,
      category_name: resolveCategoryName(raw.linen_categories),
    });
  }

  // ── Phase 2: In-memory validation (0 RTTs) ───────────────────────────────────
  const scannedTags = getOrInitSessionTags(params.session_id);
  const results: AddItemResult[] = [];
  const toAdd: Array<{ rfid_tag_id: string; item: ItemRow }> = [];
  const categoryDelta = new Map<string, number>();

  for (const tag of params.rfid_tag_ids) {
    if (scannedTags.has(tag)) {
      results.push({ rfid_tag_id: tag, result: 'skipped', code: 'DUPLICATE', message: 'Duplicate in current session' });
      continue;
    }

    const item = itemsByTag.get(tag) ?? null;

    if (item?.current_batch_id === session.batch_id) {
      scannedTags.add(tag);
      results.push({ rfid_tag_id: tag, result: 'skipped', code: 'DUPLICATE', message: 'Already in current batch' });
      continue;
    }

    const orderItem = item?.category_id ? (orderItemsByCategory.get(item.category_id) ?? null) : null;
    const override = params.overrides?.[tag];
    const pendingDelta = item?.category_id ? (categoryDelta.get(item.category_id) ?? 0) : 0;

    const validation = runPickingValidations({
      rfid_tag_id: tag,
      session_org_id: params.org_id,
      isDuplicate: false,
      item: item
        ? {
            id: item.id,
            org_id: item.org_id,
            status: item.status as LinenStatus,
            current_batch_id: item.current_batch_id,
            category_id: item.category_id,
            category_name: item.category_name,
          }
        : null,
      orderItem: orderItem ? { ...orderItem, picked_qty: orderItem.picked_qty + pendingDelta } : null,
      allowWrongCategory: override?.allow_wrong_category,
      allowOverPick: override?.allow_over_pick,
    });

    if (!validation.valid) {
      if (validation.action !== 'SKIP') {
        pushSessionError(params.session_id, {
          rfid_tag_id: tag,
          error_code: validation.code || 'VALIDATION_ERROR',
          error_message: validation.message || 'Validation failed',
          timestamp: new Date(),
        });
      }
      results.push({
        rfid_tag_id: tag,
        result: validation.action === 'ASK_USER' ? 'ask_user' : validation.action === 'SKIP' ? 'skipped' : 'error',
        code: validation.code,
        message: validation.message,
        item: item ? { category_name: item.category_name, status: item.status } : undefined,
      });
      continue;
    }

    if (!item || !item.category_id) {
      results.push({ rfid_tag_id: tag, result: 'error', code: 'INVALID_ITEM', message: 'Item missing category' });
      continue;
    }

    toAdd.push({ rfid_tag_id: tag, item });
    scannedTags.add(tag);
    categoryDelta.set(item.category_id, (categoryDelta.get(item.category_id) ?? 0) + 1);

    const finalPicked = (orderItem?.picked_qty ?? 0) + (categoryDelta.get(item.category_id) ?? 1);
    const finalRequested = orderItem?.requested_qty ?? 0;
    results.push({
      rfid_tag_id: tag,
      result: 'added',
      item: { category_name: item.category_name, status: 'clean' },
      order_progress: {
        category_name: orderItem?.category_name ?? item.category_id,
        picked: finalPicked,
        requested: finalRequested,
        complete: finalRequested > 0 ? finalPicked >= finalRequested : false,
      },
    });
  }

  // ── Phase 3: All writes in parallel (1 RTT) ──────────────────────────────────
  if (toAdd.length > 0) {
    const nowIso = new Date().toISOString();
    const validItemIds = toAdd.map((x) => x.item.id);

    await Promise.all([
      supabase
        .from('linen_items')
        .update({ current_batch_id: session.batch_id, last_scan_at: nowIso, last_scan_location: session.gate_id })
        .in('id', validItemIds)
        .eq('org_id', params.org_id),

      supabase.from('scan_events').insert(
        toAdd.map(({ rfid_tag_id, item }) => ({
          org_id: params.org_id,
          order_id: session.order_id,
          batch_id: session.batch_id,
          item_id: item.id,
          rfid_tag_id,
          event_type: 'checkout',
          gate_id: session.gate_id,
          source: `picking_session:${params.session_id}`,
          scanned_by: session.started_by,
          created_at: nowIso,
        }))
      ),

      supabase
        .from('active_sessions')
        .update({ items_scanned: Number(session.items_scanned || 0) + toAdd.length, last_activity_at: nowIso })
        .eq('id', params.session_id)
        .eq('org_id', params.org_id),

      // Per-category picked_qty using Phase 1 snapshot — no re-fetch needed
      ...[...categoryDelta.entries()].map(([category_id, delta]) =>
        supabase
          .from('delivery_order_items')
          .update({ picked_qty: (orderItemsByCategory.get(category_id)?.picked_qty ?? 0) + delta })
          .eq('order_id', session.order_id)
          .eq('category_id', category_id)
      ),
    ]);
  }

  // ── Inline summary (0 extra RTTs — computed from Phase 1 snapshot + deltas) ──
  const totalScanned = Number(session.items_scanned || 0) + toAdd.length;
  const order_completion: BatchScanSummary['order_completion'] = {};
  let all_complete = true;

  for (const [, oi] of orderItemsByCategory) {
    const delta = categoryDelta.get(oi.category_id) ?? 0;
    const picked = oi.picked_qty + delta;
    const requested = oi.requested_qty;
    const complete = picked >= requested;
    if (!complete) all_complete = false;
    order_completion[oi.category_name] = {
      picked,
      requested,
      pct: requested > 0 ? Math.min(100, Math.round((picked / requested) * 100)) : 0,
      complete,
    };
  }

  return {
    results,
    summary: { session_items_count: totalScanned, order_completion, all_complete },
  };
}

export async function getSessionSummary(sessionId: string): Promise<{
  session_items_count: number;
  order_completion: {
    [category_name: string]: {
      picked: number;
      requested: number;
      pct: number;
      complete: boolean;
    };
  };
  all_complete: boolean;
}> {
  const session = await getActiveSession(sessionId);
  if (!session) {
    return { session_items_count: 0, order_completion: {}, all_complete: false };
  }

  const { completion, allComplete } = await getOrderCompletion(session.order_id);

  return {
    session_items_count: Number(session.items_scanned || 0),
    order_completion: completion,
    all_complete: allComplete,
  };
}

export async function endPickingSession(sessionId: string): Promise<{
  total_scanned: number;
  items_per_category: Record<string, number>;
  order_completion: Record<string, { picked: number; requested: number }>;
  ready_to_dispatch: boolean;
}> {
  const supabase = await createClient();
  const session = await getActiveSession(sessionId);
  if (!session) {
    throw new Error('session_not_found');
  }

  const { completion, allComplete } = await getOrderCompletion(session.order_id);

  const { data: batchItems } = await supabase
    .from('linen_items')
    .select('category_id, linen_categories(name)')
    .eq('org_id', session.org_id)
    .eq('current_batch_id', session.batch_id);

  const itemsPerCategory: Record<string, number> = {};
  for (const item of batchItems || []) {
    const categoryName = resolveCategoryName(item.linen_categories);
    itemsPerCategory[categoryName] = (itemsPerCategory[categoryName] || 0) + 1;
  }

  const orderCompletion: Record<string, { picked: number; requested: number }> = {};
  for (const [categoryName, detail] of Object.entries(completion)) {
    orderCompletion[categoryName] = {
      picked: detail.picked,
      requested: detail.requested,
    };
  }

  await supabase
    .from('delivery_orders')
    .update({ status: allComplete ? 'ready' : 'picking' })
    .eq('id', session.order_id)
    .eq('org_id', session.org_id);

  await supabase
    .from('delivery_batches')
    .update({ status: allComplete ? 'open' : 'picking' })
    .eq('id', session.batch_id)
    .eq('org_id', session.org_id);

  await supabase
    .from('active_sessions')
    .update({ is_active: false, last_activity_at: new Date().toISOString() })
    .eq('id', sessionId)
    .eq('org_id', session.org_id);

  const scannedTags = sessionTagCache.get(sessionId);
  const totalScanned = scannedTags?.tags.size ?? Number(session.items_scanned || 0);

  sessionTagCache.delete(sessionId);
  sessionErrorCache.delete(sessionId);

  return {
    total_scanned: totalScanned,
    items_per_category: itemsPerCategory,
    order_completion: orderCompletion,
    ready_to_dispatch: allComplete,
  };
}

export async function removeItemFromBatch(params: {
  session_id: string;
  rfid_tag_id: string;
  org_id: string;
}): Promise<{ success: boolean; message?: string; code?: string }> {
  const supabase = await createClient();
  const session = await getActiveSession(params.session_id, params.org_id);
  if (!session) {
    return { success: false, code: 'SESSION_NOT_FOUND', message: 'Session not found' };
  }

  const { data: item } = await supabase
    .from('linen_items')
    .select('id, category_id, current_batch_id')
    .eq('org_id', params.org_id)
    .eq('rfid_tag_id', params.rfid_tag_id)
    .maybeSingle();

  if (!item) {
    return { success: false, code: 'UNKNOWN_TAG', message: 'Tag not found' };
  }

  if (item.current_batch_id !== session.batch_id) {
    return { success: false, code: 'NOT_IN_SESSION_BATCH', message: 'Item not in current session batch' };
  }

  await supabase
    .from('linen_items')
    .update({ current_batch_id: null })
    .eq('id', item.id)
    .eq('org_id', params.org_id);

  if (item.category_id) {
    const { data: orderItem } = await supabase
      .from('delivery_order_items')
      .select('picked_qty')
      .eq('order_id', session.order_id)
      .eq('category_id', item.category_id)
      .maybeSingle();

    const nextPickedQty = Math.max(0, Number(orderItem?.picked_qty || 0) - 1);
    await supabase
      .from('delivery_order_items')
      .update({ picked_qty: nextPickedQty })
      .eq('order_id', session.order_id)
      .eq('category_id', item.category_id);
  }

  const scanPayload: Record<string, unknown> = {
    org_id: params.org_id,
    order_id: session.order_id,
    batch_id: session.batch_id,
    item_id: item.id,
    rfid_tag_id: params.rfid_tag_id,
    event_type: 'audit',
    gate_id: session.gate_id,
    source: `picking_remove:${params.session_id}`,
    scanned_by: session.started_by,
    created_at: new Date().toISOString(),
  };

  const { error: scanError } = await supabase.from('scan_events').insert(scanPayload);
  if (scanError) {
    delete scanPayload.order_id;
    await supabase.from('scan_events').insert(scanPayload);
  }

  await supabase
    .from('active_sessions')
    .update({
      items_scanned: Math.max(0, Number(session.items_scanned || 0) - 1),
      last_activity_at: new Date().toISOString(),
    })
    .eq('id', params.session_id)
    .eq('org_id', params.org_id);

  const tagCache = getOrInitSessionTags(params.session_id);
  tagCache.delete(params.rfid_tag_id);

  return { success: true };
}

export async function getActiveSessionForOrder(params: {
  org_id: string;
  order_id: string;
  session_type?: 'picking' | 'return';
}) {
  const supabase = await createClient();
  let query = supabase
    .from('active_sessions')
    .select('id, org_id, order_id, batch_id, session_type, gate_id, started_by, started_at, items_scanned')
    .eq('org_id', params.org_id)
    .eq('order_id', params.order_id)
    .eq('is_active', true)
    .order('started_at', { ascending: false })
    .limit(1);

  if (params.session_type) {
    query = query.eq('session_type', params.session_type);
  }

  const { data } = await query.maybeSingle();
  return data;
}
