import type { INestApplication } from '@nestjs/common';
import Redis from 'ioredis';
import { Client } from 'pg';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { totpAt, totpStep } from '../src/common/totp';
import { DEMO_PASSWORD, DEMO_PLATFORM_EMAIL } from '../src/db/seed';
import { PlatformService } from '../src/modules/platform/platform.service';
import { Api, BS, createApp, FY, loginStaff, ownerQuery, phones, resetData } from './helpers';

/** طلب للوحة المنصة (كوكي الجلسة + هيدر الحماية) */
class PlatformApi {
  constructor(
    private readonly app: INestApplication,
    public cookie = '',
  ) {}
  private h(req: request.Test): request.Test {
    req.set('x-requested-with', 'dm');
    if (this.cookie) req.set('cookie', this.cookie);
    return req;
  }
  get(path: string) {
    return this.h(request(this.app.getHttpServer()).get(`/api/v1/platform${path}`));
  }
  post(path: string, body?: object) {
    return this.h(request(this.app.getHttpServer()).post(`/api/v1/platform${path}`)).send(
      body ?? {},
    );
  }
  patch(path: string, body?: object) {
    return this.h(request(this.app.getHttpServer()).patch(`/api/v1/platform${path}`)).send(
      body ?? {},
    );
  }
}

function sessionCookie(res: request.Response): string {
  const raw = res.headers['set-cookie'] as unknown as string[] | undefined;
  const c = raw?.find((x) => x.startsWith('dm_pa='));
  if (!c) throw new Error('no session cookie');
  expect(c).toMatch(/HttpOnly/i);
  expect(c).toMatch(/SameSite=Strict/i);
  expect(c).toMatch(/Path=\/api\/v1\/platform/i);
  return c.split(';')[0]!;
}

describe('👑 لوحة مالك المنصة والاشتراكات', () => {
  let app: INestApplication;
  let owner: PlatformApi;
  let secret: string;
  let lastStep: number;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('الدخول', () => {
    it('كلمة سر غلط = رفض برسالة عامة', async () => {
      const res = await new PlatformApi(app).post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: 'wrong-password-123',
      });
      expect(res.status).toBe(401);
      expect(res.body.message).toBe('الإيميل أو كلمة السر أو الكود غلط');
    });

    it('أول دخول: لازم يسجّل تطبيق الكود، وكود غلط مايفعّلوش', async () => {
      const api = new PlatformApi(app);
      const res = await api.post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: DEMO_PASSWORD,
      });
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('enroll');
      expect(res.body.uri).toMatch(/^otpauth:\/\/totp\//);
      expect(res.headers['set-cookie']).toBeUndefined();
      secret = res.body.secret;

      const bad = await api.post('/auth/enroll', {
        enrollToken: res.body.enrollToken,
        code: '000000',
      });
      expect(bad.status).toBe(401);

      lastStep = totpStep();
      const ok = await api.post('/auth/enroll', {
        enrollToken: res.body.enrollToken,
        code: totpAt(secret, lastStep),
      });
      expect(ok.status).toBe(200);
      owner = new PlatformApi(app, sessionCookie(ok));
      expect((await owner.get('/auth/me')).body.email).toBe(DEMO_PLATFORM_EMAIL);
    });

    it('بعد التسجيل: الكود إجباري، ونفس الكود مايتستخدمش مرتين', async () => {
      const api = new PlatformApi(app);
      const noCode = await api.post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: DEMO_PASSWORD,
      });
      expect(noCode.body.status).toBe('code_required');
      const replay = await api.post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: DEMO_PASSWORD,
        code: totpAt(secret, lastStep),
      });
      expect(replay.status).toBe(401);
      const fresh = await api.post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: DEMO_PASSWORD,
        code: totpAt(secret, lastStep + 1),
      });
      expect(fresh.status).toBe(200);
      expect(fresh.body.status).toBe('ok');
    });

    it('من غير جلسة، أو بتوكن مدير شركة، أو من غير هيدر الحماية، أو من عنوان تاني = ممنوع', async () => {
      expect((await new PlatformApi(app).get('/overview')).status).toBe(401);
      const bsAdmin = await loginStaff(app, BS, phones[BS].admin);
      const token = (bsAdmin as unknown as { token: string }).token;
      const withBearer = await request(app.getHttpServer())
        .get('/api/v1/platform/overview')
        .set('x-requested-with', 'dm')
        .set('authorization', `Bearer ${token}`);
      expect(withBearer.status).toBe(403);
      const noCsrf = await request(app.getHttpServer())
        .get('/api/v1/platform/overview')
        .set('cookie', owner.cookie);
      expect(noCsrf.status).toBe(403);
      const wrongHost = await owner.get('/overview').set('host', 'beni-suef.example.test');
      expect(wrongHost.status).toBe(404);
      expect((await owner.get('/overview')).status).toBe(200);
    });

    it('الخروج بيلغي الجلسة على كل الأجهزة', async () => {
      const api = new PlatformApi(app);
      const res = await api.post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: DEMO_PASSWORD,
        code: totpAt(secret, lastStep - 1),
      });
      const second = new PlatformApi(app, sessionCookie(res));
      expect((await second.post('/auth/logout')).status).toBe(204);
      expect((await second.get('/overview')).status).toBe(401);
      expect((await owner.get('/overview')).status).toBe(401);
      // دخول تاني للاختبارات اللي جاية (بنمسح الأكواد المستخدمة لأننا في نفس الـ٣٠ ثانية)
      const redis = new Redis(process.env.REDIS_URL!);
      for (const key of await redis.keys('totp:used:*')) await redis.del(key);
      await redis.quit();
      const again = await new PlatformApi(app).post('/auth/login', {
        email: DEMO_PLATFORM_EMAIL,
        password: DEMO_PASSWORD,
        code: totpAt(secret, totpStep()),
      });
      expect(again.status).toBe(200);
      owner = new PlatformApi(app, sessionCookie(again));
    });
  });

  describe('إدارة الشركات', () => {
    let tenantId: string;
    let smallPlanId: string;
    let newAdmin: Api;

    it('نظرة عامة: عدد الشركات والدخل الشهري وأرقام مجمّعة بس', async () => {
      const res = await owner.get('/overview');
      expect(res.body.tenants).toBe(2);
      expect(res.body.active).toBe(2);
      expect(res.body.monthlyRecurring).toBe(600_000);
      expect(res.body.expiringSoon.length).toBe(1);
      const list = await owner.get('/tenants');
      expect(list.body[0].stats.stores).toBeGreaterThan(0);
      expect(JSON.stringify(list.body)).not.toMatch(/password|passwordHash/i);
    });

    it('شركة جديدة بضغطة زرار: مديرها يدخل على طول، وبياناتها فاضية ومعزولة', async () => {
      const plan = await owner.post('/plans', {
        name: 'تجربة صغيرة',
        monthlyPrice: 50_000,
        maxStores: 1,
        maxDrivers: 1,
      });
      expect(plan.status).toBe(201);
      smallPlanId = plan.body.id;
      const res = await owner.post('/tenants', {
        slug: 'minya',
        name: 'توصيل المنيا',
        governorate: 'المنيا',
        planId: smallPlanId,
        trialDays: 14,
        adminName: 'مدير المنيا',
        adminPhone: '01200000001',
      });
      expect(res.status).toBe(201);
      tenantId = res.body.tenant.id;
      expect(res.body.admin.password.length).toBeGreaterThanOrEqual(12);

      const login = await new Api(app, 'minya').post('/auth/login', {
        phone: '01200000001',
        password: res.body.admin.password,
      });
      expect(login.status).toBe(200);
      newAdmin = new Api(app, 'minya', login.body.accessToken);
      expect((await newAdmin.get('/admin/stores')).body).toEqual([]);
      expect((await newAdmin.get('/admin/users')).body.length).toBe(1);

      const dup = await owner.post('/tenants', {
        slug: 'minya',
        name: 'تاني',
        governorate: 'المنيا',
        planId: smallPlanId,
        trialDays: 1,
        adminName: 'حد',
        adminPhone: '01200000002',
      });
      expect(dup.status).toBe(409);
      const reserved = await owner.post('/tenants', {
        slug: 'admin',
        name: 'تاني',
        governorate: 'المنيا',
        planId: smallPlanId,
        trialDays: 1,
        adminName: 'حد',
        adminPhone: '01200000002',
      });
      expect(reserved.status).toBe(400);
    });

    it('حدود الباقة: محل واحد وطيار واحد بس', async () => {
      const zone = await newAdmin.post('/admin/zones', { name: 'وسط البلد', deliveryFee: 1500 });
      expect(zone.status).toBe(201);
      const store = {
        name: 'محل ١',
        type: 'restaurant',
        zoneId: zone.body.id,
        address: 'شارع ١',
        phone: '01200000011',
        commissionBps: 1000,
      };
      expect((await newAdmin.post('/admin/stores', store)).status).toBe(201);
      const second = await newAdmin.post('/admin/stores', { ...store, name: 'محل ٢' });
      expect(second.status).toBe(400);
      expect(second.body.message).toContain('للحد الأقصى');
      const driver = {
        name: 'طيار',
        phone: '01200000021',
        role: 'driver',
        password: 'strong-pass-123',
      };
      expect((await newAdmin.post('/admin/users', driver)).status).toBe(201);
      expect(
        (await newAdmin.post('/admin/users', { ...driver, phone: '01200000022' })).status,
      ).toBe(400);
      const sub = await newAdmin.get('/admin/subscription');
      expect(sub.body.planName).toBe('تجربة صغيرة');
      expect(sub.body.usage).toEqual({ stores: 1, drivers: 1 });
    });

    it('إيقاف الشركة: عملاؤها وموظفينها يتقفل عليهم فوراً، والتشغيل يرجّعهم', async () => {
      const bad = await owner.post(`/tenants/${tenantId}/suspend`, {});
      expect(bad.status).toBe(400);
      expect(
        (await owner.post(`/tenants/${tenantId}/suspend`, { reason: 'طلب الشركة' })).status,
      ).toBe(200);
      const blocked = await newAdmin.get('/admin/stores');
      expect(blocked.status).toBe(403);
      expect(blocked.body.message).toContain('متوقفة');
      expect((await new Api(app, 'minya').get('/catalog/stores')).status).toBe(403);
      expect((await owner.post(`/tenants/${tenantId}/activate`)).status).toBe(200);
      expect((await newAdmin.get('/admin/stores')).status).toBe(200);
    });

    it('المتأخر في الدفع بيتوقف لوحده، ولما يدفع يرجع ويتمد اشتراكه', async () => {
      await ownerQuery(`update tenants set paid_until = now() - interval '10 days' where id = $1`, [
        tenantId,
      ]);
      const suspended = await app.get(PlatformService).suspendOverdue();
      expect(suspended).toEqual(['minya']);
      expect((await newAdmin.get('/admin/stores')).status).toBe(403);

      const pay = await owner.post(`/tenants/${tenantId}/payments`, { months: 2, note: 'كاش' });
      expect(pay.status).toBe(201);
      expect(pay.body.reactivated).toBe(true);
      expect(pay.body.payment.amount).toBe(100_000);
      const days = (new Date(pay.body.paidUntil).getTime() - Date.now()) / 86_400_000;
      expect(days).toBeGreaterThan(55);
      expect(days).toBeLessThan(63);
      expect((await newAdmin.get('/admin/stores')).status).toBe(200);

      // الإيقاف اليدوي مابيترفعش بالدفع لوحده
      await owner.post(`/tenants/${tenantId}/suspend`, { reason: 'مخالفة' });
      const pay2 = await owner.post(`/tenants/${tenantId}/payments`, { months: 1 });
      expect(pay2.body.reactivated).toBe(false);
      await owner.post(`/tenants/${tenantId}/activate`);
    });

    it('تغيير كلمة سر مدير الشركة: القديمة تبطل والجلسات تتقفل', async () => {
      const detail = await owner.get(`/tenants/${tenantId}`);
      expect(detail.body.payments.length).toBe(2);
      const adminId = detail.body.admins[0].id;
      const res = await owner.post(`/tenants/${tenantId}/admins/${adminId}/reset-password`);
      expect(res.status).toBe(200);
      const login = await new Api(app, 'minya').post('/auth/login', {
        phone: '01200000001',
        password: res.body.password,
      });
      expect(login.status).toBe(200);
      // مديرة شركة تانية مايتغيرش من هنا
      const fyAdmin = await ownerQuery<{ id: string }>(
        `select u.id from users u join tenants t on t.id = u.tenant_id where t.slug = $1 and u.role = 'admin'`,
        [FY],
      );
      expect(
        (await owner.post(`/tenants/${tenantId}/admins/${fyAdmin[0]!.id}/reset-password`)).status,
      ).toBe(404);
    });

    it('كل عملية متسجلة في سجل المنصة', async () => {
      const res = await owner.get('/audit-logs');
      const actions = res.body.map((r: { action: string }) => r.action);
      for (const a of [
        'tenant.created',
        'tenant.suspended',
        'tenant.auto_suspended',
        'subscription.payment',
        'tenant.admin_password_reset',
        'platform.totp_enrolled',
        'platform.login_failed',
      ]) {
        expect(actions, a).toContain(a);
      }
    });

    it('عنوان الشركة: شهادة الأمان بتطلع بس للشركات الموجودة', async () => {
      const ok = await request(app.getHttpServer()).get(
        '/api/v1/public/domain-check?domain=minya.example.test',
      );
      expect(ok.status).toBe(200);
      const no = await request(app.getHttpServer()).get(
        '/api/v1/public/domain-check?domain=evil.example.test',
      );
      expect(no.status).toBe(404);
      const other = await request(app.getHttpServer()).get(
        '/api/v1/public/domain-check?domain=minya.evil.com',
      );
      expect(other.status).toBe(404);
    });
  });

  describe('الحيطان في قاعدة البيانات نفسها', () => {
    async function asRole(url: string, text: string) {
      const c = new Client({ connectionString: url });
      await c.connect();
      try {
        return await c.query(text);
      } finally {
        await c.end();
      }
    }

    it('حساب السيرفر العادي مايشوفش حسابات المالك ولا المدفوعات ولا ملاحظات الشركات', async () => {
      const url = process.env.DATABASE_URL!;
      await expect(asRole(url, 'select * from platform_admins')).rejects.toThrow(
        /permission denied/,
      );
      await expect(asRole(url, 'select * from subscription_payments')).rejects.toThrow(
        /permission denied/,
      );
      await expect(asRole(url, 'select notes from tenants')).rejects.toThrow(/permission denied/);
      await expect(asRole(url, `update tenants set status = 'active'`)).rejects.toThrow(
        /permission denied/,
      );
      await expect(asRole(url, 'select * from platform_tenant_stats()')).rejects.toThrow(
        /permission denied/,
      );
    });

    it('حساب لوحة المنصة مايشوفش طلبات ولا عملاء ولا فلوس الشركات', async () => {
      const url = process.env.PLATFORM_DATABASE_URL!;
      await expect(asRole(url, 'select * from orders')).rejects.toThrow(/permission denied/);
      await expect(asRole(url, 'select password_hash from users')).rejects.toThrow(
        /permission denied/,
      );
      await expect(asRole(url, 'select * from ledger_lines')).rejects.toThrow(/permission denied/);
      await expect(asRole(url, 'delete from subscription_payments')).rejects.toThrow(
        /permission denied/,
      );
      // من غير ختم شركة مايشوفش ولا مستخدم
      expect((await asRole(url, 'select id from users')).rowCount).toBe(0);
    });

    it('مدفوعات الاشتراكات وسجل المنصة ممنوع تعديلهم حتى من المالك', async () => {
      await expect(ownerQuery('update subscription_payments set amount = 1')).rejects.toThrow();
      await expect(ownerQuery('delete from platform_audit_logs')).rejects.toThrow();
    });
  });
});
