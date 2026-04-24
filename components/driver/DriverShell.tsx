'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { CalendarDays, Navigation, History, LogOut } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/LanguageContext';
import { createClient } from '@/lib/supabase/client';

type DriverShellProps = {
  driverName: string;
  activeStopHref: string;
  children: React.ReactNode;
};

export function DriverShell({ driverName, activeStopHref, children }: DriverShellProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { language, setLanguage, t } = useLanguage();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.replace('/driver/login');
    router.refresh();
  };

  const navItems = useMemo(
    () => [
      { href: '/driver', label: t('driver.nav.today'), icon: CalendarDays },
      { href: activeStopHref, label: t('driver.nav.activeStop'), icon: Navigation },
      { href: '/driver?tab=history', label: t('driver.nav.history'), icon: History },
    ],
    [activeStopHref, t]
  );

  return (
    <div className="min-h-screen bg-[#0F1629] text-white" style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <div className="mx-auto flex h-screen w-full max-w-md flex-col">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-white/10 px-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-indigo-500/90 text-white grid place-items-center font-bold">L</div>
            <div>
              <p className="text-lg font-semibold leading-none">Laundr</p>
              <p className="text-xs text-slate-300 leading-none mt-1">{driverName}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-full bg-[#1A2440] px-1 py-1">
              {(['th', 'en'] as const).map((lang) => (
                <button
                  key={lang}
                  onClick={() => setLanguage(lang)}
                  className={`min-h-8 min-w-10 rounded-full px-2 text-xs font-semibold ${language === lang ? 'bg-indigo-500 text-white' : 'text-slate-300'
                    }`}
                >
                  {lang.toUpperCase()}
                </button>
              ))}
            </div>
            <button
              onClick={handleLogout}
              className="flex min-h-8 items-center gap-1 rounded-full bg-[#1A2440] px-3 text-xs font-semibold text-slate-200"
            >
              <LogOut className="h-3.5 w-3.5" />
              {t('driver.auth.logout')}
            </button>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</main>

        <nav className="grid h-20 shrink-0 grid-cols-3 border-t border-white/10 bg-[#111C33] px-2">
          {navItems.map((item) => {
            const active = pathname === item.href || (item.href !== '/driver' && pathname?.startsWith(item.href));
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`mx-1 my-2 flex min-h-14 flex-col items-center justify-center rounded-xl text-center transition ${active ? 'bg-indigo-500 text-white' : 'text-slate-300'
                  }`}
              >
                <item.icon className="h-5 w-5" />
                <span className="mt-1 text-[12px] font-semibold">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>
    </div>
  );
}
