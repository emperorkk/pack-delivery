import { useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { useTranslation } from '@/i18n/provider';
import type { DriverRow, FleetDeliveryRow } from '../fleet';
import { slaFor, type SlaState } from '../sla';

/**
 * Desktop kanban for reassignment. One lane per driver the dispatcher
 * ticked in the header (+ a permanent "Unassigned" lane on the left).
 * Dropping a card onto another lane calls `onReassign(findoc, targetRefid)`.
 *
 * The lanes are presentation-only: they read rows from the parent and
 * delegate every mutation back via `onReassign`. The parent is already
 * doing optimistic updates + polling, so no local state lives here.
 */

const UNASSIGNED = '__unassigned__';

export type FleetLanesProps = {
  rows: FleetDeliveryRow[];
  drivers: DriverRow[];
  /** Which driver REFIDs to render as lanes. Order = display order. */
  visibleDriverRefids: string[];
  onReassign: (row: FleetDeliveryRow, actor: string) => void;
  pending: Record<string, string | undefined>;
};

export function FleetLanes({
  rows,
  drivers,
  visibleDriverRefids,
  onReassign,
  pending
}: FleetLanesProps) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const lanes = useMemo(() => {
    const byActor = new Map<string, FleetDeliveryRow[]>();
    byActor.set(UNASSIGNED, []);
    for (const refid of visibleDriverRefids) byActor.set(refid, []);
    for (const r of rows) {
      const key = r.actor && byActor.has(r.actor) ? r.actor : UNASSIGNED;
      // Still surface rows assigned to a hidden driver as "unassigned"
      // visually — otherwise they'd vanish in Lanes view without a hint.
      byActor.get(key)!.push(r);
    }
    return {
      unassigned: byActor.get(UNASSIGNED) ?? [],
      driverLanes: visibleDriverRefids.map((refid) => {
        const d = drivers.find((x) => x.refid === refid);
        return {
          refid,
          name: d?.name ?? refid,
          activeToday: d?.activeToday ?? true,
          rows: byActor.get(refid) ?? []
        };
      })
    };
  }, [rows, drivers, visibleDriverRefids]);

  function onDragEnd(e: DragEndEvent) {
    const target = e.over?.id;
    const findoc = String(e.active.id);
    if (!target) return;
    const row = rows.find((r) => r.findoc === findoc);
    if (!row) return;
    const targetActor = target === UNASSIGNED ? '' : String(target);
    if ((row.actor ?? '') === targetActor) return;
    onReassign(row, targetActor);
  }

  return (
    <DndContext sensors={sensors} onDragEnd={onDragEnd}>
      <div className="admin-lanes">
        <Lane
          id={UNASSIGNED}
          title={t('admin.lanes.unassigned')}
          count={lanes.unassigned.length}
          rows={lanes.unassigned}
          pending={pending}
        />
        {lanes.driverLanes.map((lane) => (
          <Lane
            key={lane.refid}
            id={lane.refid}
            title={lane.name}
            subtitle={!lane.activeToday ? t('admin.deliveries.offToday').trim() : undefined}
            count={lane.rows.length}
            rows={lane.rows}
            pending={pending}
          />
        ))}
        {lanes.driverLanes.length === 0 && (
          <div className="admin-muted" style={{ padding: 24 }}>
            {t('admin.lanes.pickDrivers')}
          </div>
        )}
      </div>
      <DragOverlayShim />
    </DndContext>
  );
}

function Lane({
  id,
  title,
  subtitle,
  count,
  rows,
  pending
}: {
  id: string;
  title: string;
  subtitle?: string;
  count: number;
  rows: FleetDeliveryRow[];
  pending: Record<string, string | undefined>;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div className={`admin-lane ${isOver ? 'admin-lane-over' : ''}`}>
      <div className="admin-lane-header">
        <div>
          <div className="admin-lane-title">{title}</div>
          {subtitle && <div className="admin-lane-subtitle">{subtitle}</div>}
        </div>
        <span className="admin-lane-count">{count}</span>
      </div>
      <div ref={setNodeRef} className="admin-lane-body">
        {rows.map((r) => (
          <DraggableCard key={r.findoc} row={r} pending={pending[r.findoc] != null} />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ row, pending }: { row: FleetDeliveryRow; pending: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: row.findoc
  });
  const sla = slaFor(row, new Date());
  return (
    <div
      ref={setNodeRef}
      className={[
        'admin-card-sm',
        slaClass(sla),
        isDragging ? 'admin-card-dragging' : '',
        pending ? 'admin-card-pending' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      {...attributes}
      {...listeners}
    >
      <div className="admin-card-sm-head">
        <strong>{row.fincode ?? row.findoc}</strong>
        {sla && <span className={`admin-sla-badge ${slaClass(sla)}`}>{slaLabel(sla)}</span>}
      </div>
      <div className="admin-card-sm-body">{row.customerName || '—'}</div>
      <div className="admin-card-sm-meta">
        {row.zip && <span>{row.zip}</span>}
        {row.city && <span>{row.city}</span>}
        {row.timeTo && row.timeTo !== '23:59' && (
          <span className="admin-muted">
            {(row.timeFrom ?? '—') + '–' + row.timeTo}
          </span>
        )}
      </div>
    </div>
  );
}

function DragOverlayShim() {
  // Overlay is left intentionally empty — dnd-kit doesn't *require* it,
  // but rendering one avoids a layout jump when a card is grabbed.
  return <DragOverlay dropAnimation={null} />;
}

function slaClass(s: SlaState): string {
  if (s === 'overdue') return 'admin-sla-overdue';
  if (s === 'dueSoon') return 'admin-sla-dueSoon';
  return '';
}

function slaLabel(s: SlaState): string {
  // Labels are looked up via translation keys in the parent card, but
  // for the small inline badge we want a single glyph that reads at a
  // glance without crowding the card.
  if (s === 'overdue') return '!';
  if (s === 'dueSoon') return '~';
  return '';
}
