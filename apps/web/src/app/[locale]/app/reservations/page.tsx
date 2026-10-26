'use client';

import { Plus, Search } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ReservationStatus } from '@collex/shared';
import { Button, EmptyState, Field, Input, PageHeader, Pagination, Select, Spinner, StatusBadge, Table, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { qs } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

export default function ReservationsPage() {
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  const [arrivalFrom, setFrom] = useState('');
  const [arrivalTo, setTo] = useState('');
  const [page, setPage] = useState(1);
  const list = useApi<any>(`/v1/reservations${qs({ q, status, arrivalFrom, arrivalTo, page, pageSize: 25 })}`);
  return (
    <>
      <PageHeader
        title={t('reservations.title')}
        actions={s.can('reservations.write') && <Link href="/app/reservations/new"><Button icon={Plus} tabIndex={-1}>{t('reservations.new')}</Button></Link>}
      />
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label={t('common.search')} htmlFor="rs-q">
          <div className="relative">
            <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
            <Input id="rs-q" className="ps-9" placeholder={t('reservations.searchPlaceholder')} value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} />
          </div>
        </Field>
        <Field label={t('common.status')} htmlFor="rs-st">
          <Select id="rs-st" value={status} onChange={(e) => { setStatus(e.target.value); setPage(1); }}>
            <option value="">{t('common.all')}</option>
            {ReservationStatus.map((x) => <option key={x} value={x}>{t(`status.reservation.${x}`)}</option>)}
          </Select>
        </Field>
        <Field label={`${t('reservations.arrival')} — ${t('common.from')}`} htmlFor="rs-from">
          <Input id="rs-from" type="date" value={arrivalFrom} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label={`${t('reservations.arrival')} — ${t('common.to')}`} htmlFor="rs-to">
          <Input id="rs-to" type="date" value={arrivalTo} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {list.isLoading ? (
        <Spinner />
      ) : !list.data?.items.length ? (
        <EmptyState />
      ) : (
        <>
          <Table head={[t('reservations.confirmationNo'), t('reservations.guestName'), t('reservations.arrival'), t('reservations.departure'), t('common.rooms'), t('reservations.source'), t('common.total'), t('common.status')]}>
            {list.data.items.map((r: any) => (
              <tr key={r.id} className="hover:bg-slate-50">
                <Td><Link href={`/app/reservations/${r.id}`} className="font-mono text-brand-700 hover:underline"><bdi>{r.confirmationNo}</bdi></Link></Td>
                <Td>{r.guestName}{r.groupName && <span className="block text-xs text-slate-500">{r.groupName}</span>}</Td>
                <Td>{f.date(r.arrival)}</Td>
                <Td>{f.date(r.departure)}</Td>
                <Td>{f.number(r.rooms)}{r.roomNumbers.length > 0 && <span className="ms-1 text-xs text-slate-500">(<bdi>{r.roomNumbers.join(', ')}</bdi>)</span>}</Td>
                <Td>{t(`enum.source.${r.source}` as any)}</Td>
                <Td className="tabular-nums">{f.money(r.grandTotal, r.currency)}</Td>
                <Td><StatusBadge group="reservation" value={r.status} /></Td>
              </tr>
            ))}
          </Table>
          <Pagination page={page} pageSize={25} total={list.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}
