import { useEffect, useState } from 'react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { fetchOrderDetail, type OrderDetail } from '@/orders/detail';
import { googleMapsDestinationUrl } from '@/orders/optimize';
import { Banner, Button, Card, Header, Spinner } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';
import { StatusModal } from '@/orders/statusModal';
import { pushGeo } from '@/geo/transport';

export function OrderDetailScreen() {
  const { t } = useTranslation();
  const { key } = useParams();
  const nav = useNavigate();
  const location = useLocation();
  const autoOpenStatus = (location.state as { openStatus?: boolean } | null)?.openStatus === true;
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (!key) return;
    (async () => {
      try {
        const d = await fetchOrderDetail(decodeURIComponent(key));
        setOrder(d);
        if (autoOpenStatus) setModalOpen(true);
        void pushGeo('open-order');
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, [key, autoOpenStatus]);

  if (!order && !error) {
    return (
      <div className="flex min-h-dvh flex-col">
        <Header title={t('detail.title')} right={<Button variant="ghost" onClick={() => nav(-1)}>{t('common.back')}</Button>} />
        <div className="p-4"><Spinner /></div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        title={t('detail.title')}
        right={<Button variant="ghost" onClick={() => nav(-1)}>{t('common.back')}</Button>}
      />
      <div className="flex flex-col gap-3 p-4">
        {error && <Banner kind="error">{error}</Banner>}
        {order && (
          <>
            <Card>
              <div className="font-semibold">{order.customerName}</div>
              <div className="text-sm text-muted">{order.address}{order.city ? `, ${order.city}` : ''}{order.zip ? ` ${order.zip}` : ''}</div>
              {order.phone && <div className="text-sm text-muted">☎ {order.phone}</div>}
              <div className="mt-1 text-xs text-muted">FINDOC: {order.findoc}</div>
            </Card>

            {(() => {
              const fullAddress = [order.address, order.city, order.zip]
                .map((s) => s?.trim())
                .filter(Boolean)
                .join(', ');
              const href = googleMapsDestinationUrl({
                address: fullAddress,
                coords: order.coords
              });
              return href ? (
                <a
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="pd-accent-gradient pd-press rounded-2xl px-4 py-3 text-center font-medium text-accent-fg"
                >
                  {t('detail.openInMaps')}
                </a>
              ) : null;
            })()}

            <Card>
              <div className="text-sm font-semibold">{t('detail.lines')}</div>
              <ul className="mt-2 flex flex-col gap-1 text-sm">
                {order.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-2 border-b border-border py-1 last:border-b-0">
                    <span>{l.itemName || l.itemCode || `#${i + 1}`}</span>
                    <span className="text-muted">
                      {l.qty ?? ''}
                      {l.unit ? ` ${l.unit}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
            </Card>

            <Card>
              <div className="text-sm font-semibold">{t('detail.totals')}</div>
              <div className="mt-2 text-sm">
                {order.payment && <div className="text-muted">{order.payment}</div>}
                {order.totals.gross != null && (
                  <div className="font-semibold">Total: {order.totals.gross.toFixed(2)}</div>
                )}
              </div>
            </Card>

            <Button onClick={() => setModalOpen(true)}>{t('detail.changeStatus')}</Button>
          </>
        )}
      </div>
      {modalOpen && order && (
        <StatusModal
          findoc={order.findoc}
          trdr={order.trdr}
          trdbranch={order.trdbranch}
          onClose={() => setModalOpen(false)}
          onDone={() => {
            setModalOpen(false);
            nav('/orders', { replace: true });
          }}
        />
      )}
    </div>
  );
}
