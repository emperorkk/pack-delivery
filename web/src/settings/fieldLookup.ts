import { cstCall } from '@/soft1/client';

type FieldRow = { name?: string; NAME?: string; title?: string; TITLE?: string };
type FieldLookupResponse = {
  data?: FieldRow[];
  fields?: FieldRow[];
  rows?: FieldRow[];
};

/** Populate the `barcodeField` dropdown from the tenant's SALDOC field list.
 *  The CST emits `{ data: [{ name: "VARCHAR01" }, ...] }` (lowercase) and
 *  does not ship a friendly TITLE — we use the field name for both. We still
 *  accept the older uppercase / `fields` / `rows` shapes as a precaution.
 *  FINDOC is the default app-level barcode field and must always be
 *  selectable even when the tenant's lookup omits it, so we unconditionally
 *  prepend it. */
export async function fetchBarcodeFieldOptions(): Promise<Array<{ value: string; label: string }>> {
  const withFindocFirst = (opts: Array<{ value: string; label: string }>) => {
    const rest = opts.filter((o) => o.value !== 'FINDOC');
    return [{ value: 'FINDOC', label: 'FINDOC' }, ...rest];
  };
  try {
    const res = await cstCall<FieldLookupResponse>('FieldLookUp', { OBJECT: 'SALDOC' });
    const rows = res.data ?? res.fields ?? res.rows ?? [];
    const parsed = rows
      .map((r) => {
        const value = r.name ?? r.NAME ?? '';
        const label = r.title ?? r.TITLE ?? value;
        return { value, label };
      })
      .filter((o) => o.value);
    return withFindocFirst(parsed);
  } catch {
    return [{ value: 'FINDOC', label: 'FINDOC' }];
  }
}
