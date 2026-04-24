import { NextResponse } from 'next/server';
import { getDemoDriverStopDetail } from '@/lib/driver/demo';
import { canUseDriverApp, getDriverContext } from '@/lib/driver/context';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ stopId: string }> }
) {
  try {
    const { stopId } = await params;
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
      return NextResponse.json(detail);
    }

    const { data: stop, error: stopError } = await ctx.supabase
      .from('trip_stops')
      .select('id, trip_id, stop_no, status, order_id, client_id, expected_deliver_count, expected_collect_count, delivered_count, collected_count, delivered_tags, collected_tags, delivered_at, collected_at, completed_at, clients(name)')
      .eq('id', stopId)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (stopError || !stop) {
      return NextResponse.json({ error: 'stop_not_found' }, { status: 404 });
    }

    const { data: trip } = await ctx.supabase
      .from('delivery_trips')
      .select('id, driver_id, status, scheduled_date')
      .eq('id', stop.trip_id)
      .eq('org_id', ctx.orgId)
      .maybeSingle();

    if (!trip) {
      return NextResponse.json({ error: 'trip_not_found' }, { status: 404 });
    }

    if (ctx.role === 'driver' && trip.driver_id !== ctx.userId) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const { data: order } = stop.order_id
      ? await ctx.supabase
          .from('delivery_orders')
          .select('id, order_number, status')
          .eq('id', stop.order_id)
          .eq('org_id', ctx.orgId)
          .maybeSingle()
      : { data: null };

    const { data: orderItems } = stop.order_id
      ? await ctx.supabase
          .from('delivery_order_items')
          .select('category_id, requested_qty, picked_qty, returned_qty, linen_categories(name)')
          .eq('order_id', stop.order_id)
      : { data: [] };

    const { data: outboundBatch } = stop.order_id
      ? await ctx.supabase
          .from('delivery_batches')
          .select('id, total_items, dispatched_at')
          .eq('org_id', ctx.orgId)
          .eq('order_id', stop.order_id)
          .eq('batch_type', 'outbound')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle()
      : { data: null };

    const clientRef = stop.clients as unknown;
    const clientName = Array.isArray(clientRef)
      ? (clientRef[0] as { name?: string } | undefined)?.name || 'Client'
      : (clientRef as { name?: string } | null)?.name || 'Client';

    const itemLines = (orderItems || []).map((row) => {
      const categoryRef = row.linen_categories as unknown;
      const categoryName = Array.isArray(categoryRef)
        ? (categoryRef[0] as { name?: string } | undefined)?.name || 'Category'
        : (categoryRef as { name?: string } | null)?.name || 'Category';

      return {
        category_id: row.category_id,
        category_name: categoryName,
        deliver_qty: Number(row.picked_qty || row.requested_qty || 0),
        requested_qty: Number(row.requested_qty || 0),
        returned_qty: Number(row.returned_qty || 0),
      };
    });

    const deliverExpected = Number(stop.expected_deliver_count || 0)
      || itemLines.reduce((sum, row) => sum + row.deliver_qty, 0);

    const collectExpected = Number(stop.expected_collect_count || 0)
      || Math.max(0, deliverExpected - Number(stop.delivered_count || 0));

    return NextResponse.json({
      stop: {
        id: stop.id,
        stop_no: stop.stop_no,
        status: stop.status,
        client_name: clientName,
        order_id: stop.order_id,
        order_number: order?.order_number || null,
        trip_id: stop.trip_id,
        trip_status: trip.status,
        scheduled_date: trip.scheduled_date,
        expected_deliver_count: deliverExpected,
        expected_collect_count: collectExpected,
        delivered_count: Number(stop.delivered_count || 0),
        collected_count: Number(stop.collected_count || 0),
        delivered_tags: stop.delivered_tags || [],
        collected_tags: stop.collected_tags || [],
        outbound_batch_id: outboundBatch?.id || null,
      },
      items: itemLines,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
