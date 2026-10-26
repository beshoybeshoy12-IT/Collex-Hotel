'use client';

import { useMutation } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PublicHeader } from '@/components/public-header';
import { Alert, Button, Card, Field, LtrInput } from '@/components/ui';
import { api } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';

export default function ForgotPasswordPage() {
  const t = useTranslations();
  const err = useErrorMessage();
  const [email, setEmail] = useState('');
  const m = useMutation({ mutationFn: () => api('/v1/auth/password-reset/request', { method: 'POST', propertyId: null, body: { email } }) });
  return (
    <>
      <PublicHeader />
      <main id="main" className="px-4 py-12">
        <Card title={t('auth.resetTitle')} className="mx-auto max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              m.mutate();
            }}
          >
            <Field label={t('auth.email')} htmlFor="email" required>
              <LtrInput id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            {m.isSuccess && <Alert tone="success">{t('auth.resetSent')}</Alert>}
            {m.error && <Alert tone="danger">{err(m.error)}</Alert>}
            <Button type="submit" loading={m.isPending}>{t('auth.resetRequest')}</Button>
          </form>
        </Card>
      </main>
    </>
  );
}
