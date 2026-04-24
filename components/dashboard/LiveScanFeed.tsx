"use client";

import { useEffect, useState, useCallback, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ScanEvent } from '@/types';
import { useScanEvents, RealtimeStatus } from '@/hooks/useRealtime';
import { useRealtime } from '@/lib/contexts/RealtimeContext';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { Activity, ArrowDownToLine, ArrowUpFromLine, RefreshCw, ScanLine } from 'lucide-react';
import { DEMO_SCAN_EVENTS } from '@/lib/demo/dashboard';

export function LiveScanFeed() {
  const { t } = useLanguage();
  const { orgId: contextOrgId, status: rtStatus, lastEvent: contextEvent } = useRealtime();
  const [events, setEvents] = useState<ScanEvent[]>([]);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [lastEventAt, setLastEventAt] = useState<{ time: Date; method: 'db' | 'broadcast' } | null>(null);
  const [clients, setClients] = useState<Record<string, string>>({});
  const supabase = createClient();
  
  // Use Ref for orgId to avoid stale closures in handleEvent
  const orgIdRef = useRef(contextOrgId);
  useEffect(() => { orgIdRef.current = contextOrgId; }, [contextOrgId]);

  useEffect(() => {
    if (!contextOrgId) {
      setEvents(DEMO_SCAN_EVENTS);
      return;
    }
    let mounted = true;

    async function init() {
      // Fetch Client Cache for instant lookup
      const { data: clientList } = await supabase
        .from('clients')
        .select('id, name')
        .eq('org_id', contextOrgId);
      
      const clientMap: Record<string, string> = {};
      clientList?.forEach(c => { clientMap[c.id] = c.name; });
      if (mounted) setClients(clientMap);

      const { data } = await supabase
        .from('scan_events')
        .select('*, linen_items(rfid_tag_id), clients(name)')
        .eq('org_id', contextOrgId)
        .order('created_at', { ascending: false })
        .limit(20);

      if (mounted) setEvents(data?.length ? data : DEMO_SCAN_EVENTS);
    }

    init();
    return () => { mounted = false; };
  }, [contextOrgId]);

  const handleEvent = useCallback((rawEvent: ScanEvent & { source_method?: 'db' | 'broadcast' }) => {
    if (rawEvent.org_id && orgIdRef.current && rawEvent.org_id !== orgIdRef.current) {
      return; 
    }

    setLastEventAt({
      time: new Date(),
      method: rawEvent.source_method || 'db'
    });

    const displayEvent = {
      ...rawEvent,
      clients: rawEvent.client_id ? { name: clients[rawEvent.client_id] } : null
    };

    setEvents((prev) => {
      // De-duplicate: if we already have this event (e.g. from DB if broadcast arrived first), skip
      if (prev.some(e => e.id === displayEvent.id)) {
        return prev;
      }
      return [displayEvent, ...prev].slice(0, 50);
    });

    setNewIds((ids) => new Set([...ids, displayEvent.id]));

    setTimeout(() => {
      setNewIds((ids) => {
        const s = new Set(ids);
        s.delete(displayEvent.id);
        return s;
      });
    }, 600);
  }, [clients]);

  useScanEvents(contextOrgId, handleEvent);

  const getGateLabel = (gateId: string) => {
    const mapping: Record<string, string> = {
      handheld_1: 'Handheld',
      gate_a: 'Gate A',
      gate_b: 'Gate B',
      simulator: 'Simulator',
    };
    return mapping[gateId.toLowerCase()] || gateId;
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'checkin':
      case 'in': return <ArrowDownToLine className="w-4 h-4 text-emerald-500" />;
      case 'checkout':
      case 'out': return <ArrowUpFromLine className="w-4 h-4 text-indigo-500" />;
      case 'rewash': return <RefreshCw className="w-4 h-4 text-amber-500" />;
      default: return <ScanLine className="w-4 h-4 text-slate-400" />;
    }
  };

  const getIconContainerStyle = (type: string) => {
    switch (type) {
      case 'checkin':
      case 'in': return 'bg-emerald-50 border-emerald-100 text-emerald-600';
      case 'checkout':
      case 'out': return 'bg-indigo-50 border-indigo-100 text-indigo-600';
      case 'rewash': return 'bg-amber-50 border-amber-100 text-amber-600';
      default: return 'bg-slate-50 border-slate-100 text-slate-400';
    }
  };

  const isConnected = rtStatus === 'SUBSCRIBED';

  return (
    <div className="bg-white rounded-xl h-full flex flex-col overflow-hidden shadow-sm shadow-slate-200/50">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-50 shrink-0">
        <div>
          <h3 className="text-sm font-semibold text-slate-700 uppercase tracking-wide">
            {t('dashboard.liveScanFeed')}
          </h3>
          {/* Debug Info */}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-[9px] font-mono text-slate-400 bg-slate-50 px-1 rounded uppercase">
              Org: {contextOrgId ? contextOrgId.substring(0, 8) : '...'}
            </span>
            {lastEventAt && (
              <span className={`text-[9px] font-bold px-1 rounded flex items-center gap-1 ${lastEventAt.method === 'broadcast' ? 'text-amber-600 bg-amber-50' : 'text-emerald-600 bg-emerald-50'}`}>
                <span className="animate-pulse">●</span>
                {lastEventAt.method === 'broadcast' ? 'FAST' : 'DB'} {format(lastEventAt.time, 'HH:mm:ss')}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-1.5 text-[10px] font-bold uppercase ${isConnected ? 'text-emerald-500' : 'text-amber-500'}`}>
            <span className={`flex h-1.5 w-1.5 rounded-full ${isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
            {isConnected ? t('dashboard.realtime') : t('common.loading')}
          </div>
        </div>
      </div>

      {/* Scrollable event list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {events.length === 0 && (
          <div className="text-center py-10 bg-slate-50/50 rounded-xl mt-2">
            <Activity className="w-6 h-6 text-slate-200 mx-auto mb-2" />
            <p className="text-xs text-slate-400">{t('dashboard.waitingForScans')}</p>
          </div>
        )}
        {events.map((event) => (
          <div
            key={event.id}
            className={`group bg-white p-3.5 flex items-center justify-between hover:bg-slate-50 border-b border-slate-50 last:border-0 transition-all duration-200${newIds.has(event.id) ? ' animate-in slide-in-from-top-2 duration-300 fade-in' : ''}`}
          >
            <div className="flex items-center gap-3">
              <div className={cn(
                "w-9 h-9 rounded-xl flex items-center justify-center border transition-all duration-200 shrink-0",
                getIconContainerStyle(event.event_type)
              )}>
                {getEventIcon(event.event_type)}
              </div>
              <div className="flex flex-col gap-0.5 min-w-0">
                <span className="text-sm font-bold font-mono text-slate-900 tracking-tight truncate">
                  {event.rfid_tag_id}
                </span>
                <span className="text-xs text-slate-500 font-medium truncate">
                  {event.clients?.name || t('dashboard.inHouse')}
                  <span className="text-slate-300 mx-1">·</span>
                  {t('common.viaGate')} {getGateLabel(event.gate_id ?? '')}
                </span>
              </div>
            </div>
            <div className="flex flex-col items-end gap-1 shrink-0 ml-3">
              <span className="text-[10px] font-black text-slate-400 tabular-nums">
                {format(new Date(event.created_at), 'HH:mm:ss')}
              </span>
              <StatusBadge status={event.event_type.toUpperCase()} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
