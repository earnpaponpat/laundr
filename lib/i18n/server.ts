import { cookies } from 'next/headers';
import { translations, Language, getNestedValue } from './translations';

export async function getServerT() {
  const cookieStore = await cookies();
  const lang = (cookieStore.get('laundr_lang')?.value as Language) || 'en';
  const dict = translations[lang] as unknown as Record<string, unknown>;

  const t = (key: string): string => getNestedValue(dict, key);

  return { t, language: lang };
}
