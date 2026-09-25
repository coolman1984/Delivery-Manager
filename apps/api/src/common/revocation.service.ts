import { Inject, Injectable } from '@nestjs/common';
import { ENV, type Env } from '../config/env';
import { RedisService } from './redis.service';

/**
 * القفل الفوري للجلسات: لما حساب يتوقف أو كلمة سره تتغير، أي توكن اتعمل قبل اللحظة دي
 * بيترفض فوراً في كل طلب وفي القناة اللحظية (من غير ما نستنى التوكن يخلص لوحده).
 */
@Injectable()
export class RevocationService {
  private readonly ttl: number;

  constructor(
    @Inject(ENV) env: Env,
    private readonly redis: RedisService,
  ) {
    this.ttl = env.ACCESS_TOKEN_TTL_SECONDS + 60;
  }

  async revokeUser(userId: string): Promise<void> {
    await this.redis.client.set(`revoked:u:${userId}`, String(Date.now()), 'EX', this.ttl);
  }

  /** التوكن اتعمل (issuedAtMs بالملي ثانية) قبل آخر قفل للحساب؟ */
  async isRevoked(userId: string, issuedAtMs: number | undefined): Promise<boolean> {
    const at = await this.redis.client.get(`revoked:u:${userId}`);
    if (!at) return false;
    return issuedAtMs === undefined || issuedAtMs <= Number(at);
  }
}
