import { soft1Call } from '@/soft1/client';

export type OrderLine = {
  lineno?: string;
  mtrl?: string;
  itemCode?: string;
  itemName?: string;
  qty?: number;
  price?: number;
  amount?: number;
};

export type OrderDetail = {
  key: string;
  findoc: string;
  trdr: string;
  trdbranch?: string;
  customerName: string;
  address: string;
  city?: string;
  zip?: string;
  phone?: string;
  trndate?: string;
  coords?: { lat: number; lon: number };
  comments?: string;
  lines: OrderLine[];
  totals: { net?: number; vat?: number; gross?: number };
};

type Raw = Record<string, unknown>;

function pick(r: Raw | undefined, ...keys: string[]): string | undefined {
  if (!r) return undefined;
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

type GetDataResponse = {
  SALDOC?: Raw[];
  MTRDOC?: Raw[];
  ITELINES?: Raw[];
};

export async function fetchOrderDetail(key: string): Promise<OrderDetail> {
  const res = await soft1Call<GetDataResponse>({
    service: 'getData',
    OBJECT: 'SALDOC',
    KEY: key
  });
  const head = res.SALDOC?.[0];
  const trd = res.MTRDOC?.[0];
  const lines = res.ITELINES ?? [];
  const lat = toNum(pick(head, 'LAT', 'LATITUDE'));
  const lon = toNum(pick(head, 'LON', 'LONGITUDE'));
  return {
    key,
    findoc: pick(head, 'FINDOC', 'FINCODE') ?? '',
    trdr: pick(head, 'TRDR') ?? '',
    trdbranch: pick(head, 'TRDBRANCH'),
    customerName: pick(trd, 'NAME') ?? pick(head, 'TRDRNAME') ?? '',
    address: pick(trd, 'ADDRESS', 'ADDR') ?? pick(head, 'ADDRESS') ?? '',
    city: pick(trd, 'CITY', 'CITYNAME') ?? pick(head, 'CITY'),
    zip: pick(trd, 'ZIP', 'POSTAL') ?? pick(head, 'ZIP'),
    phone: pick(trd, 'PHONE01', 'PHONE', 'MOBILE'),
    trndate: pick(head, 'TRNDATE', 'DATE'),
    coords: lat != null && lon != null ? { lat, lon } : undefined,
    comments: pick(head, 'COMMENTS', 'REMARKS'),
    lines: lines.map((l) => ({
      lineno: pick(l, 'LINENUM', 'LINENO'),
      mtrl: pick(l, 'MTRL'),
      itemCode: pick(l, 'CODE', 'ITEM'),
      itemName: pick(l, 'NAME', 'DESCRIPTION'),
      qty: toNum(pick(l, 'QTY1', 'QTY')),
      price: toNum(pick(l, 'PRICE', 'PRICE01')),
      amount: toNum(pick(l, 'LINEVAL', 'AMOUNT'))
    })),
    totals: {
      net: toNum(pick(head, 'FPAVAL', 'NETAMNT')),
      vat: toNum(pick(head, 'VATAMNT', 'VAT')),
      gross: toNum(pick(head, 'SUMAMNT', 'AMOUNT'))
    }
  };
}
