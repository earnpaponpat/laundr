"use client";

import { useLanguage } from "@/lib/i18n/LanguageContext";
import { Scan, Radio, History, Play, AlertCircle, CheckCircle2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useState } from "react";
import { useNotifications } from "@/lib/contexts/NotificationContext";

export default function ManualScanPage() {
  const { t } = useLanguage();
  const { success, error } = useNotifications();
  const [tagId, setTagId] = useState("");
  const [scanning, setScanning] = useState(false);
  const [scans, setScans] = useState<any[]>([
    { id: '1', rfid: 'E28011912000720A', time: '14:30:12', result: 'Success', gate: 'Virtual Gate 1' },
    { id: '2', rfid: 'E28011912000720B', time: '14:28:45', result: 'Duplicate', gate: 'Virtual Gate 1' },
    { id: '3', rfid: 'E28011912000720C', time: '14:25:33', result: 'Unknown Tag', gate: 'Mobile Device' },
  ]);

  const handleSimulateScan = () => {
    if (!tagId) {
      error("Please enter an RFID Tag ID");
      return;
    }

    setScanning(true);
    setTimeout(() => {
      const newScan = {
        id: Math.random().toString(),
        rfid: tagId,
        time: new Date().toLocaleTimeString([], { hour12: false }),
        result: 'Success',
        gate: 'Manual Entry'
      };
      setScans([newScan, ...scans]);
      setScanning(false);
      setTagId("");
      success(`Tag ${tagId} registered successfully`);
    }, 1200);
  };

  return (
    <div className="space-y-8 animate-fade-up">
      <div className="flex flex-col gap-1">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 flex items-center gap-2">
          <Scan className="w-8 h-8 text-indigo-600" />
          {t('scan.title')}
        </h1>
        <p className="text-slate-500">Manually trigger gate events or register tags for hardware troubleshooting.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1 p-6 border-0 shadow-sm shadow-slate-200/50 bg-white space-y-6">
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-indigo-600 animate-pulse" />
            <h3 className="font-bold text-slate-900">{t('scan.manualInput')}</h3>
          </div>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-slate-500 font-bold uppercase text-[10px] tracking-widest leading-none">RFID Transponder ID (EPC)</Label>
              <Input 
                value={tagId} 
                onChange={(e) => setTagId(e.target.value)}
                placeholder="E28011..." 
                className="font-mono text-lg py-6 border-slate-200 focus:ring-indigo-600"
              />
            </div>
            <Button 
              className="w-full bg-indigo-600 hover:bg-indigo-700 py-6 font-bold shadow-lg shadow-indigo-100"
              onClick={handleSimulateScan}
              disabled={scanning}
            >
              {scanning ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <Play className="w-4 h-4 mr-2" />}
              {t('scan.triggerScan')}
            </Button>
          </div>

          <div className="p-4 rounded-xl bg-slate-50 border border-slate-100 space-y-2">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-slate-400 mt-0.5" />
              <p className="text-xs text-slate-500 leading-relaxed italic">
                Manual scans bypass physical gate hardware but trigger the same database reconciliation logic.
              </p>
            </div>
          </div>
        </Card>

        <Card className="lg:col-span-2 border-0 shadow-sm shadow-slate-200/50 bg-white overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <History className="w-5 h-5 text-slate-400" />
              <h3 className="font-bold text-slate-900">Recent Entry History</h3>
            </div>
            <p className="text-xs text-slate-400">Total: {scans.length} events logged</p>
          </div>
          <Table>
            <TableHeader className="bg-slate-50/50">
              <TableRow>
                <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Tag ID</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Timestamp</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400">Gate/Source</TableHead>
                <TableHead className="font-bold uppercase text-[10px] tracking-wider text-slate-400 text-right">Result</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {scans.map((scan) => (
                <TableRow key={scan.id}>
                  <TableCell className="font-mono text-sm text-slate-900">{scan.rfid}</TableCell>
                  <TableCell className="text-slate-500 text-xs">{scan.time}</TableCell>
                  <TableCell className="text-slate-600 font-medium text-xs">{scan.gate}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      {scan.result === 'Success' ? (
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                      ) : (
                        <AlertCircle className="w-3.5 h-3.5 text-amber-500" />
                      )}
                      <span className={`text-[11px] font-bold uppercase tracking-wider ${scan.result === 'Success' ? 'text-emerald-600' : 'text-amber-600'}`}>
                        {scan.result}
                      </span>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      </div>
    </div>
  );
}
