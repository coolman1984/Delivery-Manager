import { detectZone, STORE_TYPES, type StoreType } from '@dm/shared';
import { pointQuerySchema } from '@dm/shared/schemas';
import { Controller, Get, NotFoundException, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import type { TenantInfo } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentTenant, Public } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { products, ratings, stores, zones } from '../../db/schema';

const ratingAvg = sql<
  number | null
>`(select round(avg(${ratings.storeRating})::numeric, 1)::float from ${ratings} where ${ratings.storeId} = ${stores.id})`;
const ratingCount = sql<number>`(select count(*)::int from ${ratings} where ${ratings.storeId} = ${stores.id})`;

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
        .select({
          id: zones.id,
          name: zones.name,
          deliveryFee: zones.deliveryFee,
          centerLat: zones.centerLat,
          centerLng: zones.centerLng,
        })
        .from(zones)
        .where(eq(zones.isActive, true))
        .orderBy(asc(zones.name)),
    );
  }

  /** العميل حدد مكانه على الخريطة: هو في أنهي منطقة؟ */
  @Get('zones/detect')
  detect(
    @CurrentTenant() tenant: TenantInfo,
    @Query(new ZodPipe(pointQuerySchema)) q: { lat: number; lng: number },
  ) {
    return this.dbs.withTenant(tenant.id, async (tx) => {
      const rows = await tx
        .select({
          id: zones.id,
          name: zones.name,
          deliveryFee: zones.deliveryFee,
          lat: zones.centerLat,
          lng: zones.centerLng,
          radiusKm: zones.radiusKm,
        })
        .from(zones)
        .where(eq(zones.isActive, true));
      const areas = rows
        .filter((z) => z.lat !== null && z.lng !== null)
        .map((z) => ({ ...z, lat: z.lat!, lng: z.lng! }));
      const zone = detectZone(areas, q);
      return {
        zone: zone ? { id: zone.id, name: zone.name, deliveryFee: zone.deliveryFee } : null,
      };
    });
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
          logoUrl: stores.logoUrl,
          coverUrl: stores.coverUrl,
          prepMinutes: stores.prepMinutes,
          rating: ratingAvg,
          ratingCount,
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
          logoUrl: stores.logoUrl,
          coverUrl: stores.coverUrl,
          prepMinutes: stores.prepMinutes,
          rating: ratingAvg,
          ratingCount,
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
          imageUrl: products.imageUrl,
        })
        .from(products)
        .where(and(eq(products.storeId, id), eq(products.isAvailable, true)))
        .orderBy(asc(products.category), asc(products.name));
      return { ...store, products: items };
    });
  }
}
