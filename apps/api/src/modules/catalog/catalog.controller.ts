import { STORE_TYPES, type StoreType } from '@dm/shared';
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantInfo } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentTenant, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { products, stores, zones } from '../../db/schema';

const storesQuery = z.strictObject({ type: z.enum(STORE_TYPES).optional() });

/** الفرجة: أي حد يقدر يتفرج على المحلات والمنتجات من غير تسجيل دخول */
@Controller('catalog')
@Public()
export class CatalogController {
  constructor(private readonly dbs: DbService) {}

  @Get('zones')
  zones(@CurrentTenant() tenant: TenantInfo) {
    return this.dbs.withTenant(tenant.id, (tx) =>
      tx
        .select({ id: zones.id, name: zones.name, deliveryFee: zones.deliveryFee })
        .from(zones)
        .where(eq(zones.isActive, true))
        .orderBy(asc(zones.name)),
    );
  }

  @Get('stores')
  stores(
    @CurrentTenant() tenant: TenantInfo,
    @Query(new ZodPipe(storesQuery)) q: { type?: StoreType },
  ) {
    return this.dbs.withTenant(tenant.id, (tx) =>
      tx
        .select({
          id: stores.id,
          name: stores.name,
          type: stores.type,
          isOpen: stores.isOpen,
          zoneName: zones.name,
        })
        .from(stores)
        .innerJoin(zones, eq(zones.id, stores.zoneId))
        .where(and(eq(stores.isActive, true), q.type ? eq(stores.type, q.type) : undefined))
        .orderBy(asc(stores.name)),
    );
  }

  @Get('stores/:id')
  async store(@CurrentTenant() tenant: TenantInfo, @Param('id', ParseUUIDPipe) id: string) {
    return this.dbs.withTenant(tenant.id, async (tx) => {
      const [store] = await tx
        .select({
          id: stores.id,
          name: stores.name,
          type: stores.type,
          isOpen: stores.isOpen,
          address: stores.address,
        })
        .from(stores)
        .where(and(eq(stores.id, id), eq(stores.isActive, true)))
        .limit(1);
      if (!store) throw new NotFoundException('المحل مش موجود');
      const items = await tx
        .select({
          id: products.id,
          name: products.name,
          description: products.description,
          category: products.category,
          price: products.price,
        })
        .from(products)
        .where(and(eq(products.storeId, id), eq(products.isAvailable, true)))
        .orderBy(asc(products.category), asc(products.name));
      return { ...store, products: items };
    });
  }
}
