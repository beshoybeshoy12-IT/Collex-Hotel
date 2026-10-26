'use client';

import { useLocale } from 'next-intl';
import { useMemo } from 'react';
import { useSession } from './session';

/**
 * Locale-aware formatting. Arabic uses the Gregorian calendar (hotel business dates) and either
 * Western or Arabic-Indic digits according to the property's preference.
 */
export function localeTag(locale: string, arabicDigits: boolean) {
  return locale === 'ar' ? `ar-u-ca-gregory-nu-${arabicDigits ? 'arab' : 'latn'}` : 'en-GB';
}

export function useFormat() {
  const locale = useLocale();
  const session = useSession();
  const arabicDigits = !!session?.property?.arabicNumerals;
  const timeZone = session?.property?.timezone ?? 'Asia/Riyadh';
  return useMemo(() => {
    const tag = localeTag(locale, arabicDigits);
    /** Business dates ("YYYY-MM-DD") are formatted as calendar dates without time-zone conversion. */
    const date = (iso: string | null | undefined, opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' }) => {
      if (!iso) return '—';
      const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
      return new Intl.DateTimeFormat(tag, { ...opts, timeZone: 'UTC' }).format(d);
    };
    const dateTime = (value: string | Date | null | undefined) => {
      if (!value) return '—';
      return new Intl.DateTimeFormat(tag, { dateStyle: 'medium', timeStyle: 'short', timeZone }).format(new Date(value));
    };
    const money = (amount: string | number | null | undefined, currency = session?.property?.currency ?? 'SAR') => {
      if (amount === null || amount === undefined || amount === '') return '—';
      return new Intl.NumberFormat(tag, { style: 'currency', currency }).format(Number(amount));
    };
    const number = (n: number | string) => new Intl.NumberFormat(tag).format(Number(n));
    const percent = (n: number | string) => new Intl.NumberFormat(tag, { maximumFractionDigits: 1 }).format(Number(n)) + '%';
    return { date, dateTime, money, number, percent, tag };
  }, [locale, arabicDigits, timeZone, session?.property?.currency]);
}

/** Today's business date in a time zone, as YYYY-MM-DD. */
export function businessToday(timeZone = 'Asia/Riyadh') {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const g = (t: string) => p.find((x) => x.type === t)!.value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

export function addDaysIso(iso: string, n: number) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
