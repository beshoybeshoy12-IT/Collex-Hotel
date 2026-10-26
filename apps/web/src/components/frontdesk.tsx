'use client';

import { BedDouble, CheckCircle2, KeyRound, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ApiError } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';
import { Alert, Badge, Button, Checkbox, Dialog, Field, Input, Spinner, StatusBadge, Textarea } from './ui';

/** Ranked room recommendations with reasons; staff pick a room explicitly (never silently substituted). */
export function AssignRoomDialog({ reservationRoomId, open, onClose, onAssigned }: { reservationRoomId: string; open: boolean; onClose(): void; onAssigned?(): void }) {
  const t = useTranslations();
  const locale = useLocale();
  const [allowUpgrade, setAllowUpgrade] = useState(false);
  const [showIneligible, setShowIneligible] = useState(false);
  const rec = useApi<any>(open ? `/v1/front-desk/recommendations/${reservationRoomId}?allowUpgrade=${allowUpgrade}` : null);
  const assign = useApiMutation((roomId: string) => ({ path: '/v1/front-desk/assign', body: { reservationRoomId, roomId, allowUpgrade } }), {
    success: t('frontDesk.roomAssigned'),
    onSuccess: () => {
      onAssigned?.();
      onClose();
    },
  });
  const rooms = (rec.data?.rooms ?? []).filter((r: any) => r.eligible || showIneligible);
  return (
    <Dialog open={open} onClose={onClose} title={t('frontDesk.recommendations')} wide>
      <div className="mb-3 flex flex-wrap gap-4">
        <Checkbox label={t('frontDesk.allowUpgrade')} checked={allowUpgrade} onChange={(e) => setAllowUpgrade(e.target.checked)} />
        <Checkbox label={t('frontDesk.ineligible')} checked={showIneligible} onChange={(e) => setShowIneligible(e.target.checked)} />
      </div>
      {rec.isLoading && <Spinner />}
      {rec.data && rooms.length === 0 && <Alert tone="warning">{t('errors.NO_ELIGIBLE_ROOM')}</Alert>}
      <ul className="grid gap-2 sm:grid-cols-2">
        {rooms.map((r: any) => (
          <li key={r.roomId} className={`rounded-lg border p-3 ${r.eligible ? 'border-slate-200' : 'border-red-200 bg-red-50/40'}`}>
            <div className="flex items-center justify-between gap-2">
              <p className="flex items-center gap-2 font-semibold">
                <BedDouble className="h-4 w-4" aria-hidden />
                {t('common.room')} <bdi>{r.number}</bdi>
              </p>
              <span className="text-xs text-slate-500">{locale === 'ar' ? r.room?.category.nameAr : r.room?.category.nameEn}</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {r.room && <StatusBadge group="housekeeping" value={r.room.housekeepingStatus} />}
              {r.eligible
                ? r.explanations.filter((x: string) => !x.startsWith('READY_')).map((x: string) => (
                    <Badge key={x} tone="success" icon={CheckCircle2}>{t(`enum.explanation.${x}` as any)}</Badge>
                  ))
                : r.reasons.map((x: string) => (
                    <Badge key={x} tone="danger" icon={XCircle}>{t(`enum.ineligible.${x}` as any)}</Badge>
                  ))}
            </div>
            {r.eligible && (
              <Button size="sm" className="mt-3" loading={assign.isPending && assign.variables === r.roomId} onClick={() => assign.mutate(r.roomId)}>
                {t('frontDesk.selectRoom')}
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Dialog>
  );
}

/**
 * Check-in checklist: identity requirements per guest, room readiness, deposit, acknowledgements.
 * The API enforces every rule; this dialog explains what is missing and offers the documented exception path.
 */
export function CheckInDialog({ reservationId, reservationRoomId, guestName, open, onClose }: { reservationId: string; reservationRoomId: string; guestName: string; open: boolean; onClose(): void }) {
  const t = useTranslations();
  const s = useRequiredSession();
  const err = useErrorMessage();
  const detail = useApi<any>(open ? `/v1/reservations/${reservationId}` : null);
  const [policiesAccepted, setPolicies] = useState(false);
  const [registrationSigned, setSigned] = useState(true);
  const [keyCards, setKeyCards] = useState(2);
  const [useException, setUseException] = useState(false);
  const [exceptionReason, setExceptionReason] = useState('');
  const [assignOpen, setAssignOpen] = useState(false);
  const checkIn = useApiMutation(
    () => ({
      path: '/v1/front-desk/check-in',
      body: {
        reservationRoomId,
        acknowledgements: { policiesAccepted, registrationSigned },
        keyCardsIssued: keyCards,
        ...(useException ? { documentException: { reason: exceptionReason } } : {}),
      },
    }),
    { success: t('frontDesk.checkedIn'), onSuccess: onClose, silentError: true },
  );
  const d = detail.data;
  const line = d?.rooms.find((r: any) => r.id === reservationRoomId);
  const assignment = line?.assignments.find((a: any) => ['PLANNED', 'ACTIVE'].includes(a.status));
  const req = d?.documentRequirements;
  const depositShort = d ? Number(d.depositRequired) > Number(d.paid) : false;
  const checkInError = checkIn.error instanceof ApiError ? checkIn.error : null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={t('frontDesk.checkInTitle', { name: guestName })}
      wide
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>{t('common.cancel')}</Button>
          <Button
            icon={KeyRound}
            loading={checkIn.isPending}
            disabled={!policiesAccepted || !assignment || (useException && exceptionReason.trim().length < 5)}
            onClick={() => checkIn.mutate()}
          >
            {t('frontDesk.completeCheckIn')}
          </Button>
        </>
      }
    >
      {!d ? (
        <Spinner />
      ) : (
        <div className="space-y-5">
          <section>
            <h3 className="mb-2 font-semibold">{t('frontDesk.documentsCheck')}</h3>
            {req.guests.length === 0 ? (
              <Badge tone="neutral">{t('status.document.NOT_REQUIRED')}</Badge>
            ) : (
              <ul className="space-y-1">
                {req.guests.map((g: any, i: number) => (
                  <li key={g.guestId ?? `unregistered-${i}`} className="flex items-center justify-between gap-2 rounded border border-slate-100 px-3 py-2 text-sm">
                    <span>{g.unregistered ? t('documents.unregisteredAdult') : g.name}</span>
                    <StatusBadge group="requirement" value={g.state} />
                  </li>
                ))}
              </ul>
            )}
            {!req.satisfied && (
              <div className="mt-3 space-y-2 rounded-lg bg-amber-50 p-3">
                <Alert tone="warning">{t('errors.DOCUMENTS_INCOMPLETE')}</Alert>
                {req.policy.allowExceptions && s.can('frontdesk.checkin_exception') && (
                  <>
                    <Checkbox label={t('frontDesk.exception')} checked={useException} onChange={(e) => setUseException(e.target.checked)} />
                    {useException && (
                      <Field label={t('frontDesk.exceptionReason')} htmlFor="ex-r" hint={t('frontDesk.exceptionHelp')} required>
                        <Textarea id="ex-r" value={exceptionReason} onChange={(e) => setExceptionReason(e.target.value)} />
                      </Field>
                    )}
                  </>
                )}
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">{t('frontDesk.roomCheck')}</h3>
            {assignment ? (
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <BedDouble className="h-4 w-4" aria-hidden /> <bdi className="font-semibold">{assignment.room.number}</bdi>
                <StatusBadge group="housekeeping" value={assignment.room.housekeepingStatus} />
                <StatusBadge group="maintenance" value={assignment.room.maintenanceStatus} />
                <Button size="sm" variant="ghost" onClick={() => setAssignOpen(true)}>{t('frontDesk.assignRoom')}</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Alert tone="warning">{t('frontDesk.noRoom')}</Alert>
                <Button size="sm" onClick={() => setAssignOpen(true)}>{t('frontDesk.assignRoom')}</Button>
              </div>
            )}
          </section>
          <section>
            <h3 className="mb-2 font-semibold">{t('frontDesk.paymentCheck')}</h3>
            <p className="text-sm text-slate-700">
              {t('reservations.deposit')}: <bdi>{d.depositRequired}</bdi> · {t('reservations.paid')}: <bdi>{d.paid}</bdi>
            </p>
            {depositShort && <Alert tone="warning">{t('errors.DEPOSIT_REQUIRED')}</Alert>}
          </section>
          <section className="space-y-2">
            <Checkbox label={t('frontDesk.policiesAccepted')} checked={policiesAccepted} onChange={(e) => setPolicies(e.target.checked)} />
            <Checkbox label={t('frontDesk.registrationSigned')} checked={registrationSigned} onChange={(e) => setSigned(e.target.checked)} />
            <Field label={t('frontDesk.keyCards')} htmlFor="kc" className="max-w-[10rem]">
              <Input id="kc" type="number" min={0} max={10} value={keyCards} onChange={(e) => setKeyCards(Number(e.target.value))} />
            </Field>
          </section>
          {checkInError && (
            <Alert tone="danger" title={err(checkInError)}>
              {checkInError.details?.reasons && (
                <ul className="list-inside list-disc">
                  {checkInError.details.reasons.map((r: string) => <li key={r}>{t(`enum.ineligible.${r}` as any)}</li>)}
                </ul>
              )}
            </Alert>
          )}
          <AssignRoomDialog reservationRoomId={reservationRoomId} open={assignOpen} onClose={() => setAssignOpen(false)} />
        </div>
      )}
    </Dialog>
  );
}
