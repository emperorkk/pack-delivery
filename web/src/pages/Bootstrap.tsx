import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { runBootstrap, type BootstrapResult } from '@/soft1/bootstrap';
import { clearSession, loadSession } from '@/soft1/session';
import { useTranslation } from '@/i18n/provider';
import { Banner, Button, Header } from '@/ui/primitives';
import { config } from '@/config';

export function BootstrapScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [result, setResult] = useState<BootstrapResult | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const s = loadSession();
    if (!s) {
      nav('/login', { replace: true });
      return;
    }
    let cancelled = false;
    runBootstrap(s).then((r) => {
      if (!cancelled) {
        setResult(r);
        if (r.status === 'ok') nav('/orders', { replace: true });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [attempt, nav]);

  if (!result) {
    return (
      <div className="flex min-h-dvh flex-col">
        <Header title={t('bootstrap.title')} />
        <div className="p-4 text-muted">{t('bootstrap.active')}</div>
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t('bootstrap.title')} />
      <div className="flex flex-col gap-3 p-4">
        {result.status === 'cst-missing' && (
          <Banner kind="error">{t('bootstrap.cstMissing', { url: config.cstDownloadUrl || '—' })}</Banner>
        )}
        {result.status === 'table-create-failed' && (
          <Banner kind="error">{t('bootstrap.tableFailed')}: {result.message}</Banner>
        )}
        {result.status === 'network-error' && (
          <Banner kind="error">{t('bootstrap.networkError')}: {result.message}</Banner>
        )}
        <Button onClick={() => setAttempt((n) => n + 1)}>{t('common.retry')}</Button>
        <Button variant="ghost" onClick={() => { clearSession(); nav('/login', { replace: true }); }}>
          {t('common.logout')}
        </Button>
      </div>
    </div>
  );
}
