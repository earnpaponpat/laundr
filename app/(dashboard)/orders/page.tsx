import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { HeaderActions } from '@/components/dashboard/HeaderActions';
import { CreateOrderDialog } from '@/components/orders/CreateOrderDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ClipboardList } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { getDemoData } from '@/lib/demo/server-data';

const tabs = [
  { key: 'all', label: 'All' },
  { key: 'draft', label: 'Draft' },
  { key: 'picking', label: 'Picking' },
  { key: 'ready', label: 'Ready' },
  { key: 'dispatched', label: 'Dispatched' },
  { key: 'completed', label: 'Completed' },
] as const;

type TabKey = (typeof tabs)[number]['key'];

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const currentTab = (typeof params.status === 'string' ? params.status : 'all') as TabKey;
  const demoData = getDemoData();

  const supabase = await createClient();
  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId =
    orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';

  const { data: ordersData, error: ordersError } = await supabase
    .from('delivery_orders')
    .select('id, order_number, scheduled_date, status, vehicle_plate, client_id, driver_id')
    .eq('org_id', orgId || '00000000-0000-0000-0000-000000000000')
    .order('scheduled_date', { ascending: false })
    .order('created_at', { ascending: false });

  const orders = ordersData || [];
  const useDemoData = !orgId || !orders.length;
  const displayOrders = useDemoData ? demoData.orders : orders;

  const clientIds = Array.from(
    new Set(displayOrders.map((order) => order.client_id).filter((id): id is string => Boolean(id)))
  );
  const driverIds = Array.from(
    new Set(displayOrders.map((order) => order.driver_id).filter((id): id is string => Boolean(id)))
  );
  const orderIds = displayOrders.map((order) => order.id);

  const [clientsRes, driversRes, linesRes] = await Promise.all([
    useDemoData
      ? Promise.resolve({ data: demoData.clients.map((client) => ({ id: client.id, name: client.name })) })
      : clientIds.length
      ? supabase.from('clients').select('id, name').in('id', clientIds)
      : Promise.resolve({ data: [] as Array<{ id: string; name: string }> }),
    useDemoData
      ? Promise.resolve({ data: demoData.drivers })
      : driverIds.length
      ? supabase.from('profiles').select('id, full_name').in('id', driverIds)
      : Promise.resolve({ data: [] as Array<{ id: string; full_name: string | null }> }),
    useDemoData
      ? Promise.resolve({ data: demoData.orderLines })
      : orderIds.length
      ? supabase.from('delivery_order_items').select('order_id, requested_qty, picked_qty').in('order_id', orderIds)
      : Promise.resolve({ data: [] as Array<{ order_id: string; requested_qty: number; picked_qty: number }> }),
  ]);

  const clientMap = new Map((clientsRes.data || []).map((client) => [client.id, client.name]));
  const driverMap = new Map((driversRes.data || []).map((driver) => [driver.id, driver.full_name || '-']));
  const linesByOrder = new Map<string, Array<{ requested_qty: number; picked_qty: number }>>();
  for (const line of linesRes.data || []) {
    const list = linesByOrder.get(line.order_id) || [];
    list.push({ requested_qty: Number(line.requested_qty || 0), picked_qty: Number(line.picked_qty || 0) });
    linesByOrder.set(line.order_id, list);
  }

  const filteredOrders = displayOrders.filter((order) => {
    if (currentTab === 'all') return true;
    return order.status === currentTab;
  });

  return (
    <div className="space-y-8">
      <HeaderActions>
        <CreateOrderDialog />
      </HeaderActions>

      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <ClipboardList className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Delivery Orders</h2>
          <p className="text-sm text-slate-500">Plan, pick, dispatch, and reconcile outbound deliveries.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const active = tab.key === currentTab;
          const href = tab.key === 'all' ? '/orders' : `/orders?status=${tab.key}`;
          return (
            <Link
              key={tab.key}
              href={href}
              className={
                active
                  ? 'px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold'
                  : 'px-4 py-2 rounded-lg bg-white border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50'
              }
            >
              {tab.label}
            </Link>
          );
        })}
      </div>

      {filteredOrders.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-2xl p-12 text-center text-slate-500">
          <p className="text-lg font-semibold text-slate-700">No delivery orders yet.</p>
          <p className="text-sm mt-1">Create your first order →</p>
          {ordersError ? (
            <p className="text-xs mt-3 text-red-600">Query error: {ordersError.message}</p>
          ) : null}
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm shadow-slate-200/50">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order #</TableHead>
                <TableHead>Client</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Items (picked/total)</TableHead>
                <TableHead>Driver</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredOrders.map((order) => {
                const itemLines = linesByOrder.get(order.id) || [];
                const requested = itemLines.reduce((sum, line) => sum + Number(line.requested_qty || 0), 0);
                const picked = itemLines.reduce((sum, line) => sum + Number(line.picked_qty || 0), 0);

                return (
                  <TableRow key={order.id}>
                    <TableCell className="font-semibold text-slate-900">{order.order_number}</TableCell>
                    <TableCell>{clientMap.get(order.client_id || '') || '-'}</TableCell>
                    <TableCell>{order.scheduled_date}</TableCell>
                    <TableCell>
                      <span className="tabular-nums">
                        {picked}/{requested}
                      </span>
                    </TableCell>
                    <TableCell>{driverMap.get(order.driver_id || '') || '-'}</TableCell>
                    <TableCell>
                      <StatusBadge status={order.status} />
                    </TableCell>
                    <TableCell className="text-right">
                      <Link
                        href={`/orders/${order.id}`}
                        className="inline-flex items-center px-3 py-1.5 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        Open
                      </Link>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
