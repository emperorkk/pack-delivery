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
import { routeStops, type RouteStop } from '../routing';

/**
 * Desktop kanban for reassignment. One lane per driver the dispatcher
 * ticked in the header (+ a permanent "Unassigned" lane on the left).
 * Dropping a card onto another lane calls `onReassign(findoc, targetRefid)`.
 *
 * Per-lane endpoint picker: the dispatcher can pin one of that driver's
 * deliveries as the final stop. The NN ordering then excludes the pinned
 * stop from the walk and appends it at the end with a flag.
 */

const UNASSIGNED = '__unassigned__';

export type FleetLanesProps = {
  rows: FleetDeliveryRow[];
  drivers: DriverRow[];
  visibleDriverRefids: string[];
  onReassign: (row: FleetDeliveryRow, actor: string) => void;
  pending: Record<string, string | undefined>;
  /** Map of driver REFID → pinned final-stop FINDOC. */
  finalStops: Record<string, string | undefined>;
  onSetFinalStop: (refid: string, findoc: string | undefined) => void;
};

type Lane = {
  id: string;
  title: string;
  subtitle?: string;
  driverRefid?: string;   // undefined for the Unassigned lane
  origin?: { lat: number; lon: number } | null;
  stops: RouteStop[];
  pickableRows: FleetDeliveryRow[];
};

export function FleetLanes({
  rows,
  drivers,
  visibleDriverRefids,
  onReassign,
  pending,
  finalStops,
  onSetFinalStop
}: FleetLanesProps) {
  const { t } = useTranslation();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } })
  );

  const lanes: Lane[] = useMemo(() => {
    const byActor = new Map<string, FleetDeliveryRow[]>();
    byActor.set(UNASSIGNED, []);
    for (const refid of visibleDriverRefids) byActor.set(refid, []);
    for (const r of rows) {
      const key = r.actor && byActor.has(r.actor) ? r.actor : UNASSIGNED;
      byActor.get(key)!.push(r);
    }

    const unassignedRows = byActor.get(UNASSIGNED) ?? [];
    const out: Lane[] = [
      {
        id: UNASSIGNED,
        title: t('admin.lanes.unassigned'),
        stops: unassignedRows.map((r) => ({ row: r, seq: null, isFinal: false })),
        pickableRows: []
      }
    ];

    for (const refid of visibleDriverRefids) {
      const d = drivers.find((x) => x.refid === refid);
      const laneRows = byActor.get(refid) ?? [];
      const origin = d?.lastFix ?? null;
      const finalFindoc = finalStops[refid];
      out.push({
        id: refid,
        title: d?.name ?? refid,
        subtitle: d?.activeToday === false ? t('admin.deliveries.offToday').trim() : undefined,
        driverRefid: refid,
        origin,
        stops: routeStops(laneRows, origin, finalFindoc),
        pickableRows: laneRows
      });
    }
    return out;
  }, [rows, drivers, visibleDriverRefids, finalStops, t]);

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
        {lanes.map((lane) => (
          <LaneView
            key={lane.id}
            lane={lane}
            pending={pending}
            finalStopFindoc={
              lane.driverRefid ? finalStops[lane.driverRefid] : undefined
            }
            onSetFinalStop={(findoc) =>
              lane.driverRefid && onSetFinalStop(lane.driverRefid, findoc)
            }
          />
        ))}
        {lanes.length === 1 && (
          <div className="admin-muted" style={{ padding: 24 }}>
            {t('admin.lanes.pickDrivers')}
          </div>
        )}
      </div>
      <DragOverlay dropAnimation={null} />
    </DndContext>
  );
}

function LaneView({
  lane,
  pending,
  finalStopFindoc,
  onSetFinalStop
}: {
  lane: Lane;
  pending: Record<string, string | undefined>;
  finalStopFindoc: string | undefined;
  onSetFinalStop: (findoc: string | undefined) => void;
}) {
  const { t } = useTranslation();
  const { setNodeRef, isOver } = useDroppable({ id: lane.id });
  const canPickEnd = lane.driverRefid != null && lane.pickableRows.length >= 2;

  return (
    <div className={`admin-lane ${isOver ? 'admin-lane-over' : ''}`}>
      <div className="admin-lane-header">
        <div>
          <div className="admin-lane-title">{lane.title}</div>
          {lane.subtitle && <div className="admin-lane-subtitle">{lane.subtitle}</div>}
        </div>
        <span className="admin-lane-count">{lane.pickableRows.length || lane.stops.length}</span>
      </div>
      {canPickEnd && (
        <div className="admin-lane-endpoint">
          <label>
            <span className="admin-muted">{t('admin.route.endAt')}</span>
            <select
              className="admin-select"
              value={finalStopFindoc ?? ''}
              onChange={(e) => onSetFinalStop(e.target.value || undefined)}
            >
              <option value="">{t('admin.route.endNone')}</option>
              {lane.pickableRows.map((r) => (
                <option key={r.findoc} value={r.findoc}>
                  {(r.fincode ?? r.findoc) +
                    (r.customerName ? ` — ${r.customerName}` : '')}
                </option>
              ))}
            </select>
          </label>
          {!lane.origin && (
            <div className="admin-lane-hint">{t('admin.route.noOrigin')}</div>
          )}
        </div>
      )}
      <div ref={setNodeRef} className="admin-lane-body">
        {lane.stops.map((s) => (
          <DraggableCard
            key={s.row.findoc}
            stop={s}
            pending={pending[s.row.findoc] != null}
          />
        ))}
      </div>
    </div>
  );
}

function DraggableCard({ stop, pending }: { stop: RouteStop; pending: boolean }) {
  const { row, seq, isFinal } = stop;
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
        pending ? 'admin-card-pending' : '',
        isFinal ? 'admin-card-final' : ''
      ]
        .filter(Boolean)
        .join(' ')}
      {...attributes}
      {...listeners}
    >
      <div className="admin-card-sm-head">
        <span className="admin-card-sm-lead">
          {isFinal ? (
            <span className="admin-seq admin-seq-final" aria-label="final stop">
              ⚑
            </span>
          ) : seq != null ? (
            <span className="admin-seq">{seq}</span>
          ) : (
            <span className="admin-seq admin-seq-empty">·</span>
          )}
          <strong>{row.fincode ?? row.findoc}</strong>
        </span>
        {sla && <span className={`admin-sla-badge ${slaClass(sla)}`}>{slaGlyph(sla)}</span>}
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

function slaClass(s: SlaState): string {
  if (s === 'overdue') return 'admin-sla-overdue';
  if (s === 'dueSoon') return 'admin-sla-dueSoon';
  return '';
}

function slaGlyph(s: SlaState): string {
  if (s === 'overdue') return '!';
  if (s === 'dueSoon') return '~';
  return '';
}
