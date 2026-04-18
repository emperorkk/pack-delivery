import { cstCall } from '@/soft1/client';

type FieldLookupResponse = {
  fields?: Array<{ NAME?: string; TITLE?: string }>;
  rows?: Array<{ NAME?: string; TITLE?: string }>;
};

/** Populate the `barcodeField` dropdown from the tenant's SALDOC field list. */
export async function fetchBarcodeFieldOptions(): Promise<Array<{ value: string; label: string }>> {
  try {
    const res = await cstCall<FieldLookupResponse>('FieldLookUp', { OBJECT: 'SALDOC' });
    const rows = res.fields ?? res.rows ?? [];
    return rows
      .map((r) => ({ value: r.NAME ?? '', label: r.TITLE ?? r.NAME ?? '' }))
      .filter((o) => o.value);
  } catch {
    return [{ value: 'FINDOC', label: 'FINDOC' }];
  }
}
