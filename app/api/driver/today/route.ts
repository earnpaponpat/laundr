import { NextRequest, NextResponse } from 'next/server';
import { canUseDriverApp, getDriverContext } from '@/lib/driver/context';

export async function GET(req: NextRequest) {
  try {
    const ctx = await getDriverContext();
    if (!ctx) {
      return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
    }

    if (!canUseDriverApp(ctx.role)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 });
    }

    const scope = req.nextUrl.searchParams.get('scope');
    const requestedDriverId = req.nextUrl.searchParams.get('driver_id');
    const today = new Date().toISOString().slice(0, 10);

    let driverId = ctx.userId;
    if ((ctx.role === 'admin' || ctx.role === 'manager') && scope === 'org' && requestedDriverId) {
      driverId = requestedDriverId;
    }

    const tripQuery = ctx.supabase
      .from('delivery_trips')
      .select('id, status, scheduled_date, started_at, completed_at, driver_id, profiles(full_name)')
      .eq('org_id', ctx.orgId)
      .eq('scheduled_date', today)
      .order('created_at', { ascending: true });

    const { data: trips, error: tripError } = (scope === 'org' && (ctx.role === 'admin' || ctx.role === 'manager'))
      ? await tripQuery
      : await tripQuery.eq('driver_id', driverId);

    if (tripError) {
      return NextResponse.json({ error: tripError.message }, { status: 500 });
    }

    const tripIds = (trips || []).map((trip) => trip.id);

    const { data: stops, error: stopError } = tripIds.length > 0
      ? await ctx.supabase
          .from('trip_stops')
          .select('id, trip_id, stop_no, status, order_id, client_id, expected_deliver_count, expected_collect_count, delivered_count, collected_count, delivered_at, completed_at, clients(name)')
          .eq('org_id', ctx.orgId)
          .in('trip_id', tripIds)
          .order('stop_no', { ascending: true })
      : { data: [], error: null };

    if (stopError) {
      return NextResponse.json({ error: stopError.message }, { status: 500 });
    }

    const payload = (trips || []).map((trip) => {
      const tripStops = (stops || []).filter((stop) => stop.trip_id === trip.id).map((stop) => {
        const clientRef = stop.clients as unknown;
        const clientName = Array.isArray(clientRef)
          ? (clientRef[0] as { name?: string } | undefined)?.name || 'Client'
          : (clientRef as { name?: string } | null)?.name || 'Client';

        return {
          id: stop.id,
          stop_no: stop.stop_no,
          status: stop.status,
          order_id: stop.order_id,
          client_id: stop.client_id,
          client_name: clientName,
          expected_deliver_count: Number(stop.expected_deliver_count || 0),
          expected_collect_count: Number(stop.expected_collect_count || 0),
          delivered_count: Number(stop.delivered_count || 0),
          collected_count: Number(stop.collected_count || 0),
          delivered_at: stop.delivered_at,
          completed_at: stop.completed_at,
        };
      });

      const profileRef = trip.profiles as unknown;
      const driverName = Array.isArray(profileRef)
        ? (profileRef[0] as { full_name?: string } | undefined)?.full_name || 'Driver'
        : (profileRef as { full_name?: string } | null)?.full_name || 'Driver';

      return {
        id: trip.id,
        status: trip.status,
        scheduled_date: trip.scheduled_date,
        started_at: trip.started_at,
        completed_at: trip.completed_at,
        driver_id: trip.driver_id,
        driver_name: driverName,
        stops: tripStops,
      };
    });

    return NextResponse.json({
      date: today,
      role: ctx.role,
      driver_id: driverId,
      trips: payload,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
