"use client";

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Play, Wind, FoldHorizontal, CheckCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Stage = 'queued' | 'washing' | 'drying' | 'folding';

export type ProductionBatchView = {
  id: string;
  inbound_batch_id: string;
  status: Stage;
  client_name: string;
  item_count: number;
  waiting_hours: number;
  wash_started_at: string | null;
  dry_started_at: string | null;
  fold_started_at: string | null;
};

export function ProductionQueueClient(props: {
  dirtyCount: number;
  washingCount: number;
  dryingCount: number;
  foldingCount: number;
  batches: ProductionBatchView[];
  demoMode?: boolean;
}) {
  const router = useRouter();
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [qcInputs, setQcInputs] = useState<Record<string, { passed: number; rewash: number; rejected: number }>>({});

  const grouped = useMemo(() => {
    const map: Record<Stage, ProductionBatchView[]> = {
      queued: [],
      washing: [],
      drying: [],
      folding: [],
    };
    for (const batch of props.batches) {
      map[batch.status].push(batch);
    }
    return map;
  }, [props.batches]);

  const callAction = async (endpoint: string, payload: Record<string, unknown>) => {
    setLoadingAction(`${endpoint}:${JSON.stringify(payload)}`);
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setLoadingAction(null);
    if (res.ok) router.refresh();
  };

  const stageLabel = (stage: Stage) => {
    if (stage === 'queued') return 'Dirty';
    if (stage === 'washing') return 'Washing';
    if (stage === 'drying') return 'Drying';
    return 'Folding/QC';
  };

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {([
          { key: 'queued', title: 'Dirty (awaiting wash)', count: props.dirtyCount },
          { key: 'washing', title: 'Washing', count: props.washingCount },
          { key: 'drying', title: 'Drying', count: props.dryingCount },
          { key: 'folding', title: 'Folding/QC', count: props.foldingCount },
        ] as const).map((column) => (
          <div key={column.key} className="bg-white rounded-2xl border border-slate-100 p-4 space-y-3 shadow-sm shadow-slate-200/40">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider">{column.title}</h3>
              <span className="text-lg font-black text-slate-900 tabular-nums">{column.count}</span>
            </div>
            <div className="space-y-2 max-h-64 overflow-auto">
              {(grouped[column.key] || []).slice(0, 5).map((batch) => (
                <div key={batch.id} className="rounded-lg border border-slate-100 p-2 text-xs text-slate-600">
                  <div className="font-semibold text-slate-800">{batch.client_name}</div>
                  <div>{batch.item_count} items</div>
                  <div>{batch.waiting_hours.toFixed(1)}h waiting</div>
                </div>
              ))}
              {(grouped[column.key] || []).length === 0 ? (
                <div className="text-xs text-slate-400">No active batches</div>
              ) : null}
            </div>
          </div>
        ))}
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm shadow-slate-200/40 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">Dirty Queue</h3>
        <div className="space-y-2">
          {grouped.queued.map((batch) => {
            const actionKey = `/api/production/start-washing:${batch.id}`;
            return (
              <div key={batch.id} className="rounded-lg border border-slate-100 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  {batch.client_name} return | {batch.item_count} items | {batch.waiting_hours.toFixed(1)}h ago
                </div>
                <Button
                  onClick={() => void callAction('/api/production/start-washing', { production_batch_id: batch.id })}
                  disabled={props.demoMode || loadingAction === actionKey}
                >
                  {loadingAction === actionKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Play className="w-4 h-4 mr-2" />}
                  Start Washing
                </Button>
              </div>
            );
          })}
          {grouped.queued.length === 0 ? <div className="text-sm text-slate-500">No dirty batches waiting.</div> : null}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm shadow-slate-200/40 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">In Progress</h3>
        <div className="space-y-2">
          {grouped.washing.map((batch) => {
            const actionKey = `/api/production/mark-wash-done:${batch.id}`;
            return (
              <div key={batch.id} className="rounded-lg border border-slate-100 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  [Washing] {batch.client_name} batch — started {batch.wash_started_at ? new Date(batch.wash_started_at).toLocaleTimeString() : '-'} | {batch.item_count} items
                </div>
                <Button
                  variant="outline"
                  onClick={() => void callAction('/api/production/mark-wash-done', { production_batch_id: batch.id })}
                  disabled={props.demoMode || loadingAction === actionKey}
                >
                  {loadingAction === actionKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Wind className="w-4 h-4 mr-2" />}
                  Mark Wash Done
                </Button>
              </div>
            );
          })}

          {grouped.drying.map((batch) => {
            const actionKey = `/api/production/mark-dry-done:${batch.id}`;
            return (
              <div key={batch.id} className="rounded-lg border border-slate-100 p-3 flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm text-slate-700">
                  [Drying] {batch.client_name} batch — started {batch.dry_started_at ? new Date(batch.dry_started_at).toLocaleTimeString() : '-'} | {batch.item_count} items
                </div>
                <Button
                  variant="outline"
                  onClick={() => void callAction('/api/production/mark-dry-done', { production_batch_id: batch.id })}
                  disabled={props.demoMode || loadingAction === actionKey}
                >
                  {loadingAction === actionKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FoldHorizontal className="w-4 h-4 mr-2" />}
                  Mark Dry Done
                </Button>
              </div>
            );
          })}

          {grouped.washing.length === 0 && grouped.drying.length === 0 ? (
            <div className="text-sm text-slate-500">No batches in washing or drying right now.</div>
          ) : null}
        </div>
      </section>

      <section className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm shadow-slate-200/40 space-y-4">
        <h3 className="text-sm font-bold uppercase tracking-wider text-slate-500">QC Station</h3>
        <div className="space-y-3">
          {grouped.folding.map((batch) => {
            const form = qcInputs[batch.id] || { passed: 0, rewash: 0, rejected: 0 };
            const total = form.passed + form.rewash + form.rejected;
            const totalOk = total === batch.item_count;
            const actionKey = `/api/production/submit-qc:${batch.id}`;

            return (
              <div key={batch.id} className="rounded-xl border border-slate-100 p-4 space-y-3">
                <div className="text-sm font-semibold text-slate-800">
                  {batch.client_name} batch | {batch.item_count} items in folding
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="text-xs text-slate-500">Passed</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.passed}
                      onChange={(e) =>
                        setQcInputs((prev) => ({
                          ...prev,
                          [batch.id]: { ...form, passed: Number(e.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Rewash</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.rewash}
                      onChange={(e) =>
                        setQcInputs((prev) => ({
                          ...prev,
                          [batch.id]: { ...form, rewash: Number(e.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500">Rejected</label>
                    <Input
                      type="number"
                      min={0}
                      value={form.rejected}
                      onChange={(e) =>
                        setQcInputs((prev) => ({
                          ...prev,
                          [batch.id]: { ...form, rejected: Number(e.target.value || 0) },
                        }))
                      }
                    />
                  </div>
                </div>

                <div className={`text-xs ${totalOk ? 'text-emerald-600' : 'text-amber-600'}`}>
                  Total: {total} / {batch.item_count} {totalOk ? '✓' : '(must equal batch size)'}
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" disabled>
                    Scan QC
                  </Button>
                  <Button
                    size="sm"
                    onClick={() =>
                      void callAction('/api/production/submit-qc', {
                        production_batch_id: batch.id,
                        passed: form.passed,
                        rewash: form.rewash,
                        rejected: form.rejected,
                      })
                    }
                    disabled={props.demoMode || !totalOk || loadingAction === actionKey}
                  >
                    {loadingAction === actionKey ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <CheckCheck className="w-4 h-4 mr-2" />}
                    Submit QC
                  </Button>
                </div>
              </div>
            );
          })}

          {grouped.folding.length === 0 ? <div className="text-sm text-slate-500">No batches ready for QC.</div> : null}
        </div>
        {props.demoMode ? (
          <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            Demo mode: production actions are view-only here, but counts and queue relationships reflect the 10,000-SKU demo dataset.
          </div>
        ) : null}
      </section>
    </div>
  );
}
