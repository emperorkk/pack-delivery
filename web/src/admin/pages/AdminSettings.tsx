import { useState } from 'react';
import { AdminShell } from '../layout/Shell';
import { THEMES, useTheme, type Theme } from '@/themes/ThemeProvider';
import { LOCALES, useTranslation, type Locale } from '@/i18n/provider';
import { loadSettings, saveSettings, type AppSettings } from '@/settings/store';

export function AdminSettingsScreen() {
  const { t, locale, setLocale } = useTranslation();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function commit(next: AppSettings) {
    setSettings(next);
    saveSettings(next);
    setSavedAt(Date.now());
  }

  return (
    <AdminShell title={t('admin.settings.title')}>
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header">
          <div className="admin-card-title">{t('admin.settings.erp')}</div>
          <div className="admin-muted" style={{ fontSize: 12 }}>
            {t('admin.settings.sharedHint')}
          </div>
        </div>
        <div
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12
          }}
        >
          <label className="admin-login-field">
            {t('settings.series')}
            <input
              className="admin-input"
              value={settings.series}
              onChange={(e) => commit({ ...settings, series: e.target.value })}
            />
          </label>
          <label className="admin-login-field">
            {t('settings.seriesUpdate')}
            <input
              className="admin-input"
              value={settings.seriesUpdate}
              onChange={(e) => commit({ ...settings, seriesUpdate: e.target.value })}
            />
          </label>
          <label className="admin-login-field">
            {t('settings.soredir')}
            <input
              className="admin-input"
              value={settings.soredir}
              disabled
              readOnly
            />
          </label>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">{t('admin.settings.presentation')}</div>
          {savedAt && (
            <div className="admin-muted" style={{ fontSize: 12 }}>
              {t('admin.settings.saved')}
            </div>
          )}
        </div>
        <div
          style={{
            padding: 16,
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: 12
          }}
        >
          <label className="admin-login-field">
            {t('settings.theme')}
            <select
              className="admin-select"
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
          <label className="admin-login-field">
            {t('settings.language')}
            <select
              className="admin-select"
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
        </div>
      </div>
    </AdminShell>
  );
}
