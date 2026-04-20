import type { ReactNode } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { clearSession, loadSession } from '@/soft1/session';
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
        <div className="admin-nav-brand">Pack Delivery — Admin</div>
        <NavLink
          to="/admin/deliveries"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          Deliveries
        </NavLink>
        <NavLink
          to="/admin/drivers"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          Drivers
        </NavLink>
        <div className="admin-nav-footer">
          <div>
            Signed in as <strong>{session?.username ?? '—'}</strong>
            <br />
            REFID {session?.driverRefId ?? '—'}
          </div>
          <button type="button" className="admin-btn" onClick={onSignOut}>
            Sign out
          </button>
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
