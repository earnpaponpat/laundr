import { notFound } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { OrderWorkflowClient } from '@/components/orders/OrderWorkflowClient';
import { PickingInterface } from '@/components/orders/PickingInterface';
import { getDemoOrderDetail, getDemoData } from '@/lib/demo/server-data';

type RecentScan = {
  id: string;
  rfid_tag_id: string;
  event_type: string;
  created_at: string;
  gate_id: string | null;
  source: string | null;
};

export default async function OrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();
  const demoDetail = getDemoOrderDetail(id);
  const demoData = getDemoData();

  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId =
    orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';

  const { data: order } = await supabase
    .from('delivery_orders')
    .select('id, order_number, status, scheduled_date, vehicle_plate, client_id, driver_id, org_id')
    .eq('id', id)
    .eq('org_id', orgId || '00000000-0000-0000-0000-000000000000')
    .maybeSingle();

  const fallbackOrder =
    order ||
    (
      await supabase
        .from('delivery_orders')
        .select('id, order_number, status, scheduled_date, vehicle_plate, client_id, driver_id, org_id')
        .eq('id', id)
        .maybeSingle()
    ).data;

  if (!fallbackOrder && !demoDetail) {
    notFound();
  }

  const orderRow = fallbackOrder || demoDetail!.order;

  const [{ data: clientData }, { data: driverData }] = await Promise.all([
    !fallbackOrder && demoDetail
      ? Promise.resolve({ data: { name: demoDetail.client?.name } })
      : orderRow.client_id
      ? supabase.from('clients').select('name').eq('id', orderRow.client_id).maybeSingle()
      : Promise.resolve({ data: null } as { data: { name?: string } | null }),
    !fallbackOrder && demoDetail
      ? Promise.resolve({ data: { full_name: demoDetail.driver?.full_name } })
      : orderRow.driver_id
      ? supabase.from('profiles').select('full_name').eq('id', orderRow.driver_id).maybeSingle()
      : Promise.resolve({ data: null } as { data: { full_name?: string } | null }),
  ]);

  const { data: authData } = await supabase.auth.getUser();
  const startedBy = authData.user?.id || undefined;

  const { data: items } = fallbackOrder
    ? await supabase
        .from('delivery_order_items')
        .select('category_id, requested_qty, picked_qty, returned_qty, linen_categories(name)')
        .eq('order_id', id)
        .order('created_at', { ascending: true })
    : { data: null };

  const lines = fallbackOrder ? (items || []).map((row) => {
    const categoryRef = row.linen_categories as unknown;
    const categoryName = Array.isArray(categoryRef)
      ? (categoryRef[0] as { name?: string } | undefined)?.name
      : (categoryRef as { name?: string } | null)?.name;

    return {
      category_id: row.category_id,
      category_name: categoryName || row.category_id,
      requested: Number(row.requested_qty || 0),
      picked: Number(row.picked_qty || 0),
      returned: Number(row.returned_qty || 0),
    };
  }) : (demoDetail?.lines || []);

  const summary = {
    requested: lines.reduce((sum, line) => sum + line.requested, 0),
    picked: lines.reduce((sum, line) => sum + line.picked, 0),
    returned: lines.reduce((sum, line) => sum + line.returned, 0),
    missing: Math.max(
      lines.reduce((sum, line) => sum + line.picked, 0) - lines.reduce((sum, line) => sum + line.returned, 0),
      0
    ),
    in_rewash: 0,
    missing_tags: [] as string[],
  };

  const initialCompletion: Record<string, { picked: number; requested: number; pct: number; complete: boolean }> =
    lines.reduce((acc, line) => {
      acc[line.category_name] = {
        picked: line.picked,
        requested: line.requested,
        pct: line.requested > 0 ? Math.min(100, Math.round((line.picked / line.requested) * 100)) : 0,
        complete: line.requested > 0 ? line.picked >= line.requested : false,
      };
      return acc;
    }, {} as Record<string, { picked: number; requested: number; pct: number; complete: boolean }>);

  const { data: batches } = fallbackOrder
    ? await supabase
        .from('delivery_batches')
        .select('id, batch_type')
        .eq('org_id', orderRow.org_id)
        .eq('order_id', orderRow.id)
        .order('created_at', { ascending: false })
    : { data: [] };

  const outboundBatch = (batches || []).find((batch) => batch.batch_type === 'outbound') || null;

  const { data: activeSession } = fallbackOrder
    ? await supabase
        .from('active_sessions')
        .select('id, batch_id, session_type, is_active')
        .eq('org_id', orderRow.org_id)
        .eq('order_id', orderRow.id)
        .eq('is_active', true)
        .eq('session_type', 'picking')
        .order('started_at', { ascending: false })
        .limit(1)
        .maybeSingle()
    : { data: null };

  const recentScans = fallbackOrder && outboundBatch
    ? (
        await supabase
          .from('scan_events')
          .select('id, rfid_tag_id, event_type, created_at, gate_id, source')
          .eq('org_id', orderRow.org_id)
          .eq('batch_id', outboundBatch.id)
          .order('created_at', { ascending: false })
          .limit(10)
      ).data || []
    : demoData.inventoryItems.slice(0, 10).map((item, index) => ({
        id: `scan-${index + 1}`,
        rfid_tag_id: item.rfid_tag_id,
        event_type: index % 2 === 0 ? 'checkout' : 'checkin',
        created_at: item.last_scan_at,
        gate_id: index % 2 === 0 ? 'gate_a' : 'gate_b',
        source: 'demo',
      }));

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm shadow-slate-200/40">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="space-y-2">
            <div className="text-xs uppercase tracking-[0.2em] text-slate-400 font-bold">Order Detail</div>
            <h2 className="text-2xl font-bold text-slate-900 tracking-tight">{orderRow.order_number}</h2>
            <div className="text-sm text-slate-500">
              Client: {clientData?.name || '-'} | Date: {orderRow.scheduled_date}
            </div>
          </div>
          <StatusBadge status={orderRow.status} />
        </div>
      </div>

      <OrderWorkflowClient
        orgId={orderRow.org_id}
        orderId={orderRow.id}
        orderStatus={orderRow.status}
        batchId={outboundBatch?.id ?? null}
        orderNumber={orderRow.order_number}
        clientName={clientData?.name || '-'}
        driverName={driverData?.full_name || '-'}
        vehiclePlate={orderRow.vehicle_plate || '-'}
        lines={lines}
        summary={summary}
        recentScans={(recentScans || []) as RecentScan[]}
        disablePickingUi={orderRow.status === 'draft' || orderRow.status === 'picking'}
      />

      {(orderRow.status === 'draft' || orderRow.status === 'picking') ? (
        <PickingInterface
          orgId={orderRow.org_id}
          orderId={orderRow.id}
          orderNumber={orderRow.order_number}
          clientName={clientData?.name || '-'}
          startedBy={startedBy}
          initialSessionId={activeSession?.id ?? null}
          initialBatchId={(activeSession?.batch_id as string | null) ?? outboundBatch?.id ?? null}
          initialCompletion={initialCompletion}
        />
      ) : null}
    </div>
  );
}
