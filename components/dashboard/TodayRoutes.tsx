import { createClient } from '@/lib/supabase/server';
import { getServerT } from '@/lib/i18n/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Truck } from 'lucide-react';
import { format } from 'date-fns';

export async function TodayRoutes() {
  const supabase = await createClient();
  const { t } = await getServerT();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const { data: routes } = await supabase
    .from('routes')
    .select('*')
    .gte('created_at', today.toISOString())
    .lt('created_at', tomorrow.toISOString())
    .order('created_at', { ascending: false });

  const statusBadge: Record<string, string> = {
    active: 'bg-emerald-100 text-emerald-700',
    completed: 'bg-indigo-100 text-indigo-700',
    pending: 'bg-amber-100 text-amber-700',
  };

  const statusLabel: Record<string, string> = {
    active: t('status.active'),
    completed: t('status.completed'),
    pending: t('status.pending'),
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Truck className="w-4 h-4" />
          {t('dashboard.todaysRoutes')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pb-4">
        {(!routes || routes.length === 0) ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <Truck className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400 font-medium">{t('routes.noRoutesCard')}</p>
            <p className="text-xs text-slate-300 mt-0.5">{t('routes.createFromLogistics')}</p>
          </div>
        ) : (
          <div className="space-y-2">
            {routes.map(r => (
              <div key={r.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                <div className="min-w-0">
                  <p className="font-medium text-sm text-slate-800 truncate">{r.name}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {r.vehicle_plate || t('routes.noVehicle')} · {r.stops ? r.stops.length : 0} {t('routes.stops')}
                  </p>
                </div>
                <span className={`ml-3 shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadge[r.status] || 'bg-slate-100 text-slate-500'}`}>
                  {statusLabel[r.status] || r.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
