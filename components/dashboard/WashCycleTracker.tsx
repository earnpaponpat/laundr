import { createClient } from '@/lib/supabase/server';
import { getServerT } from '@/lib/i18n/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

export async function WashCycleTracker() {
  const supabase = await createClient();
  const { t } = await getServerT();

  const { data: categories } = await supabase.from('linen_categories').select('*');

  const stats = await Promise.all((categories || []).map(async (cat) => {
    const { count: nearEOL } = await supabase
      .from('linen_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id)
      .gt('wash_count', 160);

    const { count: total } = await supabase
      .from('linen_items')
      .select('id', { count: 'exact', head: true })
      .eq('category_id', cat.id);

    const nearEOLCount = nearEOL || 0;
    const totalCount = total || 0;
    const percentage = totalCount > 0 ? Math.round((nearEOLCount / totalCount) * 100) : 0;

    return { ...cat, nearEOLCount, totalCount, percentage };
  }));

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
          {t('dashboard.nearEndOfLife')}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pb-4">
        {stats.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">{t('ai.noCategoryData')}</p>
        ) : (
          <div className="space-y-4">
            {stats.map(stat => (
              <div key={stat.id} className="space-y-1.5">
                <div className="flex justify-between items-center text-sm font-medium">
                  <span className="truncate pr-2 text-slate-700">{stat.name}</span>
                  <span className={`text-xs font-bold tabular-nums ${stat.percentage > 20 ? 'text-red-500' : 'text-slate-500'}`}>
                    {stat.nearEOLCount} {t('ai.items')}
                  </span>
                </div>
                <Progress value={stat.percentage} indicatorClassName="bg-amber-500" />
                <p className="text-xs text-slate-400">{stat.percentage}{t('ai.nearEol')}</p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
