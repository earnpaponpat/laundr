"use client";

import React, { createContext, useContext, useEffect, useState, useRef } from 'react';
import { createClient } from '@/lib/supabase/client';
import { ScanEvent } from '@/types';

export type RealtimeStatus = 'CONNECTING' | 'SUBSCRIBED' | 'TIMED_OUT' | 'CLOSED' | 'CHANNEL_ERROR';

interface RealtimeContextType {
  status: RealtimeStatus;
  orgId: string;
  lastEvent: (ScanEvent & { source_method?: 'db' | 'broadcast', received_at?: number }) | null;
}

const RealtimeContext = createContext<RealtimeContextType | undefined>(undefined);

export function RealtimeProvider({ 
  children,
  initialOrgId = ''
}: { 
  children: React.ReactNode;
  initialOrgId?: string;
}) {
  const [status, setStatus] = useState<RealtimeStatus>('CONNECTING');
  const [orgId, setOrgId] = useState(initialOrgId);
  const [lastEvent, setLastEvent] = useState<(ScanEvent & { source_method?: 'db' | 'broadcast', received_at?: number }) | null>(null);

  // Stabilise the client — createBrowserClient returns a new object on every call,
  // so we hold it in a ref to prevent useEffect dependency churn.
  const supabaseRef = useRef(createClient());

  useEffect(() => {
    if (initialOrgId) setOrgId(initialOrgId);
  }, [initialOrgId]);

  useEffect(() => {
    if (!orgId) return;
    const sb = supabaseRef.current;

    // 1. DEDICATED BROADCAST CHANNEL (High Reliability)
    const broadcastChannel = sb.channel(`broadcast-${orgId}`, {
      config: { broadcast: { self: true } }
    })
      .on('broadcast', { event: 'new-scan' }, (payload) => {
        setLastEvent({ 
          ...(payload.payload as ScanEvent), 
          source_method: 'broadcast',
          received_at: Date.now()
        });
      })
      .subscribe((s) => {
        // Update status for all states so the UI knows if it failed/timed out
        setStatus(s as RealtimeStatus);
      });

    // 2. DEDICATED DB CHANNEL (Optional Enhancement)
    const dbChannel = sb.channel(`db-changes-${orgId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'scan_events' },
        (payload) => {
          setLastEvent({ 
            ...(payload.new as ScanEvent), 
            source_method: 'db',
            received_at: Date.now()
          });
        }
      )
      .subscribe((s, err) => {
        if (err || s === 'CHANNEL_ERROR' || s === 'TIMED_OUT') {
          console.warn(`[Realtime] DB Channel secondary failure (expected if RLS/Publication missing):`, err || s);
        }
      });

    return () => {
      sb.removeChannel(broadcastChannel);
      sb.removeChannel(dbChannel);
    };
  }, [orgId]);

  return (
    <RealtimeContext.Provider value={{ status, orgId, lastEvent }}>
      {children}
    </RealtimeContext.Provider>
  );
}

export function useRealtime() {
  const context = useContext(RealtimeContext);
  if (context === undefined) {
    throw new Error('useRealtime must be used within a RealtimeProvider');
  }
  return context;
}
