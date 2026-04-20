import { useMemo, useState } from 'react';
import { useTranslation } from '@/i18n/provider';
import type { DriverRow, FleetDeliveryRow } from '../fleet';
import { planDistribution, type DistributeScope } from '../distribute';

export type DistributeModalProps = {
  open: boolean;
  rows: FleetDeliveryRow[];
  drivers: DriverRow[];
  onClose: () => void;
  /**
   * Invoked per delivery when the dispatcher confirms. The parent is
   * responsible for running the actual CST calls so we don't duplicate
   * the optimistic-update logic that lives on the table page.
   */
  onConfirm: (assignments: Array<{ findoc: string; actor: string }>) => Promise<void>;
};

export function DistributeModal({
  open,
  rows,
  drivers,
  onClose,
  onConfirm
}: DistributeModalProps) {
  const { t } = useTranslation();
  const [scope, setScope] = useState<DistributeScope>('unassignedOnly');
  const [selectedRefids, setSelectedRefids] = useState<Set<string>>(() => {
    return new Set(drivers.filter((d) => d.activeToday).map((d) => d.refid));
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedDrivers = useMemo(
    () => drivers.filter((d) => selectedRefids.has(d.refid)),
    [drivers, selectedRefids]
  );

  const plan = useMemo(() => {
    return planDistribution(rows, selectedDrivers, scope);
  }, [rows, selectedDrivers, scope]);

  if (!open) return null;

  function toggleDriver(refid: string) {
    setSelectedRefids((s) => {
      const next = new Set(s);
      if (next.has(refid)) next.delete(refid);
      else next.add(refid);
      return next;
    });
  }

  function allDrivers() {
    setSelectedRefids(new Set(drivers.filter((d) => d.activeToday).map((d) => d.refid)));
  }

  function noDrivers() {
    setSelectedRefids(new Set());
  }

  async function confirm() {
    setBusy(true);
    setError(null);
    try {
      const assignments: Array<{ findoc: string; actor: string }> = [];
      for (const a of plan.assignments) {
        for (const r of a.rows) assignments.push({ findoc: r.findoc, actor: a.driverRefid });
      }
      await onConfirm(assignments);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-modal-overlay" onClick={onClose}>
      <div
        className="admin-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="distribute-title"
      >
        <div className="admin-modal-header">
          <h2 id="distribute-title">{t('admin.distribute.title')}</h2>
          <button type="button" className="admin-btn" onClick={onClose}>
            {t('common.cancel')}
          </button>
        </div>

        <div className="admin-modal-body">
          <section>
            <div className="admin-modal-section-header">
              <strong>{t('admin.distribute.selectDrivers')}</strong>
              <div style={{ display: 'flex', gap: 6 }}>
                <button type="button" className="admin-btn" onClick={allDrivers}>
                  {t('admin.filters.all')}
                </button>
                <button type="button" className="admin-btn" onClick={noDrivers}>
                  {t('admin.filters.none')}
                </button>
              </div>
            </div>
            <div className="admin-driver-grid">
              {drivers.map((d) => (
                <label key={d.refid} className="admin-driver-check">
                  <input
                    type="checkbox"
                    checked={selectedRefids.has(d.refid)}
                    onChange={() => toggleDriver(d.refid)}
                  />
                  <span>{d.name}</span>
                  {!d.activeToday && (
                    <span className="admin-muted" style={{ fontSize: 11 }}>
                      {t('admin.deliveries.offToday').trim()}
                    </span>
                  )}
                </label>
              ))}
            </div>
          </section>

          <section>
            <div className="admin-modal-section-header">
              <strong>{t('admin.distribute.scope')}</strong>
            </div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
              <label className="admin-radio">
                <input
                  type="radio"
                  checked={scope === 'unassignedOnly'}
                  onChange={() => setScope('unassignedOnly')}
                />
                {t('admin.distribute.scope.unassignedOnly')}
              </label>
              <label className="admin-radio">
                <input
                  type="radio"
                  checked={scope === 'redistribute'}
                  onChange={() => setScope('redistribute')}
                />
                {t('admin.distribute.scope.redistribute')}
              </label>
            </div>
          </section>

          <section>
            <div className="admin-modal-section-header">
              <strong>{t('admin.distribute.preview')}</strong>
              <span className="admin-muted" style={{ fontSize: 12 }}>
                {t('admin.distribute.previewTotal', { n: plan.totalPlanned })}
              </span>
            </div>
            {plan.assignments.length === 0 ? (
              <div className="admin-muted">{t('admin.distribute.pickDriver')}</div>
            ) : plan.totalPlanned === 0 ? (
              <div className="admin-muted">{t('admin.distribute.nothingToAssign')}</div>
            ) : (
              <table className="admin-table" style={{ maxWidth: 420 }}>
                <thead>
                  <tr>
                    <th>{t('admin.drivers.col.name')}</th>
                    <th style={{ textAlign: 'right' }}>
                      {t('admin.distribute.col.stops')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {plan.assignments.map((a) => (
                    <tr key={a.driverRefid}>
                      <td>{a.driverName}</td>
                      <td style={{ textAlign: 'right' }}>{a.rows.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          {error && <div className="admin-banner error">{error}</div>}
        </div>

        <div className="admin-modal-footer">
          <button
            type="button"
            className="admin-btn admin-btn-primary"
            disabled={busy || plan.totalPlanned === 0 || selectedRefids.size === 0}
            onClick={() => void confirm()}
          >
            {busy ? (
              <span className="admin-spinner" aria-label="saving" />
            ) : (
              t('admin.distribute.confirm', { n: plan.totalPlanned })
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
