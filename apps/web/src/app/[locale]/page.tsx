'use client';

import { useQuery } from '@tanstack/react-query';
import { Clock, MapPin, Users } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { PublicHeader } from '@/components/public-header';
import { SearchForm } from '@/components/public/search-form';
import { Badge, Spinner } from '@/components/ui';
import { api } from '@/lib/api';

export default function HomePage() {
  const t = useTranslations();
  const locale = useLocale();
  const ar = locale === 'ar';
  const properties = useQuery({ queryKey: ['public-properties'], queryFn: () => api<any[]>('/v1/public/properties', { propertyId: null }) });
  const first = properties.data?.[0];
  const detail = useQuery({ queryKey: ['public-property', first?.code], queryFn: () => api<any>(`/v1/public/properties/${first.code}`, { propertyId: null }), enabled: !!first });
  const tAmenity = (code: string) => (t.has(`enum.amenity.${code}` as any) ? t(`enum.amenity.${code}` as any) : code);

  return (
    <>
      <PublicHeader />
      <main id="main">
        <section className="bg-gradient-to-b from-brand-900 to-brand-700 px-4 pb-20 pt-14 text-white">
          <div className="mx-auto max-w-6xl">
            <h1 className="text-3xl font-bold sm:text-4xl">{t('public.heroTitle')}</h1>
            <p className="mt-3 max-w-2xl text-brand-50">{t('public.heroSubtitle')}</p>
          </div>
        </section>
        <div className="mx-auto -mt-12 max-w-6xl px-4">
          {properties.isLoading ? <Spinner /> : properties.data && <SearchForm properties={properties.data} />}
        </div>
        {detail.data && (
          <div className="mx-auto mt-10 max-w-6xl space-y-10 px-4 pb-16">
            <section className="grid gap-6 lg:grid-cols-3">
              <div className="lg:col-span-2">
                <h2 className="text-2xl font-bold">{ar ? detail.data.nameAr : detail.data.name}</h2>
                <p className="mt-1 flex items-center gap-1 text-sm text-slate-600">
                  <MapPin className="h-4 w-4" aria-hidden /> {detail.data.address}
                </p>
                <p className="mt-4 leading-relaxed text-slate-700">{ar ? detail.data.descriptionAr : detail.data.descriptionEn}</p>
              </div>
              <div className="rounded-xl border border-sand-200 bg-white p-4">
                <h3 className="font-semibold">{t('public.policies')}</h3>
                <ul className="mt-2 space-y-1 text-sm text-slate-700">
                  <li className="flex items-center gap-2">
                    <Clock className="h-4 w-4" aria-hidden />
                    {t('public.checkInFrom', { time: detail.data.checkInTime })}
                  </li>
                  <li className="flex items-center gap-2">
                    <Clock className="h-4 w-4" aria-hidden />
                    {t('public.checkOutUntil', { time: detail.data.checkOutTime })}
                  </li>
                </ul>
                <p className="mt-3 text-sm text-slate-600">{ar ? detail.data.policiesAr : detail.data.policiesEn}</p>
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-xl font-bold">{t('public.amenities')}</h2>
              <ul className="flex flex-wrap gap-2">
                {detail.data.amenities.map((a: string) => (
                  <li key={a}>
                    <Badge tone="info" icon={null}>
                      {tAmenity(a)}
                    </Badge>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-3 text-xl font-bold">{t('public.roomTypes')}</h2>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {detail.data.categories.map((c: any) => (
                  <article key={c.id} className="rounded-xl border border-sand-200 bg-white p-4 shadow-sm">
                    <div className="mb-3 h-28 rounded-lg bg-gradient-to-br from-brand-100 to-sand-200" aria-hidden />
                    <h3 className="font-semibold">{ar ? c.nameAr : c.nameEn}</h3>
                    <p className="mt-1 text-sm text-slate-600">{ar ? c.descriptionAr : c.descriptionEn}</p>
                    <p className="mt-2 flex items-center gap-1 text-xs text-slate-500">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {t('public.upTo', { count: c.maxOccupancy })}
                      {c.sizeSqm ? ` · ${t('public.sizeSqm', { size: c.sizeSqm })}` : ''}
                    </p>
                  </article>
                ))}
              </div>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
