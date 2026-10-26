'use client';

import { Search } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useState } from 'react';
import { useRouter } from '@/i18n/navigation';
import { addDaysIso, businessToday } from '@/lib/format';
import { Button, Field, Input, LtrInput, Select } from '../ui';

export interface SearchValues {
  property: string;
  arrival: string;
  departure: string;
  adults: number;
  children: number;
  rooms: number;
  promo?: string;
}

export function SearchForm({ properties, initial }: { properties: { code: string; name: string; nameAr: string }[]; initial?: Partial<SearchValues> }) {
  const t = useTranslations();
  const locale = useLocale();
  const router = useRouter();
  const today = businessToday();
  const [v, setV] = useState<SearchValues>({
    property: initial?.property ?? properties[0]?.code ?? '',
    arrival: initial?.arrival ?? today,
    departure: initial?.departure ?? addDaysIso(today, 1),
    adults: initial?.adults ?? 2,
    children: initial?.children ?? 0,
    rooms: initial?.rooms ?? 1,
    promo: initial?.promo ?? '',
  });
  const invalid = v.departure <= v.arrival;
  const set = (k: keyof SearchValues, val: string | number) => setV((s) => ({ ...s, [k]: val }));
  return (
    <form
      className="grid gap-3 rounded-2xl bg-white p-4 shadow-lg sm:grid-cols-2 lg:grid-cols-7"
      onSubmit={(e) => {
        e.preventDefault();
        if (invalid) return;
        const q = new URLSearchParams({ property: v.property, arrival: v.arrival, departure: v.departure, adults: String(v.adults), children: String(v.children), rooms: String(v.rooms) });
        if (v.promo) q.set('promo', v.promo);
        router.push(`/search?${q.toString()}`);
      }}
    >
      <Field label={t('public.chooseProperty')} htmlFor="sf-prop" className="lg:col-span-2">
        <Select id="sf-prop" value={v.property} onChange={(e) => set('property', e.target.value)}>
          {properties.map((p) => (
            <option key={p.code} value={p.code}>
              {locale === 'ar' ? p.nameAr : p.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label={t('public.arrival')} htmlFor="sf-arr">
        <Input id="sf-arr" type="date" min={today} value={v.arrival} onChange={(e) => set('arrival', e.target.value)} required />
      </Field>
      <Field label={t('public.departure')} htmlFor="sf-dep" error={invalid ? t('validation.departure_after_arrival') : undefined}>
        <Input id="sf-dep" type="date" min={addDaysIso(v.arrival, 1)} value={v.departure} onChange={(e) => set('departure', e.target.value)} required aria-invalid={invalid} />
      </Field>
      <Field label={t('common.adults')} htmlFor="sf-ad">
        <Input id="sf-ad" type="number" min={1} max={20} value={v.adults} onChange={(e) => set('adults', Number(e.target.value))} />
      </Field>
      <Field label={t('common.children')} htmlFor="sf-ch">
        <Input id="sf-ch" type="number" min={0} max={20} value={v.children} onChange={(e) => set('children', Number(e.target.value))} />
      </Field>
      <Field label={t('common.rooms')} htmlFor="sf-rm">
        <Input id="sf-rm" type="number" min={1} max={10} value={v.rooms} onChange={(e) => set('rooms', Number(e.target.value))} />
      </Field>
      <Field label={t('public.promoCode')} htmlFor="sf-promo" className="lg:col-span-2">
        <LtrInput id="sf-promo" value={v.promo} onChange={(e) => set('promo', e.target.value.toUpperCase())} />
      </Field>
      <div className="flex items-end lg:col-span-5 lg:justify-end">
        <Button type="submit" icon={Search} className="w-full lg:w-auto" disabled={invalid || !v.property}>
          {t('public.searchRooms')}
        </Button>
      </div>
    </form>
  );
}
