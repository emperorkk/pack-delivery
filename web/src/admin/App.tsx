import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AdminLoginScreen } from './pages/AdminLogin';
import { FleetDeliveriesScreen } from './pages/FleetDeliveries';
import { DriversScreen } from './pages/Drivers';
import { isAdminSessionActive } from './adminSession';

export function AdminApp() {
  // We track whether the admin session is currently active so that sign-out
  // from any page triggers a redirect here without a full reload.
  const [active, setActive] = useState<boolean>(() => isAdminSessionActive());

  useEffect(() => {
    const handler = () => setActive(isAdminSessionActive());
    window.addEventListener('soft1:session', handler);
    window.addEventListener('storage', handler);
    return () => {
      window.removeEventListener('soft1:session', handler);
      window.removeEventListener('storage', handler);
    };
  }, []);

  return (
    <Routes>
      <Route path="/admin" element={<Navigate to="/admin/deliveries" replace />} />
      <Route path="/admin/login" element={<AdminLoginScreen />} />
      <Route
        path="/admin/deliveries"
        element={
          <AdminGuard active={active}>
            <FleetDeliveriesScreen />
          </AdminGuard>
        }
      />
      <Route
        path="/admin/drivers"
        element={
          <AdminGuard active={active}>
            <DriversScreen />
          </AdminGuard>
        }
      />
      <Route path="*" element={<Navigate to="/admin/login" replace />} />
    </Routes>
  );
}

function AdminGuard({
  active,
  children
}: {
  active: boolean;
  children: React.ReactNode;
}) {
  const nav = useNavigate();
  useEffect(() => {
    if (!active) nav('/admin/login', { replace: true });
  }, [active, nav]);
  if (!active) return null;
  return <>{children}</>;
}
