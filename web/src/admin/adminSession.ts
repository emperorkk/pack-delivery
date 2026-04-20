import { loadSession } from '@/soft1/session';

/**
 * The admin gate reuses the driver's `soft1.session` (same login flow, same
 * clientID — only the UI differs). What we keep out-of-band is a small
 * "REFID X has been verified as admin" marker so we don't run IsAdmin on
 * every page navigation. The marker is invalidated whenever the underlying
 * session's clientID changes.
 */

type AdminFlag = {
  refid: string;
  clientID: string;
  verifiedAt: string;
};

const KEY = 'pd.admin.flag';

export function readAdminFlag(): AdminFlag | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminFlag;
  } catch {
    return null;
  }
}

export function writeAdminFlag(refid: string, clientID: string): void {
  const flag: AdminFlag = { refid, clientID, verifiedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(flag));
}

export function clearAdminFlag(): void {
  localStorage.removeItem(KEY);
}

/**
 * True iff there's a driver session AND the admin flag matches its REFID
 * and clientID. Any mismatch — different user, expired session, stale flag
 * — forces a fresh IsAdmin check at /admin/login.
 */
export function isAdminSessionActive(): boolean {
  const s = loadSession();
  if (!s) return false;
  const flag = readAdminFlag();
  if (!flag) return false;
  return flag.refid === s.driverRefId && flag.clientID === s.clientID;
}
