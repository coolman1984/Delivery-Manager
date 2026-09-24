import { BPS_DENOMINATOR } from './money';

export const COUPON_KINDS = ['percent', 'fixed', 'free_delivery'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];

export const COUPON_KIND_LABELS: Record<CouponKind, string> = {
  percent: 'نسبة خصم',
  fixed: 'مبلغ ثابت',
  free_delivery: 'توصيل مجاني',
};

export interface CouponRule {
  kind: CouponKind;
  /** percent: بالـ bps (١٠٠٠ = ١٠٪) — fixed: بالقرش — free_delivery: مش مستخدم */
  value: number;
  maxDiscount: number | null;
  minSubtotal: number;
}

/** قيمة خصم الكوبون بالقرش (عمره ما يزيد عن قيمة الطلب) */
export function calcCouponDiscount(
  rule: CouponRule,
  subtotal: number,
  deliveryFee: number,
): number {
  if (subtotal < rule.minSubtotal) return 0;
  let discount = 0;
  switch (rule.kind) {
    case 'percent':
      discount = Math.floor((subtotal * rule.value) / BPS_DENOMINATOR);
      break;
    case 'fixed':
      discount = rule.value;
      break;
    case 'free_delivery':
      discount = deliveryFee;
      break;
  }
  if (rule.maxDiscount !== null) discount = Math.min(discount, rule.maxDiscount);
  return Math.max(0, Math.min(discount, subtotal + deliveryFee));
}

export interface LoyaltyRule {
  /** كل كام قرش من قيمة المنتجات = نقطة (١٠٠٠ = نقطة لكل ١٠ جنيه) */
  earnPer: number;
  /** قيمة النقطة بالقرش لما تتصرف */
  pointValue: number;
}

export function pointsEarned(rule: LoyaltyRule, subtotal: number): number {
  return rule.earnPer > 0 ? Math.floor(subtotal / rule.earnPer) : 0;
}

/** أقصى نقاط ينفع تتصرف على طلب (من غير ما الإجمالي يبقى بالسالب) */
export function maxRedeemablePoints(rule: LoyaltyRule, balance: number, payable: number): number {
  if (rule.pointValue <= 0 || balance <= 0 || payable <= 0) return 0;
  return Math.min(balance, Math.floor(payable / rule.pointValue));
}
