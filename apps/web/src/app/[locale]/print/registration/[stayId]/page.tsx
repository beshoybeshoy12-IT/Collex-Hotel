'use client';

import { useLocale, useTranslations } from 'next-intl';
import { use } from 'react';
import { Ltr, Spinner } from '@/components/ui';
import { useFormat } from '@/lib/format';
import { useApi } from '@/lib/hooks';

export default function RegistrationCardPage({ params }: { params: Promise<{ stayId: string }> }) {
  const { stayId } = use(params);
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const d = useApi<any>(`/v1/front-desk/stays/${stayId}/registration-card`);
  if (!d.data) return <Spinner />;
  const x = d.data;
  return (
    <article className="space-y-6 text-sm">
      <header className="flex items-start justify-between border-b pb-4">
        <div>
          <h1 className="text-xl font-bold">{locale === 'ar' ? x.property.nameAr : x.property.name}</h1>
          <p className="text-slate-600">{x.property.address}</p>
          <p className="text-slate-600"><Ltr>{x.property.phone}</Ltr></p>
        </div>
        <div className="text-end">
          <h2 className="text-lg font-semibold">{t('print.registrationCard')}</h2>
          <p>{t('print.confirmation')}: <Ltr>{x.confirmationNo}</Ltr></p>
        </div>
      </header>
      <dl className="grid grid-cols-2 gap-3">
        <div><dt className="text-slate-500">{t('reservations.arrival')}</dt><dd>{f.date(x.arrival)}</dd></div>
        <div><dt className="text-slate-500">{t('reservations.departure')}</dt><dd>{f.date(x.departure)} · {x.property.checkOutTime}</dd></div>
        <div><dt className="text-slate-500">{t('print.checkedInAt')}</dt><dd>{f.dateTime(x.checkedInAt)}</dd></div>
        <div><dt className="text-slate-500">{t('common.room')}</dt><dd><bdi>{x.rooms.join(' → ')}</bdi></dd></div>
      </dl>
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="p-2 text-start">{t('common.guest')}</th>
            <th className="p-2 text-start">{t('guests.nationality')}</th>
            <th className="p-2 text-start">{t('print.documentsOnFile')}</th>
          </tr>
        </thead>
        <tbody>
          {x.guests.map((g: any, i: number) => (
            <tr key={i} className="border-b">
              <td className="p-2">{g.name}{g.isPrimary ? ' ★' : ''}</td>
              <td className="p-2"><Ltr>{g.nationality ?? '—'}</Ltr></td>
              <td className="p-2">
                {g.documents.length === 0
                  ? '—'
                  : g.documents.map((doc: any, j: number) => (
                      <div key={j}>
                        {t(`enum.documentType.${doc.typeCode}` as any)} · <Ltr>{doc.issuingCountry ?? ''} ••••{doc.last4 ?? ''}</Ltr> · {t(`status.document.${doc.status}` as any)}
                      </div>
                    ))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {x.docException && <p className="rounded border border-amber-300 bg-amber-50 p-2">{t('print.exceptionRecorded')}: {x.docException}</p>}
      <p className="text-slate-700">{locale === 'ar' ? x.property.policiesAr : x.property.policiesEn}</p>
      <p>{t('print.declaration')}</p>
      <div className="grid grid-cols-2 gap-10 pt-10">
        <div className="border-t pt-2 text-center">{t('print.guestSignature')}</div>
        <div className="border-t pt-2 text-center">{t('print.staffSignature')}</div>
      </div>
      <footer className="text-xs text-slate-500">{t('print.printedOn', { date: f.dateTime(new Date()) })}</footer>
    </article>
  );
}
