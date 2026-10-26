'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslations } from 'next-intl';
import { useToast } from '@/components/ui';
import { api, type RequestOptions } from './api';
import { useErrorMessage } from './errors';
import { useSession } from './session';

/** Property-scoped GET query; the cache key includes the selected property to keep data isolated. */
export function useApi<T = any>(path: string | null, opts: { refetchInterval?: number } = {}) {
  const s = useSession();
  const pid = s?.property?.id;
  return useQuery<T>({
    queryKey: [pid, path],
    queryFn: () => api<T>(path!, { propertyId: pid }),
    enabled: !!path && !!pid,
    refetchInterval: opts.refetchInterval,
  });
}

/** Mutation that shows translated success/error toasts and refreshes property data afterwards. */
export function useApiMutation<V = void, R = any>(
  request: (v: V) => { path: string } & RequestOptions,
  opts: { success?: string; onSuccess?: (r: R, v: V) => void; silentError?: boolean } = {},
) {
  const qc = useQueryClient();
  const s = useSession();
  const toast = useToast();
  const err = useErrorMessage();
  const t = useTranslations('common');
  return useMutation<R, Error, V>({
    mutationFn: (v) => {
      const { path, ...rest } = request(v);
      return api<R>(path, { method: 'POST', propertyId: s?.property?.id, ...rest });
    },
    onSuccess: (r, v) => {
      toast('success', opts.success ?? t('saved'));
      void qc.invalidateQueries();
      opts.onSuccess?.(r, v);
    },
    onError: (e) => {
      if (!opts.silentError) toast('danger', err(e));
    },
  });
}
