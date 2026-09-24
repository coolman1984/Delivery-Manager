import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { csvCell } from '../src/modules/reports/reports.service';
import {
  Api,
  BS,
  createApp,
  loginCustomer,
  loginStaff,
  ownerQuery,
  phones,
  resetData,
  uuid,
} from './helpers';

describe('🎁 الكوبونات والنقاط والتقارير', () => {
  let app: INestApplication;
  let customer: Api;
  let customer2: Api;
  let admin: Api;
  let ops: Api;
  let grill: Api;
  let driver: Api;
  let driverId: string;
  let storeId: string;
  let productId: string;
  let price: number;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    customer = await loginCustomer(app, BS, phones[BS].customer1);
    customer2 = await loginCustomer(app, BS, phones[BS].customer2);
    admin = await loginStaff(app, BS, phones[BS].admin);
    ops = await loginStaff(app, BS, phones[BS].ops);
    grill = await loginStaff(app, BS, phones[BS].grill);
    driver = await loginStaff(app, BS, phones[BS].driver1);
    driverId = (await driver.get('/auth/me')).body.id;
    const stores = await customer.get('/catalog/stores');
    storeId = stores.body.find((s: { name: string }) => s.name === 'مشويات أبو علي').id;
    const detail = await customer.get(`/catalog/stores/${storeId}`);
    const p = detail.body.products.find((x: { name: string }) => x.name === 'نص فرخة مشوية');
    productId = p.id;
    price = p.price;
  });

  afterAll(async () => {
    await app.close();
  });

  async function order(api: Api, extra: object = {}, quantity = 1) {
    const addressId = (await api.get('/me/addresses')).body[0].id;
    return api.post('/orders', {
      clientRequestId: uuid(),
      storeId,
      addressId,
      items: [{ productId, quantity }],
      ...extra,
    });
  }

  async function deliver(id: string, total: number) {
    await grill.post(`/orders/${id}/accept`);
    await grill.post(`/orders/${id}/ready`);
    await ops.post(`/orders/${id}/assign`, { driverId });
    await driver.post(`/orders/${id}/pickup`);
    return driver.post(`/orders/${id}/deliver`, { cashCollected: total });
  }

  it('العروض المتاحة بتظهر للكل', async () => {
    const offers = await new Api(app, BS).get('/catalog/offers');
    expect(offers.body.map((o: { code: string }) => o.code).sort()).toEqual(['FREEDEL', 'WELCOME']);
  });

  it('كوبون أول طلب: ٢٠٪ بحد أقصى ٣٠ جنيه، والمحل بياخد حقه كامل', async () => {
    const check = await customer.post('/coupons/check', {
      code: 'welcome',
      storeId,
      subtotal: price,
      deliveryFee: 1500,
    });
    expect(check.status).toBe(200);
    expect(check.body.discount).toBe(Math.min(Math.floor(price * 0.2), 3000));

    const res = await order(customer, { couponCode: 'WELCOME' });
    expect(res.status).toBe(201);
    expect(res.body.couponDiscount).toBe(check.body.discount);
    expect(res.body.total).toBe(price + 1500 - check.body.discount);

    const before = (await ops.get('/ops/finance/stores')).body.find(
      (s: { id: string }) => s.id === storeId,
    ).payable;
    expect((await deliver(res.body.id, res.body.total)).status).toBe(200);
    const after = (await ops.get('/ops/finance/stores')).body.find(
      (s: { id: string }) => s.id === storeId,
    ).payable;
    const detail = await ops.get(`/orders/${res.body.id}`);
    expect(after - before).toBe(price - detail.body.commissionAmount);
    const [sum] = await ownerQuery<{ s: string }>(
      'select coalesce(sum(amount),0) s from ledger_lines',
    );
    expect(Number(sum!.s)).toBe(0);
  });

  it('نفس الكوبون مايتاخدش تاني، وكوبون أول طلب مايشتغلش لعميل ليه طلبات', async () => {
    expect((await order(customer, { couponCode: 'WELCOME' })).status).toBe(400);
    const c2 = await order(customer2, {});
    expect(c2.status).toBe(201);
    const second = await order(customer2, { couponCode: 'WELCOME' });
    expect(second.status).toBe(400);
    expect(second.body.message).toMatch(/أول طلب/);
    await customer2.post(`/orders/${c2.body.id}/cancel`);
  });

  it('كود غلط أو حد أدنى مش متحقق بيترفض برسالة واضحة', async () => {
    expect((await order(customer, { couponCode: 'NOPE123' })).body.message).toBe(
      'الكود ده مش شغال',
    );
    const cheap = await order(customer, { couponCode: 'FREEDEL' }, 0 + 1);
    if (price < 10000) expect(cheap.status).toBe(400);
  });

  it('الطلب الملغي بيرجّع الكوبون', async () => {
    const res = await order(customer2, { couponCode: 'WELCOME' });
    expect(res.status).toBe(201);
    expect((await customer2.post(`/orders/${res.body.id}/cancel`)).status).toBe(200);
    expect((await order(customer2, { couponCode: 'WELCOME' })).status).toBe(201);
  });

  it('النقاط: العميل بياخد نقاط بعد التسليم، ويصرفها على طلب جديد، وترجع لو اتلغى', async () => {
    const pts = await customer.get('/me/points');
    expect(pts.body.balance).toBe(Math.floor(price / 1000));
    const balance = pts.body.balance as number;
    expect(balance).toBeGreaterThan(0);

    const res = await order(customer, { usePoints: true });
    expect(res.status).toBe(201);
    expect(res.body.pointsUsed).toBe(balance);
    expect(res.body.pointsDiscount).toBe(balance * 10);
    expect((await customer.get('/me/points')).body.balance).toBe(0);

    await customer.post(`/orders/${res.body.id}/cancel`);
    expect((await customer.get('/me/points')).body.balance).toBe(balance);
  });

  it('دفتر النقاط ممنوع يتعدل', async () => {
    await expect(ownerQuery('update loyalty_points set points = 99999')).rejects.toThrow(/ممنوع/);
  });

  it('المدير بيعمل كوبون، ومدير التشغيل مايقدرش', async () => {
    const body = {
      code: 'ramadan25',
      title: 'خصم رمضان',
      kind: 'fixed',
      value: 2500,
      minSubtotal: 5000,
    };
    const res = await admin.post('/admin/coupons', body);
    expect(res.status).toBe(201);
    expect(res.body.code).toBe('RAMADAN25');
    expect((await ops.post('/admin/coupons', { ...body, code: 'X99' })).status).toBe(403);
    expect((await admin.post('/admin/coupons', body)).status).toBe(409);
    expect(
      (await admin.post('/admin/coupons', { ...body, code: 'BAD', kind: 'percent', value: 20000 }))
        .status,
    ).toBe(400);
    const list = await ops.get('/admin/coupons');
    expect(
      list.body.find((c: { code: string }) => c.code === 'WELCOME').uses,
    ).toBeGreaterThanOrEqual(1);
  });

  it('التقارير بتطلع أرقام صح، والتصدير للإكسل آمن', async () => {
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Cairo' }).format(new Date());
    const res = await ops.get(`/ops/reports?from=${today}&to=${today}`);
    expect(res.status).toBe(200);
    expect(res.body.totals.delivered).toBe(1);
    expect(res.body.totals.net_revenue).toBe(
      res.body.totals.commission + res.body.totals.delivery_fees - res.body.totals.discounts,
    );
    expect(res.body.stores[0].name).toBe('مشويات أبو علي');
    expect(res.body.zones.length).toBeGreaterThan(0);
    expect((await customer.get(`/ops/reports?from=${today}&to=${today}`)).status).toBe(403);
    expect((await ops.get(`/ops/reports?from=2020-01-01&to=2026-12-31`)).status).toBe(400);

    const csv = await ops.get(`/ops/reports/export?from=${today}&to=${today}`);
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    expect(csv.text.startsWith('﻿')).toBe(true);

    expect(csvCell('=HYPERLINK("http://evil")')).toBe(`"'=HYPERLINK(""http://evil"")"`);
    expect(csvCell('-15.5')).toBe('-15.5');
    expect(csvCell('+201012345678')).toBe("'+201012345678");
  });
});
