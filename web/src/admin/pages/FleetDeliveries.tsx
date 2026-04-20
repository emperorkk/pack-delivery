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
import { useTranslation } from '@/i18n/provider';
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

/**
 * Status 1 is the "Loading onto truck" phase; the driver PWA uses
 * status.2..status.6 for the outcome statuses. The admin reuses those keys
 * and adds its own admin.status.1 for the truck-loading state.
 */
function statusLabelKey(n: number): string {
  return n === 1 ? 'admin.status.1' : `status.${n}`;
}

function formatDate(s: string | undefined): string {
  if (!s) return '—';
  // Accepts "YYYY-MM-DD" or "YYYY-MM-DD HH:MM:SS"
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return s;
}

export function FleetDeliveriesScreen() {
  const { t } = useTranslation();
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
        t('admin.deliveries.reassignFailed', {
          code: row.fincode ?? row.findoc,
          error: err instanceof Error ? err.message : String(err)
        })
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
      title={t('admin.deliveries.title')}
      headerRight={
        <>
          {lastLoadedAt && (
            <span>
              {t('admin.header.updated', { time: lastLoadedAt.toLocaleTimeString() })}
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
            {t('admin.header.refresh')}
          </button>
        </>
      }
    >
      <div className="admin-card" style={{ marginBottom: 16 }}>
        <div className="admin-card-header">
          <div className="admin-card-title">{t('admin.filters.title')}</div>
          <div className="admin-muted" style={{ fontSize: 12 }}>
            {t('admin.filters.summary', {
              count: filters.shipments.length,
              total: shipments.length
            })}
            {' · '}
            {filters.dateFrom === filters.dateTo
              ? formatDate(ymdToIso(filters.dateFrom))
              : `${formatDate(ymdToIso(filters.dateFrom))} → ${formatDate(ymdToIso(filters.dateTo))}`}
          </div>
        </div>
        <div className="admin-filter-body">
          <div className="admin-filter-dates">
            <label className="admin-login-field">
              {t('admin.filters.dateFrom')}
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
              {t('admin.filters.dateTo')}
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
                {t('admin.filters.quickRanges')}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() =>
                    setFilters((f) => ({ ...f, dateFrom: todayYmd(), dateTo: todayYmd() }))
                  }
                >
                  {t('admin.filters.today')}
                </button>
                <button
                  type="button"
                  className="admin-btn"
                  onClick={() => {
                    const d0 = new Date();
                    const d1 = new Date(d0);
                    d1.setDate(d0.getDate() + 1);
                    const ymd = (d: Date) =>
                      `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(
                        d.getDate()
                      ).padStart(2, '0')}`;
                    setFilters((f) => ({ ...f, dateFrom: ymd(d0), dateTo: ymd(d1) }));
                  }}
                >
                  {t('admin.filters.todayTomorrow')}
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
                {t('admin.filters.shipmentMethods')}
              </span>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="admin-btn" onClick={allShipments}>
                  {t('admin.filters.all')}
                </button>
                <button type="button" className="admin-btn" onClick={noShipments}>
                  {t('admin.filters.none')}
                </button>
              </div>
            </div>
            {shipments.length === 0 ? (
              <div className="admin-muted" style={{ fontSize: 13 }}>
                <span className="admin-spinner" aria-label="loading" />{' '}
                {t('admin.filters.loadingShipments')}
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
            {t('admin.deliveries.countOf', {
              shown: filtered?.length ?? 0,
              total: rows?.length ?? 0
            })}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="admin-input"
              style={{ minWidth: 220 }}
              placeholder={t('admin.deliveries.search')}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <select
              className="admin-select"
              value={driverFilter}
              onChange={(e) => setDriverFilter(e.target.value)}
            >
              <option value="">{t('admin.deliveries.allDrivers')}</option>
              <option value="unassigned">{t('admin.deliveries.unassigned')}</option>
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
            <span className="admin-spinner" aria-label="loading" /> {t('admin.deliveries.loading')}
          </div>
        ) : filters.shipments.length === 0 ? (
          <div style={{ padding: 24 }} className="admin-muted">
            {t('admin.deliveries.selectShipment')}
          </div>
        ) : filtered && filtered.length === 0 ? (
          <div style={{ padding: 24 }} className="admin-muted">
            {t('admin.deliveries.noMatches')}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{t('admin.col.findoc')}</th>
                  <th>{t('admin.col.deliverOn')}</th>
                  <th>{t('admin.col.customer')}</th>
                  <th>{t('admin.col.address')}</th>
                  <th>{t('admin.col.zipCity')}</th>
                  <th>{t('admin.col.window')}</th>
                  <th>{t('admin.col.status')}</th>
                  <th style={{ minWidth: 200 }}>{t('admin.col.driver')}</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((r) => {
                  const selected = pending[r.findoc] ?? r.actor ?? '';
                  const busy = pending[r.findoc] != null;
                  const sLabel =
                    r.actstatus != null ? t(statusLabelKey(r.actstatus)) : null;
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
                          <option value="">{t('admin.deliveries.assignMarker')}</option>
                          {drivers.map((d) => (
                            <option
                              key={d.refid}
                              value={d.refid}
                              disabled={!d.activeToday && d.refid !== r.actor}
                            >
                              {d.name}
                              {!d.activeToday ? t('admin.deliveries.offToday') : ''}
                            </option>
                          ))}
                          {r.actor && !driverByRefid.has(r.actor) && (
                            <option value={r.actor}>
                              {r.actorName ??
                                t('admin.deliveries.unknownDriver', { refid: r.actor })}
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
