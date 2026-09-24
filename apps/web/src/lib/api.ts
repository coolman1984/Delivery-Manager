import { getTenantSlug } from './tenant';

/**
 * التواصل مع السيرفر.
 * التوكن القصير متخزن في الذاكرة بس (مش في المتصفح) عشان مايتسرقش،
 * ولما يخلص بنجدده تلقائي من الكوكي المقفولة.
 */
let accessToken: string | null = null;
let refreshing: Promise<boolean> | null = null;
let onSessionExpired: (() => void) | null = null;

export function setAccessToken(token: string | null): void {
  accessToken = token;
}
export function getAccessToken(): string | null {
  return accessToken;
}
export function setSessionExpiredHandler(fn: () => void): void {
  onSessionExpired = fn;
}

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

const OFFLINE_MESSAGE = 'مفيش اتصال بالنت، جرّب تاني';

async function rawRequest(method: string, path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { 'x-tenant': getTenantSlug(), 'x-requested-with': 'dm' };
  if (body !== undefined) headers['content-type'] = 'application/json';
  if (accessToken) headers.authorization = `Bearer ${accessToken}`;
  try {
    return await fetch(`/api/v1${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, OFFLINE_MESSAGE);
  }
}

export async function refreshSession(): Promise<boolean> {
  refreshing ??= (async () => {
    try {
      const res = await rawRequest('POST', '/auth/refresh');
      if (!res.ok) return false;
      const data = (await res.json()) as { accessToken: string };
      accessToken = data.accessToken;
      return true;
    } catch {
      return false;
    } finally {
      setTimeout(() => (refreshing = null), 0);
    }
  })();
  return refreshing;
}

export async function api<T>(
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<T> {
  let res = await rawRequest(method, path, body);
  if (res.status === 401 && accessToken && !path.startsWith('/auth/')) {
    if (await refreshSession()) {
      res = await rawRequest(method, path, body);
    } else {
      accessToken = null;
      onSessionExpired?.();
    }
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as {
    message?: string | string[];
    code?: string;
  };
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new ApiError(res.status, message ?? 'حصلت مشكلة، جرّب تاني', data.code);
  }
  return data as T;
}

export const get = <T>(path: string) => api<T>('GET', path);
export const post = <T>(path: string, body?: unknown) => api<T>('POST', path, body ?? {});
export const patch = <T>(path: string, body?: unknown) => api<T>('PATCH', path, body ?? {});
export const del = <T>(path: string) => api<T>('DELETE', path);

/** رفع صورة (لوجو أو غلاف أو صورة منتج) */
export async function uploadImage(path: string, file: File): Promise<{ url: string }> {
  if (file.size > 4 * 1024 * 1024) throw new ApiError(400, 'الصورة لازم تكون أقل من ٤ ميجا');
  const send = () => {
    const form = new FormData();
    form.append('image', file);
    const headers: Record<string, string> = {
      'x-tenant': getTenantSlug(),
      'x-requested-with': 'dm',
    };
    if (accessToken) headers.authorization = `Bearer ${accessToken}`;
    return fetch(`/api/v1${path}`, {
      method: 'POST',
      body: form,
      headers,
      credentials: 'same-origin',
    });
  };
  let res: Response;
  try {
    res = await send();
    if (res.status === 401 && (await refreshSession())) res = await send();
  } catch {
    throw new ApiError(0, OFFLINE_MESSAGE);
  }
  const data = (await res.json().catch(() => ({}))) as { url?: string; message?: string };
  if (!res.ok || !data.url) throw new ApiError(res.status, data.message ?? 'رفع الصورة فشل');
  return { url: data.url };
}
