import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getDemoData } from '@/lib/demo/server-data';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const supabase = await createClient();

    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    // Generate Invoice Number: INV-YYYY-NNNN
    const year = new Date().getFullYear();
    const { data: lastInv } = await supabase
      .from('invoices')
      .select('invoice_number')
      .eq('org_id', orgId)
      .like('invoice_number', `INV-${year}-%`)
      .order('invoice_number', { ascending: false })
      .limit(1)
      .single();

    let seq = 1;
    if (lastInv) {
      const lastSeq = parseInt(lastInv.invoice_number.split('-')[2]);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    const invoice_number = `INV-${year}-${seq.toString().padStart(4, '0')}`;

    const { data: invoice, error } = await supabase
      .from('invoices')
      .insert({
        org_id: orgId,
        client_id: body.client_id,
        invoice_number,
        issue_date: body.issue_date || new Date().toISOString(),
        due_date: body.due_date,
        status: body.status || 'draft',
        subtotal: body.subtotal,
        rewash_charges: body.rewash_charges,
        loss_charges: body.loss_charges,
        total: body.total,
        items_json: body.items,
        notes: body.notes
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json(invoice);
  } catch (err: any) {
    console.error('Invoice Create Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET(req: Request) {
    const supabase = await createClient();
    const demoData = getDemoData();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    if (!orgId) return NextResponse.json(demoData.invoices);

    const { data: invoices, error } = await supabase
      .from('invoices')
      .select('*, clients(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false });

    if (error) return NextResponse.json(demoData.invoices);
    return NextResponse.json(Array.isArray(invoices) && invoices.length > 0 ? invoices : demoData.invoices);
}
