import * as argon2 from 'argon2';
import { drizzle } from 'drizzle-orm/node-postgres';
import { randomBytes } from 'node:crypto';
import { parseArgs } from 'node:util';
import { Pool } from 'pg';
import { loadDotenv } from '../config/load-dotenv';
import { ARGON2_OPTIONS } from '../modules/auth/auth.service';
import * as schema from './schema';
import { platformAdmins, platformAuditLogs } from './schema';

/**
 * إنشاء حساب مالك المنصة على السيرفر الحقيقي (مرة واحدة).
 * كلمة السر بتتولّد عشوائي وبتظهر مرة واحدة بس. أول دخول هيطلب تسجيل تطبيق الكود على الموبايل.
 *
 * مثال:
 *   docker compose run --rm migrate node dist/db/create-platform-admin.js --email you@example.com --name "اسمك"
 */
async function main(): Promise<void> {
  loadDotenv();
  const { values } = parseArgs({
    options: { email: { type: 'string' }, name: { type: 'string' } },
  });
  const email = values.email?.trim().toLowerCase();
  const name = values.name?.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !name) {
    throw new Error('لازم تكتب --email صحيح و --name');
  }
  const url = process.env.MIGRATION_DATABASE_URL;
  if (!url) throw new Error('محتاج MIGRATION_DATABASE_URL');

  const password = randomBytes(15).toString('base64url');
  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  const pool = new Pool({ connectionString: url });
  const db = drizzle(pool, { schema });
  try {
    await db.transaction(async (tx) => {
      const [admin] = await tx
        .insert(platformAdmins)
        .values({ email, name, passwordHash })
        .returning();
      await tx
        .insert(platformAuditLogs)
        .values({ adminId: admin!.id, action: 'platform.admin_created', meta: { via: 'cli' } });
    });
  } finally {
    await pool.end();
  }
  console.log(`✅ اتعمل حساب مالك المنصة: ${email}`);
  console.log(`🔑 كلمة السر (هتظهر مرة واحدة بس، احفظها في مكان آمن): ${password}`);
  console.log('📱 أول دخول هيطلب منك تسجّل تطبيق الكود (Google Authenticator) على موبايلك');
}

main().catch((err: unknown) => {
  console.error('❌', err instanceof Error ? err.message : err);
  process.exit(1);
});
