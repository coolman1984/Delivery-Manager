import type { Role } from '@dm/shared';
import {
  createParamDecorator,
  ExecutionContext,
  NotFoundException,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Actor, AppRequest, AuthUser, requestMeta, RequestMeta, TenantInfo } from './auth-context';

export const IS_PUBLIC = 'isPublic';
/** المسار ده مفتوح من غير تسجيل دخول */
export const Public = () => SetMetadata(IS_PUBLIC, true);

export const ROLES_KEY = 'roles';
/** مين بس المسموح له يستخدم المسار ده */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.user) throw new UnauthorizedException();
  return req.user;
});

export const CurrentActor = createParamDecorator((_: unknown, ctx: ExecutionContext): Actor => {
  const req = ctx.switchToHttp().getRequest<AppRequest>();
  if (!req.user) throw new UnauthorizedException();
  return { ...req.user, ...requestMeta(req) };
});

export const Meta = createParamDecorator((_: unknown, ctx: ExecutionContext): RequestMeta =>
  requestMeta(ctx.switchToHttp().getRequest<AppRequest>()),
);

/** الشركة: من التوكن لو مسجل دخول، أو من عنوان الطلب للصفحات العامة */
export const CurrentTenant = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): TenantInfo => {
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    if (!req.tenant) throw new NotFoundException('الشركة مش موجودة');
    return req.tenant;
  },
);
