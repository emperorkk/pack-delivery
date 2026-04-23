import type { FleetDeliveryRow } from './fleet';

export type RouteStop = {
  row: FleetDeliveryRow;
  /** 1-based position in the sequence; null when the stop has no coords
   *  and therefore can't be placed on the NN path. */
  seq: number | null;
  /** True when this stop is the locked final destination. */
  isFinal: boolean;
};

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

/**
 * Greedy nearest-neighbour ordering of a lane's deliveries.
 *
 *   - `origin` is normally the driver's last known GPS fix. When null we
 *     skip NN and keep the server-provided order, because without a
 *     starting point there is no meaningful "nearest first".
 *   - When `finalFindoc` names a row in `rows`, that row is pinned to the
 *     very end of the sequence and excluded from the NN walk.
 *   - Stops without coordinates stay visible but get `seq = null`; they
 *     sit between the last routed stop and the final one so the pinned
 *     stop is unambiguously last.
 */
export function routeStops(
  rows: FleetDeliveryRow[],
  origin: { lat: number; lon: number } | null,
  finalFindoc: string | undefined
): RouteStop[] {
  const finalRow =
    finalFindoc ? rows.find((r) => r.findoc === finalFindoc) : undefined;
  const pool = finalRow ? rows.filter((r) => r.findoc !== finalRow.findoc) : rows;

  const result: RouteStop[] = [];

  if (origin) {
    const withCoords = pool.filter((r) => r.coords);
    const withoutCoords = pool.filter((r) => !r.coords);
    const remaining = withCoords.slice();
    let cursor = origin;
    while (remaining.length > 0) {
      let bestIdx = 0;
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i += 1) {
        const d = haversineM(cursor, remaining[i].coords!);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      const next = remaining.splice(bestIdx, 1)[0];
      result.push({ row: next, seq: result.length + 1, isFinal: false });
      cursor = next.coords!;
    }
    for (const r of withoutCoords) {
      result.push({ row: r, seq: null, isFinal: false });
    }
  } else {
    pool.forEach((r, i) =>
      result.push({ row: r, seq: r.coords ? i + 1 : null, isFinal: false })
    );
  }

  if (finalRow) {
    const seq = result.filter((s) => s.seq != null).length + 1;
    result.push({ row: finalRow, seq, isFinal: true });
  }

  return result;
}
