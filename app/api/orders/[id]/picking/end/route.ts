import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { endPickingSession, getActiveSessionForOrder } from '@/lib/rfid/batch-session';

const endSchema = z.object({
  session_id: z.string().uuid(),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: orderId } = await params;
    const body = await req.json();
    const parsed = endSchema.safeParse(body);
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

    const result = await endPickingSession(parsed.data.session_id);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
