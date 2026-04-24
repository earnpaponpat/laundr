"use client";

import { useMemo } from 'react';
import {
  Sparkles, Truck, Factory, RotateCcw, AlertTriangle,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export interface MetricValues {
  cleanReady: number;
  outWithClients: number;
  inProduction: number;
  inRewash: number;
  lostMonth: number;
}

interface MetricDisplayProps {
  initial: MetricValues;
}

export function MetricDisplay({ initial }: MetricDisplayProps) {
  const metrics = useMemo(() => [
    {
      key: 'cleanReady',
      label: 'Clean & Ready',
      value: initial.cleanReady,
      icon: Sparkles,
      bg: 'bg-emerald-50',
      text: 'text-emerald-600',
    },
    {
      key: 'outWithClients',
      label: 'Out with Clients',
      value: initial.outWithClients,
      icon: Truck,
      bg: 'bg-indigo-50',
      text: 'text-indigo-500',
    },
    {
      key: 'inProduction',
      label: 'In Production',
      value: initial.inProduction,
      icon: Factory,
      bg: 'bg-sky-50',
      text: 'text-sky-600',
    },
    {
      key: 'inRewash',
      label: 'In Rewash',
      value: initial.inRewash,
      icon: RotateCcw,
      bg: 'bg-amber-50',
      text: 'text-amber-500',
    },
    {
      key: 'lostMonth',
      label: 'Lost This Month',
      value: initial.lostMonth,
      icon: AlertTriangle,
      bg: 'bg-red-50',
      text: 'text-red-500',
    },
  ], [initial.cleanReady, initial.inProduction, initial.inRewash, initial.lostMonth, initial.outWithClients]);

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
            <div className={cn("text-3xl font-bold text-slate-900 tabular-nums tracking-tighter transition-all")}>
              {m.value.toLocaleString()}
            </div>
            <div className="mt-2 text-[11px] font-bold uppercase tracking-wider text-slate-400">Live</div>
          </div>
        </div>
      ))}
    </div>
  );
}
