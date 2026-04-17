"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { MissingItemsTable } from "@/components/rfid/MissingItemsTable";
import { format, formatDistanceToNow } from "date-fns";
import { CheckCircle2, AlertOctagon, RefreshCw, Download, Clock, Info } from "lucide-react";
import { HeaderActions } from "@/components/dashboard/HeaderActions";

export default function ReconcilePage() {
  const { t } = useLanguage();
  const [batches, setBatches] = useState<any[]>([]);
  const [selectedBatchId, setSelectedBatchId] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState<{ returned: any[]; pending: any[]; missing: any[]; rewash: any[]; batch: any | null }>({
    returned: [], pending: [], missing: [], rewash: [], batch: null
  });
  const supabase = createClient();

  useEffect(() => { loadBatches(); }, []);
  useEffect(() => { if (selectedBatchId) loadReconcileData(selectedBatchId); }, [selectedBatchId]);

  const loadBatches = async () => {
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    const { data: batchData } = await supabase
      .from('delivery_batches')
      .select('id, created_at, total_items, expected_return_by, clients(name)')
      .eq('org_id', orgId)
      .eq('batch_type', 'outbound')
      .order('created_at', { ascending: false });
    if (batchData && batchData.length > 0) {
      setBatches(batchData);
      setSelectedBatchId(batchData[0].id);
    }
  };

  const loadReconcileData = async (batchId: string) => {
    setLoading(true);
    try {
      const res = await fetch('/api/reconcile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ batch_id: batchId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setStats({
        returned: data.returned || [],
        pending: data.pending || [],
        missing: data.missing || [],
        rewash: data.rewash || [],
        batch: data.batch || null,
      });
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const exportReport = () => {
    const allItems = [
      ...stats.returned.map((i: any) => ({ ...i, status: 'returned' })),
      ...stats.pending.map((i: any) => ({ ...i, status: 'pending' })),
      ...stats.missing.map((i: any) => ({ ...i, status: 'missing' })),
      ...stats.rewash.map((i: any) => ({ ...i, status: 'rewash' })),
    ];
    if (allItems.length === 0) return;
    const headers = ['Tag ID', 'Category', 'Checkout Time', 'Return Time', 'Status', 'Days Outstanding', 'Expected Return By'];
    const csvRows = [headers.join(',')];
    allItems.forEach(i => {
      csvRows.push([
        i.rfid_tag_id, i.category,
        new Date(i.checkout_time).toISOString(),
        i.return_time ? new Date(i.return_time).toISOString() : 'N/A',
        i.status,
        i.days_outstanding || 0,
        i.expected_return_by ? new Date(i.expected_return_by).toISOString() : 'N/A',
      ].join(','));
    });
    const blob = new Blob([csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reconcile_report_${selectedBatchId}.csv`;
    link.click();
  };

  const graceDeadline = stats.batch?.expected_return_by ? new Date(stats.batch.expected_return_by) : null;
  const isPastGrace = graceDeadline ? new Date() > graceDeadline : false;

  const statCards = [
    {
      label: t('reconcile.itemsReturned'),
      value: stats.returned.length,
      icon: CheckCircle2,
      bg: 'bg-emerald-50',
      iconColor: 'text-emerald-500',
      border: 'border-emerald-100',
    },
    {
      label: t('reconcile.foundInRewash'),
      value: stats.rewash.length,
      icon: RefreshCw,
      bg: 'bg-amber-50',
      iconColor: 'text-amber-500',
      border: 'border-amber-100',
    },
    {
      label: t('reconcile.itemsPending'),
      value: stats.pending.length,
      icon: Clock,
      bg: isPastGrace ? 'bg-slate-50' : 'bg-yellow-50',
      iconColor: isPastGrace ? 'text-slate-400' : 'text-yellow-500',
      border: isPastGrace ? 'border-slate-100' : 'border-yellow-100',
      sub: graceDeadline
        ? isPastGrace
          ? `Grace period ended ${format(graceDeadline, 'MMM dd')}`
          : `${t('reconcile.gracePeriodNote')} ${format(graceDeadline, 'MMM dd, HH:mm')}`
        : undefined,
    },
    {
      label: t('reconcile.itemsMissing'),
      value: stats.missing.length,
      icon: AlertOctagon,
      bg: stats.missing.length > 0 ? 'bg-red-50' : 'bg-slate-50',
      iconColor: stats.missing.length > 0 ? 'text-red-500' : 'text-slate-300',
      border: stats.missing.length > 0 ? 'border-red-100' : 'border-slate-100',
      sub: stats.missing.length > 0 ? t('reconcile.missingNote') : undefined,
    },
  ];

  return (
    <div className="space-y-12">
      <HeaderActions>
        <Button variant="outline" className="bg-white border-slate-200" onClick={exportReport} disabled={!selectedBatchId || loading}>
          <Download className="w-4 h-4 mr-2" /> {t('reconcile.exportReport')}
        </Button>
      </HeaderActions>

      {/* Batch selector */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 flex flex-col md:flex-row items-center gap-4">
        <div className="flex items-center gap-3 min-w-[300px]">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">{t('reconcile.targetBatch')}</span>
          <Select value={selectedBatchId} onValueChange={setSelectedBatchId}>
            <SelectTrigger className="flex-1 bg-slate-50/50 border-slate-200">
              <SelectValue placeholder={t('reconcile.selectBatch')} />
            </SelectTrigger>
            <SelectContent>
              {batches.map(b => (
                <SelectItem key={b.id} value={b.id}>
                  {format(new Date(b.created_at), 'MMM dd, HH:mm')} — {(b.clients as any)?.name ?? 'Unknown'} ({b.total_items} items)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="h-8 w-px bg-slate-100 hidden md:block" />
        {graceDeadline && (
          <div className={`flex items-center gap-2 text-xs font-medium px-3 py-1.5 rounded-lg ${isPastGrace ? 'bg-red-50 text-red-600' : 'bg-yellow-50 text-yellow-700'}`}>
            <Clock className="w-3.5 h-3.5" />
            {isPastGrace
              ? `Grace period ended ${formatDistanceToNow(graceDeadline, { addSuffix: true })}`
              : `Grace period ends ${formatDistanceToNow(graceDeadline, { addSuffix: true })}`}
          </div>
        )}
        <div className="text-xs text-slate-400 font-medium italic ml-auto">
          {t('reconcile.verifyNote')}
        </div>
      </div>

      {/* Stat cards */}
      <div className="grid gap-5 md:grid-cols-4">
        {statCards.map((s) => (
          <div key={s.label} className={`bg-white rounded-xl border ${s.border} p-6 hover:shadow-sm transition-all group`}>
            <div className="flex items-start justify-between mb-4">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{s.label}</span>
              <div className={`w-8 h-8 rounded-lg ${s.bg} flex items-center justify-center group-hover:scale-105 transition-transform`}>
                <s.icon className={`h-4 w-4 ${s.iconColor}`} />
              </div>
            </div>
            <div className="text-3xl font-bold text-slate-900 tabular-nums tracking-tighter">{s.value}</div>
            {s.sub && (
              <p className="mt-2 text-[10px] text-slate-400 font-medium leading-tight">{s.sub}</p>
            )}
          </div>
        ))}
      </div>

      {/* Pending section — within grace period */}
      {stats.pending.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('reconcile.pendingForensics')}</h3>
            <span className="flex items-center gap-1 text-[10px] font-bold text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
              <Info className="w-3 h-3" /> {t('reconcile.pendingNote')}
            </span>
          </div>
          <MissingItemsTable
            missingItems={stats.pending}
            onRefresh={() => loadReconcileData(selectedBatchId)}
          />
        </div>
      )}

      {/* Missing section — past grace period */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">{t('reconcile.missingForensics')}</h3>
          {stats.missing.length > 0 && (
            <span className="text-[10px] font-bold text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
              {t('reconcile.missingNote')}
            </span>
          )}
        </div>
        <MissingItemsTable
          missingItems={stats.missing}
          onRefresh={() => loadReconcileData(selectedBatchId)}
        />
      </div>
    </div>
  );
}
