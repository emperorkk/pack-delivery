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

/**
 * Kick off a single high-accuracy geolocation reading and return it as
 * soon as it arrives (or fall back to the cached `currentFix` on error).
 * Used at moments where we want the *current* location, not whatever the
 * background watcher happened to pick up last — e.g. when the driver
 * taps "Optimize" and expects the route to start from here.
 */
export function requestFreshFix(timeoutMs = 8_000): Promise<{ lat: number; lon: number } | null> {
  return new Promise((resolve) => {
    if (!('geolocation' in navigator)) {
      resolve(hasFix() ? { lat: Number(currentFix.lat), lon: Number(currentFix.lon) } : null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFix(pos);
        resolve({ lat: pos.coords.latitude, lon: pos.coords.longitude });
      },
      () => {
        resolve(hasFix() ? { lat: Number(currentFix.lat), lon: Number(currentFix.lon) } : null);
      },
      { enableHighAccuracy: true, maximumAge: 5_000, timeout: timeoutMs }
    );
  });
}
