import { z } from 'zod';
import { MAX_AMOUNT_PIASTERS } from './money';
import { DRIVER_STATUSES, ROLES, STORE_TYPES } from './roles';

/**
 * قواعد فحص كل المدخلات. نفس القواعد بتتنفذ في الواجهة (عشان المستخدم يعرف غلطته بسرعة)
 * وفي السيرفر (عشان محدش يعدّي منها). أي حقل مش متعرّف هنا بيترفض.
 */

const ARABIC_DIGITS = /[٠-٩]/g;
function normalizeDigits(value: string): string {
  return value.replace(ARABIC_DIGITS, (d) => String(d.charCodeAt(0) - 0x0660));
}

/** رقم موبايل مصري، بيتقبل بأي شكل ويتحول لـ 01xxxxxxxxx */
export const phoneSchema = z
  .string()
  .max(20)
  .transform((v) => {
    const digits = normalizeDigits(v).replace(/[\s-]/g, '');
    if (digits.startsWith('+20')) return `0${digits.slice(3)}`;
    if (digits.startsWith('0020')) return `0${digits.slice(4)}`;
    if (digits.startsWith('20') && digits.length === 12) return `0${digits.slice(2)}`;
    return digits;
  })
  .pipe(
    z
      .string()
      .regex(/^01[0125]\d{8}$/, 'رقم الموبايل لازم يكون ١١ رقم ويبدأ بـ 010 أو 011 أو 012 أو 015'),
  );

export const passwordSchema = z
  .string()
  .min(10, 'كلمة السر لازم تكون ١٠ حروف على الأقل')
  .max(128, 'كلمة السر طويلة زيادة');

export const otpCodeSchema = z.string().regex(/^\d{6}$/, 'الكود ٦ أرقام');

const name = z.string().trim().min(2, 'الاسم قصير').max(80, 'الاسم طويل');
const shortText = z.string().trim().max(300, 'النص طويل');
const piasters = z.number().int().min(0).max(MAX_AMOUNT_PIASTERS);
const id = z.uuid('معرّف غير صحيح');

export const tenantSlugSchema = z.string().regex(/^[a-z0-9-]{2,40}$/);

// ———— الدخول ————
export const otpRequestSchema = z.strictObject({ phone: phoneSchema });
export const otpVerifySchema = z.strictObject({
  phone: phoneSchema,
  code: otpCodeSchema,
  name: name.optional(),
});
export const loginSchema = z.strictObject({
  phone: phoneSchema,
  password: z.string().min(1).max(128),
});

// ———— المناطق والعناوين ————
export const zoneCreateSchema = z.strictObject({
  name,
  deliveryFee: piasters,
  isActive: z.boolean().default(true),
});
export const zoneUpdateSchema = zoneCreateSchema.partial();

const lat = z.number().min(-90).max(90);
const lng = z.number().min(-180).max(180);

export const addressCreateSchema = z.strictObject({
  label: z.string().trim().min(1).max(40),
  zoneId: id,
  details: z.string().trim().min(5, 'اكتب العنوان بالتفصيل').max(300),
  lat: lat.optional(),
  lng: lng.optional(),
});

// ———— المحلات والمنتجات ————
export const storeCreateSchema = z.strictObject({
  name,
  type: z.enum(STORE_TYPES),
  zoneId: id,
  address: shortText,
  phone: phoneSchema,
  commissionBps: z.number().int().min(0).max(5000),
  isActive: z.boolean().default(true),
});
export const storeUpdateSchema = storeCreateSchema.partial();

export const storeOpenSchema = z.strictObject({ isOpen: z.boolean() });

export const productCreateSchema = z.strictObject({
  name,
  description: shortText.optional(),
  category: z.string().trim().max(40).optional(),
  price: piasters.min(1, 'السعر لازم يكون أكبر من صفر'),
  isAvailable: z.boolean().default(true),
});
export const productUpdateSchema = productCreateSchema.partial();

// ———— الطلبات ————
export const createOrderSchema = z.strictObject({
  /** رقم عشوائي بيعمله الموبايل: لو النت فصل والطلب اتبعت مرتين، يتسجل مرة واحدة بس */
  clientRequestId: id,
  storeId: id,
  addressId: id,
  items: z
    .array(z.strictObject({ productId: id, quantity: z.number().int().min(1).max(99) }))
    .min(1, 'السلة فاضية')
    .max(50),
  note: shortText.optional(),
});

export const reasonSchema = z.strictObject({
  reason: z.string().trim().min(3, 'اكتب السبب').max(300),
});

export const assignSchema = z.strictObject({ driverId: id });

export const deliverSchema = z.strictObject({
  cashCollected: piasters,
  note: shortText.optional(),
});

export const rateSchema = z.strictObject({
  storeRating: z.number().int().min(1).max(5),
  driverRating: z.number().int().min(1).max(5).optional(),
  comment: shortText.optional(),
});

// ———— الطيار ————
export const driverStatusSchema = z.strictObject({
  status: z.enum(DRIVER_STATUSES).exclude(['busy']),
});
export const locationSchema = z.strictObject({ lat, lng });

// ———— الفلوس ————
export const settleSchema = z.strictObject({
  receivedAmount: piasters,
  note: shortText.optional(),
});
export const payoutSchema = z.strictObject({
  amount: piasters.min(1),
  note: shortText.optional(),
});
export const resolveCashDiffSchema = z.strictObject({
  decision: z.enum(['write_off', 'charge_driver']),
  note: shortText.optional(),
});

// ———— المستخدمين ————
export const userCreateSchema = z
  .strictObject({
    name,
    phone: phoneSchema,
    role: z.enum(ROLES).exclude(['customer']),
    password: passwordSchema,
    storeId: id.optional(),
    nationalId: z
      .string()
      .regex(/^\d{14}$/, 'الرقم القومي ١٤ رقم')
      .optional(),
  })
  .refine((u) => (u.role === 'store') === Boolean(u.storeId), {
    message: 'حساب المحل لازم يتربط بمحل، وباقي الأدوار لا',
    path: ['storeId'],
  });
export const userUpdateSchema = z.strictObject({
  isActive: z.boolean().optional(),
  name: name.optional(),
});

export const dateQuerySchema = z.strictObject({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type OtpRequestInput = z.infer<typeof otpRequestSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ZoneCreateInput = z.infer<typeof zoneCreateSchema>;
export type ZoneUpdateInput = z.infer<typeof zoneUpdateSchema>;
export type AddressCreateInput = z.infer<typeof addressCreateSchema>;
export type StoreCreateInput = z.infer<typeof storeCreateSchema>;
export type StoreUpdateInput = z.infer<typeof storeUpdateSchema>;
export type ProductCreateInput = z.infer<typeof productCreateSchema>;
export type ProductUpdateInput = z.infer<typeof productUpdateSchema>;
export type CreateOrderInput = z.infer<typeof createOrderSchema>;
export type DeliverInput = z.infer<typeof deliverSchema>;
export type RateInput = z.infer<typeof rateSchema>;
export type SettleInput = z.infer<typeof settleSchema>;
export type PayoutInput = z.infer<typeof payoutSchema>;
export type ResolveCashDiffInput = z.infer<typeof resolveCashDiffSchema>;
export type UserCreateInput = z.infer<typeof userCreateSchema>;
export type UserUpdateInput = z.infer<typeof userUpdateSchema>;
