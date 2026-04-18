import { listQueue, remove, update } from '@/offline/queue';
import { replayGeo, type GeoUploadPayload } from './transport';
import { replaySoactionWrite } from '@/orders/soactionReplay';

/**
 * Drains the offline queue in FIFO order. A SOACTION insert that resolves
 * its server-side key updates any later SOACTION updates whose
 * `correlationId` matches (KEY patching).
 */
export async function replayAll(): Promise<void> {
  const items = await listQueue();
  for (const item of items) {
    if (item.id == null) continue;
    try {
      if (item.kind === 'geo') {
        const ok = await replayGeo(item.payload as GeoUploadPayload);
        if (ok) await remove(item.id);
        else return; // stop on the first failure, keep FIFO order
      } else if (item.kind === 'soaction') {
        const res = await replaySoactionWrite(item);
        if (res.ok) {
          if (res.resolvedKey && item.correlationId) {
            // Propagate the resolved KEY to any pending updates that referenced it.
            const rest = await listQueue();
            for (const follow of rest) {
              if (follow.id != null && follow.kind === 'soaction' && follow.correlationId === item.correlationId && follow !== item) {
                await update(follow.id, { resolvedKey: res.resolvedKey });
              }
            }
          }
          await remove(item.id);
        } else {
          return;
        }
      }
    } catch {
      return;
    }
  }
}
