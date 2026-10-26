'use client';

import { BedDouble, CheckCircle2, Circle, Loader2, UserPlus, XCircle } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { isCountryCode, isValidDocumentNumber } from '@collex/shared';
import { CountrySelect } from '@/components/country-select';
import { ScanSlot } from '@/components/scan-picker';
import { RequirePerm } from '@/components/staff-shell';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, LtrInput, PageHeader, Select, Spinner, StatusBadge } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { addDaysIso, businessToday, useFormat, useLocalName } from '@/lib/format';
import { useApi } from '@/lib/hooks';
import { useRequiredSession } from '@/lib/session';

const DOC_TYPES = ['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT'] as const;
/** ID cards and residence permits are two-sided (ICAO TD1), so both sides are required. */
const needsBack = (type: string) => type !== 'PASSPORT';

interface Person {
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  nationality: string;
  email: string;
  phone: string;
  preferredLocale: 'ar' | 'en';
  docType: (typeof DOC_TYPES)[number];
  docNumber: string;
  issuingCountry: string;
  expiryDate: string;
  front: File | null;
  back: File | null;
}

const emptyPerson = (): Person => ({
  firstName: '', lastName: '', dateOfBirth: '', nationality: '', email: '', phone: '', preferredLocale: 'ar',
  docType: 'PASSPORT', docNumber: '', issuingCountry: '', expiryDate: '', front: null, back: null,
});

type StepState = 'idle' | 'running' | 'done' | 'failed';

/**
 * Walk-in registration: stay → room selection → every adult registered with an identity document
 * (ICAO Doc 9303 / ISO 3166-1 data) → optional verification and immediate check-in.
 */
export default function WalkInPage() {
  const t = useTranslations();
  const locale = useLocale();
  const f = useFormat();
  const ln = useLocalName();
  const err = useErrorMessage();
  const router = useRouter();
  const s = useRequiredSession();
  const today = businessToday(s.property?.timezone);
  const [departure, setDeparture] = useState(addDaysIso(today, 1));
  const [categoryId, setCategory] = useState('');
  const [ratePlanId, setPlan] = useState('');
  const [adults, setAdults] = useState(1);
  const [children, setChildren] = useState(0);
  const [roomId, setRoomId] = useState('');
  const [people, setPeople] = useState<Person[]>([emptyPerson()]);
  const [verifyNow, setVerifyNow] = useState(false);
  const [checkInNow, setCheckInNow] = useState(true);
  const [policies, setPolicies] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [steps, setSteps] = useState<Record<string, StepState>>({});
  const [failure, setFailure] = useState<{ message: string; reservationId?: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // One registration block per adult.
  useEffect(() => {
    setPeople((ps) => (ps.length === adults ? ps : Array.from({ length: adults }, (_, i) => ps[i] ?? emptyPerson())));
  }, [adults]);

  const offers = useApi<any[]>(departure > today ? `/v1/rates/availability${qs({ arrival: today, departure, adults, children })}` : null);
  const cat = offers.data?.find((c) => c.category.id === categoryId);
  const rooms = useApi<any[]>(categoryId && departure > today ? `/v1/front-desk/walk-in/rooms${qs({ categoryId, departure, adults, children })}` : null);
  const eligible = rooms.data?.filter((r) => r.eligible) ?? [];
  useEffect(() => {
    if (eligible.length && !eligible.some((r) => r.roomId === roomId)) setRoomId(eligible[0].roomId);
    if (!eligible.length && roomId) setRoomId('');
  }, [rooms.data]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = (i: number, patch: Partial<Person>) => setPeople((ps) => ps.map((p, j) => (j === i ? { ...p, ...patch } : p)));

  /** Field-level validation; returns a map of "index.field" → message. */
  const errors: Record<string, string> = {};
  people.forEach((p, i) => {
    const req = t('validation.required');
    if (!p.firstName.trim()) errors[`${i}.firstName`] = req;
    if (!p.lastName.trim()) errors[`${i}.lastName`] = req;
    if (!p.dateOfBirth || p.dateOfBirth >= today) errors[`${i}.dateOfBirth`] = t('walkIn.dobPast');
    if (!isCountryCode(p.nationality)) errors[`${i}.nationality`] = t('validation.invalid_country');
    if (!isValidDocumentNumber(p.docType, p.docNumber)) errors[`${i}.docNumber`] = t('validation.invalid_document_number');
    if (!isCountryCode(p.issuingCountry)) errors[`${i}.issuingCountry`] = t('validation.invalid_country');
    if (!p.expiryDate || p.expiryDate < today) errors[`${i}.expiryDate`] = t('walkIn.expiryFuture');
    if (!p.front) errors[`${i}.front`] = t('walkIn.scanRequired');
    if (needsBack(p.docType) && !p.back) errors[`${i}.back`] = t('walkIn.scanRequired');
  });
  const stayValid = !!categoryId && !!ratePlanId && !!roomId && departure > today;
  const valid = stayValid && Object.keys(errors).length === 0 && (!checkInNow || policies);
  const e = (k: string) => (showErrors ? errors[k] : undefined);

  const run = async () => {
    setShowErrors(true);
    if (!valid) return;
    setBusy(true);
    setFailure(null);
    let reservationId: string | undefined;
    const step = async <T,>(name: string, fn: () => Promise<T>) => {
      setSteps((x) => ({ ...x, [name]: 'running' }));
      try {
        const r = await fn();
        setSteps((x) => ({ ...x, [name]: 'done' }));
        return r;
      } catch (ex) {
        setSteps((x) => ({ ...x, [name]: 'failed' }));
        throw ex;
      }
    };
    try {
      const toGuest = (p: Person, primary: boolean) => ({
        firstName: p.firstName.trim(),
        lastName: p.lastName.trim(),
        dateOfBirth: p.dateOfBirth,
        nationality: p.nationality,
        email: primary ? p.email.trim() || null : null,
        phone: primary ? p.phone.trim() || null : null,
        preferredLocale: p.preferredLocale,
        ...(primary ? {} : { isAdult: true }),
      });
      const created = await step('reservation', () =>
        api<any>('/v1/front-desk/walk-in', {
          method: 'POST',
          body: { departure, ratePlanId, categoryId, adults, children, roomId, guest: toGuest(people[0], true), additionalGuests: people.slice(1).map((p) => toGuest(p, false)) },
        }),
      );
      reservationId = created.reservationId;
      const docIds = await step('documents', async () => {
        const ids: string[] = [];
        for (let i = 0; i < people.length; i++) {
          const p = people[i];
          const form = new FormData();
          form.append('meta', JSON.stringify({ guestId: created.guestIds[i], reservationId, typeCode: p.docType, documentNumber: p.docNumber.trim().toUpperCase(), issuingCountry: p.issuingCountry, holderName: `${p.firstName} ${p.lastName}`.toUpperCase(), expiryDate: p.expiryDate }));
          const sides = ['FRONT', ...(p.back ? ['BACK'] : [])];
          form.append('sides', JSON.stringify(sides));
          form.append('files', p.front!, p.front!.name);
          if (p.back) form.append('files', p.back, p.back.name);
          const doc = await api<any>('/v1/documents', { method: 'POST', form });
          ids.push(doc.id);
        }
        return ids;
      });
      if (verifyNow) {
        await step('verify', async () => {
          for (const id of docIds) await api(`/v1/documents/${id}/review`, { method: 'POST', body: { decision: 'VERIFY', legible: true } });
        });
      }
      if (checkInNow) {
        await step('checkIn', () => api('/v1/front-desk/check-in', { method: 'POST', body: { reservationRoomId: created.reservationRoomId, acknowledgements: { policiesAccepted: true, registrationSigned: true }, keyCardsIssued: 2 } }));
      }
      router.push(`/app/reservations/${reservationId}`);
    } catch (ex) {
      setFailure({ message: err(ex), reservationId });
    } finally {
      setBusy(false);
    }
  };

  const StepIcon = ({ state }: { state?: StepState }) =>
    state === 'done' ? <CheckCircle2 className="h-4 w-4 text-emerald-700" aria-hidden /> : state === 'failed' ? <XCircle className="h-4 w-4 text-red-700" aria-hidden /> : state === 'running' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <Circle className="h-4 w-4 text-slate-300" aria-hidden />;

  return (
    <RequirePerm perm="frontdesk.checkin">
      <PageHeader title={t('nav.walkIn')} subtitle={f.date(today, { weekday: 'long', day: 'numeric', month: 'long' })} />
      <div className="space-y-5">
        <Card title={t('walkIn.stay')}>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label={t('reservations.departure')} htmlFor="wi-d" required>
              <Input id="wi-d" type="date" min={addDaysIso(today, 1)} value={departure} onChange={(ev) => setDeparture(ev.target.value)} />
            </Field>
            <Field label={t('common.adults')} htmlFor="wi-a"><Input id="wi-a" type="number" min={1} max={10} value={adults} onChange={(ev) => setAdults(Math.max(1, Math.min(10, Number(ev.target.value) || 1)))} /></Field>
            <Field label={t('common.children')} htmlFor="wi-c"><Input id="wi-c" type="number" min={0} max={10} value={children} onChange={(ev) => setChildren(Math.max(0, Number(ev.target.value) || 0))} /></Field>
          </div>
          {offers.isLoading && <Spinner />}
          {offers.data && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Field label={t('reservations.category')} htmlFor="wi-cat" required error={showErrors && !categoryId ? t('validation.required') : undefined}>
                <Select id="wi-cat" value={categoryId} onChange={(ev) => { setCategory(ev.target.value); setPlan(''); setRoomId(''); }}>
                  <option value="">—</option>
                  {offers.data.filter((c) => c.offers.length).map((c) => (
                    <option key={c.category.id} value={c.category.id}>{locale === 'ar' ? c.category.nameAr : c.category.nameEn} — {t('reservations.availableCount', { count: c.available })}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t('reservations.ratePlan')} htmlFor="wi-p" required error={showErrors && !ratePlanId ? t('validation.required') : undefined}>
                <Select id="wi-p" value={ratePlanId} onChange={(ev) => setPlan(ev.target.value)} disabled={!cat}>
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

        {categoryId && (
          <Card title={t('walkIn.room')}>
            <p className="mb-3 text-sm text-slate-600">{t('walkIn.roomHelp')}</p>
            {rooms.isLoading && <Spinner />}
            {rooms.data && !eligible.length && <Alert tone="warning">{t('walkIn.noRooms')}</Alert>}
            <fieldset className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
              <legend className="sr-only">{t('walkIn.room')}</legend>
              {eligible.map((r, i) => (
                <label key={r.roomId} className={`cursor-pointer rounded-lg border-2 p-3 text-center ${roomId === r.roomId ? 'border-brand-600 bg-brand-50' : 'border-slate-200 hover:border-slate-300'}`}>
                  <input type="radio" name="walkin-room" className="sr-only" value={r.roomId} aria-label={`${t('common.room')} ${r.number}`} checked={roomId === r.roomId} onChange={() => setRoomId(r.roomId)} />
                  <span className="flex items-center justify-center gap-1 text-lg font-bold"><BedDouble className="h-4 w-4" aria-hidden /><bdi>{r.number}</bdi></span>
                  <span className="block text-xs text-slate-500">{ln(r.room?.floor)}</span>
                  <span className="mt-1 block"><StatusBadge group="housekeeping" value={r.room?.housekeepingStatus ?? 'INSPECTED'} /></span>
                  {i === 0 && <span className="mt-1 block"><Badge tone="info">{t('walkIn.recommended')}</Badge></span>}
                </label>
              ))}
            </fieldset>
          </Card>
        )}

        {people.map((p, i) => (
          <Card key={i} title={<span>{t('walkIn.guestN', { n: i + 1 })}{i === 0 && <span className="ms-2"><Badge tone="info">{t('walkIn.primary')}</Badge></span>}</span>}>
            {i === 0 && <p className="mb-3 text-sm text-slate-600">{t('walkIn.adultHelp')}</p>}
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('guests.firstName')} htmlFor={`g${i}-fn`} required error={e(`${i}.firstName`)}>
                <Input id={`g${i}-fn`} autoComplete="off" value={p.firstName} onChange={(ev) => set(i, { firstName: ev.target.value })} aria-invalid={!!e(`${i}.firstName`)} />
              </Field>
              <Field label={t('guests.lastName')} htmlFor={`g${i}-ln`} required error={e(`${i}.lastName`)}>
                <Input id={`g${i}-ln`} autoComplete="off" value={p.lastName} onChange={(ev) => set(i, { lastName: ev.target.value })} aria-invalid={!!e(`${i}.lastName`)} />
              </Field>
              <Field label={t('guests.dateOfBirth')} htmlFor={`g${i}-dob`} required error={e(`${i}.dateOfBirth`)}>
                <Input id={`g${i}-dob`} type="date" max={today} value={p.dateOfBirth} onChange={(ev) => set(i, { dateOfBirth: ev.target.value })} aria-invalid={!!e(`${i}.dateOfBirth`)} />
              </Field>
              <Field label={t('guests.nationality')} htmlFor={`g${i}-nat`} required error={e(`${i}.nationality`)}>
                <CountrySelect id={`g${i}-nat`} required invalid={!!e(`${i}.nationality`)} value={p.nationality} onChange={(c) => set(i, { nationality: c, issuingCountry: p.issuingCountry || c })} />
              </Field>
              {i === 0 && (
                <>
                  <Field label={t('guests.phone')} htmlFor="g0-ph"><LtrInput id="g0-ph" type="tel" value={p.phone} onChange={(ev) => set(0, { phone: ev.target.value })} /></Field>
                  <Field label={t('guests.email')} htmlFor="g0-em"><LtrInput id="g0-em" type="email" value={p.email} onChange={(ev) => set(0, { email: ev.target.value })} /></Field>
                  <Field label={t('guests.preferredLanguage')} htmlFor="g0-loc">
                    <Select id="g0-loc" value={p.preferredLocale} onChange={(ev) => set(0, { preferredLocale: ev.target.value as 'ar' | 'en' })}>
                      <option value="ar">{t('enum.locale.ar')}</option>
                      <option value="en">{t('enum.locale.en')}</option>
                    </Select>
                  </Field>
                </>
              )}
            </div>

            <h3 className="mb-2 mt-5 font-semibold text-slate-800">{t('walkIn.document')}</h3>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <Field label={t('documents.type')} htmlFor={`g${i}-dt`} required>
                <Select id={`g${i}-dt`} value={p.docType} onChange={(ev) => set(i, { docType: ev.target.value as Person['docType'], back: null })}>
                  {DOC_TYPES.map((d) => <option key={d} value={d}>{t(`enum.documentType.${d}`)}</option>)}
                </Select>
              </Field>
              <Field label={t('documents.number')} htmlFor={`g${i}-no`} required hint={t('walkIn.numberHint')} error={e(`${i}.docNumber`)}>
                <LtrInput id={`g${i}-no`} autoComplete="off" value={p.docNumber} onChange={(ev) => set(i, { docNumber: ev.target.value.toUpperCase().replace(/\s/g, '') })} aria-invalid={!!e(`${i}.docNumber`)} />
              </Field>
              <Field label={t('documents.issuingCountry')} htmlFor={`g${i}-ic`} required error={e(`${i}.issuingCountry`)}>
                <CountrySelect id={`g${i}-ic`} required invalid={!!e(`${i}.issuingCountry`)} value={p.issuingCountry} onChange={(c) => set(i, { issuingCountry: c })} />
              </Field>
              <Field label={t('documents.expiryDate')} htmlFor={`g${i}-ex`} required error={e(`${i}.expiryDate`)}>
                <Input id={`g${i}-ex`} type="date" min={today} value={p.expiryDate} onChange={(ev) => set(i, { expiryDate: ev.target.value })} aria-invalid={!!e(`${i}.expiryDate`)} />
              </Field>
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <ScanSlot label={t('walkIn.front')} required file={p.front} onChange={(file) => set(i, { front: file })} error={e(`${i}.front`)} />
              <ScanSlot label={t('walkIn.back')} required={needsBack(p.docType)} file={p.back} onChange={(file) => set(i, { back: file })} error={e(`${i}.back`)} />
            </div>
          </Card>
        ))}

        <Card title={t('walkIn.finish')}>
          <div className="space-y-2">
            {s.can('documents.verify') && <Checkbox label={t('walkIn.verifyNow')} checked={verifyNow} onChange={(ev) => setVerifyNow(ev.target.checked)} />}
            <Checkbox label={t('walkIn.checkInNow')} checked={checkInNow} onChange={(ev) => setCheckInNow(ev.target.checked)} />
            {checkInNow && <Checkbox label={t('frontDesk.policiesAccepted')} checked={policies} onChange={(ev) => setPolicies(ev.target.checked)} />}
            {checkInNow && showErrors && !policies && <p className="text-xs text-red-700" role="alert">{t('validation.accept')}</p>}
            {showErrors && !roomId && categoryId && <p className="text-xs text-red-700" role="alert">{t('walkIn.noRooms')}</p>}
          </div>
          {Object.keys(steps).length > 0 && (
            <ol className="mt-4 space-y-1 text-sm">
              {[
                ['reservation', t('walkIn.stepReservation')],
                ['documents', t('walkIn.stepDocuments')],
                ...(verifyNow ? [['verify', t('walkIn.stepVerify')]] : []),
                ...(checkInNow ? [['checkIn', t('walkIn.stepCheckIn')]] : []),
              ].map(([k, label]) => (
                <li key={k} className="flex items-center gap-2"><StepIcon state={steps[k]} /> {label}</li>
              ))}
            </ol>
          )}
          {showErrors && !valid && !busy && !failure && <div className="mt-3"><Alert tone="warning">{t('walkIn.fixErrors')}</Alert></div>}
          {failure && (
            <div className="mt-3">
              <Alert tone="danger" title={failure.message}>
                {failure.reservationId && (
                  <>
                    {t('walkIn.partial')}{' '}
                    <Link href={`/app/reservations/${failure.reservationId}`} className="font-semibold underline">{t('walkIn.openReservation')}</Link>
                  </>
                )}
              </Alert>
            </div>
          )}
          <Button className="mt-4" icon={UserPlus} loading={busy} disabled={busy || !!failure?.reservationId} onClick={run}>
            {t('walkIn.submit')}
          </Button>
        </Card>
      </div>
    </RequirePerm>
  );
}
