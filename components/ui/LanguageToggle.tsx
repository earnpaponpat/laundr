"use client";

import { useLanguage } from '@/lib/i18n/LanguageContext';

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <div className="flex items-center bg-slate-100 rounded-full px-1 py-1 gap-0.5">
      {(['en', 'th'] as const).map((lang) => (
        <button
          key={lang}
          onClick={() => setLanguage(lang)}
          className={`px-2 py-0.5 rounded-full text-xs font-medium transition-all ${
            language === lang
              ? 'bg-white shadow-sm text-slate-900'
              : 'text-slate-400 hover:text-slate-600'
          }`}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
