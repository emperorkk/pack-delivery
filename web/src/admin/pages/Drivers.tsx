import { useEffect, useState } from 'react';
import { AdminShell } from '../layout/Shell';
import { getDrivers, type DriverRow } from '../fleet';

export function DriversScreen() {
  const [drivers, setDrivers] = useState<DriverRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDrivers()
      .then((d) => {
        if (!cancelled) setDrivers(d);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell title="Drivers">
      <div className="admin-card">
        <div className="admin-card-header">
          <div className="admin-card-title">Roster</div>
        </div>
        {error && (
          <div className="admin-banner error" style={{ margin: 12 }}>
            {error}
          </div>
        )}
        {drivers == null ? (
          <div style={{ padding: 24 }} className="admin-muted">
            <span className="admin-spinner" aria-label="loading" /> Loading drivers…
          </div>
        ) : drivers.length === 0 ? (
          <div style={{ padding: 24 }} className="admin-muted">
            No drivers returned by getDrivers.
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>REFID</th>
                <th>Name</th>
                <th>Active today</th>
                <th>Last fix</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((d) => (
                <tr key={d.refid}>
                  <td>{d.refid}</td>
                  <td>{d.name}</td>
                  <td>
                    {d.activeToday ? (
                      <span className="admin-status s-3">Active</span>
                    ) : (
                      <span className="admin-status s-6">Off</span>
                    )}
                  </td>
                  <td>
                    {d.lastFix ? (
                      <span className="admin-muted">
                        {d.lastFix.lat.toFixed(5)}, {d.lastFix.lon.toFixed(5)}
                        {d.lastFix.ts ? ` · ${new Date(d.lastFix.ts).toLocaleString()}` : ''}
                      </span>
                    ) : (
                      <span className="admin-muted">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AdminShell>
  );
}
