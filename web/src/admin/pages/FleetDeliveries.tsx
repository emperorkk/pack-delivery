import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AdminShell } from '../layout/Shell';
import {
  getDeliveryListingForFleet,
  getDrivers,
  reassignDelivery,
  type DriverRow,
  type FleetDeliveryRow
} from '../fleet';
import { Soft1SessionInvalidError } from '@/soft1/errors';
import { useNavigate } from 'react-router-dom';
import { clearAdminFlag } from '../adminSession';

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

function statusLabel(n: number | undefined): string {
  if (n == null) return 'Unassigned';
  return STATUS_LABEL[n] ?? `Status ${n}`;
}

export function FleetDeliveriesScreen() {
  const nav = useNavigate();
  const [rows, setRows] = useState<FleetDeliveryRow[] | null>(null);
  const [drivers, setDrivers] = useState<DriverRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState<PendingMap>({});
  const [filter, setFilter] = useState('');
  const [driverFilter, setDriverFilter] = useState<string>('');
  const stoppedRef = useRef(false);

  const driverByRefid = useMemo(() => {
    const m = new Map<string, DriverRow>();
    for (const d of drivers) m.set(d.refid, d);
    return m;
  }, [drivers]);

  const load = useCallback(async () => {
    setRefreshing(true);
    try {
      const [fleet, drvs] = await Promise.all([
        getDeliveryListingForFleet(),
        getDrivers()
      ]);
      if (stoppedRef.current) return;
      setRows(fleet);
      setDrivers(drvs);
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
  }, [nav]);

  useEffect(() => {
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
  }, [load]);

  async function onAssign(row: FleetDeliveryRow, actor: string) {
    if (!actor || actor === row.actor) return;
    const prevActor = row.actor;
    setPending((p) => ({ ...p, [row.findoc]: actor }));

    // Optimistic update so the column visibly changes before the round-trip.
    setRows((list) =>
      list
        ? list.map((r) => (r.findoc === row.findoc ? { ...r, actor } : r))
        : list
    );

    try {
      await reassignDelivery(row.findoc, actor);
    } catch (err) {
      // Roll back the optimistic change on failure.
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
      // Re-fetch so we reflect the authoritative ACTOR/ACTSTATUS written
      // by the reassign CST (it may have touched more than just ACTOR).
      void load();
    }
  }

  const filtered = useMemo(() => {
    if (!rows) return null;
    const q = filter.trim().toLowerCase();
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
        (r.zip?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [rows, filter, driverFilter]);

  return (
    <AdminShell
      title="Today's deliveries"
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
            disabled={refreshing}
          >
            Refresh
          </button>
        </>
      }
    >
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">
            Fleet · {filtered?.length ?? 0} of {rows?.length ?? 0}
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <input
              className="admin-input"
              style={{ minWidth: 220 }}
              placeholder="Search FINDOC / customer / address / ZIP"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
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

        {rows == null ? (
          <div style={{ padding: 24 }} className="admin-muted">
            <span className="admin-spinner" aria-label="loading" /> Loading fleet…
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
                  <th>Customer</th>
                  <th>Address</th>
                  <th>ZIP</th>
                  <th>Window</th>
                  <th>Status</th>
                  <th style={{ minWidth: 200 }}>Driver</th>
                </tr>
              </thead>
              <tbody>
                {filtered?.map((r) => {
                  const selected = pending[r.findoc] ?? r.actor ?? '';
                  const busy = pending[r.findoc] != null;
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
                      <td>{r.customerName || <span className="admin-muted">—</span>}</td>
                      <td>
                        {r.address}
                        {r.city && (
                          <div className="admin-muted" style={{ fontSize: 11 }}>
                            {r.city}
                          </div>
                        )}
                      </td>
                      <td>{r.zip ?? <span className="admin-muted">—</span>}</td>
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
                        <span className={`admin-status s-${r.actstatus ?? ''}`}>
                          {statusLabel(r.actstatus)}
                        </span>
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
                          {/* Surface unknown REFIDs so the dispatcher sees them
                              rather than silently losing the current assignment. */}
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
