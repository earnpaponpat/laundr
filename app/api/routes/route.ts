import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { name, driver_id, vehicle_plate, scheduled_at, stops } = await req.json();
    const supabase = await createClient();

    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    // 1. Create the Route with stops (no batch_id yet)
    const { data: route, error: routeErr } = await supabase
      .from('routes')
      .insert({
        org_id: orgId,
        name,
        driver_id,
        vehicle_plate,
        scheduled_at,
        status: 'pending',
        stops: stops.map((s: any, idx: number) => ({
          ...s,
          order: idx,
          status: 'pending',
          batch_id: null,   // filled in below
        }))
      })
      .select()
      .single();

    if (routeErr) throw routeErr;

    // 2. Create one delivery_batch per stop — then write batch_id back into the stop
    const stopsWithBatchIds = [...(route.stops as any[])];

    for (let idx = 0; idx < stops.length; idx++) {
      const stop = stops[idx];
      const { data: batch, error: batchErr } = await supabase
        .from('delivery_batches')
        .insert({
          org_id: orgId,
          client_id: stop.client_id,
          batch_type: 'outbound',
          route_id: route.id,
          total_items: stop.item_count || 0,
          driver_id: driver_id,
        })
        .select('id')
        .single();

      if (!batchErr && batch) {
        stopsWithBatchIds[idx] = { ...stopsWithBatchIds[idx], batch_id: batch.id };
      }
    }

    // 3. Persist stops with batch_ids
    const { data: finalRoute, error: updateErr } = await supabase
      .from('routes')
      .update({ stops: stopsWithBatchIds })
      .eq('id', route.id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json(finalRoute);
  } catch (err: any) {
    console.error('Route Create Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
