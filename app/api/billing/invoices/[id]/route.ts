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

    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    if (!orgId) return NextResponse.json({ error: 'Org not found' }, { status: 400 });

    const { data: invoice, error } = await supabase
      .from('invoices')
      .update(body)
      .eq('id', id)
      .eq('org_id', orgId)
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(invoice);
  } catch (err: any) {
    console.error('Invoice Update Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
