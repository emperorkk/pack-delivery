import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import el from './el.json';
import en from './en.json';
import de from './de.json';
import fr from './fr.json';
import es from './es.json';
import it from './it.json';
import pt from './pt.json';
import nl from './nl.json';
import pl from './pl.json';
import ro from './ro.json';

export const LOCALES = ['el', 'en', 'de', 'fr', 'es', 'it', 'pt', 'nl', 'pl', 'ro'] as const;
export type Locale = (typeof LOCALES)[number];

const dicts: Record<Locale, Record<string, string>> = { el, en, de, fr, es, it, pt, nl, pl, ro };

const STORAGE_KEY = 'pd.locale';

function resolveInitialLocale(): Locale {
  const v = localStorage.getItem(STORAGE_KEY);
  if (v && (LOCALES as readonly string[]).includes(v)) return v as Locale;
  const nav = (navigator.language || 'el').slice(0, 2).toLowerCase();
  return (LOCALES as readonly string[]).includes(nav) ? (nav as Locale) : 'el';
}

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, vars?: Record<string, string | number>) => string;
};

const I18nContext = createContext<Ctx | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocale] = useState<Locale>(() => resolveInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  const value = useMemo<Ctx>(() => {
    const dict = dicts[locale] ?? dicts.en;
    const fallback = dicts.en;
    const t: Ctx['t'] = (key, vars) => {
      const raw = dict[key] ?? fallback[key] ?? key;
      if (!vars) return raw;
      return raw.replace(/\{(\w+)\}/g, (_m, k) => String(vars[k] ?? ''));
    };
    return { locale, setLocale, t };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useTranslation(): Ctx {
  const c = useContext(I18nContext);
  if (!c) throw new Error('useTranslation outside I18nProvider');
  return c;
}
