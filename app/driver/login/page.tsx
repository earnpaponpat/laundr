'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { useLanguage } from '@/lib/i18n/LanguageContext';

export default function DriverLoginPage() {
  const router = useRouter();
  const { t } = useLanguage();
  const demoBypass = process.env.NEXT_PUBLIC_DRIVER_DEMO_BYPASS !== 'false';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!demoBypass) return;
    router.replace('/driver');
    router.refresh();
  }, [demoBypass, router]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const supabase = createClient();
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

      if (signInError) {
        setError(t('driver.auth.loginFailed'));
        return;
      }

      router.replace('/driver');
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  if (demoBypass) {
    return (
      <div className="flex min-h-[80vh] items-center justify-center px-4 py-6">
        <div className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#17213B] p-5 text-center">
          <h1 className="text-2xl font-bold text-white">{t('driver.auth.loginTitle')}</h1>
          <p className="text-sm text-slate-300">Opening driver demo…</p>
          <div className="flex justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-indigo-300" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-6">
      <form onSubmit={onSubmit} className="w-full max-w-md space-y-4 rounded-2xl border border-white/10 bg-[#17213B] p-5">
        <h1 className="text-2xl font-bold text-white">{t('driver.auth.loginTitle')}</h1>
        <p className="text-sm text-slate-300">{t('driver.auth.loginSubtitle')}</p>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200">{t('driver.auth.email')}</label>
          <input
            className="h-14 w-full rounded-xl border border-white/20 bg-[#0F1629] px-4 text-lg text-white outline-none"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium text-slate-200">{t('driver.auth.password')}</label>
          <input
            className="h-14 w-full rounded-xl border border-white/20 bg-[#0F1629] px-4 text-lg text-white outline-none"
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>

        {error ? <p className="text-sm text-red-300">{error}</p> : null}

        <button
          type="submit"
          disabled={loading}
          className="flex h-14 w-full items-center justify-center rounded-xl bg-emerald-500 text-lg font-semibold text-[#0F1629] disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : t('driver.auth.signIn')}
        </button>
      </form>
    </div>
  );
}
