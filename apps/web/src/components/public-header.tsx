'use client';

import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import { Link } from '@/i18n/navigation';
import { LanguageSwitcher } from './language-switcher';
import { Logo } from './logo';

export function PublicHeader() {
  const t = useTranslations();
  return (
    <header className="border-b border-sand-200 bg-white/90 backdrop-blur">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:rounded focus:bg-white focus:p-2">
        {t('common.skipToContent')}
      </a>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <Link href="/" className="flex items-center">
          <Logo className="h-10" />
        </Link>
        <nav className="flex flex-wrap items-center gap-1 text-sm" aria-label={t('nav.menu')}>
          <Link href="/" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">{t('nav.book')}</Link>
          <Link href="/portal" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">{t('nav.portal')}</Link>
          <Link href="/login" className="rounded-lg px-3 py-1.5 hover:bg-slate-100">{t('nav.staffLogin')}</Link>
          <Suspense>
            <LanguageSwitcher />
          </Suspense>
        </nav>
      </div>
    </header>
  );
}
