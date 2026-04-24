import { Suspense } from 'react';
import { createClient } from '@/lib/supabase/server';
import { getServerT } from '@/lib/i18n/server';
import { RefreshCw, AlertTriangle, Receipt, PackageCheck } from 'lucide-react';
import { RewashQueue } from '@/components/rfid/RewashQueue';
import { AddRewashDialog } from '@/components/rfid/AddRewashDialog';
import { HeaderActions } from '@/components/dashboard/HeaderActions';
import { startOfMonth } from 'date-fns';
import { RewashChartsWrapper } from '@/components/rfid/RewashChartsWrapper';
import { getDemoData } from '@/lib/demo/server-data';

export const metadata = {
  title: 'Rewash & Damage | Laundr',
};

export default async function RewashPage() {
  const supabase = await createClient();
  const { t } = await getServerT();
  const demoData = getDemoData();

  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

  const firstDayOfMonth = startOfMonth(new Date()).toISOString();

  const [
    { count: inQueue },
    { count: rejectedThisMonth },
    { count: reclaimedThisMonth },
    { data: allRecords }
  ] = await Promise.all([
    supabase.from('rewash_records').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('resolved', false),
    supabase.from('rewash_records')
      .select('*, linen_items!inner(status)')
      .eq('org_id', orgId)
      .eq('resolved', true)
      .eq('linen_items.status', 'rejected')
      .gte('created_at', firstDayOfMonth),
    supabase.from('rewash_records')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('resolved', true)
      .gte('created_at', firstDayOfMonth),
    supabase.from('rewash_records')
      .select('*, linen_items(status, rfid_tag_id, linen_categories(name, replacement_cost)), clients(name)')
      .eq('org_id', orgId)
      .order('created_at', { ascending: false })
  ]);

  const records = allRecords && allRecords.length > 0 ? allRecords : demoData.rewashRecords;
  const useDemoData = !allRecords || allRecords.length === 0;
  let extraCostThisMonth = 0;
  records.forEach(r => {
    if (new Date(r.created_at).getTime() >= new Date(firstDayOfMonth).getTime()) {
      if (r.resolved && r.linen_items?.status === 'rejected' && r.billable) {
        const cost = typeof r.linen_items.linen_categories?.replacement_cost === 'number'
          ? r.linen_items.linen_categories.replacement_cost
          : 0;
        extraCostThisMonth += cost;
      }
    }
  });

  const activeQueue = records.filter(r => !r.resolved);

  const stats = [
    { label: t('rewash.inQueue'), value: useDemoData ? activeQueue.length : (inQueue || 0), icon: RefreshCw, bg: 'bg-slate-50', iconColor: 'text-slate-400' },
    { label: t('rewash.rejectedMonth'), value: useDemoData ? records.filter(r => r.resolved && r.linen_items?.status === 'rejected').length : (rejectedThisMonth || 0), icon: AlertTriangle, bg: 'bg-red-50', iconColor: 'text-red-500' },
    { label: t('rewash.reclaimed'), value: useDemoData ? records.filter(r => r.resolved).length : (reclaimedThisMonth || 0), icon: PackageCheck, bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
  ];

  return (
    <div className="space-y-12">
      <HeaderActions>
        <AddRewashDialog />
      </HeaderActions>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-sm transition-all group">
            <div className="flex items-start justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</span>
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <s.icon className={`h-4 w-4 ${s.iconColor}`} />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tighter">
              {s.value}
            </div>
          </div>
        ))}

        <div className="bg-white rounded-xl border border-slate-200 p-6 hover:shadow-sm transition-all group">
          <div className="flex items-start justify-between mb-4">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{t('rewash.extraCost')}</span>
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center group-hover:scale-105 transition-transform">
              <Receipt className="h-4 w-4 text-orange-500" />
            </div>
          </div>
          <div className="text-2xl font-bold text-slate-900 tabular-nums tracking-tighter">
            ฿{extraCostThisMonth.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('rewash.activeQueue')}</h3>
        <RewashQueue queueItems={activeQueue} />
      </div>

      <div className="space-y-4 mt-8 pt-8 border-t">
        <h3 className="text-lg font-semibold">{t('rewash.historicalReport')}</h3>
        <RewashChartsWrapper allRecords={records} />
      </div>
    </div>
  );
}
