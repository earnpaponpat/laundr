import { Suspense } from 'react';
import { MetricCards } from '@/components/dashboard/MetricCards';
import { LiveScanFeed } from '@/components/dashboard/LiveScanFeed';
import { ClientStatusList } from '@/components/dashboard/ClientStatusList';
import { WashCycleTracker } from '@/components/dashboard/WashCycleTracker';
import { TodayRoutes } from '@/components/dashboard/TodayRoutes';
import { AIInsightsPanel } from '@/components/ai/AIInsightsPanel';
import { AIAssistantChat } from '@/components/ai/AIAssistantChat';
import { Skeleton } from '@/components/ui/skeleton';

export default function DashboardPage() {
  return (
    <div className="space-y-4">

      {/* ── Section 1: Metric Strip ─────────────────────────────── */}
      <div className="animate-fade-up">
        <Suspense fallback={
          <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
            {Array(5).fill(0).map((_, i) => (
              <Skeleton key={i} className="h-[110px] rounded-xl" />
            ))}
          </div>
        }>
          <MetricCards />
        </Suspense>
      </div>

      {/* ── Section 2: Live Feed (3/5) + Client Return Rates (2/5) ── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4 animate-fade-up delay-100">
        <div className="lg:col-span-3 h-[400px] overflow-hidden">
          <LiveScanFeed />
        </div>
        <div className="lg:col-span-2 h-[400px] overflow-hidden">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
            <ClientStatusList />
          </Suspense>
        </div>
      </div>

      {/* ── Section 3: Near EOL + Today's Routes + AI Insights ──── */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 animate-fade-up delay-200">
        <div className="h-[280px] overflow-hidden">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
            <WashCycleTracker />
          </Suspense>
        </div>
        <div className="h-[280px] overflow-hidden">
          <Suspense fallback={<Skeleton className="h-full w-full rounded-xl" />}>
            <TodayRoutes />
          </Suspense>
        </div>
        <div className="h-[280px] overflow-hidden">
          <AIInsightsPanel />
        </div>
      </div>

      {/* ── Section 4: AI Chat bar (inline, collapsible) ────────── */}
      <div className="animate-fade-up delay-300">
        <AIAssistantChat inline />
      </div>

    </div>
  );
}
