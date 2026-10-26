export const locales = ['ar', 'en'] as const;
export type AppLocale = (typeof locales)[number];
/** Arabic is the default language for new installations and first-time visitors. */
export const defaultLocale: AppLocale = 'ar';
export const LOCALE_COOKIE = 'NEXT_LOCALE';

export function isLocale(value: string | undefined | null): value is AppLocale {
  return !!value && (locales as readonly string[]).includes(value);
}

export function dirOf(locale: AppLocale): 'rtl' | 'ltr' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}
