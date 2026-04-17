import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { calculateBilling } from '@/lib/billing/calculator';

export async function POST(req: Request) {
  try {
    const { client_id, date_from, date_to } = await req.json();
    if (!client_id || !date_from || !date_to) {
      return NextResponse.json({ error: 'Missing parameters' }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    if (!orgId) return NextResponse.json({ error: 'Org not found' }, { status: 400 });

    // Verify the client belongs to this org — prevents cross-org billing reads
    const { data: client } = await supabase
      .from('clients')
      .select('id')
      .eq('id', client_id)
      .eq('org_id', orgId)
      .single();

    if (!client) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }

    const result = await calculateBilling(client_id, date_from, date_to);
    return NextResponse.json(result);
  } catch (err: any) {
    console.error('Billing Calculate Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
