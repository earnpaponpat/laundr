"use client";

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Truck, ClipboardCheck, RotateCcw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { useRealtime } from '@/lib/contexts/RealtimeContext';

type OrderLine = {
  category_id: string;
  category_name: string;
  requested: number;
  picked: number;
  returned: number;
};

type RecentScan = {
  id: string;
  rfid_tag_id: string;
  event_type: string;
  created_at: string;
  gate_id: string | null;
  source: string | null;
};

type ManifestItemRow = {
  category_id: string;
  requested_qty: number;
  picked_qty: number;
  returned_qty: number;
  linen_categories?: { name?: string } | { name?: string }[] | null;
};

type ManifestBatchRow = {
  id: string;
  batch_type: string;
};

type ManifestResponse = {
  order?: { status?: string };
  items?: ManifestItemRow[];
  batches?: ManifestBatchRow[];
  summary?: Props['summary'];
  recent_scans?: RecentScan[];
};

type Props = {
  orgId: string;
  orderId: string;
  orderStatus: string;
  batchId: string | null;
  orderNumber: string;
  clientName: string;
  driverName: string;
  vehiclePlate: string;
  lines: OrderLine[];
  summary: {
    requested: number;
    picked: number;
    returned: number;
    missing: number;
    in_rewash: number;
    missing_tags: string[];
  };
  recentScans: RecentScan[];
  disablePickingUi?: boolean;
};

function scanMessage(eventType: string) {
  if (eventType === 'checkout') return 'Added to batch';
  if (eventType === 'checkin') return 'Returned to factory';
  if (eventType === 'qc_rewash') return 'Marked for rewash';
  if (eventType === 'qc_reject') return 'Rejected at QC';
  return eventType;
}

export function OrderWorkflowClient(props: Props) {
  const router = useRouter();
  const { lastEvent } = useRealtime();

  const [status, setStatus] = useState(props.orderStatus);
  const [batchId, setBatchId] = useState<string | null>(props.batchId);
  const [lines, setLines] = useState<OrderLine[]>(props.lines);
  const [summary, setSummary] = useState(props.summary);
  const [recentScans, setRecentScans] = useState<RecentScan[]>(props.recentScans.slice(0, 10));

  const [rfidTag, setRfidTag] = useState('');
  const [sessionScanCount, setSessionScanCount] = useState(0);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actualWeightKg, setActualWeightKg] = useState('');
  const [dispatchOpen, setDispatchOpen] = useState(false);
  const [showReturnScan, setShowReturnScan] = useState(false);

  const isPicking = status === 'picking';
  const isReady = status === 'ready';
  const isDispatched = status === 'dispatched';

  const overallPickedPct = useMemo(() => {
    if (summary.requested <= 0) return 0;
    return Math.min(100, Math.round((summary.picked / summary.requested) * 100));
  }, [summary.picked, summary.requested]);

  const refreshManifest = async () => {
    const res = await fetch(`/api/orders/${props.orderId}/manifest`, { cache: 'no-store' });
    if (!res.ok) return;
    const payload = (await res.json()) as ManifestResponse;

    const nextLines: OrderLine[] = (payload.items || []).map((row) => ({
      category_id: row.category_id,
      category_name: Array.isArray(row.linen_categories)
        ? row.linen_categories?.[0]?.name || row.category_id
        : row.linen_categories?.name || row.category_id,
      requested: Number(row.requested_qty || 0),
      picked: Number(row.picked_qty || 0),
      returned: Number(row.returned_qty || 0),
    }));

    setLines(nextLines);
    setSummary(payload.summary || summary);
    setRecentScans((payload.recent_scans || []).slice(0, 10));

    const outbound = (payload.batches || []).find((batch) => batch.batch_type === 'outbound');
    if (outbound?.id) setBatchId(outbound.id);

    if (payload.order?.status) setStatus(payload.order.status);
  };

  useEffect(() => {
    if (!lastEvent || !batchId) return;
    if (lastEvent.batch_id === batchId) {
      void refreshManifest();
    }
  }, [lastEvent, batchId]);

  const startPicking = async () => {
    setLoadingAction('start_picking');
    const res = await fetch(`/api/orders/${props.orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'start_picking' }),
    });
    const data = await res.json();
    setLoadingAction(null);
    if (!res.ok) return;

    setStatus('picking');
    if (data.batch_id) setBatchId(data.batch_id);
    router.refresh();
  };

  const endPicking = async () => {
    setLoadingAction('end_picking');
    const res = await fetch(`/api/orders/${props.orderId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'end_picking' }),
    });
    setLoadingAction(null);
    if (!res.ok) return;
    await refreshManifest();
    router.refresh();
  };

  const dispatchOrder = async () => {
    setLoadingAction('dispatch');
    const res = await fetch(`/api/orders/${props.orderId}/dispatch`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_weight_kg: actualWeightKg ? Number(actualWeightKg) : null,
      }),
    });
    setLoadingAction(null);
    if (!res.ok) return;

    setDispatchOpen(false);
    setStatus('dispatched');
    await refreshManifest();
    router.refresh();
  };

  const submitScan = async (eventType: 'checkout' | 'checkin') => {
    if (!rfidTag || !batchId) return;
    setLoadingAction('scan');

    const res = await fetch('/api/scan-events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        org_id: props.orgId,
        source: eventType === 'checkout' ? 'orders_picking_ui' : 'orders_return_ui',
        session_id: `order-${props.orderId}`,
        events: [
          {
            rfid_tag_id: rfidTag,
            gate_id: eventType === 'checkout' ? 'handheld_picking' : 'handheld_return',
            event_type: eventType,
            batch_id: batchId,
            order_id: props.orderId,
          },
        ],
      }),
    });

    const payload = await res.json();
    setLoadingAction(null);

    const result = payload?.results?.[0];
    if (result?.success) {
      setSessionScanCount((prev) => prev + 1);
    }

    setRecentScans((prev) => {
      const next: RecentScan = {
        id: crypto.randomUUID(),
        rfid_tag_id: rfidTag,
        event_type: eventType,
        created_at: new Date().toISOString(),
        gate_id: eventType === 'checkout' ? 'handheld_picking' : 'handheld_return',
        source: result?.success ? 'ok' : result?.error || 'error',
      };
      return [next, ...prev].slice(0, 10);
    });

    setRfidTag('');
    await refreshManifest();
  };

  const completeReturn = async () => {
    setLoadingAction('complete_return');
    const res = await fetch(`/api/orders/${props.orderId}/complete-return`, {
      method: 'PATCH',
    });
    setLoadingAction(null);
    if (!res.ok) return;

    setStatus('completed');
    setShowReturnScan(false);
    await refreshManifest();
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {status === 'draft' && !props.disablePickingUi ? (
          <Button onClick={startPicking} disabled={loadingAction === 'start_picking'}>
            {loadingAction === 'start_picking' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ClipboardCheck className="w-4 h-4 mr-2" />}
            Start Picking Session
          </Button>
        ) : null}

        {status === 'picking' && !props.disablePickingUi ? (
          <Button variant="outline" onClick={endPicking} disabled={loadingAction === 'end_picking'}>
            {loadingAction === 'end_picking' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            End Picking Session
          </Button>
        ) : null}

        {status === 'ready' ? (
          <Dialog open={dispatchOpen} onOpenChange={setDispatchOpen}>
            <DialogTrigger asChild>
              <Button className="bg-indigo-600 hover:bg-indigo-700">
                <Truck className="w-4 h-4 mr-2" />
                Dispatch
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Dispatch Confirmation</DialogTitle>
                <DialogDescription>
                  {summary.picked} items ready for {props.clientName}
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-3 text-sm text-slate-600">
                <div>Driver: {props.driverName || '-'}</div>
                <div>Vehicle: {props.vehiclePlate || '-'}</div>
                <div>Estimated weight: ~{Math.max(1, Math.round(summary.picked * 0.3))} kg</div>
                <div className="space-y-2">
                  <label className="text-xs text-slate-500">Actual weight (kg)</label>
                  <Input value={actualWeightKg} onChange={(event) => setActualWeightKg(event.target.value)} placeholder="Optional" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setDispatchOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={dispatchOrder} disabled={loadingAction === 'dispatch'}>
                  {loadingAction === 'dispatch' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Confirm Dispatch
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <Button variant="outline" onClick={() => window.open(`/api/orders/${props.orderId}/manifest`, '_blank')}>
          View Manifest
        </Button>

        {status === 'dispatched' ? (
          <>
            <Button variant="outline" onClick={() => setShowReturnScan((prev) => !prev)}>
              <RotateCcw className="w-4 h-4 mr-2" />
              {showReturnScan ? 'Hide Return Scan' : 'Start Return Scan'}
            </Button>
            <Button onClick={completeReturn} disabled={loadingAction === 'complete_return'}>
              {loadingAction === 'complete_return' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-2" />}
              Complete Return
            </Button>
          </>
        ) : null}
      </div>

      <section className="bg-white rounded-2xl border border-slate-100 p-5 space-y-4">
        <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Picking Progress</h3>

        <div className="space-y-3">
          {lines.map((line) => {
            const pct = line.requested > 0 ? Math.round((line.picked / line.requested) * 100) : 0;
            return (
              <div key={line.category_id} className="space-y-1">
                <div className="flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{line.category_name}</span>
                  <span className="tabular-nums text-slate-600">
                    {line.picked} / {line.requested} {line.picked >= line.requested ? '✓' : ''}
                  </span>
                </div>
                <Progress value={Math.min(100, pct)} className="h-2" />
              </div>
            );
          })}
        </div>

        <div className="pt-1 text-sm font-semibold text-slate-700 tabular-nums">
          Overall: {summary.picked}/{summary.requested} items picked
        </div>
        <Progress value={overallPickedPct} className="h-2" />
      </section>

      {isPicking && !props.disablePickingUi ? (
        <section className="bg-white rounded-2xl border border-indigo-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-indigo-600">Live Picking Interface</h3>

          <div className="text-3xl font-black tracking-tight text-slate-900">
            {sessionScanCount} items scanned this session
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Scan RFID tag"
              value={rfidTag}
              onChange={(event) => setRfidTag(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') void submitScan('checkout');
              }}
            />
            <Button onClick={() => void submitScan('checkout')} disabled={!batchId || loadingAction === 'scan'}>
              {loadingAction === 'scan' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Add'}
            </Button>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Recent scans</h4>
            {recentScans.slice(0, 10).map((scan) => (
              <div key={scan.id} className="text-sm flex items-center justify-between border border-slate-100 rounded-lg px-3 py-2">
                <span className="font-mono text-slate-700">{scan.rfid_tag_id}</span>
                <span className="text-slate-500">{scanMessage(scan.event_type)}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {isDispatched ? (
        <section className="bg-white rounded-2xl border border-amber-100 p-5 space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-600">Return Section</h3>
          <div className="text-sm text-slate-700">
            Dispatched: {summary.picked} items | Returned so far: {summary.returned}
          </div>

          {showReturnScan ? (
            <div className="space-y-4 border-t pt-4">
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div className="rounded-lg bg-emerald-50 p-3">
                  <div className="text-xs text-emerald-700">Returned</div>
                  <div className="font-bold text-emerald-900 tabular-nums">
                    {summary.returned}/{summary.picked}
                  </div>
                </div>
                <div className="rounded-lg bg-red-50 p-3">
                  <div className="text-xs text-red-700">Missing</div>
                  <div className="font-bold text-red-900 tabular-nums">{summary.missing}</div>
                </div>
                <div className="rounded-lg bg-amber-50 p-3">
                  <div className="text-xs text-amber-700">In Rewash</div>
                  <div className="font-bold text-amber-900 tabular-nums">{summary.in_rewash}</div>
                </div>
              </div>

              <div className="flex gap-2">
                <Input
                  placeholder="Scan return RFID tag"
                  value={rfidTag}
                  onChange={(event) => setRfidTag(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') void submitScan('checkin');
                  }}
                />
                <Button onClick={() => void submitScan('checkin')} disabled={!batchId || loadingAction === 'scan'}>
                  {loadingAction === 'scan' ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Return'}
                </Button>
              </div>

              {summary.missing_tags.length > 0 ? (
                <div className="rounded-lg border border-red-100 bg-red-50 p-3 text-sm text-red-700">
                  <div className="font-semibold flex items-center gap-2 mb-1">
                    <AlertTriangle className="w-4 h-4" /> Missing tags
                  </div>
                  <div className="font-mono text-xs">{summary.missing_tags.join(', ')}</div>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
