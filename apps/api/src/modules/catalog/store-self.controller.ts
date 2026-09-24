import {
  productCreateSchema,
  productUpdateSchema,
  storeOpenSchema,
  type ProductCreateInput,
  type ProductUpdateInput,
} from '@dm/shared';
import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';
import { and, asc, eq } from 'drizzle-orm';
import { AuditService } from '../../common/audit.service';
import type { Actor } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { products, stores } from '../../db/schema';

/** لوحة المحل: يفتح ويقفل، ويدير منتجاته وأسعاره (منتجاته هو بس) */
@Controller('store')
@Roles('store')
export class StoreSelfController {
  constructor(
    private readonly dbs: DbService,
    private readonly audit: AuditService,
  ) {}

  @Get('me')
  async me(@CurrentActor() actor: Actor) {
    const storeId = this.storeId(actor);
    const [store] = await this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          id: stores.id,
          name: stores.name,
          type: stores.type,
          isOpen: stores.isOpen,
          commissionBps: stores.commissionBps,
        })
        .from(stores)
        .where(eq(stores.id, storeId)),
    );
    if (!store) throw new NotFoundException('المحل مش موجود');
    return store;
  }

  @Patch('me/open')
  async setOpen(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(storeOpenSchema)) body: { isOpen: boolean },
  ) {
    const storeId = this.storeId(actor);
    await this.dbs.withTenant(actor.tenantId, async (tx) => {
      await tx
        .update(stores)
        .set({ isOpen: body.isOpen, updatedAt: new Date() })
        .where(eq(stores.id, storeId));
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: body.isOpen ? 'store.opened' : 'store.closed',
        entityType: 'store',
        entityId: storeId,
      });
    });
    return { isOpen: body.isOpen };
  }

  @Get('products')
  list(@CurrentActor() actor: Actor) {
    const storeId = this.storeId(actor);
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select()
        .from(products)
        .where(eq(products.storeId, storeId))
        .orderBy(asc(products.category), asc(products.name)),
    );
  }

  @Post('products')
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(productCreateSchema)) body: ProductCreateInput,
  ) {
    const storeId = this.storeId(actor);
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(products)
        .values({ ...body, tenantId: actor.tenantId, storeId })
        .returning();
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'product.created',
        entityType: 'product',
        entityId: row!.id,
        meta: { price: body.price },
      });
      return row!;
    });
  }

  @Patch('products/:id')
  update(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(productUpdateSchema)) body: ProductUpdateInput,
  ) {
    const storeId = this.storeId(actor);
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [before] = await tx
        .select()
        .from(products)
        .where(and(eq(products.id, id), eq(products.storeId, storeId)))
        .for('update')
        .limit(1);
      if (!before) throw new NotFoundException('المنتج مش موجود');
      const [row] = await tx
        .update(products)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(products.id, id))
        .returning();
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'product.updated',
        entityType: 'product',
        entityId: id,
        meta:
          body.price !== undefined && body.price !== before.price
            ? { oldPrice: before.price, newPrice: body.price }
            : { fields: Object.keys(body) },
      });
      return row!;
    });
  }

  private storeId(actor: Actor): string {
    if (!actor.storeId) throw new NotFoundException('الحساب مش مربوط بمحل');
    return actor.storeId;
  }
}
