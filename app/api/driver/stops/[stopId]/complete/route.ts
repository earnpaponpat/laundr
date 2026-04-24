import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDemoDriverStopDetail } from '@/lib/driver/demo';
import { canUseDriverApp, getDriverContext } from '@/lib/driver/context';

const schema = z.object({
  delivered_tags: z.array(z.string().min(1)),
  collected_tags: z.array(z.string().min(1)),
  signature: z.string().min(1),
  received_by: z.string().min(1),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    const { stopId } = await params;
    const parsed = schema.safeParse(await req.json());

    if (!parsed.success) {
      return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 });
    }

    const ctx = await getDriverContext();
    if (!ctx) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (!canUseDriverApp(ctx.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    if (ctx.demoMode || !ctx.supabase) {
      const detail = getDemoDriverStopDetail(stopId);
      if (!detail) {
        return NextResponse.json({ error: 'stop_not_found' }, { status: 404 });
      }

      const deliveredTags = Array.from(new Set(parsed.data.delivered_tags));
      const collectedTags = Array.from(new Set(parsed.data.collected_tags));
      const collectedSet = new Set(collectedTags);
      const missingCount = deliveredTags.filter((tag) => !collectedSet.has(tag)).length;

      return NextResponse.json({
        success: true,
        missing_count: missingCount,
        production_batch_id: `demo-production-${detail.stop.id}`,
        inbound_batch_id: `demo-inbound-${detail.stop.id}`,
      });
    }

    const { data: stop } = await ctx.supabase
      .from('trip_stops')
      .select('id, trip_id, org_id, order_id, client_id, expected_deliver_count, expected_collect_count')
      .eq('id', stopId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!stop) {
      return NextResponse.json({ error: 'stop_not_found' }, { status: 404 });
    }

    const { data: trip } = await ctx.supabase
      .from('delivery_trips')
      .select('id, driver_id, status')
      .eq('id', stop.trip_id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!trip) {
      return NextResponse.json({ error: 'trip_not_found' }, { status: 404 });
    }

    if (ctx.role === 'driver' && trip.driver_id !== ctx.userId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { data: outboundBatch } = stop.order_id
      ? await ctx.supabase
          .from('delivery_batches')
          .select('id')
          .eq('org_id', ctx.orgId)
          .eq('order_id', stop.order_id)
          .eq('batch_type', 'outbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const deliveredTags = Array.from(new Set(parsed.data.delivered_tags));
    const collectedTags = Array.from(new Set(parsed.data.collected_tags));
    const collectedSet = new Set(collectedTags);
    const missingTags = deliveredTags.filter((tag) => !collectedSet.has(tag));

    const nowIso = new Date().toISOString();

    const { data: inboundBatch, error: inboundError } = await ctx.supabase
      .from('delivery_batches')
      .insert({
        org_id: ctx.orgId,
        client_id: stop.client_id,
        order_id: stop.order_id,
        batch_type: 'inbound',
        total_items: collectedTags.length,
        returned_at: nowIso,
        trip_id: stop.trip_id,
        trip_stop_id: stopId,
        status: 'open',
      })
      .select('id')
      .single();

    if (inboundError || !inboundBatch) {
      return NextResponse.json({ error: inboundError?.message || 'inbound_batch_failed' }, { status: 500 });
    }

    const { data: collectedItems } = collectedTags.length > 0
      ? await ctx.supabase
          .from('linen_items')
          .select('id, category_id, rfid_tag_id')
          .eq('org_id', ctx.orgId)
          .in('rfid_tag_id', collectedTags)
      : { data: [] as Array<{ id: string; category_id: string | null; rfid_tag_id: string }> };

    if (collectedItems && collectedItems.length > 0) {
      await ctx.supabase
        .from('linen_items')
        .update({ status: 'dirty', current_batch_id: inboundBatch.id })
        .eq('org_id', ctx.orgId)
        .in('id', collectedItems.map((item) => item.id));

      await ctx.supabase.from('scan_events').insert(
        collectedItems.map((item) => ({
          org_id: ctx.orgId,
          rfid_tag_id: item.rfid_tag_id,
          item_id: item.id,
          event_type: 'checkin',
          batch_id: inboundBatch.id,
          order_id: stop.order_id,
          client_id: stop.client_id,
          gate_id: 'driver_complete',
          source: `driver_complete:${stopId}`,
          scanned_by: ctx.userId,
        }))
      );
    }

    if (missingTags.length > 0) {
      await ctx.supabase
        .from('linen_items')
        .update({ status: 'lost', current_batch_id: null })
        .eq('org_id', ctx.orgId)
        .in('rfid_tag_id', missingTags)
        .eq('status', 'out');
    }

    if (stop.order_id && collectedItems && collectedItems.length > 0) {
      const byCategory: Record<string, number> = {};
      for (const item of collectedItems) {
        if (!item.category_id) continue;
        byCategory[item.category_id] = (byCategory[item.category_id] || 0) + 1;
      }

      const { data: orderLines } = await ctx.supabase
        .from('delivery_order_items')
        .select('category_id, returned_qty')
        .eq('order_id', stop.order_id);

      for (const line of orderLines || []) {
        const increment = byCategory[line.category_id] || 0;
        if (increment <= 0) continue;
        await ctx.supabase
          .from('delivery_order_items')
          .update({ returned_qty: Number(line.returned_qty || 0) + increment })
          .eq('order_id', stop.order_id)
          .eq('category_id', line.category_id);
      }
    }

    const { data: productionBatch, error: productionError } = await ctx.supabase
      .from('production_batches')
      .insert({
        org_id: ctx.orgId,
        inbound_batch_id: inboundBatch.id,
        status: 'queued',
      })
      .select('id')
      .single();

    if (productionError || !productionBatch) {
      return NextResponse.json({ error: productionError?.message || 'production_batch_failed' }, { status: 500 });
    }

    await ctx.supabase
      .from('trip_stops')
      .update({
        status: 'completed',
        delivered_count: deliveredTags.length,
        collected_count: collectedTags.length,
        delivered_tags: deliveredTags,
        collected_tags: collectedTags,
        delivered_signature: parsed.data.signature,
        received_by: parsed.data.received_by,
        delivered_at: nowIso,
        collected_at: nowIso,
        completed_at: nowIso,
      })
      .eq('id', stopId)
      .eq('org_id', ctx.orgId);

    const { data: remainingStops } = await ctx.supabase
      .from('trip_stops')
      .select('id, status')
      .eq('trip_id', stop.trip_id)
      .eq('org_id', ctx.orgId);

    const allCompleted = (remainingStops || []).every((row) => row.status === 'completed');
    await ctx.supabase
      .from('delivery_trips')
      .update({
        status: allCompleted ? 'completed' : 'active',
        completed_at: allCompleted ? nowIso : null,
      })
      .eq('id', stop.trip_id)
      .eq('org_id', ctx.orgId);

    await ctx.supabase
      .from('factory_notifications')
      .insert({
        org_id: ctx.orgId,
        trip_stop_id: stopId,
        level: missingTags.length > 0 ? 'warn' : 'info',
        title: 'Driver stop completed',
        message: missingTags.length > 0
          ? `Stop completed with ${missingTags.length} missing item(s).`
          : 'Stop completed and returned items queued for production.',
      });

    if (outboundBatch?.id) {
      await ctx.supabase
        .from('delivery_batches')
        .update({ status: 'closed' })
        .eq('id', outboundBatch.id)
        .eq('org_id', ctx.orgId);
    }

    return NextResponse.json({
      success: true,
      missing_count: missingTags.length,
      production_batch_id: productionBatch.id,
      inbound_batch_id: inboundBatch.id,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
