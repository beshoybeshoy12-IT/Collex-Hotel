'use client';

import { Printer } from 'lucide-react';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { SessionProvider } from '@/lib/session';
import { Button } from './ui';

/**
 * Printable documents are rendered as HTML by the browser so Arabic glyph shaping, ligatures and RTL
 * paragraphs are correct; "Save as PDF" in the print dialog produces the PDF.
 */
export function PrintShell({ children }: { children: ReactNode }) {
  const t = useTranslations('common');
  return (
    <SessionProvider>
      <div className="mx-auto max-w-3xl bg-white p-8 print:p-0">
        <div className="no-print mb-6 flex justify-end">
          <Button icon={Printer} onClick={() => window.print()}>{t('print')}</Button>
        </div>
        {children}
      </div>
    </SessionProvider>
  );
}
