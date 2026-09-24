import type { Role } from '@dm/shared';
import type { Request } from 'express';

/** بيانات اللي عامل الطلب، مستخرجة من التوكن الموقّع (مش من كلام العميل) */
export interface AuthUser {
  userId: string;
  tenantId: string;
  role: Role;
  storeId: string | null;
}

/** اللي عامل العملية + بيانات الجهاز، عشان سجل العمليات */
export interface Actor extends AuthUser {
  ip: string | null;
  userAgent: string | null;
}

export interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  governorate: string;
}

export interface AppRequest extends Request {
  user?: AuthUser;
  tenant?: TenantInfo;
}

export interface RequestMeta {
  ip: string | null;
  userAgent: string | null;
}

export function requestMeta(req: Request): RequestMeta {
  return { ip: req.ip ?? null, userAgent: req.get('user-agent')?.slice(0, 300) ?? null };
}
