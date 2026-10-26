'use client';

import { BedDouble, Coins, Download, Percent, TrendingUp } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { RequirePerm } from '@/components/staff-shell';
import { Button, Card, Field, Input, PageHeader, Spinner, Stat, StatusBadge, Table, Tabs, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { apiDownload, qs } from '@/lib/api';
import { addDaysIso, businessToday, useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

type Tab = 'performance' | 'bookings' | 'operations' | 'financial';

export default function ReportsPage() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const s = useRequiredSession();
  const today = businessToday(s.property?.timezone);
  const [from, setFrom] = useState(addDaysIso(today, -6));
  const [to, setTo] = useState(addDaysIso(today, 7));
  const [tab, setTab] = useState<Tab>('performance');
  const range = qs({ from, to });
  const data = useApi<any>(from <= to ? `/v1/reports/${tab}${range}` : null);
  const rtl = locale === 'ar';
  const exportCsv = () => apiDownload(`/v1/reports/${tab}${range}&format=csv`, `${tab}-${from}-${to}.csv`);

  return (
    <RequirePerm perm="reports.read">
      <PageHeader title={t('reports.title')} actions={<Button variant="secondary" icon={Download} onClick={exportCsv}>{t('common.exportCsv')}</Button>} />
      <div className="mb-4 grid max-w-md grid-cols-2 gap-3">
        <Field label={t('common.from')} htmlFor="rp-f"><Input id="rp-f" type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field>
        <Field label={t('common.to')} htmlFor="rp-t"><Input id="rp-t" type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'performance', label: t('reports.performance') },
          { id: 'bookings', label: t('reports.bookings') },
          { id: 'operations', label: t('reports.operations') },
          ...(s.can('reports.financial') ? [{ id: 'financial' as Tab, label: t('reports.financial') }] : []),
        ]}
      />
      {data.isLoading || !data.data ? (
        <Spinner />
      ) : tab === 'performance' ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('reports.occupancy')} value={f.percent(data.data.totals.occupancyPercent)} icon={Percent} hint={`${f.number(data.data.totals.occupiedRoomNights)} / ${f.number(data.data.totals.availableRoomNights)}`} />
            <Stat label={t('reports.adr')} value={f.money(data.data.totals.adr)} icon={TrendingUp} />
            <Stat label={t('reports.revpar')} value={f.money(data.data.totals.revpar)} icon={BedDouble} />
            <Stat label={t('reports.roomRevenue')} value={f.money(data.data.totals.roomRevenue)} icon={Coins} />
          </div>
          <p className="text-xs text-slate-500">{t('reports.formulas')}</p>
          <Card title={t('reports.occupancy')}>
            <div className="h-72" dir="ltr" role="img" aria-label={t('reports.occupancy')}>
              <ResponsiveContainer>
                <LineChart data={data.data.daily.map((d: any) => ({ ...d, occupancyPercent: Number(d.occupancyPercent), adr: Number(d.adr), label: f.date(d.date, { day: 'numeric', month: 'short' }) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" reversed={rtl} />
                  <YAxis yAxisId="l" orientation={rtl ? 'right' : 'left'} unit="%" />
                  <YAxis yAxisId="r" orientation={rtl ? 'left' : 'right'} />
                  <Tooltip />
                  <Legend />
                  <Line yAxisId="l" type="monotone" dataKey="occupancyPercent" name={t('reports.occupancy')} stroke="#0f6f66" strokeWidth={2} />
                  <Line yAxisId="r" type="monotone" dataKey="adr" name={t('reports.adr')} stroke="#b45309" strokeDasharray="5 3" strokeWidth={2} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <Table head={[t('common.date'), t('reports.availableRoomNights'), t('reports.occupiedRoomNights'), t('reports.occupancy'), t('reports.roomRevenue'), t('reports.adr'), t('reports.revpar')]}>
            {data.data.daily.map((d: any) => (
              <tr key={d.date}>
                <Td>{f.date(d.date)}</Td><Td>{f.number(d.available)}</Td><Td>{f.number(d.occupied)}</Td><Td>{f.percent(d.occupancyPercent)}</Td><Td>{f.money(d.revenue)}</Td><Td>{f.money(d.adr)}</Td><Td>{f.money(d.revpar)}</Td>
              </tr>
            ))}
          </Table>
        </div>
      ) : tab === 'bookings' ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('reports.bookings')} value={f.number(data.data.total)} />
            <Stat label={t('dashboard.arrivals')} value={f.number(data.data.arrivals)} />
            <Stat label={t('reports.cancellationRate')} value={f.percent(data.data.cancellationRatePercent)} />
            <Stat label={t('reports.noShows')} value={f.number(data.data.noShows)} />
          </div>
          <Card title={t('reports.byCategory')}>
            <div className="h-64" dir="ltr" role="img" aria-label={t('reports.byCategory')}>
              <ResponsiveContainer>
                <BarChart data={data.data.byCategory.map((c: any) => ({ name: locale === 'ar' ? c.nameAr : c.nameEn, bookings: c.bookings, revenue: Number(c.revenue) }))}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" reversed={rtl} />
                  <YAxis orientation={rtl ? 'right' : 'left'} />
                  <Tooltip />
                  <Bar dataKey="bookings" name={t('reports.count')} fill="#14857a" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>
          <div className="grid gap-5 md:grid-cols-2">
            <Card title={t('reports.bySource')}>
              <ul className="space-y-1 text-sm">{Object.entries(data.data.bySource).map(([k, v]) => <li key={k} className="flex justify-between"><span>{t(`enum.source.${k}` as any)}</span><span>{f.number(v as number)}</span></li>)}</ul>
            </Card>
            <Card title={t('common.status')}>
              <ul className="space-y-1 text-sm">{Object.entries(data.data.byStatus).map(([k, v]) => <li key={k} className="flex justify-between"><StatusBadge group="reservation" value={k} /><span>{f.number(v as number)}</span></li>)}</ul>
            </Card>
          </div>
        </div>
      ) : tab === 'operations' ? (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label={t('reports.tasksCompleted')} value={f.number(data.data.housekeeping.tasksCompleted)} />
            <Stat label={t('reports.incidents')} value={f.number(data.data.maintenance.incidents)} hint={`${t('reports.avgResolution')}: ${f.number(data.data.maintenance.avgResolutionHours)}`} />
            <Stat label={t('reports.oooNights')} value={f.number(data.data.maintenance.outOfOrderRoomNights)} />
            <Stat label={t('reports.serviceRequests')} value={f.number(data.data.services.requests)} hint={`${t('reports.avgResponse')}: ${f.number(data.data.services.avgResponseMinutes)}`} />
          </div>
          <Table head={[t('reports.staff'), t('reports.tasksCompleted'), t('reports.avgMinutes')]}>
            {data.data.housekeeping.perStaff.map((p: any, i: number) => <tr key={i}><Td>{p.name}</Td><Td>{f.number(p.tasks)}</Td><Td>{f.number(p.avgMinutes)}</Td></tr>)}
          </Table>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid gap-5 md:grid-cols-2">
            <Card title={t('reports.paymentsByMethod')}>
              <ul className="space-y-1 text-sm">
                {data.data.paymentsByMethod.map((p: any) => (
                  <li key={`${p.method}-${p.status}`} className="flex items-center justify-between gap-2">
                    <span>{t(`enum.paymentMethod.${p.method}` as any)} <StatusBadge group="payment" value={p.status} /></span>
                    <span>{f.number(p.count)} · {f.money(p.amount)}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-sm">{t('folio.refunds')}: {f.number(data.data.refunds.count)} · {f.money(data.data.refunds.amount)}</p>
            </Card>
            <Card title={t('reports.revenueByType')}>
              <ul className="space-y-1 text-sm">{data.data.revenueByType.map((r: any) => <li key={r.type} className="flex justify-between"><span>{t(`enum.entryType.${r.type}` as any)}</span><span>{f.money(r.amount)}</span></li>)}</ul>
            </Card>
          </div>
          <Card title={`${t('reports.outstanding')} · ${f.money(data.data.outstandingTotal)}`}>
            <Table head={[t('reservations.confirmationNo'), t('reservations.guestName'), t('common.status'), t('folio.balance')]}>
              {data.data.outstanding.map((o: any) => (
                <tr key={o.folioId}>
                  <Td><Link href={`/app/reservations/${o.reservationId}`} className="text-brand-700 hover:underline"><bdi className="font-mono">{o.confirmationNo}</bdi></Link></Td>
                  <Td>{o.guestName}</Td>
                  <Td><StatusBadge group="reservation" value={o.reservationStatus} /></Td>
                  <Td>{f.money(o.balance)}</Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      )}
    </RequirePerm>
  );
}
