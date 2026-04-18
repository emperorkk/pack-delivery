/**
 * Shared source of truth for the driver's current position.
 * The Soft1 HTTP client reads LATITUDE/LONGITUDE from here and stamps them
 * onto every outbound request body (reference §0). Empty strings until the
 * Geolocation API returns the first fix.
 *
 * Kept as a mutable module-scoped object (not React state) because it is
 * updated outside the render cycle (watchPosition callback) and read
 * synchronously from inside request builders. Any React code that needs to
 * react to updates can subscribe to `onFix`.
 */
export type CurrentFix = {
  lat: string;
  lon: string;
  accuracyM: number | null;
  speedMs: number | null;
  headingDeg: number | null;
  timestampMs: number | null;
};

export const currentFix: CurrentFix = {
  lat: '',
  lon: '',
  accuracyM: null,
  speedMs: null,
  headingDeg: null,
  timestampMs: null
};

type Listener = (fix: CurrentFix) => void;
const listeners = new Set<Listener>();

export function setFix(p: GeolocationPosition): void {
  currentFix.lat = p.coords.latitude.toFixed(6);
  currentFix.lon = p.coords.longitude.toFixed(6);
  currentFix.accuracyM = p.coords.accuracy ?? null;
  currentFix.speedMs = p.coords.speed ?? null;
  currentFix.headingDeg = p.coords.heading ?? null;
  currentFix.timestampMs = p.timestamp;
  for (const l of listeners) l(currentFix);
}

export function clearFix(): void {
  currentFix.lat = '';
  currentFix.lon = '';
  currentFix.accuracyM = null;
  currentFix.speedMs = null;
  currentFix.headingDeg = null;
  currentFix.timestampMs = null;
  for (const l of listeners) l(currentFix);
}

export function onFix(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function hasFix(): boolean {
  return currentFix.lat !== '' && currentFix.lon !== '';
}
