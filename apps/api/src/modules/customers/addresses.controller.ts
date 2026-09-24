import { addressCreateSchema, type AddressCreateInput } from '@dm/shared';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  NotFoundException,
  Param,
  ParseUUIDPipe,
  Post,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import type { Actor } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { addresses, zones } from '../../db/schema';

const MAX_ADDRESSES = 10;

/** عناوين العميل: كل عميل يشوف ويعدّل عناوينه هو بس */
@Controller('me/addresses')
@Roles('customer')
export class AddressesController {
  constructor(private readonly dbs: DbService) {}

  @Get()
  list(@CurrentActor() actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          id: addresses.id,
          label: addresses.label,
          details: addresses.details,
          zoneId: addresses.zoneId,
          zoneName: zones.name,
          deliveryFee: zones.deliveryFee,
        })
        .from(addresses)
        .innerJoin(zones, eq(zones.id, addresses.zoneId))
        .where(and(eq(addresses.userId, actor.userId), eq(addresses.isDeleted, false)))
        .orderBy(desc(addresses.createdAt)),
    );
  }

  @Post()
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(addressCreateSchema)) body: AddressCreateInput,
  ) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [zone] = await tx
        .select({ id: zones.id })
        .from(zones)
        .where(and(eq(zones.id, body.zoneId), eq(zones.isActive, true)))
        .limit(1);
      if (!zone) throw new BadRequestException('المنطقة مش متاحة');
      const [count] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(addresses)
        .where(and(eq(addresses.userId, actor.userId), eq(addresses.isDeleted, false)));
      if ((count?.n ?? 0) >= MAX_ADDRESSES)
        throw new BadRequestException('وصلت للحد الأقصى للعناوين');
      const [row] = await tx
        .insert(addresses)
        .values({ ...body, tenantId: actor.tenantId, userId: actor.userId })
        .returning({ id: addresses.id });
      return row!;
    });
  }

  @Delete(':id')
  @HttpCode(204)
  async remove(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    const rows = await this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .update(addresses)
        .set({ isDeleted: true })
        .where(and(eq(addresses.id, id), eq(addresses.userId, actor.userId)))
        .returning({ id: addresses.id }),
    );
    if (rows.length === 0) throw new NotFoundException('العنوان مش موجود');
  }
}
