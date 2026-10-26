'use client';

import { BedDouble, CalendarDays, CheckCircle2, KeyRound, Plus, Printer, Wand2, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { use, useState } from 'react';
import { AssignRoomDialog, CheckInDialog } from '@/components/frontdesk';
import { FolioPanel } from '@/components/folio-panel';
import { DocumentUploader } from '@/components/document-uploader';
import { emptyGuest, GuestFields, toGuestPayload } from '@/components/guest-fields';
import { Alert, Badge, Button, Card, Checkbox, ConfirmButton, Dialog, Field, Input, Ltr, PageHeader, Spinner, StatusBadge, Table, Tabs, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

type Tab = 'overview' | 'rooms' | 'occupants' | 'folio' | 'history';

export default function ReservationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const s = useRequiredSession();
  const [tab, setTab] = useState<Tab>('overview');
  const r = useApi<any>(`/v1/reservations/${id}`);
  const [assign, setAssign] = useState<string | null>(null);
  const [checkIn, setCheckIn] = useState<string | null>(null);
  const [modify, setModify] = useState(false);
  const [dates, setDates] = useState({ arrival: '', departure: '' });
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [waive, setWaive] = useState(false);
  const [addGuest, setAddGuest] = useState(false);
  const [newGuest, setNewGuest] = useState(emptyGuest());
  const [newGuestAdult, setNewGuestAdult] = useState(true);
  const [uploadFor, setUploadFor] = useState<string | null>(null);

  const confirm = useApiMutation(() => ({ path: `/v1/reservations/${id}/confirm` }));
  const doModify = useApiMutation(() => ({ path: `/v1/reservations/${id}`, method: 'PATCH', body: dates }), { success: t('reservations.modified'), onSuccess: () => setModify(false) });
  const cancel = useApiMutation(() => ({ path: `/v1/reservations/${id}/cancel`, body: { reason: cancelReason, waiveFee: waive } }), { onSuccess: () => setCancelOpen(false) });
  const noShow = useApiMutation(() => ({ path: `/v1/reservations/${id}/no-show` }));
  const autoAssign = useApiMutation(() => ({ path: '/v1/front-desk/auto-assign', body: { reservationId: id, keepTogether: true } }), { success: t('frontDesk.autoAssigned') });
  const occupant = useApiMutation(() => ({ path: `/v1/reservations/${id}/occupants`, body: { guest: toGuestPayload(newGuest), isAdult: newGuestAdult } }), { onSuccess: () => { setAddGuest(false); setNewGuest(emptyGuest()); } });

  if (r.isLoading || !r.data) return <Spinner />;
  const x = r.data;
  const open = ['CONFIRMED', 'PENDING', 'AWAITING_PAYMENT', 'INQUIRY'].includes(x.status);
  const guestName = `${x.primaryGuest.firstName} ${x.primaryGuest.lastName}`;

  return (
    <>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-3">
            {guestName} <Ltr className="text-lg text-slate-500">{x.confirmationNo}</Ltr> <StatusBadge group="reservation" value={x.status} />
          </span>
        }
        subtitle={`${f.date(x.arrivalDate)} – ${f.date(x.departureDate)} · ${t(`enum.source.${x.source}` as any)}`}
        actions={
          <>
            {['PENDING', 'AWAITING_PAYMENT', 'INQUIRY'].includes(x.status) && s.can('reservations.write') && <Button icon={CheckCircle2} onClick={() => confirm.mutate()}>{t('reservations.confirm')}</Button>}
            {open && s.can('reservations.write') && <Button variant="secondary" icon={CalendarDays} onClick={() => { setDates({ arrival: x.arrivalDate, departure: x.departureDate }); setModify(true); }}>{t('reservations.modify')}</Button>}
            {x.status === 'CONFIRMED' && s.can('reservations.cancel') && <ConfirmButton variant="secondary" message={t('frontDesk.noShow')} onConfirm={() => noShow.mutate()}>{t('frontDesk.noShow')}</ConfirmButton>}
            {open && s.can('reservations.cancel') && <Button variant="danger" icon={XCircle} onClick={() => setCancelOpen(true)}>{t('reservations.cancel')}</Button>}
          </>
        }
      />
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'overview', label: t('reservations.overview') },
          { id: 'rooms', label: t('reservations.roomsAndAssignment'), count: x.rooms.length },
          { id: 'occupants', label: t('reservations.occupants'), count: x.occupants.length },
          ...(s.can('folio.read') ? [{ id: 'folio' as Tab, label: t('reservations.folio') }] : []),
          { id: 'history', label: t('reservations.history') },
        ]}
      />

      {tab === 'overview' && (
        <div className="grid gap-4 lg:grid-cols-3">
          <Card title={t('reservations.pricing')}>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between"><dt>{t('public.subtotal')}</dt><dd>{f.money(x.roomTotal, x.currency)}</dd></div>
              {Number(x.discountTotal) > 0 && <div className="flex justify-between"><dt>{t('public.discount')}</dt><dd>−{f.money(x.discountTotal, x.currency)}</dd></div>}
              {Number(x.serviceChargeTotal) > 0 && <div className="flex justify-between"><dt>{t('public.serviceCharge')}</dt><dd>{f.money(x.serviceChargeTotal, x.currency)}</dd></div>}
              <div className="flex justify-between"><dt>{t('public.taxes')}</dt><dd>{f.money(x.taxTotal, x.currency)}</dd></div>
              <div className="flex justify-between border-t pt-1 font-bold"><dt>{t('public.grandTotal')}</dt><dd>{f.money(x.grandTotal, x.currency)}</dd></div>
              <div className="flex justify-between"><dt>{t('reservations.deposit')}</dt><dd>{f.money(x.depositRequired, x.currency)}</dd></div>
              <div className="flex justify-between"><dt>{t('reservations.paid')}</dt><dd>{f.money(x.paid, x.currency)}</dd></div>
              <div className="flex justify-between"><dt>{t('folio.balance')}</dt><dd>{f.money(x.balances.balance, x.currency)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">
              {locale === 'ar' ? x.policySnapshot.ratePlan.nameAr : x.policySnapshot.ratePlan.nameEn} · {x.policySnapshot.refundable ? t('public.refundable', { hours: x.policySnapshot.freeCancellationHours }) : t('public.nonRefundable')}
            </p>
          </Card>
          <Card title={t('documents.requirements')}>
            {x.documentRequirements.guests.length === 0 ? (
              <Badge>{t('status.document.NOT_REQUIRED')}</Badge>
            ) : (
              <ul className="space-y-2 text-sm">
                {x.documentRequirements.guests.map((g: any, i: number) => (
                  <li key={g.guestId ?? `unregistered-${i}`} className="flex items-center justify-between gap-2">
                    {g.unregistered ? (
                      <button type="button" className="text-start text-amber-800 hover:underline" onClick={() => setTab('occupants')}>{t('documents.unregisteredAdult')}</button>
                    ) : (
                      <Link href={`/app/guests/${g.guestId}`} className="text-brand-700 hover:underline">{g.name}</Link>
                    )}
                    <StatusBadge group="requirement" value={g.state} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title={t('public.guestDetails')}>
            <dl className="space-y-1 text-sm">
              <div><dt className="inline text-slate-500">{t('guests.email')}: </dt><dd className="inline"><Ltr>{x.primaryGuest.email ?? '—'}</Ltr></dd></div>
              <div><dt className="inline text-slate-500">{t('guests.phone')}: </dt><dd className="inline"><Ltr>{x.primaryGuest.phone ?? '—'}</Ltr></dd></div>
              {x.groupName && <div><dt className="inline text-slate-500">{t('reservations.groupName')}: </dt><dd className="inline">{x.groupName}</dd></div>}
              {x.companyName && <div><dt className="inline text-slate-500">{t('reservations.companyName')}: </dt><dd className="inline">{x.companyName}</dd></div>}
              {x.specialRequests && <div className="rounded bg-amber-50 p-2">{x.specialRequests}</div>}
            </dl>
          </Card>
        </div>
      )}

      {tab === 'rooms' && (
        <Card actions={x.rooms.length > 1 && s.can('assignments.write') && open && <Button size="sm" variant="secondary" icon={Wand2} onClick={() => autoAssign.mutate()}>{t('frontDesk.autoAssign')}</Button>}>
          <Table head={[t('reservations.category'), t('common.guests'), t('reservations.assigned'), t('common.status'), t('common.actions')]}>
            {x.rooms.map((rr: any) => {
              const a = rr.assignments.find((z: any) => ['PLANNED', 'ACTIVE'].includes(z.status));
              return (
                <tr key={rr.id}>
                  <Td>{locale === 'ar' ? rr.category?.nameAr : rr.category?.nameEn}</Td>
                  <Td>{f.number(rr.adults)} / {f.number(rr.children)}</Td>
                  <Td>
                    {a ? (
                      <span className="flex flex-wrap items-center gap-2"><BedDouble className="h-4 w-4" aria-hidden /><bdi>{a.room.number}</bdi><StatusBadge group="housekeeping" value={a.room.housekeepingStatus} /></span>
                    ) : (
                      <Badge tone="warning">{t('frontDesk.noRoom')}</Badge>
                    )}
                    <ul className="mt-1 text-xs text-slate-500">
                      {rr.assignments.filter((z: any) => !['PLANNED', 'ACTIVE'].includes(z.status)).map((z: any) => (
                        <li key={z.id}><bdi>{z.room.number}</bdi> · {t(`status.assignment.${z.status}` as any)} · {f.date(z.startDate)}–{f.date(z.endDate)}{z.reason ? ` · ${z.reason}` : ''}</li>
                      ))}
                    </ul>
                  </Td>
                  <Td>{rr.stay ? <StatusBadge group="reservation" value={rr.stay.status === 'IN_HOUSE' ? 'CHECKED_IN' : 'CHECKED_OUT'} /> : <StatusBadge group="assignment" value={a ? 'PLANNED' : 'UNASSIGNED'} />}</Td>
                  <Td>
                    <div className="flex flex-wrap gap-1">
                      {!rr.stay && rr.active && s.can('assignments.write') && ['CONFIRMED', 'CHECKED_IN', 'PENDING', 'AWAITING_PAYMENT'].includes(x.status) && <Button size="sm" variant="secondary" onClick={() => setAssign(rr.id)}>{t('frontDesk.assignRoom')}</Button>}
                      {!rr.stay && rr.active && s.can('frontdesk.checkin') && ['CONFIRMED', 'CHECKED_IN'].includes(x.status) && <Button size="sm" icon={KeyRound} onClick={() => setCheckIn(rr.id)}>{t('frontDesk.checkIn')}</Button>}
                      {rr.stay && (
                        <Link href={`/print/registration/${rr.stay.id}`} target="_blank" className="inline-flex items-center gap-1 rounded px-2 py-1 text-sm text-brand-700 hover:bg-slate-100">
                          <Printer className="h-4 w-4" aria-hidden /> {t('frontDesk.registrationCard')}
                        </Link>
                      )}
                    </div>
                  </Td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      {tab === 'occupants' && (
        <Card actions={s.can('guests.write') && <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddGuest(true)}>{t('reservations.addGuest')}</Button>}>
          <ul className="divide-y divide-slate-100">
            {x.occupants.map((o: any) => {
              const req = x.documentRequirements.guests.find((g: any) => g.guestId === o.guestId);
              return (
                <li key={o.id} className="space-y-2 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="flex flex-wrap items-center gap-2">
                      <Link href={`/app/guests/${o.guestId}`} className="font-medium text-brand-700 hover:underline">{o.guest.firstName} {o.guest.lastName}</Link>
                      {o.isPrimary && <Badge tone="info">{t('reservations.primaryGuest')}</Badge>}
                      <Badge>{o.isAdult ? t('reservations.isAdult') : t('common.children')}</Badge>
                      {o.guest.nationality && <Ltr className="text-xs">{o.guest.nationality}</Ltr>}
                    </span>
                    <span className="flex items-center gap-2">
                      {req ? <StatusBadge group="requirement" value={req.state} /> : <Badge>{t('status.document.NOT_REQUIRED')}</Badge>}
                      {s.can('documents.upload') && <Button size="sm" variant="secondary" onClick={() => setUploadFor(uploadFor === o.guestId ? null : o.guestId)}>{t('documents.upload')}</Button>}
                    </span>
                  </div>
                  {uploadFor === o.guestId && (
                    <div className="rounded-lg border border-slate-200 p-3">
                      <DocumentUploader guestId={o.guestId} reservationId={id} mode="staff" onUploaded={() => r.refetch()} />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Card>
      )}

      {tab === 'folio' && <FolioPanel reservationId={id} companyName={x.companyName} />}

      {tab === 'history' && (
        <Table head={[t('audit.time'), t('audit.action'), t('common.status'), t('audit.details')]}>
          {x.history.map((h: any) => (
            <tr key={h.id}>
              <Td>{f.dateTime(h.createdAt)}</Td>
              <Td><Ltr>{h.action}</Ltr></Td>
              <Td>{h.toStatus ? <StatusBadge group="reservation" value={h.toStatus} /> : null}</Td>
              <Td><Ltr className="whitespace-pre-wrap break-all text-xs">{JSON.stringify(h.details)}</Ltr></Td>
            </tr>
          ))}
        </Table>
      )}

      {assign && <AssignRoomDialog open reservationRoomId={assign} onClose={() => setAssign(null)} />}
      {checkIn && <CheckInDialog open reservationId={id} reservationRoomId={checkIn} guestName={guestName} onClose={() => setCheckIn(null)} />}

      <Dialog open={modify} onClose={() => setModify(false)} title={t('reservations.modify')} footer={<><Button variant="secondary" onClick={() => setModify(false)}>{t('common.cancel')}</Button><Button loading={doModify.isPending} disabled={dates.arrival >= dates.departure} onClick={() => doModify.mutate()}>{t('common.save')}</Button></>}>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t('reservations.arrival')} htmlFor="md-a"><Input id="md-a" type="date" value={dates.arrival} onChange={(e) => setDates({ ...dates, arrival: e.target.value })} /></Field>
          <Field label={t('reservations.departure')} htmlFor="md-d"><Input id="md-d" type="date" value={dates.departure} onChange={(e) => setDates({ ...dates, departure: e.target.value })} /></Field>
        </div>
      </Dialog>

      <Dialog open={cancelOpen} onClose={() => setCancelOpen(false)} title={t('reservations.cancel')} footer={<><Button variant="secondary" onClick={() => setCancelOpen(false)}>{t('common.close')}</Button><Button variant="danger" loading={cancel.isPending} disabled={cancelReason.trim().length < 1} onClick={() => cancel.mutate()}>{t('common.confirm')}</Button></>}>
        <div className="space-y-3">
          <Alert tone="warning">{x.policySnapshot.refundable ? t('public.refundable', { hours: x.policySnapshot.freeCancellationHours }) : t('public.nonRefundable')}</Alert>
          <Field label={t('common.reason')} htmlFor="cx-r" required><Input id="cx-r" value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} /></Field>
          {s.can('folio.adjust') && <Checkbox label={t('reservations.waiveFee')} checked={waive} onChange={(e) => setWaive(e.target.checked)} />}
        </div>
      </Dialog>

      <Dialog open={addGuest} onClose={() => setAddGuest(false)} title={t('reservations.addGuest')} wide footer={<><Button variant="secondary" onClick={() => setAddGuest(false)}>{t('common.cancel')}</Button><Button loading={occupant.isPending} disabled={!newGuest.firstName || !newGuest.lastName} onClick={() => occupant.mutate()}>{t('common.add')}</Button></>}>
        <div className="space-y-3">
          <GuestFields value={newGuest} onChange={setNewGuest} />
          <Checkbox label={t('reservations.isAdult')} checked={newGuestAdult} onChange={(e) => setNewGuestAdult(e.target.checked)} />
        </div>
      </Dialog>
    </>
  );
}
