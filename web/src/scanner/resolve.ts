import { soft1Call, cstCall } from '@/soft1/client';
import { loadSettings } from '@/settings/store';

export type ResolvedOrder = {
  key: string;
  findoc?: string;
};

type FindocLookupResponse = { rows?: Array<{ FINDOC?: string; SALDOC?: string; KEY?: string }> };
type GetDataPayload = { SALDOC?: Array<{ FINDOC?: string; KEY?: string }> };
type GetDataResponse = GetDataPayload & { data?: GetDataPayload };

/**
 * Resolve a scanned barcode to a SALDOC key.
 *
 * If the configured barcodeField is FINDOC we go straight to `getData`
 * with `KEY:<barcode>`. Otherwise we first ask the CST `getFindocFromSaldoc`
 * to translate the custom field (e.g. VARCHAR01) into a FINDOC / SALDOC key.
 */
export async function resolveBarcode(barcode: string): Promise<ResolvedOrder | null> {
  const { barcodeField } = loadSettings();
  const trimmed = barcode.trim();
  if (!trimmed) return null;

  if (barcodeField === 'FINDOC') {
    try {
      const res = await soft1Call<GetDataResponse>({
        service: 'getData',
        OBJECT: 'SALDOC',
        KEY: trimmed
      });
      const row = (res.data ?? res).SALDOC?.[0];
      if (!row) return null;
      return { key: row.KEY ?? trimmed, findoc: row.FINDOC };
    } catch {
      return null;
    }
  }

  try {
    const res = await cstCall<FindocLookupResponse>('getFindocFromSaldoc', {
      FIELD: barcodeField,
      VALUE: trimmed
    });
    const hit = res.rows?.[0];
    if (!hit) return null;
    const key = hit.KEY ?? hit.SALDOC;
    if (!key) return null;
    return { key, findoc: hit.FINDOC };
  } catch {
    return null;
  }
}
