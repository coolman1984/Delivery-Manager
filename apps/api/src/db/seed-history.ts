import { calcCommission, pointsEarned } from '@dm/shared';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { randomUUID } from 'node:crypto';
import * as schema from './schema';
import {
  addresses,
  journals,
  ledgerAccounts,
  ledgerLines,
  loyaltyPoints,
  orderEvents,
  orderItems,
  orders,
  products,
  ratings,
  settlements,
  stores,
  tenantCounters,
  users,
  zones,
} from './schema';

type Tx = Parameters<Parameters<NodePgDatabase<typeof schema>['transaction']>[0]>[0];

/**
 * طلبات قديمة تجريبية لآخر أسبوعين (عشان التقارير واللوحات تبان مليانة وقت التجربة).
 * كل طلب اتسلّم ليه قيد محاسبي متوازن زي الحقيقي بالظبط، وكل يوم الطيارين عملوا تسوية.
 */
export async function seedHistory(tx: Tx, tenantId: string): Promise<number> {
  const rand = mulberry32(tenantId.charCodeAt(0) * 7919);
  const pick = <T>(list: T[]): T => list[Math.floor(rand() * list.length)]!;

  const storeRows = await tx.select().from(stores);
  const productRows = await tx.select().from(products);
  const drivers = await tx.select().from(users).where(eq(users.role, 'driver'));
  const customers = await tx.select().from(users).where(eq(users.role, 'customer'));
  const addressRows = await tx.select().from(addresses);
  const zoneRows = await tx.select().from(zones);
  const [admin] = await tx.select().from(users).where(eq(users.role, 'admin')).limit(1);

  const account = async (
    type: (typeof ledgerAccounts.$inferSelect)['type'],
    ownerId: string | null,
  ) => {
    const find = () =>
      tx
        .select({ id: ledgerAccounts.id })
        .from(ledgerAccounts)
        .where(
          and(
            eq(ledgerAccounts.type, type),
            ownerId ? eq(ledgerAccounts.ownerId, ownerId) : isNull(ledgerAccounts.ownerId),
          ),
        );
    const [found] = await find();
    if (found) return found.id;
    const [created] = await tx
      .insert(ledgerAccounts)
      .values({ tenantId, type, ownerId })
      .returning();
    return created!.id;
  };
  const post = async (
    kind: (typeof journals.$inferSelect)['kind'],
    refId: string,
    description: string,
    at: Date,
    lines: Array<[string, number]>,
  ) => {
    const [j] = await tx
      .insert(journals)
      .values({ tenantId, kind, refId, description, createdBy: admin!.id, createdAt: at })
      .returning();
    await tx
      .insert(ledgerLines)
      .values(
        lines
          .filter(([, a]) => a !== 0)
          .map(([accountId, amount]) => ({
            tenantId,
            journalId: j!.id,
            accountId,
            amount,
            createdAt: at,
          })),
      );
  };

  let number = 0;
  const cash = await account('company_cash', null);
  for (let daysAgo = 14; daysAgo >= 1; daysAgo--) {
    const perDriver = new Map<string, number>();
    const count = 4 + Math.floor(rand() * 8);
    for (let k = 0; k < count; k++) {
      const store = pick(storeRows);
      const items = productRows.filter((p) => p.storeId === store.id);
      if (items.length === 0) continue;
      const customer = pick(customers);
      const address = addressRows.find((a) => a.userId === customer.id)!;
      const zone = zoneRows.find((z) => z.id === address.zoneId) ?? pick(zoneRows);
      const driver = pick(drivers);
      const lines = Array.from({ length: 1 + Math.floor(rand() * 3) }, () => ({
        p: pick(items),
        q: 1 + Math.floor(rand() * 2),
      }));
      const subtotal = lines.reduce((s, l) => s + l.p.price * l.q, 0);
      const commission = calcCommission(subtotal, store.commissionBps);
      const fee = zone.deliveryFee;
      const roll = rand();
      const status = roll < 0.08 ? 'cancelled' : roll < 0.13 ? 'rejected' : 'delivered';
      const placedAt = new Date(
        Date.now() -
          daysAgo * 86_400_000 +
          (9 + rand() * 12) * 3_600_000 -
          (Date.now() % 3_600_000),
      );
      const minutes = 25 + Math.floor(rand() * 50);
      const at = (m: number) => new Date(placedAt.getTime() + m * 60_000);
      number += 1;
      const [o] = await tx
        .insert(orders)
        .values({
          tenantId,
          number,
          clientRequestId: randomUUID(),
          customerId: customer.id,
          storeId: store.id,
          driverId: status === 'delivered' ? driver.id : null,
          zoneId: zone.id,
          addressText: `${zone.name} — ${address.details}`,
          customerName: customer.name,
          customerPhone: customer.phone,
          status,
          subtotal,
          deliveryFee: fee,
          total: subtotal + fee,
          commissionBps: store.commissionBps,
          commissionAmount: commission,
          cashCollected: status === 'delivered' ? subtotal + fee : null,
          reason:
            status === 'rejected'
              ? pick(['منتج خلص', 'المحل زحمة جداً'])
              : status === 'cancelled'
                ? pick(['العميل طلب الإلغاء', 'العميل مابيردش'])
                : null,
          placedAt,
          acceptedAt: status !== 'rejected' ? at(2) : null,
          readyAt: status === 'delivered' ? at(Math.round(minutes * 0.5)) : null,
          assignedAt: status === 'delivered' ? at(3) : null,
          pickedUpAt: status === 'delivered' ? at(Math.round(minutes * 0.6)) : null,
          deliveredAt: status === 'delivered' ? at(minutes) : null,
          closedAt: at(status === 'delivered' ? minutes : 5),
        })
        .returning();
      await tx
        .insert(orderItems)
        .values(
          lines.map((l) => ({
            tenantId,
            orderId: o!.id,
            productId: l.p.id,
            name: l.p.name,
            unitPrice: l.p.price,
            quantity: l.q,
            lineTotal: l.p.price * l.q,
          })),
        );
      await tx
        .insert(orderEvents)
        .values({
          tenantId,
          orderId: o!.id,
          type: status,
          toStatus: status,
          createdAt: at(status === 'delivered' ? minutes : 5),
        });
      if (status !== 'delivered') continue;

      await post('order_delivered', o!.id, `تسليم طلب رقم ${number}`, at(minutes), [
        [await account('driver_cash', driver.id), subtotal + fee],
        [await account('store_payable', store.id), -(subtotal - commission)],
        [await account('commission_revenue', null), -commission],
        [await account('delivery_revenue', null), -fee],
      ]);
      perDriver.set(driver.id, (perDriver.get(driver.id) ?? 0) + subtotal + fee);
      const points = pointsEarned({ earnPer: 1000, pointValue: 10 }, subtotal);
      if (points > 0) {
        await tx
          .insert(loyaltyPoints)
          .values({
            tenantId,
            customerId: customer.id,
            orderId: o!.id,
            points,
            reason: 'earn',
            createdAt: at(minutes),
          });
      }
      if (rand() < 0.6) {
        await tx.insert(ratings).values({
          tenantId,
          orderId: o!.id,
          customerId: customer.id,
          storeId: store.id,
          driverId: driver.id,
          storeRating: rand() < 0.8 ? 5 : 4,
          driverRating: rand() < 0.85 ? 5 : 4,
          createdAt: at(minutes + 10),
        });
      }
    }
    // التسوية آخر اليوم: كل طيار سلّم عهدته كاملة
    for (const [driverId, amount] of perDriver) {
      const when = new Date(
        Date.now() - daysAgo * 86_400_000 + 23 * 3_600_000 - (Date.now() % 3_600_000),
      );
      const id = randomUUID();
      await post('driver_settlement', id, 'تسوية يومية', when, [
        [cash, amount],
        [await account('driver_cash', driverId), -amount],
      ]);
      await tx
        .insert(settlements)
        .values({
          id,
          tenantId,
          driverId,
          expectedAmount: amount,
          receivedAmount: amount,
          shortage: 0,
          createdBy: admin!.id,
          createdAt: when,
        });
    }
  }
  await tx
    .insert(tenantCounters)
    .values({ tenantId, name: 'order', value: number })
    .onConflictDoUpdate({
      target: [tenantCounters.tenantId, tenantCounters.name],
      set: { value: sql`${number}` },
    });
  return number;
}

/** أرقام عشوائية ثابتة (نفس البيانات كل مرة) */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
