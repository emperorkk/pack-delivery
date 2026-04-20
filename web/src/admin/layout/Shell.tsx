import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession, loadSession } from '@/soft1/session';
import { useTranslation } from '@/i18n/provider';
import { clearAdminFlag } from '../adminSession';

export function AdminShell({
  title,
  headerRight,
  children
}: {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
}) {
  const { t } = useTranslation();
  const nav = useNavigate();
  const session = loadSession();

  function onSignOut() {
    clearAdminFlag();
    clearSession();
    nav('/admin/login', { replace: true });
  }

  return (
    <div className="admin-shell">
      <aside className="admin-nav">
        <div className="admin-nav-brand">{t('admin.nav.brand')}</div>
        <NavLink
          to="/admin/deliveries"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          {t('admin.nav.deliveries')}
        </NavLink>
        <NavLink
          to="/admin/drivers"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          {t('admin.nav.drivers')}
        </NavLink>
        <NavLink
          to="/admin/settings"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          {t('admin.nav.settings')}
        </NavLink>
        <div className="admin-nav-footer">
          <div>
            {t('admin.nav.signedInAs')} <strong>{session?.username ?? '—'}</strong>
            <br />
            REFID {session?.driverRefId ?? '—'}
          </div>
          <button type="button" className="admin-btn" onClick={onSignOut}>
            {t('admin.nav.signOut')}
          </button>
          <div className="admin-version">v{__APP_VERSION__}</div>
        </div>
      </aside>
      <main className="admin-main">
        <header className="admin-header">
          <h1>{title}</h1>
          <div className="admin-header-meta">{headerRight}</div>
        </header>
        <div className="admin-body">{children}</div>
      </main>
    </div>
  );
}
