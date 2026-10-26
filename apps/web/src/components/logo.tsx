'use client';

import clsx from 'clsx';
import { useTranslations } from 'next-intl';

/**
 * Collex brand logo. The source PNGs are square with padding; the viewBox crops to the artwork.
 * `light` uses the white version for dark backgrounds.
 */
export function Logo({ light, className }: { light?: boolean; className?: string }) {
  const t = useTranslations('common');
  return (
    <svg viewBox="45 220 720 300" role="img" aria-label={t('appName')} className={clsx('h-9 w-auto', className)}>
      <image href={light ? '/brand/collex-logo-white.png' : '/brand/collex-logo-black.png'} width="834" height="834" />
    </svg>
  );
}
