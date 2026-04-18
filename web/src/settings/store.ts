export type AppSettings = {
  series: string;
  soredir: string;
  seriesUpdate: string;
  barcodeField: string;
  shareLocation: boolean;
};

const KEY = 'pd.settings';

const DEFAULTS: AppSettings = {
  series: '3200',
  soredir: '0',
  seriesUpdate: '3201',
  barcodeField: 'FINDOC',
  shareLocation: true
};

export function loadSettings(): AppSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<AppSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

export function saveSettings(next: Partial<AppSettings>): AppSettings {
  const merged = { ...loadSettings(), ...next };
  localStorage.setItem(KEY, JSON.stringify(merged));
  window.dispatchEvent(new CustomEvent('pd:settings', { detail: merged }));
  return merged;
}
