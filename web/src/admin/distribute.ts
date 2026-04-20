import type { DriverRow, FleetDeliveryRow } from './fleet';

/**
 * Auto-assignment: split `rows` across `drivers`, returning a plan the
 * UI can preview before confirming. The algorithm is intentionally
 * simple because parcels are uniform in this tenant:
 *
 *   1. Group rows by SHPZIP (anything missing → bucket '_noZip').
 *   2. Sort ZIP buckets by size (biggest first) so the largest zones
 *      land deterministically.
 *   3. Walk the buckets and assign each to a driver in round-robin
 *      order. When any driver has a last-known GPS fix, bias the
 *      first assignment of each ZIP to the nearest driver (breaking
 *      ties round-robin from there).
 *
 * Deliveries already assigned to a non-selected driver are left alone
 * when `scope === 'unassignedOnly'`. When `scope === 'redistribute'`
 * everything in `rows` is re-queued — the caller is responsible for
 * confirming with the dispatcher.
 */
export type Assignment = {
  driverRefid: string;
  driverName: string;
  rows: FleetDeliveryRow[];
};

export type DistributePlan = {
  assignments: Assignment[];
  untouched: FleetDeliveryRow[];
  totalPlanned: number;
};

export type DistributeScope = 'unassignedOnly' | 'redistribute';

const R_EARTH_M = 6_371_000;

function haversineM(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R_EARTH_M * Math.asin(Math.sqrt(s));
}

function groupByZip(rows: FleetDeliveryRow[]): Map<string, FleetDeliveryRow[]> {
  const g = new Map<string, FleetDeliveryRow[]>();
  for (const r of rows) {
    const key = (r.zip ?? '').trim() || '_noZip';
    const list = g.get(key);
    if (list) list.push(r);
    else g.set(key, [r]);
  }
  return g;
}

function centroid(rows: FleetDeliveryRow[]): { lat: number; lon: number } | null {
  let sumLat = 0;
  let sumLon = 0;
  let n = 0;
  for (const r of rows) {
    if (!r.coords) continue;
    sumLat += r.coords.lat;
    sumLon += r.coords.lon;
    n += 1;
  }
  if (n === 0) return null;
  return { lat: sumLat / n, lon: sumLon / n };
}

function nearestDriverIndex(
  centroidPt: { lat: number; lon: number } | null,
  drivers: DriverRow[]
): number | null {
  if (!centroidPt) return null;
  let bestIdx = -1;
  let bestDist = Infinity;
  drivers.forEach((d, i) => {
    if (!d.lastFix) return;
    const dist = haversineM(centroidPt, d.lastFix);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  });
  return bestIdx === -1 ? null : bestIdx;
}

export function planDistribution(
  rows: FleetDeliveryRow[],
  drivers: DriverRow[],
  scope: DistributeScope
): DistributePlan {
  if (drivers.length === 0) {
    return { assignments: [], untouched: [...rows], totalPlanned: 0 };
  }

  const selectedSet = new Set(drivers.map((d) => d.refid));

  // Candidates = rows that this run is allowed to reassign.
  const candidates: FleetDeliveryRow[] = [];
  const untouched: FleetDeliveryRow[] = [];
  for (const r of rows) {
    if (scope === 'unassignedOnly') {
      if (!r.actor) candidates.push(r);
      else untouched.push(r);
    } else {
      // redistribute: also leave rows that already belong to a driver NOT
      // in the selected set — the dispatcher explicitly excluded them.
      if (!r.actor || selectedSet.has(r.actor)) candidates.push(r);
      else untouched.push(r);
    }
  }

  const perDriver = new Map<string, FleetDeliveryRow[]>();
  for (const d of drivers) perDriver.set(d.refid, []);

  const byZip = groupByZip(candidates);
  // Biggest ZIP groups first keeps the result deterministic and makes
  // "same customer, many orders" land on one driver.
  const sorted = [...byZip.entries()].sort((a, b) => b[1].length - a[1].length);

  let rrCursor = 0;
  for (const [, zipRows] of sorted) {
    const c = centroid(zipRows);
    const nearest = nearestDriverIndex(c, drivers);
    const startIdx = nearest != null ? nearest : rrCursor;
    zipRows.forEach((r, i) => {
      const idx = (startIdx + i) % drivers.length;
      perDriver.get(drivers[idx].refid)!.push(r);
    });
    rrCursor = (rrCursor + zipRows.length) % drivers.length;
  }

  const assignments: Assignment[] = drivers.map((d) => ({
    driverRefid: d.refid,
    driverName: d.name,
    rows: perDriver.get(d.refid) ?? []
  }));

  return {
    assignments,
    untouched,
    totalPlanned: candidates.length
  };
}
