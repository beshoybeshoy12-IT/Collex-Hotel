'use client';

import { Languages } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useSearchParams } from 'next/navigation';
import { usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';

/** Switches between Arabic and English, keeping the current page and query string. */
export function LanguageSwitcher({ className }: { className?: string }) {
  const locale = useLocale();
  const t = useTranslations('common');
  const pathname = usePathname();
  const search = useSearchParams();
  const router = useRouter();
  const session = useSession();
  const next = locale === 'ar' ? 'en' : 'ar';
  return (
    <button
      type="button"
      lang={next}
      className={className ?? 'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100'}
      aria-label={`${t('language')}: ${t('switchTo')}`}
      onClick={() => {
        const q = search.toString();
        router.replace(`${pathname}${q ? `?${q}` : ''}`, { locale: next });
        if (session?.me) void api('/v1/auth/me/locale', { method: 'PUT', body: { locale: next }, propertyId: null }).catch(() => undefined);
      }}
    >
      <Languages className="h-4 w-4" aria-hidden />
      {t('switchTo')}
    </button>
  );
}
