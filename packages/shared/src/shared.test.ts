import { describe, expect, it } from 'vitest';
import { calcCommission, calcOrderTotals } from './money';
import { canTransition } from './order-status';
import { createOrderSchema, phoneSchema, userCreateSchema } from './schemas';

describe('الفلوس', () => {
  it('بتحسب العمولة بأرقام صحيحة وتقرّب النص لفوق', () => {
    expect(calcCommission(10_000, 1000)).toBe(1000);
    expect(calcCommission(999, 1000)).toBe(100);
    expect(calcCommission(994, 1000)).toBe(99);
    expect(calcCommission(995, 1000)).toBe(100);
    expect(calcCommission(0, 1500)).toBe(0);
  });

  it('بترفض المبالغ السالبة أو الكسور', () => {
    expect(() => calcCommission(-1, 1000)).toThrow();
    expect(() => calcCommission(10.5, 1000)).toThrow();
    expect(() => calcCommission(100, 10_001)).toThrow();
  });

  it('بتحسب إجمالي الطلب صح', () => {
    const t = calcOrderTotals(
      [
        { unitPrice: 4550, quantity: 2 },
        { unitPrice: 1000, quantity: 1 },
      ],
      1500,
      1200,
    );
    expect(t).toEqual({
      subtotal: 10_100,
      deliveryFee: 1500,
      discount: 0,
      total: 11_600,
      commission: 1212,
    });
  });

  it('الخصم عمره ما يخلّي الإجمالي بالسالب', () => {
    const t = calcOrderTotals([{ unitPrice: 1000, quantity: 1 }], 500, 0, 999_999);
    expect(t.total).toBe(0);
    expect(t.discount).toBe(1500);
  });

  it('بترفض كميات غريبة', () => {
    expect(() => calcOrderTotals([{ unitPrice: 100, quantity: 0 }], 0, 0)).toThrow();
    expect(() => calcOrderTotals([{ unitPrice: 100, quantity: 1.5 }], 0, 0)).toThrow();
    expect(() => calcOrderTotals([], 0, 0)).toThrow();
  });
});

describe('دورة الطلب', () => {
  it('كل دور يعمل خطوته بس', () => {
    expect(canTransition('placed', 'accepted', 'store')).toBe(true);
    expect(canTransition('placed', 'accepted', 'customer')).toBe(false);
    expect(canTransition('placed', 'accepted', 'driver')).toBe(false);
    expect(canTransition('ready', 'picked_up', 'driver')).toBe(true);
    expect(canTransition('picked_up', 'delivered', 'driver')).toBe(true);
    expect(canTransition('picked_up', 'delivered', 'ops')).toBe(false);
  });

  it('العميل يلغي قبل القبول بس', () => {
    expect(canTransition('placed', 'cancelled', 'customer')).toBe(true);
    expect(canTransition('accepted', 'cancelled', 'customer')).toBe(false);
  });

  it('مفيش رجوع ولا قفز في المراحل', () => {
    expect(canTransition('delivered', 'cancelled', 'admin')).toBe(false);
    expect(canTransition('placed', 'delivered', 'driver')).toBe(false);
    expect(canTransition('accepted', 'placed', 'store')).toBe(false);
  });
});

describe('فحص المدخلات', () => {
  it('بتوحّد شكل رقم الموبايل', () => {
    expect(phoneSchema.parse('01012345678')).toBe('01012345678');
    expect(phoneSchema.parse('+201012345678')).toBe('01012345678');
    expect(phoneSchema.parse('٠١٠١٢٣٤٥٦٧٨')).toBe('01012345678');
    expect(phoneSchema.parse('010 1234 5678')).toBe('01012345678');
  });

  it('بترفض أرقام غلط', () => {
    expect(phoneSchema.safeParse('0101234567').success).toBe(false);
    expect(phoneSchema.safeParse('01312345678').success).toBe(false);
    expect(phoneSchema.safeParse("01012345678' OR 1=1").success).toBe(false);
  });

  it('بترفض أي حقل زيادة (زي سعر مبعوت من العميل)', () => {
    const r = createOrderSchema.safeParse({
      clientRequestId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      storeId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      addressId: '0f8fad5b-d9cb-469f-a165-70867728950e',
      items: [{ productId: '0f8fad5b-d9cb-469f-a165-70867728950e', quantity: 1, price: 1 }],
    });
    expect(r.success).toBe(false);
  });

  it('مستخدم المحل لازم يتربط بمحل', () => {
    const base = { name: 'أحمد', phone: '01012345678', password: 'strong-pass-123' };
    expect(userCreateSchema.safeParse({ ...base, role: 'store' }).success).toBe(false);
    expect(userCreateSchema.safeParse({ ...base, role: 'driver' }).success).toBe(true);
    expect(userCreateSchema.safeParse({ ...base, role: 'customer' }).success).toBe(false);
  });
});

import { detectZone, distanceKm } from './geo';

describe('الخرايط', () => {
  it('بتحسب المسافة صح (القاهرة ↔ بني سويف تقريباً ١١٠ كم)', () => {
    const d = distanceKm({ lat: 30.0444, lng: 31.2357 }, { lat: 29.0661, lng: 31.0994 });
    expect(d).toBeGreaterThan(105);
    expect(d).toBeLessThan(115);
  });

  it('بتعرف المنطقة من المكان، والأقرب لو في تداخل', () => {
    const zones = [
      { id: 'a', lat: 29.07, lng: 31.1, radiusKm: 2 },
      { id: 'b', lat: 29.08, lng: 31.1, radiusKm: 2 },
    ];
    expect(detectZone(zones, { lat: 29.071, lng: 31.1 })?.id).toBe('a');
    expect(detectZone(zones, { lat: 29.079, lng: 31.1 })?.id).toBe('b');
    expect(detectZone(zones, { lat: 29.5, lng: 31.1 })).toBeNull();
  });
});
