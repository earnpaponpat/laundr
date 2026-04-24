import { AlertTriangle } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import { getDemoData } from '@/lib/demo/server-data';

type AlertRow = {
  clientName: string;
  categoryName: string;
  parQuantity: number;
  cleanStock: number;
  gap: number;
};

function toCategoryShortName(name: string): string {
  const parts = name
    .split(' ')
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length === 0) return name;
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export async function TomorrowParLevelAlert() {
  const supabase = await createClient();
  const demoData = getDemoData();
  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId =
    orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';

  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowIso = tomorrow.toISOString().slice(0, 10);

  if (!orgId) {
    return (
      <section className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
          <div className="space-y-2">
            <p className="text-sm font-semibold text-amber-900">
              Par Level Alert for Tomorrow ({tomorrowIso})
            </p>
            <div className="space-y-1">
              {demoData.parAlerts.slice(0, 8).map((row, index) => (
                <p key={`${row.clientName}-${row.categoryName}-${index}`} className="text-xs text-amber-900">
                  {row.clientName} tomorrow: needs {row.parQuantity} {toCategoryShortName(row.categoryName)} | clean stock: {row.cleanStock} | GAP: {row.gap}
                </p>
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  const { data: tomorrowOrders } = await supabase
    .from('delivery_orders')
    .select('client_id')
    .eq('org_id', orgId)
    .eq('scheduled_date', tomorrowIso)
    .in('status', ['draft', 'picking', 'ready']);

  const clientIds = Array.from(new Set((tomorrowOrders || []).map((row) => row.client_id).filter(Boolean)));
  if (clientIds.length === 0) {
    return null;
  }

  const [{ data: parLevels }, { data: cleanRows }, { data: clients }, { data: categories }] = await Promise.all([
    supabase
      .from('client_par_levels')
      .select('client_id, category_id, par_quantity')
      .eq('org_id', orgId)
      .in('client_id', clientIds),
    supabase
      .from('linen_items')
      .select('category_id')
      .eq('org_id', orgId)
      .eq('status', 'clean')
      .not('category_id', 'is', null),
    supabase
      .from('clients')
      .select('id, name')
      .eq('org_id', orgId)
      .in('id', clientIds),
    supabase
      .from('linen_categories')
      .select('id, name')
      .eq('org_id', orgId),
  ]);

  const cleanByCategory: Record<string, number> = {};
  for (const row of cleanRows || []) {
    const categoryId = row.category_id as string | null;
    if (!categoryId) continue;
    cleanByCategory[categoryId] = (cleanByCategory[categoryId] || 0) + 1;
  }

  const clientNameById = new Map((clients || []).map((client) => [client.id, client.name]));
  const categoryNameById = new Map((categories || []).map((category) => [category.id, category.name]));

  const alertRows: AlertRow[] = [];
  for (const row of parLevels || []) {
    const parQuantity = Number(row.par_quantity || 0);
    const cleanStock = cleanByCategory[row.category_id] || 0;
    const gap = parQuantity - cleanStock;

    if (gap > 0) {
      alertRows.push({
        clientName: clientNameById.get(row.client_id) || 'Client',
        categoryName: categoryNameById.get(row.category_id) || 'Category',
        parQuantity,
        cleanStock,
        gap,
      });
    }
  }

  const displayRows = alertRows.length > 0 ? alertRows : demoData.parAlerts;

  return (
    <section className="rounded-xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-sm">
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-700" />
        <div className="space-y-2">
          <p className="text-sm font-semibold text-amber-900">
            Par Level Alert for Tomorrow ({tomorrowIso})
          </p>
          <div className="space-y-1">
            {displayRows.slice(0, 8).map((row, index) => (
              <p key={`${row.clientName}-${row.categoryName}-${index}`} className="text-xs text-amber-900">
                {row.clientName} tomorrow: needs {row.parQuantity} {toCategoryShortName(row.categoryName)} | clean stock: {row.cleanStock} | GAP: {row.gap}
              </p>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
