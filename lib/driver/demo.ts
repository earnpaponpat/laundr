import { getDemoData } from '@/lib/demo/server-data';

export type DemoDriverStop = {
  id: string;
  trip_id: string;
  stop_no: number;
  status: string;
  client_id: string;
  client_name: string;
  order_id: string | null;
  order_number: string | null;
  expected_deliver_count: number;
  expected_collect_count: number;
  delivered_count: number;
  collected_count: number;
  delivered_tags: string[];
  collected_tags: string[];
  outbound_batch_id: string | null;
};

export type DemoDriverTrip = {
  id: string;
  status: string;
  scheduled_date: string;
  started_at: string | null;
  completed_at: string | null;
  driver_id: string;
  driver_name: string;
  stops: DemoDriverStop[];
};

type DemoDriverStopDetail = {
  stop: DemoDriverStop & {
    trip_status: string;
    scheduled_date: string;
  };
  items: Array<{
    category_id: string;
    category_name: string;
    deliver_qty: number;
    requested_qty: number;
    returned_qty: number;
  }>;
};

export function isDriverDemoBypassEnabled() {
  return process.env.NEXT_PUBLIC_DRIVER_DEMO_BYPASS !== 'false';
}

export function getDemoDriverProfile() {
  const data = getDemoData();
  return data.drivers[0] || { id: 'demo-driver-1', full_name: 'Demo Driver' };
}

export function getDemoDriverTodayPayload() {
  const data = getDemoData();
  const driver = getDemoDriverProfile();
  const today = new Date().toISOString().slice(0, 10);

  const candidateOrders = data.orders
    .filter((order) => order.driver_id === driver.id)
    .slice(0, 3);

  const fallbackOrders = candidateOrders.length > 0 ? candidateOrders : data.orders.slice(0, 3);

  const stops = fallbackOrders.map((order, index) => {
    const client = data.clients.find((row) => row.id === order.client_id) || data.clients[index % data.clients.length];
    const lines = data.orderLines.filter((row) => row.order_id === order.id);
    const expectedDeliver = lines.reduce((sum, row) => sum + Math.max(row.picked_qty, row.requested_qty), 0);
    const deliveredCount = index === 0 ? Math.max(18, Math.floor(expectedDeliver * 0.36)) : 0;
    const collectedCount = index === 0 ? Math.floor(deliveredCount * 0.72) : 0;

    return {
      id: `demo-stop-${index + 1}`,
      trip_id: 'demo-trip-1',
      stop_no: index + 1,
      status: index === 0 ? 'active' : 'pending',
      client_id: client.id,
      client_name: client.name,
      order_id: order.id,
      order_number: order.order_number,
      expected_deliver_count: expectedDeliver,
      expected_collect_count: Math.max(0, Math.floor(expectedDeliver * (index === 0 ? 0.82 : 0.9))),
      delivered_count: deliveredCount,
      collected_count: collectedCount,
      delivered_tags: [],
      collected_tags: [],
      outbound_batch_id: `demo-outbound-batch-${index + 1}`,
    };
  });

  const trips: DemoDriverTrip[] = [{
    id: 'demo-trip-1',
    status: 'active',
    scheduled_date: today,
    started_at: new Date(Date.now() - 45 * 60 * 1000).toISOString(),
    completed_at: null,
    driver_id: driver.id,
    driver_name: driver.full_name,
    stops,
  }];

  return {
    date: today,
    role: 'driver' as const,
    driver_id: driver.id,
    trips,
  };
}

export function getDemoDriverActiveStopHref() {
  const payload = getDemoDriverTodayPayload();
  const activeStop = payload.trips.flatMap((trip) => trip.stops).find((stop) => stop.status !== 'completed');
  return activeStop ? `/driver/stop/${activeStop.id}` : '/driver';
}

export function getDemoDriverStopDetail(stopId: string): DemoDriverStopDetail | null {
  const data = getDemoData();
  const payload = getDemoDriverTodayPayload();
  const trip = payload.trips[0];
  const stop = trip?.stops.find((row) => row.id === stopId);
  if (!stop) return null;

  const lines = data.orderLines
    .filter((row) => row.order_id === stop.order_id)
    .map((row) => {
      const category = data.categories.find((item) => item.id === row.category_id);
      return {
        category_id: row.category_id,
        category_name: category?.name || row.category_id,
        deliver_qty: Math.max(row.picked_qty, row.requested_qty),
        requested_qty: row.requested_qty,
        returned_qty: row.returned_qty,
      };
    });

  return {
    stop: {
      ...stop,
      trip_status: trip.status,
      scheduled_date: trip.scheduled_date,
    },
    items: lines,
  };
}
