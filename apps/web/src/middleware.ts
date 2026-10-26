import { NextRequest, NextResponse } from 'next/server';
import { defaultLocale, isLocale, LOCALE_COOKIE } from './i18n/config';

/**
 * Locale routing: every page lives under /ar or /en. Visitors without a saved preference get
 * Arabic (the default); the last chosen language is remembered in a cookie.
 */
export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const first = pathname.split('/')[1];
  if (isLocale(first)) {
    const res = NextResponse.next();
    res.headers.set('x-locale', first);
    if (req.cookies.get(LOCALE_COOKIE)?.value !== first) {
      res.cookies.set(LOCALE_COOKIE, first, { path: '/', sameSite: 'lax', maxAge: 60 * 60 * 24 * 365 });
    }
    return res;
  }
  const saved = req.cookies.get(LOCALE_COOKIE)?.value;
  const locale = isLocale(saved) ? saved : defaultLocale;
  const url = req.nextUrl.clone();
  url.pathname = `/${locale}${pathname === '/' ? '' : pathname}`;
  url.search = search;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ['/((?!api|_next|.*\..*).*)'],
};
