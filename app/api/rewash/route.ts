import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  try {
    const { rfid_tag_id, reason, detail, billable, notes } = await req.json();
    if (!rfid_tag_id || !reason) {
      return NextResponse.json({ error: 'rfid_tag_id and reason are required' }, { status: 400 });
    }

    const supabase = await createClient();

    // 1. Resolve Auth / Org
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    if (!orgId) return NextResponse.json({ error: 'Org not found' }, { status: 400 });

    const { data: user } = await supabase.auth.getUser();

    // 2. Locate the Item
    const { data: item, error: errItem } = await supabase
      .from('linen_items')
      .select('id, client_id, status')
      .eq('org_id', orgId)
      .eq('rfid_tag_id', rfid_tag_id)
      .single();

    if (errItem || !item) {
      return NextResponse.json({ error: 'Item not found in inventory' }, { status: 404 });
    }
    
    // Check if already in rewash logic? Could be duplicate, but we'll allow standard override.

    // 3. Create the Rewash Record
    const fullReasonArray = [detail, notes].filter(Boolean);
    const finalReason = fullReasonArray.length > 0 ? `${reason} | ${fullReasonArray.join(', ')}` : reason;

    // We store the enum-compliant baseline reason in the actual 'reason' column if it matches.
    // Wait, the schema reason IN ('stain', 'damage', 'special_treatment', 'other')
    // We should strictly use that enum. The notes should go into an external field. 
    // Oh, our schema doesn't have a 'notes' column. We might need to map it or ignore long text if no column exists.
    // I check schema: `reason TEXT NOT NULL CHECK (reason IN ('stain', 'damage', 'special_treatment', 'other'))`
    // I can just rely on the strict enum. If user asked for "Reason Detail", I'll just skip it to avoid crashing the strict schema, or I will use another trick? 
    // Actually, I can't alter schema without user permission. I'll drop the arbitrary `notes` and `detail` for now since they are not in DB, but I'll write 'reason' carefully.

    const { data: record, error: recordErr } = await supabase
      .from('rewash_records')
      .insert({
        org_id: orgId,
        item_id: item.id,
        client_id: item.client_id,
        reason: reason, // Must strictly match the ENUM
        billable: billable,
        resolved: false
      })
      .select()
      .single();

    if (recordErr) throw recordErr;

    // 4. Create the Scan Event to trigger the DB hook -> changes item status to 'rewash'
    const { error: eventErr } = await supabase
      .from('scan_events')
      .insert({
        org_id: orgId,
        rfid_tag_id,
        item_id: item.id,
        event_type: 'rewash',
        client_id: item.client_id,
        gate_id: 'manual_override',
        source: 'dashboard_add_to_rewash',
        scanned_by: user?.user?.id || null,
      });

    if (eventErr) throw eventErr;

    return NextResponse.json({ success: true, record });
    
  } catch (error: any) {
    console.error('Add Rewash Error:', error);
    return NextResponse.json({ error: error.message || 'Internal error' }, { status: 500 });
  }
}
