import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { fetchDeliveryList, type DeliveryRow } from '@/orders/list';
import { optimizeRoute, googleMapsMultiStopUrlFromStops } from '@/orders/optimize';
import { newCorrelationId, writeSoactionAndAudit } from '@/orders/soaction';
import { ACT_STATUS } from '@/orders/actStatus';
import { Banner, Button, Card, Header, Spinner } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';
import { currentFix, hasFix } from '@/geo/currentFix';
import { clearSession } from '@/soft1/session';
import { pushGeo } from '@/geo/transport';

export function DeliveryListScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [rows, setRows] = useState<Array<{ row: DeliveryRow; seq: number | null }> | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimized, setOptimized] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const raw = await fetchDeliveryList();
      setRows(raw.map((row) => ({ row, seq: null })));
      setOptimized(false);
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
      const origin = hasFix() ? { lat: Number(currentFix.lat), lon: Number(currentFix.lon) } : null;
      const next = await optimizeRoute(origin, rows.map((r) => r.row));
      setRows(next);
      setOptimized(true);
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
            <Link to="/scan" className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm">
              {t('list.scan')}
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
        <Button onClick={() => nav('/scan/load')}>{t('list.loadNew')}</Button>
        {optimized && mapsUrl && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="rounded-xl bg-accent px-4 py-3 text-center font-medium text-accent-fg"
          >
            {t('detail.openInMaps')}
          </a>
        )}
        {rows === null && <Spinner />}
        {rows && rows.length === 0 && <div className="text-muted">{t('list.empty')}</div>}
        {rows?.map(({ row, seq }) => (
          <Card key={row.key} className={!row.coords ? 'opacity-60' : ''}>
            <div className="flex items-start justify-between gap-2">
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
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => nav(`/orders/${encodeURIComponent(row.key)}`)}
              >
                ▶
              </Button>
              <Button className="flex-1" onClick={() => setAsNext(row)}>
                {t('list.setNext')}
              </Button>
            </div>
          </Card>
        ))}
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
