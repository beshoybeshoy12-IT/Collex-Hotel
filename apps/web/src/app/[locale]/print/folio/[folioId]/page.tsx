'use client';

import { useLocale, useTranslations } from 'next-intl';
import { use } from 'react';
import { Ltr, Spinner } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function FolioPrintPage({ params }: { params: Promise<{ folioId: string }> }) {
  const { folioId } = use(params);
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const d = useApi<any>(`/v1/finance/folios/${folioId}/print`);
  if (!d.data) return <Spinner />;
  const x = d.data;
  const money = (v: any) => f.money(v, x.folio.currency);
  const latest = x.invoices[0];
  const nonZero = (v: string) => Number(v) !== 0;
  return (
    <article className="space-y-6 text-sm">
      <header className="flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold">{locale === 'ar' ? x.property.nameAr : x.property.name}</h1>
          <p className="text-slate-600">{x.property.address}</p>
          <p className="text-slate-600"><Ltr>{x.property.phone}</Ltr> · <Ltr>{x.property.email}</Ltr></p>
        </div>
        <div className="text-end">
          <h2 className="text-lg font-semibold">{latest ? `${t(latest.kind === 'RECEIPT' ? 'folio.receipt' : 'folio.taxInvoice')} #${f.number(latest.number)}` : t('folio.title')}</h2>
          <p>{t('folio.number', { number: x.folio.number })}</p>
          {latest && <p>{t('folio.issuedAt')}: {f.dateTime(latest.issuedAt)}</p>}
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-slate-500">{t('folio.payer')}</dt><dd>{x.folio.payerName}</dd></div>
        <div><dt className="text-slate-500">{t('print.confirmation')}</dt><dd><Ltr>{x.reservation.confirmationNo}</Ltr></dd></div>
        <div><dt className="text-slate-500">{t('reservations.arrival')}</dt><dd>{f.date(x.reservation.arrival)}</dd></div>
        <div><dt className="text-slate-500">{t('reservations.departure')}</dt><dd>{f.date(x.reservation.departure)}</dd></div>
      </dl>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="p-2 text-start">{t('common.date')}</th>
            <th className="p-2 text-start">{t('folio.type')}</th>
            <th className="p-2 text-start">{t('folio.description')}</th>
            <th className="p-2 text-end">{t('common.amount')}</th>
          </tr>
        </thead>
        <tbody>
          {x.entries.map((e: any) => (
            <tr key={e.id} className="border-b">
              <td className="p-2">{f.date(e.businessDate)}</td>
              <td className="p-2">{t(`enum.entryType.${e.type}` as any)}</td>
              <td className="p-2">{e.description}</td>
              <td className="p-2 text-end tabular-nums">{money(e.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <dl className="ms-auto w-full max-w-xs space-y-1">
        <div className="flex justify-between"><dt>{t('public.subtotal')}</dt><dd>{money(x.totals.room)}</dd></div>
        <div className="flex justify-between"><dt>{t('services.title')}</dt><dd>{money(x.totals.services)}</dd></div>
        {nonZero(x.totals.serviceCharge) && <div className="flex justify-between"><dt>{t('public.serviceCharge')}</dt><dd>{money(x.totals.serviceCharge)}</dd></div>}
        <div className="flex justify-between"><dt>{t('public.taxes')} ({f.number(x.property.taxPercent)}%)</dt><dd>{money(x.totals.tax)}</dd></div>
        {nonZero(x.totals.adjustments) && <div className="flex justify-between"><dt>{t('enum.entryType.ADJUSTMENT')}</dt><dd>{money(x.totals.adjustments)}</dd></div>}
        <div className="flex justify-between border-t pt-1 font-semibold"><dt>{t('folio.charges')}</dt><dd>{money(x.totals.charges)}</dd></div>
        <div className="flex justify-between"><dt>{t('folio.payments')}</dt><dd>−{money(x.totals.payments)}</dd></div>
        {nonZero(x.totals.refunds) && <div className="flex justify-between"><dt>{t('folio.refunds')}</dt><dd>{money(x.totals.refunds)}</dd></div>}
        <div className="flex justify-between border-t pt-1 text-base font-bold"><dt>{t('folio.balance')}</dt><dd>{money(x.totals.balance)}</dd></div>
      </dl>
      <div className="pt-10"><div className="w-60 border-t pt-2 text-center">{t('folio.signature')}</div></div>
      <footer className="text-xs text-slate-500">{t('print.printedOn', { date: f.dateTime(new Date()) })}</footer>
    </article>
  );
}
