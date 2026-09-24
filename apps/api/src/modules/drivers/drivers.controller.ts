import { driverStatusSchema, locationSchema } from '@dm/shared';
import { BadRequestException, Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentActor, Roles } from '../../common/decorators';
import { RateLimitService } from '../../common/rate-limit.service';
import { ZodPipe } from '../../common/zod.pipe';
import { driverProfiles, orders } from '../../db/schema';
import { FinanceService } from '../finance/finance.service';
import { RealtimeService } from '../realtime/realtime.service';

/** شاشة الطيار: حالته (شغال/مش شغال)، مكانه، وعهدته */
@Controller('driver')
@Roles('driver')
export class DriversController {
  constructor(
    private readonly dbs: DbService,
    private readonly finance: FinanceService,
    private readonly realtime: RealtimeService,
    private readonly limiter: RateLimitService,
  ) {}

  @Get('me')
  async me(@CurrentActor() actor: Actor) {
    const [profile] = await this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({ status: driverProfiles.status })
        .from(driverProfiles)
        .where(eq(driverProfiles.userId, actor.userId)),
    );
    const cash = await this.finance.driverCash(actor, actor.userId);
    return { status: profile?.status ?? 'offline', cash };
  }

  @Post('status')
  @HttpCode(200)
  async setStatus(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(driverStatusSchema)) body: { status: 'offline' | 'available' },
  ) {
    const status = await this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [active] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.driverId, actor.userId),
            inArray(orders.status, ['placed', 'accepted', 'ready', 'picked_up']),
          ),
        );
      const busy = (active?.count ?? 0) > 0;
      if (body.status === 'offline' && busy)
        throw new BadRequestException('خلّص طلباتك الأول قبل ما تقفل');
      const next = busy ? 'busy' : body.status;
      await tx
        .update(driverProfiles)
        .set({ status: next, lastSeenAt: new Date() })
        .where(eq(driverProfiles.userId, actor.userId));
      return next;
    });
    this.realtime.driverChanged(actor.tenantId, actor.userId, { status });
    return { status };
  }

  @Post('location')
  @HttpCode(204)
  async location(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(locationSchema)) body: { lat: number; lng: number },
  ) {
    await this.limiter.hit(`loc:${actor.userId}`, 30, 60);
    await this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .update(driverProfiles)
        .set({ lastLat: body.lat, lastLng: body.lng, lastSeenAt: new Date() })
        .where(eq(driverProfiles.userId, actor.userId)),
    );
    this.realtime.driverChanged(actor.tenantId, actor.userId, { lat: body.lat, lng: body.lng });
  }
}
