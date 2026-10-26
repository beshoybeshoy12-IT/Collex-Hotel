'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CreditCard, LogOut, Send } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { DocumentUploader } from '@/components/document-uploader';
import { PublicHeader } from '@/components/public-header';
import { Alert, Badge, Button, Card, ConfirmButton, Field, Input, Ltr, LtrInput, Select, Spinner, StatusBadge, Table, Td, Textarea } from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';

const SERVICE_CATEGORIES = ['AMENITIES', 'HOUSEKEEPING', 'ROOM_SERVICE', 'LAUNDRY', 'MAINTENANCE', 'WAKE_UP_CALL', 'TRANSPORT', 'LUGGAGE', 'EXTRA_BED', 'COMPLAINT', 'OTHER'] as const;

function Lookup({ onFound }: { onFound(): void }) {
  const t = useTranslations();
  const err = useErrorMessage();
  const [confirmationNo, setNo] = useState('');
  const [lastName, setLast] = useState('');
  const m = useMutation({ mutationFn: () => api('/v1/public/guest/lookup', { method: 'POST', propertyId: null, body: { confirmationNo, lastName } }), onSuccess: onFound });
  return (
    <Card title={t('portal.lookupTitle')} className="mx-auto max-w-md">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate();
        }}
      >
        <p className="text-sm text-slate-600">{t('portal.lookupHelp')}</p>
        <Field label={t('public.confirmationNumber')} htmlFor="lk-no" required>
          <LtrInput id="lk-no" value={confirmationNo} onChange={(e) => setNo(e.target.value.toUpperCase())} required autoComplete="off" />
        </Field>
        <Field label={t('portal.lastName')} htmlFor="lk-ln" required>
          <Input id="lk-ln" value={lastName} onChange={(e) => setLast(e.target.value)} required autoComplete="family-name" />
        </Field>
        {m.error && <Alert tone="danger">{err(m.error)}</Alert>}
        <Button type="submit" loading={m.isPending}>{t('portal.lookup')}</Button>
      </form>
    </Card>
  );
}

export default function PortalPage() {
  const t = useTranslations();
  const locale = useLocale();
  const ar = locale === 'ar';
  const err = useErrorMessage();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['guest-reservation'], queryFn: () => api<any>('/v1/public/guest/reservation', { propertyId: null }), retry: false });
  const r = q.data;
  const f = useFormat();
  const money = (v: any) => f.money(v, r?.currency);
  const refresh = () => qc.invalidateQueries({ queryKey: ['guest-reservation'] });
  const [requestCat, setRequestCat] = useState<(typeof SERVICE_CATEGORIES)[number]>('AMENITIES');
  const [requestText, setRequestText] = useState('');
  const [special, setSpecial] = useState<string | null>(null);

  const simulate = useMutation({ mutationFn: () => api('/v1/public/guest/dev-simulate-payment', { method: 'POST', propertyId: null }), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: () => api<any>('/v1/public/guest/cancel', { method: 'POST', propertyId: null, body: { reason: 'Guest request' } }), onSuccess: refresh });
  const sendRequest = useMutation({
    mutationFn: () => api('/v1/public/guest/requests', { method: 'POST', propertyId: null, body: { category: requestCat, description: requestText } }),
    onSuccess: () => {
      setRequestText('');
      refresh();
    },
  });
  const saveSpecial = useMutation({ mutationFn: () => api('/v1/public/guest/reservation', { method: 'PATCH', propertyId: null, body: { specialRequests: special ?? '' } }), onSuccess: refresh });
  const logout = useMutation({ mutationFn: () => api('/v1/public/guest/logout', { method: 'POST', propertyId: null }), onSuccess: () => qc.removeQueries({ queryKey: ['guest-reservation'] }) });

  const needsLookup = q.error instanceof ApiError && q.error.status === 401;
  return (
    <>
      <PublicHeader />
      <main id="main" className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-bold">{t('portal.title')}</h1>
        {q.isLoading && <Spinner />}
        {(needsLookup || (!r && !q.isLoading)) && <Lookup onFound={refresh} />}
        {r && (
          <>
            <Card
              title={
                <span className="flex flex-wrap items-center gap-2">
                  {t('public.confirmationNumber')}: <Ltr>{r.confirmationNo}</Ltr> <StatusBadge group="reservation" value={r.status} />
                </span>
              }
              actions={
                <Button size="sm" variant="ghost" icon={LogOut} onClick={() => logout.mutate()}>
                  {t('portal.signOut')}
                </Button>
              }
            >
              {r.status === 'AWAITING_PAYMENT' && (
                <div className="mb-4 space-y-2">
                  <Alert tone="warning">{t('public.paymentRequired', { time: f.dateTime(r.holdExpiresAt) })}</Alert>
                  {r.pendingPayment?.provider === 'mock' && (
                    <div className="rounded-lg border border-dashed border-amber-400 p-3">
                      <p className="mb-2 text-xs text-slate-600">
                        <Badge tone="warning">{t('common.devOnly')}</Badge> {t('portal.simulateHelp')}
                      </p>
                      <Button size="sm" icon={CreditCard} loading={simulate.isPending} onClick={() => simulate.mutate()}>
                        {t('portal.simulatePayment')} · {money(r.pendingPayment.amount)}
                      </Button>
                    </div>
                  )}
                </div>
              )}
              <dl className="grid gap-3 text-sm sm:grid-cols-4">
                <div><dt className="text-slate-500">{t('public.arrival')}</dt><dd className="font-medium">{f.date(r.arrival)}</dd></div>
                <div><dt className="text-slate-500">{t('public.departure')}</dt><dd className="font-medium">{f.date(r.departure)}</dd></div>
                <div><dt className="text-slate-500">{t('common.guests')}</dt><dd className="font-medium">{f.number(r.adults)} {t('common.adults')} · {f.number(r.children)} {t('common.children')}</dd></div>
                <div><dt className="text-slate-500">{t('public.grandTotal')}</dt><dd className="font-medium">{money(r.grandTotal)}</dd></div>
              </dl>
              <ul className="mt-3 text-sm text-slate-700">
                {r.rooms.map((room: any) => (
                  <li key={room.id}>• {ar ? room.category?.nameAr : room.category?.nameEn} ({f.number(room.adults)} {t('common.adults')})</li>
                ))}
              </ul>
              <p className="mt-3 text-sm text-slate-600">
                <span className="font-medium">{t('portal.policy')}: </span>
                {r.policy.refundable ? t('public.refundable', { hours: r.policy.freeCancellationHours }) : t('public.nonRefundable')}
              </p>
              {['CONFIRMED', 'PENDING', 'AWAITING_PAYMENT'].includes(r.status) && (
                <div className="mt-4">
                  <ConfirmButton size="sm" message={t('portal.cancelConfirm')} onConfirm={() => cancel.mutate()} loading={cancel.isPending}>
                    {t('portal.cancelBooking')}
                  </ConfirmButton>
                </div>
              )}
              {cancel.isSuccess && <Alert tone="info">{t('portal.cancelled')}</Alert>}
              {(cancel.error || simulate.error) && <Alert tone="danger">{err(cancel.error ?? simulate.error)}</Alert>}
            </Card>

            {!['CANCELLED', 'EXPIRED', 'NO_SHOW', 'CHECKED_OUT'].includes(r.status) && (
              <Card title={t('portal.documents')}>
                <p className="mb-3 text-sm text-slate-600">{t('portal.documentsHelp')}</p>
                {r.documentRequirements.satisfied ? (
                  <Alert tone="success">{t('portal.documentsComplete')}</Alert>
                ) : (
                  <div className="space-y-6">
                    {r.documentRequirements.guests.map((g: any) => (
                      <div key={g.guestId} className="rounded-lg border border-slate-200 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-semibold">{t('portal.uploadFor', { name: g.name })}</h3>
                          <StatusBadge group="requirement" value={g.state} />
                        </div>
                        {r.documents
                          .filter((d: any) => d.guestId === g.guestId && d.rejectionReason)
                          .map((d: any) => (
                            <Alert key={d.id} tone="warning">{d.rejectionReason}</Alert>
                          ))}
                        {['MISSING', 'REJECTED', 'EXPIRED', 'REUPLOAD_REQUESTED'].includes(g.state) && <DocumentUploader guestId={g.guestId} mode="guest" onUploaded={refresh} />}
                      </div>
                    ))}
                  </div>
                )}
              </Card>
            )}

            <Card title={t('portal.requests')}>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Field label={t('public.specialRequests')} htmlFor="pt-sr">
                    <Textarea id="pt-sr" value={special ?? r.specialRequests} onChange={(e) => setSpecial(e.target.value)} />
                  </Field>
                  <Button size="sm" variant="secondary" loading={saveSpecial.isPending} onClick={() => saveSpecial.mutate()} disabled={special === null}>
                    {t('portal.updateRequests')}
                  </Button>
                </div>
                {['CONFIRMED', 'CHECKED_IN'].includes(r.status) && (
                  <form
                    className="space-y-2"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendRequest.mutate();
                    }}
                  >
                    <Field label={t('services.category')} htmlFor="pt-cat">
                      <Select id="pt-cat" value={requestCat} onChange={(e) => setRequestCat(e.target.value as any)}>
                        {SERVICE_CATEGORIES.map((c) => (
                          <option key={c} value={c}>{t(`enum.serviceCategory.${c}`)}</option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t('services.description')} htmlFor="pt-desc" required>
                      <Textarea id="pt-desc" value={requestText} onChange={(e) => setRequestText(e.target.value)} required minLength={2} />
                    </Field>
                    <Button type="submit" size="sm" icon={Send} loading={sendRequest.isPending} disabled={requestText.trim().length < 2}>
                      {t('portal.send')}
                    </Button>
                    {sendRequest.isSuccess && <Alert tone="success">{t('portal.requestSent')}</Alert>}
                    {sendRequest.error && <Alert tone="danger">{err(sendRequest.error)}</Alert>}
                  </form>
                )}
              </div>
              {r.requests.length > 0 && (
                <ul className="mt-4 divide-y divide-slate-100 text-sm">
                  {r.requests.map((x: any) => (
                    <li key={x.id} className="flex items-center justify-between gap-2 py-2">
                      <span>{t(`enum.serviceCategory.${x.category}` as any)} — {x.description}</span>
                      <StatusBadge group="service" value={x.status} />
                    </li>
                  ))}
                </ul>
              )}
            </Card>

            <Card title={t('portal.billing')} actions={<span className="text-sm font-semibold">{t('portal.balance')}: {money(r.balances.balance)}</span>}>
              {r.folios.flatMap((fo: any) => fo.entries).length === 0 ? (
                <p className="text-sm text-slate-600">{t('common.emptyBody')}</p>
              ) : (
                <Table head={[t('common.date'), t('folio.type'), t('common.amount')]}>
                  {r.folios.flatMap((fo: any) =>
                    fo.entries.map((e: any) => (
                      <tr key={e.id}>
                        <Td>{f.date(e.businessDate)}</Td>
                        <Td>{t(`enum.entryType.${e.type}` as any)}</Td>
                        <Td>{money(e.amount)}</Td>
                      </tr>
                    )),
                  )}
                </Table>
              )}
            </Card>
          </>
        )}
      </main>
    </>
  );
}
