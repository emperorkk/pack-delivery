/**
 * Per-driver "final stop" selection, scoped to the admin panel and
 * persisted in localStorage so reloads remember the dispatcher's choice.
 * Keyed by driver REFID → delivery FINDOC. When a driver is absent from
 * the map or maps to an empty string, no final-stop constraint applies.
 */

const KEY = 'pd.admin.finalStops';
const EVENT = 'pd:admin.finalStops';

type Map = Record<string, string | undefined>;

export function loadFinalStops(): Map {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Map;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveFinalStops(next: Map): void {
  // Strip empty values to keep the blob small and semantically clean.
  const clean: Map = {};
  for (const [k, v] of Object.entries(next)) {
    if (v) clean[k] = v;
  }
  localStorage.setItem(KEY, JSON.stringify(clean));
  window.dispatchEvent(new CustomEvent(EVENT, { detail: clean }));
}

export function setFinalStop(refid: string, findoc: string | undefined): Map {
  const cur = loadFinalStops();
  const next = { ...cur };
  if (findoc) next[refid] = findoc;
  else delete next[refid];
  saveFinalStops(next);
  return next;
}
