import { tenantSettingsSchema, type TenantSettingsInput } from '@dm/shared/schemas';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { AuditService } from '../../common/audit.service';
import type { Actor, TenantInfo } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentActor, CurrentTenant, Public, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { SettingsService } from './settings.service';

@Controller()
export class SettingsController {
  constructor(
    private readonly dbs: DbService,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
  ) {}

  /** اللي العميل محتاج يعرفه (هل المشاوير متاحة وسعرها) */
  @Public()
  @Get('catalog/features')
  features(@CurrentTenant() tenant: TenantInfo) {
    return this.dbs.withTenant(tenant.id, async (tx) => {
      const s = await this.settings.get(tx);
      return { errandsEnabled: s.errandsEnabled, errandExtraFee: s.errandExtraFee };
    });
  }

  @Get('admin/settings')
  @Roles('admin', 'ops')
  get(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) => this.settings.get(tx));
  }

  @Patch('admin/settings')
  @Roles('admin')
  update(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(tenantSettingsSchema)) body: TenantSettingsInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const result = await this.settings.update(tx, actor.tenantId, body);
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'settings.updated',
        entityType: 'tenant',
        entityId: actor.tenantId,
        meta: body,
      });
      return result;
    });
  }
}
