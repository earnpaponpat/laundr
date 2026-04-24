'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';

type StopDetail = {
  stop: {
    id: string;
    stop_no: number;
    status: string;
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
  items: Array<{
    category_id: string;
    category_name: string;
    deliver_qty: number;
    requested_qty: number;
    returned_qty: number;
  }>;
};

type ScanMode = 'deliver' | 'collect';

type ScanResult = {
  rfid_tag_id: string;
  result: 'added' | 'skipped' | 'error';
  code?: string;
  message?: string;
  item?: { category_name: string; status: string };
};

function formatText(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key) => String(vars[key] ?? `{${key}}`));
}

export default function DriverStopPage() {
  const params = useParams<{ stopId: string }>();
  const router = useRouter();
  const { language, t } = useLanguage();
  const stopId = params.stopId;

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [data, setData] = useState<StopDetail | null>(null);

  const [step, setStep] = useState(0);
  const [scanMode, setScanMode] = useState<ScanMode | null>(null);
  const [scanInputValue, setScanInputValue] = useState('');
  const [manualTag, setManualTag] = useState('');
  const [lastResult, setLastResult] = useState<ScanResult | null>(null);
  const [recentResults, setRecentResults] = useState<ScanResult[]>([]);

  const [deliveredTags, setDeliveredTags] = useState<Set<string>>(new Set());
  const [collectedTags, setCollectedTags] = useState<Set<string>>(new Set());

  const [receivedBy, setReceivedBy] = useState('');
  const [signature, setSignature] = useState('');

  const scanInputRef = useRef<HTMLInputElement>(null);
  const sessionDeliver = useRef(`deliver-${Date.now()}`);
  const sessionCollect = useRef(`collect-${Date.now()}`);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawingRef = useRef(false);

  const fetchDetail = useCallback(async () => {
    setLoading(true);
    setError('');
    const res = await fetch(`/api/driver/stops/${stopId}`);
    const json = await res.json();

    if (!res.ok) {
      setError(json.error || t('driver.stop.loadFailed'));
      setLoading(false);
      return;
    }

    setData(json);
    setDeliveredTags(new Set(json.stop.delivered_tags || []));
    setCollectedTags(new Set(json.stop.collected_tags || []));
    setLoading(false);
  }, [stopId, t]);

  useEffect(() => {
    fetchDetail();
  }, [fetchDetail]);

  useEffect(() => {
    if (scanMode) {
      scanInputRef.current?.focus();
    }
  }, [scanMode]);

  useEffect(() => {
    const refocus = () => scanInputRef.current?.focus();
    document.addEventListener('click', refocus);
    return () => document.removeEventListener('click', refocus);
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    const getPos = (event: MouseEvent | TouchEvent) => {
      const rect = canvas.getBoundingClientRect();
      const point = 'touches' in event ? event.touches[0] : event;
      return {
        x: point.clientX - rect.left,
        y: point.clientY - rect.top,
      };
    };

    const start = (event: MouseEvent | TouchEvent) => {
      drawingRef.current = true;
      const pos = getPos(event);
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
    };

    const move = (event: MouseEvent | TouchEvent) => {
      if (!drawingRef.current) return;
      const pos = getPos(event);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();
      event.preventDefault();
    };

    const end = () => {
      drawingRef.current = false;
      setSignature(canvas.toDataURL('image/png'));
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    canvas.addEventListener('mouseup', end);
    canvas.addEventListener('mouseleave', end);

    canvas.addEventListener('touchstart', start);
    canvas.addEventListener('touchmove', move, { passive: false });
    canvas.addEventListener('touchend', end);

    return () => {
      canvas.removeEventListener('mousedown', start);
      canvas.removeEventListener('mousemove', move);
      canvas.removeEventListener('mouseup', end);
      canvas.removeEventListener('mouseleave', end);
      canvas.removeEventListener('touchstart', start);
      canvas.removeEventListener('touchmove', move);
      canvas.removeEventListener('touchend', end);
    };
  }, []);

  const expectedDeliver = data?.stop.expected_deliver_count || 0;
  const deliveredCount = deliveredTags.size;
  const collectedCount = collectedTags.size;
  const missingCount = Math.max(0, deliveredCount - collectedCount);
  const stepTabs = [t('driver.stop.tabs.deliver'), t('driver.stop.tabs.collect'), t('driver.stop.tabs.signature')];

  const deliverByCategory = useMemo(() => {
    const base = new Map<string, { expected: number; scanned: number }>();
    for (const line of data?.items || []) {
      base.set(line.category_name, { expected: line.deliver_qty, scanned: 0 });
    }

    for (const row of recentResults) {
      if (row.result !== 'added' || !row.item?.category_name || scanMode !== 'deliver') continue;
      const name = row.item.category_name;
      const val = base.get(name) || { expected: 0, scanned: 0 };
      val.scanned += 1;
      base.set(name, val);
    }

    return Array.from(base.entries()).map(([name, val]) => ({
      category: name,
      expected: val.expected,
      scanned: val.scanned,
    }));
  }, [data?.items, recentResults, scanMode]);

  const handleScan = async (tag: string) => {
    if (!scanMode || !tag.trim()) return;

    const sessionId = scanMode === 'deliver' ? sessionDeliver.current : sessionCollect.current;
    const res = await fetch(`/api/driver/stops/${stopId}/scan`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tags: [tag.trim()],
        scan_type: scanMode,
        session_id: sessionId,
      }),
    });

    const json = await res.json();
    if (!res.ok) {
      setError(json.error || t('driver.stop.scanFailed'));
      return;
    }

    const first = json.results?.[0] as ScanResult | undefined;
    if (!first) return;

    setLastResult(first);
    setRecentResults((prev) => [first, ...prev].slice(0, 8));

    if (first.result === 'added') {
      if (scanMode === 'deliver') {
        setDeliveredTags((prev) => new Set([...prev, first.rfid_tag_id]));
      } else {
        setCollectedTags((prev) => new Set([...prev, first.rfid_tag_id]));
      }
    }
  };

  const clearSignature = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setSignature('');
  };

  const submitComplete = async () => {
    if (!receivedBy.trim() || !signature) {
      setError(t('driver.stop.signatureRequired'));
      return;
    }

    setSaving(true);
    setError('');

    const res = await fetch(`/api/driver/stops/${stopId}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        delivered_tags: Array.from(deliveredTags),
        collected_tags: Array.from(collectedTags),
        signature,
        received_by: receivedBy,
        completed_at: new Date().toISOString(),
      }),
    });

    const json = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(json.error || t('driver.stop.completeFailed'));
      return;
    }

    setStep(3);
  };

  if (loading) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Loader2 className="h-14 w-14 animate-spin text-indigo-300" />
      </div>
    );
  }

  if (!data) {
    return <p className="text-lg text-red-300">{error || t('driver.stop.stopNotFound')}</p>;
  }

  if (step === 3) {
    return (
      <div className="space-y-6 py-10 text-center">
        <div className="mx-auto grid h-24 w-24 place-items-center rounded-full bg-emerald-500/20">
          <CheckCircle2 className="h-16 w-16 text-emerald-400" />
        </div>
        <h2 className="text-4xl font-bold text-emerald-300">{t('driver.stop.completeTitle')} ✓</h2>
        <p className="text-xl">{data.stop.client_name} · {new Date().toLocaleTimeString(language === 'th' ? 'th-TH' : 'en-US', { hour: '2-digit', minute: '2-digit' })}</p>

        <div className="rounded-2xl bg-[#17213B] p-4 text-left text-lg">
          <p>{formatText(t('driver.stop.deliveredSummary'), { count: deliveredCount })}</p>
          <p>{formatText(t('driver.stop.collectedSummary'), { count: collectedCount })}</p>
          <p>{formatText(t('driver.stop.completeFactoryNotified'), { count: missingCount })}</p>
        </div>

        <button
          className="h-14 w-full rounded-xl bg-emerald-500 text-xl font-semibold text-[#0F1629]"
          onClick={() => router.push('/driver')}
        >
          {t('driver.stop.completeBackHome')}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-6">
      <div className="rounded-2xl bg-[#17213B] p-4">
        <h1 className="text-3xl font-bold">{data.stop.client_name}</h1>
        <p className="mt-2 text-lg text-slate-300">{t('driver.today.deliver')} {expectedDeliver} {t('driver.today.items')}</p>
      </div>

      <div className="grid grid-cols-3 gap-2">
        {stepTabs.map((tab, index) => (
          <button
            key={tab}
            onClick={() => setStep(index)}
            className={`min-h-14 rounded-xl px-2 text-sm font-semibold ${step === index ? 'bg-indigo-500 text-white' : 'bg-[#17213B] text-slate-300'}`}
          >
            {tab}
          </button>
        ))}
      </div>

      {step === 0 ? (
        <section className="space-y-4 rounded-2xl bg-[#17213B] p-4">
          <h2 className="text-2xl font-bold">{t('driver.stop.deliverTitle')}</h2>
          <div className="space-y-2 text-lg">
            {(data.items || []).map((item) => (
              <div key={item.category_id} className="flex items-center justify-between">
                <span>{item.category_name}</span>
                <span>×{item.deliver_qty}</span>
              </div>
            ))}
          </div>

          {scanMode !== 'deliver' ? (
            <button
              onClick={() => setScanMode('deliver')}
              className="h-20 w-full rounded-xl bg-indigo-500 text-2xl font-semibold"
            >
              📡 {t('driver.stop.startDeliverScan')}
            </button>
          ) : (
            <button
              onClick={() => setScanMode(null)}
              className="h-20 w-full rounded-xl bg-red-500 text-2xl font-semibold"
            >
              {t('driver.stop.stopScan')}
            </button>
          )}

          <div className="text-center">
            <p className="text-7xl font-bold">{deliveredCount}</p>
            <p className="text-lg text-slate-300">{t('driver.stop.scannedCount')}</p>
          </div>

          <div className="space-y-2 rounded-xl bg-[#0F1629] p-3 text-lg">
            {deliverByCategory.map((row) => (
              <div key={row.category} className="flex items-center justify-between">
                <span>{row.category}</span>
                <span>{row.scanned}/{row.expected}</span>
              </div>
            ))}
          </div>

          {lastResult ? (
            <div className={`rounded-xl p-3 text-lg ${lastResult.result === 'added' ? 'bg-emerald-500/20 text-emerald-300' : 'bg-red-500/20 text-red-300'}`}>
              {lastResult.result === 'added' ? '✓' : '✗'} {lastResult.rfid_tag_id} {lastResult.item?.category_name ? `· ${lastResult.item.category_name}` : ''}
              {lastResult.message ? ` · ${lastResult.message}` : ''}
            </div>
          ) : null}

          {deliveredCount >= expectedDeliver ? (
            <div className="space-y-2 rounded-xl bg-emerald-500/20 p-3 text-center">
              <p className="text-2xl font-bold text-emerald-300">{formatText(t('driver.stop.completeReached'), { count: expectedDeliver })} ✓</p>
              <button className="h-14 w-full rounded-xl bg-emerald-500 text-xl font-semibold text-[#0F1629]" onClick={() => setStep(1)}>
                {t('driver.stop.nextStep')} →
              </button>
            </div>
          ) : scanMode === null ? (
            <div className="space-y-2 rounded-xl bg-amber-500/20 p-3 text-center">
              <p className="text-xl">{formatText(t('driver.stop.scannedSummary'), { scanned: deliveredCount, expected: expectedDeliver })}</p>
              <div className="grid grid-cols-2 gap-2">
                <button className="h-14 rounded-xl bg-indigo-500 text-lg font-semibold" onClick={() => setScanMode('deliver')}>{t('driver.stop.scanMore')}</button>
                <button className="h-14 rounded-xl bg-amber-500 text-lg font-semibold text-[#0F1629]" onClick={() => setStep(1)}>{formatText(t('driver.stop.confirmPartial'), { count: deliveredCount })} ⚠</button>
              </div>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === 1 ? (
        <section className="space-y-4 rounded-2xl bg-[#17213B] p-4">
          <h2 className="text-2xl font-bold">{t('driver.stop.collectTitle')}</h2>
          <p className="text-lg text-slate-300">{formatText(t('driver.stop.collectEstimate'), { count: data.stop.expected_collect_count || Math.max(0, deliveredCount - 5) })}</p>

          {scanMode !== 'collect' ? (
            <button onClick={() => setScanMode('collect')} className="h-20 w-full rounded-xl bg-indigo-500 text-2xl font-semibold">
              📡 {t('driver.stop.startCollectScan')}
            </button>
          ) : (
            <button onClick={() => setScanMode(null)} className="h-20 w-full rounded-xl bg-red-500 text-2xl font-semibold">
              {formatText(t('driver.stop.stopCollectScan'), { count: collectedCount })}
            </button>
          )}

          <div className="text-center">
            <p className="text-7xl font-bold">{collectedCount}</p>
            <p className="text-lg text-slate-300">{t('driver.stop.collectedCount')}</p>
          </div>

          <button className="h-14 w-full rounded-xl bg-emerald-500 text-xl font-semibold text-[#0F1629]" onClick={() => setStep(2)}>
            {t('driver.stop.nextToSignature')}
          </button>
        </section>
      ) : null}

      {step === 2 ? (
        <section className="space-y-4 rounded-2xl bg-[#17213B] p-4">
          <h2 className="text-2xl font-bold">{t('driver.stop.signatureTitle')}</h2>

          <div className="rounded-xl bg-[#0F1629] p-3 text-lg">
            <p>{formatText(t('driver.stop.deliveredSummary'), { count: deliveredCount })} ✓</p>
            <p>{formatText(t('driver.stop.collectedSummary'), { count: collectedCount })}</p>
            <p>{formatText(t('driver.stop.missingSummary'), { count: missingCount })}</p>
          </div>

          <canvas
            ref={canvasRef}
            width={800}
            height={300}
            className="h-[300px] w-full rounded-xl border border-white/20 bg-[#0B1222]"
            style={{ touchAction: 'none' }}
          />

          <button className="h-14 w-full rounded-xl bg-slate-600 text-lg font-semibold" onClick={clearSignature}>
            {t('driver.stop.clearSignature')}
          </button>

          <div className="space-y-2">
            <label className="text-sm text-slate-300">{t('driver.stop.receivedByLabel')}</label>
            <input
              className="h-14 w-full rounded-xl border border-white/20 bg-[#0F1629] px-4 text-xl text-white"
              value={receivedBy}
              onChange={(e) => setReceivedBy(e.target.value)}
              placeholder={t('driver.stop.receivedByPlaceholder')}
            />
          </div>

          <button
            disabled={saving}
            className="flex h-14 w-full items-center justify-center rounded-xl bg-emerald-500 text-xl font-semibold text-[#0F1629] disabled:opacity-60"
            onClick={submitComplete}
          >
            {saving ? <Loader2 className="h-6 w-6 animate-spin" /> : t('driver.stop.submitAndComplete')}
          </button>
        </section>
      ) : null}

      <div className="rounded-xl bg-[#141E34] p-3">
        <p className="text-sm font-semibold text-slate-300">{t('driver.stop.recentScans')}</p>
        <div className="mt-2 flex flex-wrap gap-2 text-sm">
          {recentResults.map((row, idx) => (
            <span
              key={`${row.rfid_tag_id}-${row.result}-${idx}`}
              className={`rounded-full px-3 py-1 ${row.result === 'added' ? 'bg-emerald-500/20 text-emerald-300' : row.result === 'skipped' ? 'bg-amber-500/20 text-amber-300' : 'bg-red-500/20 text-red-300'}`}
            >
              {row.rfid_tag_id} {row.result === 'added' ? '✓' : row.result === 'skipped' ? '○' : '✗'}
            </span>
          ))}
          {recentResults.length === 0 ? <span className="text-slate-500">{t('driver.stop.noScansYet')}</span> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-xl bg-red-500/20 p-3 text-lg text-red-200">{error}</div>
      ) : null}

      {/*
       * ZEBRA TC52 DATAWEDGE SETUP:
       * 1. Open DataWedge app on TC52
       * 2. Create profile for "Laundr Driver"
       * 3. Associate with Chrome browser app
       * 4. Enable RFID input plugin
       * 5. Set keystroke output:
       *    - Add ENTER key suffix after each scan
       * 6. This hidden input captures the EPC + Enter
       *    and triggers handleScan()
       */}
      <input
        ref={scanInputRef}
        type="text"
        value={scanInputValue}
        onChange={(e) => setScanInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && scanInputValue.trim()) {
            e.preventDefault();
            handleScan(scanInputValue.trim());
            setScanInputValue('');
          }
        }}
        style={{ opacity: 0, position: 'absolute', pointerEvents: 'none' }}
      />

      <div className="rounded-xl bg-[#17213B] p-3">
        <p className="mb-2 text-sm text-slate-300">{t('driver.stop.manualEntry')}</p>
        <div className="grid grid-cols-[1fr_auto] gap-2">
          <input
            className="h-14 rounded-xl border border-white/20 bg-[#0F1629] px-4 text-lg"
            value={manualTag}
            onChange={(e) => setManualTag(e.target.value)}
            placeholder={t('driver.stop.manualPlaceholder')}
          />
          <button
            className="h-14 rounded-xl bg-indigo-500 px-4 text-lg font-semibold"
            onClick={() => {
              if (!manualTag.trim()) return;
              handleScan(manualTag.trim());
              setManualTag('');
            }}
          >
            {t('driver.stop.submitTag')}
          </button>
        </div>
      </div>
    </div>
  );
}
