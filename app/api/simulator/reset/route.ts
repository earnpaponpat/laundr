import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST() {
  try {
    const supabase = await createClient();

    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData
      || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

    if (!orgId) {
      return NextResponse.json({ error: 'No organization found' }, { status: 400 });
    }

    // 1. Snapshot before deleting
    const [
      { count: scanCount },
      { count: routeCount },
      { count: invoiceCount },
      { count: rewashCount },
      { count: batchCount },
    ] = await Promise.all([
      supabase.from('scan_events').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('routes').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('invoices').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('rewash_records').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
      supabase.from('delivery_batches').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    ]);

    // 2. Log the reset
    await supabase.from('simulator_logs').insert({
      org_id: orgId,
      action: 'database_reset',
      snapshot: {
        scan_events: scanCount,
        routes: routeCount,
        invoices: invoiceCount,
        rewash_records: rewashCount,
        delivery_batches: batchCount,
      },
    });

    // 3. Delete in correct FK order
    await supabase.from('rewash_records').delete().eq('org_id', orgId);
    await supabase.from('delivery_batches').delete().eq('org_id', orgId);
    await supabase.from('scan_events').delete().eq('org_id', orgId);
    await supabase.from('routes').delete().eq('org_id', orgId);
    await supabase.from('invoices').delete().eq('org_id', orgId);

    // 4. Reset linen_items to in_stock (keep wash_count)
    await supabase
      .from('linen_items')
      .update({
        status: 'in_stock',
        client_id: null,
        last_scan_at: null,
        last_scan_location: null,
      })
      .eq('org_id', orgId);

    return NextResponse.json({
      success: true,
      deleted: {
        scan_events: scanCount,
        routes: routeCount,
        invoices: invoiceCount,
        rewash_records: rewashCount,
        delivery_batches: batchCount,
      },
    });

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('Simulator Reset Error:', message);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
