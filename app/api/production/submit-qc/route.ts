import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';

const schema = z.object({
  production_batch_id: z.string().uuid(),
  passed: z.number().int().min(0),
  rewash: z.number().int().min(0),
  rejected: z.number().int().min(0),
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

    const { data: authData } = await supabase.auth.getUser();
    const qcBy = authData.user?.id || null;

    const { data: productionBatch } = await supabase
      .from('production_batches')
      .select('id, org_id, inbound_batch_id, status')
      .eq('id', parsed.data.production_batch_id)
      .eq('org_id', orgId)
      .maybeSingle();

    if (!productionBatch) return NextResponse.json({ error: 'production_batch_not_found' }, { status: 404 });

    const { data: foldingItems } = await supabase
      .from('linen_items')
      .select('id, wash_count')
      .eq('org_id', orgId)
      .eq('current_batch_id', productionBatch.inbound_batch_id)
      .eq('status', 'folding')
      .order('created_at', { ascending: true });

    const items = foldingItems || [];
    const total = items.length;
    const requestedTotal = parsed.data.passed + parsed.data.rewash + parsed.data.rejected;

    if (requestedTotal !== total) {
      return NextResponse.json(
        { error: 'qc_total_mismatch', message: `QC total must equal batch size (${total})` },
        { status: 400 }
      );
    }

    const passItems = items.slice(0, parsed.data.passed);
    const rewashItems = items.slice(parsed.data.passed, parsed.data.passed + parsed.data.rewash);
    const rejectItems = items.slice(parsed.data.passed + parsed.data.rewash);

    if (passItems.length > 0) {
      const passIds = passItems.map((item) => item.id);
      await supabase
        .from('linen_items')
        .update({ status: 'clean', current_batch_id: null })
        .in('id', passIds)
        .eq('org_id', orgId);

      for (const item of passItems) {
        await supabase
          .from('linen_items')
          .update({ wash_count: Number(item.wash_count || 0) + 1 })
          .eq('id', item.id)
          .eq('org_id', orgId);
      }
    }

    if (rewashItems.length > 0) {
      const rewashIds = rewashItems.map((item) => item.id);
      await supabase
        .from('linen_items')
        .update({ status: 'rewash', current_batch_id: null })
        .in('id', rewashIds)
        .eq('org_id', orgId);
    }

    if (rejectItems.length > 0) {
      const rejectIds = rejectItems.map((item) => item.id);
      await supabase
        .from('linen_items')
        .update({ status: 'rejected', current_batch_id: null })
        .in('id', rejectIds)
        .eq('org_id', orgId);
    }

    const nowIso = new Date().toISOString();
    await supabase
      .from('production_batches')
      .update({
        status: 'completed',
        qc_passed: parsed.data.passed,
        qc_rewash: parsed.data.rewash,
        qc_rejected: parsed.data.rejected,
        qc_by: qcBy,
        qc_at: nowIso,
      })
      .eq('id', productionBatch.id)
      .eq('org_id', orgId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
