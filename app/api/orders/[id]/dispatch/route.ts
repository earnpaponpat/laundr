import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const dispatchSchema = z.object({
  actual_weight_kg: z.number().nonnegative().nullable().optional(),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const parsed = dispatchSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'validation_error', details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId =
      orgData ||
      (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) {
      return NextResponse.json({ error: 'org_not_found' }, { status: 400 });
    }

    const { data: order, error: orderError } = await supabase
      .from('delivery_orders')
      .select('id, org_id, client_id, status, driver_id')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }

    const { data: lines, error: lineError } = await supabase
      .from('delivery_order_items')
      .select('requested_qty, picked_qty')
      .eq('order_id', id);

    if (lineError || !lines || lines.length === 0) {
      return NextResponse.json({ error: 'order_items_not_found' }, { status: 400 });
    }

    const allPicked = lines.every((line) => line.picked_qty >= line.requested_qty);
    if (!allPicked) {
      return NextResponse.json({ error: 'order_not_fully_picked' }, { status: 409 });
    }

    let { data: outboundBatch } = await supabase
      .from('delivery_batches')
      .select('id')
      .eq('org_id', orgId)
      .eq('order_id', id)
      .eq('batch_type', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!outboundBatch) {
      const totalItems = lines.reduce((sum, line) => sum + Number(line.picked_qty || 0), 0);
      const { data: createdBatch, error: batchError } = await supabase
        .from('delivery_batches')
        .insert({
          org_id: orgId,
          client_id: order.client_id,
          batch_type: 'outbound',
          order_id: id,
          total_items: totalItems,
          driver_id: order.driver_id,
        })
        .select('id')
        .single();

      if (batchError || !createdBatch) {
        return NextResponse.json({ error: batchError?.message ?? 'create_batch_failed' }, { status: 500 });
      }

      outboundBatch = createdBatch;
    }

    const dispatchedAt = new Date().toISOString();

    // Update batch first — if item update fails later, batch status reflects intent
    const { error: batchUpdateError } = await supabase
      .from('delivery_batches')
      .update({ status: 'dispatched', dispatched_at: dispatchedAt, weight_kg: parsed.data.actual_weight_kg ?? null })
      .eq('id', outboundBatch.id)
      .eq('org_id', orgId);

    if (batchUpdateError) {
      return NextResponse.json({ error: batchUpdateError.message }, { status: 500 });
    }

    // Fetch items in this batch to create dispatch scan events for audit trail
    const { data: batchItems } = await supabase
      .from('linen_items')
      .select('id, rfid_tag_id')
      .eq('org_id', orgId)
      .eq('current_batch_id', outboundBatch.id);

    await supabase
      .from('linen_items')
      .update({ status: 'out' })
      .eq('org_id', orgId)
      .eq('current_batch_id', outboundBatch.id);

    if (batchItems && batchItems.length > 0) {
      await supabase.from('scan_events').insert(
        batchItems.map((item) => ({
          org_id: orgId,
          rfid_tag_id: item.rfid_tag_id,
          item_id: item.id,
          event_type: 'dispatch',
          batch_id: outboundBatch.id,
          order_id: id,
          gate_id: 'dashboard',
          source: 'dashboard_dispatch',
          created_at: dispatchedAt,
        }))
      );
    }

    await supabase
      .from('delivery_orders')
      .update({ status: 'dispatched', dispatched_at: dispatchedAt })
      .eq('id', id)
      .eq('org_id', orgId);

    return NextResponse.json({
      batch_id: outboundBatch.id,
      manifest_url: `/api/orders/${id}/manifest`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
