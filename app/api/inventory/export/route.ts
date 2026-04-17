import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { format } from 'date-fns';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const supabase = await createClient();

    // 1. Get current org id
    let orgId;
    const { data: rpcOrg } = await supabase.rpc('get_current_org_id');
    if (rpcOrg) {
      orgId = rpcOrg;
    } else {
      const { data } = await supabase.from('organizations').select('id').limit(1).single();
      orgId = data?.id;
    }

    if (!orgId) {
      return new NextResponse("Organization not found", { status: 400 });
    }

    // 2. Extract Filters
    const q = searchParams.get('q') || '';
    const status = searchParams.get('status') || 'all';
    const categoryId = searchParams.get('category') || 'all';
    const clientId = searchParams.get('client') || 'all';
    const cycle = searchParams.get('cycle') || 'all';

    // 3. Build Query
    let query = supabase
      .from('linen_items')
      .select(`
        *,
        linen_categories (name, lifespan_cycles),
        clients (name)
      `)
      .eq('org_id', orgId);

    if (q) query = query.ilike('rfid_tag_id', `%${q}%`);
    if (status !== 'all') query = query.eq('status', status);
    if (categoryId !== 'all') query = query.eq('category_id', categoryId);
    if (clientId !== 'all') query = query.eq('client_id', clientId);
    if (cycle !== 'all') {
      if (cycle === 'normal') query = query.lt('wash_count', 160);
      else if (cycle === 'near_eol') query = query.gte('wash_count', 160).lt('wash_count', 180);
      else if (cycle === 'critical') query = query.gte('wash_count', 180);
    }

    // Sort heavily
    query = query.order('last_scan_at', { ascending: false, nullsFirst: false });

    const { data: items, error } = await query;

    if (error) {
      throw error;
    }

    // 4. Transform to CSV
    const headers = [
      'Tag ID',
      'Category',
      'Status',
      'Current Client',
      'Wash Count',
      'Lifespan Limit',
      'Last Scan Time',
      'Last Scan Location'
    ];

    const csvRows = [headers.join(',')];

    for (const item of (items || [])) {
      const row = [
        item.rfid_tag_id,
        item.linen_categories?.name || 'N/A',
        item.status,
        item.clients?.name || 'In House',
        item.wash_count,
        item.linen_categories?.lifespan_cycles || 200,
        item.last_scan_at ? format(new Date(item.last_scan_at), 'yyyy-MM-dd HH:mm:ss') : 'N/A',
        `"${item.last_scan_location || 'N/A'}"` // quotes to avoid comma issues
      ];
      csvRows.push(row.join(','));
    }

    const csvString = csvRows.join('\n');

    // 5. Response
    return new NextResponse(csvString, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': `attachment; filename="inventory_export_${format(new Date(), 'yyyyMMdd_HHmm')}.csv"`,
      },
    });

  } catch (error: any) {
    console.error('Export error:', error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
