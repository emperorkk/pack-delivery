import { cstCall } from '@/soft1/client';
import { requireSession } from '@/soft1/session';
import { enqueue } from '@/offline/queue';
import { currentFix } from './currentFix';

export type GeoPushReason =
  | 'GeoPush'
  | 'tick'
  | 'login'
  | 'list-refresh'
  | 'open-order'
  | 'scan'
  | 'status-change'
  | 'setdata-audit'
  | 'manual';

export type GeoUploadPayload = {
  REFID: string;
  LATITUDE: string;
  LONGITUDE: string;
  LAT: string;
  LON: string;
  TS: string;
  REASON: GeoPushReason;
  COMMENTS?: string;
};

type InsertResponse = { success: boolean; message?: string; id?: number };

function buildPayload(reason: GeoPushReason, comments?: string): GeoUploadPayload {
  const s = requireSession();
  return {
    REFID: s.driverRefId,
    LATITUDE: currentFix.lat,
    LONGITUDE: currentFix.lon,
    LAT: currentFix.lat,
    LON: currentFix.lon,
    TS: new Date().toISOString(),
    REASON: reason,
    ...(comments !== undefined ? { COMMENTS: comments } : {})
  };
}

/**
 * Fire a geolocation audit event via the `insertCCCKKLOLA` CST. On network
 * failure, the point is queued in IndexedDB for replay on reconnect.
 *
 * Pre-condition: the caller must ensure `session.geoTableReady === true`.
 * The caller is block F.10 (setdata-audit), block H.3 (idle tick), and
 * on-action triggers listed in GeoPushReason.
 */
export async function pushGeo(reason: GeoPushReason, comments?: string): Promise<void> {
  const s = requireSession();
  if (!s.geoTableReady) {
    await enqueue({ kind: 'geo', payload: buildPayload(reason, comments) });
    return;
  }
  const payload = buildPayload(reason, comments);
  try {
    const res = await cstCall<InsertResponse>('insertCCCKKLOLA', payload);
    if (!res.success) {
      await enqueue({ kind: 'geo', payload });
    }
  } catch {
    await enqueue({ kind: 'geo', payload });
  }
}

/** Used by the offline replayer — re-sends a previously queued payload verbatim. */
export async function replayGeo(payload: GeoUploadPayload): Promise<boolean> {
  try {
    const res = await cstCall<InsertResponse>('insertCCCKKLOLA', payload);
    return !!res.success;
  } catch {
    return false;
  }
}
