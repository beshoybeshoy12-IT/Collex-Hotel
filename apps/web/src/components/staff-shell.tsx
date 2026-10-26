'use client';

import clsx from 'clsx';
import {
  BarChart3,
  BedDouble,
  CalendarCheck,
  ClipboardList,
  ConciergeBell,
  FileCheck2,
  Hotel,
  LayoutDashboard,
  LogOut,
  Menu,
  ScrollText,
  Settings,
  Sparkles,
  UserPlus,
  Users,
  Wrench,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useLocale, useTranslations } from 'next-intl';
import { Suspense, useEffect, useState, type ReactNode } from 'react';
import { Permissions as P, type Permission } from '@collex/shared';
import { Link, usePathname, useRouter } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { SessionProvider, useRequiredSession } from '@/lib/session';
import { LanguageSwitcher } from './language-switcher';
import { Alert, Select, Spinner } from './ui';

const NAV: { href: string; key: string; icon: LucideIcon; perm: Permission }[] = [
  { href: '/app', key: 'dashboard', icon: LayoutDashboard, perm: P.RESERVATIONS_READ },
  { href: '/app/front-desk', key: 'frontDesk', icon: ConciergeBell, perm: P.CHECKIN },
  { href: '/app/reservations', key: 'reservations', icon: CalendarCheck, perm: P.RESERVATIONS_READ },
  { href: '/app/walk-in', key: 'walkIn', icon: UserPlus, perm: P.CHECKIN },
  { href: '/app/guests', key: 'guests', icon: Users, perm: P.GUESTS_READ },
  { href: '/app/documents', key: 'documents', icon: FileCheck2, perm: P.DOCUMENTS_VIEW },
  { href: '/app/rooms', key: 'rooms', icon: BedDouble, perm: P.ROOMS_READ },
  { href: '/app/housekeeping', key: 'housekeeping', icon: Sparkles, perm: P.HOUSEKEEPING_READ },
  { href: '/app/maintenance', key: 'maintenance', icon: Wrench, perm: P.MAINTENANCE_READ },
  { href: '/app/services', key: 'services', icon: ClipboardList, perm: P.SERVICES_READ },
  { href: '/app/reports', key: 'reports', icon: BarChart3, perm: P.REPORTS_READ },
  { href: '/app/audit', key: 'audit', icon: ScrollText, perm: P.AUDIT_READ },
  { href: '/app/settings', key: 'settings', icon: Settings, perm: P.PROPERTY_READ },
];

function Shell({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const locale = useLocale();
  const s = useRequiredSession();
  const pathname = usePathname();
  const router = useRouter();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (s.unauthenticated) router.replace('/login');
  }, [s.unauthenticated, router]);

  if (s.loading || s.unauthenticated) return <div className="p-8"><Spinner /></div>;
  if (!s.me || !s.property) return <div className="p-8"><Alert tone="danger">{t('auth.accessDenied')}</Alert></div>;

  const items = NAV.filter((n) => s.can(n.perm));
  const active = (href: string) => (href === '/app' ? pathname === '/app' : pathname.startsWith(href));
  const nav = (
    <nav aria-label={t('nav.menu')} className="space-y-0.5">
      {items.map((n) => (
        <Link
          key={n.href}
          href={n.href}
          aria-current={active(n.href) ? 'page' : undefined}
          className={clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium', active(n.href) ? 'bg-brand-600 text-white' : 'text-slate-200 hover:bg-white/10')}
        >
          <n.icon className="h-4 w-4 shrink-0" aria-hidden />
          {t(`nav.${n.key}` as any)}
        </Link>
      ))}
    </nav>
  );
  const sidebar = (
    <div className="flex h-full flex-col gap-4 bg-brand-900 p-4 text-white">
      <Link href="/app" className="flex items-center gap-2 text-lg font-bold">
        <Hotel className="h-6 w-6" aria-hidden /> {t('common.appName')}
      </Link>
      {s.me.properties.length > 1 ? (
        <label className="text-xs text-brand-100">
          {t('common.property')}
          <Select className="mt-1 !text-slate-900" value={s.property.id} onChange={(e) => s.setProperty(e.target.value)}>
            {s.me.properties.map((p) => (
              <option key={p.id} value={p.id}>{locale === 'ar' ? p.nameAr : p.name}</option>
            ))}
          </Select>
        </label>
      ) : (
        <p className="text-sm text-brand-100">{locale === 'ar' ? s.property.nameAr : s.property.name}</p>
      )}
      <div className="flex-1 overflow-y-auto">{nav}</div>
      <div className="space-y-2 border-t border-white/10 pt-3 text-sm">
        <p className="truncate font-medium">{s.me.fullName}</p>
        <Suspense>
          <LanguageSwitcher className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-200 hover:bg-white/10" />
        </Suspense>
        <button
          className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-slate-200 hover:bg-white/10"
          onClick={async () => {
            await api('/v1/auth/logout', { method: 'POST', propertyId: null }).catch(() => undefined);
            qc.clear();
            router.replace('/login');
          }}
        >
          <LogOut className="h-4 w-4 rtl:rotate-180" aria-hidden /> {t('common.logout')}
        </button>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen lg:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:start-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:p-2">
        {t('common.skipToContent')}
      </a>
      <aside className="no-print hidden w-64 shrink-0 lg:block">
        <div className="sticky top-0 h-screen">{sidebar}</div>
      </aside>
      <div className="no-print flex items-center justify-between border-b bg-white px-4 py-2 lg:hidden">
        <button onClick={() => setOpen(true)} className="rounded p-2 hover:bg-slate-100" aria-label={t('nav.menu')} aria-expanded={open}>
          <Menu className="h-5 w-5" aria-hidden />
        </button>
        <span className="font-semibold">{t('common.appName')}</span>
        <span className="w-9" />
      </div>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-900/50" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 start-0 w-72">
            <button onClick={() => setOpen(false)} className="absolute end-2 top-2 z-10 rounded p-1 text-white" aria-label={t('common.close')}>
              <X className="h-5 w-5" aria-hidden />
            </button>
            {sidebar}
          </div>
        </div>
      )}
      <main id="main" className="min-w-0 flex-1 p-4 lg:p-6">
        {children}
      </main>
    </div>
  );
}

export function StaffShell({ children }: { children: ReactNode }) {
  return (
    <SessionProvider>
      <Shell>{children}</Shell>
    </SessionProvider>
  );
}

/** Renders children only when the current user has the permission at the selected property. */
export function RequirePerm({ perm, children }: { perm: Permission; children: ReactNode }) {
  const s = useRequiredSession();
  const t = useTranslations('auth');
  if (!s.can(perm)) return <Alert tone="danger">{t('accessDenied')}</Alert>;
  return <>{children}</>;
}
