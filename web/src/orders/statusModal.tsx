import { useState } from 'react';
import { ACT_STATUS, ACT_STATUS_VALUES, requiresComment, type ActStatus } from './actStatus';
import { getActionKey, newCorrelationId, writeSoactionAndAudit } from './soaction';
import { Banner, Button, TextArea } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';

export function StatusModal({
  findoc,
  trdr,
  trdbranch,
  initialStatus = ACT_STATUS.COMPLETED,
  onClose,
  onDone
}: {
  findoc: string;
  trdr: string;
  trdbranch?: string;
  initialStatus?: ActStatus;
  onClose: () => void;
  onDone: () => void;
}) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<ActStatus>(initialStatus);
  const [comments, setComments] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const commentInvalid = requiresComment(status) && comments.trim() === '';

  async function submit() {
    if (commentInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const existing = getActionKey(findoc);
      const corr = newCorrelationId();
      const res = existing
        ? await writeSoactionAndAudit({
            kind: 'update',
            findoc,
            trdr,
            trdbranch,
            actstatus: status,
            comments: comments.trim() || undefined,
            soactionKey: existing,
            correlationId: corr
          })
        : await writeSoactionAndAudit({
            kind: 'insert',
            findoc,
            trdr,
            trdbranch,
            actstatus: status,
            comments: comments.trim() || undefined,
            correlationId: corr
          });

      if (res.ok) {
        onDone();
      } else {
        setError(res.error);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4">
      <div className="app-column rounded-t-2xl bg-surface p-4">
        <div className="mb-3 h-1 w-12 rounded-full bg-border mx-auto" />
        <div className="flex flex-col gap-3">
          {error && <Banner kind="error">{error}</Banner>}
          <div className="flex flex-wrap gap-2">
            {ACT_STATUS_VALUES.map((v) => (
              <button
                key={v}
                onClick={() => setStatus(v)}
                className={`flex-1 rounded-xl border px-3 py-2 text-sm ${
                  status === v ? 'border-accent bg-accent text-accent-fg' : 'border-border bg-surface-2'
                }`}
              >
                {t(`status.${v}`)}
              </button>
            ))}
          </div>
          <TextArea
            value={comments}
            onChange={(e) => setComments(e.target.value)}
            placeholder=""
            error={commentInvalid ? t('status.commentRequired') : undefined}
          />
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} className="flex-1">
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} loading={busy} disabled={commentInvalid} className="flex-1">
              {t('common.submit')}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
