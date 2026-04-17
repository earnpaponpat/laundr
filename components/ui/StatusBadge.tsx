"use client";

import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = status.toUpperCase();
  
  const getConfig = (val: string) => {
    switch (val) {
      case 'IN_STOCK':
      case 'IN STOCK':
      case 'CHECKIN':
      case 'COMPLETED':
        return "bg-emerald-100 text-emerald-800 border-emerald-300";
      case 'OUT':
      case 'CHECKOUT':
      case 'ACTIVE':
        return "bg-indigo-100 text-indigo-800 border-indigo-300";
      case 'REWASH':
        return "bg-amber-50 text-amber-700 border-amber-200";
      case 'REJECTED':
      case 'REJECT':
        return "bg-red-50 text-red-700 border-red-200";
      case 'LOST':
      case 'PENDING':
        return "bg-slate-100 text-slate-600 border-slate-200";
      default:
        return "bg-slate-50 text-slate-500 border-slate-200";
    }
  };

  const isPulse = (val: string) => val === 'ACTIVE';

  return (
    <span className={cn(
      "text-[10px] font-bold px-2 py-0.5 rounded-full inline-flex items-center gap-1.5 border uppercase tracking-wider",
      getConfig(s),
      className
    )}>
      {isPulse(s) && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
        </span>
      )}
      {status.replace('_', ' ')}
    </span>
  );
}
