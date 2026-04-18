import { useNavigate } from 'react-router-dom';
import { Button, Card, Header } from '@/ui/primitives';
import { useTranslation } from '@/i18n/provider';

type Section = { titleKey: string; bodyKey: string };

const SECTIONS: Section[] = [
  { titleKey: 'help.section.overview.title', bodyKey: 'help.section.overview.body' },
  { titleKey: 'help.section.login.title', bodyKey: 'help.section.login.body' },
  { titleKey: 'help.section.list.title', bodyKey: 'help.section.list.body' },
  { titleKey: 'help.section.optimize.title', bodyKey: 'help.section.optimize.body' },
  { titleKey: 'help.section.reorder.title', bodyKey: 'help.section.reorder.body' },
  { titleKey: 'help.section.load.title', bodyKey: 'help.section.load.body' },
  { titleKey: 'help.section.scan.title', bodyKey: 'help.section.scan.body' },
  { titleKey: 'help.section.detail.title', bodyKey: 'help.section.detail.body' },
  { titleKey: 'help.section.status.title', bodyKey: 'help.section.status.body' },
  { titleKey: 'help.section.maps.title', bodyKey: 'help.section.maps.body' },
  { titleKey: 'help.section.offline.title', bodyKey: 'help.section.offline.body' },
  { titleKey: 'help.section.geo.title', bodyKey: 'help.section.geo.body' },
  { titleKey: 'help.section.settings.title', bodyKey: 'help.section.settings.body' }
];

export function HelpScreen() {
  const { t } = useTranslation();
  const nav = useNavigate();

  return (
    <div className="flex min-h-dvh flex-col">
      <Header
        title={t('help.title')}
        right={<Button variant="ghost" onClick={() => nav(-1)}>{t('common.back')}</Button>}
      />
      <div className="pd-stagger flex flex-col gap-3 p-4">
        {SECTIONS.map((s) => (
          <Card key={s.titleKey}>
            <div className="text-base font-semibold">{t(s.titleKey)}</div>
            <p className="mt-2 whitespace-pre-line text-sm text-muted">{t(s.bodyKey)}</p>
          </Card>
        ))}
        <div className="pt-2 text-center text-xs text-muted">{t('help.footer')}</div>
      </div>
    </div>
  );
}
