import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AdminLoginScreen } from './pages/AdminLogin';
import { FleetDeliveriesScreen } from './pages/FleetDeliveries';
import { DriversScreen } from './pages/Drivers';
import { AdminSettingsScreen } from './pages/AdminSettings';
import { isAdminSessionActive } from './adminSession';

export function AdminApp() {
  return (
    <Routes>
      <Route path="/admin" element={<Navigate to="/admin/deliveries" replace />} />
      <Route path="/admin/login" element={<AdminLoginScreen />} />
      <Route
        path="/admin/deliveries"
        element={
          <AdminGuard>
            <FleetDeliveriesScreen />
          </AdminGuard>
        }
      />
      <Route
        path="/admin/drivers"
        element={
          <AdminGuard>
            <DriversScreen />
          </AdminGuard>
        }
      />
      <Route
        path="/admin/settings"
        element={
          <AdminGuard>
            <AdminSettingsScreen />
          </AdminGuard>
        }
      />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}

/**
 * Each guard reads `isAdminSessionActive()` at mount time — which matters
 * because the admin flag is written right before `nav('/admin/...')`, so a
 * fresh read always sees the true value. The event listeners keep the
 * guard in sync with later changes (sign-out, another tab signing out,
 * etc.).
 */
function AdminGuard({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<boolean>(() => isAdminSessionActive());
  const nav = useNavigate();

  useEffect(() => {
    if (!active) nav('/admin/login', { replace: true });
  }, [active, nav]);

  useEffect(() => {
    const handler = () => setActive(isAdminSessionActive());
    window.addEventListener('soft1:session', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('soft1:session', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  if (!active) return null;
  return <>{children}</>;
}
