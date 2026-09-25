import { ROLES as ALL_ROLES, Role } from '@dm/shared';
import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { AppRequest, AuthUser } from './auth-context';
import { IS_PUBLIC, ROLES_KEY } from './decorators';
import { RevocationService } from './revocation.service';
import { TenantsService } from './tenants.service';

const SUSPENDED = 'الخدمة متوقفة مؤقتاً. كلّم إدارة الشركة';

interface AccessPayload {
  sub: string;
  tid: string;
  role: Role;
  sid?: string | null;
  ims?: number;
}

/**
 * البوّاب: بيشتغل قبل أي طلب.
 * ١) يتأكد من التوكن (توقيعه وصلاحيته)
 * ٢) يحدد الشركة ويتأكد إنها شغالة
 * ٣) يتأكد إن دور المستخدم مسموح له بالمسار ده
 * أي مسار مقفول افتراضياً، إلا لو اتعلّم عليه صراحة إنه عام.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly jwt: JwtService,
    private readonly tenants: TenantsService,
    private readonly revocation: RevocationService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<AppRequest>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets);
    const headerSlug = req.get('x-tenant');
    const token = this.extractToken(req);

    if (token) {
      req.user = await this.verify(token);
      const tenant = await this.tenants.findById(req.user.tenantId);
      if (!tenant) throw new UnauthorizedException('انتهت الجلسة، سجل دخول تاني');
      if (!tenant.active) throw new ForbiddenException(SUSPENDED);
      if (headerSlug && headerSlug !== tenant.slug) {
        throw new ForbiddenException('الحساب ده تبع شركة تانية');
      }
      req.tenant = tenant;
    } else if (headerSlug) {
      const tenant = await this.tenants.findBySlug(headerSlug);
      if (!tenant) throw new NotFoundException('الشركة مش موجودة');
      if (!tenant.active) throw new ForbiddenException(SUSPENDED);
      req.tenant = tenant;
    }

    if (isPublic) return true;
    if (!req.user) throw new UnauthorizedException('لازم تسجل دخول');

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (!roles || roles.length === 0) {
      // حماية من النسيان: أي مسار محمي لازم يحدد الأدوار المسموحة
      throw new ForbiddenException('مسار من غير صلاحيات محددة');
    }
    if (!roles.includes(req.user.role)) throw new ForbiddenException('مش مسموح لك تعمل كده');
    return true;
  }

  private extractToken(req: AppRequest): string | null {
    const header = req.get('authorization');
    if (!header) return null;
    const [scheme, value] = header.split(' ');
    if (scheme !== 'Bearer' || !value) throw new UnauthorizedException('توكن غلط');
    return value;
  }

  private async verify(token: string): Promise<AuthUser> {
    try {
      const payload = await this.jwt.verifyAsync<AccessPayload>(token, { algorithms: ['HS256'] });
      if (!ALL_ROLES.includes(payload.role)) throw new Error('bad role');
      if (await this.revocation.isRevoked(payload.sub, payload.ims)) throw new Error('revoked');
      return {
        userId: payload.sub,
        tenantId: payload.tid,
        role: payload.role,
        storeId: payload.sid ?? null,
      };
    } catch {
      throw new UnauthorizedException('انتهت الجلسة، سجل دخول تاني');
    }
  }
}
