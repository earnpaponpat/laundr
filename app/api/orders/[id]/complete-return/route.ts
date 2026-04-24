import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
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
      .select('id, org_id, client_id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }

    const { data: lines, error: lineError } = await supabase
      .from('delivery_order_items')
      .select('picked_qty, returned_qty')
      .eq('order_id', id);

    if (lineError || !lines) {
      return NextResponse.json({ error: 'order_items_not_found' }, { status: 400 });
    }

    const dispatched = lines.reduce((sum, line) => sum + Number(line.picked_qty || 0), 0);
    const returned = lines.reduce((sum, line) => sum + Number(line.returned_qty || 0), 0);
    const missing = Math.max(dispatched - returned, 0);

    const { data: outboundBatch } = await supabase
      .from('delivery_batches')
      .select('id')
      .eq('org_id', orgId)
      .eq('order_id', id)
      .eq('batch_type', 'outbound')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: inboundBatch, error: inboundError } = await supabase
      .from('delivery_batches')
      .insert({
        org_id: orgId,
        client_id: order.client_id,
        order_id: id,
        batch_type: 'inbound',
        total_items: returned,
        returned_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (inboundError || !inboundBatch) {
      return NextResponse.json(
        { error: inboundError?.message ?? 'create_inbound_batch_failed' },
        { status: 500 }
      );
    }

    // Link returned items to the inbound batch so production flow can find them.
    // Returned items have current_batch_id=NULL (cleared by checkin trigger), so
    // we find them via checkin scan events on this order.
    const { data: checkinEvents } = await supabase
      .from('scan_events')
      .select('item_id')
      .eq('org_id', orgId)
      .eq('order_id', id)
      .eq('event_type', 'checkin')
      .not('item_id', 'is', null);

    const returnedItemIds = [
      ...new Set((checkinEvents ?? []).map((e) => e.item_id as string).filter(Boolean)),
    ];

    if (returnedItemIds.length > 0) {
      await supabase
        .from('linen_items')
        .update({ current_batch_id: inboundBatch.id })
        .eq('org_id', orgId)
        .in('id', returnedItemIds)
        .is('current_batch_id', null); // don't overwrite items already linked by driver app
    }

    const { data: productionBatch, error: productionError } = await supabase
      .from('production_batches')
      .insert({
        org_id: orgId,
        inbound_batch_id: inboundBatch.id,
        status: 'queued',
      })
      .select('id')
      .single();

    if (productionError || !productionBatch) {
      return NextResponse.json(
        { error: productionError?.message ?? 'create_production_batch_failed' },
        { status: 500 }
      );
    }

    const completedAt = new Date().toISOString();

    if (outboundBatch?.id) {
      if (missing > 0) {
        await supabase
          .from('linen_items')
          .update({ status: 'lost' })
          .eq('org_id', orgId)
          .eq('current_batch_id', outboundBatch.id)
          .eq('status', 'out');
      }

      await supabase
        .from('delivery_batches')
        .update({ status: 'closed', returned_at: completedAt })
        .eq('id', outboundBatch.id)
        .eq('org_id', orgId);
    }

    await supabase
      .from('delivery_orders')
      .update({ status: 'completed', completed_at: completedAt })
      .eq('id', id)
      .eq('org_id', orgId);

    return NextResponse.json({
      inbound_batch_id: inboundBatch.id,
      production_batch_id: productionBatch.id,
      reconcile_summary: {
        dispatched,
        returned,
        missing,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
