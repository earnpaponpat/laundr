"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/lib/i18n/LanguageContext";
import { createClient } from "@/lib/supabase/client";
import {
  LayoutDashboard,
  Package,
  ClipboardList,
  Factory,
  GitCompare,
  RefreshCw,
  Truck,
  Receipt,
  Cpu,
  Settings2,
  Sparkles,
  ChevronRight
} from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { t } = useLanguage();
  const [ordersBadge, setOrdersBadge] = useState(0);

  useEffect(() => {
    const loadOrdersBadge = async () => {
      const supabase = createClient();
      const { data: orgData } = await supabase.rpc('get_current_org_id');
      const orgId = orgData || (await supabase.from('organizations').select('id').limit(1).single()).data?.id;
      if (!orgId) return;

      const { count, error: countError } = await supabase
        .from('delivery_orders')
        .select('*', { count: 'exact', head: true })
        .eq('org_id', orgId)
        .in('status', ['picking', 'ready']);

      if (countError) {
        console.error('[Sidebar] badge load failed:', countError.message);
        return;
      }
      setOrdersBadge(count || 0);
    };

    loadOrdersBadge();
  }, []);

  const menuGroups = [
    {
      group: t('nav.groups.overview'),
      items: [
        { name: t('nav.dashboard'), href: '/', icon: LayoutDashboard },
      ],
    },
    {
      group: t('nav.groups.operations'),
      items: [
        { name: t('nav.inventory'), href: '/inventory', icon: Package },
        { name: t('nav.orders'), href: '/orders', icon: ClipboardList, badge: ordersBadge },
        { name: t('nav.production'), href: '/production', icon: Factory },
        { name: t('nav.reconcile'), href: '/reconcile', icon: GitCompare },
        { name: t('nav.rewash'), href: '/rewash', icon: RefreshCw },
        { name: t('nav.logistics'), href: '/routes', icon: Truck },
      ],
    },
    {
      group: t('nav.groups.management'),
      items: [
        { name: t('nav.billing'), href: '/billing', icon: Receipt },
        { name: t('nav.simulator'), href: '/simulator', icon: Cpu },
        { name: t('nav.settings'), href: '/settings', icon: Settings2 },
      ],
    },
  ];

  return (
    <aside className="w-64 bg-white flex flex-col flex-shrink-0 border-r border-slate-100 h-screen sticky top-0 shadow-sm shadow-slate-200/20">
      {/* Logo Area */}
      <div className="p-6 pb-8">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-500/20">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900 tracking-tighter leading-none">Laundr</h1>
            <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest mt-1">RFID Tracking</p>
          </div>
        </div>
      </div>

      {/* Nav Section */}
      <nav className="flex-1 px-3 space-y-6 overflow-y-auto pb-6">
        {menuGroups.map((group) => (
          <div key={group.group} className="space-y-1">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 px-3 py-2 mb-1">
              {group.group}
            </h3>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const isActive = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 relative",
                      isActive
                        ? "bg-indigo-50 text-indigo-700"
                        : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-indigo-500 rounded-full" />
                    )}
                    <item.icon className={cn(
                      "w-4 h-4 transition-colors",
                      isActive ? "text-indigo-600" : "text-slate-400 group-hover:text-slate-600"
                    )} />
                    {item.name}
                    {typeof item.badge === 'number' && item.badge > 0 ? (
                      <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                        {item.badge}
                      </span>
                    ) : null}
                    {isActive && <ChevronRight className={cn("w-3 h-3 text-indigo-500/50", typeof item.badge === 'number' && item.badge > 0 ? "ml-1" : "ml-auto")} />}
                  </Link>
                );
              })}
              {group.group === t('nav.groups.management') && (
                <Link
                  href="/ai-insights"
                  className="group flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-black transition-all duration-200 text-violet-400 hover:bg-violet-500/10"
                >
                  <Sparkles className="w-4 h-4" />
                  {t('nav.aiInsights')}
                  <span className="ml-auto text-[9px] bg-violet-500/20 text-violet-400 px-1.5 py-0.5 rounded-full font-bold">BETA</span>
                </Link>
              )}
            </div>
          </div>
        ))}
      </nav>

      {/* Bottom Profile */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white border border-slate-200 flex items-center justify-center text-[10px] font-black text-slate-400 uppercase shadow-sm">
            AD
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-slate-900 truncate">{t('common.adminUser')}</p>
            <p className="text-[10px] text-slate-500 font-medium truncate">Powered by THE LAUNDERING</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
