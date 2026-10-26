'use client';

import { useQuery } from '@tanstack/react-query';
import { BedDouble, Check, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { PublicHeader } from '@/components/public-header';
import { SearchForm } from '@/components/public/search-form';
import { Alert, Badge, Button, EmptyState, Spinner } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api, qs } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { useFormat } from '@/lib/format';

function Results() {
  const t = useTranslations();
  const locale = useLocale();
  const ar = locale === 'ar';
  const f = useFormat();
  const err = useErrorMessage();
  const sp = useSearchParams();
  const params = {
    property: sp.get('property') ?? '',
    arrival: sp.get('arrival') ?? '',
    departure: sp.get('departure') ?? '',
    adults: Number(sp.get('adults') ?? 2),
    children: Number(sp.get('children') ?? 0),
    rooms: Number(sp.get('rooms') ?? 1),
    promo: sp.get('promo') ?? '',
  };
  const properties = useQuery({ queryKey: ['public-properties'], queryFn: () => api<any[]>('/v1/public/properties', { propertyId: null }) });
  const property = properties.data?.find((p) => p.code === params.property);
  const results = useQuery({
    queryKey: ['public-availability', params],
    queryFn: () =>
      api<any[]>(`/v1/public/properties/${params.property}/availability${qs({ arrival: params.arrival, departure: params.departure, adults: params.adults, children: params.children, rooms: params.rooms, promoCode: params.promo })}`, { propertyId: null }),
    enabled: !!params.property && !!params.arrival,
  });
  const nights = params.arrival && params.departure ? Math.round((Date.parse(params.departure) - Date.parse(params.arrival)) / 86_400_000) : 0;
  const tAmenity = (code: string) => (t.has(`enum.amenity.${code}` as any) ? t(`enum.amenity.${code}` as any) : code);
  const anyOffers = results.data?.some((c) => c.offers.length);

  return (
    <main id="main" className="mx-auto max-w-6xl space-y-6 px-4 py-6">
      {properties.data && <SearchForm properties={properties.data} initial={params} />}
      <h1 className="text-2xl font-bold">
        {t('public.results')}
        <span className="ms-2 text-base font-normal text-slate-600">
          {f.date(params.arrival)} – {f.date(params.departure)} · {t('common.nights', { count: nights })}
        </span>
      </h1>
      {results.isLoading && <Spinner />}
      {results.error && <Alert tone="danger">{err(results.error)}</Alert>}
      {results.data && !anyOffers && <EmptyState title={t('public.noAvailability')} body="" />}
      <div className="space-y-4">
        {results.data
          ?.filter((c) => c.offers.length || c.fits)
          .map((c) => (
            <article key={c.category.id} className="grid gap-4 rounded-xl border border-sand-200 bg-white p-4 shadow-sm md:grid-cols-3">
              <div className="md:col-span-1">
                <div className="mb-3 h-32 rounded-lg bg-gradient-to-br from-brand-100 to-sand-200" aria-hidden />
                <h2 className="text-lg font-semibold">{ar ? c.category.nameAr : c.category.nameEn}</h2>
                <p className="mt-1 text-sm text-slate-600">{ar ? c.category.descriptionAr : c.category.descriptionEn}</p>
                <p className="mt-2 flex flex-wrap items-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1"><Users className="h-3.5 w-3.5" aria-hidden />{t('public.upTo', { count: c.category.maxOccupancy })}</span>
                  {c.category.bedConfig && (
                    <span className="flex items-center gap-1"><BedDouble className="h-3.5 w-3.5" aria-hidden />{t.has(`enum.bed.${c.category.bedConfig}` as any) ? t(`enum.bed.${c.category.bedConfig}` as any) : c.category.bedConfig}</span>
                  )}
                </p>
                <ul className="mt-2 flex flex-wrap gap-1">
                  {c.category.amenities.map((a: string) => (
                    <li key={a}><Badge icon={null}>{tAmenity(a)}</Badge></li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3 md:col-span-2">
                {!c.fits && <Alert tone="warning">{t('public.doesNotFit')}</Alert>}
                {c.fits && !c.offers.length && <Alert tone="neutral">{t('public.soldOut')}</Alert>}
                {c.offers.length > 0 && c.available <= 3 && <Badge tone="warning">{t('public.available', { count: c.available })}</Badge>}
                {c.offers.map((o: any) => (
                  <div key={o.ratePlan.id} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3">
                    <div>
                      <p className="font-medium">{ar ? o.ratePlan.nameAr : o.ratePlan.nameEn}</p>
                      <p className="mt-1 flex items-center gap-1 text-xs text-slate-600">
                        <Check className="h-3.5 w-3.5" aria-hidden />
                        {o.ratePlan.refundable ? t('public.refundable', { hours: o.ratePlan.freeCancellationHours }) : t('public.nonRefundable')}
                      </p>
                      {Number(o.ratePlan.depositPercent) > 0 && <p className="text-xs text-slate-600">{t('public.deposit', { percent: Number(o.ratePlan.depositPercent) })}</p>}
                    </div>
                    <div className="text-end">
                      <p className="text-xl font-bold">{f.money(Number(o.quote.grandTotal) * params.rooms, property?.currency)}</p>
                      <p className="text-xs text-slate-500">{t('public.perStay')} · {t('public.includesTaxes')}</p>
                      <Link
                        className="mt-2 inline-block"
                        href={`/book?${new URLSearchParams({ ...Object.fromEntries(sp.entries()), category: c.category.id, ratePlan: o.ratePlan.id }).toString()}`}
                      >
                        <Button size="sm" tabIndex={-1}>{t('public.select')}</Button>
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          ))}
      </div>
    </main>
  );
}

export default function SearchPage() {
  return (
    <>
      <PublicHeader />
      <Suspense>
        <Results />
      </Suspense>
    </>
  );
}
