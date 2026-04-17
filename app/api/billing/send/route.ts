import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { invoice_id } = await req.json();
    const supabase = await createClient();

    // 1. Fetch invoice and client info
    const { data: invoice, error } = await supabase
      .from('invoices')
      .select('*, clients(*)')
      .eq('id', invoice_id)
      .single();

    if (error || !invoice) throw new Error('Invoice not found');

    // 2. Trigger Webhook (n8n)
    if (process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL) {
      fetch(process.env.NEXT_PUBLIC_N8N_WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          event: 'invoice_send',
          invoice_id: invoice.id,
          invoice_number: invoice.invoice_number,
          client_email: invoice.clients?.contact_email,
          client_name: invoice.clients?.name,
          total: invoice.total,
          due_date: invoice.due_date
        })
      }).catch(e => console.error('Webhook failed', e));
    }

    // 3. Update status to pending
    const { data: updated } = await supabase
      .from('invoices')
      .update({ status: 'pending' })
      .eq('id', invoice_id)
      .select()
      .single();

    return NextResponse.json(updated);
  } catch (err: any) {
    console.error('Invoice Send Error:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
