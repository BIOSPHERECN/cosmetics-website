import fs from 'fs';
import { load as yamlLoad } from 'js-yaml';

export type Locale = 'en' | 'id' | 'zh';

const contentPath = 'content/site.yaml';

type TranslationData = Record<string, any>;

let cached: TranslationData | null = null;

function loadTranslations(): TranslationData {
  if (cached) return cached;
  const raw = fs.readFileSync(contentPath, 'utf-8');
  cached = yamlLoad(raw) as TranslationData;
  return cached;
}

export function useTranslations(locale: Locale): any {
  const data = loadTranslations();
  const result: Record<string, any> = {};

  for (const [section, values] of Object.entries(data)) {
    result[section] = values[locale];
  }

  return result;
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
