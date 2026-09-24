import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PushService } from '../src/modules/push/push.service';
import {
  Api,
  BS,
  createApp,
  loginCustomer,
  loginStaff,
  ownerQuery,
  phones,
  placeOrder,
  resetData,
  uuid,
} from './helpers';

describe('🗺️ الخرايط والمشاوير والتوزيع التلقائي', () => {
  let app: INestApplication;
  let customer: Api;
  let customer2: Api;
  let ops: Api;
  let admin: Api;
  let grill: Api;
  let driver1: Api;
  let driver1Id: string;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    customer = await loginCustomer(app, BS, phones[BS].customer1);
    customer2 = await loginCustomer(app, BS, phones[BS].customer2);
    ops = await loginStaff(app, BS, phones[BS].ops);
    admin = await loginStaff(app, BS, phones[BS].admin);
    grill = await loginStaff(app, BS, phones[BS].grill);
    driver1 = await loginStaff(app, BS, phones[BS].driver1);
    driver1Id = (await driver1.get('/auth/me')).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  it('بيعرف المنطقة من مكان العميل على الخريطة', async () => {
    const anon = new Api(app, BS);
    const inside = await anon.get('/catalog/zones/detect?lat=29.0662&lng=31.0995');
    expect(inside.body.zone.name).toBe('وسط البلد');
    const outside = await anon.get('/catalog/zones/detect?lat=30.0444&lng=31.2357');
    expect(outside.body.zone).toBeNull();
    expect((await anon.get('/catalog/zones/detect?lat=abc&lng=1')).status).toBe(400);
  });

  it('المشوار: العميل يطلب، بيبقى جاهز للطيار، والفلوس بتتسجل من غير محل', async () => {
    const addressId = (await customer.get('/me/addresses')).body[0].id;
    const res = await customer.post('/orders/errands', {
      clientRequestId: uuid(),
      pickupText: 'صيدلية العزبي شارع صلاح سالم',
      addressId,
      details: 'استلام روشتة جاهزة ومدفوعة',
    });
    expect(res.status).toBe(201);
    expect(res.body.type).toBe('errand');
    expect(res.body.status).toBe('ready');
    expect(res.body.total).toBe(res.body.deliveryFee);

    expect((await ops.post(`/orders/${res.body.id}/assign`, { driverId: driver1Id })).status).toBe(
      200,
    );
    expect((await driver1.post(`/orders/${res.body.id}/pickup`)).status).toBe(200);
    const done = await driver1.post(`/orders/${res.body.id}/deliver`, {
      cashCollected: res.body.total,
    });
    expect(done.status).toBe(200);

    const [sum] = await ownerQuery<{ s: string }>(
      'select coalesce(sum(amount),0) s from ledger_lines',
    );
    expect(Number(sum!.s)).toBe(0);
    expect((await customer.post(`/orders/${res.body.id}/rate`, { driverRating: 5 })).status).toBe(
      200,
    );
  });

  it('العميل يقدر يلغي المشوار قبل ما الطيار يستلمه، وعميل تاني مايقدرش', async () => {
    const addressId = (await customer.get('/me/addresses')).body[0].id;
    const res = await customer.post('/orders/errands', {
      clientRequestId: uuid(),
      pickupText: 'محل بقالة جنب الجامع',
      addressId,
      details: 'كيس عيش',
    });
    expect((await customer2.post(`/orders/${res.body.id}/cancel`)).status).toBe(404);
    expect((await customer.post(`/orders/${res.body.id}/cancel`)).status).toBe(200);
  });

  it('المدير يقفل المشاوير فتترفض', async () => {
    expect((await admin.patch('/admin/settings', { errandsEnabled: false })).status).toBe(200);
    const addressId = (await customer.get('/me/addresses')).body[0].id;
    const res = await customer.post('/orders/errands', {
      clientRequestId: uuid(),
      pickupText: 'أي مكان في البلد',
      addressId,
      details: 'تجربة',
    });
    expect(res.status).toBe(400);
    expect((await ops.patch('/admin/settings', { errandsEnabled: true })).status).toBe(403);
    await admin.patch('/admin/settings', { errandsEnabled: true });
  });

  it('التوزيع التلقائي: أول ما المحل يقبل، الطلب يتسند لأقرب طيار فاضي', async () => {
    await admin.patch('/admin/settings', { autoDispatch: true });
    await driver1.post('/driver/location', { lat: 29.0665, lng: 31.099 });
    const { order } = await placeOrder(customer);
    const accepted = await grill.post(`/orders/${order.id}/accept`);
    expect(accepted.status).toBe(200);
    const detail = await ops.get(`/orders/${order.id}`);
    expect(detail.body.driverId).toBe(driver1Id);
    const logs = await ownerQuery<{ action: string }>(
      `select action from audit_logs where entity_id = $1`,
      [order.id],
    );
    expect(logs.map((l) => l.action)).toContain('order.auto_assigned');
    await admin.patch('/admin/settings', { autoDispatch: false });
  });

  it('مدير التشغيل يشوف أنسب الطيارين بالمسافة', async () => {
    const { order } = await placeOrder(customer);
    const res = await ops.get(`/orders/${order.id}/candidates`);
    expect(res.status).toBe(200);
    expect(res.body[0].id).toBe(driver1Id);
    expect(res.body[0].distanceKm).toBeLessThan(2);
    expect((await customer.get(`/orders/${order.id}/candidates`)).status).toBe(403);
  });

  it('التتبع: العميل يشوف مكان الطيار بس وهو شغال على طلبه', async () => {
    const { order } = await placeOrder(customer);
    await grill.post(`/orders/${order.id}/accept`);
    await ops.post(`/orders/${order.id}/assign`, { driverId: driver1Id });
    const track = await customer.get(`/orders/${order.id}/tracking`);
    expect(track.status).toBe(200);
    expect(track.body.driver.lat).toBeCloseTo(29.0665, 3);
    expect(track.body.pickup.lat).toBeTypeOf('number');
    expect((await customer2.get(`/orders/${order.id}/tracking`)).status).toBe(404);

    await ops.post(`/orders/${order.id}/cancel-by-ops`, { reason: 'تجربة تتبع' });
    const after = await customer.get(`/orders/${order.id}/tracking`);
    expect(after.body.driver).toBeNull();
  });

  it('إشعارات الموبايل بتقبل خدمات الإشعارات الرسمية بس (حماية من استغلال السيرفر)', () => {
    expect(() =>
      PushService.assertAllowedEndpoint('https://fcm.googleapis.com/fcm/send/abc'),
    ).not.toThrow();
    expect(() => PushService.assertAllowedEndpoint('https://web.push.apple.com/xyz')).not.toThrow();
    expect(() => PushService.assertAllowedEndpoint('http://fcm.googleapis.com/x')).toThrow();
    expect(() =>
      PushService.assertAllowedEndpoint('https://169.254.169.254/latest/meta-data'),
    ).toThrow();
    expect(() =>
      PushService.assertAllowedEndpoint('https://fcm.googleapis.com.evil.com/x'),
    ).toThrow();
  });
});
