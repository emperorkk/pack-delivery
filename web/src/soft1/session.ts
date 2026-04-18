export type Soft1Context = {
  COMPANY: string;
  COMPANYNAME: string;
  BRANCH: string;
  BRANCHNAME: string;
  MODULE: string;
  MODULENAME?: string;
  REFID: string;
  REFIDNAME?: string;
};

export type Soft1Session = {
  baseUrl: string;
  serialNumber: string;
  appId: string;
  clientID: string;
  username: string;
  companyinfo?: string;
  companyImage?: string;
  context: Soft1Context;
  driverRefId: string;
  geoTableReady?: boolean;
  loggedInAt: string;
};

const KEY = 'soft1.session';

export function loadSession(): Soft1Session | null {
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Soft1Session;
  } catch {
    return null;
  }
}

export function saveSession(s: Soft1Session): void {
  localStorage.setItem(KEY, JSON.stringify(s));
  window.dispatchEvent(new CustomEvent('soft1:session', { detail: s }));
}

export function updateSession(patch: Partial<Soft1Session>): Soft1Session | null {
  const cur = loadSession();
  if (!cur) return null;
  const next = { ...cur, ...patch };
  saveSession(next);
  return next;
}

export function clearSession(): void {
  localStorage.removeItem(KEY);
  window.dispatchEvent(new CustomEvent('soft1:session', { detail: null }));
}

export function requireSession(): Soft1Session {
  const s = loadSession();
  if (!s) throw new Error('NoSession');
  return s;
}
