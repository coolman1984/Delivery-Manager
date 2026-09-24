import { ORDER_STATUSES, OrderStatus, ROLES } from '@dm/shared';
import {
  assignSchema,
  createOrderSchema,
  dateQuerySchema,
  deliverSchema,
  rateSchema,
  reasonSchema,
  type CreateOrderInput,
  type DeliverInput,
  type RateInput,
} from '@dm/shared/schemas';
import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import type { Actor } from '../../common/auth-context';
import { CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { OrdersService } from './orders.service';

const listQuery = dateQuerySchema.extend({
  status: z
    .string()
    .optional()
    .transform((v) => (v ? v.split(',') : undefined))
    .pipe(z.array(z.enum(ORDER_STATUSES)).max(7).optional()),
});
type ListQuery = { status?: OrderStatus[]; date?: string };

/** كل الأدوار: تفاصيل طلب (كل واحد يشوف طلباته بس) */
@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  @Roles('customer')
  create(
    @CurrentActor() actor: Actor,
    @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput,
  ) {
    return this.orders.create(actor, body);
  }

  @Get()
  @Roles(...ROLES)
  list(@CurrentActor() actor: Actor, @Query(new ZodPipe(listQuery)) q: ListQuery) {
    return this.orders.listForActor(actor, { statuses: q.status, date: q.date });
  }

  @Get(':id')
  @Roles(...ROLES)
  get(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.getOne(actor, id);
  }

  // ———— العميل ————
  @Post(':id/cancel')
  @HttpCode(200)
  @Roles('customer')
  cancelByCustomer(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.transition(actor, id, 'cancelled');
  }

  @Post(':id/rate')
  @HttpCode(200)
  @Roles('customer')
  rate(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(rateSchema)) body: RateInput,
  ) {
    return this.orders.rate(actor, id, body);
  }

  // ———— المحل ————
  @Post(':id/accept')
  @HttpCode(200)
  @Roles('store')
  accept(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.transition(actor, id, 'accepted');
  }

  @Post(':id/reject')
  @HttpCode(200)
  @Roles('store')
  reject(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: { reason: string },
  ) {
    return this.orders.transition(actor, id, 'rejected', body.reason);
  }

  @Post(':id/ready')
  @HttpCode(200)
  @Roles('store')
  ready(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.transition(actor, id, 'ready');
  }

  // ———— الطيار ————
  @Post(':id/pickup')
  @HttpCode(200)
  @Roles('driver')
  pickup(@CurrentActor() actor: Actor, @Param('id', ParseUUIDPipe) id: string) {
    return this.orders.transition(actor, id, 'picked_up');
  }

  @Post(':id/deliver')
  @HttpCode(200)
  @Roles('driver')
  deliver(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(deliverSchema)) body: DeliverInput,
  ) {
    return this.orders.deliver(actor, id, body);
  }

  // ———— مدير التشغيل ————
  @Post(':id/assign')
  @HttpCode(200)
  @Roles('ops', 'admin')
  assign(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(assignSchema)) body: { driverId: string },
  ) {
    return this.orders.assign(actor, id, body.driverId);
  }

  @Post(':id/cancel-by-ops')
  @HttpCode(200)
  @Roles('ops', 'admin')
  cancelByOps(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: { reason: string },
  ) {
    return this.orders.transition(actor, id, 'cancelled', body.reason);
  }
}
