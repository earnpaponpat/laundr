import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { addItemsToBatch, getActiveSessionForOrder, getSessionSummary } from '@/lib/rfid/batch-session';

const scanSchema = z.object({
  session_id: z.string().uuid(),
  tags: z.array(z.string().min(1)),
  overrides: z.record(
    z.string(),
    z.object({
      allow_wrong_category: z.boolean().optional(),
      allow_over_pick: z.boolean().optional(),
    })
  ).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await req.json();
    const parsed = scanSchema.safeParse(body);
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

    const activeSession = await getActiveSessionForOrder({
      org_id: orgId,
      order_id: orderId,
      session_type: 'picking',
    });

    if (!activeSession || activeSession.id !== parsed.data.session_id) {
      return NextResponse.json({ error: 'session_not_active_for_order' }, { status: 409 });
    }

    const results = await addItemsToBatch({
      session_id: parsed.data.session_id,
      rfid_tag_ids: parsed.data.tags,
      org_id: orgId,
      overrides: parsed.data.overrides,
    });

    const summary = await getSessionSummary(parsed.data.session_id);

    return NextResponse.json({ results, ...summary });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
