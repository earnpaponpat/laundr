import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { batch_id } = await req.json();
    if (!batch_id) {
      return NextResponse.json({ error: 'batch_id is required' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Fetch the batch to get expected_return_by for grace period logic
    const { data: batch, error: batchErr } = await supabase
      .from('delivery_batches')
      .select('id, created_at, expected_return_by, total_items')
      .eq('id', batch_id)
      .single();

    if (batchErr || !batch) {
      return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    }

    // 2. Get all checkouts linked to this batch
    const { data: checkouts, error: err } = await supabase
      .from('scan_events')
      .select(`
        id, created_at, rfid_tag_id, item_id, gate_id,
        linen_items ( status, linen_categories(name) )
      `)
      .eq('batch_id', batch_id)
      .eq('event_type', 'checkout');

    if (err) throw err;
    if (!checkouts || checkouts.length === 0) {
      return NextResponse.json({ returned: [], pending: [], missing: [], rewash: [], batch });
    }

    const itemIds = checkouts.map(c => c.item_id);
    const minDate = new Date(Math.min(...checkouts.map(c => new Date(c.created_at).getTime()))).toISOString();

    // 3. Query subsequent checkins/rewash for these exact items
    const { data: subsequentScans, error: subErr } = await supabase
      .from('scan_events')
      .select('item_id, event_type, created_at')
      .in('item_id', itemIds)
      .in('event_type', ['checkin', 'rewash'])
      .gte('created_at', minDate)
      .order('created_at', { ascending: false });

    if (subErr) throw subErr;

    // Build lookup for the LATEST return/rewash event per item
    const latestReturnEvents = new Map();
    (subsequentScans || []).forEach(scan => {
      if (!latestReturnEvents.has(scan.item_id)) {
        latestReturnEvents.set(scan.item_id, scan);
      }
    });

    const returned: any[] = [];
    const pending: any[] = [];   // within grace period — not yet missing
    const missing: any[] = [];   // past expected_return_by — truly missing
    const rewash: any[] = [];

    const now = new Date();
    const graceDeadline = batch.expected_return_by ? new Date(batch.expected_return_by) : null;
    const withinGrace = graceDeadline ? now < graceDeadline : true;

    checkouts.forEach(checkout => {
      const returnEvent = latestReturnEvents.get(checkout.item_id);

      const baselineData = {
        item_id: checkout.item_id,
        rfid_tag_id: checkout.rfid_tag_id,
        category: (checkout.linen_items as any)?.linen_categories?.name || 'Unknown',
        checkout_time: checkout.created_at,
        last_gate: checkout.gate_id,
        current_db_status: (checkout.linen_items as any)?.status,
      };

      if (!returnEvent) {
        const diffMs = now.getTime() - new Date(checkout.created_at).getTime();
        const daysOutstanding = Math.floor(diffMs / (1000 * 60 * 60 * 24));

        if (withinGrace) {
          // Still within grace period — show as pending, not yet charged
          pending.push({
            ...baselineData,
            days_outstanding: daysOutstanding,
            expected_return_by: batch.expected_return_by,
          });
        } else {
          // Past grace deadline — truly missing
          missing.push({
            ...baselineData,
            days_outstanding: daysOutstanding,
            expected_return_by: batch.expected_return_by,
          });
        }
      } else {
        if (returnEvent.event_type === 'rewash') {
          rewash.push({ ...baselineData, return_time: returnEvent.created_at });
        } else {
          returned.push({ ...baselineData, return_time: returnEvent.created_at });
        }
      }
    });

    return NextResponse.json({ returned, pending, missing, rewash, batch });

  } catch (error: any) {
    console.error('Reconcile error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
