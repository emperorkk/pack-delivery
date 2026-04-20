import { cstCall } from '@/soft1/client';
import { loadSettings } from '@/settings/store';

/**
 * Admin-side wrappers around the four CSTs the dispatcher panel needs.
 * All calls go through the existing `cstCall` dispatcher, so they inherit
 * the universal LAT/LON stamp, the `enc:"utf8"` flag and the session's
 * clientID without any extra work.
 */

// ──────────────── isAdmin ────────────────

type IsAdminResponse = {
  success?: boolean;
  IsAdmin?: boolean | number | string;
  REFID?: number | string;
  NAME?: string;
};

function truthy(v: unknown): boolean {
  if (v === true) return true;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    return s === '1' || s === 'true' || s === 'yes';
  }
  return false;
}

/**
 * The CST authenticates the caller via the session clientID we already
 * pass on every request — no REFID argument required.
 * Response shape: `{ success: true, IsAdmin: 1, REFID: 264, NAME: "WEB" }`.
 */
export async function isAdmin(): Promise<boolean> {
  const res = await cstCall<IsAdminResponse>('IsAdmin', {});
  return truthy(res.IsAdmin);
}

// ──────────────── getDrivers ────────────────

export type DriverRow = {
  refid: string;
  name: string;
  activeToday: boolean;
  lastFix?: { lat: number; lon: number; ts: string };
};

type DriverRaw = Record<string, unknown>;
type GetDriversResponse = {
  data?: DriverRaw[];
  rows?: DriverRaw[];
  ROWS?: DriverRaw[];
  DATA?: DriverRaw[];
};

function pick(r: DriverRaw, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return undefined;
}

function num(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

function mapDriver(r: DriverRaw): DriverRow | null {
  const refid = pick(r, 'REFID', 'ACTOR', 'ID');
  if (!refid) return null;
  const name = pick(r, 'NAME', 'REFIDNAME', 'DRIVERNAME') ?? refid;
  const activeToday = truthy(r.ACTIVETODAY ?? r.activeToday ?? r.ACTIVE ?? true);
  const lat = num(pick(r, 'LAT', 'LATITUDE', 'LASTLAT'));
  const lon = num(pick(r, 'LON', 'LONGITUDE', 'LASTLON'));
  const ts = pick(r, 'TS', 'LASTTS', 'FIXTS');
  const lastFix =
    lat != null && lon != null && !(lat === 0 && lon === 0)
      ? { lat, lon, ts: ts ?? '' }
      : undefined;
  return { refid, name, activeToday, lastFix };
}

export async function getDrivers(): Promise<DriverRow[]> {
  const res = await cstCall<GetDriversResponse>('getDrivers', {});
  const rows = res.data ?? res.rows ?? res.ROWS ?? res.DATA ?? [];
  return rows.map(mapDriver).filter((d): d is DriverRow => !!d);
}

// ──────────────── getDeliveryListingForFleet ────────────────

export type FleetDeliveryRow = {
  key: string;
  findoc: string;
  fincode?: string;
  trdr: string;
  customerName: string;
  address: string;
  city?: string;
  zip?: string;
  district?: string;
  actor?: string;        // REFID of the currently-assigned driver
  actorName?: string;
  actstatus?: number;
  soactionKey?: string;
  trndate?: string;
  total?: number;
  /** Preferred delivery window start (HH:MM or ISO). */
  timeFrom?: string;
  timeTo?: string;
  coords?: { lat: number; lon: number };
};

type FleetRaw = Record<string, unknown>;
type FleetResponse = {
  data?: FleetRaw[];
  rows?: FleetRaw[];
  ROWS?: FleetRaw[];
  DATA?: FleetRaw[];
};

function mapFleetRow(r: FleetRaw): FleetDeliveryRow | null {
  const findoc = pick(r, 'FINDOC', 'FINCODENUM');
  if (!findoc) return null;
  const explicitKey = pick(r, 'KEY', 'SALDOC');
  const lat = num(pick(r, 'LAT', 'LATITUDE'));
  const lon = num(pick(r, 'LON', 'LONGITUDE'));
  const coords =
    lat != null && lon != null && !(lat === 0 && lon === 0) ? { lat, lon } : undefined;
  return {
    key: explicitKey ?? findoc,
    findoc,
    fincode: pick(r, 'FINCODE'),
    trdr: pick(r, 'TRDR') ?? '',
    customerName:
      pick(r, 'TRDR_CUSTOMER_NAME', 'TRDRNAME', 'NAME', 'CUSTOMER') ?? '',
    address: pick(r, 'SHIPPINGADDR', 'ADDRESS', 'ADDR') ?? '',
    city: pick(r, 'SHPCITY', 'CITY'),
    zip: pick(r, 'SHPZIP', 'ZIP'),
    district: pick(r, 'SHPDISTRICT', 'DISTRICT'),
    actor: pick(r, 'ACTOR', 'DRIVERREFID'),
    actorName: pick(r, 'ACTORNAME', 'DRIVERNAME'),
    actstatus:
      pick(r, 'ACTSTATUS') != null ? Number(pick(r, 'ACTSTATUS')) : undefined,
    soactionKey: pick(r, 'SOACTION', 'SOACTIONKEY'),
    trndate: pick(r, 'TRNDATE', 'DATE'),
    total: num(pick(r, 'AMOUNT', 'TOTAL', 'SUMAMNT')),
    timeFrom: pick(r, 'TIMEFROM', 'TIME_FROM', 'PREFFROM', 'PREFERREDFROM'),
    timeTo: pick(r, 'TIMETO', 'TIME_TO', 'PREFTO', 'PREFERREDTO'),
    coords
  };
}

export async function getDeliveryListingForFleet(): Promise<FleetDeliveryRow[]> {
  const settings = loadSettings();
  const res = await cstCall<FleetResponse>('getDeliveryListingForFleet', {
    SERIES: settings.series,
    UPDATESERIES: settings.seriesUpdate,
    SOREDIR: settings.soredir
  });
  const rows = res.data ?? res.rows ?? res.ROWS ?? res.DATA ?? [];
  return rows.map(mapFleetRow).filter((r): r is FleetDeliveryRow => !!r);
}

// ──────────────── reassignDelivery ────────────────

type ReassignResponse = {
  success?: boolean;
  soactionKey?: string;
  SOACTION?: string;
  KEY?: string;
  error?: string;
};

export async function reassignDelivery(findoc: string, actor: string): Promise<void> {
  const res = await cstCall<ReassignResponse>('reassignDelivery', {
    FINDOC: findoc,
    ACTOR: actor
  });
  if (res.success === false) {
    throw new Error(res.error ?? 'reassignDelivery failed');
  }
}
