/**
 * كل الفلوس في النظام بتتخزن بالقرش كرقم صحيح (١ جنيه = ١٠٠ قرش).
 * ده بيمنع أخطاء الكسور العشرية اللي بتضيّع قروش في الحسابات.
 */

export const PIASTERS_PER_POUND = 100;

/** الحد الأقصى لأي مبلغ في عملية واحدة: مليون جنيه */
export const MAX_AMOUNT_PIASTERS = 100_000_000;

export function assertPiasters(value: number, field = 'amount'): void {
  if (!Number.isSafeInteger(value) || value < 0 || value > MAX_AMOUNT_PIASTERS) {
    throw new RangeError(`${field} must be a non-negative integer number of piasters`);
  }
}

/** نسبة العمولة بتتخزن بـ"جزء من عشرة آلاف": ١٠٠٠ = ١٠٪ */
export const BPS_DENOMINATOR = 10_000;

/**
 * حساب العمولة مع تقريب النص لفوق، بأرقام صحيحة فقط.
 * مثال: ٩٩٩ قرش × ١٠٪ = ٩٩٫٩ ← ١٠٠ قرش
 */
export function calcCommission(subtotal: number, commissionBps: number): number {
  assertPiasters(subtotal, 'subtotal');
  if (!Number.isInteger(commissionBps) || commissionBps < 0 || commissionBps > BPS_DENOMINATOR) {
    throw new RangeError('commissionBps must be an integer between 0 and 10000');
  }
  return Math.floor((subtotal * commissionBps + BPS_DENOMINATOR / 2) / BPS_DENOMINATOR);
}

export interface OrderLineInput {
  unitPrice: number;
  quantity: number;
}

export interface OrderTotals {
  subtotal: number;
  deliveryFee: number;
  discount: number;
  total: number;
  commission: number;
}

export function calcOrderTotals(
  lines: OrderLineInput[],
  deliveryFee: number,
  commissionBps: number,
  discount = 0,
): OrderTotals {
  if (lines.length === 0) throw new RangeError('order must have at least one line');
  let subtotal = 0;
  for (const line of lines) {
    assertPiasters(line.unitPrice, 'unitPrice');
    if (!Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 99) {
      throw new RangeError('quantity must be an integer between 1 and 99');
    }
    subtotal += line.unitPrice * line.quantity;
  }
  assertPiasters(subtotal, 'subtotal');
  assertPiasters(deliveryFee, 'deliveryFee');
  assertPiasters(discount, 'discount');
  const gross = subtotal + deliveryFee;
  const appliedDiscount = Math.min(discount, gross);
  return {
    subtotal,
    deliveryFee,
    discount: appliedDiscount,
    total: gross - appliedDiscount,
    commission: calcCommission(subtotal, commissionBps),
  };
}

/** عرض المبلغ للمستخدم: ١٢٣٤٥ قرش ← "١٢٣٫٤٥ ج.م" */
export function formatEGP(piasters: number): string {
  const pounds = piasters / PIASTERS_PER_POUND;
  return `${pounds.toLocaleString('ar-EG', {
    minimumFractionDigits: Number.isInteger(pounds) ? 0 : 2,
    maximumFractionDigits: 2,
  })} ج.م`;
}

/** تحويل مبلغ بالجنيه (من خانة إدخال) لقروش */
export function poundsToPiasters(pounds: number): number {
  return Math.round(pounds * PIASTERS_PER_POUND);
}
