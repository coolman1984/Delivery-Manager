import { ApiError } from '../../lib/api';

/**
 * التواصل مع لوحة مالك المنصة: منفصلة تماماً عن حسابات الشركات.
 * الجلسة في كوكي مقفولة (الجافاسكريبت مايقدرش يقراها)، ومفيش ختم شركة في الطلب.
 */
async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api/v1/platform${path}`, {
      method,
      headers: {
        'x-requested-with': 'dm',
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: 'same-origin',
    });
  } catch {
    throw new ApiError(0, 'مفيش اتصال بالنت، جرّب تاني');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  if (!res.ok) {
    const message = Array.isArray(data.message) ? data.message[0] : data.message;
    throw new ApiError(res.status, message ?? 'حصلت مشكلة، جرّب تاني');
  }
  return data as T;
}

export const pget = <T>(path: string) => request<T>('GET', path);
export const ppost = <T>(path: string, body?: unknown) => request<T>('POST', path, body ?? {});
export const ppatch = <T>(path: string, body?: unknown) => request<T>('PATCH', path, body ?? {});

export interface PlatformMe {
  id: string;
  email: string;
  name: string;
}

export interface Plan {
  id: string;
  name: string;
  monthlyPrice: number;
  maxStores: number | null;
  maxDrivers: number | null;
  isActive: boolean;
}

export interface PlatformTenant {
  id: string;
  slug: string;
  name: string;
  governorate: string;
  status: 'active' | 'suspended';
  suspendedReason: string | null;
  paidUntil: string | null;
  contactName: string | null;
  contactPhone: string | null;
  notes: string | null;
  createdAt: string;
  plan: Pick<Plan, 'id' | 'name' | 'monthlyPrice' | 'maxStores' | 'maxDrivers'> | null;
  stats: {
    orders30d: number;
    delivered30d: number;
    gmv30d: number;
    stores: number;
    drivers: number;
    customers: number;
    lastOrderAt: string | null;
  };
}

export interface Payment {
  id: string;
  amount: number;
  months: number;
  periodFrom: string;
  periodTo: string;
  note: string | null;
  createdAt: string;
}

export interface TenantDetail extends PlatformTenant {
  payments: Payment[];
  admins: Array<{ id: string; name: string; phone: string; createdAt: string }>;
}

export interface Overview {
  tenants: number;
  active: number;
  suspended: number;
  monthlyRecurring: number;
  collectedThisMonth: number;
  orders30d: number;
  gmv30d: number;
  overdue: PlatformTenant[];
  expiringSoon: PlatformTenant[];
}

/** كام يوم فاضل في الاشتراك (بالسالب لو خلص) */
export function daysLeft(paidUntil: string | null): number | null {
  if (!paidUntil) return null;
  return Math.ceil((new Date(paidUntil).getTime() - Date.now()) / 86_400_000);
}

/** عنوان الشركة على النت (لو اللوحة شغالة على admin.example.com تبقى slug.example.com) */
export function tenantUrl(slug: string): string | null {
  const parts = window.location.hostname.split('.');
  if (parts.length < 3) return null;
  return `https://${slug}.${parts.slice(1).join('.')}`;
}
