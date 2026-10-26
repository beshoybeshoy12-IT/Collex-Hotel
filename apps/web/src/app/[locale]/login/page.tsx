'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LogIn } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { PublicHeader } from '@/components/public-header';
import { Alert, Button, Card, Field, LtrInput } from '@/components/ui';
import { Link, useRouter } from '@/i18n/navigation';
import { api, ApiError } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';

export default function LoginPage() {
  const t = useTranslations();
  const err = useErrorMessage();
  const router = useRouter();
  const qc = useQueryClient();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mfaCode, setMfa] = useState('');
  const [needMfa, setNeedMfa] = useState(false);
  const login = useMutation({
    mutationFn: () => api('/v1/auth/login', { method: 'POST', propertyId: null, body: { email, password, ...(mfaCode ? { mfaCode } : {}) } }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ['me'] });
      router.push('/app');
    },
    onError: (e) => {
      if (e instanceof ApiError && e.code === 'MFA_REQUIRED') setNeedMfa(true);
    },
  });
  return (
    <>
      <PublicHeader />
      <main id="main" className="px-4 py-12">
        <Card title={t('auth.signInTitle')} className="mx-auto max-w-md">
          <form
            className="space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate();
            }}
          >
            <Field label={t('auth.email')} htmlFor="email" required>
              <LtrInput id="email" type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
            </Field>
            <Field label={t('auth.password')} htmlFor="password" required>
              <LtrInput id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
            </Field>
            {needMfa && (
              <Field label={t('auth.mfaCode')} htmlFor="mfa" required>
                <LtrInput id="mfa" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={(e) => setMfa(e.target.value.replace(/\D/g, ''))} />
              </Field>
            )}
            {login.error && !(login.error instanceof ApiError && login.error.code === 'MFA_REQUIRED' && !mfaCode) && <Alert tone="danger">{err(login.error)}</Alert>}
            <Button type="submit" icon={LogIn} loading={login.isPending} className="w-full">
              {t('auth.signIn')}
            </Button>
            <Link href="/forgot-password" className="block text-center text-sm text-brand-700 hover:underline">
              {t('auth.forgot')}
            </Link>
          </form>
        </Card>
      </main>
    </>
  );
}
