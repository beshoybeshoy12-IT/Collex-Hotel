import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { IBM_Plex_Sans_Arabic } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, getTranslations, setRequestLocale } from 'next-intl/server';
import { dirOf, isLocale, locales } from '@/i18n/config';
import { Providers } from '@/components/providers';
import '../globals.css';

// Arabic-capable font with correct shaping and ligatures; also covers Latin.
const font = IBM_Plex_Sans_Arabic({ subsets: ['arabic', 'latin'], weight: ['400', '500', '600', '700'], variable: '--font-arabic', display: 'swap' });

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale: isLocale(locale) ? locale : 'ar', namespace: 'meta' });
  return { title: { default: t('title'), template: `%s · ${t('title')}` }, description: t('description') };
}

export default async function LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();
  return (
    <html lang={locale} dir={dirOf(locale)} className={font.variable}>
      <body className="min-h-screen font-sans">
        <NextIntlClientProvider locale={locale} messages={messages} timeZone="Asia/Riyadh">
          <Providers>{children}</Providers>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
