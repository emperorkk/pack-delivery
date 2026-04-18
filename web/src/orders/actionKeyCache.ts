/**
 * localStorage cache of FINDOC → SOACTION key for in-progress deliveries.
 * Populated by block F.3 (insert) response; consumed by block F.4 (update)
 * so a status change on the same order points at the existing SOACTION row
 * instead of creating a new one.
 */
const KEY = 'pd.actionKeys';

type Map = Record<string, string>;

function read(): Map {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Map;
  } catch {
    return {};
  }
}

export function getActionKey(findoc: string): string | undefined {
  return read()[findoc];
}

export function setActionKey(findoc: string, soactionKey: string): void {
  const map = read();
  map[findoc] = soactionKey;
  localStorage.setItem(KEY, JSON.stringify(map));
}

export function clearActionKey(findoc: string): void {
  const map = read();
  delete map[findoc];
  localStorage.setItem(KEY, JSON.stringify(map));
}
