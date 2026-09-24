import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { loadDotenv } from '../config/load-dotenv';

/**
 * إنشاء/تحديث الجداول. بيشتغل بحساب "المالك"، وبعدين بيدي كل حساب أقل صلاحيات ممكنة.
 *
 * حساب السيرفر العادي (DATABASE_URL):
 * - مايقدرش يعدّي حيطان عزل الشركات
 * - مايقدرش يعدّل أو يمسح دفتر الحسابات ولا سجل العمليات
 * - مايقدرش يغيّر شكل الجداول، ولا يلمس جداول المنصة (الاشتراكات وحسابات المالك)
 *
 * حساب لوحة مالك المنصة (PLATFORM_DATABASE_URL):
 * - بيدير الشركات والباقات والمدفوعات
 * - مايشوفش بيانات الشركات من جوه (طلبات، عملاء...) غير أرقام مجمّعة
 * - الحاجة الوحيدة اللي بيكتبها جوه شركة: حساب مديرها وقت إنشائها أو تغيير كلمة سره
 */
const IMMUTABLE_TABLES = [
  'journals',
  'ledger_lines',
  'settlements',
  'audit_logs',
  'order_events',
  'loyalty_points',
  'subscription_payments',
  'platform_audit_logs',
];

/** جداول المنصة: حساب السيرفر العادي مالوش أي صلاحية عليها */
export const PLATFORM_ONLY_TABLES = [
  'platform_admins',
  'platform_audit_logs',
  'subscription_payments',
];

interface RoleSpec {
  user: string;
  password: string;
}

function roleFromUrl(url: string, label: string, owner: string): RoleSpec {
  const parsed = new URL(url);
  const user = decodeURIComponent(parsed.username);
  const password = decodeURIComponent(parsed.password);
  if (!user || user === owner) {
    throw new Error(`لازم ${label} يكون حساب مختلف عن حساب المالك (MIGRATION_DATABASE_URL)`);
  }
  if (password.length < 16) {
    throw new Error(`كلمة سر ${label} لازم تكون ١٦ حرف على الأقل`);
  }
  return { user, password };
}

async function ensureRole(client: Client, spec: RoleSpec): Promise<string> {
  const role = client.escapeIdentifier(spec.user);
  const pw = client.escapeLiteral(spec.password);
  const exists = await client.query('SELECT 1 FROM pg_roles WHERE rolname = $1', [spec.user]);
  const attrs = 'LOGIN NOSUPERUSER NOBYPASSRLS NOCREATEDB NOCREATEROLE NOINHERIT';
  await client.query(
    exists.rowCount
      ? `ALTER ROLE ${role} ${attrs} PASSWORD ${pw}`
      : `CREATE ROLE ${role} ${attrs} PASSWORD ${pw}`,
  );
  return role;
}

export async function runMigrations(
  ownerUrl: string,
  appUrl: string,
  platformUrl?: string,
): Promise<void> {
  const owner = decodeURIComponent(new URL(ownerUrl).username);
  const appSpec = roleFromUrl(appUrl, 'حساب السيرفر (DATABASE_URL)', owner);
  const platformSpec = platformUrl
    ? roleFromUrl(platformUrl, 'حساب لوحة المنصة (PLATFORM_DATABASE_URL)', owner)
    : null;
  if (platformSpec && platformSpec.user === appSpec.user) {
    throw new Error('حساب لوحة المنصة لازم يكون مختلف عن حساب السيرفر العادي');
  }

  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  try {
    const role = await ensureRole(client, appSpec);
    await migrate(drizzle(client), { migrationsFolder: resolve(__dirname, '../../drizzle') });

    await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);
    await client.query(`GRANT USAGE ON SCHEMA public TO ${role}`);
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${role}`,
    );
    await client.query(`REVOKE ALL ON tenants FROM ${role}`);
    // بيانات تواصل الشركة وملاحظات المالك مش من حق السيرفر العادي
    await client.query(
      `GRANT SELECT (id, slug, name, governorate, status, plan_id, paid_until, created_at) ON tenants TO ${role}`,
    );
    await client.query(`REVOKE INSERT, UPDATE, DELETE ON plans FROM ${role}`);
    for (const table of PLATFORM_ONLY_TABLES) {
      await client.query(`REVOKE ALL ON ${client.escapeIdentifier(table)} FROM ${role}`);
    }
    for (const table of IMMUTABLE_TABLES) {
      await client.query(`REVOKE UPDATE, DELETE ON ${client.escapeIdentifier(table)} FROM ${role}`);
    }
    await client.query(`GRANT EXECUTE ON FUNCTION current_tenant_id() TO ${role}`);

    if (platformSpec) {
      const p = await ensureRole(client, platformSpec);
      await client.query(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${p}`);
      await client.query(`GRANT USAGE ON SCHEMA public TO ${p}`);
      await client.query(`GRANT SELECT, INSERT, UPDATE ON tenants, plans, platform_admins TO ${p}`);
      await client.query(
        `GRANT SELECT, INSERT ON subscription_payments, platform_audit_logs TO ${p}`,
      );
      // مدير الشركة: إنشاؤه، أو تغيير كلمة سره لو نسيها (وخروجه من كل الأجهزة)
      await client.query(
        `GRANT SELECT (id, tenant_id, name, phone, role, created_at) ON users TO ${p}`,
      );
      await client.query(`GRANT INSERT ON users TO ${p}`);
      await client.query(
        `GRANT UPDATE (password_hash, failed_login_count, locked_until, updated_at) ON users TO ${p}`,
      );
      await client.query(
        `GRANT SELECT (tenant_id, user_id, revoked_at), UPDATE (revoked_at) ON refresh_tokens TO ${p}`,
      );
      await client.query(`GRANT EXECUTE ON FUNCTION current_tenant_id() TO ${p}`);
      await client.query(`GRANT EXECUTE ON FUNCTION platform_tenant_stats() TO ${p}`);
    }
  } finally {
    await client.end();
  }
}

if (require.main === module) {
  loadDotenv();
  const ownerUrl = process.env.MIGRATION_DATABASE_URL;
  const appUrl = process.env.DATABASE_URL;
  const platformUrl = process.env.PLATFORM_DATABASE_URL || undefined;
  if (!ownerUrl || !appUrl) {
    console.error('محتاج MIGRATION_DATABASE_URL و DATABASE_URL في ملف .env');
    process.exit(1);
  }
  runMigrations(ownerUrl, appUrl, platformUrl)
    .then(() => console.log('✅ قاعدة البيانات جاهزة'))
    .catch((err: unknown) => {
      console.error('❌ فشل تجهيز قاعدة البيانات:', err);
      process.exit(1);
    });
}
