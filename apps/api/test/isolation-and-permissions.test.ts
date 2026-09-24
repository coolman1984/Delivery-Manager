import type { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  Api,
  BS,
  createApp,
  FY,
  loginCustomer,
  loginStaff,
  ownerQuery,
  phones,
  placeOrder,
  resetData,
  uuid,
} from './helpers';

/**
 * اختبارات العزل والصلاحيات:
 * - شركة بني سويف عمرها ما تشوف بيانات شركة الفيوم (حتى لو عرفت أرقام الطلبات)
 * - كل دور يعمل اللي يخصه بس
 */
describe('🧱 عزل الشركات', () => {
  let app: INestApplication;
  let bsOps: Api;
  let bsAdmin: Api;
  let fyOrderId: string;
  let fyZoneId: string;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    bsOps = await loginStaff(app, BS, phones[BS].ops);
    bsAdmin = await loginStaff(app, BS, phones[BS].admin);
    const fyCustomer = await loginCustomer(app, FY, phones[FY].customer1);
    fyOrderId = (await placeOrder(fyCustomer, 'كشري التحرير')).order.id;
    const fyAdmin = await loginStaff(app, FY, phones[FY].admin);
    fyZoneId = (await fyAdmin.get('/admin/zones')).body[0].id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('مدير تشغيل بني سويف مايشوفش طلب من الفيوم حتى لو عرف رقمه', async () => {
    expect((await bsOps.get(`/orders/${fyOrderId}`)).status).toBe(404);
    expect(
      (await bsOps.post(`/orders/${fyOrderId}/cancel-by-ops`, { reason: 'تجربة اختراق' })).status,
    ).toBe(404);
    const list = await bsOps.get('/orders');
    expect(list.body.some((o: { id: string }) => o.id === fyOrderId)).toBe(false);
  });

  it('مدير شركة بني سويف مايقدرش يعدّل أسعار مناطق الفيوم', async () => {
    const res = await bsAdmin.patch(`/admin/zones/${fyZoneId}`, { deliveryFee: 1 });
    expect(res.status).toBe(404);
    const [zone] = await ownerQuery<{ delivery_fee: number }>(
      'select delivery_fee from zones where id = $1',
      [fyZoneId],
    );
    expect(zone!.delivery_fee).not.toBe(1);
  });

  it('توكن شركة مايشتغلش على شركة تانية', async () => {
    const crossed = new Api(app, FY, bsOps.token);
    expect((await crossed.get('/orders')).status).toBe(403);
  });

  it('قاعدة البيانات نفسها بتخفي بيانات الشركات التانية (حتى لو الكود غلط)', async () => {
    const c = new Client({ connectionString: process.env.DATABASE_URL });
    await c.connect();
    try {
      // من غير ختم شركة: مفيش ولا صف
      expect((await c.query('select * from orders')).rowCount).toBe(0);
      expect((await c.query('select * from users')).rowCount).toBe(0);

      const [bs] = await ownerQuery<{ id: string }>('select id from tenants where slug = $1', [BS]);
      const [fy] = await ownerQuery<{ id: string }>('select id from tenants where slug = $1', [FY]);
      await c.query('begin');
      await c.query(`select set_config('app.tenant_id', $1, true)`, [bs!.id]);
      const rows = await c.query('select tenant_id from users');
      expect(rows.rowCount).toBeGreaterThan(0);
      expect(rows.rows.every((r) => r.tenant_id === bs!.id)).toBe(true);
      expect((await c.query('select * from orders where id = $1', [fyOrderId])).rowCount).toBe(0);
      // ومايقدرش يكتب صف باسم شركة تانية
      await expect(
        c.query(`insert into zones (tenant_id, name, delivery_fee) values ($1, 'اختراق', 0)`, [
          fy!.id,
        ]),
      ).rejects.toThrow(/row-level security/);
      await c.query('rollback');

      // ومايقدرش يعدّل جدول الشركات نفسه
      await expect(c.query(`update tenants set status = 'suspended'`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await c.end();
    }
  });
});

describe('🚦 الصلاحيات', () => {
  let app: INestApplication;
  let customer1: Api;
  let customer2: Api;
  let grill: Api;
  let pharmacy: Api;
  let driver1: Api;
  let driver2: Api;
  let ops: Api;
  let orderId: string;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    customer1 = await loginCustomer(app, BS, phones[BS].customer1);
    customer2 = await loginCustomer(app, BS, phones[BS].customer2);
    grill = await loginStaff(app, BS, phones[BS].grill);
    pharmacy = await loginStaff(app, BS, phones[BS].pharmacy);
    driver1 = await loginStaff(app, BS, phones[BS].driver1);
    driver2 = await loginStaff(app, BS, phones[BS].driver2);
    ops = await loginStaff(app, BS, phones[BS].ops);
    orderId = (await placeOrder(customer1)).order.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('من غير تسجيل دخول: الطلبات مقفولة، والفرجة على المحلات مفتوحة', async () => {
    const anon = new Api(app, BS);
    expect((await anon.get('/orders')).status).toBe(401);
    expect((await anon.get('/ops/finance/summary')).status).toBe(401);
    expect((await anon.get('/catalog/stores')).status).toBe(200);
  });

  it('توكن مزوّر أو متلاعب فيه بيترفض', async () => {
    const fake = new JwtService({ secret: 'wrong-secret-wrong-secret-wrong-secret' });
    const forged = await fake.signAsync({ sub: uuid(), tid: uuid(), role: 'admin' });
    expect((await new Api(app, BS, forged).get('/admin/users')).status).toBe(401);

    const [header, payload] = ops.token!.split('.');
    const escalated = Buffer.from(
      JSON.stringify({
        ...JSON.parse(Buffer.from(payload!, 'base64url').toString()),
        role: 'admin',
      }),
    ).toString('base64url');
    expect((await new Api(app, BS, `${header}.${escalated}.x`).get('/admin/users')).status).toBe(
      401,
    );
    const none = `${Buffer.from('{"alg":"none"}').toString('base64url')}.${escalated}.`;
    expect((await new Api(app, BS, none).get('/admin/users')).status).toBe(401);
  });

  it('العميل مايدخلش لوحة التشغيل ولا لوحة الإدارة', async () => {
    expect((await customer1.get('/ops/finance/summary')).status).toBe(403);
    expect((await customer1.get('/admin/users')).status).toBe(403);
    expect((await customer1.post(`/orders/${orderId}/accept`)).status).toBe(403);
  });

  it('مدير التشغيل مايقدرش يعمل حسابات أو يغيّر العمولات (دي للمدير بس)', async () => {
    const stores = await ops.get('/admin/stores');
    expect(stores.status).toBe(200);
    expect(
      (await ops.patch(`/admin/stores/${stores.body[0].id}`, { commissionBps: 0 })).status,
    ).toBe(403);
    expect(
      (
        await ops.post('/admin/users', {
          name: 'مدير مزيف',
          phone: '01099999999',
          role: 'admin',
          password: 'x'.repeat(12),
        })
      ).status,
    ).toBe(403);
  });

  it('عميل مايشوفش طلب عميل تاني', async () => {
    expect((await customer1.get(`/orders/${orderId}`)).status).toBe(200);
    expect((await customer2.get(`/orders/${orderId}`)).status).toBe(404);
    expect((await customer2.post(`/orders/${orderId}/cancel`)).status).toBe(404);
  });

  it('محل مايقدرش يقبل طلب محل تاني', async () => {
    expect((await pharmacy.post(`/orders/${orderId}/accept`)).status).toBe(404);
    expect((await grill.post(`/orders/${orderId}/accept`)).status).toBe(200);
  });

  it('المحل مايشوفش رقم تليفون العميل', async () => {
    const res = await grill.get(`/orders/${orderId}`);
    expect(res.body.customerPhone).toBeNull();
  });

  it('الطيار مايقدرش يستلم طلب مش متسند له', async () => {
    await grill.post(`/orders/${orderId}/ready`);
    const driver1Id = (await driver1.get('/auth/me')).body.id;
    expect((await ops.post(`/orders/${orderId}/assign`, { driverId: driver1Id })).status).toBe(200);
    expect((await driver2.post(`/orders/${orderId}/pickup`)).status).toBe(404);
    expect((await driver1.post(`/orders/${orderId}/pickup`)).status).toBe(200);
  });

  it('مفيش قفز في مراحل الطلب', async () => {
    const { order } = await placeOrder(customer1);
    expect((await grill.post(`/orders/${order.id}/ready`)).status).toBe(409);
    const driver1Id = (await driver1.get('/auth/me')).body.id;
    await ops.post(`/orders/${order.id}/assign`, { driverId: driver1Id });
    expect(
      (await driver1.post(`/orders/${order.id}/deliver`, { cashCollected: order.total })).status,
    ).toBe(409);
  });

  it('المحل مايقدرش يعدّل منتجات محل تاني', async () => {
    const own = await pharmacy.get('/store/products');
    expect((await grill.patch(`/store/products/${own.body[0].id}`, { price: 1 })).status).toBe(404);
  });

  it('أي حقل زيادة أو سعر مبعوت من الموبايل بيترفض', async () => {
    const stores = await customer1.get('/catalog/stores');
    const detail = await customer1.get(`/catalog/stores/${stores.body[0].id}`);
    const addresses = await customer1.get('/me/addresses');
    const res = await customer1.post('/orders', {
      clientRequestId: uuid(),
      storeId: stores.body[0].id,
      addressId: addresses.body[0].id,
      items: [{ productId: detail.body.products[0].id, quantity: 1, price: 1 }],
      total: 1,
    });
    expect(res.status).toBe(400);
  });

  it('العميل مايقدرش يطلب على عنوان عميل تاني', async () => {
    const stores = await customer2.get('/catalog/stores');
    const detail = await customer2.get(`/catalog/stores/${stores.body[0].id}`);
    const otherAddress = (await customer1.get('/me/addresses')).body[0].id;
    const res = await customer2.post('/orders', {
      clientRequestId: uuid(),
      storeId: stores.body[0].id,
      addressId: otherAddress,
      items: [{ productId: detail.body.products[0].id, quantity: 1 }],
    });
    expect(res.status).toBe(404);
  });

  it('مدخلات فيها محاولات حقن بترفض بأمان', async () => {
    expect((await ops.get(`/orders/1' OR '1'='1`)).status).toBe(400);
    expect((await ops.get(`/orders?status=placed';drop table orders;--`)).status).toBe(400);
    expect((await new Api(app, "beni-suef' --").get('/catalog/stores')).status).toBe(404);
  });
});
