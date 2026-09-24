import type { TenantSettingsInput } from '@dm/shared/schemas';
import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import type { Tx } from '../../common/db.service';
import { tenantSettings } from '../../db/schema';

export type TenantSettings = Pick<
  typeof tenantSettings.$inferSelect,
  'autoDispatch' | 'errandsEnabled' | 'errandExtraFee'
>;

const DEFAULTS: TenantSettings = { autoDispatch: false, errandsEnabled: true, errandExtraFee: 0 };

/** إعدادات تشغيل كل شركة (التوزيع التلقائي، المشاوير...) */
@Injectable()
export class SettingsService {
  async get(tx: Tx): Promise<TenantSettings> {
    const [row] = await tx.select().from(tenantSettings).limit(1);
    return row
      ? {
          autoDispatch: row.autoDispatch,
          errandsEnabled: row.errandsEnabled,
          errandExtraFee: row.errandExtraFee,
        }
      : DEFAULTS;
  }

  async update(tx: Tx, tenantId: string, input: TenantSettingsInput): Promise<TenantSettings> {
    const current = await this.get(tx);
    const next = { ...current, ...input };
    await tx
      .insert(tenantSettings)
      .values({ tenantId, ...next })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { ...next, updatedAt: new Date() },
      });
    const [row] = await tx
      .select()
      .from(tenantSettings)
      .where(eq(tenantSettings.tenantId, tenantId));
    return {
      autoDispatch: row!.autoDispatch,
      errandsEnabled: row!.errandsEnabled,
      errandExtraFee: row!.errandExtraFee,
    };
  }
}
