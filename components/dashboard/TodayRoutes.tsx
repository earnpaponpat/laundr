'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Truck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { createClient } from '@/lib/supabase/client';
import { DEMO_ROUTE_STOPS } from '@/lib/demo/dashboard';

type StopRow = {
  id: string;
  stop_no: number;
  status: string;
  client_name: string;
  delivered_at: string | null;
  driver_name?: string;
};

type ApiTrip = {
  id: string;
  driver_name: string;
  stops: StopRow[];
};

export function TodayRoutes() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<StopRow[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    const res = await fetch('/api/driver/today?scope=org', { cache: 'no-store' });
    const json = await res.json();
    if (!res.ok) {
      setRows(DEMO_ROUTE_STOPS);
      setLoading(false);
      return;
    }

    const nextRows: StopRow[] = [];
    for (const trip of (json.trips || []) as ApiTrip[]) {
      for (const stop of trip.stops || []) {
        nextRows.push({
          ...stop,
          driver_name: trip.driver_name,
        });
      }
    }

    nextRows.sort((a, b) => a.stop_no - b.stop_no);
    setRows(nextRows.length > 0 ? nextRows.slice(0, 8) : DEMO_ROUTE_STOPS);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel('trip-stops-live')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'trip_stops' }, () => {
        load();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [load]);

  const summary = useMemo(() => {
    const delivered = rows.filter((row) => row.status === 'completed').length;
    return { delivered, total: rows.length };
  }, [rows]);

  const statusView = (stop: StopRow) => {
    if (stop.status === 'completed') {
      const time = stop.delivered_at
        ? new Date(stop.delivered_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })
        : '';
      return { icon: '✓', text: `Delivered ${time}`.trim(), className: 'bg-emerald-100 text-emerald-700' };
    }

    if (stop.status === 'active') {
      return { icon: '🚗', text: 'En route', className: 'bg-indigo-100 text-indigo-700' };
    }

    return { icon: '○', text: 'Pending', className: 'bg-slate-200 text-slate-700' };
  };

  return (
    <Card className="h-full flex flex-col overflow-hidden">
      <CardHeader className="pb-2 shrink-0">
        <CardTitle className="text-sm font-semibold text-slate-700 uppercase tracking-wide flex items-center gap-2">
          <Truck className="w-4 h-4" />
          Today's Routes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto pb-4">
        {loading ? (
          <div className="text-sm text-slate-400 py-4">Loading route status...</div>
        ) : rows.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center py-6">
            <Truck className="w-8 h-8 text-slate-200 mb-2" />
            <p className="text-sm text-slate-400 font-medium">No stops scheduled today</p>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="rounded-lg bg-slate-50 border border-slate-100 px-3 py-2 text-xs text-slate-500">
              {summary.delivered}/{summary.total} stops delivered
            </div>
            {rows.map((stop) => {
              const view = statusView(stop);
              return (
                <div key={stop.id} className="flex items-center justify-between py-2 border-b border-slate-100 last:border-0">
                  <div className="min-w-0">
                    <p className="font-medium text-sm text-slate-800 truncate">{stop.client_name}</p>
                    <p className="text-xs text-slate-400 mt-0.5 truncate">{stop.driver_name || 'Driver'}</p>
                  </div>
                  <span className={`ml-3 shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${view.className}`}>
                    {view.icon} {view.text}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
