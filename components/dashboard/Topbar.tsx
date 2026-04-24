"use client";

import { usePathname } from "next/navigation";
import { HeaderActionsSlot } from "@/lib/contexts/HeaderActionsContext";
import { LanguageToggle } from "@/components/ui/LanguageToggle";
import { NotificationPanel } from "@/components/dashboard/NotificationPanel";
import { useLanguage } from "@/lib/i18n/LanguageContext";

export function Topbar() {
  const pathname = usePathname();
  const { t } = useLanguage();

  const getPageTitle = (path: string): string => {
    if (path === '/') return t('topbar.pageTitles.home');
    if (path === '/inventory') return t('topbar.pageTitles.inventory');
    if (path.startsWith('/orders')) return t('topbar.pageTitles.orders');
    if (path.startsWith('/production')) return t('topbar.pageTitles.production');
    if (path === '/reconcile') return t('topbar.pageTitles.reconcile');
    if (path === '/rewash') return t('topbar.pageTitles.rewash');
    if (path === '/routes') return t('topbar.pageTitles.routes');
    if (path === '/billing') return t('topbar.pageTitles.billing');
    if (path === '/ai-insights') return t('topbar.pageTitles.aiInsights');
    if (path.includes('/simulator')) return t('topbar.pageTitles.simulator');
    return t('topbar.pageTitles.dashboard');
  };

  return (
    <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-20">
      <div className="flex items-center gap-4">
        <h1 className="text-[17px] font-bold text-slate-900 tracking-tight">
          {getPageTitle(pathname)}
        </h1>
        <div className="h-4 w-px bg-slate-200" />
        <div className="flex items-center gap-1.5 text-sm font-medium text-emerald-600">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
          {t('topbar.live')}
        </div>
      </div>

      <div className="flex items-center gap-4">
        {/* Gate Pills */}
        <div className="hidden lg:flex items-center gap-2">
          <div className="px-2.5 py-1 bg-slate-100 rounded-full text-[10px] font-mono font-bold text-slate-500 border border-slate-200">Gate A</div>
          <div className="px-2.5 py-1 bg-slate-100 rounded-full text-[10px] font-mono font-bold text-slate-500 border border-slate-200">Gate B</div>
        </div>

        <div className="h-5 w-px bg-slate-200" />

        {/* Language Toggle */}
        <LanguageToggle />

        {/* Contextual Actions Slot */}
        <div className="flex items-center gap-2">
          <HeaderActionsSlot />
        </div>

        {/* Notification Bell */}
        <NotificationPanel />
      </div>
    </header>
  );
}
