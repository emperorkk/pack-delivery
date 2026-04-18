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

/** Build a multi-stop Google Maps URL using address strings or coords.
 *  Uses the API-1 form and omits `origin`, which makes Maps start from the
 *  device's current location. Google geocodes address strings server-side
 *  and is far more tolerant of mixed Greek/Latin spelling than Nominatim,
 *  so we prefer a text address whenever one is available and fall back to
 *  coords otherwise. */
export function googleMapsMultiStopUrlFromStops(
  stops: Array<{ address?: string; coords?: { lat: number; lon: number } }>
): string | null {
  const resolved = stops
    .map((s) => {
      const addr = s.address?.trim();
      if (addr) return addr;
      if (s.coords) return `${s.coords.lat},${s.coords.lon}`;
      return null;
    })
    .filter((v): v is string => v !== null);
  if (resolved.length === 0) return null;

  const destination = resolved[resolved.length - 1]!;
  const waypoints = resolved.slice(0, -1);
  const params = new URLSearchParams({
    api: '1',
    travelmode: 'driving',
    destination
  });
  // API-1 allows up to 9 intermediate waypoints — trim if we somehow exceed.
  if (waypoints.length > 0) {
    params.set('waypoints', waypoints.slice(-9).join('|'));
  }
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function googleMapsDestinationUrl(args: {
  address?: string;
  coords?: { lat: number; lon: number };
}): string | null {
  if (args.address && args.address.trim()) {
    return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(args.address.trim())}`;
  }
  if (args.coords) {
    return `https://www.google.com/maps/dir/?api=1&destination=${args.coords.lat},${args.coords.lon}`;
  }
  return null;
}
