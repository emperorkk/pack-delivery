import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarcodeScanner } from '@/scanner/zxing';
import { resolveBarcode } from '@/scanner/resolve';
import { Banner, Button, Header } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';
import { pushGeo } from '@/geo/transport';

export function ScanScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onResult(text: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    void pushGeo('scan');
    const hit = await resolveBarcode(text);
    if (hit) {
      nav(`/orders/${encodeURIComponent(hit.key)}`, {
        replace: true,
        state: { openStatus: true }
      });
    } else {
      setError(t('scan.noMatch'));
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        title={t('scan.title')}
        right={<Button variant="ghost" onClick={() => nav(-1)}>{t('common.back')}</Button>}
      />
      <div className="flex flex-col gap-3 p-4">
        {error && <Banner kind="error">{error}</Banner>}
        <BarcodeScanner onResult={onResult} />
        {busy && <div className="text-muted">{t('scan.searching')}</div>}
      </div>
    </div>
  );
}
