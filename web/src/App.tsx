import { useEffect, useState } from 'react';
import { Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { loadSession, type Soft1Session } from './soft1/session';
import { LoginScreen } from './pages/Login';
import { BootstrapScreen } from './pages/Bootstrap';
import { DeliveryListScreen } from './pages/DeliveryList';
import { OrderDetailScreen } from './pages/OrderDetail';
import { SettingsScreen } from './pages/Settings';
import { ScanScreen } from './pages/Scan';
import { useTranslation } from './i18n/provider';

export function App() {
  const [session, setSession] = useState<Soft1Session | null>(() => loadSession());

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as Soft1Session | null;
      setSession(detail);
    };
    window.addEventListener('soft1:session', handler as EventListener);
    return () => window.removeEventListener('soft1:session', handler as EventListener);
  }, []);

  return (
    <div className="app-shell">
      <div className="app-column">
        <Routes>
          <Route path="/" element={<RootRedirect session={session} />} />
          <Route path="/login" element={<LoginScreen />} />
          <Route path="/bootstrap" element={<BootstrapScreen />} />
          <Route path="/orders" element={<Guard session={session}><DeliveryListScreen /></Guard>} />
          <Route path="/orders/:key" element={<Guard session={session}><OrderDetailScreen /></Guard>} />
          <Route path="/scan" element={<Guard session={session}><ScanScreen /></Guard>} />
          <Route path="/settings" element={<Guard session={session}><SettingsScreen /></Guard>} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </div>
    </div>
  );
}

function RootRedirect({ session }: { session: Soft1Session | null }) {
  if (!session) return <Navigate to="/login" replace />;
  if (!session.geoTableReady) return <Navigate to="/bootstrap" replace />;
  return <Navigate to="/orders" replace />;
}

function Guard({ session, children }: { session: Soft1Session | null; children: React.ReactNode }) {
  const nav = useNavigate();
  useEffect(() => {
    if (!session) nav('/login', { replace: true });
    else if (!session.geoTableReady) nav('/bootstrap', { replace: true });
  }, [session, nav]);
  if (!session || !session.geoTableReady) return null;
  return <>{children}</>;
}

function NotFound() {
  const { t } = useTranslation();
  return <div className="p-6 text-center text-muted">{t('common.notFound')}</div>;
}
