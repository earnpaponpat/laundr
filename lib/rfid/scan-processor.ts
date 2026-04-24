import { createClient } from '@/lib/supabase/server';
import { z } from 'zod';
import {
  canTransition,
  getNewStatus,
  type LinenStatus,
  type ScanEventType,
} from '@/lib/rfid/status-machine';
import {
  validateBatchCapacity,
  validateCategoryMatch,
  validatePickingEligibility,
  type DeliveryOrderLike,
} from '@/lib/rfid/batch-validator';

const scanEventTypeValues = [
  'checkout',
  'dispatch',
  'checkin',
  'qc_pass',
  'qc_rewash',
  'qc_reject',
  'wash_start',
  'wash_done',
  'dry_done',
  'audit',
  'rewash',
  'reject',
  'found',
] as const;

const linenStatusValues = [
  'clean',
  'out',
  'dirty',
  'washing',
  'drying',
  'folding',
  'rewash',
  'rejected',
  'lost',
] as const;

export const scanEventSchema = z.object({
  rfid_tag_id: z.string().min(1, 'rfid_tag_id is required'),
  gate_id: z.string().min(1, 'gate_id is required'),
  event_type: z.enum(scanEventTypeValues),
  batch_id: z.string().uuid('Invalid batch_id UUID').optional().nullable(),
  order_id: z.string().uuid('Invalid order_id UUID').optional().nullable(),
  weight_kg: z.number().nonnegative().optional().nullable(),
});

export const scanBatchSchema = z.object({
  events: z.array(scanEventSchema).min(1, 'events must contain at least one event'),
  org_id: z.string().uuid('Invalid org_id UUID'),
  source: z.string().optional(),
  session_id: z.string().optional(),
});

export type ScanEventPayload = z.infer<typeof scanEventSchema>;
export type ScanBatchPayload = z.infer<typeof scanBatchSchema>;

type ActorRole = 'admin' | 'manager' | 'staff' | 'driver' | null;

type OrderLine = {
  category_id: string;
  requested_qty: number;
  picked_qty: number;
  returned_qty: number;
  linen_categories: { name: string } | null;
};

type ScanProcessResult = {
  success: boolean;
  item_id: string;
  rfid_tag_id: string;
  previous_status: LinenStatus | null;
  new_status: LinenStatus | null;
  warnings: string[];
  error?: string;
  message?: string;
  order_progress?: {
    order_id: string;
    category: string;
    picked: number;
    requested: number;
    complete: boolean;
  };
};

type ProcessContext = {
  org_id: string;
  source?: string;
  session_id?: string;
  actorRole: ActorRole;
  scannedBy: string | null;
};

type ItemRecord = {
  id: string;
  rfid_tag_id: string;
  status: LinenStatus;
  wash_count: number;
  category_id: string | null;
  current_batch_id: string | null;
  client_id: string | null;
};

function baseResult(
  payload: ScanEventPayload,
  item: ItemRecord | null,
  newStatus: LinenStatus | null
): ScanProcessResult {
  return {
    success: false,
    item_id: item?.id ?? '',
    rfid_tag_id: payload.rfid_tag_id,
    previous_status: item?.status ?? null,
    new_status: newStatus,
    warnings: [],
  };
}

async function insertScanLog(params: {
  supabase: Awaited<ReturnType<typeof createClient>>;
  ctx: ProcessContext;
  payload: ScanEventPayload;
  itemId: string | null;
  eventType: ScanEventType;
  createdAt: string;
}): Promise<void> {
  const { supabase, ctx, payload, itemId, eventType, createdAt } = params;
  const insertPayload: Record<string, unknown> = {
    org_id: ctx.org_id,
    rfid_tag_id: payload.rfid_tag_id,
    item_id: itemId,
    event_type: eventType,
    batch_id: payload.batch_id ?? null,
    gate_id: payload.gate_id,
    source: ctx.source ?? null,
    scanned_by: ctx.scannedBy,
    weight_kg: payload.weight_kg ?? null,
    created_at: createdAt,
  };

  if (payload.order_id) {
    insertPayload.order_id = payload.order_id;
  }

  const { error } = await supabase.from('scan_events').insert(insertPayload);
  if (error && payload.order_id) {
    delete insertPayload.order_id;
    await supabase.from('scan_events').insert(insertPayload);
  }
}

async function getOrderLines(
  supabase: Awaited<ReturnType<typeof createClient>>,
  orderId: string
): Promise<OrderLine[]> {
  const { data } = await supabase
    .from('delivery_order_items')
    .select('category_id, requested_qty, picked_qty, returned_qty, linen_categories(name)')
    .eq('order_id', orderId);

  if (!data) {
    return [];
  }

  return data.map((row) => {
    const categoryData = Array.isArray(row.linen_categories)
      ? row.linen_categories[0]
      : row.linen_categories;

    return {
      category_id: row.category_id as string,
      requested_qty: row.requested_qty as number,
      picked_qty: row.picked_qty as number,
      returned_qty: row.returned_qty as number,
      linen_categories: categoryData ? { name: String((categoryData as { name: string }).name) } : null,
    };
  });
}

async function processSingleEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: ScanEventPayload,
  ctx: ProcessContext
): Promise<ScanProcessResult> {
  const createdAt = new Date().toISOString();
  const eventType = payload.event_type as ScanEventType;

  const { data: itemRaw } = await supabase
    .from('linen_items')
    .select('id, rfid_tag_id, status, wash_count, category_id, current_batch_id, client_id')
    .eq('org_id', ctx.org_id)
    .eq('rfid_tag_id', payload.rfid_tag_id)
    .maybeSingle();

  if (!itemRaw) {
    await insertScanLog({
      supabase,
      ctx,
      payload,
      itemId: null,
      eventType,
      createdAt,
    });

    return {
      success: false,
      item_id: '',
      rfid_tag_id: payload.rfid_tag_id,
      previous_status: null,
      new_status: null,
      warnings: [],
      error: 'unknown_tag',
    };
  }

  const item: ItemRecord = {
    id: itemRaw.id as string,
    rfid_tag_id: itemRaw.rfid_tag_id as string,
    status: z.enum(linenStatusValues).parse(itemRaw.status),
    wash_count: Number(itemRaw.wash_count ?? 0),
    category_id: (itemRaw.category_id as string | null) ?? null,
    current_batch_id: (itemRaw.current_batch_id as string | null) ?? null,
    client_id: (itemRaw.client_id as string | null) ?? null,
  };

  if (!canTransition(item.status, eventType)) {
    await insertScanLog({
      supabase,
      ctx,
      payload,
      itemId: item.id,
      eventType,
      createdAt,
    });

    const invalid = baseResult(payload, item, null);
    return {
      ...invalid,
      error: 'invalid_transition',
      message: `Cannot move from ${item.status} using event ${eventType}.`,
    };
  }

  const resolvedStatus = getNewStatus(item.status, eventType);
  if (!resolvedStatus) {
    await insertScanLog({
      supabase,
      ctx,
      payload,
      itemId: item.id,
      eventType,
      createdAt,
    });

    return {
      ...baseResult(payload, item, null),
      error: 'invalid_transition',
      message: `Cannot resolve next status for event ${eventType}.`,
    };
  }

  const warnings: string[] = [];
  let newStatus: LinenStatus = resolvedStatus;
  let currentBatchId: string | null = item.current_batch_id;
  let orderProgress: ScanProcessResult['order_progress'];
  let checkoutOrderFullyPicked = false;

  if (eventType === 'checkout') {
    const pickEligible = validatePickingEligibility({
      status: item.status,
      current_batch_id: item.current_batch_id,
    });
    if (!pickEligible.eligible) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: pickEligible.reason === 'item_already_in_batch' ? 'item_already_in_batch' : 'invalid_transition',
        message:
          pickEligible.reason === 'item_already_in_batch'
            ? 'Item already belongs to another batch.'
            : `Item is not eligible for picking from status ${item.status}.`,
      };
    }

    if (!payload.batch_id || !payload.order_id) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'missing_batch_or_order',
        message: 'checkout requires both batch_id and order_id.',
      };
    }

    const orderLines = await getOrderLines(supabase, payload.order_id);
    const orderLike: DeliveryOrderLike = {
      items: orderLines.map((line) => ({
        category_id: line.category_id,
        category_name: line.linen_categories?.name ?? line.category_id,
        requested_qty: line.requested_qty,
        picked_qty: line.picked_qty,
      })),
    };

    if (!item.category_id) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'missing_item_category',
      };
    }

    const categoryMatch = validateCategoryMatch({ category_id: item.category_id }, orderLike);
    if (!categoryMatch.match) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'category_mismatch',
        message: 'Item category is not part of the delivery order.',
      };
    }

    const capacity = validateBatchCapacity(payload.batch_id, orderLike);
    const remainingForCategory = capacity.remaining[item.category_id] ?? 0;
    if (remainingForCategory <= 0) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'batch_capacity_exceeded',
        message: 'Picked quantity already reached requested quantity for this category.',
      };
    }

    const line = orderLines.find((entry) => entry.category_id === item.category_id);
    if (line) {
      const nextPicked = line.picked_qty + 1;
      const { error: pickedUpdateError } = await supabase
        .from('delivery_order_items')
        .update({ picked_qty: nextPicked })
        .eq('order_id', payload.order_id)
        .eq('category_id', item.category_id);

      if (pickedUpdateError) {
        await insertScanLog({
          supabase,
          ctx,
          payload,
          itemId: item.id,
          eventType,
          createdAt,
        });

        return {
          ...baseResult(payload, item, item.status),
          error: 'update_failed',
          message: pickedUpdateError.message,
        };
      }

      orderProgress = {
        order_id: payload.order_id,
        category: line.linen_categories?.name ?? item.category_id,
        picked: nextPicked,
        requested: line.requested_qty,
        complete: nextPicked >= line.requested_qty,
      };

      // Check completion using in-memory data to avoid a second DB round-trip
      checkoutOrderFullyPicked = orderLines.every((l) =>
        l.category_id === item.category_id
          ? nextPicked >= l.requested_qty
          : l.picked_qty >= l.requested_qty
      );
    }

    currentBatchId = payload.batch_id;
    newStatus = 'clean';
  }

  if (eventType === 'dispatch') {
    if (!payload.batch_id || !payload.order_id) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'missing_batch_or_order',
        message: 'dispatch requires both batch_id and order_id.',
      };
    }

    if (ctx.actorRole !== 'admin' && ctx.actorRole !== 'manager') {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'forbidden',
        message: 'Only admin or manager can dispatch.',
      };
    }

    const orderLines = await getOrderLines(supabase, payload.order_id);
    const incomplete = orderLines.find((line) => line.picked_qty < line.requested_qty);
    if (incomplete) {
      await insertScanLog({
        supabase,
        ctx,
        payload,
        itemId: item.id,
        eventType,
        createdAt,
      });

      return {
        ...baseResult(payload, item, item.status),
        error: 'order_not_fully_picked',
        message: `Category ${incomplete.linen_categories?.name ?? incomplete.category_id} is not fully picked.`,
      };
    }

    await supabase
      .from('linen_items')
      .update({ status: 'out' })
      .eq('org_id', ctx.org_id)
      .eq('current_batch_id', payload.batch_id);

    await supabase
      .from('delivery_batches')
      .update({ dispatched_at: createdAt })
      .eq('id', payload.batch_id)
      .eq('org_id', ctx.org_id);

    await supabase
      .from('delivery_orders')
      .update({ status: 'dispatched', dispatched_at: createdAt })
      .eq('id', payload.order_id)
      .eq('org_id', ctx.org_id);

    newStatus = 'out';
  }

  if (eventType === 'checkin') {
    if (payload.order_id && item.category_id) {
      const orderLines = await getOrderLines(supabase, payload.order_id);
      const line = orderLines.find((entry) => entry.category_id === item.category_id);
      if (line) {
        const nextReturned = line.returned_qty + 1;
        await supabase
          .from('delivery_order_items')
          .update({ returned_qty: nextReturned })
          .eq('order_id', payload.order_id)
          .eq('category_id', item.category_id);
      }
    }

    if (payload.order_id) {
      const updatedLines = await getOrderLines(supabase, payload.order_id);
      const missingTotal = updatedLines.reduce((sum, line) => {
        const missing = Math.max(line.picked_qty - line.returned_qty, 0);
        return sum + missing;
      }, 0);

      if (missingTotal > 0) {
        warnings.push(`missing_items:${missingTotal}`);
      }

      if (payload.batch_id) {
        const { data: batch } = await supabase
          .from('delivery_batches')
          .select('expected_return_by')
          .eq('id', payload.batch_id)
          .maybeSingle();

        const expectedReturnBy = batch?.expected_return_by
          ? new Date(String(batch.expected_return_by)).getTime()
          : null;
        if (expectedReturnBy && Date.now() > expectedReturnBy && missingTotal > 0) {
          warnings.push('grace_period_exceeded');
        }
      }
    }

    newStatus = 'dirty';
  }

  if (eventType === 'qc_pass') {
    currentBatchId = null;
    newStatus = 'clean';

    if (item.category_id) {
      const { data: category } = await supabase
        .from('linen_categories')
        .select('lifespan_cycles')
        .eq('id', item.category_id)
        .maybeSingle();

      const lifespan = Number(category?.lifespan_cycles ?? 0);
      // +1 because the DB trigger will increment wash_count after scan event insert
      if (lifespan > 0 && item.wash_count + 1 >= lifespan) {
        warnings.push('end_of_life_reached');
      }
    }
  }

  if (eventType === 'qc_rewash' || eventType === 'qc_reject') {
    currentBatchId = null;
  }

  // Create a rewash_record so the item appears in the rewash queue
  if (eventType === 'qc_rewash') {
    await supabase.from('rewash_records').insert({
      org_id: ctx.org_id,
      item_id: item.id,
      client_id: item.client_id,
      reason: 'stain',
      billable: false,
      resolved: false,
    });
  }

  if (eventType === 'rewash' || eventType === 'reject') {
    currentBatchId = null;
  }

  const updatePayload: Record<string, unknown> = {
    status: newStatus,
    current_batch_id: currentBatchId,
    last_scan_at: createdAt,
    last_scan_location: payload.gate_id,
  };

  const { error: updateError } = await supabase
    .from('linen_items')
    .update(updatePayload)
    .eq('id', item.id)
    .eq('org_id', ctx.org_id);

  await insertScanLog({
    supabase,
    ctx,
    payload,
    itemId: item.id,
    eventType,
    createdAt,
  });

  if (updateError) {
    return {
      ...baseResult(payload, item, item.status),
      error: 'update_failed',
      message: updateError.message,
    };
  }

  if (eventType === 'checkout' && payload.order_id && checkoutOrderFullyPicked) {
    await supabase
      .from('delivery_orders')
      .update({ status: 'ready' })
      .eq('id', payload.order_id)
      .eq('org_id', ctx.org_id);
  }

  return {
    success: true,
    item_id: item.id,
    rfid_tag_id: payload.rfid_tag_id,
    previous_status: item.status,
    new_status: newStatus,
    warnings,
    order_progress: orderProgress,
  };
}

async function resolveActorContext(
  supabase: Awaited<ReturnType<typeof createClient>>,
  payload: ScanBatchPayload
): Promise<ProcessContext> {
  const { data: authData } = await supabase.auth.getUser();
  const scannedBy = authData.user?.id ?? null;
  let actorRole: ActorRole = null;

  if (scannedBy) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', scannedBy)
      .maybeSingle();
    actorRole = (profile?.role as ActorRole) ?? null;
  }

  return {
    org_id: payload.org_id,
    source: payload.source,
    session_id: payload.session_id,
    actorRole,
    scannedBy,
  };
}

export async function processScanEventsBatch(payload: ScanBatchPayload): Promise<ScanProcessResult[]> {
  const supabase = await createClient();
  const ctx = await resolveActorContext(supabase, payload);

  const results: ScanProcessResult[] = [];
  for (const event of payload.events) {
    const result = await processSingleEvent(supabase, event, ctx);
    results.push(result);
  }
  return results;
}
