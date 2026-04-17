import { createClient } from "@/lib/supabase/server";
import { getServerT } from "@/lib/i18n/server";
import { RouteDetailSheetWrapper } from "@/components/dashboard/RouteDetailSheetWrapper";
import { NewRouteDialog } from "@/components/dashboard/NewRouteDialog";
import { HeaderActions } from "@/components/dashboard/HeaderActions";
import { Truck, MapPin, CheckCircle, Package } from "lucide-react";
import { startOfDay, endOfDay } from "date-fns";

export const metadata = {
  title: 'Logistics & Routes | Laundr',
};

export default async function RoutesPage() {
  const supabase = await createClient();
  const { t } = await getServerT();

  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;

  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const { data: routes } = await supabase
    .from('routes')
    .select('*, profiles(full_name)')
    .eq('org_id', orgId)
    .gte('scheduled_at', todayStart)
    .lte('scheduled_at', todayEnd)
    .order('scheduled_at', { ascending: true });

  const activeCount = routes?.filter(r => r.status === 'active').length || 0;
  const completedCount = routes?.filter(r => r.status === 'completed').length || 0;
  const totalStops = routes?.reduce((acc, r) => acc + (Array.isArray(r.stops) ? r.stops.length : 0), 0) || 0;
  const totalItems = routes?.reduce((acc, r) => {
    const stops = Array.isArray(r.stops) ? r.stops : [];
    return acc + stops.reduce((a: number, s: { item_count?: number }) => a + (s.item_count || 0), 0);
  }, 0) || 0;

  const stats = [
    { label: t('routes.inTransit'), value: activeCount, icon: Truck, bg: 'bg-indigo-50', iconColor: 'text-indigo-500' },
    { label: t('routes.completed'), value: completedCount, icon: CheckCircle, bg: 'bg-emerald-50', iconColor: 'text-emerald-500' },
    { label: t('routes.totalStops'), value: totalStops, icon: MapPin, bg: 'bg-slate-50', iconColor: 'text-slate-400' },
    { label: t('routes.totalLoad'), value: totalItems.toLocaleString(), icon: Package, bg: 'bg-slate-50', iconColor: 'text-slate-400' },
  ];

  return (
    <div className="space-y-10">
      <HeaderActions>
        <NewRouteDialog />
      </HeaderActions>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="bg-white rounded-xl p-5 shadow-sm shadow-slate-200/50 hover:shadow-md transition-shadow duration-200 group">
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
      </div>

      <div className="space-y-4">
        <h3 className="text-sm font-bold uppercase text-slate-400 tracking-widest">{t('routes.liveMonitor')}</h3>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {(routes || []).map(route => (
            <RouteDetailSheetWrapper key={route.id} route={route} />
          ))}
          {(!routes || routes.length === 0) && (
            <div className="col-span-full py-12 bg-slate-50 border-2 border-dashed rounded-2xl text-center text-slate-400">
              <Truck className="w-12 h-12 mx-auto mb-3 opacity-20" />
              <p className="font-medium">{t('routes.noRoutesToday')}</p>
              <p className="text-xs">{t('routes.createRoute')}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
