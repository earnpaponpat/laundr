import { createClient } from '@/lib/supabase/server';
import { Factory } from 'lucide-react';
import { ProductionQueueClient, type ProductionBatchView } from '@/components/production/ProductionQueueClient';
import { ParLevelAlertWidget } from '@/components/production/ParLevelAlertWidget';
import { getDemoData } from '@/lib/demo/server-data';

export const metadata = {
  title: 'Production Queue | Laundr',
};

export default async function ProductionPage() {
  const supabase = await createClient();
  const demoData = getDemoData();
  const { data: orgData } = await supabase.rpc('get_current_org_id');
  const orgId =
    orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id || '';

  const [dirtyRes, washingRes, dryingRes, foldingRes, productionRes] = await Promise.all([
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'dirty'),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'washing'),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'drying'),
    supabase.from('linen_items').select('*', { count: 'exact', head: true }).eq('org_id', orgId).eq('status', 'folding'),
    supabase
      .from('production_batches')
      .select('id, org_id, inbound_batch_id, status, created_at, wash_started_at, wash_completed_at, dry_started_at, dry_completed_at, fold_started_at')
      .eq('org_id', orgId)
      .in('status', ['queued', 'washing', 'drying', 'folding'])
      .order('created_at', { ascending: true }),
  ]);

  const productionBatches = productionRes.data || [];
  const inboundBatchIds = productionBatches.map((row) => row.inbound_batch_id).filter((id): id is string => Boolean(id));

  const { data: inboundBatches } = inboundBatchIds.length
    ? await supabase
        .from('delivery_batches')
        .select('id, client_id, total_items, created_at, returned_at')
        .in('id', inboundBatchIds)
    : { data: [] as Array<{ id: string; client_id: string | null; total_items: number; created_at: string; returned_at: string | null }> };

  const clientIds = Array.from(
    new Set((inboundBatches || []).map((batch) => batch.client_id).filter((id): id is string => Boolean(id)))
  );

  const { data: clients } = clientIds.length
    ? await supabase.from('clients').select('id, name').in('id', clientIds)
    : { data: [] as Array<{ id: string; name: string }> };

  const inboundMap = new Map((inboundBatches || []).map((batch) => [batch.id, batch]));
  const clientMap = new Map((clients || []).map((client) => [client.id, client.name]));

  const nowMs = Date.now();
  const batchesView: ProductionBatchView[] = productionBatches
    .map((row) => {
      const inbound = inboundMap.get(row.inbound_batch_id || '');
      const clientName = inbound?.client_id ? clientMap.get(inbound.client_id) || 'Unknown Client' : 'Unknown Client';
      const itemCount = Number(inbound?.total_items || 0);

      let startAt = row.created_at;
      if (row.status === 'queued') startAt = inbound?.returned_at || inbound?.created_at || row.created_at;
      if (row.status === 'washing') startAt = row.wash_started_at || row.created_at;
      if (row.status === 'drying') startAt = row.dry_started_at || row.wash_completed_at || row.wash_started_at || row.created_at;
      if (row.status === 'folding') startAt = row.fold_started_at || row.dry_completed_at || row.dry_started_at || row.created_at;

      const waitingHours = Math.max(0, (nowMs - new Date(startAt).getTime()) / (1000 * 60 * 60));

      return {
        id: row.id,
        inbound_batch_id: row.inbound_batch_id,
        status: row.status as 'queued' | 'washing' | 'drying' | 'folding',
        client_name: clientName,
        item_count: itemCount,
        waiting_hours: waitingHours,
        wash_started_at: row.wash_started_at,
        dry_started_at: row.dry_started_at,
        fold_started_at: row.fold_started_at,
      };
    })
    .sort((a, b) => a.waiting_hours - b.waiting_hours);

  const useDemoData = !orgId || (!productionBatches.length && !(dirtyRes.count || washingRes.count || dryingRes.count || foldingRes.count));
  const displayBatches = useDemoData ? demoData.productionBatches : batchesView;
  const displayDirty = useDemoData ? demoData.inventoryItems.filter((item) => item.status === 'dirty').length : (dirtyRes.count || 0);
  const displayWashing = useDemoData ? demoData.inventoryItems.filter((item) => item.status === 'washing').length : (washingRes.count || 0);
  const displayDrying = useDemoData ? demoData.inventoryItems.filter((item) => item.status === 'drying').length : (dryingRes.count || 0);
  const displayFolding = useDemoData ? demoData.inventoryItems.filter((item) => item.status === 'folding').length : (foldingRes.count || 0);

  return (
    <div className="space-y-8">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
          <Factory className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Production Queue</h2>
          <p className="text-sm text-slate-500">Manage post-wash lifecycle from dirty intake to QC completion.</p>
        </div>
      </div>

      <ParLevelAlertWidget />

      <ProductionQueueClient
        dirtyCount={displayDirty}
        washingCount={displayWashing}
        dryingCount={displayDrying}
        foldingCount={displayFolding}
        batches={displayBatches}
        demoMode={useDemoData}
      />
    </div>
  );
}
