import type { FleetFilters } from './fleet';

/**
 * The dispatcher's filter selection is persisted across reloads so the
 * page comes back to the last view they were looking at. Stored under a
 * dedicated key so driver settings (pd.settings) stay untouched.
 *
 * On first visit the stored `shipments` list is empty — the page is
 * responsible for seeding it with "all available" once the shipment
 * methods have loaded.
 */

const KEY = 'pd.admin.filters';

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
}

/** "2026-04-24" ⇄ "20260424" */
export function ymdToIso(ymd: string): string {
  return ymd.length === 8 ? `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}` : ymd;
}

export function isoToYmd(iso: string): string {
  return iso.replace(/-/g, '');
}

export function loadAdminFilters(): FleetFilters {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { dateFrom: todayYmd(), dateTo: todayYmd(), shipments: [] };
    const parsed = JSON.parse(raw) as Partial<FleetFilters>;
    return {
      dateFrom: parsed.dateFrom || todayYmd(),
      dateTo: parsed.dateTo || todayYmd(),
      shipments: Array.isArray(parsed.shipments) ? parsed.shipments : []
    };
  } catch {
    return { dateFrom: todayYmd(), dateTo: todayYmd(), shipments: [] };
  }
}

export function saveAdminFilters(f: FleetFilters): void {
  localStorage.setItem(KEY, JSON.stringify(f));
}
