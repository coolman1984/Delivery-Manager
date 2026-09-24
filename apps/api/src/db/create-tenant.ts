import * as argon2 from 'argon2';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Pool } from 'pg';
import { phoneSchema, tenantSlugSchema } from '@dm/shared/schemas';
import { loadDotenv } from '../config/load-dotenv';
import { ARGON2_OPTIONS } from '../modules/auth/auth.service';
import * as schema from './schema';
import { tenants, users } from './schema';

/**
 * إضافة شركة جديدة ومديرها على السيرفر الحقيقي (لحد ما لوحة مالك المنصة تتعمل في المرحلة ٤).
 * كلمة سر المدير بتتولّد عشوائي وبتظهر مرة واحدة بس، والمدير يغيّرها بعد كده.
 *
 * مثال:
 *   node dist/db/create-tenant.js --slug beni-suef --name "توصيل بني سويف" \
 *     --governorate "بني سويف" --admin-phone 01012345678 --admin-name "أحمد"
 */
async function main(): Promise<void> {
  loadDotenv();
  const { values } = parseArgs({
    options: {
      slug: { type: 'string' },
      name: { type: 'string' },
      governorate: { type: 'string' },
      'admin-phone': { type: 'string' },
      'admin-name': { type: 'string' },
    },
  });
  const slug = tenantSlugSchema.parse(values.slug);
  const phone = phoneSchema.parse(values['admin-phone']);
  const name = values.name?.trim();
  const governorate = values.governorate?.trim();
  const adminName = values['admin-name']?.trim();
  if (!name || !governorate || !adminName) {
    throw new Error('لازم تكتب --name و --governorate و --admin-name');
  }
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('محتاج MIGRATION_DATABASE_URL');

  const password = randomBytes(12).toString('base64url');
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  try {
    await db.transaction(async (tx) => {
      const [tenant] = await tx.insert(tenants).values({ slug, name, governorate }).returning();
      await tx.execute(sql`select set_config('app.tenant_id', ${tenant!.id}, true)`);
      await tx.insert(users).values({
        tenantId: tenant!.id,
        phone,
        name: adminName,
        role: 'admin',
        passwordHash,
        phoneVerifiedAt: new Date(),
      });
    });
  } finally {
    await pool.end();
  }
  console.log(`✅ اتعملت شركة "${name}" (${slug})`);
  console.log(`👤 دخول المدير: ${phone}`);
  console.log(`🔑 كلمة السر (هتظهر مرة واحدة بس، احفظها في مكان آمن): ${password}`);
}

main().catch((err: unknown) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
