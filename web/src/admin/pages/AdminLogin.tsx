import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '@/soft1/client';
import { Soft1Error, Soft1UnreachableError } from '@/soft1/errors';
import { clearSession, loadSession } from '@/soft1/session';
import { isAdmin } from '../fleet';
import {
  clearAdminFlag,
  isAdminSessionActive,
  writeAdminFlag
} from '../adminSession';

export function AdminLoginScreen() {
  const nav = useNavigate();
  const [serialNumber, setSerialNumber] = useState('');
  const [appId, setAppId] = useState('1199');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // If we already have a verified admin session, bounce to the fleet view.
  useEffect(() => {
    if (isAdminSessionActive()) {
      nav('/admin/deliveries', { replace: true });
    }
  }, [nav]);

  async function verifyAdminAndRedirect(): Promise<void> {
    const s = loadSession();
    if (!s) {
      setError('Signed in but no session found.');
      return;
    }
    const ok = await isAdmin(s.driverRefId);
    if (!ok) {
      clearAdminFlag();
      setError('This account does not have dispatcher access.');
      return;
    }
    writeAdminFlag(s.driverRefId, s.clientID);
    nav('/admin/deliveries', { replace: true });
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn({
        serialNumber: serialNumber.trim(),
        appId: appId.trim(),
        username,
        password
      });
      await verifyAdminAndRedirect();
    } catch (err) {
      if (err instanceof Soft1UnreachableError) {
        setError('Soft1 endpoint is unreachable. Check the serial number.');
      } else if (err instanceof Soft1Error) {
        setError(err.message);
      } else {
        setError(err instanceof Error ? err.message : String(err));
      }
      clearSession();
      clearAdminFlag();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-login">
      <form onSubmit={onSubmit} className="admin-login-card">
        <h1>Dispatcher sign-in</h1>
        {error && <div className="admin-banner error">{error}</div>}
        <label className="admin-login-field">
          Serial number
          <input
            className="admin-input"
            inputMode="numeric"
            autoComplete="off"
            value={serialNumber}
            onChange={(e) => setSerialNumber(e.target.value)}
            placeholder="011..."
            required
          />
        </label>
        <label className="admin-login-field">
          App ID
          <input
            className="admin-input"
            inputMode="numeric"
            autoComplete="off"
            value={appId}
            onChange={(e) => setAppId(e.target.value)}
            required
          />
        </label>
        <label className="admin-login-field">
          Username
          <input
            className="admin-input"
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
          />
        </label>
        <label className="admin-login-field">
          Password
          <input
            className="admin-input"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
        </label>
        <button
          type="submit"
          className="admin-btn admin-btn-primary"
          disabled={busy}
        >
          {busy ? <span className="admin-spinner" aria-label="loading" /> : 'Sign in'}
        </button>
      </form>
    </div>
  );
}
