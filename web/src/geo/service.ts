import { clearFix, setFix } from './currentFix';
import { pushGeo } from './transport';
import { loadSettings } from '@/settings/store';
import { loadSession } from '@/soft1/session';

/**
 * GeolocationService — singleton driver-side GPS controller. Responsible for:
 *   1. Requesting the Geolocation API and feeding every update into
 *      `currentFix` (which the HTTP layer reads to stamp LAT/LON on every
 *      outbound call — reference §0).
 *   2. Firing a periodic "idle tick" to `insertCCCKKLOLA` every 120 s while
 *      the tab is foregrounded AND no other Soft1 call has gone out recently.
 *      Implemented with a simple coalescer that other modules bump on every
 *      successful request.
 *   3. Pausing when `document.hidden === true` or when the "Share location"
 *      Settings toggle is off.
 */

const TICK_MS = 120_000;

let watchId: number | null = null;
let tickTimer: number | null = null;
let lastCallAt = 0;

export function noteApiCall() {
  lastCallAt = Date.now();
}

function shouldTick(): boolean {
  if (document.hidden) return false;
  if (!loadSettings().shareLocation) return false;
  if (!loadSession()?.geoTableReady) return false;
  return Date.now() - lastCallAt > TICK_MS - 5_000;
}

function schedule() {
  if (tickTimer !== null) return;
  tickTimer = window.setInterval(() => {
    if (!shouldTick()) return;
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
}
