import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { RedisService } from './redis.service';

/**
 * عدّاد المحاولات: لو حد جرّب حاجة أكتر من المسموح في فترة معينة بيتمنع مؤقتاً.
 * ده بيوقف تخمين كلمات السر وأكواد التحقق وإغراق السيرفر بالطلبات.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<void> {
    const redisKey = `rl:${key}`;
    const results = await this.redis.client
      .multi()
      .incr(redisKey)
      .expire(redisKey, windowSeconds, 'NX')
      .ttl(redisKey)
      .exec();
    const count = Number(results?.[0]?.[1] ?? 0);
    if (count > limit) {
      const retryAfter = Math.max(1, Number(results?.[2]?.[1] ?? windowSeconds));
      throw new HttpException(
        {
          statusCode: HttpStatus.TOO_MANY_REQUESTS,
          message: `محاولات كتير. جرّب تاني بعد ${Math.ceil(retryAfter / 60)} دقيقة`,
          retryAfter,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  async reset(key: string): Promise<void> {
    await this.redis.client.del(`rl:${key}`);
  }
}
