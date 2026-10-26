'use client';

import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { ApiError } from '@/lib/api';
import { useErrorMessage } from '@/lib/errors';
import { ToastProvider, useToast } from './ui';

/** Shows a translated toast when a background query fails (401s are handled by the shells). */
function QueryErrorToaster() {
  const qc = useQueryClient();
  const toast = useToast();
  const err = useErrorMessage();
  useEffect(
    () =>
      qc.getQueryCache().subscribe((event) => {
        if (event.type !== 'updated' || event.action.type !== 'error') return;
        const e = event.action.error;
        if (e instanceof ApiError && e.status === 401) return;
        toast('danger', err(e));
      }),
    [qc, toast, err],
  );
  return null;
}

export function Providers({ children }: { children: ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            refetchOnWindowFocus: true,
            retry: (count, e) => !(e instanceof ApiError && e.status >= 400 && e.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>
        <QueryErrorToaster />
        {children}
      </ToastProvider>
    </QueryClientProvider>
  );
}
