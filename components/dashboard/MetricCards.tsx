import { createClient } from '@/lib/supabase/server';
import { MetricDisplay, MetricValues } from './MetricDisplay';

export async function MetricCards() {
  const supabase = await createClient();

  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId: string = orgData
    || (await supabase.from('organizations').select('id').limit(1).single()).data?.id
    || '';

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayISO = today.toISOString();

  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);
  const monthISO = monthStart.toISOString();

  const [
    { count: totalInventory },
    { count: outToday },
    { count: returnedToday },
    { count: rewashToday },
    { count: lostMonth },
  ] = await Promise.all([
    // Total inventory — exclude rejected items, filter by org
    supabase
      .from('linen_items')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .neq('status', 'rejected'),

    // Out today — checkout events today
    supabase
      .from('scan_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', 'checkout')
      .gte('created_at', todayISO),

    // Returned today — checkin events today
    supabase
      .from('scan_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', 'checkin')
      .gte('created_at', todayISO),

    // Rewash today — rewash events today
    supabase
      .from('scan_events')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('event_type', 'rewash')
      .gte('created_at', todayISO),

    // Lost this month
    supabase
      .from('linen_items')
      .select('*', { count: 'exact', head: true })
      .eq('org_id', orgId)
      .eq('status', 'lost')
      .gte('updated_at', monthISO),
  ]);

  const initial: MetricValues = {
    totalInventory: totalInventory ?? 0,
    outToday: outToday ?? 0,
    returnedToday: returnedToday ?? 0,
    rewashToday: rewashToday ?? 0,
    lostMonth: lostMonth ?? 0,
  };

  return <MetricDisplay orgId={orgId} initial={initial} />;
}
