import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getServerT } from '@/lib/i18n/server';
import { Skeleton } from '@/components/ui/skeleton';
import { InventoryFilters } from '@/components/rfid/InventoryFilters';
import { InventoryTable } from '@/components/rfid/InventoryTable';
import { HeaderActions } from '@/components/dashboard/HeaderActions';
import { Layers, PackageCheck, Truck, AlertTriangle } from 'lucide-react';
import { getDemoInventoryView } from '@/lib/demo/server-data';

export const metadata = {
  title: 'Inventory | Laundr',
};

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createClient();
  const { t } = await getServerT();
  const params = await searchParams;

  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

  const q = typeof params.q === 'string' ? params.q : '';
  const status = typeof params.status === 'string' ? params.status : 'all';
  const categoryId = typeof params.category === 'string' ? params.category : 'all';
  const clientId = typeof params.client === 'string' ? params.client : 'all';
  const cycle = typeof params.cycle === 'string' ? params.cycle : 'all';
  const page = typeof params.page === 'string' ? parseInt(params.page) : 1;
  const pageSize = 50;

  const [
    { data: categories },
    { data: clients },
    { count: totalItems },
    { count: inStock },
    { count: outItems },
    { count: nearEol }
  ] = await Promise.all([
    supabase.from('linen_categories').select('id, name').eq('org_id', orgId),
    supabase.from('clients').select('id, name').eq('org_id', orgId),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'clean'),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'out'),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).gte('wash_count', 160)
  ]);

  let query = supabase
    .from('linen_items')
    .select(`*, linen_categories (name, lifespan_cycles), clients (name)`, { count: 'exact' })
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

  const from = (page - 1) * pageSize;
  const to = from + pageSize - 1;
  query = query.order('last_scan_at', { ascending: false, nullsFirst: false }).range(from, to);

  const { data: items, count: filteredCount } = await query;

  const useDemoData = !orgId || !items?.length;
  const demoInventory = useDemoData
    ? getDemoInventoryView({ q, status, categoryId, clientId, cycle, page, pageSize })
    : null;
  const displayCategories = useDemoData ? demoInventory!.categories : (categories || []);
  const displayClients = useDemoData ? demoInventory!.clients : (clients || []);
  const displayItems = useDemoData ? demoInventory!.items : (items || []);
  const displayTotal = useDemoData ? demoInventory!.totalItems : (totalItems || 0);
  const displayInStock = useDemoData ? demoInventory!.inStock : (inStock || 0);
  const displayOut = useDemoData ? demoInventory!.outItems : (outItems || 0);
  const displayNearEol = useDemoData ? demoInventory!.nearEol : (nearEol || 0);

  const stats = [
    { label: t('inventory.stats.totalItems'), value: displayTotal, icon: Layers, bg: 'bg-slate-50', iconColor: 'text-slate-400' },
    { label: t('inventory.stats.inHouse'), value: displayInStock, icon: PackageCheck, bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
    { label: t('inventory.stats.outWithClients'), value: displayOut, icon: Truck, bg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
    { label: t('inventory.stats.requiresAttention'), value: displayNearEol, icon: AlertTriangle, bg: 'bg-orange-50', iconColor: 'text-orange-500', sub: t('inventory.stats.items160washes') },
  ];

  return (
    <div className="space-y-12">
      <HeaderActions>
        <button className="bg-white text-slate-700 hover:bg-slate-50 text-xs font-bold px-4 py-2 rounded-lg transition-all shadow-sm shadow-slate-200/50 border-0">
          {t('inventory.exportManifest')}
        </button>
      </HeaderActions>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-6 shadow-sm shadow-slate-200/50 hover:shadow-md transition-all group">
            <div className="flex items-start justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</span>
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <s.icon className={`h-4 w-4 ${s.iconColor}`} />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tighter">
              {s.value?.toLocaleString() || 0}
            </div>
            {s.sub && (
              <div className="mt-2 text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{s.sub}</div>
            )}
          </div>
        ))}
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('inventory.detailedList')}</h3>
        <Suspense fallback={<Skeleton className="h-[72px] w-full rounded-xl" />}>
          <InventoryFilters categories={displayCategories} clients={displayClients} />
        </Suspense>
        <Suspense fallback={<Skeleton className="h-[500px] w-full rounded-xl" />}>
          <InventoryTable
            items={displayItems}
            page={page}
            totalCount={useDemoData ? demoInventory!.filteredCount : (filteredCount || 0)}
            pageSize={pageSize}
          />
        </Suspense>
      </div>
    </div>
  );
}
