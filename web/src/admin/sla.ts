import type { FleetDeliveryRow } from './fleet';

/**
 * SLA signal for a single delivery, based on the preferred time window
 * (`TIMETO`) vs. now and whether the driver has already marked progress.
 *
 *   - overdue : delivery window has closed and status is not "Delivered"
 *   - dueSoon : window closes in < 30 min and status is still "pending"
 *   - null    : no window, already delivered, or window is "all day"
 */
export type SlaState = 'overdue' | 'dueSoon' | null;

const DUE_SOON_MIN = 30;

/** Collapse TIMETO values the tenant uses as "any time" into no-op. */
function isAllDay(timeTo: string | undefined): boolean {
  if (!timeTo) return true;
  const t = timeTo.trim();
  return t === '' || t === '00:00' || t === '23:59';
}

function parseHm(s: string | undefined): [number, number] | null {
  if (!s) return null;
  const m = /^(\d{1,2}):(\d{1,2})$/.exec(s.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (!Number.isFinite(h) || !Number.isFinite(min)) return null;
  return [h, min];
}

/** Deliver date uses the CST's "YYYY-MM-DD HH:MM:SS" format — we only need the date part. */
function parseDeliverDate(s: string | undefined): Date | null {
  if (!s) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function slaFor(row: FleetDeliveryRow, now: Date): SlaState {
  if (row.actstatus === 3) return null;          // Delivered → no alert
  if (row.actstatus === 5 || row.actstatus === 6) return null; // Returned / Cancelled
  if (isAllDay(row.timeTo)) return null;

  const hm = parseHm(row.timeTo);
  if (!hm) return null;

  const base = parseDeliverDate(row.deliverDate) ?? new Date(now);
  const target = new Date(base);
  target.setHours(hm[0], hm[1], 0, 0);

  const diffMin = (target.getTime() - now.getTime()) / 60000;
  if (diffMin < 0) return 'overdue';
  if (diffMin < DUE_SOON_MIN && (row.actstatus == null || row.actstatus < 2))
    return 'dueSoon';
  return null;
}
