import { baseUrlFor, config } from '@/config';
import { currentFix } from '@/geo/currentFix';
import { checkEnvelope, Soft1UnreachableError } from './errors';
import { loadSession, saveSession, type Soft1Context, type Soft1Session } from './session';

/** Universal body stamp per directions-soft1-login.md §0. */
function stamp<T extends Record<string, unknown>>(body: T): T & { LATITUDE: string; LONGITUDE: string; enc: string } {
  return { ...body, LATITUDE: currentFix.lat, LONGITUDE: currentFix.lon, enc: 'utf8' };
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  } catch (cause) {
    throw new Soft1UnreachableError(url, cause);
  }
  if (!res.ok) throw new Soft1UnreachableError(`${url} (HTTP ${res.status})`);
  return (await res.json()) as T;
}

// ────────────────────────────────────────────────────────────────
// Availability (pre-flight)
// ────────────────────────────────────────────────────────────────

export async function preflightInfo(serialNumber: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrlFor(serialNumber)}?info`, { method: 'GET' });
    return res.ok;
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// Login / authenticate
// ────────────────────────────────────────────────────────────────

export type LoginResponse = {
  success: true;
  clientID: string;
  objs: Soft1Context[];
  ver?: string;
  sn?: string;
  appid?: string;
};

export type AuthenticateResponse = {
  success: true;
  clientID: string;
  s1u?: number;
  image?: string;
  companyinfo?: string;
};

export async function login(input: {
  serialNumber: string;
  appId: string;
  username: string;
  password: string;
}): Promise<LoginResponse> {
  const url = baseUrlFor(input.serialNumber);
  const body = await postJson<LoginResponse | { success: false }>(
    url,
    stamp({
      service: 'login',
      appId: input.appId,
      username: input.username,
      password: input.password
    })
  );
  return checkEnvelope(body) as LoginResponse;
}

export async function authenticate(input: {
  serialNumber: string;
  appId: string;
  preliminaryClientID: string;
  context: Soft1Context;
}): Promise<AuthenticateResponse> {
  const url = baseUrlFor(input.serialNumber);
  const body = await postJson<AuthenticateResponse | { success: false }>(
    url,
    stamp({
      service: 'authenticate',
      appId: input.appId,
      clientID: input.preliminaryClientID,
      COMPANY: input.context.COMPANY,
      BRANCH: input.context.BRANCH,
      MODULE: input.context.MODULE,
      REFID: input.context.REFID
    })
  );
  return checkEnvelope(body) as AuthenticateResponse;
}

// ────────────────────────────────────────────────────────────────
// Generic session-bound call (getData / setData / anything with `service`)
// ────────────────────────────────────────────────────────────────

export async function soft1Call<T = unknown>(fields: Record<string, unknown>, session?: Soft1Session): Promise<T> {
  const s = session ?? loadSession();
  if (!s) throw new Error('NoSession');
  const body = await postJson<T & { success?: boolean }>(
    s.baseUrl,
    stamp({ appId: s.appId, clientID: s.clientID, ...fields })
  );
  return checkEnvelope(body) as T;
}

// ────────────────────────────────────────────────────────────────
// CST dispatcher — calls go to /s1services/JS/<namespace>/<method>
// ────────────────────────────────────────────────────────────────

const CST_NAMESPACE = 'aicmp.pack-delivery';

export async function cstCall<T = unknown>(
  method: string,
  fields: Record<string, unknown> = {},
  session?: Soft1Session
): Promise<T> {
  const s = session ?? loadSession();
  if (!s) throw new Error('NoSession');
  const url = `${s.baseUrl}/JS/${CST_NAMESPACE}/${method}`;
  const body = await postJson<T & { success?: boolean }>(
    url,
    stamp({ appId: s.appId, clientID: s.clientID, ...fields })
  );
  return checkEnvelope(body) as T;
}

/** GET variant used by the `active` ping (returns literal `1` on success). */
export async function cstActivePing(session?: Soft1Session): Promise<boolean> {
  const s = session ?? loadSession();
  if (!s) throw new Error('NoSession');
  try {
    const res = await fetch(`${s.baseUrl}/JS/${CST_NAMESPACE}/active`, { method: 'GET' });
    if (!res.ok) return false;
    const txt = (await res.text()).trim();
    return txt === '1' || txt === '"1"';
  } catch {
    return false;
  }
}

// ────────────────────────────────────────────────────────────────
// Session bootstrap
// ────────────────────────────────────────────────────────────────

export async function signIn(input: {
  serialNumber: string;
  appId: string;
  username: string;
  password: string;
}): Promise<Soft1Session> {
  if (!(await preflightInfo(input.serialNumber))) {
    throw new Soft1UnreachableError(`https://${input.serialNumber}.oncloud.gr/s1services`);
  }

  const loginRes = await login(input);
  const ctx = loginRes.objs[0];
  if (!ctx) throw new Error('Login returned no contexts');

  const auth = await authenticate({
    serialNumber: input.serialNumber,
    appId: input.appId,
    preliminaryClientID: loginRes.clientID,
    context: ctx
  });

  const session: Soft1Session = {
    baseUrl: baseUrlFor(input.serialNumber),
    serialNumber: input.serialNumber,
    appId: input.appId,
    clientID: auth.clientID,
    username: input.username,
    companyinfo: auth.companyinfo,
    companyImage: auth.image,
    context: ctx,
    driverRefId: ctx.REFID,
    loggedInAt: new Date().toISOString()
  };
  saveSession(session);
  void config; // ensure tree-shaker keeps the module
  return session;
}
