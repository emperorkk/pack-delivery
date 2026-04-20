import { useEffect, useState } from 'react';
import { AdminShell } from '../layout/Shell';
import { getDrivers, type DriverRow } from '../fleet';
import { useTranslation } from '@/i18n/provider';

export function DriversScreen() {
  const { t } = useTranslation();
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDrivers()
      .then((d) => {
        if (!cancelled) setDrivers(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell title={t('admin.drivers.title')}>
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">{t('admin.drivers.roster')}</div>
        </div>
        {error && (
          <div className="admin-banner error" style={{ margin: 12 }}>
            {error}
          </div>
        )}
        {drivers == null ? (
          <div style={{ padding: 24 }} className="admin-muted">
            <span className="admin-spinner" aria-label="loading" /> {t('admin.drivers.loading')}
          </div>
        ) : drivers.length === 0 ? (
          <div style={{ padding: 24 }} className="admin-muted">
            {t('admin.drivers.empty')}
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>{t('admin.drivers.col.refid')}</th>
                <th>{t('admin.drivers.col.name')}</th>
                <th>{t('admin.drivers.col.active')}</th>
                <th>{t('admin.drivers.col.lastFix')}</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.refid}>
                  <td>{d.refid}</td>
                  <td>{d.name}</td>
                  <td>
                    {d.activeToday ? (
                      <span className="admin-status s-3">{t('admin.drivers.active')}</span>
                    ) : (
                      <span className="admin-status s-6">{t('admin.drivers.off')}</span>
                    )}
                  </td>
                  <td>
                    {d.lastFix ? (
                      <span className="admin-muted">
                        {d.lastFix.lat.toFixed(5)}, {d.lastFix.lon.toFixed(5)}
                        {d.lastFix.ts ? ` · ${new Date(d.lastFix.ts).toLocaleString()}` : ''}
                      </span>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
