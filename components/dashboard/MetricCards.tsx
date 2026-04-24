import { createClient } from '@/lib/supabase/server';
import { MetricDisplay, MetricValues } from './MetricDisplay';
import { getDemoData } from '@/lib/demo/server-data';

export async function MetricCards() {
  const supabase = await createClient();

  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId: string = orgData
    || (await supabase.from('organizations').select('id').limit(1).single()).data?.id
    || '';

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthISO = monthStart.toISOString();

  const [
    { count: cleanReady },
    { count: outWithClients },
    { count: inProduction },
    { count: inRewash },
  ] = await Promise.all([
    // Clean & Ready
    supabase
      .from('linen_items')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'clean'),

    // Out with Clients
    supabase
      .from('linen_items')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'out'),

    // In Production
    supabase
      .from('linen_items')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .in('status', ['dirty', 'washing', 'drying', 'folding']),

    // In Rewash
    supabase
      .from('linen_items')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'rewash'),

  ]);

  const lostByUpdated = await supabase
    .from('linen_items')
    .select('*', { count: 'exact', head: true })
    .eq('org_id', orgId)
    .eq('status', 'lost')
    .gte('updated_at', monthISO);

  const lostMonth = lostByUpdated.error
    ? await supabase
        .from('linen_items')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .eq('status', 'lost')
        .gte('created_at', monthISO)
    : lostByUpdated;

  const initial: MetricValues = {
    cleanReady: cleanReady ?? 0,
    outWithClients: outWithClients ?? 0,
    inProduction: inProduction ?? 0,
    inRewash: inRewash ?? 0,
    lostMonth: lostMonth.count ?? 0,
  };

  const totalLiveValues = Object.values(initial).reduce((sum, value) => sum + value, 0);

  return <MetricDisplay initial={totalLiveValues > 0 ? initial : getDemoData().metrics} />;
}
