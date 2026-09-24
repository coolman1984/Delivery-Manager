import { leadCreateSchema, type LeadCreateInput } from '@dm/shared/schemas';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { AuditService } from '../../common/audit.service';
import type { Actor, RequestMeta, TenantInfo } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentActor, CurrentTenant, Meta, Public, Roles } from '../../common/decorators';
import { RateLimitService } from '../../common/rate-limit.service';
import { ZodPipe } from '../../common/zod.pipe';
import { leads } from '../../db/schema';

/** "انضم لينا": محلات وطيارين عايزين يشتغلوا مع الشركة */
@Controller()
export class LeadsController {
  constructor(
    private readonly dbs: DbService,
    private readonly limiter: RateLimitService,
    private readonly audit: AuditService,
  ) {}

  @Public()
  @Post('public/leads')
  @HttpCode(201)
  async create(
    @CurrentTenant() tenant: TenantInfo,
    @Body(new ZodPipe(leadCreateSchema)) body: LeadCreateInput,
    @Meta() meta: RequestMeta,
  ) {
    await this.limiter.hit(`lead:ip:${meta.ip}`, 5, 3600);
    await this.dbs.withTenant(tenant.id, (tx) =>
      tx.insert(leads).values({ ...body, tenantId: tenant.id, details: body.details ?? null }),
    );
    return { ok: true };
  }

  @Get('admin/leads')
  @Roles('admin', 'ops')
  list(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx.select().from(leads).orderBy(desc(leads.createdAt)).limit(200),
    );
  }

  @Patch('admin/leads/:id/handled')
  @Roles('admin', 'ops')
  handled(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      await tx.update(leads).set({ handled: true }).where(eq(leads.id, id));
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'lead.handled',
        entityType: 'lead',
        entityId: id,
      });
      return { ok: true };
    });
  }
}
