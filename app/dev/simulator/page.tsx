"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  runScanOut,
  runScanIn,
  runHandheldAudit,
  runSimulateLoss,
  runFullDaySimulation,
  runScanOutViaRoute,
  SpeedMode,
  SimulationProgress
} from "@/lib/simulator/scenarios";
import { AlertTriangle, Loader2 } from "lucide-react";
import { formatDistanceToNow } from "date-fns";

type ClientData = { id: string; name: string; org_id: string };
type RouteData = { id: string; name: string; status: string; stops: any[] };
type SimLog = { id: string; action: string; created_at: string; snapshot: Record<string, number> };

export default function SimulatorPage() {
  const [clients, setClients] = useState<ClientData[]>([]);
  const [orgId, setOrgId] = useState<string>("");

  const [selectedClient, setSelectedClient] = useState<string>("");
  const [gate, setGate] = useState<string>("gate_a");
  const [speed, setSpeed] = useState<SpeedMode>("normal");
  const [itemCount, setItemCount] = useState<number>(20);

  const [routes, setRoutes] = useState<RouteData[]>([]);
  const [selectedRoute, setSelectedRoute] = useState<string>("");

  const [manualTag, setManualTag] = useState<string>("");
  const [manualEvent, setManualEvent] = useState<string>("audit");

  const [progress, setProgress] = useState<SimulationProgress | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);

  const [logs, setLogs] = useState<any[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Reset state
  const [resetOpen, setResetOpen] = useState(false);
  const [resetConfirm, setResetConfirm] = useState("");
  const [resetting, setResetting] = useState(false);
  const [resetResult, setResetResult] = useState<Record<string, number> | null>(null);

  // Sim logs history
  const [simLogs, setSimLogs] = useState<SimLog[]>([]);

  useEffect(() => {
    async function loadInitialData() {
      const supabase = createClient();
      
      // Get orgId using the same logic as the dashboard for consistency
      const { data: orgData } = await supabase.rpc('get_current_org_id');
      const oid = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
      
      if (oid) {
        setOrgId(oid);
        const { data: clientsData } = await supabase.from('clients').select('id, name, org_id').eq('org_id', oid);
        if (clientsData) setClients(clientsData);
        const { data: routesData } = await supabase.from('routes').select('id, name, status, stops').eq('org_id', oid).in('status', ['pending', 'in_progress']).order('created_at', { ascending: false });
        if (routesData) { setRoutes(routesData as RouteData[]); if (routesData.length > 0) setSelectedRoute(routesData[0].id); }
        loadSimLogs(supabase, oid);
      }
    }
    loadInitialData();
  }, []);

  const loadSimLogs = async (supabase: ReturnType<typeof createClient>, oid: string) => {
    const { data } = await supabase
      .from('simulator_logs')
      .select('id, action, created_at, snapshot')
      .eq('org_id', oid)
      .order('created_at', { ascending: false })
      .limit(10);
    if (data) setSimLogs(data as SimLog[]);
  };

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const handleProgress = (p: SimulationProgress) => {
    setProgress(p);
    if (p.logs && p.logs.length > 0) {
      setLogs((prev) => [...prev, ...p.logs]);
    }
    if (p.isComplete) setIsSimulating(false);
  };

  const wrapScenario = async (scenarioFn: () => Promise<void>) => {
    setIsSimulating(true);
    await scenarioFn();
  };

  const handleRouteSimulate = () => wrapScenario(() => runScanOutViaRoute(orgId, selectedRoute, speed, handleProgress));

  const handleScanOut  = () => wrapScenario(() => runScanOut(orgId, selectedClient, gate, itemCount, speed, handleProgress));
  const handleScanIn   = () => wrapScenario(() => runScanIn(orgId, selectedClient, gate, itemCount, speed, handleProgress));
  const handleAudit    = () => wrapScenario(() => runHandheldAudit(orgId, gate, speed, handleProgress));
  const handleLoss     = () => wrapScenario(() => runSimulateLoss(orgId, handleProgress));
  const handleFullDay  = () => wrapScenario(() => runFullDaySimulation(orgId, handleProgress));

  const fireManual = async () => {
    if (!manualTag) return;
    setIsSimulating(true);

    setProgress({ current: 0, total: 1, message: 'Firing manual event...', isComplete: false, logs: [] });
    const payload = {
      org_id: orgId,
      rfid_tag_id: manualTag,
      gate_id: gate,
      event_type: manualEvent,
      client_id: selectedClient || null,
      source: 'simulator_manual'
    };
    try {
      const res = await fetch('/api/scan-events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const result = await res.json();
      
      if (!result.success && !result.skipped) {
        throw new Error(result.error || 'Server error');
      }
      
      handleProgress({ current: 1, total: 1, message: result.skipped ? 'Skipped (Duplicate)' : 'Fired.', isComplete: true, logs: [{ ...payload, timestamp: new Date().toISOString() }] });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Error';
      console.error('❌ Manual Fire Error:', msg);
      handleProgress({ current: 0, total: 1, message: `Error: ${msg}`, isComplete: true, logs: [] });
    }
    setIsSimulating(false);
  };

  const handleReset = async () => {
    if (resetConfirm !== 'RESET') return;
    setResetting(true);
    try {
      const res = await fetch('/api/simulator/reset', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setResetResult(data.deleted);
      setResetConfirm('');
      // Reload sim logs
      const supabase = createClient();
      loadSimLogs(supabase, orgId);
    } catch (e) {
      console.error('Reset failed:', e);
    }
    setResetting(false);
  };

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* Left Column: Control Panel */}
      <div className="w-[500px] bg-white border-r flex flex-col h-full overflow-y-auto">
        <div className="p-6 border-b bg-slate-900 text-white flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">RFID Hardware Simulator</h1>
            <p className="text-sm text-slate-400">Environment: Development</p>
          </div>
          <Badge variant="destructive">SIMULATOR MODE</Badge>
        </div>

        <div className="p-6 space-y-8 flex-1">
          {/* 1. Context Selectors */}
          <div className="space-y-4">
            <h3 className="font-medium text-slate-900 border-b pb-2">1. Context Selectors</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Client (Target)</Label>
                <Select value={selectedClient} onValueChange={setSelectedClient} disabled={isSimulating}>
                  <SelectTrigger className="bg-white border-slate-200">
                    <SelectValue placeholder="Select Client" />
                  </SelectTrigger>
                  <SelectContent>
                    {clients.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Gate Source</Label>
                <Select value={gate} onValueChange={setGate} disabled={isSimulating}>
                  <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="gate_a">Gate A</SelectItem>
                    <SelectItem value="gate_b">Gate B</SelectItem>
                    <SelectItem value="handheld_1">Handheld 1</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Simulation Speed</Label>
                <Select value={speed} onValueChange={(val: any) => setSpeed(val)} disabled={isSimulating}>
                  <SelectTrigger className="bg-white border-slate-200"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="slow">Slow (1s)</SelectItem>
                    <SelectItem value="normal">Normal (0.3s)</SelectItem>
                    <SelectItem value="fast">Fast (Instant)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-3 bg-slate-50 p-3 rounded-lg border border-slate-100">
                <div className="flex justify-between items-center">
                  <Label className="font-bold text-slate-700">Item Count</Label>
                  <Badge variant="outline" className="bg-white font-mono">{itemCount}</Badge>
                </div>
                <Slider 
                  value={[itemCount]} 
                  onValueChange={(val) => setItemCount(val[0])} 
                  min={5} 
                  max={200} 
                  step={5} 
                  disabled={isSimulating} 
                  className="py-4" 
                />
              </div>
            </div>
          </div>

          {/* Progress */}
          {progress && (
            <div className="space-y-2 bg-slate-100 p-4 rounded-lg">
              <div className="flex justify-between text-sm">
                <span className="font-medium">{progress.message}</span>
                <span>{progress.current} / {progress.total}</span>
              </div>
              <Progress value={progress.total > 0 ? (progress.current / progress.total) * 100 : 0} className="h-2" />
            </div>
          )}

          {/* 2. Scenarios */}
          <div className="space-y-4">
            <h3 className="font-medium text-slate-900 border-b pb-2">2. Scenarios</h3>
            <div className="grid grid-cols-1 gap-3">
              <Button onClick={handleScanOut} disabled={isSimulating || !selectedClient} className="w-full justify-start h-12" variant="outline">
                <span className="w-2 h-2 rounded-full bg-orange-500 mr-3"></span>
                Scan OUT (Checkout to Client)
              </Button>
              <Button onClick={handleScanIn} disabled={isSimulating || !selectedClient} className="w-full justify-start h-12" variant="outline">
                <span className="w-2 h-2 rounded-full bg-green-500 mr-3"></span>
                Scan IN (Checkin from Client)
              </Button>
              <Button onClick={handleAudit} disabled={isSimulating} className="w-full justify-start h-12" variant="outline">
                <span className="w-2 h-2 rounded-full bg-blue-500 mr-3"></span>
                Handheld Audit (In Stock items)
              </Button>
              <Button onClick={handleLoss} disabled={isSimulating} className="w-full justify-start h-12" variant="secondary">
                Simulate Loss (Random OUT items)
              </Button>
              <Button onClick={handleFullDay} disabled={isSimulating} className="w-full justify-start h-12 mt-4">
                Run Full Day Simulation (Automated Sequence)
              </Button>
            </div>
          </div>

          {/* 3. Manual Tag */}
          <div className="space-y-4">
            <h3 className="font-medium text-slate-900 border-b pb-2">3. Manual Single Tag</h3>
            <div className="flex gap-2">
              <Input placeholder="TG-BS-..." value={manualTag} onChange={(e) => setManualTag(e.target.value)} disabled={isSimulating} />
              <Select value={manualEvent} onValueChange={setManualEvent} disabled={isSimulating}>
                <SelectTrigger className="w-[120px] bg-white border-slate-200"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="checkout">OUT</SelectItem>
                  <SelectItem value="checkin">IN</SelectItem>
                  <SelectItem value="rewash">REWASH</SelectItem>
                  <SelectItem value="reject">REJECT</SelectItem>
                  <SelectItem value="audit">AUDIT</SelectItem>
                </SelectContent>
              </Select>
              <Button onClick={fireManual} disabled={isSimulating || !manualTag}>Fire</Button>
            </div>
          </div>

          {/* 4. Route Simulation */}
          <div className="space-y-4">
            <h3 className="font-medium text-slate-900 border-b pb-2">4. Route Simulation</h3>
            <p className="text-xs text-slate-500">
              Simulates a full route dispatch: checkout items per stop → auto-sign manifest → fires delivery_signed events → items become <strong>out</strong>.
            </p>
            {routes.length === 0 ? (
              <p className="text-xs text-amber-600 bg-amber-50 px-3 py-2 rounded-lg border border-amber-100">
                No pending routes found. Create a route in Logistics first.
              </p>
            ) : (
              <div className="space-y-3">
                <div className="space-y-2">
                  <Label>Route</Label>
                  <Select value={selectedRoute} onValueChange={setSelectedRoute} disabled={isSimulating}>
                    <SelectTrigger className="bg-white border-slate-200">
                      <SelectValue placeholder="Select Route" />
                    </SelectTrigger>
                    <SelectContent>
                      {routes.map(r => (
                        <SelectItem key={r.id} value={r.id}>
                          {r.name} — {(r.stops as any[]).length} stop(s) [{r.status}]
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={handleRouteSimulate}
                  disabled={isSimulating || !selectedRoute}
                  className="w-full justify-start h-12 bg-indigo-600 hover:bg-indigo-700 text-white"
                >
                  <span className="w-2 h-2 rounded-full bg-white mr-3"></span>
                  Dispatch Route (Checkout → Sign → Delivered)
                </Button>
              </div>
            )}
          </div>

          {/* ── Danger Zone ───────────────────────────────────── */}
          <div className="border border-red-200 rounded-xl p-5">
            <h3 className="text-sm font-semibold text-red-700 mb-1 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4" />
              Danger Zone
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              Reset all test data back to seed state. This cannot be undone. All scan events, routes, and invoices will be deleted.
            </p>
            <Button
              variant="destructive"
              size="sm"
              className="w-full"
              onClick={() => { setResetOpen(true); setResetResult(null); }}
              disabled={isSimulating}
            >
              Clear Test Data
            </Button>
          </div>

          {/* ── Simulator Log History ─────────────────────────── */}
          {simLogs.length > 0 && (
            <div className="space-y-2 pb-6">
              <h3 className="font-medium text-slate-900 border-b pb-2 text-sm">Simulator Action Log</h3>
              <div className="space-y-1.5">
                {simLogs.map(log => (
                  <div key={log.id} className="flex items-start justify-between text-xs bg-slate-50 rounded-lg p-2.5 border border-slate-100">
                    <div>
                      <span className="font-mono font-bold uppercase text-slate-700">{log.action.replace('_', ' ')}</span>
                      {log.snapshot && (
                        <p className="text-slate-400 mt-0.5">
                          {Object.entries(log.snapshot).map(([k, v]) => `${v} ${k}`).join(', ')}
                        </p>
                      )}
                    </div>
                    <span className="text-slate-400 shrink-0 ml-2">
                      {formatDistanceToNow(new Date(log.created_at), { addSuffix: true })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Right Column: Event Log */}
      <div className="flex-1 flex flex-col bg-slate-950 text-slate-300">
        <div className="p-4 border-b border-slate-800 flex justify-between items-center bg-slate-900">
          <h2 className="font-mono text-sm uppercase tracking-wider text-slate-400">Live Event Log</h2>
          <Button variant="ghost" size="sm" onClick={() => setLogs([])} className="h-8 text-xs hover:text-white">
            Clear Log
          </Button>
        </div>
        <ScrollArea className="flex-1 p-4" ref={scrollRef as any}>
          {logs.length === 0 ? (
            <div className="h-full flex items-center justify-center text-slate-600 font-mono text-sm py-20">
              Waiting for simulator events...
            </div>
          ) : (
            <div className="space-y-1">
              {logs.map((log, idx) => (
                <div key={idx} className="flex gap-4 py-1.5 border-b border-slate-800/50 hover:bg-slate-800/20 font-mono text-xs">
                  <span className="text-slate-500 min-w-[150px]">{log.timestamp}</span>
                  <span className={`min-w-[80px] font-bold ${
                    log.event_type === 'checkin' ? 'text-green-400' :
                    log.event_type === 'checkout' ? 'text-orange-400' :
                    log.event_type === 'rewash' ? 'text-indigo-400' :
                    log.event_type === 'audit' ? 'text-blue-400' : 'text-red-400'
                  }`}>
                    [{log.event_type?.toUpperCase()}]
                  </span>
                  <span className="text-white min-w-[120px]">{log.rfid_tag_id}</span>
                  <span className="text-slate-400 min-w-[80px]">{log.gate_id}</span>
                  {log.client_id && <span className="text-slate-500">Client: {log.client_id.slice(0, 8)}...</span>}
                </div>
              ))}
              <div ref={scrollRef as any} />
            </div>
          )}
        </ScrollArea>
      </div>

      {/* Reset Confirmation Dialog */}
      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <AlertTriangle className="w-5 h-5" />
              Clear Test Data
            </DialogTitle>
            <DialogDescription>
              This will delete all scan events, routes, rewash records, delivery batches, and invoices.
              Linen items will be reset to <strong>in_stock</strong> status. This cannot be undone.
            </DialogDescription>
          </DialogHeader>

          {resetResult ? (
            <div className="space-y-3">
              <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                <p className="text-sm font-semibold text-emerald-700 mb-2">Reset complete.</p>
                <div className="grid grid-cols-2 gap-1 text-xs text-emerald-600">
                  {Object.entries(resetResult).map(([k, v]) => (
                    <span key={k}>{k}: {v} deleted</span>
                  ))}
                </div>
              </div>
              <Button className="w-full" onClick={() => setResetOpen(false)}>Close</Button>
            </div>
          ) : (
            <div className="space-y-4">
              <div>
                <Label htmlFor="confirm-input" className="text-sm font-medium text-slate-700">
                  Type <strong className="text-red-600">RESET</strong> to confirm
                </Label>
                <Input
                  id="confirm-input"
                  className="mt-1.5"
                  placeholder="Type RESET"
                  value={resetConfirm}
                  onChange={(e) => setResetConfirm(e.target.value)}
                />
              </div>
              <div className="flex gap-2">
                <Button variant="outline" className="flex-1" onClick={() => setResetOpen(false)}>
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  className="flex-1"
                  disabled={resetConfirm !== 'RESET' || resetting}
                  onClick={handleReset}
                >
                  {resetting ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Resetting...</> : 'Clear Everything'}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
