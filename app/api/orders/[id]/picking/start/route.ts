import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { getSessionSummary, startPickingSession } from '@/lib/rfid/batch-session';

const startSchema = z.object({
  gate_id: z.string().min(1),
  started_by: z.string().uuid().optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await req.json();
    const parsed = startSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: 'validation_error', details: parsed.error.flatten() }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId =
      orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) {
      return NextResponse.json({ error: 'org_not_found' }, { status: 400 });
    }

    const { data: authData } = await supabase.auth.getUser();
    let startedBy: string | null = parsed.data.started_by || authData.user?.id || null;

    if (!startedBy) {
      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('org_id', orgId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();
      startedBy = profile?.id || null;
    }

    const started = await startPickingSession({
      org_id: orgId,
      order_id: orderId,
      gate_id: parsed.data.gate_id,
      started_by: startedBy,
    });

    const orderSummary = await getSessionSummary(started.session_id);

    return NextResponse.json({
      session_id: started.session_id,
      batch_id: started.batch_id,
      order_summary: orderSummary,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
