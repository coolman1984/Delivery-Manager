import {
  ACTIVE_ORDER_STATUSES,
  calcOrderTotals,
  canTransition,
  isAssignable,
  ORDER_STATUS_LABELS,
  type CreateOrderInput,
  type DeliverInput,
  type OrderStatus,
  type RateInput,
} from '@dm/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, ne, sql } from 'drizzle-orm';
import { AuditService } from '../../common/audit.service';
import type { Actor } from '../../common/auth-context';
import { DbService, Tx } from '../../common/db.service';
import {
  addresses,
  driverProfiles,
  orderEvents,
  orderItems,
  orders,
  products,
  ratings,
  stores,
  tenantCounters,
  users,
  zones,
} from '../../db/schema';
import { LedgerService } from '../finance/ledger.service';
import { RealtimeService } from '../realtime/realtime.service';

type OrderRow = typeof orders.$inferSelect;

const STATUS_TIMESTAMP: Partial<Record<OrderStatus, keyof OrderRow>> = {
  accepted: 'acceptedAt',
  ready: 'readyAt',
  picked_up: 'pickedUpAt',
  delivered: 'deliveredAt',
};

/**
 * قلب النظام: دورة حياة الطلب.
 * كل خطوة بتتأكد من ٣ حاجات: الدور مسموح له؟ الطلب ده بتاعه؟ الخطوة دي منطقية دلوقتي؟
 * والأسعار دايماً بتتحسب من قاعدة البيانات، عمرها ما بتتاخد من الموبايل.
 */
@Injectable()
export class OrdersService {
  constructor(
    private readonly dbs: DbService,
    private readonly audit: AuditService,
    private readonly ledger: LedgerService,
    private readonly realtime: RealtimeService,
  ) {}

  // ———— العميل يطلب ————

  async create(actor: Actor, input: CreateOrderInput) {
    const order = await this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [existing] = await tx
        .select()
        .from(orders)
        .where(
          and(
            eq(orders.customerId, actor.userId),
            eq(orders.clientRequestId, input.clientRequestId),
          ),
        )
        .limit(1);
      if (existing) return { row: existing, created: false };

      const [store] = await tx
        .select()
        .from(stores)
        .where(and(eq(stores.id, input.storeId), eq(stores.isActive, true)))
        .limit(1);
      if (!store) throw new NotFoundException('المحل مش موجود');
      if (!store.isOpen) throw new BadRequestException('المحل مقفول دلوقتي');

      const [address] = await tx
        .select({
          id: addresses.id,
          zoneId: addresses.zoneId,
          details: addresses.details,
          label: addresses.label,
        })
        .from(addresses)
        .where(
          and(
            eq(addresses.id, input.addressId),
            eq(addresses.userId, actor.userId),
            eq(addresses.isDeleted, false),
          ),
        )
        .limit(1);
      if (!address) throw new NotFoundException('العنوان مش موجود');

      const [zone] = await tx
        .select()
        .from(zones)
        .where(and(eq(zones.id, address.zoneId), eq(zones.isActive, true)))
        .limit(1);
      if (!zone) throw new BadRequestException('التوصيل مش متاح في المنطقة دي حالياً');

      const quantities = new Map<string, number>();
      for (const item of input.items) {
        quantities.set(item.productId, (quantities.get(item.productId) ?? 0) + item.quantity);
      }
      const productRows = await tx
        .select()
        .from(products)
        .where(
          and(
            inArray(products.id, [...quantities.keys()]),
            eq(products.storeId, store.id),
            eq(products.isAvailable, true),
          ),
        );
      if (productRows.length !== quantities.size) {
        throw new BadRequestException('في منتج في السلة مبقاش متاح، راجع السلة');
      }
      const lines = productRows.map((p) => ({ product: p, quantity: quantities.get(p.id)! }));
      for (const l of lines) {
        if (l.quantity > 99) throw new BadRequestException('الكمية كبيرة زيادة');
      }

      const totals = calcOrderTotals(
        lines.map((l) => ({ unitPrice: l.product.price, quantity: l.quantity })),
        zone.deliveryFee,
        store.commissionBps,
      );

      const [customer] = await tx
        .select({ name: users.name, phone: users.phone })
        .from(users)
        .where(eq(users.id, actor.userId))
        .limit(1);

      const number = await this.nextNumber(tx, actor.tenantId, 'order');
      const [row] = await tx
        .insert(orders)
        .values({
          tenantId: actor.tenantId,
          number,
          clientRequestId: input.clientRequestId,
          customerId: actor.userId,
          storeId: store.id,
          zoneId: zone.id,
          addressText: `${zone.name} — ${address.details}`,
          customerName: customer!.name,
          customerPhone: customer!.phone,
          subtotal: totals.subtotal,
          deliveryFee: totals.deliveryFee,
          discount: totals.discount,
          total: totals.total,
          commissionBps: store.commissionBps,
          commissionAmount: totals.commission,
          note: input.note ?? null,
        })
        .returning();
      await tx.insert(orderItems).values(
        lines.map((l) => ({
          tenantId: actor.tenantId,
          orderId: row!.id,
          productId: l.product.id,
          name: l.product.name,
          unitPrice: l.product.price,
          quantity: l.quantity,
          lineTotal: l.product.price * l.quantity,
        })),
      );
      await this.event(tx, row!, 'placed', null, 'placed', actor.userId);
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'order.placed',
        entityType: 'order',
        entityId: row!.id,
        meta: { total: totals.total },
      });
      return { row: row!, created: true };
    });

    if (order.created) this.notify(order.row);
    return this.toPublic(order.row, actor.role);
  }

  // ———— تغيير الحالة (قبول / رفض / جاهز / استلام / إلغاء) ————

  async transition(
    actor: Actor,
    orderId: string,
    to: Exclude<OrderStatus, 'placed' | 'delivered'>,
    reason?: string,
  ) {
    if ((to === 'rejected' || (to === 'cancelled' && actor.role !== 'customer')) && !reason) {
      throw new BadRequestException('اكتب السبب');
    }
    const result = await this.dbs.withTenant(actor.tenantId, async (tx) => {
      const order = await this.lockOwned(tx, actor, orderId);
      this.assertTransition(order, to, actor);
      if (to === 'picked_up' && order.driverId !== actor.userId) {
        throw new NotFoundException('الطلب مش موجود');
      }

      const now = new Date();
      const patch: Partial<OrderRow> = { status: to, updatedAt: now };
      const stamp = STATUS_TIMESTAMP[to];
      if (stamp) (patch as Record<string, unknown>)[stamp] = now;
      if (to === 'rejected' || to === 'cancelled') {
        patch.closedAt = now;
        patch.reason = reason ?? 'العميل لغى الطلب';
      }
      const [updated] = await tx
        .update(orders)
        .set(patch)
        .where(and(eq(orders.id, order.id), eq(orders.status, order.status)))
        .returning();

      await this.event(tx, updated!, to, order.status, to, actor.userId, reason);
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: `order.${to}`,
        entityType: 'order',
        entityId: order.id,
        meta: reason ? { reason } : undefined,
      });
      if ((to === 'rejected' || to === 'cancelled') && order.driverId) {
        await this.refreshDriverStatus(tx, order.driverId);
      }
      return updated!;
    });
    this.notify(result);
    return this.toPublic(result, actor.role);
  }

  // ———— التسليم وتسجيل الفلوس ————

  async deliver(actor: Actor, orderId: string, input: DeliverInput) {
    const result = await this.dbs.withTenant(actor.tenantId, async (tx) => {
      const order = await this.lockOwned(tx, actor, orderId);
      this.assertTransition(order, 'delivered', actor);

      if (input.cashCollected > order.total) {
        throw new BadRequestException('المبلغ المحصّل أكبر من المطلوب');
      }
      const difference = order.total - input.cashCollected;
      if (difference > 0 && !input.note) {
        throw new BadRequestException('المبلغ أقل من المطلوب، اكتب السبب');
      }

      const now = new Date();
      const [updated] = await tx
        .update(orders)
        .set({
          status: 'delivered',
          deliveredAt: now,
          closedAt: now,
          updatedAt: now,
          cashCollected: input.cashCollected,
          cashDiffStatus: difference > 0 ? 'pending' : 'none',
        })
        .where(and(eq(orders.id, order.id), eq(orders.status, 'picked_up')))
        .returning();

      await this.postDelivery(tx, updated!, actor.userId);
      await this.event(
        tx,
        updated!,
        'delivered',
        'picked_up',
        'delivered',
        actor.userId,
        input.note,
      );
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'order.delivered',
        entityType: 'order',
        entityId: order.id,
        meta: {
          total: order.total,
          cashCollected: input.cashCollected,
          difference,
          note: input.note,
        },
      });
      await this.refreshDriverStatus(tx, actor.userId);
      return updated!;
    });
    this.notify(result);
    return this.toPublic(result, actor.role);
  }

  /**
   * القيد المحاسبي للتسليم:
   * + عهدة الطيار بالمبلغ اللي حصّله
   * + فروقات التحصيل (لو حصّل أقل) لحد ما المدير يقرر
   * − مستحقات المحل (قيمة المنتجات ناقص العمولة)
   * − أرباح العمولة، − أرباح التوصيل
   */
  private async postDelivery(tx: Tx, order: OrderRow, actorId: string): Promise<void> {
    const t = order.tenantId;
    const cash = order.cashCollected ?? 0;
    const difference = order.total - cash;
    const lines = [
      { accountId: await this.ledger.account(tx, t, 'driver_cash', order.driverId), amount: cash },
      { accountId: await this.ledger.account(tx, t, 'cash_difference'), amount: difference },
      { accountId: await this.ledger.account(tx, t, 'loss'), amount: order.discount },
      {
        accountId: await this.ledger.account(tx, t, 'store_payable', order.storeId),
        amount: -(order.subtotal - order.commissionAmount),
      },
      {
        accountId: await this.ledger.account(tx, t, 'commission_revenue'),
        amount: -order.commissionAmount,
      },
      {
        accountId: await this.ledger.account(tx, t, 'delivery_revenue'),
        amount: -order.deliveryFee,
      },
    ];
    await this.ledger.post(tx, {
      tenantId: t,
      kind: 'order_delivered',
      refId: order.id,
      description: `تسليم طلب رقم ${order.number}`,
      createdBy: actorId,
      lines,
    });
  }

  // ———— الإسناد للطيار ————

  async assign(actor: Actor, orderId: string, driverId: string) {
    const result = await this.dbs.withTenant(actor.tenantId, async (tx) => {
      const order = await this.lockOwned(tx, actor, orderId);
      if (!isAssignable(order.status)) {
        throw new ConflictException(
          `مش ممكن تغيّر الطيار والطلب "${ORDER_STATUS_LABELS[order.status]}"`,
        );
      }
      const [driver] = await tx
        .select({ id: users.id, isActive: users.isActive, status: driverProfiles.status })
        .from(users)
        .innerJoin(driverProfiles, eq(driverProfiles.userId, users.id))
        .where(and(eq(users.id, driverId), eq(users.role, 'driver')))
        .limit(1);
      if (!driver || !driver.isActive) throw new NotFoundException('الطيار مش موجود');
      if (driver.status === 'offline') throw new BadRequestException('الطيار مش شغال دلوقتي');

      const now = new Date();
      const [updated] = await tx
        .update(orders)
        .set({ driverId, assignedAt: now, updatedAt: now })
        .where(eq(orders.id, order.id))
        .returning();
      await tx
        .update(driverProfiles)
        .set({ status: 'busy' })
        .where(eq(driverProfiles.userId, driverId));
      if (order.driverId && order.driverId !== driverId)
        await this.refreshDriverStatus(tx, order.driverId);

      await this.event(
        tx,
        updated!,
        order.driverId ? 'reassigned' : 'assigned',
        null,
        null,
        actor.userId,
      );
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'order.assigned',
        entityType: 'order',
        entityId: order.id,
        meta: { driverId, previousDriverId: order.driverId },
      });
      return { updated: updated!, previousDriverId: order.driverId };
    });
    this.notify(result.updated, result.previousDriverId);
    return this.toPublic(result.updated, actor.role);
  }

  // ———— التقييم ————

  async rate(actor: Actor, orderId: string, input: RateInput) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const order = await this.lockOwned(tx, actor, orderId);
      if (order.status !== 'delivered') throw new BadRequestException('التقييم بعد التسليم بس');
      const [existing] = await tx
        .select()
        .from(ratings)
        .where(eq(ratings.orderId, order.id))
        .limit(1);
      if (existing) throw new ConflictException('الطلب ده اتقيّم قبل كده');
      await tx.insert(ratings).values({
        tenantId: actor.tenantId,
        orderId: order.id,
        customerId: actor.userId,
        storeId: order.storeId,
        driverId: order.driverId,
        storeRating: input.storeRating,
        driverRating: order.driverId ? (input.driverRating ?? null) : null,
        comment: input.comment ?? null,
      });
      return { ok: true };
    });
  }

  // ———— القراءة ————

  async listForActor(actor: Actor, opts: { statuses?: OrderStatus[]; date?: string } = {}) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const where = and(
        this.ownershipFilter(actor),
        opts.statuses?.length ? inArray(orders.status, opts.statuses) : undefined,
        opts.date
          ? sql`(${orders.placedAt} at time zone 'Africa/Cairo')::date = ${opts.date}::date`
          : undefined,
      );
      const rows = await tx
        .select({
          order: orders,
          storeName: stores.name,
          driverName: users.name,
        })
        .from(orders)
        .innerJoin(stores, eq(stores.id, orders.storeId))
        .leftJoin(users, eq(users.id, orders.driverId))
        .where(where)
        .orderBy(desc(orders.placedAt))
        .limit(200);
      return rows.map((r) => ({
        ...this.toPublic(r.order, actor.role),
        storeName: r.storeName,
        driverName: r.driverName,
      }));
    });
  }

  async getOne(actor: Actor, orderId: string) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [row] = await tx
        .select({
          order: orders,
          storeName: stores.name,
          storePhone: stores.phone,
          driverName: users.name,
          driverPhone: users.phone,
        })
        .from(orders)
        .innerJoin(stores, eq(stores.id, orders.storeId))
        .leftJoin(users, eq(users.id, orders.driverId))
        .where(and(eq(orders.id, orderId), this.ownershipFilter(actor)))
        .limit(1);
      if (!row) throw new NotFoundException('الطلب مش موجود');
      const items = await tx
        .select({
          name: orderItems.name,
          unitPrice: orderItems.unitPrice,
          quantity: orderItems.quantity,
          lineTotal: orderItems.lineTotal,
        })
        .from(orderItems)
        .where(eq(orderItems.orderId, orderId));
      const events = await tx
        .select({
          type: orderEvents.type,
          toStatus: orderEvents.toStatus,
          note: orderEvents.note,
          createdAt: orderEvents.createdAt,
        })
        .from(orderEvents)
        .where(eq(orderEvents.orderId, orderId))
        .orderBy(orderEvents.createdAt);
      const [rating] = await tx.select().from(ratings).where(eq(ratings.orderId, orderId)).limit(1);
      return {
        ...this.toPublic(row.order, actor.role),
        storeName: row.storeName,
        storePhone: row.storePhone,
        driverName: row.driverName,
        driverPhone: actor.role === 'store' ? null : row.driverPhone,
        items,
        events,
        rated: Boolean(rating),
      };
    });
  }

  // ———— أدوات داخلية ————

  /**
   * بيجيب الطلب ويقفله لحد آخر المعاملة (عشان محدش يعدّل فيه في نفس اللحظة)،
   * بشرط إنه يخص اللي بيطلبه. لو مش بتاعه بنقول "مش موجود" عشان مانأكدش إنه موجود أصلاً.
   */
  private async lockOwned(tx: Tx, actor: Actor, orderId: string): Promise<OrderRow> {
    const [order] = await tx
      .select()
      .from(orders)
      .where(and(eq(orders.id, orderId), this.ownershipFilter(actor)))
      .for('update')
      .limit(1);
    if (!order) throw new NotFoundException('الطلب مش موجود');
    return order;
  }

  private ownershipFilter(actor: Actor) {
    switch (actor.role) {
      case 'customer':
        return eq(orders.customerId, actor.userId);
      case 'store':
        return actor.storeId ? eq(orders.storeId, actor.storeId) : sql`false`;
      case 'driver':
        return eq(orders.driverId, actor.userId);
      case 'ops':
      case 'admin':
        return undefined;
      default:
        return sql`false`;
    }
  }

  private assertTransition(order: OrderRow, to: OrderStatus, actor: Actor): void {
    if (!canTransition(order.status, to, actor.role)) {
      throw new ConflictException(`مش ممكن تعمل كده والطلب "${ORDER_STATUS_LABELS[order.status]}"`);
    }
    if (to === 'picked_up' && !order.driverId) {
      throw new ConflictException('الطلب لسه ماتسندش لطيار');
    }
  }

  /** الطيار يرجع "متاح" لما يخلّص كل طلباته */
  private async refreshDriverStatus(tx: Tx, driverId: string): Promise<void> {
    const [row] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(eq(orders.driverId, driverId), inArray(orders.status, [...ACTIVE_ORDER_STATUSES])),
      );
    const busy = (row?.count ?? 0) > 0;
    await tx
      .update(driverProfiles)
      .set({ status: busy ? 'busy' : 'available' })
      .where(and(eq(driverProfiles.userId, driverId), ne(driverProfiles.status, 'offline')));
  }

  private async nextNumber(tx: Tx, tenantId: string, name: string): Promise<number> {
    const [row] = await tx
      .insert(tenantCounters)
      .values({ tenantId, name, value: 1 })
      .onConflictDoUpdate({
        target: [tenantCounters.tenantId, tenantCounters.name],
        set: { value: sql`${tenantCounters.value} + 1` },
      })
      .returning({ value: tenantCounters.value });
    return row!.value;
  }

  private async event(
    tx: Tx,
    order: OrderRow,
    type: string,
    from: OrderStatus | null,
    to: OrderStatus | null,
    actorId: string,
    note?: string,
  ): Promise<void> {
    await tx.insert(orderEvents).values({
      tenantId: order.tenantId,
      orderId: order.id,
      type,
      fromStatus: from,
      toStatus: to,
      actorId,
      note: note ?? null,
    });
  }

  private notify(order: OrderRow, previousDriverId?: string | null): void {
    this.realtime.orderChanged({
      tenantId: order.tenantId,
      id: order.id,
      number: order.number,
      status: order.status,
      customerId: order.customerId,
      storeId: order.storeId,
      driverId: order.driverId,
      previousDriverId,
    });
  }

  /** كل دور يشوف اللي يخصه بس: العميل مايشوفش عمولة المحل، والمحل مايشوفش رقم العميل */
  private toPublic(o: OrderRow, role: Actor['role']) {
    const internal = role === 'store' || role === 'ops' || role === 'admin';
    const seesCustomerPhone = role !== 'store';
    return {
      id: o.id,
      number: o.number,
      status: o.status,
      storeId: o.storeId,
      driverId: o.driverId,
      customerName: o.customerName,
      customerPhone: seesCustomerPhone ? o.customerPhone : null,
      addressText: o.addressText,
      subtotal: o.subtotal,
      deliveryFee: o.deliveryFee,
      discount: o.discount,
      total: o.total,
      commissionAmount: internal ? o.commissionAmount : null,
      cashCollected: o.cashCollected,
      cashDiffStatus: o.cashDiffStatus,
      note: o.note,
      reason: o.reason,
      placedAt: o.placedAt,
      acceptedAt: o.acceptedAt,
      readyAt: o.readyAt,
      assignedAt: o.assignedAt,
      pickedUpAt: o.pickedUpAt,
      deliveredAt: o.deliveredAt,
    };
  }
}
