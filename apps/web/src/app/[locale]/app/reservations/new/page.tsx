'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { ReservationSource } from '@collex/shared';
import { RequirePerm } from '@/components/staff-shell';
import { emptyGuest, GuestFields, toGuestPayload, type GuestValues } from '@/components/guest-fields';
import { Badge, Button, Card, Checkbox, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { qs } from '@/lib/api';
import { addDaysIso, businessToday } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';

export default function NewReservationPage() {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const today = businessToday();
  const [arrival, setArrival] = useState(today);
  const [departure, setDeparture] = useState(addDaysIso(today, 1));
  const [ratePlanId, setPlan] = useState('');
  const [source, setSource] = useState('PHONE');
  const [rooms, setRooms] = useState([{ categoryId: '', adults: 2, children: 0 }]);
  const [guest, setGuest] = useState<GuestValues>(emptyGuest());
  const [others, setOthers] = useState<(GuestValues & { isAdult: boolean })[]>([]);
  const [groupName, setGroup] = useState('');
  const [companyName, setCompany] = useState('');
  const [specialRequests, setSR] = useState('');
  const [hold, setHold] = useState(false);
  const categories = useApi<any[]>('/v1/property/categories');
  const plans = useApi<any[]>('/v1/rates/plans');
  const valid = arrival < departure;
  const avail = useApi<any[]>(valid ? `/v1/rates/availability${qs({ arrival, departure, adults: 1 })}` : null);
  const availability = (catId: string) => avail.data?.find((c) => c.category.id === catId)?.available;

  const create = useApiMutation(
    () => ({
      path: '/v1/reservations',
      body: {
        arrival,
        departure,
        ratePlanId,
        source,
        rooms,
        primaryGuest: toGuestPayload(guest),
        additionalGuests: others.map((o) => ({ ...toGuestPayload(o), isAdult: o.isAdult })),
        specialRequests,
        groupName: groupName || null,
        companyName: companyName || null,
        confirm: !hold,
        ...(hold ? { holdMinutes: 60 } : {}),
      },
    }),
    { success: t('reservations.created'), onSuccess: (r: any) => router.push(`/app/reservations/${r.id}`) },
  );

  if (categories.isLoading || plans.isLoading) return <Spinner />;
  const ready = valid && ratePlanId && rooms.every((r) => r.categoryId) && guest.firstName && guest.lastName;
  return (
    <RequirePerm perm="reservations.write">
      <PageHeader title={t('reservations.new')} />
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          create.mutate();
        }}
      >
        <Card title={t('reservations.overview')}>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('reservations.arrival')} htmlFor="nr-a" required>
              <Input id="nr-a" type="date" min={today} value={arrival} onChange={(e) => setArrival(e.target.value)} />
            </Field>
            <Field label={t('reservations.departure')} htmlFor="nr-d" required error={valid ? undefined : t('validation.departure_after_arrival')}>
              <Input id="nr-d" type="date" min={addDaysIso(arrival, 1)} value={departure} onChange={(e) => setDeparture(e.target.value)} aria-invalid={!valid} />
            </Field>
            <Field label={t('reservations.ratePlan')} htmlFor="nr-p" required>
              <Select id="nr-p" value={ratePlanId} onChange={(e) => setPlan(e.target.value)} required>
                <option value="">—</option>
                {plans.data?.filter((p) => p.active).map((p) => <option key={p.id} value={p.id}>{locale === 'ar' ? p.nameAr : p.nameEn}</option>)}
              </Select>
            </Field>
            <Field label={t('reservations.source')} htmlFor="nr-s">
              <Select id="nr-s" value={source} onChange={(e) => setSource(e.target.value)}>
                {ReservationSource.map((x) => <option key={x} value={x}>{t(`enum.source.${x}`)}</option>)}
              </Select>
            </Field>
            <Field label={t('reservations.groupName')} htmlFor="nr-g">
              <Input id="nr-g" value={groupName} onChange={(e) => setGroup(e.target.value)} />
            </Field>
            <Field label={t('reservations.companyName')} htmlFor="nr-c">
              <Input id="nr-c" value={companyName} onChange={(e) => setCompany(e.target.value)} />
            </Field>
          </div>
        </Card>

        <Card title={t('common.rooms')} actions={<Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setRooms([...rooms, { categoryId: '', adults: 1, children: 0 }])}>{t('reservations.addRoom')}</Button>}>
          <ul className="space-y-3">
            {rooms.map((r, i) => (
              <li key={i} className="grid items-end gap-3 sm:grid-cols-5">
                <Field label={t('reservations.category')} htmlFor={`nr-cat-${i}`} className="sm:col-span-2">
                  <Select id={`nr-cat-${i}`} value={r.categoryId} onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, categoryId: e.target.value } : x)))} required>
                    <option value="">—</option>
                    {categories.data?.map((c) => (
                      <option key={c.id} value={c.id}>
                        {locale === 'ar' ? c.nameAr : c.nameEn}
                        {availability(c.id) !== undefined ? ` — ${t('reservations.availableCount', { count: availability(c.id) })}` : ''}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={t('common.adults')} htmlFor={`nr-ad-${i}`}>
                  <Input id={`nr-ad-${i}`} type="number" min={1} max={10} value={r.adults} onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, adults: Number(e.target.value) } : x)))} />
                </Field>
                <Field label={t('common.children')} htmlFor={`nr-ch-${i}`}>
                  <Input id={`nr-ch-${i}`} type="number" min={0} max={10} value={r.children} onChange={(e) => setRooms(rooms.map((x, j) => (j === i ? { ...x, children: Number(e.target.value) } : x)))} />
                </Field>
                {rooms.length > 1 && (
                  <Button type="button" variant="ghost" icon={Trash2} onClick={() => setRooms(rooms.filter((_, j) => j !== i))}>{t('common.remove')}</Button>
                )}
              </li>
            ))}
          </ul>
          {avail.data && rooms.some((r) => r.categoryId && (availability(r.categoryId) ?? 0) < rooms.filter((x) => x.categoryId === r.categoryId).length) && (
            <p className="mt-2"><Badge tone="danger">{t('reservations.noAvailability')}</Badge></p>
          )}
        </Card>

        <Card title={t('reservations.primaryGuest')}>
          <GuestFields value={guest} onChange={setGuest} />
        </Card>

        <Card
          title={t('reservations.accompanying')}
          actions={<Button type="button" size="sm" variant="secondary" icon={Plus} onClick={() => setOthers([...others, { ...emptyGuest(), isAdult: true }])}>{t('reservations.addGuest')}</Button>}
        >
          {others.length === 0 && <p className="text-sm text-slate-500">{t('common.emptyBody')}</p>}
          <ul className="space-y-4">
            {others.map((o, i) => (
              <li key={i} className="space-y-2 rounded-lg border border-slate-200 p-3">
                <GuestFields compact value={o} onChange={(v) => setOthers(others.map((x, j) => (j === i ? { ...v, isAdult: x.isAdult } : x)))} />
                <div className="flex items-center gap-4">
                  <Checkbox label={t('reservations.isAdult')} checked={o.isAdult} onChange={(e) => setOthers(others.map((x, j) => (j === i ? { ...x, isAdult: e.target.checked } : x)))} />
                  <Button type="button" size="sm" variant="ghost" icon={Trash2} onClick={() => setOthers(others.filter((_, j) => j !== i))}>{t('common.remove')}</Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <Field label={t('public.specialRequests')} htmlFor="nr-sr">
            <Input id="nr-sr" value={specialRequests} onChange={(e) => setSR(e.target.value)} />
          </Field>
          <div className="mt-3">
            <Checkbox label={t('reservations.holdOnly')} checked={hold} onChange={(e) => setHold(e.target.checked)} />
          </div>
        </Card>
        <Button type="submit" loading={create.isPending} disabled={!ready}>{t('common.create')}</Button>
      </form>
    </RequirePerm>
  );
}
