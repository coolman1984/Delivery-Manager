import * as argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { loadDotenv } from '../config/load-dotenv';
import { ARGON2_OPTIONS } from '../modules/auth/auth.service';
import * as schema from './schema';
import { seedHistory } from './seed-history';
import {
  addresses,
  coupons,
  driverProfiles,
  products,
  stores,
  tenants,
  users,
  zones,
} from './schema';

/**
 * بيانات تجريبية: شركتين منفصلتين (بني سويف والفيوم) عشان تجرب النظام وتشوف العزل بعينك.
 * ممنوع يشتغل على السيرفر الحقيقي.
 */
export const DEMO_PASSWORD = 'Demo@123456';

interface TenantSeed {
  slug: string;
  name: string;
  governorate: string;
  phonePrefix: string; // أول ٩ أرقام من الموبايل، والباقي رقمين بيتغيروا
  zones: Array<[string, number, number, number, number]>;
  stores: Array<{
    name: string;
    type: 'restaurant' | 'pharmacy' | 'grocery' | 'other';
    zone: number;
    commissionBps: number;
    products: Array<[string, string, number, string]>;
    prepMinutes?: number;
  }>;
  drivers: string[];
  customers: string[];
}

const TENANTS: TenantSeed[] = [
  {
    slug: 'beni-suef',
    name: 'توصيل بني سويف',
    governorate: 'بني سويف',
    phonePrefix: '010000000',
    zones: [
      ['وسط البلد', 1500, 29.0661, 31.0994, 1.5],
      ['مقبل', 1500, 29.056, 31.088, 1.5],
      ['الأباصيري', 2000, 29.079, 31.1075, 1.5],
      ['الزراعيين', 2000, 29.086, 31.093, 1.5],
      ['بني سويف الجديدة (شرق النيل)', 3500, 29.072, 31.15, 3],
    ],
    stores: [
      {
        name: 'مشويات أبو علي',
        type: 'restaurant',
        zone: 0,
        commissionBps: 1200,
        products: [
          ['نص فرخة مشوية', 'مشويات', 12000, 'chicken'],
          ['كفتة ربع كيلو', 'مشويات', 11000, 'meat'],
          ['طبق رز', 'أطباق جانبية', 2500, 'rice'],
          ['سلطة بلدي', 'أطباق جانبية', 1500, 'salad'],
          ['طحينة', 'أطباق جانبية', 1500, 'canned'],
          ['كانز', 'مشروبات', 1500, 'drink'],
        ],
      },
      {
        name: 'صيدلية الشفاء',
        type: 'pharmacy',
        zone: 1,
        commissionBps: 500,
        products: [
          ['بنادول أدفانس ٢٤ قرص', 'مسكنات', 7200, 'pill'],
          ['كمامات ١٠ قطع', 'مستلزمات', 2500, 'mask'],
          ['كحول ١٢٥ مل', 'مستلزمات', 2000, 'lotion'],
          ['فيتامين سي فوار', 'فيتامينات', 4500, 'apple'],
        ],
      },
      {
        name: 'سوبر ماركت الخير',
        type: 'grocery',
        zone: 2,
        commissionBps: 800,
        products: [
          ['لبن كامل الدسم ١ لتر', 'ألبان', 4200, 'milk'],
          ['جبنة بيضا ٥٠٠ جم', 'ألبان', 6000, 'cheese'],
          ['عيش فينو ٥ قطع', 'مخبوزات', 1000, 'bread'],
          ['رز مصري ١ كيلو', 'بقالة', 3800, 'rice'],
          ['زيت ١ لتر', 'بقالة', 8500, 'oil'],
          ['سكر ١ كيلو', 'بقالة', 3500, 'canned'],
        ],
      },
      {
        name: 'بيتزا الأصدقاء',
        type: 'restaurant',
        zone: 0,
        commissionBps: 1200,
        prepMinutes: 25,
        products: [
          ['بيتزا مارجريتا وسط', 'بيتزا', 9500, 'pizza'],
          ['بيتزا خضار وسط', 'بيتزا', 10500, 'pizza'],
          ['بطاطس محمرة', 'إضافات', 3000, 'fries'],
          ['كوكاكولا', 'مشروبات', 1500, 'drink'],
        ],
      },
      {
        name: 'سندوتشات الريس',
        type: 'restaurant',
        zone: 1,
        commissionBps: 1000,
        prepMinutes: 15,
        products: [
          ['سندوتش شاورما فراخ', 'سندوتشات', 5500, 'sandwich'],
          ['برجر لحمة', 'سندوتشات', 7500, 'hamburger'],
          ['بطاطس كبيرة', 'إضافات', 3500, 'fries'],
        ],
      },
      {
        name: 'حلواني الشرق',
        type: 'other',
        zone: 2,
        commissionBps: 1000,
        prepMinutes: 10,
        products: [
          ['بسبوسة ربع كيلو', 'حلويات شرقي', 4000, 'cookie'],
          ['آيس كريم فانيليا', 'آيس كريم', 3000, 'icecream'],
          ['تورتة شوكولاتة صغيرة', 'تورت', 18000, 'gift'],
        ],
      },
    ],
    drivers: ['محمود الطيار', 'كريم سعيد', 'إسلام حسن'],
    customers: ['أحمد مصطفى', 'منى عبد الله'],
  },
  {
    slug: 'fayoum',
    name: 'توصيل الفيوم',
    governorate: 'الفيوم',
    phonePrefix: '011000000',
    zones: [
      ['وسط البلد', 1500, 29.309, 30.842, 1.5],
      ['الحادقة', 2000, 29.316, 30.853, 1.5],
      ['كيمان فارس', 2000, 29.321, 30.834, 1.5],
      ['المسلة', 1500, 29.3, 30.849, 1.5],
      ['الجامعة', 2500, 29.324, 30.89, 2.5],
    ],
    stores: [
      {
        name: 'كشري التحرير',
        type: 'restaurant',
        zone: 0,
        commissionBps: 1000,
        products: [
          ['كشري وسط', 'كشري', 3000, 'pot'],
          ['كشري كبير', 'كشري', 4000, 'pot'],
          ['أرز باللبن', 'حلويات', 2000, 'icecream'],
          ['صوص زيادة', 'إضافات', 500, 'tomato'],
        ],
      },
      {
        name: 'صيدلية النور',
        type: 'pharmacy',
        zone: 3,
        commissionBps: 500,
        products: [
          ['بروفين ٤٠٠', 'مسكنات', 3900, 'pill'],
          ['قطن طبي', 'مستلزمات', 1500, 'bandage'],
          ['شاش ولاصق', 'مستلزمات', 1800, 'bandage'],
        ],
      },
      {
        name: 'ماركت البركة',
        type: 'grocery',
        zone: 1,
        commissionBps: 700,
        products: [
          ['بيض ١٠ حبات', 'بقالة', 5500, 'egg'],
          ['مكرونة ٤٠٠ جم', 'بقالة', 1400, 'pasta'],
          ['شاي ٢٥٠ جم', 'بقالة', 6500, 'tea'],
          ['مية معدنية ١٫٥ لتر', 'مشروبات', 900, 'water'],
        ],
      },
      {
        name: 'فطاطري الفيوم',
        type: 'restaurant',
        zone: 3,
        commissionBps: 1000,
        prepMinutes: 20,
        products: [
          ['فطير مشلتت', 'فطير', 6000, 'bread'],
          ['فطيرة جبنة', 'فطير', 5000, 'cheese'],
          ['شاي بلبن', 'مشروبات', 1500, 'tea'],
        ],
      },
    ],
    drivers: ['عمرو الفيومي', 'حسن رجب', 'مصطفى علي'],
    customers: ['سارة محمد', 'ياسر عادل'],
  },
];

type Db = NodePgDatabase<typeof schema>;

async function seedTenant(
  db: Db,
  t: TenantSeed,
  passwordHash: string,
  history: boolean,
): Promise<void> {
  const existing = await db
    .select({ id: tenants.id })
    .from(tenants)
    .where(sql`${tenants.slug} = ${t.slug}`);
  if (existing.length) {
    console.log(`⏭️  ${t.name} موجودة قبل كده`);
    return;
  }
  const [tenant] = await db
    .insert(tenants)
    .values({ slug: t.slug, name: t.name, governorate: t.governorate })
    .returning();
  const tenantId = tenant!.id;
  const phone = (n: number) => `${t.phonePrefix}${String(n).padStart(2, '0')}`;

  await db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);

    const zoneRows = await tx
      .insert(zones)
      .values(
        t.zones.map(([name, deliveryFee, centerLat, centerLng, radiusKm]) => ({
          tenantId,
          name,
          deliveryFee,
          centerLat,
          centerLng,
          radiusKm,
        })),
      )
      .returning();

    // عروض تجريبية
    await tx.insert(coupons).values([
      {
        tenantId,
        code: 'WELCOME',
        title: 'خصم ٢٠٪ على أول طلب',
        kind: 'percent',
        value: 2000,
        maxDiscount: 3000,
        firstOrderOnly: true,
      },
      {
        tenantId,
        code: 'FREEDEL',
        title: 'توصيل مجاني للطلبات من ١٠٠ جنيه',
        kind: 'free_delivery',
        value: 0,
        minSubtotal: 10000,
        perCustomerLimit: 5,
      },
    ]);

    await tx.insert(users).values([
      {
        tenantId,
        phone: phone(1),
        name: 'مدير الشركة',
        role: 'admin',
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
      {
        tenantId,
        phone: phone(2),
        name: 'مدير التشغيل',
        role: 'ops',
        passwordHash,
        phoneVerifiedAt: new Date(),
      },
    ]);

    for (const [i, s] of t.stores.entries()) {
      const [store] = await tx
        .insert(stores)
        .values({
          tenantId,
          name: s.name,
          type: s.type,
          zoneId: zoneRows[s.zone]!.id,
          address: `${zoneRows[s.zone]!.name} — الشارع الرئيسي`,
          phone: phone(40 + i),
          commissionBps: s.commissionBps,
          prepMinutes: s.prepMinutes ?? 20,
          // المحل قريب من مركز منطقته
          lat: t.zones[s.zone]![2] + ((i % 3) - 1) * 0.003,
          lng: t.zones[s.zone]![3] + ((i % 2) - 0.5) * 0.004,
        })
        .returning();
      await tx.insert(products).values(
        s.products.map(([name, category, price, art]) => ({
          tenantId,
          storeId: store!.id,
          name,
          category,
          price,
          imageUrl: `/art/${art}.webp`,
        })),
      );
      await tx.insert(users).values({
        tenantId,
        phone: phone(11 + i),
        name: `مسؤول ${s.name}`,
        role: 'store',
        storeId: store!.id,
        passwordHash,
        phoneVerifiedAt: new Date(),
      });
    }

    for (const [i, name] of t.drivers.entries()) {
      const [driver] = await tx
        .insert(users)
        .values({
          tenantId,
          phone: phone(21 + i),
          name,
          role: 'driver',
          passwordHash,
          phoneVerifiedAt: new Date(),
        })
        .returning();
      await tx.insert(driverProfiles).values({
        userId: driver!.id,
        tenantId,
        status: i === 0 ? 'available' : 'offline',
        lastLat: t.zones[i]![2],
        lastLng: t.zones[i]![3],
        lastSeenAt: new Date(),
      });
    }

    for (const [i, name] of t.customers.entries()) {
      const [customer] = await tx
        .insert(users)
        .values({
          tenantId,
          phone: phone(31 + i),
          name,
          role: 'customer',
          passwordHash,
          phoneVerifiedAt: new Date(),
        })
        .returning();
      await tx.insert(addresses).values({
        tenantId,
        userId: customer!.id,
        label: 'البيت',
        zoneId: zoneRows[i]!.id,
        details: `عمارة ${i + 5}، الدور التالت، شقة ${i + 7}`,
        lat: t.zones[i]![2] + 0.002,
        lng: t.zones[i]![3] - 0.002,
      });
    }
  });
  if (history) {
    const n = await db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return seedHistory(tx, tenantId);
    });
    console.log(`📦 ${t.name}: ${n} طلب قديم للتجربة`);
  }
  console.log(
    `✅ ${t.name}: ${t.zones.length} مناطق، ${t.stores.length} محلات، ${t.drivers.length} طيارين`,
  );
}

export async function seed(
  connectionString: string,
  opts: { history?: boolean } = {},
): Promise<void> {
  const pool = new Pool({ connectionString });
  const db = drizzle(pool, { schema });
  try {
    const passwordHash = await argon2.hash(DEMO_PASSWORD, ARGON2_OPTIONS);
    for (const t of TENANTS) await seedTenant(db, t, passwordHash, opts.history ?? false);
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  loadDotenv();
  if (process.env.NODE_ENV === 'production') {
    console.error('❌ البيانات التجريبية ممنوعة على السيرفر الحقيقي');
    process.exit(1);
  }
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) {
    console.error('محتاج MIGRATION_DATABASE_URL في ملف .env');
    process.exit(1);
  }
  seed(url, { history: !process.argv.includes('--no-history') })
    .then(() => {
      console.log(`\n🔑 كلمة السر لكل الحسابات التجريبية: ${DEMO_PASSWORD}`);
      console.log('📖 أرقام الحسابات موجودة في ملف README.md');
    })
    .catch((err: unknown) => {
      console.error('❌ فشل:', err);
      process.exit(1);
    });
}
