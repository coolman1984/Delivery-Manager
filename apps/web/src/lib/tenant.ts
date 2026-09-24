/**
 * كل شركة ليها عنوان فرعي خاص بيها (مثلاً: fayoum.example.com).
 * وقت التجربة على الجهاز، بنختار الشركة من صفحة الدخول.
 */
const STORAGE_KEY = 'dm.tenant';
const DEFAULT = (import.meta.env.VITE_DEFAULT_TENANT as string | undefined) ?? 'beni-suef';
const FROM_SUBDOMAIN = import.meta.env.VITE_TENANT_FROM_SUBDOMAIN === 'true';

export function getTenantSlug(): string {
  if (FROM_SUBDOMAIN) {
    const sub = window.location.hostname.split('.')[0];
    if (sub && /^[a-z0-9-]{2,40}$/.test(sub)) return sub;
  }
  try {
    return localStorage.getItem(STORAGE_KEY) ?? DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export function setTenantSlug(slug: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, slug);
  } catch {
    // التخزين مقفول (وضع التصفح الخفي): مش مشكلة
  }
}

export const canSwitchTenant = !FROM_SUBDOMAIN;
