'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { CountrySelect } from '@/components/country-select';
import { PublicHeader } from '@/components/public-header';
import { Alert, Button, Card, Checkbox, Field, Input, LtrInput, Select, Spinner, Textarea } from '@/components/ui';
import { useRouter } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';

const schema = z.object({
  firstName: z.string().trim().min(1, 'required'),
  lastName: z.string().trim().min(1, 'required'),
  email: z.string().trim().email('invalid_email'),
  phone: z.string().trim().max(40).optional(),
  nationality: z.string().trim().length(2).optional().or(z.literal('')),
  specialRequests: z.string().max(2000).optional(),
  acceptPolicies: z.literal(true, { errorMap: () => ({ message: 'accept' }) }),
});
type Values = z.infer<typeof schema>;

function BookingForm() {
  const t = useTranslations();
  const tv = useTranslations('validation');
  const locale = useLocale();
  const ar = locale === 'ar';
  const f = useFormat();
  const err = useErrorMessage();
  const router = useRouter();
  const sp = useSearchParams();
  const p = Object.fromEntries(sp.entries());
  const rooms = Number(p.rooms ?? 1);
  const adults = Number(p.adults ?? 2);
  const children = Number(p.children ?? 0);

  const offer = useQuery({
    queryKey: ['public-offer', p],
    queryFn: async () => {
      const list = await api<any[]>(`/v1/public/properties/${p.property}/availability${qs({ arrival: p.arrival, departure: p.departure, adults, children, rooms, promoCode: p.promo })}`, { propertyId: null });
      const cat = list.find((c) => c.category.id === p.category);
      return { category: cat?.category, offer: cat?.offers.find((o: any) => o.ratePlan.id === p.ratePlan) };
    },
  });
  const properties = useQuery({ queryKey: ['public-properties'], queryFn: () => api<any[]>('/v1/public/properties', { propertyId: null }) });
  const property = properties.data?.find((x) => x.code === p.property);

  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { specialRequests: '' } });
  const book = useMutation({
    mutationFn: (v: Values) =>
      api<any>(`/v1/public/properties/${p.property}/bookings`, {
        method: 'POST',
        propertyId: null,
        body: {
          arrival: p.arrival,
          departure: p.departure,
          ratePlanId: p.ratePlan,
          rooms: Array.from({ length: rooms }, (_, i) => ({
            categoryId: p.category,
            adults: Math.max(1, Math.floor(adults / rooms) + (i < adults % rooms ? 1 : 0)),
            children: Math.floor(children / rooms) + (i < children % rooms ? 1 : 0),
          })),
          guest: { firstName: v.firstName, lastName: v.lastName, email: v.email, phone: v.phone || null, nationality: v.nationality || null, preferredLocale: locale },
          specialRequests: v.specialRequests ?? '',
          promoCode: p.promo || undefined,
          acceptPolicies: true,
        },
      }),
    onSuccess: () => router.push('/portal'),
  });
  const fe = (k: keyof Values) => {
    const m = form.formState.errors[k]?.message;
    return m ? (tv.has(m as any) ? tv(m as any) : tv('required')) : undefined;
  };

  if (offer.isLoading) return <Spinner />;
  const q = offer.data?.offer?.quote;
  return (
    <main id="main" className="mx-auto grid max-w-6xl gap-6 px-4 py-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <Card title={t('public.guestDetails')}>
          <form className="grid gap-4 sm:grid-cols-2" onSubmit={form.handleSubmit((v) => book.mutate(v))} noValidate>
            <Field label={t('guests.firstName')} htmlFor="b-fn" required error={fe('firstName')}>
              <Input id="b-fn" autoComplete="given-name" {...form.register('firstName')} aria-invalid={!!fe('firstName')} />
            </Field>
            <Field label={t('guests.lastName')} htmlFor="b-ln" required error={fe('lastName')}>
              <Input id="b-ln" autoComplete="family-name" {...form.register('lastName')} aria-invalid={!!fe('lastName')} />
            </Field>
            <Field label={t('guests.email')} htmlFor="b-em" required error={fe('email')}>
              <LtrInput id="b-em" type="email" autoComplete="email" {...form.register('email')} aria-invalid={!!fe('email')} />
            </Field>
            <Field label={t('guests.phone')} htmlFor="b-ph">
              <LtrInput id="b-ph" type="tel" autoComplete="tel" {...form.register('phone')} />
            </Field>
            <Field label={t('guests.nationality')} htmlFor="b-nat">
              <CountrySelect id="b-nat" value={form.watch('nationality') ?? ''} onChange={(c) => form.setValue('nationality', c)} />
            </Field>
            <Field label={t('public.specialRequests')} htmlFor="b-sr" className="sm:col-span-2">
              <Textarea id="b-sr" {...form.register('specialRequests')} />
            </Field>
            <div className="sm:col-span-2 space-y-1">
              <Checkbox label={t('public.acceptPolicies')} {...form.register('acceptPolicies')} />
              {fe('acceptPolicies') && <p className="text-xs text-red-700" role="alert">{fe('acceptPolicies')}</p>}
              {property && <p className="text-xs text-slate-600">{ar ? property.policiesAr : property.policiesEn}</p>}
            </div>
            {book.error && <div className="sm:col-span-2"><Alert tone="danger">{err(book.error)}</Alert></div>}
            <div className="sm:col-span-2">
              <Button type="submit" loading={book.isPending} disabled={!q}>
                {t('public.completeBooking')}
              </Button>
            </div>
          </form>
        </Card>
      </div>
      <aside>
        <Card title={t('public.yourBooking')}>
          {!q ? (
            <Alert tone="warning">{t('public.soldOut')}</Alert>
          ) : (
            <dl className="space-y-2 text-sm">
              <div>
                <dt className="font-semibold">{ar ? offer.data?.category?.nameAr : offer.data?.category?.nameEn}</dt>
                <dd className="text-slate-600">{ar ? offer.data?.offer.ratePlan.nameAr : offer.data?.offer.ratePlan.nameEn}</dd>
              </div>
              <div className="flex justify-between"><dt>{t('public.arrival')}</dt><dd>{f.date(p.arrival)}</dd></div>
              <div className="flex justify-between"><dt>{t('public.departure')}</dt><dd>{f.date(p.departure)}</dd></div>
              <div className="flex justify-between"><dt>{t('common.rooms')}</dt><dd>{f.number(rooms)}</dd></div>
              <details className="rounded bg-slate-50 p-2">
                <summary className="cursor-pointer">{t('public.nightlyBreakdown')}</summary>
                <ul className="mt-1 space-y-1">
                  {q.nights.map((n: any) => (
                    <li key={n.date} className="flex justify-between"><span>{f.date(n.date)}</span><span>{f.money(n.amount, property?.currency)}</span></li>
                  ))}
                </ul>
              </details>
              <div className="flex justify-between"><dt>{t('public.subtotal')}</dt><dd>{f.money(Number(q.roomTotal) * rooms, property?.currency)}</dd></div>
              {Number(q.discount) > 0 && <div className="flex justify-between"><dt>{t('public.discount')}</dt><dd>−{f.money(Number(q.discount) * rooms, property?.currency)}</dd></div>}
              {Number(q.serviceCharge) > 0 && <div className="flex justify-between"><dt>{t('public.serviceCharge')}</dt><dd>{f.money(Number(q.serviceCharge) * rooms, property?.currency)}</dd></div>}
              <div className="flex justify-between"><dt>{t('public.taxes')}</dt><dd>{f.money(Number(q.tax) * rooms, property?.currency)}</dd></div>
              <div className="flex justify-between border-t pt-2 text-base font-bold"><dt>{t('public.grandTotal')}</dt><dd>{f.money(Number(q.grandTotal) * rooms, property?.currency)}</dd></div>
            </dl>
          )}
        </Card>
      </aside>
    </main>
  );
}

export default function BookPage() {
  return (
    <>
      <PublicHeader />
      <Suspense>
        <BookingForm />
      </Suspense>
    </>
  );
}
