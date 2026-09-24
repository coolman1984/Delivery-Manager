import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

/** بيقرا ملف .env (لو موجود) من جذر المشروع. في السيرفر الحقيقي الإعدادات بتيجي من البيئة مباشرة */
export function loadDotenv(): void {
  for (const candidate of [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')]) {
    if (existsSync(candidate)) {
      process.loadEnvFile(candidate);
      return;
    }
  }
}
