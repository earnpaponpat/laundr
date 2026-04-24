import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function PATCH(
  req: Request, 
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const supabase = await createClient();

    // 1. Fetch current route
    const { data: route, error: fetchErr } = await supabase
      .from('routes')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchErr || !route) throw new Error('Route not found');

    const updatedStops = [...(route.stops as any[])];

    // 2. Handle stop update
    if (typeof body.stopIndex === 'number') {
      const idx = body.stopIndex;
      if (body.status) updatedStops[idx].status = body.status;
      if (body.signature) updatedStops[idx].signature = body.signature;
      if (body.signed_by) updatedStops[idx].signed_by = body.signed_by;
      if (body.status === 'delivered') updatedStops[idx].delivered_at = new Date().toISOString();

      // If signed, update the corresponding batch and fire delivery_signed scan events
      if (body.signature && body.signed_by) {
        const batchId = updatedStops[idx].batch_id as string | null;

        await supabase
          .from('delivery_batches')
          .update({ manifest_signed: true, signed_by: body.signed_by })
          .eq('id', batchId);

        // Fire delivery_signed events for every item that was checked out in this batch
        if (batchId) {
          const { data: checkoutEvents } = await supabase
            .from('scan_events')
            .select('item_id, org_id, client_id, gate_id')
            .eq('batch_id', batchId)
            .eq('event_type', 'checkout');

          if (checkoutEvents && checkoutEvents.length > 0) {
            await supabase.from('scan_events').insert(
              checkoutEvents.map(e => ({
                org_id: e.org_id,
                item_id: e.item_id,
                client_id: e.client_id,
                gate_id: `${e.gate_id}_manifest`,
                event_type: 'dispatch',
                batch_id: batchId,
                source: 'manifest_signed',
              }))
            );
          }
        }

        if (process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL) {
          fetch(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              event: 'delivery_signed',
              route_id: id,
              client: updatedStops[idx].client_name,
              signed_by: body.signed_by,
              timestamp: new Date().toISOString()
            })
          }).catch(e => console.error('Webhook failed', e));
        }
      }
    }

    // 3. Handle overall route status update
    const finalRouteStatus = body.routeStatus || route.status;

    const { data: updatedRoute, error: updateErr } = await supabase
      .from('routes')
      .update({
        stops: updatedStops,
        status: finalRouteStatus
      })
      .eq('id', id)
      .select()
      .single();

    if (updateErr) throw updateErr;

    return NextResponse.json(updatedRoute);
  } catch (err: any) {
    console.error('Route Update Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
