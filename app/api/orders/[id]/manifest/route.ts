import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(
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
      .select('id, order_number, status, scheduled_date, vehicle_plate, notes, clients(name), profiles(full_name)')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }

    const { data: items } = await supabase
      .from('delivery_order_items')
      .select('category_id, requested_qty, picked_qty, returned_qty, linen_categories(name)')
      .eq('order_id', id)
      .order('created_at', { ascending: true });

    const { data: batches } = await supabase
      .from('delivery_batches')
      .select('id, batch_type, total_items, dispatched_at, returned_at, created_at, weight_kg')
      .eq('org_id', orgId)
      .eq('order_id', id)
      .order('created_at', { ascending: false });

    const outboundBatch = (batches || []).find((batch) => batch.batch_type === 'outbound') || null;

    const checkoutEvents = outboundBatch
      ? (
          await supabase
            .from('scan_events')
            .select('rfid_tag_id')
            .eq('org_id', orgId)
            .eq('batch_id', outboundBatch.id)
            .eq('event_type', 'checkout')
        ).data || []
      : [];

    const checkinEvents = outboundBatch
      ? (
          await supabase
            .from('scan_events')
            .select('rfid_tag_id')
            .eq('org_id', orgId)
            .eq('batch_id', outboundBatch.id)
            .eq('event_type', 'checkin')
        ).data || []
      : [];

    const rewashEvents = outboundBatch
      ? (
          await supabase
            .from('scan_events')
            .select('rfid_tag_id')
            .eq('org_id', orgId)
            .eq('batch_id', outboundBatch.id)
            .in('event_type', ['qc_rewash', 'rewash'])
        ).data || []
      : [];

    const checkoutTags = checkoutEvents.map((entry) => entry.rfid_tag_id);
    const returnedTagsSet = new Set(checkinEvents.map((entry) => entry.rfid_tag_id));
    const missingTags = checkoutTags.filter((tag) => !returnedTagsSet.has(tag));

    const batchIds = (batches || []).map((batch) => batch.id);
    const recentScans = batchIds.length
      ? (
          await supabase
            .from('scan_events')
            .select('id, rfid_tag_id, event_type, created_at, gate_id, source, batch_id')
            .eq('org_id', orgId)
            .in('batch_id', batchIds)
            .order('created_at', { ascending: false })
            .limit(50)
        ).data || []
      : [];

    const pickedTotal = (items || []).reduce((sum, row) => sum + Number(row.picked_qty || 0), 0);
    const requestedTotal = (items || []).reduce((sum, row) => sum + Number(row.requested_qty || 0), 0);
    const returnedTotal = (items || []).reduce((sum, row) => sum + Number(row.returned_qty || 0), 0);

    return NextResponse.json({
      order,
      items: items || [],
      batches: batches || [],
      summary: {
        requested: requestedTotal,
        picked: pickedTotal,
        returned: returnedTotal,
        missing: missingTags.length,
        missing_tags: missingTags,
        in_rewash: rewashEvents.length,
      },
      recent_scans: recentScans,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
