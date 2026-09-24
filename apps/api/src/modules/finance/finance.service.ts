import type { PayoutInput, ResolveCashDiffInput, SettleInput } from '@dm/shared';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit.service';
import type { Actor } from '../../common/auth-context';
import { DbService } from '../../common/db.service';
import { driverProfiles, orders, settlements, stores, users } from '../../db/schema';
import { LedgerService } from './ledger.service';

const cairoDate = (col: unknown) => sql`(${col} at time zone 'Africa/Cairo')::date`;
const todayCairo = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());

/**
 * ضبط الفلوس:
 * - عهدة كل طيار = اللي حصّله − اللي سلّمه (محسوبة من دفتر الحسابات، مش رقم بيتكتب بالإيد)
 * - التسوية اليومية: الطيار بيسلّم، والعجز (لو فيه) بيفضل عليه ظاهر لحد ما يتسدد
 * - مستحقات المحلات وصرفها
 * - فروقات التحصيل: المدير يقرر يشطبها ولا يحمّلها للطيار
 */
@Injectable()
export class FinanceService {
  constructor(
    private readonly dbs: DbService,
    private readonly ledger: LedgerService,
    private readonly audit: AuditService,
  ) {}

  async driverCash(actor: Actor, driverId: string) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const balances = await this.ledger.balancesByOwner(tx, 'driver_cash', [driverId]);
      const [today] = await tx
        .select({
          delivered: sql<number>`count(*)::int`,
          collected: sql<number>`coalesce(sum(${orders.cashCollected}), 0)::int`,
        })
        .from(orders)
        .where(
          and(
            eq(orders.driverId, driverId),
            eq(orders.status, 'delivered'),
            sql`${cairoDate(orders.deliveredAt)} = ${todayCairo()}::date`,
          ),
        );
      return {
        balance: balances.get(driverId) ?? 0,
        todayDelivered: today?.delivered ?? 0,
        todayCollected: today?.collected ?? 0,
      };
    });
  }

  async driversOverview(actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const rows = await tx
        .select({
          id: users.id,
          name: users.name,
          phone: users.phone,
          isActive: users.isActive,
          status: driverProfiles.status,
          lastSeenAt: driverProfiles.lastSeenAt,
          lastLat: driverProfiles.lastLat,
          lastLng: driverProfiles.lastLng,
          activeOrders: sql<number>`(select count(*)::int from ${orders} o where o.driver_id = ${users.id} and o.status in ('placed','accepted','ready','picked_up'))`,
        })
        .from(users)
        .innerJoin(driverProfiles, eq(driverProfiles.userId, users.id))
        .where(eq(users.role, 'driver'))
        .orderBy(users.name);
      const balances = await this.ledger.balancesByOwner(tx, 'driver_cash');
      return rows.map((r) => ({ ...r, cashBalance: balances.get(r.id) ?? 0 }));
    });
  }

  async settle(actor: Actor, driverId: string, input: SettleInput) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      // قفل ملف الطيار عشان مايحصلش تسويتين في نفس اللحظة
      const [driver] = await tx
        .select({ userId: driverProfiles.userId, name: users.name })
        .from(driverProfiles)
        .innerJoin(users, eq(users.id, driverProfiles.userId))
        .where(eq(driverProfiles.userId, driverId))
        .for('update')
        .limit(1);
      if (!driver) throw new NotFoundException('الطيار مش موجود');

      const cashAccount = await this.ledger.account(tx, actor.tenantId, 'driver_cash', driverId);
      const expected = await this.ledger.balance(tx, cashAccount);
      if (expected <= 0 && input.receivedAmount === 0)
        throw new BadRequestException('مفيش عهدة على الطيار');
      if (input.receivedAmount > expected) {
        throw new BadRequestException('المبلغ المستلم أكبر من عهدة الطيار');
      }

      const settlementId = randomUUID();
      let journalId: string | null = null;
      if (input.receivedAmount > 0) {
        journalId = await this.ledger.post(tx, {
          tenantId: actor.tenantId,
          kind: 'driver_settlement',
          refId: settlementId,
          description: `تسوية عهدة ${driver.name}`,
          createdBy: actor.userId,
          lines: [
            {
              accountId: await this.ledger.account(tx, actor.tenantId, 'company_cash'),
              amount: input.receivedAmount,
            },
            { accountId: cashAccount, amount: -input.receivedAmount },
          ],
        });
      }
      const [row] = await tx
        .insert(settlements)
        .values({
          id: settlementId,
          tenantId: actor.tenantId,
          driverId,
          expectedAmount: expected,
          receivedAmount: input.receivedAmount,
          shortage: expected - input.receivedAmount,
          journalId,
          note: input.note ?? null,
          createdBy: actor.userId,
        })
        .returning();
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'finance.driver_settled',
        entityType: 'settlement',
        entityId: settlementId,
        meta: {
          driverId,
          expected,
          received: input.receivedAmount,
          shortage: expected - input.receivedAmount,
        },
      });
      return row!;
    });
  }

  async settlementsList(actor: Actor, date?: string) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          id: settlements.id,
          driverId: settlements.driverId,
          driverName: users.name,
          expectedAmount: settlements.expectedAmount,
          receivedAmount: settlements.receivedAmount,
          shortage: settlements.shortage,
          note: settlements.note,
          createdAt: settlements.createdAt,
        })
        .from(settlements)
        .innerJoin(users, eq(users.id, settlements.driverId))
        .where(sql`${cairoDate(settlements.createdAt)} = ${date ?? todayCairo()}::date`)
        .orderBy(desc(settlements.createdAt)),
    );
  }

  async storeBalances(actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const rows = await tx
        .select({ id: stores.id, name: stores.name, type: stores.type })
        .from(stores)
        .orderBy(stores.name);
      const balances = await this.ledger.balancesByOwner(tx, 'store_payable');
      // رصيد المحل في الدفتر بالسالب = إحنا مديونين له
      return rows.map((s) => ({ ...s, payable: -(balances.get(s.id) ?? 0) }));
    });
  }

  async payoutStore(actor: Actor, storeId: string, input: PayoutInput) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [store] = await tx
        .select()
        .from(stores)
        .where(eq(stores.id, storeId))
        .for('update')
        .limit(1);
      if (!store) throw new NotFoundException('المحل مش موجود');
      const account = await this.ledger.account(tx, actor.tenantId, 'store_payable', storeId);
      const owed = -(await this.ledger.balance(tx, account));
      if (input.amount > owed) throw new BadRequestException('المبلغ أكبر من مستحقات المحل');
      const payoutId = randomUUID();
      await this.ledger.post(tx, {
        tenantId: actor.tenantId,
        kind: 'store_payout',
        refId: payoutId,
        description: `صرف مستحقات ${store.name}${input.note ? ` — ${input.note}` : ''}`,
        createdBy: actor.userId,
        lines: [
          { accountId: account, amount: input.amount },
          {
            accountId: await this.ledger.account(tx, actor.tenantId, 'company_cash'),
            amount: -input.amount,
          },
        ],
      });
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: 'finance.store_payout',
        entityType: 'store',
        entityId: storeId,
        meta: { amount: input.amount, owed },
      });
      return { id: payoutId, remaining: owed - input.amount };
    });
  }

  async cashDifferences(actor: Actor) {
    return this.dbs.withTenant(actor.tenantId, (tx) =>
      tx
        .select({
          orderId: orders.id,
          number: orders.number,
          total: orders.total,
          cashCollected: orders.cashCollected,
          driverId: orders.driverId,
          driverName: users.name,
          deliveredAt: orders.deliveredAt,
        })
        .from(orders)
        .leftJoin(users, eq(users.id, orders.driverId))
        .where(eq(orders.cashDiffStatus, 'pending'))
        .orderBy(desc(orders.deliveredAt)),
    );
  }

  async resolveCashDifference(actor: Actor, orderId: string, input: ResolveCashDiffInput) {
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const [order] = await tx
        .select()
        .from(orders)
        .where(eq(orders.id, orderId))
        .for('update')
        .limit(1);
      if (!order) throw new NotFoundException('الطلب مش موجود');
      if (order.cashDiffStatus !== 'pending') throw new ConflictException('الفرق ده اتحسم قبل كده');
      const diff = order.total - (order.cashCollected ?? 0);
      const debitAccount =
        input.decision === 'write_off'
          ? await this.ledger.account(tx, actor.tenantId, 'loss')
          : await this.ledger.account(tx, actor.tenantId, 'driver_cash', order.driverId);
      await this.ledger.post(tx, {
        tenantId: actor.tenantId,
        kind: input.decision === 'write_off' ? 'cash_diff_write_off' : 'cash_diff_charge_driver',
        refId: order.id,
        description: `حسم فرق تحصيل طلب ${order.number}`,
        createdBy: actor.userId,
        lines: [
          { accountId: debitAccount, amount: diff },
          {
            accountId: await this.ledger.account(tx, actor.tenantId, 'cash_difference'),
            amount: -diff,
          },
        ],
      });
      await tx
        .update(orders)
        .set({
          cashDiffStatus: input.decision === 'write_off' ? 'written_off' : 'charged_driver',
          updatedAt: new Date(),
        })
        .where(eq(orders.id, order.id));
      await this.audit.log(tx, {
        tenantId: actor.tenantId,
        actorId: actor.userId,
        actorRole: actor.role,
        ip: actor.ip,
        userAgent: actor.userAgent,
        action: `finance.cash_diff_${input.decision}`,
        entityType: 'order',
        entityId: order.id,
        meta: { diff, note: input.note },
      });
      return { ok: true };
    });
  }

  /** ملخص اليوم لمدير التشغيل */
  async summary(actor: Actor, date?: string) {
    const day = date ?? todayCairo();
    return this.dbs.withTenant(actor.tenantId, async (tx) => {
      const byStatus = await tx
        .select({ status: orders.status, count: sql<number>`count(*)::int` })
        .from(orders)
        .where(sql`${cairoDate(orders.placedAt)} = ${day}::date`)
        .groupBy(orders.status);
      const [money] = await tx
        .select({
          sales: sql<number>`coalesce(sum(${orders.subtotal}), 0)::int`,
          commission: sql<number>`coalesce(sum(${orders.commissionAmount}), 0)::int`,
          deliveryFees: sql<number>`coalesce(sum(${orders.deliveryFee}), 0)::int`,
          collected: sql<number>`coalesce(sum(${orders.cashCollected}), 0)::int`,
        })
        .from(orders)
        .where(
          and(eq(orders.status, 'delivered'), sql`${cairoDate(orders.deliveredAt)} = ${day}::date`),
        );
      const [late] = await tx
        .select({ count: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          sql`${orders.status} in ('placed','accepted','ready','picked_up') and ${orders.placedAt} < now() - interval '60 minutes'`,
        );
      return {
        date: day,
        ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r.count])),
        sales: money?.sales ?? 0,
        commission: money?.commission ?? 0,
        deliveryFees: money?.deliveryFees ?? 0,
        collected: money?.collected ?? 0,
        cashWithDrivers: await this.ledger.totalByType(tx, 'driver_cash'),
        pendingCashDifferences: await this.ledger.totalByType(tx, 'cash_difference'),
        lateOrders: late?.count ?? 0,
      };
    });
  }
}
