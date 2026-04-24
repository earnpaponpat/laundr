import Link from 'next/link';
import { Truck } from 'lucide-react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { canUseDriverApp, getDriverContext } from '@/lib/driver/context';
import { translations } from '@/lib/i18n/translations';

function thaiDateLabel(date: Date) {
  const months = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

function englishDateLabel(date: Date) {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  }).format(date);
}

export default async function DriverTodayPage() {
  const cookieStore = await cookies();
  const lang = cookieStore.get('laundr_lang')?.value === 'th' ? 'th' : 'en';
  const text = translations[lang].driver;
  const ctx = await getDriverContext();
  if (!ctx) redirect('/driver/login');
  if (!canUseDriverApp(ctx.role)) redirect('/dashboard');

  const todayDate = new Date();
  const today = todayDate.toISOString().slice(0, 10);

  const { data: trips } = await ctx.supabase
    .from('delivery_trips')
    .select('id, status, scheduled_date')
    .eq('org_id', ctx.orgId)
    .eq('driver_id', ctx.userId)
    .eq('scheduled_date', today)
    .order('created_at', { ascending: true });

  const tripIds = (trips || []).map((trip) => trip.id);

  const { data: stops } = tripIds.length > 0
    ? await ctx.supabase
        .from('trip_stops')
        .select('id, trip_id, stop_no, status, expected_deliver_count, expected_collect_count, delivered_count, collected_count, delivered_at, clients(name)')
        .eq('org_id', ctx.orgId)
        .in('trip_id', tripIds)
        .order('stop_no', { ascending: true })
    : { data: [] as Array<Record<string, unknown>> };

  const stopRows = (stops || []).map((stop) => {
    const clientRef = stop.clients as unknown;
    const clientName = Array.isArray(clientRef)
      ? (clientRef[0] as { name?: string } | undefined)?.name || 'Client'
      : (clientRef as { name?: string } | null)?.name || 'Client';

    return {
      id: String(stop.id),
      stopNo: Number(stop.stop_no || 0),
      status: String(stop.status || 'pending'),
      clientName,
      expectedDeliver: Number(stop.expected_deliver_count || 0),
      expectedCollect: Number(stop.expected_collect_count || 0),
      deliveredCount: Number(stop.delivered_count || 0),
      collectedCount: Number(stop.collected_count || 0),
      deliveredAt: (stop.delivered_at as string | null) || null,
    };
  });

  const totalStops = stopRows.length;
  const totalItems = stopRows.reduce((sum, row) => sum + row.expectedDeliver, 0);
  const dateLabel = lang === 'th' ? thaiDateLabel(todayDate) : englishDateLabel(todayDate);

  const statusStyle: Record<string, string> = {
    pending: 'bg-slate-700 text-slate-200',
    active: 'bg-indigo-500 text-white animate-pulse',
    completed: 'bg-emerald-500 text-white',
  };

  return (
    <div className="space-y-4 pb-4">
      <div className="rounded-2xl bg-[#17213B] p-4">
        <h1 className="text-2xl font-bold">{text.today.todayLabel} — {dateLabel}</h1>
        <p className="mt-2 text-sm text-slate-300">
          {totalStops} {text.today.stops} · {totalItems} {text.today.items}
        </p>
      </div>

      {stopRows.length === 0 ? (
        <div className="flex min-h-[55vh] flex-col items-center justify-center rounded-2xl border border-white/10 bg-[#141E34] px-6 text-center">
          <Truck className="h-20 w-20 text-slate-500" />
          <p className="mt-5 text-3xl font-semibold text-slate-200">{text.today.noTripsTitle}</p>
          <p className="mt-2 text-lg text-slate-400">{text.today.noTripsSubtitle}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stopRows.map((stop) => (
            <Link
              key={stop.id}
              href={`/driver/stop/${stop.id}`}
              className="block rounded-2xl border border-white/10 bg-[#17213B] p-4 active:scale-[0.99]"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-2xl font-semibold leading-tight">
                    {stop.stopNo} {stop.clientName}
                  </p>
                  <p className="mt-2 text-lg text-slate-200">
                    {text.today.deliver} {stop.expectedDeliver} {text.today.items}
                    {stop.expectedCollect > 0
                      ? ` · ${text.today.collect} ${stop.expectedCollect}`
                      : ''}
                  </p>
                </div>
                <span className={`rounded-full px-3 py-1 text-sm font-semibold ${statusStyle[stop.status] || statusStyle.pending}`}>
                  {stop.status === 'completed'
                    ? `✓ ${text.today.completed}${stop.deliveredAt ? ` ${new Date(stop.deliveredAt).toLocaleTimeString(lang === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' })}` : ''}`
                    : stop.status === 'active'
                      ? text.today.active
                      : text.today.pending}
                </span>
              </div>
              {stop.status !== 'completed' ? (
                <div className="mt-4 text-right text-lg font-semibold text-indigo-300">
                  {text.today.start} →
                </div>
              ) : null}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
