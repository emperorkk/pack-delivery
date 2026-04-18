import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export const THEMES = [
  'slate',
  'light',
  'sepia',
  'forest',
  'ocean',
  'sunrise',
  'grape',
  'mono',
  'paper',
  'terminal'
] as const;

export type Theme = (typeof THEMES)[number];

const STORAGE_KEY = 'pd.theme';

type Ctx = { theme: Theme; setTheme: (t: Theme) => void };
const ThemeContext = createContext<Ctx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState<Theme>(() => {
    const v = localStorage.getItem(STORAGE_KEY);
    return THEMES.includes(v as Theme) ? (v as Theme) : 'slate';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(STORAGE_KEY, theme);
  }, [theme]);

  const value = useMemo(() => ({ theme, setTheme }), [theme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): Ctx {
  const c = useContext(ThemeContext);
  if (!c) throw new Error('useTheme outside ThemeProvider');
  return c;
}
