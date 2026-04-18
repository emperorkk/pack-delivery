import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button, Card, Header, TextInput } from '@/ui/primitives';
import { useTranslation, LOCALES, type Locale } from '@/i18n/provider';
import { THEMES, useTheme, type Theme } from '@/themes/ThemeProvider';
import { loadSettings, saveSettings, type AppSettings } from '@/settings/store';
import { fetchBarcodeFieldOptions } from '@/settings/fieldLookup';
import { loadSession } from '@/soft1/session';

export function SettingsScreen() {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const nav = useNavigate();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [barcodeOptions, setBarcodeOptions] = useState<Array<{ value: string; label: string }>>([]);
  const session = loadSession();

  useEffect(() => {
    fetchBarcodeFieldOptions().then(setBarcodeOptions);
  }, []);

  function onSave() {
    saveSettings(settings);
    nav(-1);
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        title={t('settings.title')}
        right={<Button variant="ghost" onClick={() => nav(-1)}>{t('common.back')}</Button>}
      />
      <div className="flex flex-col gap-3 p-4">
        <Card>
          <div className="flex flex-col gap-3">
            <TextInput
              label={t('settings.series')}
              value={settings.series}
              onChange={(e) => setSettings({ ...settings, series: e.target.value })}
            />
            <TextInput
              label={t('settings.soredir')}
              value={settings.soredir}
              onChange={(e) => setSettings({ ...settings, soredir: e.target.value })}
            />
            <TextInput
              label={t('settings.seriesUpdate')}
              value={settings.seriesUpdate}
              onChange={(e) => setSettings({ ...settings, seriesUpdate: e.target.value })}
            />
            <label className="flex flex-col gap-1">
              <span className="text-sm text-muted">{t('settings.barcodeField')}</span>
              <select
                className="rounded-xl border border-border bg-surface-2 px-3 py-3"
                value={settings.barcodeField}
                onChange={(e) => setSettings({ ...settings, barcodeField: e.target.value })}
              >
                {barcodeOptions.length === 0 && <option value="FINDOC">FINDOC</option>}
                {barcodeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <TextInput
              label={t('settings.driverRefId')}
              value={session?.driverRefId ?? ''}
              disabled
            />
            <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface-2 px-3 py-3">
              <span className="text-sm">{t('common.shareLocation')}</span>
              <input
                type="checkbox"
                checked={settings.shareLocation}
                onChange={(e) => setSettings({ ...settings, shareLocation: e.target.checked })}
              />
            </label>
          </div>
        </Card>

        <Card>
          <label className="flex flex-col gap-1">
            <span className="text-sm text-muted">{t('settings.theme')}</span>
            <select
              className="rounded-xl border border-border bg-surface-2 px-3 py-3"
              value={theme}
              onChange={(e) => setTheme(e.target.value as Theme)}
            >
              {THEMES.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="mt-3 flex flex-col gap-1">
            <span className="text-sm text-muted">{t('settings.language')}</span>
            <select
              className="rounded-xl border border-border bg-surface-2 px-3 py-3"
              value={locale}
              onChange={(e) => setLocale(e.target.value as Locale)}
            >
              {LOCALES.map((l) => (
                <option key={l} value={l}>
                  {l.toUpperCase()}
                </option>
              ))}
            </select>
          </label>
        </Card>

        <Button onClick={onSave}>{t('common.save')}</Button>
      </div>
    </div>
  );
}
