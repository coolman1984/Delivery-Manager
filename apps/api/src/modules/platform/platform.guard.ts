import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { ENV, type Env } from '../../config/env';
import { PlatformAuthService } from './platform-auth.service';
import { PLATFORM_COOKIE, type PlatformRequest } from './platform-context';
import { PlatformDbService } from './platform-db.service';

/**
 * بوّاب لوحة مالك المنصة (منفصل تماماً عن بوّاب الشركات):
 * - اللوحة مقفولة لو مفيش حساب قاعدة بيانات ليها، أو لو الطلب جاي من عنوان غير عنوانها
 * - كل طلب لازم يكون جاي من صفحتنا (حماية من تزوير الطلبات)
 * - الجلسة في كوكي مقفولة، ومتأكدين منها في قاعدة البيانات كل مرة
 */
@Injectable()
export class PlatformGuard implements CanActivate {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly pdb: PlatformDbService,
    private readonly auth: PlatformAuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<PlatformRequest>();
    assertPlatformRequest(req, this.env, this.pdb);
    const token: unknown = req.cookies?.[PLATFORM_COOKIE];
    if (typeof token !== 'string' || !token) throw new UnauthorizedException('لازم تسجل دخول');
    const admin = await this.auth.verifySession(token);
    if (!admin) throw new UnauthorizedException('انتهت الجلسة، سجل دخول تاني');
    req.platformAdmin = admin;
    return true;
  }
}

export function assertPlatformRequest(
  req: PlatformRequest,
  env: Env,
  pdb: PlatformDbService,
): void {
  if (!pdb.enabled) throw new NotFoundException();
  if (env.PLATFORM_HOST && req.hostname !== env.PLATFORM_HOST) throw new NotFoundException();
  if (req.get('x-requested-with') !== 'dm') throw new ForbiddenException();
  // حسابات الشركات مالهاش أي دخل هنا
  if (req.get('authorization')) throw new ForbiddenException();
}
