import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  DndContext,
  PointerSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent
} from '@dnd-kit/core';
import { restrictToVerticalAxis, restrictToParentElement } from '@dnd-kit/modifiers';
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { fetchDeliveryList, type DeliveryRow } from '@/orders/list';
import { optimizeRoute, googleMapsMultiStopUrlFromStops } from '@/orders/optimize';
import {
  applyStoredOrder,
  clearRouteOrder,
  loadRouteOrder,
  renumber,
  saveRouteOrder
} from '@/orders/routeOrderStore';
import { newCorrelationId, writeSoactionAndAudit } from '@/orders/soaction';
import { ACT_STATUS } from '@/orders/actStatus';
import { Banner, Button, Card, Header, Spinner } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';
import { requestFreshFix } from '@/geo/currentFix';
import { clearSession } from '@/soft1/session';
import { pushGeo } from '@/geo/transport';

type OrderedRow = { row: DeliveryRow; seq: number | null };

export function DeliveryListScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [rows, setRows] = useState<OrderedRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasStoredOrder, setHasStoredOrder] = useState(() => loadRouteOrder() !== null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchDeliveryList();
      const stored = loadRouteOrder();
      if (stored) {
        setRows(applyStoredOrder(raw, stored));
        setHasStoredOrder(true);
      } else {
        setRows(raw.map((row) => ({ row, seq: null })));
        setHasStoredOrder(false);
      }
      void pushGeo('list-refresh');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const interval = window.setInterval(load, 10 * 60 * 1_000);
    return () => clearInterval(interval);
  }, []);

  async function doOptimize() {
    if (!rows) return;
    setLoading(true);
    try {
      const origin = await requestFreshFix();
      const next = await optimizeRoute(origin, rows.map((r) => r.row));
      setRows(next);
      saveRouteOrder(next);
      setHasStoredOrder(true);
    } finally {
      setLoading(false);
    }
  }

  async function setAsNext(row: DeliveryRow) {
    const corr = newCorrelationId();
    await writeSoactionAndAudit({
      kind: 'insert',
      findoc: row.findoc,
      trdr: row.trdr,
      trdbranch: row.trdbranch,
      actstatus: ACT_STATUS.IN_PROGRESS,
      correlationId: corr
    });
    await load();
  }

  function clearManualOrder() {
    clearRouteOrder();
    setHasStoredOrder(false);
    setRows((cur) => (cur ? cur.map(({ row }) => ({ row, seq: null })) : cur));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } })
  );

  function onDragEnd(event: DragEndEvent) {
    if (!rows) return;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const from = rows.findIndex((r) => r.row.key === active.id);
    const to = rows.findIndex((r) => r.row.key === over.id);
    if (from < 0 || to < 0) return;
    // Every row at or above the drop position joins the sorted sequence
    // (stamp 0 so renumber assigns it a fresh position); rows still below
    // keep seq:null and remain at the tail as "not yet sorted".
    const lastSorted = Math.max(from, to);
    const stamped = arrayMove(rows, from, to).map(({ row, seq }, i) => ({
      row,
      seq: i <= lastSorted ? (seq ?? 0) : seq
    }));
    const next = renumber(stamped);
    setRows(next);
    saveRouteOrder(next);
    setHasStoredOrder(true);
  }

  const mapsUrl = useMemo(() => {
    if (!rows) return null;
    const stops = rows.map(({ row }) => ({
      address: [row.address, row.city, row.zip].map((s) => s?.trim()).filter(Boolean).join(', '),
      coords: row.coords
    }));
    return googleMapsMultiStopUrlFromStops(stops);
  }, [rows]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        title={t('list.title')}
        right={
          <div className="flex gap-2">
            <Link to="/scan/load" className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              {t('list.loadNewShort')}
            </Link>
            <Link to="/settings" className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              ⚙
            </Link>
          </div>
        }
      />
      <div className="flex flex-col gap-3 p-4">
        {error && <Banner kind="error">{error}</Banner>}
        <div className="flex gap-2">
          <Button variant="secondary" onClick={load} loading={loading} className="flex-1">
            {t('list.refresh')}
          </Button>
          <Button variant="secondary" onClick={doOptimize} className="flex-1">
            {t('list.optimize')}
          </Button>
        </div>
        <Button onClick={() => nav('/scan')}>{t('list.scan')}</Button>
        {hasStoredOrder && mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-accent px-4 py-3 text-center font-medium text-accent-fg"
          >
            {t('detail.openInMaps')}
          </a>
        )}
        {hasStoredOrder && (
          <button
            type="button"
            onClick={clearManualOrder}
            className="self-end text-xs text-muted underline"
          >
            {t('list.clearOrder')}
          </button>
        )}
        {rows === null && <Spinner />}
        {rows && rows.length === 0 && <div className="text-muted">{t('list.empty')}</div>}
        {rows && rows.length > 0 && (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            modifiers={[restrictToVerticalAxis, restrictToParentElement]}
            onDragEnd={onDragEnd}
          >
            <SortableContext
              items={rows.map((r) => r.row.key)}
              strategy={verticalListSortingStrategy}
            >
              <div className="flex flex-col gap-3">
                {rows.map(({ row, seq }) => (
                  <SortableRow
                    key={row.key}
                    row={row}
                    seq={seq}
                    onOpen={() => nav(`/orders/${encodeURIComponent(row.key)}`)}
                    onSetNext={() => setAsNext(row)}
                    setNextLabel={t('list.setNext')}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}
        <Button
          variant="ghost"
          onClick={() => {
            clearSession();
            nav('/login', { replace: true });
          }}
        >
          {t('common.logout')}
        </Button>
      </div>
    </div>
  );
}

type SortableRowProps = {
  row: DeliveryRow;
  seq: number | null;
  onOpen: () => void;
  onSetNext: () => void;
  setNextLabel: string;
};

function SortableRow({ row, seq, onOpen, onSetNext, setNextLabel }: SortableRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: row.key
  });
  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.7 : 1,
    touchAction: 'manipulation'
  };
  return (
    <div ref={setNodeRef} style={style}>
      <Card className={!row.coords ? 'opacity-60' : ''}>
        <div className="flex items-start justify-between gap-2">
          <button
            type="button"
            aria-label="Drag to reorder"
            className="flex h-10 w-8 cursor-grab items-center justify-center text-xl text-muted active:cursor-grabbing"
            style={{ touchAction: 'none' }}
            {...attributes}
            {...listeners}
          >
            ≡
          </button>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              {seq != null && (
                <span className="inline-flex h-6 min-w-[1.5rem] items-center justify-center rounded-full bg-accent px-2 text-xs font-bold text-accent-fg">
                  {seq}
                </span>
              )}
              <span className="font-semibold">{row.customerName || row.fincode || row.findoc}</span>
            </div>
            <div className="mt-1 text-sm text-muted">
              {row.address}
              {row.city ? `, ${row.city}` : ''}
              {row.zip ? ` ${row.zip}` : ''}
              {row.district ? ` — ${row.district}` : ''}
            </div>
            {row.phone && <div className="mt-1 text-xs text-muted">☎ {row.phone}</div>}
            <div className="mt-1 text-xs text-muted">
              {row.fincode ?? `FINDOC ${row.findoc}`}
              {row.total != null ? ` · ${row.total.toFixed(2)} €` : ''}
            </div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" className="flex-1" onClick={onOpen}>
            🔍
          </Button>
          <Button className="flex-1" onClick={onSetNext}>
            {setNextLabel}
          </Button>
        </div>
      </Card>
    </div>
  );
}
