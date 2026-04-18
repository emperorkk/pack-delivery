import { soft1Call } from '@/soft1/client';
import { enqueue } from '@/offline/queue';
import { pushGeo } from '@/geo/transport';
import { loadSettings } from '@/settings/store';
import { loadSession } from '@/soft1/session';
import type { ActStatus } from './actStatus';
import { getActionKey, setActionKey } from './actionKeyCache';

export type SoactionInsert = {
  kind: 'insert';
  findoc: string;
  trdr: string;
  trdbranch?: string;
  actstatus: ActStatus;
  comments?: string;
  /** Local correlation id so that an offline-queued update can reference
   *  the insert and have its KEY patched once the insert replays. */
  correlationId: string;
};

export type SoactionUpdate = {
  kind: 'update';
  findoc: string;
  trdr: string;
  trdbranch?: string;
  actstatus: ActStatus;
  comments?: string;
  soactionKey: string;
  correlationId: string;
};

export type SoactionWrite = SoactionInsert | SoactionUpdate;

type SetDataResponse = {
  success?: boolean;
  SOACTION?: Array<Record<string, unknown>>;
  KEY?: string;
};

function buildBody(w: SoactionWrite): Record<string, unknown> {
  const s = loadSession();
  const settings = loadSettings();
  const actor = s?.driverRefId ?? '';
  const head: Record<string, unknown> = {
    SERIES: settings.seriesUpdate,
    FINDOC: w.findoc,
    TRDR: w.trdr,
    ACTOR: actor,
    ACTSTATUS: String(w.actstatus)
  };
  if (w.trdbranch) head.TRDBRANCH = w.trdbranch;
  if (w.comments !== undefined) head.COMMENTS = w.comments;

  return {
    service: 'setData',
    OBJECT: 'SOACTION',
    KEY: w.kind === 'insert' ? '' : w.soactionKey,
    DATA: { SOACTION: [head] },
    LOCATEINFO: 'SOACTION:SOACTION,ACTSTATUS'
  };
}

export type SoactionResult =
  | { ok: true; soactionKey: string; queued: false }
  | { ok: true; soactionKey: null; queued: true; queueId: number }
  | { ok: false; error: string };

export async function writeSoactionAndAudit(w: SoactionWrite): Promise<SoactionResult> {
  try {
    const body = buildBody(w);
    const res = await soft1Call<SetDataResponse>(body);
    const row = res.SOACTION?.[0];
    const key =
      (res.KEY as string | undefined) ??
      (row?.SOACTION as string | undefined) ??
      (row?.KEY as string | undefined);
    if (!key) {
      // The call returned 200 but no key came back — treat as error.
      return { ok: false, error: 'setdata returned no SOACTION key' };
    }
    setActionKey(w.findoc, key);
    void pushGeo('setdata-audit', describeWrite(w, key));
    return { ok: true, soactionKey: key, queued: false };
  } catch (err) {
    if (!navigator.onLine) {
      const queueId = await enqueue({ kind: 'soaction', payload: w, correlationId: w.correlationId });
      return { ok: true, soactionKey: null, queued: true, queueId };
    }
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function newCorrelationId(): string {
  return `corr-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function describeWrite(w: SoactionWrite, resolvedKey: string): string {
  const base =
    w.kind === 'insert'
      ? `SOACTION insert: FINDOC=${w.findoc} TRDR=${w.trdr} ACTSTATUS=${w.actstatus}`
      : `SOACTION update: SOACTION=${resolvedKey} FINDOC=${w.findoc} ACTSTATUS=${w.actstatus}`;
  const comment = w.comments?.trim();
  return comment ? `${base} — '${comment}'` : base;
}

export { getActionKey };
