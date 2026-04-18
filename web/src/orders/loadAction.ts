import { cstCall, soft1Call } from '@/soft1/client';
import { pushGeo } from '@/geo/transport';
import { loadSettings } from '@/settings/store';
import { loadSession } from '@/soft1/session';
import { ACT_STATUS } from './actStatus';

export type SaldocHead = {
  findoc: string;
  trdr: string;
  trdbranch?: string;
  fincode?: string;
};

type GetDataPayload = {
  SALDOC?: Array<Record<string, unknown>>;
};
type GetDataResponse = GetDataPayload & { data?: GetDataPayload };
type FindocLookupResponse = {
  rows?: Array<{ FINDOC?: string; KEY?: string; SALDOC?: string }>;
};

function str(v: unknown): string | undefined {
  return v == null || String(v).trim() === '' ? undefined : String(v);
}

/**
 * Look up a SALDOC head from a scanned barcode, returning just the
 * fields needed to post a loading SOACTION (FINDOC + TRDR + TRDBRANCH).
 * Honours the configured `barcodeField` — when it is not FINDOC we hop
 * through the CST `getFindocFromSaldoc` first to translate the custom
 * field into a FINDOC before calling getData.
 */
export async function resolveSaldocHead(barcode: string): Promise<SaldocHead | null> {
  const trimmed = barcode.trim();
  if (!trimmed) return null;
  const { barcodeField } = loadSettings();

  let saldocKey = trimmed;
  if (barcodeField !== 'FINDOC') {
    try {
      const lookup = await cstCall<FindocLookupResponse>('getFindocFromSaldoc', {
        FIELD: barcodeField,
        VALUE: trimmed
      });
      const hit = lookup.rows?.[0];
      const resolved = str(hit?.KEY) ?? str(hit?.SALDOC) ?? str(hit?.FINDOC);
      if (!resolved) return null;
      saldocKey = resolved;
    } catch {
      return null;
    }
  }

  try {
    const res = await soft1Call<GetDataResponse>({
      service: 'getData',
      OBJECT: 'SALDOC',
      KEY: saldocKey
    });
    const head = (res.data ?? res).SALDOC?.[0];
    if (!head) return null;
    const findoc = str(head.FINDOC);
    const trdr = str(head.TRDR);
    if (!findoc || !trdr) return null;
    return {
      findoc,
      trdr,
      trdbranch: str(head.TRDBRANCH),
      fincode: str(head.FINCODE)
    };
  } catch {
    return null;
  }
}

type SetDataResponse = {
  success?: boolean;
  SOACTION?: Array<Record<string, unknown>>;
  KEY?: string;
};

export type LoadResult =
  | { ok: true; soactionKey: string; head: SaldocHead }
  | { ok: false; error: string };

const LOAD_COMMENTS_EL = 'Φόρτωση Οχήματος';

function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Post a SOACTION insert with ACTSTATUS=LOADING, using the SALDOC series
 * from settings. Mirrors the sample payload in the integration doc:
 *   SERIES=<settings.series>, ACTOR=<driverRefId>, ACTSTATUS="1",
 *   COMMENTS="Φόρτωση Οχήματος", TRNDATE=today,
 *   LOCATEINFO="SOACTION:SOACTION,ACTSTATUS".
 */
export async function writeLoadSoaction(head: SaldocHead): Promise<LoadResult> {
  const s = loadSession();
  if (!s) return { ok: false, error: 'NoSession' };
  const settings = loadSettings();

  const action: Record<string, unknown> = {
    SERIES: settings.series,
    TRDR: head.trdr,
    FINDOC: head.findoc,
    ACTOR: s.driverRefId,
    ACTSTATUS: String(ACT_STATUS.LOADING),
    COMMENTS: LOAD_COMMENTS_EL,
    TRNDATE: today()
  };
  if (head.trdbranch) action.TRDBRANCH = head.trdbranch;

  try {
    const res = await soft1Call<SetDataResponse>({
      service: 'setData',
      OBJECT: 'SOACTION',
      KEY: '',
      DATA: { SOACTION: [action] },
      LOCATEINFO: 'SOACTION:SOACTION,ACTSTATUS'
    });
    const row = res.SOACTION?.[0];
    const key =
      (res.KEY as string | undefined) ??
      (row?.SOACTION as string | undefined) ??
      (row?.KEY as string | undefined);
    if (!key) return { ok: false, error: 'setdata returned no SOACTION key' };
    void pushGeo(
      'setdata-audit',
      `SOACTION load: SOACTION=${key} FINDOC=${head.findoc} — '${LOAD_COMMENTS_EL}'`
    );
    return { ok: true, soactionKey: key, head };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
