'use client';

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { Permission } from '@collex/shared';
import { api, ApiError, getPropertyId, setPropertyId } from './api';

export interface SessionProperty {
  id: string;
  code: string;
  name: string;
  nameAr: string;
  timezone: string;
  currency: string;
  arabicNumerals: boolean;
  permissions: string[];
}

export interface Me {
  id: string;
  email: string;
  fullName: string;
  locale: string;
  mfaEnabled: boolean;
  properties: SessionProperty[];
}

interface SessionValue {
  me: Me | null;
  property: SessionProperty | null;
  setProperty(id: string): void;
  can(perm: Permission): boolean;
  loading: boolean;
  unauthenticated: boolean;
}

const SessionContext = createContext<SessionValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['me'], queryFn: () => api<Me>('/v1/auth/me', { propertyId: null }), retry: false, staleTime: 60_000 });
  const [propertyId, setPid] = useState<string | null>(null);
  useEffect(() => {
    setPid(getPropertyId());
  }, []);
  const me = query.data ?? null;
  const property = useMemo(() => {
    if (!me?.properties.length) return null;
    return me.properties.find((p) => p.id === propertyId) ?? me.properties[0];
  }, [me, propertyId]);
  useEffect(() => {
    if (property && property.id !== getPropertyId()) setPropertyId(property.id);
  }, [property]);
  const value: SessionValue = {
    me,
    property,
    loading: query.isLoading,
    unauthenticated: query.error instanceof ApiError && query.error.status === 401,
    setProperty(id) {
      setPropertyId(id);
      setPid(id);
      qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'me' });
    },
    can(perm) {
      return !!property?.permissions.includes(perm);
    },
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

/** Returns null outside the staff app (public pages). */
export function useSession() {
  return useContext(SessionContext);
}

export function useRequiredSession() {
  const s = useContext(SessionContext);
  if (!s) throw new Error('useRequiredSession outside SessionProvider');
  return s;
}
