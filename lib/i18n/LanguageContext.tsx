"use client";

import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { translations, Language, getNestedValue } from './translations';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: string) => string;
  ta: (key: string) => string[];
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'en',
  setLanguage: () => {},
  t: (key) => key,
  ta: () => [],
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>('en');
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('laundr_language') as Language | null;
    if (stored === 'en' || stored === 'th') {
      setLanguageState(stored);
    }
  }, []);

  const setLanguage = useCallback((lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem('laundr_language', lang);
    document.cookie = `laundr_lang=${lang}; path=/; max-age=31536000; SameSite=Lax`;
    router.refresh();
  }, [router]);

  useEffect(() => {
    // Sync document attributes for SEO and styling
    document.documentElement.lang = language;
    
    // Manage class on body for specific font overrides
    if (language === 'th') {
      document.body.classList.add('lang-th');
    } else {
      document.body.classList.remove('lang-th');
    }
  }, [language]);

  const t = useCallback((key: string): string => {
    return getNestedValue(translations[language] as unknown as Record<string, unknown>, key);
  }, [language]);

  const ta = useCallback((key: string): string[] => {
    const val = key.split('.').reduce((acc: unknown, k: string) => {
      if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[k];
      return undefined;
    }, translations[language] as unknown);
    return Array.isArray(val) ? (val as string[]) : [];
  }, [language]);

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, ta }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  return useContext(LanguageContext);
}
