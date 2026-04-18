import { soft1Call } from '@/soft1/client';
import type { QueueItem } from '@/offline/queue';
import { pushGeo } from '@/geo/transport';
import { loadSession } from '@/soft1/session';
import { loadSettings } from '@/settings/store';
import { describeWrite, type SoactionWrite } from './soaction';
import { setActionKey } from './actionKeyCache';

type SetDataResponse = { SOACTION?: Array<Record<string, unknown>>; KEY?: string; success?: boolean };

/**
 * Replays a queued SOACTION write. If it was an `update` whose KEY was
 * unknown when queued (because the corresponding insert had not replayed
 * yet), the replayer expects `item.resolvedKey` to have been patched in
 * by the earlier insert's success path (see `geo/replay.ts`).
 */
export async function replaySoactionWrite(
  item: QueueItem
): Promise<{ ok: true; resolvedKey: string } | { ok: false }> {
  const w = item.payload as SoactionWrite;
  const settings = loadSettings();
  const s = loadSession();
  if (!s) return { ok: false };

  const head: Record<string, unknown> = {
    SERIES: settings.seriesUpdate,
    FINDOC: w.findoc,
    TRDR: w.trdr,
    ACTOR: s.driverRefId,
    ACTSTATUS: String(w.actstatus)
  };
  if (w.trdbranch) head.TRDBRANCH = w.trdbranch;
  if (w.comments !== undefined) head.COMMENTS = w.comments;

  const key = w.kind === 'insert' ? '' : item.resolvedKey ?? w.soactionKey;
  const body: Record<string, unknown> = {
    service: 'setData',
    OBJECT: 'SOACTION',
    KEY: key,
    DATA: { SOACTION: [head] },
    LOCATEINFO: 'SOACTION:SOACTION,ACTSTATUS'
  };

  try {
    const res = await soft1Call<SetDataResponse>(body);
    const row = res.SOACTION?.[0];
    const resolved =
      (res.KEY as string | undefined) ??
      (row?.SOACTION as string | undefined) ??
      (row?.KEY as string | undefined) ??
      (w.kind === 'update' ? key : '');

    if (!resolved) return { ok: false };
    setActionKey(w.findoc, resolved);
    void pushGeo('setdata-audit', describeWrite(w, resolved));
    return { ok: true, resolvedKey: resolved };
  } catch {
    return { ok: false };
  }
}
