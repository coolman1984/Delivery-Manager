import type { TenantSettingsInput } from '@dm/shared/schemas';
import { Injectable } from '@nestjs/common';
import type { Tx } from '../../common/db.service';
import { tenantSettings } from '../../db/schema';

type Row = typeof tenantSettings.$inferSelect;
export type TenantSettings = Omit<Row, 'tenantId' | 'updatedAt'>;

const DEFAULTS: TenantSettings = {
  autoDispatch: false,
  errandsEnabled: true,
  errandExtraFee: 0,
  loyaltyEnabled: true,
  loyaltyEarnPer: 1000,
  loyaltyPointValue: 10,
};

function pick(row: Row): TenantSettings {
  const { tenantId: _t, updatedAt: _u, ...rest } = row;
  return rest;
}

/** إعدادات تشغيل كل شركة (التوزيع التلقائي، المشاوير، نقاط الولاء...) */
@Injectable()
export class SettingsService {
  async get(tx: Tx): Promise<TenantSettings> {
    const [row] = await tx.select().from(tenantSettings).limit(1);
    return row ? pick(row) : DEFAULTS;
  }

  async update(tx: Tx, tenantId: string, input: TenantSettingsInput): Promise<TenantSettings> {
    const next = { ...(await this.get(tx)), ...input };
    const [row] = await tx
      .insert(tenantSettings)
      .values({ tenantId, ...next })
      .onConflictDoUpdate({
        target: tenantSettings.tenantId,
        set: { ...next, updatedAt: new Date() },
      })
      .returning();
    return pick(row!);
  }
}
