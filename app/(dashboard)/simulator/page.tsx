'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import {
  AlertTriangle,
  Factory,
  Loader2,
  Play,
  RefreshCw,
  Rocket,
  Sunrise,
  Trash2,
  Truck,
} from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { RFIDReadEvent } from '@/lib/simulator/rfid-engine';
import {
  ScenarioProgress,
  ScenarioResult,
  SimulatorLogEntry,
  scenarioActivePickingScan,
  scenarioClientReturn,
  scenarioFullDay,
  scenarioMorningDispatch,
  scenarioProductionCycle,
  scenarioStressTest,
  seedHistoricalData,
} from '@/lib/simulator/scenarios';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { DEMO_ACTIVE_SESSION, DEMO_ORDERS, DEMO_ORG_ID } from '@/lib/demo/dashboard';

type ReaderType = 'fixed_gate' | 'handheld';
type RuntimeSpeed = 'realistic' | 'fast' | 'instant';
type Scale = 'small' | 'medium' | 'large';

type VisualTag = {
  id: string;
  epc: string;
  gate: 'A' | 'B';
  x: number;
  y: number;
  createdAt: number;
};

type OrderOption = {
  id: string;
  order_number: string;
};

function formatLogLine(row: SimulatorLogEntry): string {
  return `${row.timestamp},${row.level},${row.icon},"${row.message.replace(/"/g, '""')}"`;
}

function calcProgressPct(progress: ScenarioProgress | null): number {
  if (!progress || progress.total_items <= 0) return 0;
  return Math.min(100, (progress.processed_items / progress.total_items) * 100);
}

export default function AdvancedSimulatorPage() {
  const [orgId, setOrgId] = useState('');
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [demoMode, setDemoMode] = useState(false);

  const [readerType, setReaderType] = useState<ReaderType>('fixed_gate');
  const [speed, setSpeed] = useState<RuntimeSpeed>('fast');
  const [missRate, setMissRate] = useState(1.2);
  const [noiseEnabled, setNoiseEnabled] = useState(true);
  const [noiseTags, setNoiseTags] = useState(2);

  const [returnRate, setReturnRate] = useState(97);
  const [rewashRate, setRewashRate] = useState(3);
  const [dayScale, setDayScale] = useState<Scale>('small');

  const [stressItems, setStressItems] = useState(5000);
  const [stressGates, setStressGates] = useState(2);

  const [seedDays, setSeedDays] = useState(90);
  const [seedDailyVolume, setSeedDailyVolume] = useState(500);

  const [dispatchedOrders, setDispatchedOrders] = useState<OrderOption[]>([]);
  const [selectedReturnOrder, setSelectedReturnOrder] = useState('auto');

  const [logs, setLogs] = useState<SimulatorLogEntry[]>([]);
  const [progress, setProgress] = useState<ScenarioProgress | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState('');
  const [resetting, setResetting] = useState(false);
  const [activeSession, setActiveSession] = useState<{ id: string; order_id: string; order_number: string } | null>(null);

  const [visualTags, setVisualTags] = useState<VisualTag[]>([]);
  
  // Persistent log loading
  useEffect(() => {
    const saved = localStorage.getItem('laundrytrack_sim_logs');
    if (saved) {
      try {
        setLogs(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load logs', e);
      }
    }
  }, []);

  const progressSteps = useMemo(() => {
    if (!progress) return [];
    return Array.from({ length: progress.total_steps }).map((_, index) => ({
      index: index + 1,
      active: progress.current_step === index + 1,
      done: progress.current_step > index + 1,
    }));
  }, [progress]);

  const createDemoVisualization = useCallback((count: number) => {
    const timestamp = Date.now();
    return Array.from({ length: count }).map((_, index) => {
      const gate: 'A' | 'B' = Math.random() > 0.5 ? 'A' : 'B';
      return {
        id: `demo-${timestamp}-${index}`,
        epc: `E280-${String(timestamp + index).slice(-8)}`,
        gate,
        x: gate === 'A' ? 7 + Math.random() * 38 : 55 + Math.random() * 38,
        y: 18 + Math.random() * 70,
        createdAt: timestamp,
      } satisfies VisualTag;
    });
  }, []);

  const runDemoScenario = useCallback(async (label: string) => {
    const steps = [
      'Initializing readers',
      'Loading EPC burst',
      'Capturing gate traffic',
      'Validating operation state',
      'Publishing demo report',
    ];
    const totalItems = label === 'Stress Test' ? Math.max(800, stressItems) : label === 'Full Day Simulation' ? 420 : 96;
    const startedAt = Date.now();
    let processed = 0;
    let lastLatency = 0;

    const introLog: SimulatorLogEntry = {
      timestamp: new Date().toISOString(),
      level: 'info',
      icon: '🧪',
      message: `Demo mode active — ${label} runs locally without backend writes.`,
    };
    setLogs((prev) => [introLog, ...prev]);

    for (let stepIndex = 0; stepIndex < steps.length; stepIndex += 1) {
      await new Promise((resolve) => setTimeout(resolve, speed === 'instant' ? 80 : speed === 'fast' ? 260 : 700));
      const increment = stepIndex === steps.length - 1 ? totalItems - processed : Math.max(12, Math.round(totalItems / steps.length));
      processed = Math.min(totalItems, processed + increment);
      lastLatency = Number((4 + Math.random() * 18).toFixed(1));

      setVisualTags((prev) => [...prev.slice(-280), ...createDemoVisualization(Math.min(20, Math.max(8, Math.floor(increment / 6))))]);
      setProgress({
        scenario_name: label,
        current_step: stepIndex + 1,
        total_steps: steps.length,
        step_label: steps[stepIndex],
        processed_items: processed,
        total_items: totalItems,
        tags_per_second: Number((processed / Math.max(0.3, (Date.now() - startedAt) / 1000)).toFixed(1)),
        avg_latency_ms: lastLatency,
        errors: 0,
        last_events: [],
      });

      const stepLog: SimulatorLogEntry = {
        timestamp: new Date().toISOString(),
        level: 'success',
        icon: stepIndex === steps.length - 1 ? '✅' : '📡',
        message: `${steps[stepIndex]} — ${processed}/${totalItems} tags processed`,
      };
      setLogs((prev) => [stepLog, ...prev]);
    }

    setResult({
      scenario_name: label,
      duration_ms: Date.now() - startedAt,
      events_fired: totalItems,
      items_processed: totalItems,
      errors_encountered: 0,
      log: [],
      performance: {
        total_api_calls: 0,
        avg_latency_ms: lastLatency,
        p95_latency_ms: lastLatency + 4,
        p99_latency_ms: lastLatency + 7,
        throughput_items_per_sec: Number((totalItems / Math.max(0.5, (Date.now() - startedAt) / 1000)).toFixed(1)),
        peak_throughput_items_per_sec: Number((totalItems / Math.max(0.25, (Date.now() - startedAt) / 1400)).toFixed(1)),
        integrity: {
          expected_unique_tags: totalItems,
          observed_unique_tags: totalItems,
          duplicates_detected: noiseEnabled ? noiseTags : 0,
          status_consistency: 'PASS',
        },
      },
    });
  }, [createDemoVisualization, noiseEnabled, noiseTags, speed, stressItems]);

  const loadContext = useCallback(async () => {
    const supabase = createClient();
    const { data: orgData } = await supabase.rpc('get_current_org_id');
    const resolvedOrgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
    if (!resolvedOrgId) {
      setDemoMode(true);
      setOrgId(DEMO_ORG_ID);
      setDispatchedOrders(
        DEMO_ORDERS.filter((order) => order.status === 'dispatched').map((order) => ({
          id: order.id,
          order_number: order.order_number,
        }))
      );
      setSelectedReturnOrder('auto');
      setActiveSession(DEMO_ACTIVE_SESSION);
      setLoading(false);
      setError('demo_mode_no_backend_org');
      return;
    }

    setDemoMode(false);
    setOrgId(String(resolvedOrgId));

    const { data: orders } = await supabase
      .from('delivery_orders')
      .select('id, order_number')
      .eq('org_id', resolvedOrgId)
      .eq('status', 'dispatched')
      .order('dispatched_at', { ascending: false })
      .limit(20);

    const mapped = (orders || []).map((o) => ({ id: String(o.id), order_number: String(o.order_number) }));
    setDispatchedOrders(mapped);
    setSelectedReturnOrder((prev) => (prev === 'auto' ? prev : mapped[0]?.id || 'auto'));
    
    // Check for active picking session
    const { data: activeData } = await supabase
      .from('active_sessions')
      .select('id, order_id, delivery_orders(order_number)')
      .eq('org_id', resolvedOrgId)
      .eq('is_active', true)
      .eq('session_type', 'picking')
      .maybeSingle();

    if (activeData) {
      setActiveSession({
        id: String(activeData.id),
        order_id: String(activeData.order_id),
        order_number: (activeData.delivery_orders as any)?.order_number || 'Unknown',
      });
    } else {
      setActiveSession(null);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  useEffect(() => {
    if (!visualTags.length) return;
    const timer = setInterval(() => {
      const cutoff = Date.now() - 2200;
      setVisualTags((prev) => prev.filter((tag) => tag.createdAt >= cutoff));
    }, 180);
    return () => clearInterval(timer);
  }, [visualTags.length]);

  useEffect(() => {
    if (!orgId || running || demoMode) return;
    const interval = setInterval(() => {
      loadContext();
    }, 10000); // Slower polling since we have realtime
    return () => clearInterval(interval);
  }, [demoMode, orgId, running, loadContext]);

  // Realtime subscription for active sessions
  useEffect(() => {
    if (!orgId || demoMode) return;
    const supabase = createClient();
    const channel = supabase.channel('sim-active-sessions')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'active_sessions',
        filter: `org_id=eq.${orgId}`
      }, () => {
        loadContext();
      })
      .subscribe();
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [demoMode, orgId, loadContext]);

  const hooks = useMemo(
    () => ({
      speed,
      reader_config: {
        reader_type: readerType,
        miss_rate: missRate,
        noise_tags: noiseEnabled ? noiseTags : 0,
      },
      onLog: (entry: SimulatorLogEntry) => setLogs((prev) => {
        const next = [entry, ...prev].slice(0, 1500);
        localStorage.setItem('laundrytrack_sim_logs', JSON.stringify(next));
        return next;
      }),
      onProgress: (next: ScenarioProgress) => setProgress(next),
      onVisualization: (events: RFIDReadEvent[]) => {
        const mapped = events.slice(0, 50).map((event, i) => ({
          id: `${event.epc}-${event.timestamp}-${i}`,
          epc: event.epc,
          gate: event.antenna % 2 === 0 ? 'B' : 'A',
          x: event.antenna % 2 === 0 ? 55 + Math.random() * 38 : 7 + Math.random() * 38,
          y: 18 + Math.random() * 70,
          createdAt: Date.now(),
        } satisfies VisualTag));
        setVisualTags((prev) => [...prev.slice(-280), ...mapped]);
      },
    }),
    [speed, readerType, missRate, noiseEnabled, noiseTags]
  );

  const runScenario = useCallback(
    async (label: string, fn: () => Promise<ScenarioResult>) => {
      setRunning(true);
      setError('');
      setResult(null);
      setProgress(null);
      setLogs((prev) => [{ timestamp: new Date().toISOString(), level: 'info', icon: '🟢', message: `Session started - ${label}` }, ...prev]);

      try {
        if (demoMode) {
          await runDemoScenario(label);
        } else {
          const scenarioResult = await fn();
          setResult(scenarioResult);
          await loadContext();
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'scenario_failed');
      } finally {
        setRunning(false);
      }
    },
    [demoMode, loadContext, runDemoScenario]
  );

  const handleReset = useCallback(async () => {
    if (!confirm('Reset all simulation data? linen_items will be restored to clean. This cannot be undone.')) return;
    setResetting(true);
    setError('');
    try {
      const res = await fetch('/api/simulator/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'reset_failed');
      
      const stats = data.data;
      setLogs((prev) => [
        { 
          timestamp: new Date().toISOString(), 
          level: 'success', 
          icon: '✨', 
          message: `Database Reset Successful: Seeded ${stats.items_seeded.toLocaleString()} items across ${stats.categories_seeded} categories, and created ${stats.orders_seeded} default orders.` 
        },
        ...prev,
      ]);
      setResult(null);
      setProgress(null);
      await loadContext();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'reset_failed');
    } finally {
      setResetting(false);
    }
  }, [loadContext]);

  const clearLogs = () => {
    setLogs([]);
    localStorage.removeItem('laundrytrack_sim_logs');
  };

  const exportCsv = () => {
    const header = 'timestamp,level,icon,message';
    const csv = [header, ...logs.slice().reverse().map(formatLogLine)].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `simulator-log-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="grid min-h-[70vh] place-items-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
      </div>
    );
  }

  return (
    <div className="grid h-[calc(100vh-6rem)] grid-cols-[280px_1fr_300px] gap-4">
      <div className="space-y-3 overflow-y-auto pr-1">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Reader Configuration</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Reader Type</Label>
              <Select value={readerType} onValueChange={(v: ReaderType) => setReaderType(v)} disabled={running}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed_gate">Fixed Gate</SelectItem>
                  <SelectItem value="handheld">Handheld</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Read Speed</Label>
              <Select value={speed} onValueChange={(v: RuntimeSpeed) => setSpeed(v)} disabled={running}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="realistic">Realistic</SelectItem>
                  <SelectItem value="fast">Fast</SelectItem>
                  <SelectItem value="instant">Instant</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs">
                <Label>Miss Rate</Label>
                <span>{missRate.toFixed(1)}%</span>
              </div>
              <Slider value={[missRate]} onValueChange={(v) => setMissRate(v[0] ?? 1)} min={0.5} max={3} step={0.1} disabled={running} />
            </div>

            <div className="space-y-2 rounded-md border p-2">
              <div className="flex items-center justify-between">
                <Label>Noise Tags</Label>
                <Switch checked={noiseEnabled} onCheckedChange={setNoiseEnabled} disabled={running} />
              </div>
              <Input
                type="number"
                min={0}
                max={5}
                value={noiseTags}
                onChange={(e) => setNoiseTags(Math.max(0, Math.min(5, Number(e.target.value || 0))))}
                disabled={running || !noiseEnabled}
              />
            </div>

            {activeSession && (
              <div className="mt-4 rounded-lg border-2 border-indigo-500/20 bg-indigo-50/50 p-3 space-y-3 shadow-inner">
                <div className="flex items-center justify-between border-b border-indigo-100 pb-2">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse" />
                    <Label className="text-xs font-bold text-indigo-900 uppercase tracking-wider">Reader Active</Label>
                  </div>
                  <Badge variant="outline" className="text-[10px] h-5 bg-white text-indigo-600 border-indigo-200">
                    Order {activeSession.order_number}
                  </Badge>
                </div>
                
                <div className="space-y-2">
                  <p className="text-[10px] text-indigo-600 uppercase font-medium">Simulation Control</p>
                  <Button
                    disabled={running}
                    size="sm"
                    className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
                    onClick={() => runScenario(`Scan ${activeSession.order_number}`, () => 
                      scenarioActivePickingScan({ org_id: orgId, order_id: activeSession.order_id, hooks })
                    )}
                  >
                    <RefreshCw className={`mr-2 h-3.5 w-3.5 ${running ? 'animate-spin' : ''}`} />
                    Feed RFID Burst
                  </Button>
                </div>
                
                <p className="text-[10px] text-center text-slate-400 italic">
                  Sends missing tags for this picking session
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm">Scenarios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Button
              disabled={running}
              className="h-12 w-full justify-start"
              variant="outline"
              onClick={() => runScenario('Morning Dispatch', () => scenarioMorningDispatch({ org_id: orgId, hooks }))}
            >
              <Sunrise className="mr-2 h-4 w-4" /> Morning Dispatch
            </Button>

            <div className="rounded-md border p-2 space-y-2">
              <Label className="text-xs">Client Return Order</Label>
              <Select value={selectedReturnOrder} onValueChange={setSelectedReturnOrder} disabled={running}>
                <SelectTrigger className="h-8"><SelectValue placeholder="Auto" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto latest dispatched</SelectItem>
                  {dispatchedOrders.map((order) => (
                    <SelectItem key={order.id} value={order.id}>{order.order_number}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs"><span>Return rate</span><span>{returnRate}%</span></div>
                <Slider value={[returnRate]} onValueChange={(v) => setReturnRate(v[0] ?? 97)} min={90} max={100} step={1} disabled={running} />
              </div>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs"><span>Rewash rate</span><span>{rewashRate}%</span></div>
                <Slider value={[rewashRate]} onValueChange={(v) => setRewashRate(v[0] ?? 3)} min={0} max={15} step={1} disabled={running} />
              </div>
              <Button
                disabled={running}
                className="h-10 w-full justify-start"
                variant="outline"
                onClick={() =>
                  runScenario('Client Return', () =>
                    scenarioClientReturn({
                      org_id: orgId,
                      order_id: selectedReturnOrder === 'auto' ? undefined : selectedReturnOrder,
                      return_rate: returnRate / 100,
                      rewash_rate: rewashRate / 100,
                      hooks,
                    })
                  )
                }
              >
                <RefreshCw className="mr-2 h-4 w-4" /> Client Return
              </Button>
            </div>

            <Button
              disabled={running}
              className="h-12 w-full justify-start"
              variant="outline"
              onClick={() => runScenario('Production Cycle', () => scenarioProductionCycle({ org_id: orgId, hooks }))}
            >
              <Factory className="mr-2 h-4 w-4" /> Production Cycle
            </Button>

            <div className="rounded-md border p-2 space-y-2">
              <Label className="text-xs">Full Day Scale</Label>
              <Select value={dayScale} onValueChange={(v: Scale) => setDayScale(v)} disabled={running}>
                <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>
              <Button
                disabled={running}
                className="h-10 w-full justify-start"
                variant="outline"
                onClick={() => runScenario('Full Day Simulation', () => scenarioFullDay({ org_id: orgId, scale: dayScale, hooks }))}
              >
                <Truck className="mr-2 h-4 w-4" /> Full Day Simulation
              </Button>
            </div>

            <div className="rounded-md border p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Stress Items</Label>
                  <Input type="number" value={stressItems} onChange={(e) => setStressItems(Number(e.target.value || 1000))} disabled={running} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Gates</Label>
                  <Input type="number" value={stressGates} onChange={(e) => setStressGates(Number(e.target.value || 2))} disabled={running} />
                </div>
              </div>
              <Button
                disabled={running}
                className="h-10 w-full justify-start"
                variant="outline"
                onClick={() => runScenario('Stress Test', () => scenarioStressTest({ org_id: orgId, items_count: stressItems, concurrent_gates: stressGates, hooks }))}
              >
                <Rocket className="mr-2 h-4 w-4" /> Stress Test
              </Button>
            </div>

            <div className="rounded-md border p-2 space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label className="text-xs">Days</Label>
                  <Input type="number" value={seedDays} onChange={(e) => setSeedDays(Number(e.target.value || 30))} disabled={running} />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Volume/day</Label>
                  <Input type="number" value={seedDailyVolume} onChange={(e) => setSeedDailyVolume(Number(e.target.value || 500))} disabled={running} />
                </div>
              </div>
              <Button
                disabled={running}
                className="h-10 w-full justify-start"
                variant="outline"
                onClick={() => runScenario('Historical Seed', () => seedHistoricalData({ org_id: orgId, days_back: seedDays, daily_volume: seedDailyVolume, hooks }))}
              >
                <Play className="mr-2 h-4 w-4" /> Seed Historical Data
              </Button>
            </div>

            <div className="border-t pt-2">
              <Button
                disabled={running || resetting || demoMode}
                className="h-10 w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50 border-red-200"
                variant="outline"
                onClick={handleReset}
              >
                {resetting
                  ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  : <Trash2 className="mr-2 h-4 w-4" />}
                Reset Database
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-4 overflow-y-auto">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Live RFID Visualization</CardTitle>
            <p className="text-sm text-slate-500">Tags appear as antennas capture EPC bursts.</p>
          </CardHeader>
          <CardContent>
            <div className="relative h-72 w-full overflow-hidden rounded-lg border bg-slate-950 text-slate-100">
              <svg className="h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <rect x="2" y="8" width="46" height="84" rx="4" className="fill-indigo-500/10 stroke-indigo-400/40" />
                <rect x="52" y="8" width="46" height="84" rx="4" className="fill-emerald-500/10 stroke-emerald-400/40" />
                <text x="6" y="14" fill="white" fontSize="4">GATE A</text>
                <text x="56" y="14" fill="white" fontSize="4">GATE B</text>

                {visualTags.map((tag) => (
                  <g key={tag.id} style={{ opacity: Math.max(0.15, 1 - (Date.now() - tag.createdAt) / 2000) }}>
                    <rect x={tag.x} y={tag.y} width="16" height="5" rx="1.5" className={tag.gate === 'A' ? 'fill-indigo-500/70' : 'fill-emerald-500/70'} />
                    <text x={tag.x + 0.8} y={tag.y + 3.4} fill="white" fontSize="1.6">{tag.epc.slice(-8)}</text>
                  </g>
                ))}
              </svg>
            </div>

            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>{progress?.processed_items ?? 0} / {progress?.total_items ?? 0} items</span>
                <span>{calcProgressPct(progress).toFixed(1)}%</span>
              </div>
              <Progress value={calcProgressPct(progress)} />
            </div>

            <div className="mt-4 space-y-2">
              <p className="text-sm font-medium">Current Step</p>
              <div className="space-y-1">
                {progressSteps.map((step) => (
                  <div key={step.index} className="flex items-center gap-2 text-sm">
                    <span>{step.active ? '●' : step.done ? '✓' : '○'}</span>
                    <span className={step.active ? 'font-semibold text-slate-900' : 'text-slate-500'}>
                      Step {step.index}
                    </span>
                  </div>
                ))}
                {progress?.step_label ? <p className="text-xs text-slate-500">{progress.step_label}</p> : null}
              </div>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
              <div className="rounded border p-2">
                <p className="text-slate-500">Tags/sec</p>
                <p className="text-lg font-semibold">{progress?.tags_per_second ?? 0}</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-slate-500">API latency</p>
                <p className="text-lg font-semibold">{progress?.avg_latency_ms ?? 0}ms</p>
              </div>
              <div className="rounded border p-2">
                <p className="text-slate-500">Errors</p>
                <p className="text-lg font-semibold">{progress?.errors ?? 0}</p>
              </div>
            </div>

            {result?.performance ? (
              <Card className="mt-4 border-slate-200">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Throughput Report</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <p>Total items processed: {result.items_processed.toLocaleString()}</p>
                  <p>Total time: {(result.duration_ms / 1000).toFixed(1)}s</p>
                  <p>Average throughput: {result.performance.throughput_items_per_sec.toLocaleString()} items/sec</p>
                  <p>Peak throughput: {result.performance.peak_throughput_items_per_sec.toLocaleString()} items/sec</p>
                  <p>API calls: {result.performance.total_api_calls}</p>
                  <p>Avg/P95/P99 latency: {result.performance.avg_latency_ms} / {result.performance.p95_latency_ms} / {result.performance.p99_latency_ms} ms</p>
                  <p>Integrity: {result.performance.integrity.status_consistency} ({result.performance.integrity.observed_unique_tags}/{result.performance.integrity.expected_unique_tags})</p>
                </CardContent>
              </Card>
            ) : null}

            {error ? (
              <div className="mt-4 rounded-md border border-red-300 bg-red-50 p-2 text-sm text-red-700">
                <AlertTriangle className="mr-1 inline h-4 w-4" />
                {error}
              </div>
            ) : null}
            {demoMode ? (
              <div className="mt-3 rounded-md border border-indigo-200 bg-indigo-50 p-2 text-xs text-indigo-700">
                Demo mode is active. Scenarios animate, progress updates, and logs are generated locally while the Dev backend org is unavailable.
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <div className="h-full">
        <Card className="flex h-full flex-col">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm">Event Log</CardTitle>
              <div className="flex gap-1">
                <Button size="sm" variant="outline" onClick={exportCsv} disabled={!logs.length}>Export CSV</Button>
                <Button size="sm" variant="ghost" onClick={clearLogs} disabled={!logs.length}>Clear</Button>
              </div>
            </div>
            <p className="text-sm text-slate-500">{logs.length.toLocaleString()} entries</p>
          </CardHeader>
          <CardContent className="min-h-0 flex-1">
            <ScrollArea className="h-full pr-2">
              <div className="space-y-2">
                {logs.map((row, idx) => (
                  <div key={`${row.timestamp}-${idx}`} className="rounded-md border p-2 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <span>{row.icon}</span>
                        <Badge variant={row.level === 'error' ? 'destructive' : row.level === 'warn' ? 'outline' : 'secondary'}>
                          {row.level}
                        </Badge>
                      </div>
                      <span className="text-slate-500">{formatDistanceToNow(new Date(row.timestamp), { addSuffix: true })}</span>
                    </div>
                    <p className="mt-1 leading-relaxed">{row.message}</p>
                  </div>
                ))}
                {!logs.length ? <p className="py-8 text-center text-xs text-slate-500">Waiting for simulator events...</p> : null}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
