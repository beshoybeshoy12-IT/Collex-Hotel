'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { PublicHeader } from '@/components/public-header';
import { Alert, Button, Card, Field, LtrInput } from '@/components/ui';
import { Link } from '@/i18n/navigation';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';

/** The reset token travels in the URL fragment (#token=…) so it is never sent to servers or logged. */
export default function ResetPasswordPage() {
  const t = useTranslations();
  const err = useErrorMessage();
  const [token, setToken] = useState('');
  const [password, setPassword] = useState('');
  useEffect(() => {
    const m = window.location.hash.match(/token=([\w-]+)/);
    if (m) {
      setToken(m[1]);
      history.replaceState(null, '', window.location.pathname);
    }
  }, []);
  const mut = useMutation({ mutationFn: () => api('/v1/auth/password-reset/confirm', { method: 'POST', propertyId: null, body: { token, password } }) });
  return (
    <>
      <PublicHeader />
      <main id="main" className="px-4 py-12">
        <Card title={t('auth.resetTitle')} className="mx-auto max-w-md">
          {mut.isSuccess ? (
            <Alert tone="success">
              {t('auth.resetDone')} <Link href="/login" className="underline">{t('auth.signIn')}</Link>
            </Alert>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(e) => {
                e.preventDefault();
                mut.mutate();
              }}
            >
              <Field label={t('auth.newPassword')} htmlFor="pw" required hint={t('validation.password_too_short')}>
                <LtrInput id="pw" type="password" autoComplete="new-password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} required />
              </Field>
              {mut.error && <Alert tone="danger">{err(mut.error)}</Alert>}
              <Button type="submit" loading={mut.isPending} disabled={!token}>{t('auth.setPassword')}</Button>
            </form>
          )}
        </Card>
      </main>
    </>
  );
}
