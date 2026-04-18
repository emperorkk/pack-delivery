import { cstCall } from '@/soft1/client';
import { loadSettings } from '@/settings/store';
import { loadSession } from '@/soft1/session';

export type DeliveryRow = {
  /**
   * Lookup qualifier we pass to `getData`. When the CST returns a
   * SALDOC row KEY we use it directly; otherwise we build
   * `FINDOC=<n>` which Soft1 resolves against the alternate index.
   */
  key: string;
  findoc: string;         // internal SALDOC.FINDOC (used by SOACTION writes)
  fincode?: string;       // human-readable order code (ΔΑ...)
  trdr: string;
  trdbranch?: string;
  customerName: string;
  phone?: string;
  afm?: string;
  address: string;
  city?: string;
  zip?: string;
  district?: string;
  country?: string;       // name half of the BGINTCOUNTRY pipe pair
  trndate?: string;
  total?: number;
  coords?: { lat: number; lon: number };
  actstatus?: number;
  soactionKey?: string;
};

type RawRow = Record<string, unknown>;
type ListingResponse = {
  data?: RawRow[];
  rows?: RawRow[];
  ROWS?: RawRow[];
  DATA?: RawRow[];
  count?: number;
};

function pick(r: RawRow, ...keys: string[]): string | undefined {
  for (const k of keys) {
    const v = r[k];
    if (v != null && String(v).trim() !== '') return String(v);
  }
  return undefined;
}

function toNum(v: string | undefined): number | undefined {
  if (v == null) return undefined;
  const n = Number(v.replace(',', '.'));
  return Number.isFinite(n) ? n : undefined;
}

/** Soft1 returns `"0"` for both axes when no geocode is stored. */
function toCoords(lat: number | undefined, lon: number | undefined) {
  if (lat == null || lon == null) return undefined;
  if (lat === 0 && lon === 0) return undefined;
  return { lat, lon };
}

function splitPipe(v: string | undefined): string | undefined {
  if (!v) return undefined;
  const parts = v.split('|');
  return parts[1] ?? parts[0];
}

export function mapRow(r: RawRow): DeliveryRow {
  const findoc = pick(r, 'FINDOC', 'FINCODENUM') ?? '';
  const explicitKey = pick(r, 'KEY', 'SALDOC');
  const key = explicitKey ?? (findoc ? `FINDOC=${findoc}` : '');
  const lat = toNum(pick(r, 'LAT', 'LATITUDE'));
  const lon = toNum(pick(r, 'LON', 'LONGITUDE'));
  return {
    key,
    findoc,
    fincode: pick(r, 'FINCODE'),
    trdr: pick(r, 'TRDR') ?? '',
    trdbranch: pick(r, 'TRDBRANCH'),
    customerName:
      pick(r, 'TRDR_CUSTOMER_NAME', 'TRDRNAME', 'NAME', 'CUSTOMER') ?? '',
    phone: pick(r, 'TRDR_CUSTOMER_PHONE', 'PHONE01', 'PHONE', 'MOBILE'),
    afm: pick(r, 'TRDR_CUSTOMER_AFM', 'AFM'),
    address: pick(r, 'SHIPPINGADDR', 'ADDRESS', 'ADDR') ?? '',
    city: pick(r, 'SHPCITY', 'CITY', 'CITYNAME'),
    zip: pick(r, 'SHPZIP', 'ZIP', 'POSTAL'),
    district: pick(r, 'SHPDISTRICT', 'DISTRICT'),
    country: splitPipe(pick(r, 'BGINTCOUNTRY', 'COUNTRY')),
    trndate: pick(r, 'TRNDATE', 'DATE'),
    total: toNum(pick(r, 'AMOUNT', 'TOTAL', 'SUMAMNT')),
    coords: toCoords(lat, lon),
    actstatus: pick(r, 'ACTSTATUS') != null ? Number(pick(r, 'ACTSTATUS')) : undefined,
    soactionKey: pick(r, 'SOACTION', 'SOACTIONKEY')
  };
}

export async function fetchDeliveryList(): Promise<DeliveryRow[]> {
  const s = loadSession();
  if (!s) throw new Error('NoSession');
  const settings = loadSettings();
  const res = await cstCall<ListingResponse>('getDeliveryListing', {
    SERIES: settings.series,
    SOREDIR: settings.soredir,
    ACTOR: s.driverRefId
  });
  const rows = res.data ?? res.rows ?? res.ROWS ?? res.DATA ?? [];
  return rows.map(mapRow).filter((r) => r.findoc);
}
