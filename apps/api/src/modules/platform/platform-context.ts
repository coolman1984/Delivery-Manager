import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';
import type { AppRequest } from '../../common/auth-context';
import { requestMeta, type RequestMeta } from '../../common/auth-context';

export interface PlatformAdmin {
  id: string;
  email: string;
  name: string;
}

export interface PlatformActor extends PlatformAdmin, RequestMeta {}

export interface PlatformRequest extends AppRequest {
  platformAdmin?: PlatformAdmin;
}

export const PLATFORM_COOKIE = 'dm_pa';
export const PLATFORM_COOKIE_PATH = '/api/v1/platform';

export const CurrentPlatformActor = createParamDecorator(
  (_: unknown, ctx: ExecutionContext): PlatformActor => {
    const req = ctx.switchToHttp().getRequest<PlatformRequest>();
    if (!req.platformAdmin) throw new UnauthorizedException();
    return { ...req.platformAdmin, ...requestMeta(req) };
  },
);
