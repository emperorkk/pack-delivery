import type { DeliveryRow } from './list';

const GEOCODE_CACHE_KEY = 'pd.geocode';

type Cache = Record<string, { lat: number; lon: number } | null>;

function loadCache(): Cache {
  try {
    return JSON.parse(localStorage.getItem(GEOCODE_CACHE_KEY) ?? '{}') as Cache;
  } catch {
    return {};
  }
}

function saveCache(c: Cache): void {
  localStorage.setItem(GEOCODE_CACHE_KEY, JSON.stringify(c));
}

function haversineKm(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

let geocodeQueue = Promise.resolve();

/** Nominatim geocoder with 1 req/s throttle + localStorage cache. */
function geocode(address: string): Promise<{ lat: number; lon: number } | null> {
  const cache = loadCache();
  if (Object.prototype.hasOwnProperty.call(cache, address)) {
    return Promise.resolve(cache[address]);
  }
  const task = geocodeQueue.then(async () => {
    await new Promise((r) => setTimeout(r, 1_000));
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`,
        { headers: { Accept: 'application/json' } }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const arr = (await res.json()) as Array<{ lat: string; lon: string }>;
      const hit = arr[0];
      const pt = hit ? { lat: Number(hit.lat), lon: Number(hit.lon) } : null;
      const c = loadCache();
      c[address] = pt;
      saveCache(c);
      return pt;
    } catch {
      return null;
    }
  });
  geocodeQueue = task.then(() => undefined);
  return task;
}

/**
 * Greedy nearest-neighbor route order starting from `origin`. Rows without
 * known coordinates (even after geocoding) are appended at the tail in
 * their original order, with `seq: null` so the UI can fade them.
 */
export async function optimizeRoute(
  origin: { lat: number; lon: number } | null,
  rows: DeliveryRow[]
): Promise<Array<{ row: DeliveryRow; seq: number | null }>> {
  const withCoords: DeliveryRow[] = [];
  const without: DeliveryRow[] = [];

  for (const r of rows) {
    if (r.coords) {
      withCoords.push(r);
      continue;
    }
    const addr = [r.address, r.city, r.zip].filter(Boolean).join(', ');
    if (!addr) {
      without.push(r);
      continue;
    }
    const coords = await geocode(addr);
    if (coords) withCoords.push({ ...r, coords });
    else without.push(r);
  }

  const ordered: Array<{ row: DeliveryRow; seq: number }> = [];
  const remaining = [...withCoords];
  let cursor = origin;
  while (remaining.length) {
    let bestIdx = 0;
    if (cursor) {
      let bestDist = Infinity;
      for (let i = 0; i < remaining.length; i++) {
        const d = haversineKm(cursor, remaining[i]!.coords!);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
    }
    const next = remaining.splice(bestIdx, 1)[0]!;
    ordered.push({ row: next, seq: ordered.length + 1 });
    cursor = next.coords!;
  }

  return [...ordered, ...without.map((row) => ({ row, seq: null as null }))];
}

export function googleMapsMultiStopUrl(points: Array<{ lat: number; lon: number }>): string {
  if (points.length === 0) return 'https://www.google.com/maps';
  const coords = points.map((p) => `${p.lat},${p.lon}`).join('/');
  return `https://www.google.com/maps/dir/${coords}`;
}
