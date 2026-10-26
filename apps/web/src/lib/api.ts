/**
 * Browser API client. All calls go to the same-origin /api proxy so the httpOnly session cookie is
 * sent automatically. State-changing requests carry the CSRF header required by the API.
 */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly details?: any,
    public readonly correlationId?: string,
  ) {
    super(code);
  }
}

const PROPERTY_KEY = 'collex.propertyId';

export function getPropertyId(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage.getItem(PROPERTY_KEY);
  } catch {
    return null;
  }
}

export function setPropertyId(id: string) {
  try {
    window.localStorage.setItem(PROPERTY_KEY, id);
  } catch {
    /* storage unavailable: property is kept in memory by the context */
  }
}

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  propertyId?: string | null;
  form?: FormData;
  signal?: AbortSignal;
}

async function raw(path: string, opts: RequestOptions = {}): Promise<Response> {
  const headers: Record<string, string> = { 'x-collex-csrf': '1', Accept: 'application/json' };
  const propertyId = opts.propertyId === undefined ? getPropertyId() : opts.propertyId;
  if (propertyId) headers['x-property-id'] = propertyId;
  let body: BodyInit | undefined;
  if (opts.form) body = opts.form;
  else if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(opts.body);
  }
  let res: Response;
  try {
    res = await fetch(`/api${path}`, { method: opts.method ?? 'GET', headers, body, credentials: 'same-origin', signal: opts.signal, cache: 'no-store' });
  } catch (e) {
    if ((e as Error).name === 'AbortError') throw e;
    throw new ApiError(0, 'NETWORK');
  }
  if (!res.ok) {
    let payload: any = {};
    try {
      payload = await res.json();
    } catch {
      /* non-JSON error */
    }
    throw new ApiError(res.status, payload?.error?.code ?? 'INTERNAL_ERROR', payload?.error?.details, payload?.correlationId);
  }
  return res;
}

export async function api<T = any>(path: string, opts: RequestOptions = {}): Promise<T> {
  const res = await raw(path, opts);
  const text = await res.text();
  return (text ? JSON.parse(text) : undefined) as T;
}

/** Fetches a protected binary (identity document scan) as an object URL; never a public link. */
export async function apiBlobUrl(path: string): Promise<{ url: string; type: string }> {
  const res = await raw(path);
  const blob = await res.blob();
  return { url: URL.createObjectURL(blob), type: blob.type };
}

export async function apiDownload(path: string, filename: string) {
  const res = await raw(path);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function idempotencyKey(prefix = 'ui') {
  return `${prefix}-${crypto.randomUUID()}`;
}

export function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') s.set(k, String(v));
  const out = s.toString();
  return out ? `?${out}` : '';
}
