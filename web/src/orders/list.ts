import { cstCall } from '@/soft1/client';
import { loadSettings } from '@/settings/store';
import { loadSession } from '@/soft1/session';

export type DeliveryRow = {
  key: string;           // SALDOC row KEY (getData-compatible)
  findoc: string;        // friendly order number
  trdr: string;
  trdbranch?: string;
  customerName: string;
  address: string;
  city?: string;
  zip?: string;
  phone?: string;
  trndate?: string;
  total?: number;
  coords?: { lat: number; lon: number };
  actstatus?: number;    // existing SOACTION status if any
  soactionKey?: string;  // from server, if known
};

type RawRow = Record<string, unknown>;
type ListingResponse = { rows?: RawRow[]; ROWS?: RawRow[]; DATA?: RawRow[] };

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

export function mapRow(r: RawRow): DeliveryRow {
  const lat = toNum(pick(r, 'LAT', 'LATITUDE'));
  const lon = toNum(pick(r, 'LON', 'LONGITUDE'));
  return {
    key: pick(r, 'KEY', 'SALDOC') ?? '',
    findoc: pick(r, 'FINDOC', 'FINCODE', 'FINCODENUM') ?? '',
    trdr: pick(r, 'TRDR') ?? '',
    trdbranch: pick(r, 'TRDBRANCH'),
    customerName: pick(r, 'TRDRNAME', 'NAME', 'CUSTOMER') ?? '',
    address: pick(r, 'ADDRESS', 'ADDR') ?? '',
    city: pick(r, 'CITY', 'CITYNAME'),
    zip: pick(r, 'ZIP', 'POSTAL'),
    phone: pick(r, 'PHONE01', 'PHONE', 'MOBILE'),
    trndate: pick(r, 'TRNDATE', 'DATE'),
    total: toNum(pick(r, 'AMOUNT', 'TOTAL', 'SUMAMNT')),
    coords: lat != null && lon != null ? { lat, lon } : undefined,
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
  const rows = res.rows ?? res.ROWS ?? res.DATA ?? [];
  return rows.map(mapRow).filter((r) => r.key);
}
