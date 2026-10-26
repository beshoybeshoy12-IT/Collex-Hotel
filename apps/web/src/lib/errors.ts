'use client';

import { useTranslations } from 'next-intl';
import { ApiError } from './api';

/** Translates API error codes into the active language. Unknown codes fall back to a generic message. */
export function useErrorMessage() {
  const t = useTranslations('errors');
  return (e: unknown): string => {
    if (e instanceof ApiError) {
      if (e.code === 'NETWORK') return t('network');
      if (e.code === 'INTERNAL_ERROR') return t('INTERNAL_ERROR', { ref: e.correlationId?.slice(0, 8) ?? '-' });
      if (t.has(e.code as any)) return t(e.code as any);
    }
    return t('generic');
  };
}
