import {
  couponCheckSchema,
  couponCreateSchema,
  couponUpdateSchema,
  type CouponCreateInput,
} from '@dm/shared/schemas';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import type { Actor, TenantInfo } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentActor, CurrentTenant, Public, Roles } from '../../common/decorators';
import { RateLimitService } from '../../common/rate-limit.service';
import { ZodPipe } from '../../common/zod.pipe';
import { coupons } from '../../db/schema';
import { SettingsService } from '../settings/settings.service';
import { MarketingService } from './marketing.service';

@Controller()
export class MarketingController {
  constructor(
    private readonly dbs: DbService,
    private readonly marketing: MarketingService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
  ) {}

  @Public()
  @Get('catalog/offers')
  offers(@CurrentTenant() tenant: TenantInfo) {
    return this.dbs.withTenant(tenant.id, (tx) => this.marketing.publicOffers(tx));
  }

  /** العميل بيجرب كود قبل ما يطلب (عليه حد محاولات عشان محدش يخمّن الأكواد) */
  @Post('coupons/check')
  @HttpCode(200)
  @Roles('customer')
  async check(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(couponCheckSchema)) body: z.infer<typeof couponCheckSchema>,
  ) {
    await this.limiter.hit(`coupon-check:${actor.userId}`, 20, 3600);
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const { coupon, discount } = await this.marketing.resolveCoupon(
        tx,
        body.code,
        {
          subtotal: body.subtotal,
          deliveryFee: body.deliveryFee,
          storeId: body.storeId,
          customerId: actor.userId,
        },
        false,
      );
      return { code: coupon.code, title: coupon.title, discount };
    });
  }

  @Get('me/points')
  @Roles('customer')
  points(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const s = await this.settings.get(tx);
      return {
        enabled: s.loyaltyEnabled,
        balance: await this.marketing.balance(tx, actor.userId),
        pointValue: s.loyaltyPointValue,
        earnPer: s.loyaltyEarnPer,
        history: await this.marketing.history(tx, actor.userId),
      };
    });
  }

  // ———— إدارة الكوبونات ————
  @Get('admin/coupons')
  @Roles('admin', 'ops')
  list(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) => this.marketing.listWithUsage(tx));
  }

  @Post('admin/coupons')
  @Roles('admin')
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(couponCreateSchema)) body: CouponCreateInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(coupons)
        .values({
          ...body,
          tenantId: actor.tenantId,
          maxDiscount: body.maxDiscount ?? null,
          storeId: body.storeId ?? null,
          maxUses: body.maxUses ?? null,
          startsAt: body.startsAt ? new Date(body.startsAt) : null,
          endsAt: body.endsAt ? new Date(body.endsAt) : null,
        })
        .returning();
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'coupon.created',
        entityType: 'coupon',
        entityId: row!.id,
        meta: { code: body.code, kind: body.kind, value: body.value },
      });
      return row!;
    });
  }

  @Patch('admin/coupons/:id')
  @Roles('admin')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(couponUpdateSchema)) body: z.infer<typeof couponUpdateSchema>,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .update(coupons)
        .set({
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          ...(body.isPublic !== undefined ? { isPublic: body.isPublic } : {}),
          ...(body.endsAt !== undefined
            ? { endsAt: body.endsAt ? new Date(body.endsAt) : null }
            : {}),
        })
        .where(eq(coupons.id, id))
        .returning();
      if (!row) throw new NotFoundException('الكوبون مش موجود');
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'coupon.updated',
        entityType: 'coupon',
        entityId: id,
        meta: body,
      });
      return row;
    });
  }
}
