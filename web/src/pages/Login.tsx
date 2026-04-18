import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { signIn } from '@/soft1/client';
import { Soft1Error, Soft1UnreachableError } from '@/soft1/errors';
import { useTranslation } from '@/i18n/provider';
import { Banner, Button, Header, TextInput } from '@/ui/primitives';

export function LoginScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();
  const [serialNumber, setSerialNumber] = useState('');
  const [appId, setAppId] = useState('1199');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn({ serialNumber: serialNumber.trim(), appId: appId.trim(), username, password });
      nav('/bootstrap', { replace: true });
    } catch (err) {
      if (err instanceof Soft1UnreachableError) setError(t('login.unreachable'));
      else if (err instanceof Soft1Error) setError(err.message);
      else setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh flex-col">
      <Header title={t('login.title')} />
      <form onSubmit={onSubmit} className="flex flex-col gap-3 p-4">
        {error && <Banner kind="error">{error}</Banner>}
        <TextInput
          label={t('login.serialNumber')}
          autoComplete="off"
          inputMode="numeric"
          value={serialNumber}
          onChange={(e) => setSerialNumber(e.target.value)}
          placeholder="011..."
          required
        />
        <TextInput
          label={t('login.appId')}
          autoComplete="off"
          inputMode="numeric"
          value={appId}
          onChange={(e) => setAppId(e.target.value)}
          required
        />
        <TextInput
          label={t('login.username')}
          autoComplete="username"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          required
        />
        <TextInput
          label={t('login.password')}
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <Button type="submit" loading={busy}>
          {t('login.submit')}
        </Button>
      </form>
    </div>
  );
}
