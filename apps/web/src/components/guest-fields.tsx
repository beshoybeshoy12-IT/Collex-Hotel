'use client';

import { useTranslations } from 'next-intl';
import { useId } from 'react';
import { Checkbox, Field, Input, LtrInput, Select } from './ui';
import { CountrySelect } from './country-select';

export interface GuestValues {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  nationality: string;
  dateOfBirth: string;
  preferredLocale: 'ar' | 'en';
  vip: boolean;
  preferences: { accessible?: boolean; bedType?: string };
}

export const emptyGuest = (): GuestValues => ({ firstName: '', lastName: '', email: '', phone: '', nationality: '', dateOfBirth: '', preferredLocale: 'ar', vip: false, preferences: {} });

/** Converts form values to the API guest payload (empty strings become null). */
export function toGuestPayload(g: GuestValues) {
  return {
    firstName: g.firstName.trim(),
    lastName: g.lastName.trim(),
    email: g.email.trim() || null,
    phone: g.phone.trim() || null,
    nationality: g.nationality.trim() || null,
    dateOfBirth: g.dateOfBirth || null,
    preferredLocale: g.preferredLocale,
    vip: g.vip,
    preferences: g.preferences,
  };
}

export function GuestFields({ value, onChange, compact }: { value: GuestValues; onChange(v: GuestValues): void; compact?: boolean }) {
  const t = useTranslations();
  const id = useId();
  const set = <K extends keyof GuestValues>(k: K, v: GuestValues[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <Field label={t('guests.firstName')} htmlFor={`${id}-fn`} required>
        <Input id={`${id}-fn`} value={value.firstName} onChange={(e) => set('firstName', e.target.value)} required />
      </Field>
      <Field label={t('guests.lastName')} htmlFor={`${id}-ln`} required>
        <Input id={`${id}-ln`} value={value.lastName} onChange={(e) => set('lastName', e.target.value)} required />
      </Field>
      <Field label={t('guests.nationality')} htmlFor={`${id}-nat`}>
        <CountrySelect id={`${id}-nat`} value={value.nationality} onChange={(c) => set('nationality', c)} />
      </Field>
      {!compact && (
        <>
          <Field label={t('guests.email')} htmlFor={`${id}-em`}>
            <LtrInput id={`${id}-em`} type="email" value={value.email} onChange={(e) => set('email', e.target.value)} />
          </Field>
          <Field label={t('guests.phone')} htmlFor={`${id}-ph`}>
            <LtrInput id={`${id}-ph`} type="tel" value={value.phone} onChange={(e) => set('phone', e.target.value)} />
          </Field>
          <Field label={t('guests.dateOfBirth')} htmlFor={`${id}-dob`}>
            <Input id={`${id}-dob`} type="date" value={value.dateOfBirth} onChange={(e) => set('dateOfBirth', e.target.value)} />
          </Field>
          <Field label={t('guests.preferredLanguage')} htmlFor={`${id}-loc`}>
            <Select id={`${id}-loc`} value={value.preferredLocale} onChange={(e) => set('preferredLocale', e.target.value as 'ar' | 'en')}>
              <option value="ar">{t('enum.locale.ar')}</option>
              <option value="en">{t('enum.locale.en')}</option>
            </Select>
          </Field>
          <div className="flex flex-col justify-end gap-2 sm:col-span-2">
            <Checkbox label={t('guests.vip')} checked={value.vip} onChange={(e) => set('vip', e.target.checked)} />
            <Checkbox label={t('guests.accessible')} checked={!!value.preferences.accessible} onChange={(e) => set('preferences', { ...value.preferences, accessible: e.target.checked })} />
          </div>
        </>
      )}
    </div>
  );
}
