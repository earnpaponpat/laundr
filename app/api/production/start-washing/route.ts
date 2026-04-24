import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  production_batch_id: z.string().uuid(),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId =
      orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) return NextResponse.json({ error: 'org_not_found' }, { status: 400 });

    const { data: productionBatch } = await supabase
      .from('production_batches')
      .select('id, org_id, inbound_batch_id, status')
      .eq('id', parsed.data.production_batch_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!productionBatch) return NextResponse.json({ error: 'production_batch_not_found' }, { status: 404 });

    const nowIso = new Date().toISOString();

    await supabase
      .from('production_batches')
      .update({ status: 'washing', wash_started_at: nowIso })
      .eq('id', productionBatch.id)
      .eq('org_id', orgId);

    await supabase
      .from('linen_items')
      .update({ status: 'washing', current_batch_id: productionBatch.inbound_batch_id })
      .eq('org_id', orgId)
      .eq('current_batch_id', productionBatch.inbound_batch_id)
      .in('status', ['dirty', 'rewash']);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
