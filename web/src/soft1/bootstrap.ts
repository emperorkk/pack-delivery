import { cstActivePing, cstCall } from './client';
import { updateSession, type Soft1Session } from './session';

export type BootstrapResult =
  | { status: 'ok'; session: Soft1Session }
  | { status: 'cst-missing' }
  | { status: 'table-create-failed'; message: string }
  | { status: 'network-error'; message: string };

type CreateTableResponse = { success: boolean; message?: string };

/**
 * Post-authenticate boot sequence (C.1 + C.1.1):
 *   1. ping the `active` CST endpoint
 *   2. if missing, bail with `cst-missing` (UI shows blocking dialog)
 *   3. call `createCCCKKLOLATable` once per session to ensure the geo history
 *      table + index exist. Cached via `session.geoTableReady`.
 */
export async function runBootstrap(session: Soft1Session): Promise<BootstrapResult> {
  try {
    const alive = await cstActivePing(session);
    if (!alive) return { status: 'cst-missing' };

    if (session.geoTableReady === true) {
      return { status: 'ok', session };
    }

    const res = await cstCall<CreateTableResponse>('createCCCKKLOLATable', {}, session);
    if (!res.success) {
      return { status: 'table-create-failed', message: res.message ?? 'createCCCKKLOLATable returned success:false' };
    }

    const next = updateSession({ geoTableReady: true }) ?? session;
    return { status: 'ok', session: next };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { status: 'network-error', message: msg };
  }
}
