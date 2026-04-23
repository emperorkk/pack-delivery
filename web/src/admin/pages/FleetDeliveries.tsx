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
import { FleetLanes } from '../lanes/FleetLanes';
import { DistributeModal } from '../distribute/DistributeModal';
import { slaFor, type SlaState } from '../sla';
import { loadFinalStops, setFinalStop } from '../finalStops';
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
  const [viewMode, setViewMode] = useState<'table' | 'lanes'>('table');
  const [distributeOpen, setDistributeOpen] = useState(false);
  // Which drivers get a lane in Lanes view. Defaults to all activeToday,
  // but the dispatcher can pare the board down to the subset they're
  // actually dispatching today.
  const [laneDriverRefids, setLaneDriverRefids] = useState<Set<string> | null>(null);
  const [finalStops, setFinalStopsState] = useState<Record<string, string | undefined>>(
    () => loadFinalStops()
  );
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
        // Seed the lane-visibility set the first time drivers arrive —
        // default to every driver who is active today.
        setLaneDriverRefids((cur) =>
          cur ?? new Set(drvs.filter((d) => d.activeToday).map((d) => d.refid))
        );
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

  /**
   * Bulk reassign invoked by the Distribute modal. Runs the individual
   * reassigns in small parallel batches so we don't DOS Soft1 with a
   * hundred concurrent requests, optimistically updates the table along
   * the way, and re-polls once at the end so the authoritative state
   * replaces our optimistic one.
   */
  async function onBulkAssign(plan: Array<{ findoc: string; actor: string }>) {
    if (plan.length === 0) return;
    // Mark everything pending up-front so the table greys the affected
    // rows even before the first request resolves.
    setPending((p) => {
      const next = { ...p };
      for (const a of plan) next[a.findoc] = a.actor;
      return next;
    });
    // Optimistic: apply every assignment to the local rows so the board
    // / table reflects the new state without waiting for the poll.
    setRows((list) => {
      if (!list) return list;
      const byFindoc = new Map(plan.map((a) => [a.findoc, a.actor]));
      return list.map((r) => {
        const target = byFindoc.get(r.findoc);
        return target === undefined
          ? r
          : { ...r, actor: target || undefined };
      });
    });

    const batchSize = 4;
    let firstError: unknown = null;
    for (let i = 0; i < plan.length; i += batchSize) {
      const batch = plan.slice(i, i + batchSize);
      const results = await Promise.allSettled(
        batch.map((a) => reassignDelivery(a.findoc, a.actor))
      );
      results.forEach((res, j) => {
        if (res.status === 'rejected' && firstError == null) {
          firstError = res.reason;
          // eslint-disable-next-line no-console
          console.error('reassignDelivery failed for', batch[j].findoc, res.reason);
        }
      });
    }

    setPending({});
    void load();
    if (firstError) {
      throw firstError instanceof Error ? firstError : new Error(String(firstError));
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return null;
    const rawQ = search.trim().toLowerCase();
    // A squeezed copy of the query — lowercase with all non-alphanumeric
    // characters stripped — lets "ORD 004864", "ord.004864" and "ord004864"
    // all match the stored FINCODE "ORD.004864".
    const squeezedQ = rawQ.replace(/[^\p{L}\p{N}]+/gu, '');
    const hay = (s: string | undefined): string =>
      (s ?? '').toLowerCase();
    const match = (v: string | undefined): boolean => {
      if (!v) return false;
      const h = hay(v);
      if (rawQ && h.includes(rawQ)) return true;
      if (squeezedQ && h.replace(/[^\p{L}\p{N}]+/gu, '').includes(squeezedQ))
        return true;
      return false;
    };
    return rows.filter((r) => {
      if (driverFilter === 'unassigned' && r.actor) return false;
      if (driverFilter && driverFilter !== 'unassigned' && r.actor !== driverFilter)
        return false;
      if (!rawQ) return true;
      return (
        match(r.findoc) ||
        match(r.fincode) ||
        match(r.customerName) ||
        match(r.address) ||
        match(r.zip) ||
        match(r.city)
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
            className="admin-btn admin-btn-primary"
            onClick={() => setDistributeOpen(true)}
            disabled={!rows || rows.length === 0 || drivers.length === 0}
          >
            {t('admin.distribute.button')}
          </button>
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div className="admin-card-title">
              {t('admin.deliveries.countOf', {
                shown: filtered?.length ?? 0,
                total: rows?.length ?? 0
              })}
            </div>
            <div className="admin-viewmode" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'table'}
                className={viewMode === 'table' ? 'active' : ''}
                onClick={() => setViewMode('table')}
              >
                {t('admin.view.table')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={viewMode === 'lanes'}
                className={viewMode === 'lanes' ? 'active' : ''}
                onClick={() => setViewMode('lanes')}
              >
                {t('admin.view.lanes')}
              </button>
            </div>
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
        ) : viewMode !== 'table' ? null : (
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
                  const sla: SlaState = slaFor(r, new Date());
                  const rowCls =
                    sla === 'overdue'
                      ? 'admin-row-overdue'
                      : sla === 'dueSoon'
                        ? 'admin-row-dueSoon'
                        : '';
                  return (
                    <tr key={r.findoc} className={rowCls}>
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

        {viewMode === 'lanes' &&
          filtersHydrated &&
          rows != null &&
          filters.shipments.length > 0 &&
          filtered != null &&
          filtered.length > 0 && (
            <div style={{ padding: 12, borderTop: '1px solid var(--border)' }}>
              <div className="admin-muted" style={{ fontSize: 12, marginBottom: 6 }}>
                {t('admin.lanes.pickDriversLabel')}
              </div>
              <div className="admin-chips" style={{ marginBottom: 12 }}>
                {drivers.map((d) => {
                  const on = laneDriverRefids?.has(d.refid) ?? false;
                  return (
                    <button
                      key={d.refid}
                      type="button"
                      className={on ? 'admin-chip admin-chip-on' : 'admin-chip'}
                      onClick={() =>
                        setLaneDriverRefids((s) => {
                          const next = new Set(s ?? []);
                          if (next.has(d.refid)) next.delete(d.refid);
                          else next.add(d.refid);
                          return next;
                        })
                      }
                    >
                      {d.name}
                      {!d.activeToday ? t('admin.deliveries.offToday') : ''}
                    </button>
                  );
                })}
              </div>
              <FleetLanes
                rows={filtered}
                drivers={drivers}
                visibleDriverRefids={[...(laneDriverRefids ?? new Set())]}
                onReassign={(row, actor) => void onAssign(row, actor)}
                pending={pending}
                finalStops={finalStops}
                onSetFinalStop={(refid, findoc) =>
                  setFinalStopsState(setFinalStop(refid, findoc))
                }
              />
            </div>
          )}
      </div>

      <DistributeModal
        open={distributeOpen}
        rows={filtered ?? rows ?? []}
        drivers={drivers}
        onClose={() => setDistributeOpen(false)}
        onConfirm={onBulkAssign}
      />
    </AdminShell>
  );
}
