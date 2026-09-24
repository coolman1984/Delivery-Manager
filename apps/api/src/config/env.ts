import { z } from 'zod';

/**
 * كل الإعدادات والأسرار بتيجي من متغيرات البيئة (ملف .env محلياً، أو إعدادات السيرفر).
 * مفيش ولا سر مكتوب في الكود. لو إعداد ناقص أو ضعيف السيرفر بيرفض يشتغل من الأول.
 */
const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().default(3000),
    // اتصال السيرفر العادي: بصلاحيات محدودة، والعزل بين الشركات مفروض عليه
    DATABASE_URL: z.string().url(),
    // اتصال الترحيلات بس (إنشاء الجداول): صلاحيات المالك، مايستخدمهوش السيرفر أبداً
    MIGRATION_DATABASE_URL: z.preprocess(
      (v) => (v === '' ? undefined : v),
      z.string().url().optional(),
    ),
    REDIS_URL: z.string().url(),
    JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET لازم يكون ٣٢ حرف على الأقل'),
    ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(60).max(3600).default(900),
    REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
    // مفتاح تشفير البيانات الحساسة: ٣٢ بايت مكتوبين hex (٦٤ حرف)
    DATA_ENCRYPTION_KEY: z
      .string()
      .regex(/^[0-9a-f]{64}$/i, 'DATA_ENCRYPTION_KEY لازم يكون 64 حرف hex'),
    // فولدر الصور المرفوعة (صور المحلات والمنتجات)
    MEDIA_DIR: z.string().default('./media'),
    CORS_ORIGINS: z.string().default('http://localhost:5173'),
    SMS_PROVIDER: z.enum(['console']).default('console'),
    TRUST_PROXY: z.coerce.number().int().min(0).max(5).default(0),
    // الدخول بكود على الموبايل: مقفول لحد ما نتعاقد مع شركة رسائل.
    // وهو مقفول، العملاء بيسجلوا ويدخلوا برقم الموبايل وكلمة سر.
    OTP_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((v) => v === 'true'),
  })
  .superRefine((env, ctx) => {
    for (const [key, value] of Object.entries(env)) {
      if (typeof value === 'string' && value.includes('CHANGE_ME')) {
        ctx.addIssue({
          code: 'custom',
          path: [key],
          message: 'لسه فيها قيمة المثال CHANGE_ME، غيّرها',
        });
      }
    }
    if (env.NODE_ENV === 'production' && env.OTP_ENABLED && env.SMS_PROVIDER === 'console') {
      ctx.addIssue({
        code: 'custom',
        path: ['SMS_PROVIDER'],
        message: 'في التشغيل الحقيقي لازم مزود رسائل حقيقي، مش طباعة الكود على الشاشة',
      });
    }
  });

export type Env = z.infer<typeof envSchema>;

let cached: Env | undefined;

export function loadEnv(source: NodeJS.ProcessEnv = process.env): Env {
  if (cached && source === process.env) return cached;
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
    throw new Error(`إعدادات البيئة ناقصة أو غلط:\n${issues.join('\n')}`);
  }
  if (source === process.env) cached = parsed.data;
  return parsed.data;
}

export const ENV = Symbol('ENV');
