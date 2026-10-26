'use client';

import { UserPlus } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { RequirePerm } from '@/components/staff-shell';
import { emptyGuest, GuestFields, toGuestPayload } from '@/components/guest-fields';
import { Alert, Button, Card, Field, Input, PageHeader, Select, Spinner } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { qs } from '@/lib/api';
import { addDaysIso, businessToday, useFormat } from '@/lib/format';
import { useApi, useApiMutation } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

/** Walk-in: same-day confirmed reservation + automatic assignment of the best ready room, then check-in. */
export default function WalkInPage() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const router = useRouter();
  const s = useRequiredSession();
  const today = businessToday(s.property?.timezone);
  const [departure, setDeparture] = useState(addDaysIso(today, 1));
  const [categoryId, setCategory] = useState('');
  const [ratePlanId, setPlan] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [guest, setGuest] = useState(emptyGuest());
  const offers = useApi<any[]>(departure > today ? `/v1/rates/availability${qs({ arrival: today, departure, adults, children })}` : null);
  const cat = offers.data?.find((c) => c.category.id === categoryId);
  const create = useApiMutation(
    () => ({ path: '/v1/front-desk/walk-in', body: { departure, ratePlanId, categoryId, adults, children, guest: toGuestPayload(guest) } }),
    { success: t('reservations.created'), onSuccess: (r: any) => router.push(`/app/reservations/${r.reservationId}`) },
  );
  return (
    <RequirePerm perm="frontdesk.checkin">
      <PageHeader title={t('nav.walkIn')} subtitle={f.date(today, { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="space-y-5">
        <Card>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Field label={t('reservations.departure')} htmlFor="wi-d" required>
              <Input id="wi-d" type="date" min={addDaysIso(today, 1)} value={departure} onChange={(e) => setDeparture(e.target.value)} />
            </Field>
            <Field label={t('common.adults')} htmlFor="wi-a"><Input id="wi-a" type="number" min={1} max={10} value={adults} onChange={(e) => setAdults(Number(e.target.value))} /></Field>
            <Field label={t('common.children')} htmlFor="wi-c"><Input id="wi-c" type="number" min={0} max={10} value={children} onChange={(e) => setChildren(Number(e.target.value))} /></Field>
          </div>
          {offers.isLoading && <Spinner />}
          {offers.data && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t('reservations.category')} htmlFor="wi-cat" required>
                <Select id="wi-cat" value={categoryId} onChange={(e) => { setCategory(e.target.value); setPlan(''); }}>
                  <option value="">—</option>
                  {offers.data.filter((c) => c.offers.length).map((c) => (
                    <option key={c.category.id} value={c.category.id}>{locale === 'ar' ? c.category.nameAr : c.category.nameEn} — {t('reservations.availableCount', { count: c.available })}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('reservations.ratePlan')} htmlFor="wi-p" required>
                <Select id="wi-p" value={ratePlanId} onChange={(e) => setPlan(e.target.value)} disabled={!cat}>
                  <option value="">—</option>
                  {cat?.offers.map((o: any) => (
                    <option key={o.ratePlan.id} value={o.ratePlan.id}>{locale === 'ar' ? o.ratePlan.nameAr : o.ratePlan.nameEn} — {f.money(o.quote.grandTotal)}</option>
                  ))}
                </Select>
              </Field>
            </div>
          )}
          {offers.data && !offers.data.some((c) => c.offers.length) && <Alert tone="warning">{t('reservations.noAvailability')}</Alert>}
        </Card>
        <Card title={t('reservations.primaryGuest')}>
          <GuestFields value={guest} onChange={setGuest} />
        </Card>
        <Button icon={UserPlus} loading={create.isPending} disabled={!categoryId || !ratePlanId || !guest.firstName || !guest.lastName} onClick={() => create.mutate()}>
          {t('common.create')}
        </Button>
      </div>
    </RequirePerm>
  );
}
