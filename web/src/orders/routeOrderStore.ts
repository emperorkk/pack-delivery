import type { DeliveryRow } from './list';

/**
 * Persistent delivery-list ordering. Populated by optimize or by manual
 * drag reordering, and re-applied on every list refresh so the driver's
 * chosen sequence survives reloads, 10-minute auto-refreshes, and the
 * intermittent SOACTION-triggered reloads. Cleared only when the driver
 * runs Optimize again or explicitly clears it.
 */
const KEY = 'pd.routeOrder';

export type StoredRouteOrder = {
  /** FINDOC → 1-based position in the route. Rows omitted from this map
   *  are considered "unplaced" (newly arrived since the last sort) and
   *  render at the tail with seq:null so the driver can spot them. */
  findocSeq: Record<string, number>;
  savedAt: string;
};

export function loadRouteOrder(): StoredRouteOrder | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredRouteOrder;
    if (!parsed || typeof parsed.findocSeq !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveRouteOrder(
  ordered: Array<{ row: DeliveryRow; seq: number | null }>
): void {
  const findocSeq: Record<string, number> = {};
  for (const { row, seq } of ordered) {
    if (seq != null && row.findoc) findocSeq[row.findoc] = seq;
  }
  const payload: StoredRouteOrder = { findocSeq, savedAt: new Date().toISOString() };
  localStorage.setItem(KEY, JSON.stringify(payload));
}

export function clearRouteOrder(): void {
  localStorage.removeItem(KEY);
}

/**
 * Project a freshly fetched list of deliveries through the stored order.
 * Rows that still have a saved position move to the front in that order
 * (renumbered 1..N to keep the badge sequence tidy when some rows have
 * disappeared since the sort); anything new is appended at the tail with
 * seq:null.
 */
export function applyStoredOrder(
  rows: DeliveryRow[],
  stored: StoredRouteOrder
): Array<{ row: DeliveryRow; seq: number | null }> {
  const placed: Array<{ row: DeliveryRow; origSeq: number }> = [];
  const unplaced: DeliveryRow[] = [];
  for (const row of rows) {
    const s = stored.findocSeq[row.findoc];
    if (s != null) placed.push({ row, origSeq: s });
    else unplaced.push(row);
  }
  placed.sort((a, b) => a.origSeq - b.origSeq);
  const result: Array<{ row: DeliveryRow; seq: number | null }> = [];
  placed.forEach(({ row }, i) => result.push({ row, seq: i + 1 }));
  unplaced.forEach((row) => result.push({ row, seq: null }));
  return result;
}

/** Renumber every placed row to a fresh 1..N sequence after a reorder. */
export function renumber(
  ordered: Array<{ row: DeliveryRow; seq: number | null }>
): Array<{ row: DeliveryRow; seq: number | null }> {
  let n = 1;
  return ordered.map(({ row, seq }) => ({
    row,
    seq: seq != null ? n++ : null
  }));
}
