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

type GetDataPayload = {
  SALDOC?: Raw[];
  MTRDOC?: Raw[];
  ITELINES?: Raw[];
  MTRLINES?: Raw[];
  FINPAYTERMS?: Raw[];
};

type GetDataResponse = GetDataPayload & {
  data?: GetDataPayload;
  caption?: string;
};

export async function fetchOrderDetail(key: string): Promise<OrderDetail> {
  const res = await soft1Call<GetDataResponse>({
    service: 'getData',
    OBJECT: 'SALDOC',
    KEY: key
  });
  // Soft1 getData wraps the objects in a `data:` envelope alongside
  // metadata like `caption`. Older contracts returned them flat — accept both.
  const payload: GetDataPayload = res.data ?? res;
  const head = payload.SALDOC?.[0];
  const ship = payload.MTRDOC?.[0];
  const lines = payload.ITELINES ?? payload.MTRLINES ?? [];
  const lat = toNum(pick(head, 'LAT', 'LATITUDE'));
  const lon = toNum(pick(head, 'LON', 'LONGITUDE'));
  const coords = lat != null && lon != null && !(lat === 0 && lon === 0) ? { lat, lon } : undefined;
  const paymentComment = pick(payload.FINPAYTERMS?.[0], 'COMMENTS');
  return {
    key,
    findoc: pick(head, 'FINDOC', 'FINCODE') ?? '',
    trdr: pick(head, 'TRDR') ?? '',
    trdbranch: pick(head, 'TRDBRANCH'),
    customerName:
      pick(head, 'TRDR_CUSTOMER_NAME', 'TRDBRANCH_TRDBRANCH_NAME', 'TRDRNAME') ??
      pick(ship, 'NAME') ??
      '',
    address:
      pick(ship, 'SHIPPINGADDR', 'ADDRESS', 'ADDR') ??
      pick(head, 'SHIPPINGADDR', 'ADDRESS') ??
      '',
    city: pick(ship, 'SHPCITY', 'CITY', 'CITYNAME') ?? pick(head, 'SHPCITY', 'CITY'),
    zip: pick(ship, 'SHPZIP', 'ZIP', 'POSTAL') ?? pick(head, 'SHPZIP', 'ZIP'),
    phone:
      pick(head, 'TRDR_CUSTOMER_PHONE01', 'TRDR_CUSTOMER_PHONE') ??
      pick(ship, 'PHONE01', 'PHONE', 'MOBILE'),
    trndate: pick(head, 'TRNDATE', 'DATE'),
    coords,
    comments: pick(head, 'COMMENTS', 'REMARKS') ?? paymentComment,
    lines: lines.map((l) => ({
      lineno: pick(l, 'LINENUM', 'LINENO'),
      mtrl: pick(l, 'MTRL'),
      itemCode: pick(l, 'MTRL_ITEM_CODE', 'MTRL_MTRL_CODE', 'CODE', 'ITEM'),
      itemName: pick(l, 'MTRL_ITEM_NAME', 'MTRL_MTRL_NAME', 'NAME', 'DESCRIPTION'),
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
