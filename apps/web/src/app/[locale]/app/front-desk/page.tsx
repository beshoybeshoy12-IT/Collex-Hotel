'use client';

import { ArrowLeftRight, BedDouble, CalendarPlus, KeyRound, LogOut, Printer, Search, Wand2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { AssignRoomDialog, CheckInDialog } from '@/components/frontdesk';
import { Alert, Badge, Button, Checkbox, Dialog, EmptyState, Field, Input, PageHeader, Spinner, StatusBadge, Table, Tabs, Td } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { addDaysIso, useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';
import { useErrorMessage } from '@/lib/errors';

type Tab = 'arrivals' | 'departures' | 'inHouse' | 'unassigned';

export default function FrontDeskPage() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const s = useRequiredSession();
  const err = useErrorMessage();
  const [tab, setTab] = useState<Tab>('arrivals');
  const [q, setQ] = useState('');
  const d = useApi<any>('/v1/front-desk/dashboard', { refetchInterval: 20_000 });
  const unassigned = useApi<any[]>('/v1/front-desk/unassigned?days=3');
  const [checkIn, setCheckIn] = useState<null | { reservationId: string; reservationRoomId: string; name: string }>(null);
  const [assign, setAssign] = useState<string | null>(null);
  const [checkout, setCheckout] = useState<null | { stayId: string; name: string }>(null);
  const [allowBalance, setAllowBalance] = useState(false);
  const [move, setMove] = useState<null | { stayId: string; reservationRoomId: string }>(null);
  const [moveRoom, setMoveRoom] = useState('');
  const [moveReason, setMoveReason] = useState('');
  const [extend, setExtend] = useState<null | { reservationId: string; departure: string }>(null);
  const [newDeparture, setNewDeparture] = useState('');

  const doCheckout = useApiMutation(() => ({ path: '/v1/front-desk/check-out', body: { stayId: checkout!.stayId, allowOutstandingBalance: allowBalance } }), { success: t('frontDesk.checkedOut'), onSuccess: () => setCheckout(null), silentError: true });
  const autoAssign = useApiMutation((reservationId: string) => ({ path: '/v1/front-desk/auto-assign', body: { reservationId, keepTogether: true } }), { success: t('frontDesk.autoAssigned') });
  const doMove = useApiMutation(() => ({ path: '/v1/front-desk/room-move', body: { stayId: move!.stayId, toRoomId: moveRoom, reason: moveReason } }), { success: t('frontDesk.moved'), onSuccess: () => setMove(null) });
  const doExtend = useApiMutation(() => ({ path: '/v1/front-desk/extend', body: { reservationId: extend!.reservationId, newDeparture } }), { onSuccess: () => setExtend(null) });
  const moveRec = useApi<any>(move ? `/v1/front-desk/recommendations/${move.reservationRoomId}?allowUpgrade=true` : null);

  const filter = useMemo(() => (name: string, conf: string, rooms = '') => !q || `${name} ${conf} ${rooms}`.toLowerCase().includes(q.toLowerCase()), [q]);
  if (d.isLoading || !d.data) return <Spinner />;
  const x = d.data;
  const balanceError = doCheckout.error instanceof ApiError && doCheckout.error.code === 'BALANCE_OUTSTANDING' ? doCheckout.error.details : null;

  return (
    <>
      <PageHeader title={t('frontDesk.title')} subtitle={f.date(x.businessDate, { weekday: 'long', day: 'numeric', month: 'long' })} actions={<Link href="/app/walk-in"><Button tabIndex={-1}>{t('nav.walkIn')}</Button></Link>} />
      <div className="mb-4 max-w-sm">
        <label className="relative block">
          <span className="sr-only">{t('common.search')}</span>
          <Search className="pointer-events-none absolute start-3 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
          <Input className="ps-9" placeholder={t('reservations.searchPlaceholder')} value={q} onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <Tabs<Tab>
        value={tab}
        onChange={setTab}
        tabs={[
          { id: 'arrivals', label: t('frontDesk.arrivalsTab'), count: x.arrivals.length },
          { id: 'departures', label: t('frontDesk.departuresTab'), count: x.departures.length },
          { id: 'inHouse', label: t('frontDesk.inHouseTab'), count: x.inHouse.length },
          { id: 'unassigned', label: t('frontDesk.unassignedTab'), count: unassigned.data?.length },
        ]}
      />

      {tab === 'arrivals' && (
        x.arrivals.length === 0 ? <EmptyState /> : (
          <Table head={[t('reservations.guestName'), t('reservations.confirmationNo'), t('common.rooms'), t('common.status'), t('common.actions')]}>
            {x.arrivals.filter((r: any) => filter(r.guestName, r.confirmationNo)).map((r: any) => (
              <tr key={r.id}>
                <Td>
                  <Link href={`/app/reservations/${r.id}`} className="font-medium text-brand-700 hover:underline">{r.guestName}</Link>
                  {r.vip && <span className="ms-2"><Badge tone="warning">{t('frontDesk.vip')}</Badge></span>}
                  {r.groupName && <span className="ms-2"><Badge>{t('frontDesk.group')}: {r.groupName}</Badge></span>}
                </Td>
                <Td><bdi className="font-mono">{r.confirmationNo}</bdi></Td>
                <Td>
                  <ul className="space-y-1">
                    {r.rooms.map((rr: any) => (
                      <li key={rr.id} className="flex flex-wrap items-center gap-2">
                        {rr.room ? (
                          <>
                            <BedDouble className="h-4 w-4" aria-hidden /> <bdi>{rr.room.number}</bdi>
                            <StatusBadge group="housekeeping" value={rr.room.housekeepingStatus} />
                          </>
                        ) : (
                          <Badge tone="warning">{t('frontDesk.noRoom')}</Badge>
                        )}
                        {rr.checkedIn ? (
                          <StatusBadge group="reservation" value="CHECKED_IN" />
                        ) : (
                          <>
                            {s.can('assignments.write') && <Button size="sm" variant="secondary" onClick={() => setAssign(rr.id)}>{t('frontDesk.assignRoom')}</Button>}
                            {s.can('frontdesk.checkin') && <Button size="sm" icon={KeyRound} onClick={() => setCheckIn({ reservationId: r.id, reservationRoomId: rr.id, name: r.guestName })}>{t('frontDesk.checkIn')}</Button>}
                          </>
                        )}
                      </li>
                    ))}
                  </ul>
                </Td>
                <Td><StatusBadge group="reservation" value={r.status} /></Td>
                <Td>{r.rooms.length > 1 && s.can('assignments.write') && <Button size="sm" variant="ghost" icon={Wand2} onClick={() => autoAssign.mutate(r.id)}>{t('frontDesk.autoAssign')}</Button>}</Td>
              </tr>
            ))}
          </Table>
        )
      )}

      {tab === 'departures' && (
        x.departures.length === 0 ? <EmptyState /> : (
          <Table head={[t('reservations.guestName'), t('reservations.confirmationNo'), t('common.room'), t('reservations.departure'), t('common.actions')]}>
            {x.departures.filter((r: any) => filter(r.guestName, r.confirmationNo)).flatMap((r: any) =>
              r.rooms.filter((rr: any) => rr.stayId).map((rr: any) => (
                <tr key={rr.id}>
                  <Td><Link href={`/app/reservations/${r.id}`} className="text-brand-700 hover:underline">{r.guestName}</Link></Td>
                  <Td><bdi className="font-mono">{r.confirmationNo}</bdi></Td>
                  <Td><bdi>{rr.room?.number}</bdi></Td>
                  <Td>{f.date(r.departure)}</Td>
                  <Td>{s.can('frontdesk.checkout') && <Button size="sm" icon={LogOut} onClick={() => { setAllowBalance(false); doCheckout.reset(); setCheckout({ stayId: rr.stayId, name: r.guestName }); }}>{t('frontDesk.checkOut')}</Button>}</Td>
                </tr>
              )),
            )}
          </Table>
        )
      )}

      {tab === 'inHouse' && (
        x.inHouse.length === 0 ? <EmptyState /> : (
          <Table head={[t('reservations.guestName'), t('reservations.confirmationNo'), t('common.room'), t('reservations.departure'), t('common.actions')]}>
            {x.inHouse.filter((st: any) => filter(st.guestName, st.confirmationNo, st.room ?? '')).map((st: any) => (
              <tr key={st.stayId}>
                <Td><Link href={`/app/reservations/${st.reservationId}`} className="text-brand-700 hover:underline">{st.guestName}</Link></Td>
                <Td><bdi className="font-mono">{st.confirmationNo}</bdi></Td>
                <Td><bdi>{st.room}</bdi></Td>
                <Td>{f.date(st.departure)}</Td>
                <Td>
                  <div className="flex flex-wrap gap-1">
                    {s.can('frontdesk.checkout') && <Button size="sm" icon={LogOut} onClick={() => { setAllowBalance(false); doCheckout.reset(); setCheckout({ stayId: st.stayId, name: st.guestName }); }}>{t('frontDesk.checkOut')}</Button>}
                    {s.can('assignments.write') && (
                      <Button size="sm" variant="secondary" icon={ArrowLeftRight} onClick={async () => {
                        const det = await api<any>(`/v1/reservations/${st.reservationId}`);
                        const rr = det.rooms.find((l: any) => l.stay?.id === st.stayId);
                        setMoveRoom('');
                        setMoveReason('');
                        setMove({ stayId: st.stayId, reservationRoomId: rr.id });
                      }}>{t('frontDesk.moveRoom')}</Button>
                    )}
                    {s.can('reservations.write') && <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => { setNewDeparture(addDaysIso(st.departure, 1)); setExtend({ reservationId: st.reservationId, departure: st.departure }); }}>{t('frontDesk.extendStay')}</Button>}
                    <Link href={`/print/registration/${st.stayId}`} target="_blank" className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm text-brand-700 hover:bg-slate-100">
                      <Printer className="h-4 w-4" aria-hidden /> {t('frontDesk.registrationCard')}
                    </Link>
                  </div>
                </Td>
              </tr>
            ))}
          </Table>
        )
      )}

      {tab === 'unassigned' && (
        !unassigned.data?.length ? <EmptyState /> : (
          <Table head={[t('reservations.guestName'), t('reservations.confirmationNo'), t('reservations.category'), t('reservations.arrival'), t('common.actions')]}>
            {unassigned.data.filter((l) => filter(`${l.reservation.primaryGuest.firstName} ${l.reservation.primaryGuest.lastName}`, l.reservation.confirmationNo)).map((l) => (
              <tr key={l.id}>
                <Td><Link href={`/app/reservations/${l.reservation.id}`} className="text-brand-700 hover:underline">{l.reservation.primaryGuest.firstName} {l.reservation.primaryGuest.lastName}</Link></Td>
                <Td><bdi className="font-mono">{l.reservation.confirmationNo}</bdi></Td>
                <Td>{locale === 'ar' ? l.category?.nameAr : l.category?.nameEn}</Td>
                <Td>{f.date(l.arrival)}</Td>
                <Td>{s.can('assignments.write') && <Button size="sm" onClick={() => setAssign(l.id)}>{t('frontDesk.assignRoom')}</Button>}</Td>
              </tr>
            ))}
          </Table>
        )
      )}

      {checkIn && <CheckInDialog open reservationId={checkIn.reservationId} reservationRoomId={checkIn.reservationRoomId} guestName={checkIn.name} onClose={() => setCheckIn(null)} />}
      {assign && <AssignRoomDialog open reservationRoomId={assign} onClose={() => setAssign(null)} />}

      <Dialog
        open={!!checkout}
        onClose={() => setCheckout(null)}
        title={`${t('frontDesk.checkOut')} — ${checkout?.name ?? ''}`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setCheckout(null)}>{t('common.cancel')}</Button>
            <Button icon={LogOut} loading={doCheckout.isPending} onClick={() => doCheckout.mutate()}>{t('frontDesk.checkOut')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {balanceError && <Alert tone="warning">{t('frontDesk.balanceDue', { amount: f.money(balanceError.balance) })}</Alert>}
          {doCheckout.error && !balanceError && <Alert tone="danger">{err(doCheckout.error)}</Alert>}
          {balanceError && s.can('folio.adjust') && <Checkbox label={t('frontDesk.allowBalance')} checked={allowBalance} onChange={(e) => setAllowBalance(e.target.checked)} />}
        </div>
      </Dialog>

      <Dialog
        open={!!move}
        onClose={() => setMove(null)}
        title={t('frontDesk.moveRoom')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setMove(null)}>{t('common.cancel')}</Button>
            <Button loading={doMove.isPending} disabled={!moveRoom || moveReason.trim().length < 3} onClick={() => doMove.mutate()}>{t('common.confirm')}</Button>
          </>
        }
      >
        <div className="space-y-3">
          {moveRec.isLoading && <Spinner />}
          <fieldset className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            <legend className="mb-2 text-sm font-medium">{t('frontDesk.recommendations')}</legend>
            {moveRec.data?.rooms.filter((r: any) => r.eligible).map((r: any) => (
              <label key={r.roomId} className={`cursor-pointer rounded-lg border p-2 text-center text-sm ${moveRoom === r.roomId ? 'border-brand-600 bg-brand-50' : 'border-slate-200'}`}>
                <input type="radio" name="moveRoom" className="sr-only" value={r.roomId} checked={moveRoom === r.roomId} onChange={() => setMoveRoom(r.roomId)} />
                <bdi className="font-semibold">{r.number}</bdi>
                {r.isUpgrade && <div><Badge tone="info">{t('enum.explanation.UPGRADE')}</Badge></div>}
              </label>
            ))}
          </fieldset>
          <Field label={t('frontDesk.moveReason')} htmlFor="mv-r" required>
            <Input id="mv-r" value={moveReason} onChange={(e) => setMoveReason(e.target.value)} />
          </Field>
        </div>
      </Dialog>

      <Dialog
        open={!!extend}
        onClose={() => setExtend(null)}
        title={t('frontDesk.extendStay')}
        footer={
          <>
            <Button variant="secondary" onClick={() => setExtend(null)}>{t('common.cancel')}</Button>
            <Button loading={doExtend.isPending} onClick={() => doExtend.mutate()}>{t('common.confirm')}</Button>
          </>
        }
      >
        <Field label={t('frontDesk.newDeparture')} htmlFor="ext-d">
          <Input id="ext-d" type="date" min={extend ? addDaysIso(extend.departure, 1) : undefined} value={newDeparture} onChange={(e) => setNewDeparture(e.target.value)} />
        </Field>
      </Dialog>
    </>
  );
}
