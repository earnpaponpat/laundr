"use client";

import { useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, MinusCircle, SquarePen, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type CategoryProgress = {
  picked: number;
  requested: number;
  pct: number;
  complete: boolean;
};

type ScanResultRow = {
  rfid_tag_id: string;
  result: 'added' | 'skipped' | 'error' | 'ask_user';
  code?: string;
  message?: string;
  item?: { category_name: string; status: string };
  order_progress?: {
    category_name: string;
    picked: number;
    requested: number;
    complete: boolean;
  };
};

type RecentScanItem = {
  id: string;
  rfid_tag_id: string;
  result: 'added' | 'skipped' | 'error' | 'ask_user';
  message: string;
  category_name?: string;
  timestamp: number;
};

export function PickingInterface(props: {
  orgId: string;
  orderId: string;
  orderNumber: string;
  clientName: string;
  startedBy?: string;
  initialSessionId?: string | null;
  initialBatchId?: string | null;
  initialCompletion?: Record<string, CategoryProgress>;
}) {
  const scanInputRef = useRef<HTMLInputElement>(null);
  const [inputValue, setInputValue] = useState('');
  const [manualEntryOpen, setManualEntryOpen] = useState(false);
  const [manualTag, setManualTag] = useState('');

  const [sessionId, setSessionId] = useState<string | null>(props.initialSessionId || null);
  const [batchId, setBatchId] = useState<string | null>(props.initialBatchId || null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number | null>(props.initialSessionId ? Date.now() : null);
  const [elapsedSec, setElapsedSec] = useState(0);

  const [completion, setCompletion] = useState<Record<string, CategoryProgress>>(props.initialCompletion || {});
  const [allComplete, setAllComplete] = useState(false);
  const [sessionItemsCount, setSessionItemsCount] = useState(0);
  const [loading, setLoading] = useState(false);

  const [lastScanResult, setLastScanResult] = useState<RecentScanItem | null>(null);
  const [recentScans, setRecentScans] = useState<RecentScanItem[]>([]);
  const [selectedScan, setSelectedScan] = useState<RecentScanItem | null>(null);

  const [decisionPending, setDecisionPending] = useState<ScanResultRow | null>(null);
  const [completeOverlay, setCompleteOverlay] = useState(false);

  const categoryRows = useMemo(
    () => Object.entries(completion).sort((a, b) => a[0].localeCompare(b[0])),
    [completion]
  );

  const totalPicked = categoryRows.reduce((sum, [, row]) => sum + row.picked, 0);
  const totalRequested = categoryRows.reduce((sum, [, row]) => sum + row.requested, 0);

  const formatElapsed = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const hh = String(h).padStart(2, '0');
    const mm = String(m).padStart(2, '0');
    const ss = String(s).padStart(2, '0');
    return `${hh}:${mm}:${ss}`;
  };

  const playBeep = (tone: 'success' | 'error' | 'complete') => {
    const Ctx = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;

    const audioCtx = new Ctx();

    const scheduleTone = (startAt: number, frequency: number, duration: number) => {
      const oscillator = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      gain.connect(audioCtx.destination);
      gain.gain.setValueAtTime(0.12, startAt);
      gain.gain.exponentialRampToValueAtTime(0.001, startAt + duration);
      oscillator.start(startAt);
      oscillator.stop(startAt + duration);
    };

    const now = audioCtx.currentTime;
    if (tone === 'success') {
      scheduleTone(now, 960, 0.08);
    } else if (tone === 'error') {
      scheduleTone(now, 320, 0.08);
      scheduleTone(now + 0.12, 320, 0.08);
    } else {
      scheduleTone(now, 960, 0.08);
      scheduleTone(now + 0.11, 1120, 0.08);
      scheduleTone(now + 0.22, 1280, 0.08);
    }
  };

  const vibrate = (kind: 'success' | 'error' | 'complete') => {
    if (!('vibrate' in navigator)) return;
    if (kind === 'success') navigator.vibrate(40);
    else if (kind === 'error') navigator.vibrate([80, 40, 80]);
    else navigator.vibrate([60, 40, 60, 40, 60]);
  };

  const pushRecentScan = (row: RecentScanItem) => {
    setLastScanResult(row);
    setRecentScans((prev) => [row, ...prev].slice(0, 8));
  };

  const refreshSessionSummary = async () => {
    if (!sessionId) return;
    const res = await fetch(`/api/orders/${props.orderId}/picking/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        tags: [],
      }),
    });

    if (!res.ok) return;
    const data = await res.json();
    if (data?.order_completion) setCompletion(data.order_completion);
    if (typeof data?.session_items_count === 'number') setSessionItemsCount(data.session_items_count);
    if (typeof data?.all_complete === 'boolean') setAllComplete(data.all_complete);
  };

  useEffect(() => {
    if (!sessionStartedAt) return;
    const t = setInterval(() => {
      setElapsedSec(Math.floor((Date.now() - sessionStartedAt) / 1000));
    }, 1000);
    return () => clearInterval(t);
  }, [sessionStartedAt]);

  useEffect(() => {
    if (!sessionId) return;
    const timer = setInterval(() => {
      void refreshSessionSummary();
    }, 500);
    return () => clearInterval(timer);
  }, [sessionId]);

  useEffect(() => {
    const refocus = () => scanInputRef.current?.focus();
    document.addEventListener('click', refocus);
    scanInputRef.current?.focus();
    return () => document.removeEventListener('click', refocus);
  }, []);

  useEffect(() => {
    if (!allComplete) return;
    setCompleteOverlay(true);
    playBeep('complete');
    vibrate('complete');
    const t = setTimeout(() => setCompleteOverlay(false), 1800);
    return () => clearTimeout(t);
  }, [allComplete]);

  const startSession = async () => {
    setLoading(true);
    const res = await fetch(`/api/orders/${props.orderId}/picking/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gate_id: 'handheld_1',
        started_by: props.startedBy,
      }),
    });

    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      pushRecentScan({
        id: crypto.randomUUID(),
        rfid_tag_id: '-',
        result: 'error',
        message: data?.error || 'Failed to start session',
        timestamp: Date.now(),
      });
      return;
    }

    setSessionId(data.session_id);
    setBatchId(data.batch_id);
    setSessionStartedAt(Date.now());
    if (data?.order_summary?.order_completion) setCompletion(data.order_summary.order_completion);
    if (typeof data?.order_summary?.session_items_count === 'number') {
      setSessionItemsCount(data.order_summary.session_items_count);
    }
  };

  const applyScanResult = (row: ScanResultRow) => {
    if (row.result === 'ask_user') {
      setDecisionPending(row);
      playBeep('error');
      vibrate('error');
      pushRecentScan({
        id: crypto.randomUUID(),
        rfid_tag_id: row.rfid_tag_id,
        result: row.result,
        message: row.message || row.code || 'needs decision',
        category_name: row.item?.category_name,
        timestamp: Date.now(),
      });
      return;
    }

    if (row.result === 'added' && row.order_progress) {
      const progress = row.order_progress;
      setCompletion((prev) => ({
        ...prev,
        [progress.category_name]: {
          picked: progress.picked,
          requested: progress.requested,
          pct:
            progress.requested > 0
              ? Math.min(100, Math.round((progress.picked / progress.requested) * 100))
              : 0,
          complete: progress.complete,
        },
      }));
      setSessionItemsCount((prev) => prev + 1);
      playBeep('success');
      vibrate('success');
    } else if (row.result === 'error') {
      playBeep('error');
      vibrate('error');
    }

    pushRecentScan({
      id: crypto.randomUUID(),
      rfid_tag_id: row.rfid_tag_id,
      result: row.result,
      message: row.message || row.code || row.result,
      category_name: row.item?.category_name,
      timestamp: Date.now(),
    });
  };

  const scanTag = async (
    tag: string,
    override?: { allow_wrong_category?: boolean; allow_over_pick?: boolean }
  ) => {
    if (!sessionId || !tag.trim()) return;
    setLoading(true);

    const res = await fetch(`/api/orders/${props.orderId}/picking/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        tags: [tag.trim()],
        overrides: override ? { [tag.trim()]: override } : undefined,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      pushRecentScan({
        id: crypto.randomUUID(),
        rfid_tag_id: tag,
        result: 'error',
        message: data?.error || 'scan failed',
        timestamp: Date.now(),
      });
      playBeep('error');
      vibrate('error');
      return;
    }

    const firstResult = (data.results || [])[0] as ScanResultRow | undefined;
    if (firstResult) {
      applyScanResult(firstResult);
    }

    if (data.order_completion) setCompletion(data.order_completion);
    if (typeof data.session_items_count === 'number') setSessionItemsCount(data.session_items_count);
    if (typeof data.all_complete === 'boolean') setAllComplete(data.all_complete);
  };

  const handleScan = async (rawTag: string) => {
    const normalized = rawTag.trim();
    if (!normalized) return;
    await scanTag(normalized);
    setInputValue('');
    scanInputRef.current?.focus();
  };

  const endSession = async () => {
    if (!sessionId) return;
    setLoading(true);
    const res = await fetch(`/api/orders/${props.orderId}/picking/end`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ session_id: sessionId }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      pushRecentScan({
        id: crypto.randomUUID(),
        rfid_tag_id: '-',
        result: 'error',
        message: data?.error || 'failed to end session',
        timestamp: Date.now(),
      });
      return;
    }

    setSessionId(null);
    setBatchId(null);
    setDecisionPending(null);
    if (data?.order_completion) {
      const next: Record<string, CategoryProgress> = {};
      for (const [categoryName, row] of Object.entries(data.order_completion as Record<string, { picked: number; requested: number }>)) {
        const picked = Number(row.picked || 0);
        const requested = Number(row.requested || 0);
        next[categoryName] = {
          picked,
          requested,
          pct: requested > 0 ? Math.min(100, Math.round((picked / requested) * 100)) : 0,
          complete: requested > 0 ? picked >= requested : false,
        };
      }
      setCompletion(next);
    }
    window.location.reload();
  };

  return (
    <div className="space-y-4 relative">
      {completeOverlay ? (
        <div className="fixed inset-0 bg-emerald-500/20 backdrop-blur-[2px] z-40 flex items-center justify-center pointer-events-none">
          <div className="bg-emerald-600 text-white px-8 py-5 rounded-2xl text-3xl font-black tracking-wide shadow-2xl">
            COMPLETE!
          </div>
        </div>
      ) : null}

      <input
        ref={scanInputRef}
        type="text"
        value={inputValue}
        style={{ opacity: 0, position: 'absolute', left: '-9999px' }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' && inputValue.length > 0) {
            void handleScan(inputValue);
          }
        }}
        onChange={(event) => setInputValue(event.target.value)}
        autoFocus
      />

      <div className="bg-white border border-slate-200 rounded-2xl p-4 flex items-center justify-between gap-4">
        <div>
          <div className="text-sm font-bold text-slate-800">
            Order #{props.orderNumber} | {props.clientName}
          </div>
          <div className="text-xs text-slate-500">Session active: {formatElapsed(elapsedSec)}</div>
          {batchId ? <div className="text-[11px] text-slate-400 mt-1">Batch: {batchId}</div> : null}
        </div>

        {sessionId ? (
          <Button variant="destructive" onClick={endSession} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            End Session
          </Button>
        ) : (
          <Button onClick={startSession} disabled={loading}>
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <SquarePen className="w-4 h-4 mr-2" />}
            Start Picking Session
          </Button>
        )}
      </div>

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        {categoryRows.map(([categoryName, row]) => (
          <div key={categoryName} className="rounded-xl border border-slate-100 p-3">
            <div className="flex justify-between text-sm mb-2">
              <span className="font-semibold text-slate-800">{categoryName}</span>
              <span className="tabular-nums text-slate-700">
                {row.picked} / {row.requested} {row.complete ? '✓' : ''}
              </span>
            </div>
            <Progress value={row.pct} className="h-3" />
            <div className="text-xs text-slate-500 mt-1">{row.pct}%</div>
          </div>
        ))}

        <div className="text-sm font-semibold text-slate-700">
          Total: {totalPicked} / {totalRequested} items
        </div>
      </section>

      {lastScanResult ? (
        <section
          className={`rounded-2xl p-4 border ${
            lastScanResult.result === 'added'
              ? 'bg-emerald-50 border-emerald-200'
              : lastScanResult.result === 'ask_user'
                ? 'bg-amber-50 border-amber-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="text-lg font-bold flex items-center gap-2">
            {lastScanResult.result === 'added' ? (
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            ) : lastScanResult.result === 'ask_user' ? (
              <AlertTriangle className="w-5 h-5 text-amber-600" />
            ) : (
              <XCircle className="w-5 h-5 text-red-600" />
            )}
            {lastScanResult.rfid_tag_id}
          </div>
          <div className="text-sm mt-1">{lastScanResult.message}</div>
        </section>
      ) : null}

      {decisionPending ? (
        <section className="rounded-2xl p-4 border bg-amber-50 border-amber-200 space-y-3">
          <div className="text-sm font-semibold text-amber-800">⚠ {decisionPending.rfid_tag_id}</div>
          <div className="text-sm text-amber-700">{decisionPending.message}</div>
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={() => {
                const tag = decisionPending.rfid_tag_id;
                const allowWrongCategory = decisionPending.code === 'WRONG_CATEGORY';
                const allowOverPick = decisionPending.code === 'OVER_PICK';
                setDecisionPending(null);
                void scanTag(tag, {
                  allow_wrong_category: allowWrongCategory,
                  allow_over_pick: allowOverPick,
                });
              }}
            >
              เพิ่มเข้า order
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDecisionPending(null)}>
              ข้าม
            </Button>
          </div>
        </section>
      ) : null}

      <section className="bg-white border border-slate-200 rounded-2xl p-4 space-y-3">
        <div className="text-xs font-bold uppercase tracking-wider text-slate-500">Recent scans (last 8)</div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {recentScans.map((scan) => (
            <button
              key={scan.id}
              className="text-left rounded-lg border border-slate-100 px-3 py-2 text-sm hover:bg-slate-50"
              onClick={() => setSelectedScan(scan)}
              type="button"
            >
              <span className="font-mono text-slate-800">{scan.rfid_tag_id}</span>{' '}
              {scan.result === 'added' ? '✓' : scan.result === 'skipped' ? '•' : '✗'}
            </button>
          ))}
        </div>
      </section>

      <div className="flex items-center justify-between">
        <div className="text-xs text-slate-500">Session scanned count: {sessionItemsCount}</div>
        <Button size="sm" variant="ghost" onClick={() => setManualEntryOpen((prev) => !prev)}>
          <MinusCircle className="w-4 h-4 mr-1" /> Manual Entry
        </Button>
      </div>

      {manualEntryOpen ? (
        <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-2">
          <Input value={manualTag} onChange={(event) => setManualTag(event.target.value)} placeholder="Type RFID tag id" />
          <Button
            onClick={() => {
              const tag = manualTag.trim();
              if (!tag) return;
              setManualTag('');
              void handleScan(tag);
            }}
            disabled={!sessionId || loading}
          >
            Scan
          </Button>
        </div>
      ) : null}

      <Dialog open={Boolean(selectedScan)} onOpenChange={(open) => !open && setSelectedScan(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Scan Details</DialogTitle>
            <DialogDescription>Detailed result for selected scan</DialogDescription>
          </DialogHeader>
          {selectedScan ? (
            <div className="space-y-2 text-sm">
              <div>
                <span className="text-slate-500">Tag:</span> <span className="font-mono">{selectedScan.rfid_tag_id}</span>
              </div>
              <div>
                <span className="text-slate-500">Result:</span> {selectedScan.result}
              </div>
              <div>
                <span className="text-slate-500">Message:</span> {selectedScan.message}
              </div>
              {selectedScan.category_name ? (
                <div>
                  <span className="text-slate-500">Category:</span> {selectedScan.category_name}
                </div>
              ) : null}
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedScan(null)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
