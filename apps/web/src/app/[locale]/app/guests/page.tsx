'use client';

import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { emptyGuest, GuestFields, toGuestPayload } from '@/components/guest-fields';
import { Badge, Button, Dialog, EmptyState, Input, Ltr, PageHeader, Pagination, Spinner, Table, Td } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { qs } from '@/lib/api';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

export default function GuestsPage() {
  const t = useTranslations();
  const s = useRequiredSession();
  const router = useRouter();
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [open, setOpen] = useState(false);
  const [guest, setGuest] = useState(emptyGuest());
  const list = useApi<any>(`/v1/guests${qs({ q, page, pageSize: 25 })}`);
  const create = useApiMutation(() => ({ path: '/v1/guests', body: toGuestPayload(guest) }), { onSuccess: (g: any) => router.push(`/app/guests/${g.id}`) });
  return (
    <>
      <PageHeader title={t('guests.title')} actions={s.can('guests.write') && <Button icon={Plus} onClick={() => setOpen(true)}>{t('guests.new')}</Button>} />
      <div className="relative mb-4 max-w-sm">
        <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
        <Input aria-label={t('common.search')} className="ps-9" placeholder={t('guests.searchPlaceholder')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
      </div>
      {list.isLoading ? <Spinner /> : !list.data?.items.length ? <EmptyState /> : (
        <>
          <Table head={[t('reservations.guestName'), t('guests.email'), t('guests.phone'), t('guests.nationality'), '']}>
            {list.data.items.map((g: any) => (
              <tr key={g.id}>
                <Td><Link href={`/app/guests/${g.id}`} className="font-medium text-brand-700 hover:underline">{g.firstName} {g.lastName}</Link></Td>
                <Td><Ltr>{g.email ?? '—'}</Ltr></Td>
                <Td><Ltr>{g.phone ?? '—'}</Ltr></Td>
                <Td><Ltr>{g.nationality ?? '—'}</Ltr></Td>
                <Td>{g.vip && <Badge tone="warning">{t('frontDesk.vip')}</Badge>}</Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
      <Dialog open={open} onClose={() => setOpen(false)} title={t('guests.new')} wide footer={<><Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button><Button loading={create.isPending} disabled={!guest.firstName || !guest.lastName} onClick={() => create.mutate()}>{t('common.create')}</Button></>}>
        <GuestFields value={guest} onChange={setGuest} />
      </Dialog>
    </>
  );
}
