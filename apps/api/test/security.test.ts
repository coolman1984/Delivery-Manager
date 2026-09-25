import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { BS, createApp, loginStaff, phones, resetData } from './helpers';

describe('🔒 القفل الفوري للجلسات', () => {
  let app: INestApplication;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('إيقاف حساب طيار بيقفل التوكن بتاعه فوراً، والدخول من جديد بعد التشغيل شغال', async () => {
    const admin = await loginStaff(app, BS, phones[BS].admin);
    const driver = await loginStaff(app, BS, phones[BS].driver1);
    const me = await driver.get('/auth/me');
    expect(me.status).toBe(200);
    expect((await admin.patch(`/admin/users/${me.body.id}`, { isActive: false })).status).toBe(200);
    expect((await driver.get('/auth/me')).status).toBe(401);
    await admin.patch(`/admin/users/${me.body.id}`, { isActive: true });
    const again = await loginStaff(app, BS, phones[BS].driver1);
    expect((await again.get('/auth/me')).status).toBe(200);
  });

  it('تغيير كلمة السر بيقفل الجلسة القديمة فوراً', async () => {
    const ops = await loginStaff(app, BS, phones[BS].ops);
    const res = await ops.post('/auth/change-password', {
      currentPassword: 'Demo@123456',
      newPassword: 'Another-strong-pass-1',
    });
    expect(res.status).toBe(204);
    expect((await ops.get('/auth/me')).status).toBe(401);
  });
});
