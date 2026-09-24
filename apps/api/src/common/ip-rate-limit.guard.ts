import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import type { Request } from 'express';
import { RateLimitService } from './rate-limit.service';

/** حد عام: كل جهاز ليه عدد طلبات في الدقيقة، عشان محدش يغرق السيرفر */
@Injectable()
export class IpRateLimitGuard implements CanActivate {
  constructor(private readonly limiter: RateLimitService) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    await this.limiter.hit(`ip:${req.ip ?? 'unknown'}`, 300, 60);
    return true;
  }
}
