import { en } from './en';
import { id } from './id';
import { zh } from './zh';

export type Locale = 'en' | 'id' | 'zh';

const translations = { en, id, zh };

export function useTranslations(locale: Locale) {
  return translations[locale];
}

export const locales: { code: Locale; label: string }[] = [
  { code: 'en', label: 'English' },
  { code: 'id', label: 'Bahasa Indonesia' },
  { code: 'zh', label: '中文' },
];

export function getLocaleFromUrl(url: URL): Locale {
  const segments = url.pathname.split('/').filter(Boolean);
  const first = segments[0] as Locale;
  if (first && ['en', 'id', 'zh'].includes(first)) {
    return first;
  }
  return 'en';
}

export function getLocalizedPath(locale: Locale, path: string): string {
  return `/${locale}${path}`;
}
