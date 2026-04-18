import { openDB, type IDBPDatabase } from 'idb';

/**
 * Generic FIFO offline queue backed by IndexedDB. Each queued item carries
 * a `kind` that the replay dispatcher uses to route to the right handler.
 * Used for:
 *   - SOACTION writes (with KEY-patching: a follow-up update points to the
 *     insert that happened earlier in the same queue),
 *   - insertCCCKKLOLA geo points (idle tick and setdata-audit).
 */
export type QueueItem = {
  id?: number;
  kind: 'soaction' | 'geo';
  payload: unknown;
  createdAt: string;
  /** Local correlation id — used by SOACTION updates to reference an
   *  earlier insert whose SOACTION key is unknown until it replays. */
  correlationId?: string;
  /** Resolved SOACTION key after the insert replays successfully. */
  resolvedKey?: string;
};

const DB_NAME = 'pd';
const STORE = 'queue';

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(d) {
        if (!d.objectStoreNames.contains(STORE)) {
          d.createObjectStore(STORE, { keyPath: 'id', autoIncrement: true });
        }
      }
    });
  }
  return dbPromise;
}

export async function enqueue(item: Omit<QueueItem, 'id' | 'createdAt'>): Promise<number> {
  const d = await db();
  const id = await d.add(STORE, { ...item, createdAt: new Date().toISOString() });
  return id as number;
}

export async function listQueue(): Promise<QueueItem[]> {
  const d = await db();
  const all = (await d.getAll(STORE)) as QueueItem[];
  return all.sort((a, b) => (a.id ?? 0) - (b.id ?? 0));
}

export async function remove(id: number): Promise<void> {
  const d = await db();
  await d.delete(STORE, id);
}

export async function update(id: number, patch: Partial<QueueItem>): Promise<void> {
  const d = await db();
  const cur = (await d.get(STORE, id)) as QueueItem | undefined;
  if (!cur) return;
  await d.put(STORE, { ...cur, ...patch });
}
