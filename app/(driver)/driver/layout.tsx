import { redirect } from 'next/navigation';
import { DriverShell } from '@/components/driver/DriverShell';
import { getDemoDriverActiveStopHref } from '@/lib/driver/demo';
import { canUseDriverApp, getDriverContext } from '@/lib/driver/context';

export default async function DriverLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const ctx = await getDriverContext();

  if (!ctx) {
    redirect('/driver/login');
  }

  if (!canUseDriverApp(ctx.role)) {
    redirect('/dashboard');
  }

  if (ctx.demoMode || !ctx.supabase) {
    return (
      <DriverShell driverName={ctx.fullName} activeStopHref={getDemoDriverActiveStopHref()} demoMode>
        {children}
      </DriverShell>
    );
  }

  const today = new Date().toISOString().slice(0, 10);
  const { data: trips } = await ctx.supabase
    .from('delivery_trips')
    .select('id')
    .eq('org_id', ctx.orgId)
    .eq('driver_id', ctx.userId)
    .eq('scheduled_date', today);

  const tripIds = (trips || []).map((row) => row.id);

  const { data: activeStop } = tripIds.length > 0
    ? await ctx.supabase
        .from('trip_stops')
        .select('id')
        .eq('org_id', ctx.orgId)
        .in('trip_id', tripIds)
        .in('status', ['active', 'pending'])
        .order('stop_no', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const activeStopHref = activeStop?.id ? `/driver/stop/${activeStop.id}` : '/driver';

  return (
    <DriverShell driverName={ctx.fullName} activeStopHref={activeStopHref} demoMode={Boolean(ctx.demoMode)}>
      {children}
    </DriverShell>
  );
}
