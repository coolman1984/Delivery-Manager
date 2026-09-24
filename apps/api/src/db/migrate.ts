import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadDotenv } from '../config/load-dotenv';

/**
 * إنشاء/تحديث الجداول. بيشتغل بحساب "المالك"، وبعدين بيدي حساب السيرفر أقل صلاحيات ممكنة:
 * - مايقدرش يعدّي حيطان عزل الشركات
 * - مايقدرش يعدّل أو يمسح دفتر الحسابات ولا سجل العمليات
 * - مايقدرش يغيّر شكل الجداول
 */
const IMMUTABLE_TABLES = [
  'journals',
  'ledger_lines',
  'settlements',
  'audit_logs',
  'order_events',
  'loyalty_points',
];

export async function runMigrations(ownerUrl: string, appUrl: string): Promise<void> {
  const app = new URL(appUrl);
  const owner = new URL(ownerUrl);
  const appUser = decodeURIComponent(app.username);
  const appPassword = decodeURIComponent(app.password);
  if (!appUser || appUser === decodeURIComponent(owner.username)) {
    throw new Error(
      'لازم حساب السيرفر (DATABASE_URL) يكون مختلف عن حساب المالك (MIGRATION_DATABASE_URL)',
    );
  }
  if (appPassword.length < 16) {
    throw new Error('كلمة سر حساب السيرفر في DATABASE_URL لازم تكون ١٦ حرف على الأقل');
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const role = client.escapeIdentifier(appUser);
    const pw = client.escapeLiteral(appPassword);
    const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [appUser]);
    const attrs = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT';
    await client.query(
      exists.rowCount
        ? `ALTER ROLE ${role} ${attrs} PASSWORD ${pw}`
        : `CREATE ROLE ${role} ${attrs} PASSWORD ${pw}`,
    );

    await migrate(drizzle(client), { migrationsFolder: resolve(__dirname, '../../drizzle') });

    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await client.query(`REVOKE INSERT, UPDATE, DELETE ON tenants FROM ${role}`);
    for (const table of IMMUTABLE_TABLES) {
      await client.query(`REVOKE UPDATE, DELETE ON ${client.escapeIdentifier(table)} FROM ${role}`);
    }
    await client.query(`GRANT EXECUTE ON FUNCTION current_tenant_id() TO ${role}`);
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  loadDotenv();
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  if (!ownerUrl || !appUrl) {
    console.error('محتاج MIGRATION_DATABASE_URL و DATABASE_URL في ملف .env');
    process.exit(1);
  }
  runMigrations(ownerUrl, appUrl)
    .then(() => console.log('✅ قاعدة البيانات جاهزة'))
    .catch((err: unknown) => {
      console.error('❌ فشل تجهيز قاعدة البيانات:', err);
      process.exit(1);
    });
}
