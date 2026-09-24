import {
  ROLES,
  storeCreateSchema,
  storeUpdateSchema,
  userCreateSchema,
  userUpdateSchema,
  zoneCreateSchema,
  zoneUpdateSchema,
  type Role,
  type StoreCreateInput,
  type StoreUpdateInput,
  type UserCreateInput,
  type UserUpdateInput,
  type ZoneCreateInput,
  type ZoneUpdateInput,
} from '@dm/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, asc, desc, eq, isNull, ne } from 'drizzle-orm';
import { z } from 'zod';
import { AuditService } from '../../common/audit.service';
import type { Actor } from '../../common/auth-context';
import { CryptoService } from '../../common/crypto.service';
import { DbService, Tx } from '../../common/db.service';
import { CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { auditLogs, driverProfiles, refreshTokens, stores, users, zones } from '../../db/schema';
import { ARGON2_OPTIONS } from '../auth/auth.service';

const usersQuery = z.strictObject({ role: z.enum(ROLES).optional() });
const auditQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(500).default(100) });

/**
 * لوحة مدير الشركة: المناطق وأسعارها، المحلات وعمولاتها، وحسابات الموظفين.
 * كل تعديل هنا بيتسجل في سجل العمليات.
 */
@Controller('admin')
@Roles('admin')
export class AdminController {
  constructor(
    private readonly dbs: DbService,
    private readonly audit: AuditService,
    private readonly crypto: CryptoService,
  ) {}

  // ———— المناطق ————
  @Get('zones')
  @Roles('admin', 'ops')
  listZones(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx.select().from(zones).orderBy(asc(zones.name)),
    );
  }

  @Post('zones')
  createZone(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(zoneCreateSchema)) body: ZoneCreateInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .insert(zones)
        .values({ ...body, tenantId: actor.tenantId })
        .returning();
      await this.log(tx, actor, 'zone.created', 'zone', row!.id, body);
      return row!;
    });
  }

  @Patch('zones/:id')
  updateZone(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(zoneUpdateSchema)) body: ZoneUpdateInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [before] = await tx.select().from(zones).where(eq(zones.id, id)).limit(1);
      if (!before) throw new NotFoundException('المنطقة مش موجودة');
      const [row] = await tx.update(zones).set(body).where(eq(zones.id, id)).returning();
      await this.log(tx, actor, 'zone.updated', 'zone', id, {
        before: { deliveryFee: before.deliveryFee },
        after: body,
      });
      return row!;
    });
  }

  // ———— المحلات ————
  @Get('stores')
  @Roles('admin', 'ops')
  listStores(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx.select().from(stores).orderBy(asc(stores.name)),
    );
  }

  @Post('stores')
  createStore(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(storeCreateSchema)) body: StoreCreateInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      await this.assertZone(tx, body.zoneId);
      const [row] = await tx
        .insert(stores)
        .values({ ...body, tenantId: actor.tenantId })
        .returning();
      await this.log(tx, actor, 'store.created', 'store', row!.id, {
        commissionBps: body.commissionBps,
      });
      return row!;
    });
  }

  @Patch('stores/:id')
  updateStore(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(storeUpdateSchema)) body: StoreUpdateInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [before] = await tx.select().from(stores).where(eq(stores.id, id)).limit(1);
      if (!before) throw new NotFoundException('المحل مش موجود');
      if (body.zoneId) await this.assertZone(tx, body.zoneId);
      const [row] = await tx
        .update(stores)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(stores.id, id))
        .returning();
      await this.log(tx, actor, 'store.updated', 'store', id, {
        before: { commissionBps: before.commissionBps, isActive: before.isActive },
        after: body,
      });
      return row!;
    });
  }

  // ———— المستخدمين ————
  @Get('users')
  listUsers(@CurrentActor() actor: Actor, @Query(new ZodPipe(usersQuery)) q: { role?: Role }) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          role: users.role,
          storeId: users.storeId,
          isActive: users.isActive,
          createdAt: users.createdAt,
        })
        .from(users)
        .where(q.role ? eq(users.role, q.role) : ne(users.role, 'customer'))
        .orderBy(asc(users.role), asc(users.name))
        .limit(500),
    );
  }

  @Post('users')
  async createUser(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(userCreateSchema)) body: UserCreateInput,
  ) {
    const passwordHash = await argon2.hash(body.password, ARGON2_OPTIONS);
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      if (body.storeId) {
        const [store] = await tx
          .select({ id: stores.id })
          .from(stores)
          .where(eq(stores.id, body.storeId))
          .limit(1);
        if (!store) throw new BadRequestException('المحل مش موجود');
      }
      const [row] = await tx
        .insert(users)
        .values({
          tenantId: actor.tenantId,
          name: body.name,
          phone: body.phone,
          role: body.role,
          storeId: body.storeId ?? null,
          passwordHash,
        })
        .returning({ id: users.id, name: users.name, phone: users.phone, role: users.role });
      if (body.role === 'driver') {
        await tx.insert(driverProfiles).values({
          userId: row!.id,
          tenantId: actor.tenantId,
          nationalIdEnc: body.nationalId ? this.crypto.encrypt(body.nationalId) : null,
        });
      }
      await this.log(tx, actor, 'user.created', 'user', row!.id, { role: body.role });
      return row!;
    });
  }

  @Patch('users/:id')
  updateUser(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(userUpdateSchema)) body: UserUpdateInput,
  ) {
    if (id === actor.userId && body.isActive === false) {
      throw new BadRequestException('مينفعش توقف حسابك بنفسك');
    }
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .update(users)
        .set({ ...body, updatedAt: new Date() })
        .where(eq(users.id, id))
        .returning({ id: users.id, name: users.name, isActive: users.isActive });
      if (!row) throw new NotFoundException('المستخدم مش موجود');
      if (body.isActive === false) {
        // إيقاف الحساب = خروجه من كل الأجهزة فوراً
        await tx
          .update(refreshTokens)
          .set({ revokedAt: new Date() })
          .where(and(eq(refreshTokens.userId, id), isNull(refreshTokens.revokedAt)));
      }
      await this.log(tx, actor, 'user.updated', 'user', id, body);
      return row;
    });
  }

  // ———— سجل العمليات ————
  @Get('audit-logs')
  auditLogs(@CurrentActor() actor: Actor, @Query(new ZodPipe(auditQuery)) q: { limit: number }) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          id: auditLogs.id,
          action: auditLogs.action,
          actorId: auditLogs.actorId,
          actorName: users.name,
          actorRole: auditLogs.actorRole,
          entityType: auditLogs.entityType,
          entityId: auditLogs.entityId,
          ip: auditLogs.ip,
          meta: auditLogs.meta,
          createdAt: auditLogs.createdAt,
        })
        .from(auditLogs)
        .leftJoin(users, eq(users.id, auditLogs.actorId))
        .orderBy(desc(auditLogs.createdAt))
        .limit(q.limit),
    );
  }

  private async assertZone(tx: Tx, zoneId: string): Promise<void> {
    const [zone] = await tx
      .select({ id: zones.id })
      .from(zones)
      .where(eq(zones.id, zoneId))
      .limit(1);
    if (!zone) throw new BadRequestException('المنطقة مش موجودة');
  }

  private log(
    tx: Tx,
    actor: Actor,
    action: string,
    entityType: string,
    entityId: string,
    meta: object,
  ) {
    return this.audit.log(tx, {
      tenantId: actor.tenantId,
      actorId: actor.userId,
      actorRole: actor.role,
      ip: actor.ip,
      userAgent: actor.userAgent,
      action,
      entityType,
      entityId,
      meta: meta as Record<string, unknown>,
    });
  }
}
