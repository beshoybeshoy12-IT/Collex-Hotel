'use client';

import { BedDouble, ClipboardList, FileCheck2, LogIn, LogOut, Moon, Users } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { Button, Card, PageHeader, Spinner, Stat, StatusBadge, Table, Td } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

export default function DashboardPage() {
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const d = useApi<any>('/v1/front-desk/dashboard', { refetchInterval: 30_000 });
  const audit = useApiMutation(() => ({ path: '/v1/front-desk/night-audit' }), {
    onSuccess: () => undefined,
  });
  if (d.isLoading || !d.data) return <Spinner />;
  const x = d.data;
  return (
    <>
      <PageHeader
        title={t('dashboard.title')}
        subtitle={`${t('dashboard.businessDate')}: ${f.date(x.businessDate, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}`}
        actions={
          s.can('folio.post') && (
            <Button variant="secondary" icon={Moon} loading={audit.isPending} onClick={() => audit.mutate()}>
              {t('dashboard.nightAudit')}
            </Button>
          )
        }
      />
      {audit.data && <p className="mb-3 text-sm text-emerald-800">{t('dashboard.nightAuditDone', { count: audit.data.staysPosted })}</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat label={t('dashboard.arrivals')} value={f.number(x.arrivals.length)} icon={LogIn} />
        <Stat label={t('dashboard.departures')} value={f.number(x.departures.length)} icon={LogOut} />
        <Stat label={t('dashboard.inHouse')} value={f.number(x.inHouse.length)} icon={Users} />
        <Stat label={t('dashboard.unassigned')} value={f.number(x.unassigned.length)} icon={BedDouble} />
        <Stat label={t('dashboard.docsToReview')} value={f.number(x.documentsAwaitingReview)} icon={FileCheck2} />
        <Stat label={t('dashboard.openRequests')} value={f.number(x.openServiceRequests)} icon={ClipboardList} />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card title={t('dashboard.arrivals')} actions={<Link href="/app/front-desk" className="text-sm text-brand-700 hover:underline">{t('nav.frontDesk')}</Link>}>
          {x.arrivals.length === 0 ? (
            <p className="text-sm text-slate-600">{t('common.emptyBody')}</p>
          ) : (
            <Table head={[t('reservations.guestName'), t('reservations.confirmationNo'), t('common.room'), t('common.status')]}>
              {x.arrivals.map((r: any) => (
                <tr key={r.id}>
                  <Td><Link href={`/app/reservations/${r.id}`} className="text-brand-700 hover:underline">{r.guestName}</Link></Td>
                  <Td><bdi className="font-mono">{r.confirmationNo}</bdi></Td>
                  <Td>{r.rooms.map((rr: any) => rr.room?.number ?? '—').join('، ')}</Td>
                  <Td><StatusBadge group="reservation" value={r.status} /></Td>
                </tr>
              ))}
            </Table>
          )}
        </Card>
        <Card title={t('dashboard.roomStatus')}>
          <ul className="space-y-2">
            {x.roomStatus.map((r: any) => (
              <li key={`${r.housekeepingStatus}-${r.maintenanceStatus}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="flex flex-wrap gap-1">
                  <StatusBadge group="housekeeping" value={r.housekeepingStatus} />
                  <StatusBadge group="maintenance" value={r.maintenanceStatus} />
                </span>
                <span className="font-semibold">{f.number(r.count)}</span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}
