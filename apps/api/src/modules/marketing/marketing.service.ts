import { calcCouponDiscount, maxRedeemablePoints, pointsEarned } from '@dm/shared';
import { BadRequestException, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, ne, notInArray, sql } from 'drizzle-orm';
import type { Tx } from '../../common/db.service';
import { couponRedemptions, coupons, loyaltyPoints, orders } from '../../db/schema';
import type { TenantSettings } from '../settings/settings.service';

type Coupon = typeof coupons.$inferSelect;
type OrderRow = typeof orders.$inferSelect;

export interface CouponCheck {
  subtotal: number;
  deliveryFee: number;
  storeId: string | null;
  customerId: string;
  excludeOrderId?: string;
}

/**
 * الكوبونات ونقاط الولاء.
 * الخصم دايماً بيتحسب في السيرفر، والشركة هي اللي بتتحمله (مش المحل):
 * المحل بياخد حقه كامل على قيمة المنتجات.
 */
@Injectable()
export class MarketingService {
  /** بيتأكد إن الكوبون ينفع، وبيرجّع قيمة الخصم. lock = يقفل الكوبون لحد آخر المعاملة (عشان الحد الأقصى للاستخدام) */
  async resolveCoupon(
    tx: Tx,
    rawCode: string,
    c: CouponCheck,
    lock = true,
  ): Promise<{ coupon: Coupon; discount: number }> {
    const code = rawCode.trim().toUpperCase();
    const query = tx.select().from(coupons).where(eq(coupons.code, code)).limit(1);
    const [coupon] = lock ? await query.for('update') : await query;
    const invalid = (msg: string) =>
      new BadRequestException({ statusCode: 400, message: msg, code: 'COUPON_INVALID' });
    if (!coupon || !coupon.isActive) throw invalid('الكود ده مش شغال');
    const now = new Date();
    if (coupon.startsAt && coupon.startsAt > now) throw invalid('العرض ده لسه مابدأش');
    if (coupon.endsAt && coupon.endsAt < now) throw invalid('العرض ده خلص');
    if (coupon.storeId && coupon.storeId !== c.storeId) throw invalid('الكوبون ده على محل تاني');
    if (c.subtotal < coupon.minSubtotal) {
      throw invalid(
        `الكوبون ده للطلبات من ${(coupon.minSubtotal / 100).toLocaleString('ar-EG')} جنيه`,
      );
    }

    const [usage] = await tx
      .select({
        total: sql<number>`count(*)::int`,
        mine: sql<number>`count(*) filter (where ${couponRedemptions.customerId} = ${c.customerId})::int`,
      })
      .from(couponRedemptions)
      .where(
        and(
          eq(couponRedemptions.couponId, coupon.id),
          c.excludeOrderId ? ne(couponRedemptions.orderId, c.excludeOrderId) : undefined,
        ),
      );
    if (coupon.maxUses !== null && (usage?.total ?? 0) >= coupon.maxUses)
      throw invalid('العرض ده خلص عدده');
    if ((usage?.mine ?? 0) >= coupon.perCustomerLimit) throw invalid('استخدمت الكوبون ده قبل كده');

    if (coupon.firstOrderOnly) {
      const [prev] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(orders)
        .where(
          and(
            eq(orders.customerId, c.customerId),
            notInArray(orders.status, ['cancelled', 'rejected']),
            c.excludeOrderId ? ne(orders.id, c.excludeOrderId) : undefined,
          ),
        );
      if ((prev?.n ?? 0) > 0) throw invalid('الكوبون ده لأول طلب بس');
    }

    const discount = calcCouponDiscount(coupon, c.subtotal, c.deliveryFee);
    if (discount <= 0) throw invalid('الكوبون مالهوش خصم على الطلب ده');
    return { coupon, discount };
  }

  async redeem(tx: Tx, order: OrderRow): Promise<void> {
    if (order.couponId && order.couponDiscount > 0) {
      await tx.insert(couponRedemptions).values({
        tenantId: order.tenantId,
        couponId: order.couponId,
        orderId: order.id,
        customerId: order.customerId,
        amount: order.couponDiscount,
      });
    }
    if (order.pointsUsed > 0) {
      await tx.insert(loyaltyPoints).values({
        tenantId: order.tenantId,
        customerId: order.customerId,
        orderId: order.id,
        points: -order.pointsUsed,
        reason: 'redeem',
      });
    }
  }

  /** الطلب اتلغى أو اترفض: الكوبون يرجع يتاخد تاني، والنقاط ترجع لصاحبها */
  async release(tx: Tx, order: OrderRow): Promise<void> {
    await tx.delete(couponRedemptions).where(eq(couponRedemptions.orderId, order.id));
    if (order.pointsUsed > 0) {
      await tx
        .insert(loyaltyPoints)
        .values({
          tenantId: order.tenantId,
          customerId: order.customerId,
          orderId: order.id,
          points: order.pointsUsed,
          reason: 'refund',
        })
        .onConflictDoNothing();
    }
  }

  /** بعد التسليم: العميل بياخد نقاط على قيمة المنتجات */
  async earn(tx: Tx, order: OrderRow, settings: TenantSettings): Promise<void> {
    if (!settings.loyaltyEnabled) return;
    const points = pointsEarned(
      { earnPer: settings.loyaltyEarnPer, pointValue: settings.loyaltyPointValue },
      order.subtotal,
    );
    if (points <= 0) return;
    await tx
      .insert(loyaltyPoints)
      .values({
        tenantId: order.tenantId,
        customerId: order.customerId,
        orderId: order.id,
        points,
        reason: 'earn',
      })
      .onConflictDoNothing();
  }

  async balance(tx: Tx, customerId: string): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${loyaltyPoints.points}), 0)::int` })
      .from(loyaltyPoints)
      .where(eq(loyaltyPoints.customerId, customerId));
    return row?.total ?? 0;
  }

  pointsDiscount(
    settings: TenantSettings,
    balance: number,
    payable: number,
  ): { points: number; discount: number } {
    if (!settings.loyaltyEnabled) return { points: 0, discount: 0 };
    const rule = { earnPer: settings.loyaltyEarnPer, pointValue: settings.loyaltyPointValue };
    const points = maxRedeemablePoints(rule, balance, payable);
    return { points, discount: points * settings.loyaltyPointValue };
  }

  history(tx: Tx, customerId: string) {
    return tx
      .select({
        points: loyaltyPoints.points,
        reason: loyaltyPoints.reason,
        createdAt: loyaltyPoints.createdAt,
        orderNumber: orders.number,
      })
      .from(loyaltyPoints)
      .leftJoin(orders, eq(orders.id, loyaltyPoints.orderId))
      .where(eq(loyaltyPoints.customerId, customerId))
      .orderBy(desc(loyaltyPoints.createdAt))
      .limit(50);
  }

  /** العروض اللي بتظهر في الصفحة الرئيسية */
  publicOffers(tx: Tx) {
    const now = new Date();
    return tx
      .select({
        code: coupons.code,
        title: coupons.title,
        kind: coupons.kind,
        value: coupons.value,
        maxDiscount: coupons.maxDiscount,
        minSubtotal: coupons.minSubtotal,
        storeId: coupons.storeId,
        firstOrderOnly: coupons.firstOrderOnly,
        endsAt: coupons.endsAt,
      })
      .from(coupons)
      .where(
        and(
          eq(coupons.isActive, true),
          eq(coupons.isPublic, true),
          sql`(${coupons.startsAt} is null or ${coupons.startsAt} <= ${now})`,
          sql`(${coupons.endsAt} is null or ${coupons.endsAt} >= ${now})`,
        ),
      )
      .orderBy(desc(coupons.createdAt))
      .limit(10);
  }

  async listWithUsage(tx: Tx) {
    const rows = await tx.select().from(coupons).orderBy(desc(coupons.createdAt));
    if (rows.length === 0) return [];
    const usage = await tx
      .select({
        couponId: couponRedemptions.couponId,
        uses: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${couponRedemptions.amount}), 0)::int`,
      })
      .from(couponRedemptions)
      .where(
        inArray(
          couponRedemptions.couponId,
          rows.map((r) => r.id),
        ),
      )
      .groupBy(couponRedemptions.couponId);
    const map = new Map(usage.map((u) => [u.couponId, u]));
    return rows.map((r) => ({
      ...r,
      uses: map.get(r.id)?.uses ?? 0,
      totalDiscount: map.get(r.id)?.total ?? 0,
    }));
  }
}
