"use client";

import dynamic from 'next/dynamic';

const RewashReportTabsContent = dynamic(() => import('./RewashReportTabs').then(mod => mod.RewashReportTabs), {
  ssr: false,
  loading: () => <div className="h-[400px] w-full bg-slate-50 animate-pulse rounded-xl flex items-center justify-center text-slate-400">Loading historical charts...</div>
});

interface RewashChartsWrapperProps {
  allRecords: any[];
}

export function RewashChartsWrapper({ allRecords }: RewashChartsWrapperProps) {
  return <RewashReportTabsContent allRecords={allRecords} />;
}
