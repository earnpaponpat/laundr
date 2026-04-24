import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const patchSchema = z.object({
  action: z.enum(['start_picking', 'end_picking']),
});

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const parsed = patchSchema.safeParse(body);
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
      .select('id, org_id, client_id, driver_id, status')
      .eq('id', id)
      .eq('org_id', orgId)
      .single();

    if (orderError || !order) {
      return NextResponse.json({ error: 'order_not_found' }, { status: 404 });
    }

    if (parsed.data.action === 'start_picking') {
      if (order.status !== 'draft' && order.status !== 'picking') {
        return NextResponse.json({ error: 'cannot_start_picking' }, { status: 409 });
      }

      let { data: batch } = await supabase
        .from('delivery_batches')
        .select('id')
        .eq('org_id', orgId)
        .eq('order_id', id)
        .eq('batch_type', 'outbound')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!batch) {
        const { data: lines } = await supabase
          .from('delivery_order_items')
          .select('requested_qty')
          .eq('order_id', id);

        const totalItems = (lines || []).reduce((sum, line) => sum + Number(line.requested_qty || 0), 0);

        const { data: createdBatch, error: createBatchError } = await supabase
          .from('delivery_batches')
          .insert({
            org_id: orgId,
            client_id: order.client_id,
            order_id: id,
            batch_type: 'outbound',
            total_items: totalItems,
            driver_id: order.driver_id,
          })
          .select('id')
          .single();

        if (createBatchError || !createdBatch) {
          return NextResponse.json(
            { error: createBatchError?.message ?? 'create_batch_failed' },
            { status: 500 }
          );
        }

        batch = createdBatch;
      }

      await supabase
        .from('delivery_orders')
        .update({ status: 'picking' })
        .eq('id', id)
        .eq('org_id', orgId);

      return NextResponse.json({ success: true, batch_id: batch.id });
    }

    const { data: lines } = await supabase
      .from('delivery_order_items')
      .select('requested_qty, picked_qty')
      .eq('order_id', id);

    const isReady = (lines || []).every((line) => Number(line.picked_qty || 0) >= Number(line.requested_qty || 0));

    await supabase
      .from('delivery_orders')
      .update({ status: isReady ? 'ready' : 'picking' })
      .eq('id', id)
      .eq('org_id', orgId);

    return NextResponse.json({ success: true, status: isReady ? 'ready' : 'picking' });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
