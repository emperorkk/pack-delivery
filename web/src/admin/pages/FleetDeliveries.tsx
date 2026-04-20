import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '../layout/Shell';
import {
  getDeliveryListingForFleet,
  getDrivers,
  getShipmentMethods,
  reassignDelivery,
  type DriverRow,
  type FleetDeliveryRow,
  type FleetFilters,
  type ShipmentMethod
} from '../fleet';
import { Soft1SessionInvalidError } from '@/soft1/errors';
import { useNavigate } from 'react-router-dom';
import { clearAdminFlag } from '../adminSession';
import {
  isoToYmd,
  loadAdminFilters,
  saveAdminFilters,
  todayYmd,
  ymdToIso
} from '../adminFilters';

const POLL_MS = 30_000;

type PendingMap = Record<string, string | undefined>;

const STATUS_LABEL: Record<number, string> = {
  1: 'Loading',
  2: 'In progress',
  3: 'Delivered',
  4: 'Failed',
  5: 'Returned',
  6: 'Cancelled'
};

function statusLabel(n: number | undefined): string | null {
  if (n == null) return null;
  return STATUS_LABEL[n] ?? `Status ${n}`;
}

function formatDate(s: string | undefined): string {
  if (!s) return '—';
  // Accepts "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

export function FleetDeliveriesScreen() {
  const nav = useNavigate();
  const [rows, setRows] = useState<FleetDeliveryRow[] | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [shipments, setShipments] = useState<ShipmentMethod[]>([]);
  const [filters, setFilters] = useState<FleetFilters>(() => loadAdminFilters());
  const [filtersHydrated, setFiltersHydrated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<PendingMap>({});
  const [search, setSearch] = useState('');
  const [driverFilter, setDriverFilter] = useState<string>('');
  const stoppedRef = useRef(false);

  const driverByRefid = useMemo(() => {
    const m = new Map<string, DriverRow>();
    for (const d of drivers) m.set(d.refid, d);
    return m;
  }, [drivers]);

  // Persist filters whenever they change (but only after hydration so the
  // empty-shipments default doesn't overwrite a saved selection).
  useEffect(() => {
    if (!filtersHydrated) return;
    saveAdminFilters(filters);
  }, [filters, filtersHydrated]);

  // One-shot: load drivers + shipment methods on mount.
  useEffect(() => {
    let cancelled = false;
    Promise.all([getDrivers(), getShipmentMethods()])
      .then(([drvs, ships]) => {
        if (cancelled) return;
        setDrivers(drvs);
        setShipments(ships);
        // Seed shipment selection with "all" the first time we see the list.
        setFilters((f) => {
          if (f.shipments.length > 0) {
            const valid = new Set(ships.map((s) => s.id));
            const pruned = f.shipments.filter((id) => valid.has(id));
            return pruned.length === f.shipments.length ? f : { ...f, shipments: pruned };
          }
          return { ...f, shipments: ships.map((s) => s.id) };
        });
        setFiltersHydrated(true);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof Soft1SessionInvalidError) {
          clearAdminFlag();
          nav('/admin/login', { replace: true });
          return;
        }
        setError(err instanceof Error ? err.message : String(err));
        setFiltersHydrated(true);
      });
    return () => {
      cancelled = true;
    };
  }, [nav]);

  const load = useCallback(async () => {
    if (!filters.shipments.length) {
      setRows([]);
      setLastLoadedAt(null);
      return;
    }
    setRefreshing(true);
    try {
      const fleet = await getDeliveryListingForFleet(filters);
      if (stoppedRef.current) return;
      setRows(fleet);
      setError(null);
      setLastLoadedAt(new Date());
    } catch (err) {
      if (err instanceof Soft1SessionInvalidError) {
        clearAdminFlag();
        nav('/admin/login', { replace: true });
        return;
      }
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!stoppedRef.current) setRefreshing(false);
    }
  }, [nav, filters]);

  // Fetch + poll whenever filters change. Filter changes supersede the
  // previous poll timer — easier than racing against stale requests.
  useEffect(() => {
    if (!filtersHydrated) return;
    stoppedRef.current = false;
    void load();
    const id = window.setInterval(() => {
      if (!document.hidden) void load();
    }, POLL_MS);
    const onVis = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stoppedRef.current = true;
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [load, filtersHydrated]);

  async function onAssign(row: FleetDeliveryRow, actor: string) {
    if (actor === (row.actor ?? '')) return;
    const prevActor = row.actor;
    setPending((p) => ({ ...p, [row.findoc]: actor }));

    setRows((list) =>
      list
        ? list.map((r) => (r.findoc === row.findoc ? { ...r, actor: actor || undefined } : r))
        : list
    );

    try {
      await reassignDelivery(row.findoc, actor);
    } catch (err) {
      setRows((list) =>
        list
          ? list.map((r) =>
              r.findoc === row.findoc ? { ...r, actor: prevActor } : r
            )
          : list
      );
      setError(
        `Reassign of ${row.fincode ?? row.findoc} failed: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    } finally {
      setPending((p) => {
        const { [row.findoc]: _, ...rest } = p;
        return rest;
      });
      void load();
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (driverFilter === 'unassigned' && r.actor) return false;
      if (driverFilter && driverFilter !== 'unassigned' && r.actor !== driverFilter)
        return false;
      if (!q) return true;
      return (
        r.findoc.toLowerCase().includes(q) ||
        (r.fincode?.toLowerCase().includes(q) ?? false) ||
        r.customerName.toLowerCase().includes(q) ||
        r.address.toLowerCase().includes(q) ||
        (r.zip?.toLowerCase().includes(q) ?? false) ||
        (r.city?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, search, driverFilter]);

  function toggleShipment(id: string) {
    setFilters((f) => {
      const has = f.shipments.includes(id);
      return {
        ...f,
        shipments: has ? f.shipments.filter((x) => x !== id) : [...f.shipments, id]
      };
    });
  }

  function allShipments() {
    setFilters((f) => ({ ...f, shipments: shipments.map((s) => s.id) }));
  }

  function noShipments() {
    setFilters((f) => ({ ...f, shipments: [] }));
  }

  return (
    <AdminShell
      title="Fleet deliveries"
      headerRight={
        <>
          {lastLoadedAt && (
            <span>
              Updated {lastLoadedAt.toLocaleTimeString()}
              {refreshing ? ' · ' : ''}
              {refreshing && <span className="admin-spinner" aria-label="loading" />}
            </span>
          )}
          <button
            type="button"
            className="admin-btn"
            onClick={() => void load()}
            disabled={refreshing || !filters.shipments.length}
          >
            Refresh
          </button>
        </>
      }
    >
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header">
          <div className="admin-card-title">Filters</div>
          <div className="admin-muted" style={{ fontSize: 12 }}>
            {filters.shipments.length}/{shipments.length} shipment methods ·{' '}
            {filters.dateFrom === filters.dateTo
              ? formatDate(ymdToIso(filters.dateFrom))
              : `${formatDate(ymdToIso(filters.dateFrom))} → ${formatDate(ymdToIso(filters.dateTo))}`}
          </div>
        </div>
        <div className="admin-filter-body">
          <div className="admin-filter-dates">
            <label className="admin-login-field">
              Delivery date from
              <input
                type="date"
                className="admin-input"
                value={ymdToIso(filters.dateFrom)}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    dateFrom: e.target.value ? isoToYmd(e.target.value) : todayYmd()
                  }))
                }
              />
            </label>
            <label className="admin-login-field">
              Delivery date to
              <input
                type="date"
                className="admin-input"
                value={ymdToIso(filters.dateTo)}
                onChange={(e) =>
                  setFilters((f) => ({
                    ...f,
                    dateTo: e.target.value ? isoToYmd(e.target.value) : todayYmd()
                  }))
                }
              />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span className="admin-muted" style={{ fontSize: 12 }}>
                Quick ranges
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() =>
                    setFilters((f) => ({ ...f, dateFrom: todayYmd(), dateTo: todayYmd() }))
                  }
                >
                  Today
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => {
                    const t = new Date();
                    const tmr = new Date(t);
                    tmr.setDate(t.getDate() + 1);
                    const ymd = (d: Date) =>
                      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
                        d.getDate()
                      ).padStart(2, '0')}`;
                    setFilters((f) => ({ ...f, dateFrom: ymd(t), dateTo: ymd(tmr) }));
                  }}
                >
                  Today + tomorrow
                </button>
              </div>
            </div>
          </div>

          <div className="admin-filter-shipments">
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'baseline',
                marginBottom: 6
              }}
            >
              <span className="admin-muted" style={{ fontSize: 12 }}>
                Shipment methods
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="admin-btn" onClick={allShipments}>
                  All
                </button>
                <button type="button" className="admin-btn" onClick={noShipments}>
                  None
                </button>
              </div>
            </div>
            {shipments.length === 0 ? (
              <div className="admin-muted" style={{ fontSize: 13 }}>
                <span className="admin-spinner" aria-label="loading" /> Loading shipment methods…
              </div>
            ) : (
              <div className="admin-chips">
                {shipments.map((s) => {
                  const on = filters.shipments.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={on ? 'admin-chip admin-chip-on' : 'admin-chip'}
                      onClick={() => toggleShipment(s.id)}
                    >
                      {s.name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            Deliveries · {filtered?.length ?? 0} of {rows?.length ?? 0}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="admin-input"
              style={{ minWidth: 220 }}
              placeholder="Search FINDOC / customer / address / ZIP / city"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="admin-select"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
            >
              <option value="">All drivers</option>
              <option value="unassigned">Unassigned</option>
              {drivers.map((d) => (
                <option key={d.refid} value={d.refid}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {error && (
          <div className="admin-banner error" style={{ margin: 12 }}>
            {error}
          </div>
        )}

        {!filtersHydrated || rows == null ? (
          <div style={{ padding: 24 }} className="admin-muted">
            <span className="admin-spinner" aria-label="loading" /> Loading fleet…
          </div>
        ) : filters.shipments.length === 0 ? (
          <div style={{ padding: 24 }} className="admin-muted">
            Select at least one shipment method above to load the fleet.
          </div>
        ) : filtered && filtered.length === 0 ? (
          <div style={{ padding: 24 }} className="admin-muted">
            No deliveries match the current filter.
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>FINCODE</th>
                  <th>Deliver on</th>
                  <th>Customer</th>
                  <th>Address</th>
                  <th>ZIP / City</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th style={{ minWidth: 200 }}>Driver</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((r) => {
                  const selected = pending[r.findoc] ?? r.actor ?? '';
                  const busy = pending[r.findoc] != null;
                  const sLabel = statusLabel(r.actstatus);
                  return (
                    <tr key={r.findoc}>
                      <td>
                        <strong>{r.fincode ?? r.findoc}</strong>
                        {r.fincode && r.findoc !== r.fincode && (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            #{r.findoc}
                          </div>
                        )}
                      </td>
                      <td>{formatDate(r.deliverDate)}</td>
                      <td>
                        {r.customerName || <span className="admin-muted">—</span>}
                        {r.afm && (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            AFM {r.afm}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.address}
                        {r.country && (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            {r.country}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.zip ?? <span className="admin-muted">—</span>}
                        {r.city && (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            {r.city}
                          </div>
                        )}
                      </td>
                      <td>
                        {r.timeFrom || r.timeTo ? (
                          <span>
                            {r.timeFrom ?? '—'}–{r.timeTo ?? '—'}
                          </span>
                        ) : (
                          <span className="admin-muted">—</span>
                        )}
                      </td>
                      <td>
                        {sLabel ? (
                          <span className={`admin-status s-${r.actstatus}`}>{sLabel}</span>
                        ) : (
                          <span className="admin-muted">—</span>
                        )}
                      </td>
                      <td>
                        <select
                          className="admin-select"
                          value={selected}
                          disabled={busy}
                          onChange={(e) => void onAssign(r, e.target.value)}
                          style={{ minWidth: 180 }}
                        >
                          <option value="">— Unassigned —</option>
                          {drivers.map((d) => (
                            <option
                              key={d.refid}
                              value={d.refid}
                              disabled={!d.activeToday && d.refid !== r.actor}
                            >
                              {d.name}
                              {!d.activeToday ? ' (off today)' : ''}
                            </option>
                          ))}
                          {r.actor && !driverByRefid.has(r.actor) && (
                            <option value={r.actor}>
                              {r.actorName ?? `Unknown driver (${r.actor})`}
                            </option>
                          )}
                        </select>
                        {busy && (
                          <span
                            className="admin-spinner"
                            style={{ marginLeft: 8 }}
                            aria-label="saving"
                          />
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
