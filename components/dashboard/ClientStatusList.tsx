import { createClient } from '@/lib/supabase/server';
import { getServerT } from '@/lib/i18n/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { getDemoData } from '@/lib/demo/server-data';

export async function ClientStatusList() {
  const supabase = await createClient();
  const { t } = await getServerT();

  const { data: clients } = await supabase.from('clients').select('*').eq('active', true);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const clientStats = await Promise.all((clients || []).map(async (client) => {
    const { count: checkoutCount } = await supabase
      .from('scan_events')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('event_type', 'checkout')
      .gte('created_at', today.toISOString());

    const { count: checkinCount } = await supabase
      .from('scan_events')
      .select('id', { count: 'exact', head: true })
      .eq('client_id', client.id)
      .eq('event_type', 'checkin')
      .gte('created_at', today.toISOString());

    const outCount = checkoutCount || 0;
    const inCount = checkinCount || 0;
    let rate = 100;
    if (outCount > 0) {
      rate = Math.min(Math.round((inCount / outCount) * 100), 100);
    } else if (inCount === 0) {
      rate = 0;
    }

    return { ...client, returnRate: rate, inCount, outCount };
  }));

  const displayStats = clientStats.length > 0 ? clientStats : getDemoData().clientStats;

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-md">{t('dashboard.clientReturnRates')}</CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto">
        <div className="space-y-4">
          {displayStats.map(client => {
            let colorClass = "bg-green-500";
            if (client.returnRate < 90) colorClass = "bg-red-500";
            else if (client.returnRate < 98) colorClass = "bg-amber-500";

            return (
              <div key={client.id} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="truncate pr-2">{client.name}</span>
                  <span>{client.returnRate}%</span>
                </div>
                <Progress value={client.returnRate} indicatorClassName={colorClass} />
                <div className="flex justify-between text-xs text-slate-500">
                  <span>{t('common.in')}: {client.inCount}</span>
                  <span>{t('common.out')}: {client.outCount}</span>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
