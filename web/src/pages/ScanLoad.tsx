import { useCallback, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { BarcodeScanner } from '@/scanner/zxing';
import { Banner, Button, Header } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';
import { pushGeo } from '@/geo/transport';
import { resolveSaldocHead, writeLoadSoaction } from '@/orders/loadAction';

type HistoryEntry = {
  id: string;
  findoc: string;
  fincode?: string;
  soactionKey: string;
};

export function ScanLoadScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [mountKey, setMountKey] = useState(0);

  const onResult = useCallback(async (text: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    void pushGeo('scan');
    try {
      const head = await resolveSaldocHead(text);
      if (!head) {
        setError(t('scanLoad.notFound'));
        return;
      }
      const res = await writeLoadSoaction(head);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setHistory((prev) => [
        {
          id: `${res.soactionKey}-${Date.now()}`,
          findoc: head.findoc,
          fincode: head.fincode,
          soactionKey: res.soactionKey
        },
        ...prev
      ]);
    } finally {
      setBusy(false);
      setMountKey((k) => k + 1);
    }
  }, [busy, t]);

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        title={t('scanLoad.title')}
        right={<Button variant="ghost" onClick={() => nav(-1)}>{t('common.back')}</Button>}
      />
      <div className="flex flex-col gap-3 p-4">
        {error && <Banner kind="error">{error}</Banner>}
        <div className="text-sm text-muted">{t('scanLoad.hint')}</div>
        <BarcodeScanner key={mountKey} onResult={onResult} />
        {busy && <div className="text-muted">{t('scan.searching')}</div>}
        {history.length > 0 && (
          <div className="flex flex-col gap-2">
            <div className="text-sm font-semibold">{t('scanLoad.loaded')}</div>
            {history.map((h) => (
              <div
                key={h.id}
                className="rounded-xl border border-border bg-surface-2 px-3 py-2 text-sm"
              >
                ✓ {h.fincode ?? `FINDOC ${h.findoc}`} · SOACTION {h.soactionKey}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
