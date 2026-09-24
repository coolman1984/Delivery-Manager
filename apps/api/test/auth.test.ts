import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { DEMO_PASSWORD } from '../src/db/seed';
import { Api, BS, createApp, loginStaff, ownerQuery, phones, resetData } from './helpers';

describe('🔐 تسجيل الدخول', () => {
  let app: INestApplication;
  let anon: Api;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    anon = new Api(app, BS);
  });

  afterAll(async () => {
    await app.close();
  });

  it('عميل جديد: الكود الصح + الاسم = حساب جديد', async () => {
    const phone = '01234567890';
    const req = await anon.post('/auth/otp/request', { phone });
    expect(req.status).toBe(200);
    expect(req.body.devCode).toMatch(/^\d{6}$/);

    const noName = await anon.post('/auth/otp/verify', { phone, code: req.body.devCode });
    expect(noName.status).toBe(400);
    expect(noName.body.code).toBe('NAME_REQUIRED');

    const ok = await anon.post('/auth/otp/verify', {
      phone,
      code: req.body.devCode,
      name: 'عميل جديد',
    });
    expect(ok.status).toBe(200);
    expect(ok.body.user.role).toBe('customer');
    expect(ok.headers['set-cookie']?.[0]).toMatch(/dm_rt=.*HttpOnly.*SameSite=Strict/i);
  });

  it('الكود بيتقفل بعد ٥ محاولات غلط', async () => {
    const phone = '01234567891';
    const req = await anon.post('/auth/otp/request', { phone });
    const wrong = req.body.devCode === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) {
      expect(
        (await anon.post('/auth/otp/verify', { phone, code: wrong, name: 'تجربة' })).status,
      ).toBe(400);
    }
    const right = await anon.post('/auth/otp/verify', {
      phone,
      code: req.body.devCode,
      name: 'تجربة',
    });
    expect(right.status).toBe(400);
  });

  it('طلب أكواد كتير لنفس الرقم بيتمنع مؤقتاً', async () => {
    const phone = '01234567892';
    for (let i = 0; i < 3; i++)
      expect((await anon.post('/auth/otp/request', { phone })).status).toBe(200);
    expect((await anon.post('/auth/otp/request', { phone })).status).toBe(429);
  });

  it('رقم موظف مايدخلش بالكود', async () => {
    expect((await anon.post('/auth/otp/request', { phone: phones[BS].ops })).status).toBe(400);
  });

  it('كلمة سر غلط ٥ مرات = الحساب يتقفل مؤقتاً حتى لو كلمة السر الصح اتكتبت بعدها', async () => {
    const phone = phones[BS].driver2;
    for (let i = 0; i < 5; i++) {
      const res = await anon.post('/auth/login', { phone, password: 'wrong-password' });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('رقم الموبايل أو كلمة السر غلط');
    }
    const locked = await anon.post('/auth/login', { phone, password: DEMO_PASSWORD });
    expect(locked.status).toBe(401);
    expect(locked.body.message).toMatch(/مقفول/);

    const logs = await ownerQuery<{ action: string }>(
      `select action from audit_logs where action like 'auth.%'`,
    );
    expect(logs.map((l) => l.action)).toContain('auth.account_locked');
  });

  it('رقم مش موجود بيرجع نفس رسالة كلمة السر الغلط (مانكشفش مين متسجل)', async () => {
    const res = await anon.post('/auth/login', {
      phone: '01555555555',
      password: 'whatever-password',
    });
    expect(res.status).toBe(401);
    expect(res.body.message).toBe('رقم الموبايل أو كلمة السر غلط');
  });

  it('كلمات السر متخزنة متشفرة بـ argon2id', async () => {
    const rows = await ownerQuery<{ password_hash: string }>(
      `select password_hash from users where password_hash is not null limit 1`,
    );
    expect(rows[0]!.password_hash).toMatch(/^\$argon2id\$/);
  });

  it('الموظف يغيّر كلمة السر بنفسه، والقديمة تبطل', async () => {
    const phone = phones[BS].grill;
    const store = await loginStaff(app, BS, phone);
    expect(
      (
        await store.post('/auth/change-password', {
          currentPassword: 'wrong',
          newPassword: 'New-pass-12345',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await store.post('/auth/change-password', {
          currentPassword: DEMO_PASSWORD,
          newPassword: 'short',
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await store.post('/auth/change-password', {
          currentPassword: DEMO_PASSWORD,
          newPassword: 'New-pass-12345',
        })
      ).status,
    ).toBe(204);
    expect((await anon.post('/auth/login', { phone, password: DEMO_PASSWORD })).status).toBe(401);
    expect((await anon.post('/auth/login', { phone, password: 'New-pass-12345' })).status).toBe(
      200,
    );
  });

  it('المدير يعيّن كلمة سر جديدة لموظف نسيها', async () => {
    const admin = await loginStaff(app, BS, phones[BS].admin);
    const users = await admin.get('/admin/users?role=driver');
    const target = users.body.find((u: { phone: string }) => u.phone === phones[BS].driver1);
    expect(
      (await admin.patch(`/admin/users/${target.id}`, { password: 'Reset-pass-123' })).status,
    ).toBe(200);
    expect(
      (await anon.post('/auth/login', { phone: phones[BS].driver1, password: 'Reset-pass-123' }))
        .status,
    ).toBe(200);
  });

  describe('تجديد الجلسة', () => {
    async function loginCookie(): Promise<string> {
      const res = await anon.post('/auth/login', {
        phone: phones[BS].admin,
        password: DEMO_PASSWORD,
      });
      expect(res.status).toBe(200);
      return res.headers['set-cookie']![0]!.split(';')[0]!;
    }
    const refresh = (cookie: string, csrf = true) => {
      const req = request(app.getHttpServer()).post('/api/v1/auth/refresh').set('cookie', cookie);
      return csrf ? req.set('x-requested-with', 'dm') : req;
    };

    it('من غير هيدر الحماية بيترفض (حماية من تزوير الطلبات)', async () => {
      expect((await refresh(await loginCookie(), false)).status).toBe(403);
    });

    it('كل تجديد بيدّي توكن جديد، والقديم مايشتغلش تاني', async () => {
      const cookie = await loginCookie();
      const first = await refresh(cookie);
      expect(first.status).toBe(200);
      const newCookie = first.headers['set-cookie']![0]!.split(';')[0]!;

      // حد سرق التوكن القديم وحاول يستخدمه ← نقفل الجلسة كلها
      expect((await refresh(cookie)).status).toBe(401);
      expect((await refresh(newCookie)).status).toBe(401);
    });

    it('الخروج بيلغي الجلسة', async () => {
      const cookie = await loginCookie();
      await request(app.getHttpServer())
        .post('/api/v1/auth/logout')
        .set('cookie', cookie)
        .set('x-requested-with', 'dm');
      expect((await refresh(cookie)).status).toBe(401);
    });

    it('إيقاف الحساب بيخرجه من كل الأجهزة', async () => {
      const admin = await loginStaff(app, BS, phones[BS].admin);
      const res = await anon.post('/auth/login', {
        phone: phones[BS].pharmacy,
        password: DEMO_PASSWORD,
      });
      const cookie = res.headers['set-cookie']![0]!.split(';')[0]!;
      await admin.patch(`/admin/users/${res.body.user.id}`, { isActive: false });
      expect((await refresh(cookie)).status).toBe(401);
      expect(
        (await anon.post('/auth/login', { phone: phones[BS].pharmacy, password: DEMO_PASSWORD }))
          .status,
      ).toBe(401);
    });
  });
});
