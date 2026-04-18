import { clearFix, currentFix, hasFix, setFix } from './currentFix';
import { pushGeo } from './transport';
import { loadSettings } from '@/settings/store';
import { loadSession } from '@/soft1/session';

/**
 * GeolocationService — singleton driver-side GPS controller. Responsible for:
 *   1. Requesting the Geolocation API and feeding every update into
 *      `currentFix` (which the HTTP layer reads to stamp LAT/LON on every
 *      outbound call — reference §0).
 *   2. Firing a periodic "idle tick" to `insertCCCKKLOLA` every 5 min while
 *      the tab is foregrounded AND no other Soft1 call has gone out
 *      recently AND the driver has moved since the last push. Implemented
 *      with a simple coalescer that other modules bump on every
 *      successful request, plus a haversine check against the last pushed
 *      position to suppress pings when the vehicle is stationary.
 *   3. Pausing when `document.hidden === true` or when the "Share location"
 *      Settings toggle is off.
 */

const TICK_MS = 300_000;
/** Minimum metres moved between two idle ticks to actually fire one. */
const MOVE_THRESHOLD_M = 10;

let watchId: number | null = null;
let tickTimer: number | null = null;
let lastCallAt = 0;
let lastPushed: { lat: number; lon: number } | null = null;

export function noteApiCall() {
  lastCallAt = Date.now();
}

function metresBetween(
  a: { lat: number; lon: number },
  b: { lat: number; lon: number }
): number {
  const R = 6_371_000;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

function shouldTick(): boolean {
  if (document.hidden) return false;
  if (!loadSettings().shareLocation) return false;
  if (!loadSession()?.geoTableReady) return false;
  if (!hasFix()) return false;
  if (Date.now() - lastCallAt <= TICK_MS - 5_000) return false;
  // Suppress the tick when the driver has not actually moved since the
  // previous push. The first tick after app start always fires (lastPushed
  // is null) so we establish a baseline.
  if (lastPushed) {
    const here = { lat: Number(currentFix.lat), lon: Number(currentFix.lon) };
    if (metresBetween(here, lastPushed) < MOVE_THRESHOLD_M) return false;
  }
  return true;
}

function schedule() {
  if (tickTimer !== null) return;
  tickTimer = window.setInterval(() => {
    if (!shouldTick()) return;
    lastPushed = { lat: Number(currentFix.lat), lon: Number(currentFix.lon) };
    void pushGeo('GeoPush');
  }, TICK_MS);
}

function stopSchedule() {
  if (tickTimer !== null) {
    clearInterval(tickTimer);
    tickTimer = null;
  }
}

export function startGeolocation(): void {
  if (!('geolocation' in navigator)) return;
  if (watchId !== null) return;
  try {
    watchId = navigator.geolocation.watchPosition(
      (p) => setFix(p),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) clearFix();
      },
      { enableHighAccuracy: true, maximumAge: 30_000, timeout: 15_000 }
    );
  } catch {
    /* unsupported / blocked */
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) stopSchedule();
    else schedule();
  });

  window.addEventListener('online', () => {
    void import('./replay').then((m) => m.replayAll());
  });

  window.addEventListener('pd:settings', () => {
    if (loadSettings().shareLocation) schedule();
    else stopSchedule();
  });

  if (!document.hidden && loadSettings().shareLocation) schedule();
}

export function stopGeolocation(): void {
  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  stopSchedule();
  clearFix();
  lastPushed = null;
}
