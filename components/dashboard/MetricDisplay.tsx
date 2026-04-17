"use client";

import { useState, useCallback } from 'react';
import { useScanEvents } from '@/hooks/useRealtime';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { ScanEvent } from '@/types';
import {
  Package, ArrowUp, ArrowDown, RefreshCw, AlertTriangle,
  ArrowUpRight, ArrowDownRight, Minus
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricValues {
  totalInventory: number;
  outToday: number;
  returnedToday: number;
  rewashToday: number;
  lostMonth: number;
}

interface MetricDisplayProps {
  orgId: string;
  initial: MetricValues;
}

export function MetricDisplay({ orgId, initial }: MetricDisplayProps) {
  const { t } = useLanguage();
  const [values, setValues] = useState<MetricValues>(initial);
  const [bumping, setBumping] = useState<string | null>(null);

  const bump = (key: string) => {
    setBumping(key);
    setTimeout(() => setBumping(null), 600);
  };

  const handleEvent = useCallback((event: ScanEvent) => {
    if (event.event_type === 'checkout') {
      setValues(prev => ({ ...prev, outToday: prev.outToday + 1 }));
      bump('outToday');
    } else if (event.event_type === 'checkin') {
      setValues(prev => ({ ...prev, returnedToday: prev.returnedToday + 1 }));
      bump('returnedToday');
    } else if (event.event_type === 'rewash') {
      setValues(prev => ({ ...prev, rewashToday: prev.rewashToday + 1 }));
      bump('rewashToday');
    }
  }, []);

  useScanEvents(orgId, handleEvent);

  const metrics = [
    {
      key: 'totalInventory',
      label: t('metrics.totalInventory'),
      value: values.totalInventory,
      icon: Package,
      bg: 'bg-slate-50',
      text: 'text-slate-500',
      trend: '+12%',
      trendUp: true as boolean | null,
    },
    {
      key: 'outToday',
      label: t('metrics.outToday'),
      value: values.outToday,
      icon: ArrowUp,
      bg: 'bg-indigo-50',
      text: 'text-indigo-500',
      trend: 'Live',
      trendUp: null as boolean | null,
    },
    {
      key: 'returnedToday',
      label: t('metrics.returned'),
      value: values.returnedToday,
      icon: ArrowDown,
      bg: 'bg-emerald-50',
      text: 'text-emerald-500',
      trend: 'Live',
      trendUp: null as boolean | null,
    },
    {
      key: 'rewashToday',
      label: t('metrics.inRewash'),
      value: values.rewashToday,
      icon: RefreshCw,
      bg: 'bg-amber-50',
      text: 'text-amber-500',
      trend: 'Live',
      trendUp: null as boolean | null,
    },
    {
      key: 'lostMonth',
      label: t('metrics.lostItems'),
      value: values.lostMonth,
      icon: AlertTriangle,
      bg: 'bg-red-50',
      text: 'text-red-500',
      trend: 'Month',
      trendUp: null as boolean | null,
    },
  ];

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-5">
      {metrics.map((m) => (
        <div key={m.key} className="bg-white rounded-xl p-6 flex flex-col justify-between shadow-sm shadow-slate-200/50 hover:shadow-md transition-shadow duration-200 group">
          <div className="flex items-start justify-between mb-5">
            <span className="text-[13px] font-semibold text-slate-500 tracking-tight uppercase">{m.label}</span>
            <div className={cn("w-9 h-9 rounded-lg flex items-center justify-center transition-transform group-hover:scale-105", m.bg)}>
              <m.icon className={cn("w-4 h-4", m.text)} />
            </div>
          </div>
          <div>
            <div className={cn(
              "text-3xl font-bold text-slate-900 tabular-nums tracking-tighter transition-all",
              bumping === m.key && 'metric-bump'
            )}>
              {m.value.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-2.5">
              {m.trendUp === true && <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />}
              {m.trendUp === false && <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />}
              {m.trendUp === null && <Minus className="w-3.5 h-3.5 text-slate-400" />}
              <span className={cn(
                "text-[11px] font-bold uppercase tracking-wider",
                m.trendUp === true ? "text-emerald-600"
                  : m.trendUp === false ? "text-red-600"
                  : "text-slate-400"
              )}>
                {m.trend}
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
