import { createClient } from '@/lib/supabase/server';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { getDemoData } from '@/lib/demo/server-data';

export async function ParLevelAlertWidget() {
  const supabase = await createClient();
  const demoData = getDemoData();
  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId =
    orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';

  const today = new Date();
  const twoDays = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const fromDate = today.toISOString().slice(0, 10);
  const toDate = twoDays.toISOString().slice(0, 10);

  const { data: upcomingOrders } = await supabase
    .from('delivery_orders')
    .select('id, client_id, scheduled_date, clients(name)')
    .eq('org_id', orgId)
    .in('status', ['draft', 'picking', 'ready'])
    .gte('scheduled_date', fromDate)
    .lte('scheduled_date', toDate)
    .order('scheduled_date', { ascending: true });

  const orderIds = (upcomingOrders || []).map((order) => order.id);
  const { data: orderItems } = orderIds.length
    ? await supabase
        .from('delivery_order_items')
        .select('order_id, category_id, requested_qty, linen_categories(name)')
        .in('order_id', orderIds)
    : { data: [] as Array<{ order_id: string; category_id: string; requested_qty: number; linen_categories?: unknown }> };

  const { data: cleanItems } = await supabase
    .from('linen_items')
    .select('category_id')
    .eq('org_id', orgId)
    .eq('status', 'clean')
    .not('category_id', 'is', null);

  const cleanStockByCategory: Record<string, number> = {};
  for (const row of cleanItems || []) {
    const categoryId = row.category_id as string | null;
    if (!categoryId) continue;
    cleanStockByCategory[categoryId] = (cleanStockByCategory[categoryId] || 0) + 1;
  }

  const rows: Array<{
    key: string;
    clientName: string;
    dueLabel: string;
    categoryName: string;
    needed: number;
    cleanStock: number;
    gap: number;
  }> = [];

  for (const order of upcomingOrders || []) {
    const clientRef = order.clients as unknown;
    const clientName = Array.isArray(clientRef)
      ? (clientRef[0] as { name?: string } | undefined)?.name || 'Client'
      : (clientRef as { name?: string } | null)?.name || 'Client';

    const orderRows = (orderItems || []).filter((item) => item.order_id === order.id);
    for (const item of orderRows) {
      const categoryRef = item.linen_categories as unknown;
      const categoryName = Array.isArray(categoryRef)
        ? (categoryRef[0] as { name?: string } | undefined)?.name || 'Category'
        : (categoryRef as { name?: string } | null)?.name || 'Category';
      const needed = Number(item.requested_qty || 0);
      const cleanStock = cleanStockByCategory[item.category_id] || 0;
      const gap = Math.max(0, needed - cleanStock);

      rows.push({
        key: `${order.id}-${item.category_id}`,
        clientName,
        dueLabel: order.scheduled_date,
        categoryName,
        needed,
        cleanStock,
        gap,
      });
    }
  }

  const topRows = rows.slice(0, 8);
  const displayRows = topRows.length
    ? topRows
    : demoData.parAlerts.map((row, index) => ({
        key: `demo-${index}`,
        clientName: row.clientName,
        dueLabel: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
        categoryName: row.categoryName,
        needed: row.parQuantity,
        cleanStock: row.cleanStock,
        gap: row.gap,
      }));

  return (
    <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm shadow-slate-200/40 space-y-4">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
          <AlertTriangle className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold uppercase tracking-[0.16em] text-slate-500">Upcoming delivery needs — next 48 hours</h3>
          <p className="text-xs text-slate-500 mt-1">Prioritize washing sequence based on clean stock gaps.</p>
        </div>
      </div>

        <div className="space-y-2">
          {displayRows.map((row) => (
            <div key={row.key} className="rounded-lg border border-slate-100 px-3 py-2 text-sm flex flex-wrap items-center justify-between gap-2">
              <div>
                <span className="font-semibold text-slate-800">{row.clientName}</span>
                <span className="text-slate-500"> ({row.dueLabel})</span>
              </div>
              <div className="text-slate-700">
                needs <span className="font-semibold">{row.needed}</span> {row.categoryName} | clean stock:{' '}
                <span className="font-semibold">{row.cleanStock}</span>
              </div>
              <div>
                {row.gap > 0 ? (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-red-50 text-red-700">
                    GAP: {row.gap}
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-50 text-emerald-700 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" /> OK
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
    </section>
  );
}
