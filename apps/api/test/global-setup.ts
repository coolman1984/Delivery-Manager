import { Client } from 'pg';
import { runMigrations } from '../src/db/migrate';

/** قبل كل الاختبارات: نمسح قاعدة بيانات الاختبار ونبنيها من الصفر */
export default async function setup(): Promise<void> {
  const ownerUrl =
    process.env.TEST_MIGRATION_DATABASE_URL ?? 'postgres://postgres@localhost:5432/delivery_test';
  const appUrl =
    process.env.TEST_DATABASE_URL ??
    'postgres://dm_app_test:test_app_password_1234@localhost:5432/delivery_test';
  const client = new Client({ connectionString: ownerUrl });
  await client.connect();
  await client.query(
    'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; CREATE SCHEMA public;',
  );
  await client.end();
  await runMigrations(ownerUrl, appUrl);
}
