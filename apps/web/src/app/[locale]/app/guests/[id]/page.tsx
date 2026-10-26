'use client';

import { Download, Lock, ShieldOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { use, useEffect, useState } from 'react';
import { DocumentUploader } from '@/components/document-uploader';
import { GuestFields, toGuestPayload, type GuestValues } from '@/components/guest-fields';
import { Alert, Badge, Button, Card, ConfirmButton, Ltr, PageHeader, Spinner, StatusBadge, Table, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { apiDownload } from '@/lib/api';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

export default function GuestDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const g = useApi<any>(`/v1/guests/${id}`);
  const [form, setForm] = useState<GuestValues | null>(null);
  useEffect(() => {
    if (g.data && !form)
      setForm({
        firstName: g.data.firstName, lastName: g.data.lastName, email: g.data.email ?? '', phone: g.data.phone ?? '', nationality: g.data.nationality ?? '',
        dateOfBirth: g.data.dateOfBirth ?? '', preferredLocale: g.data.preferredLocale, vip: g.data.vip, preferences: g.data.preferences ?? {},
      });
  }, [g.data, form]);
  const save = useApiMutation(() => ({ path: `/v1/guests/${id}`, method: 'PUT', body: toGuestPayload(form!) }));
  const hold = useApiMutation((legalHold: boolean) => ({ path: `/v1/guests/${id}/legal-hold`, body: { legalHold, reason: 'Set by authorised staff' } }));
  const anonymize = useApiMutation(() => ({ path: `/v1/guests/${id}/anonymize`, body: { reason: 'Data subject erasure request' } }), { success: t('guests.anonymized') });
  if (g.isLoading || !g.data || !form) return <Spinner />;
  const x = g.data;
  const readOnly = !!x.anonymizedAt || !s.can('guests.write');
  return (
    <>
      <PageHeader
        title={<span className="flex items-center gap-2">{x.firstName} {x.lastName} {x.vip && <Badge tone="warning">{t('frontDesk.vip')}</Badge>} {x.legalHold && <Badge tone="danger" icon={Lock}>{t('guests.legalHold')}</Badge>}</span>}
      />
      {x.anonymizedAt && <Alert tone="info">{t('guests.anonymized')}</Alert>}
      <div className="grid gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card title={t('public.guestDetails')} actions={!readOnly && <Button size="sm" loading={save.isPending} onClick={() => save.mutate()}>{t('common.save')}</Button>}>
            <fieldset disabled={readOnly}>
              <GuestFields value={form} onChange={setForm} />
            </fieldset>
          </Card>
          <Card title={t('documents.title')}>
            {x.documents.length === 0 ? (
              <p className="text-sm text-slate-600">{t('common.emptyBody')}</p>
            ) : (
              <Table head={[t('documents.type'), t('documents.masked'), t('documents.expiryDate'), t('common.status'), '']}>
                {x.documents.map((d: any) => (
                  <tr key={d.id}>
                    <Td>{t(`enum.documentType.${d.typeCode}` as any)} {d.uploadedByGuest && <Badge>{t('services.fromGuest')}</Badge>}</Td>
                    <Td><Ltr>{d.documentNumberMasked || '—'}</Ltr></Td>
                    <Td>{f.date(d.expiryDate)}</Td>
                    <Td><StatusBadge group="document" value={d.purgedAt ? 'EXPIRED' : d.status} /></Td>
                    <Td>{s.can('documents.view') && !d.purgedAt && <Link href={`/app/documents/${d.id}`} className="text-sm text-brand-700 hover:underline">{t('documents.review')}</Link>}</Td>
                  </tr>
                ))}
              </Table>
            )}
            {s.can('documents.upload') && !x.anonymizedAt && (
              <div className="mt-4 rounded-lg border border-slate-200 p-3">
                <h3 className="mb-2 font-semibold">{t('documents.upload')}</h3>
                <DocumentUploader guestId={id} mode="staff" onUploaded={() => g.refetch()} />
              </div>
            )}
          </Card>
        </div>
        <div className="space-y-5">
          <Card title={t('guests.stays')}>
            <ul className="space-y-2 text-sm">
              {x.reservations.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between gap-2">
                  <Link href={`/app/reservations/${r.id}`} className="text-brand-700 hover:underline"><Ltr>{r.confirmationNo}</Ltr></Link>
                  <span className="text-xs text-slate-500">{f.date(r.arrivalDate)}</span>
                  <StatusBadge group="reservation" value={r.status} />
                </li>
              ))}
            </ul>
          </Card>
          {s.can('guests.erase') && !x.anonymizedAt && (
            <Card title={t('guests.privacy')}>
              <div className="flex flex-col gap-2">
                <Button size="sm" variant="secondary" icon={Download} onClick={() => apiDownload(`/v1/guests/${id}/export`, `guest-${id}.json`)}>{t('guests.export')}</Button>
                <Button size="sm" variant="secondary" icon={Lock} onClick={() => hold.mutate(!x.legalHold)}>{x.legalHold ? t('guests.releaseLegalHold') : t('guests.setLegalHold')}</Button>
                <ConfirmButton size="sm" icon={ShieldOff} message={t('guests.anonymizeConfirm')} onConfirm={() => anonymize.mutate()}>{t('guests.anonymize')}</ConfirmButton>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
