// بيعمل ملف .env للتجربة على جهازك، بمفاتيح عشوائية آمنة
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

if (existsSync('.env')) {
  console.log('ℹ️  ملف .env موجود قبل كده، مش هغيّره.');
  process.exit(0);
}
const hex = () => randomBytes(32).toString('hex');
const content = readFileSync('.env.example', 'utf8')
  .replace('dm_app:CHANGE_ME@', `dm_app:${randomBytes(18).toString('base64url')}@`)
  .replace('dm_platform:CHANGE_ME@', `dm_platform:${randomBytes(18).toString('base64url')}@`)
  .replace('JWT_ACCESS_SECRET=CHANGE_ME', `JWT_ACCESS_SECRET=${hex()}`)
  .replace('DATA_ENCRYPTION_KEY=CHANGE_ME', `DATA_ENCRYPTION_KEY=${hex()}`);
writeFileSync('.env', content, { mode: 0o600 });
console.log('✅ اتعمل ملف .env بمفاتيح عشوائية');
