'use client';

import { CheckCircle2, Eye, RefreshCcw, RotateCw, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { use, useEffect, useState } from 'react';
import { RequirePerm } from '@/components/staff-shell';
import { Alert, Badge, Button, Card, Checkbox, ConfirmButton, Field, Input, Ltr, LtrInput, PageHeader, Spinner, StatusBadge } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { apiBlobUrl } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

/** Secure preview: the scan is streamed through the authorised API into a short-lived in-memory object URL. */
function SecurePreview({ documentId, fileId, mimeType }: { documentId: string; fileId: string; mimeType: string }) {
  const t = useTranslations();
  const err = useErrorMessage();
  const [url, setUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rotation, setRotation] = useState(0);
  const [requested, setRequested] = useState(false);
  useEffect(() => {
    if (!requested) return;
    let revoked = false;
    let objectUrl: string | null = null;
    apiBlobUrl(`/v1/documents/${documentId}/files/${fileId}`)
      .then((r) => {
        objectUrl = r.url;
        if (!revoked) setUrl(r.url);
      })
      .catch((e) => setError(err(e)));
    return () => {
      revoked = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [requested, documentId, fileId]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!requested)
    return (
      <Button variant="secondary" icon={Eye} onClick={() => setRequested(true)}>
        {t('documents.preview')}
      </Button>
    );
  if (error) return <Alert tone="danger">{error}</Alert>;
  if (!url) return <Spinner />;
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-500">{t('documents.previewNote')}</p>
        {mimeType !== 'application/pdf' && <Button size="sm" variant="ghost" icon={RotateCw} onClick={() => setRotation((r) => (r + 90) % 360)}>{t('documents.rotate')}</Button>}
      </div>
      <div className="flex min-h-[260px] items-center justify-center overflow-hidden rounded-lg bg-slate-900/90 p-2" onContextMenu={(e) => e.preventDefault()}>
        {mimeType === 'application/pdf' ? (
          <iframe src={url} title={t('documents.preview')} className="h-[480px] w-full rounded bg-white" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt={t('documents.preview')} className="max-h-[480px] max-w-full object-contain" style={{ transform: `rotate(${rotation}deg)` }} draggable={false} />
        )}
      </div>
    </div>
  );
}

export default function DocumentReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const f = useFormat();
  const s = useRequiredSession();
  const router = useRouter();
  const doc = useApi<any>(`/v1/documents/${id}`);
  const [legible, setLegible] = useState(false);
  const [reason, setReason] = useState('');
  const [edit, setEdit] = useState<any>(null);
  const review = useApiMutation((decision: 'VERIFY' | 'REJECT' | 'REQUEST_REUPLOAD') => ({
    path: `/v1/documents/${id}/review`,
    body: decision === 'VERIFY' ? { decision, legible: true } : { decision, reason },
  }));
  const correct = useApiMutation(() => ({ path: `/v1/documents/${id}`, method: 'PATCH', body: { ...edit, reason: edit.reason } }), { onSuccess: () => setEdit(null) });
  const purge = useApiMutation(() => ({ path: `/v1/documents/${id}`, method: 'DELETE', body: { reason: 'Deleted by authorised staff' } }), { onSuccess: () => router.push('/app/documents') });

  if (doc.isLoading || !doc.data) return <Spinner />;
  const d = doc.data;
  const files = d.files.filter((x: any) => !x.superseded);
  const canVerify = s.can('documents.verify') && !d.purgedAt;
  return (
    <RequirePerm perm="documents.view">
      <PageHeader title={t('documents.reviewTitle')} subtitle={`${t(`enum.documentType.${d.typeCode}` as any)} · ${d.guest.firstName} ${d.guest.lastName}`} actions={<StatusBadge group="document" value={d.status} />} />
      <div className="grid gap-5 lg:grid-cols-5">
        <div className="space-y-4 lg:col-span-3">
          {files.map((file: any) => (
            <Card key={file.id} title={<span className="flex items-center gap-2">{t(`enum.side.${file.side}` as any)} {file.scanStatus === 'SKIPPED' && <Badge tone="warning" icon={ShieldAlert}>{file.scanStatus}</Badge>}</span>}>
              <SecurePreview documentId={id} fileId={file.id} mimeType={file.mimeType} />
            </Card>
          ))}
          {d.files.some((x: any) => x.superseded) && <p className="text-xs text-slate-500">{t('documents.superseded')}: {f.number(d.files.filter((x: any) => x.superseded).length)}</p>}
        </div>
        <div className="space-y-4 lg:col-span-2">
          <Card title={t('documents.compareWith')}>
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <dt className="text-slate-500">{t('reservations.guestName')}</dt><dd>{d.guest.firstName} {d.guest.lastName}</dd>
              <dt className="text-slate-500">{t('guests.nationality')}</dt><dd><Ltr>{d.guest.nationality ?? '—'}</Ltr></dd>
              <dt className="text-slate-500">{t('guests.dateOfBirth')}</dt><dd>{f.date(d.guest.dateOfBirth)}</dd>
              <dt className="text-slate-500">{t('documents.holderName')}</dt><dd>{d.holderName ?? '—'}</dd>
              <dt className="text-slate-500">{t('documents.number')}</dt><dd><Ltr>{d.documentNumber ?? '—'}</Ltr></dd>
              <dt className="text-slate-500">{t('documents.issuingCountry')}</dt><dd><Ltr>{d.issuingCountry ?? '—'}</Ltr></dd>
              <dt className="text-slate-500">{t('documents.issueDate')}</dt><dd>{f.date(d.issueDate)}</dd>
              <dt className="text-slate-500">{t('documents.expiryDate')}</dt><dd>{f.date(d.expiryDate)}</dd>
            </dl>
            <p className="mt-3 text-xs text-slate-500">{t('documents.ocrNote')}</p>
            {canVerify && !edit && <Button size="sm" variant="ghost" className="mt-2" onClick={() => setEdit({ holderName: d.holderName ?? '', documentNumber: d.documentNumber ?? '', issuingCountry: d.issuingCountry ?? '', issueDate: d.issueDate ?? '', expiryDate: d.expiryDate ?? '', reason: '' })}>{t('documents.correct')}</Button>}
            {edit && (
              <div className="mt-3 grid gap-2">
                <Field label={t('documents.holderName')} htmlFor="ce-hn"><Input id="ce-hn" value={edit.holderName} onChange={(e) => setEdit({ ...edit, holderName: e.target.value })} /></Field>
                <Field label={t('documents.number')} htmlFor="ce-no"><LtrInput id="ce-no" value={edit.documentNumber} onChange={(e) => setEdit({ ...edit, documentNumber: e.target.value })} /></Field>
                <Field label={t('documents.issuingCountry')} htmlFor="ce-ic"><LtrInput id="ce-ic" maxLength={2} value={edit.issuingCountry} onChange={(e) => setEdit({ ...edit, issuingCountry: e.target.value.toUpperCase() })} /></Field>
                <Field label={t('documents.issueDate')} htmlFor="ce-id"><Input id="ce-id" type="date" value={edit.issueDate} onChange={(e) => setEdit({ ...edit, issueDate: e.target.value })} /></Field>
                <Field label={t('documents.expiryDate')} htmlFor="ce-ed"><Input id="ce-ed" type="date" value={edit.expiryDate} onChange={(e) => setEdit({ ...edit, expiryDate: e.target.value })} /></Field>
                <Field label={t('documents.correctionReason')} htmlFor="ce-r" required><Input id="ce-r" value={edit.reason} onChange={(e) => setEdit({ ...edit, reason: e.target.value })} /></Field>
                <div className="flex gap-2">
                  <Button size="sm" loading={correct.isPending} disabled={edit.reason.length < 3} onClick={() => correct.mutate()}>{t('common.save')}</Button>
                  <Button size="sm" variant="secondary" onClick={() => setEdit(null)}>{t('common.cancel')}</Button>
                </div>
              </div>
            )}
          </Card>
          {canVerify && (
            <Card title={t('documents.review')}>
              <div className="space-y-3">
                <Checkbox label={t('documents.legibleConfirm')} checked={legible} onChange={(e) => setLegible(e.target.checked)} />
                <Button icon={CheckCircle2} disabled={!legible || !files.length} loading={review.isPending && review.variables === 'VERIFY'} onClick={() => review.mutate('VERIFY')}>{t('documents.verify')}</Button>
                <Field label={t('documents.rejectReason')} htmlFor="rv-r"><Input id="rv-r" value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" icon={RefreshCcw} disabled={reason.trim().length < 3} onClick={() => review.mutate('REQUEST_REUPLOAD')}>{t('documents.requestReupload')}</Button>
                  <Button variant="danger" icon={XCircle} disabled={reason.trim().length < 3} onClick={() => review.mutate('REJECT')}>{t('documents.reject')}</Button>
                </div>
              </div>
            </Card>
          )}
          <Card title={t('documents.events')}>
            <ol className="space-y-1 text-xs text-slate-600">
              {d.events.map((e: any) => (
                <li key={e.id}>{f.dateTime(e.createdAt)} · <Ltr>{e.action}</Ltr>{e.details?.reason ? ` · ${e.details.reason}` : ''}</li>
              ))}
            </ol>
          </Card>
          {s.can('documents.delete') && !d.purgedAt && (
            <ConfirmButton size="sm" icon={Trash2} message={t('documents.purgeConfirm')} onConfirm={() => purge.mutate()}>{t('documents.purge')}</ConfirmButton>
          )}
        </div>
      </div>
    </RequirePerm>
  );
}
