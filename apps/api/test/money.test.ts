import type { INestApplication } from '@nestjs/common';
import { Client } from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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
} from './helpers';

/**
 * اختبارات الفلوس: أهم حاجة في النظام.
 * بنتأكد إن كل جنيه متسجل صح، ومفيش تسجيل مرتين، ومفيش تعديل في القيود.
 */
describe('💰 الفلوس', () => {
  let app: INestApplication;
  let customer: Api;
  let store: Api;
  let ops: Api;
  let driver: Api;
  let driverId: string;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    customer = await loginCustomer(app, BS, phones[BS].customer1);
    store = await loginStaff(app, BS, phones[BS].grill);
    ops = await loginStaff(app, BS, phones[BS].ops);
    driver = await loginStaff(app, BS, phones[BS].driver1);
    driverId = (await driver.get('/auth/me')).body.id;
  });

  afterAll(async () => {
    await app.close();
  });

  async function deliverableOrder(quantity = 2) {
    const { order } = await placeOrder(customer, 'مشويات أبو علي', quantity);
    expect((await store.post(`/orders/${order.id}/accept`)).status).toBe(200);
    expect((await store.post(`/orders/${order.id}/ready`)).status).toBe(200);
    expect((await ops.post(`/orders/${order.id}/assign`, { driverId })).status).toBe(200);
    expect((await driver.post(`/orders/${order.id}/pickup`)).status).toBe(200);
    return order;
  }

  async function balances() {
    const drivers = await ops.get('/ops/finance/drivers');
    const stores = await ops.get('/ops/finance/stores');
    return {
      driverCash: drivers.body.find((d: { id: string }) => d.id === driverId).cashBalance as number,
      grillPayable: stores.body.find((s: { name: string }) => s.name === 'مشويات أبو علي')
        .payable as number,
    };
  }

  it('السعر بيتحسب من قاعدة البيانات والعمولة صح', async () => {
    const { order, product } = await placeOrder(customer, 'مشويات أبو علي', 3);
    expect(order.subtotal).toBe(product.price * 3);
    expect(order.deliveryFee).toBe(1500);
    expect(order.total).toBe(order.subtotal + 1500);
    // العميل مايشوفش عمولة المحل
    expect(order.commissionAmount).toBeNull();
    const asOps = await ops.get(`/orders/${order.id}`);
    expect(asOps.body.commissionAmount).toBe(Math.round((order.subtotal * 1200) / 10_000));
  });

  it('الطلب اللي اتبعت مرتين (نت ضعيف) بيتسجل مرة واحدة', async () => {
    const stores = await customer.get('/catalog/stores');
    const storeId = stores.body[0].id;
    const detail = await customer.get(`/catalog/stores/${storeId}`);
    const addresses = await customer.get('/me/addresses');
    const body = {
      clientRequestId: crypto.randomUUID(),
      storeId,
      addressId: addresses.body[0].id,
      items: [{ productId: detail.body.products[0].id, quantity: 1 }],
    };
    const first = await customer.post('/orders', body);
    const second = await customer.post('/orders', body);
    expect(first.status).toBe(201);
    expect(second.body.id).toBe(first.body.id);
  });

  it('التسليم بيسجل قيد متوازن: الطيار شايل الإجمالي والمحل ليه صافي حقه', async () => {
    const before = await balances();
    const order = await deliverableOrder();
    const res = await driver.post(`/orders/${order.id}/deliver`, { cashCollected: order.total });
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('delivered');

    const after = await balances();
    const detail = await ops.get(`/orders/${order.id}`);
    expect(after.driverCash - before.driverCash).toBe(order.total);
    expect(after.grillPayable - before.grillPayable).toBe(
      order.subtotal - detail.body.commissionAmount,
    );

    const [sum] = await ownerQuery<{ s: string }>(
      'select coalesce(sum(amount),0) s from ledger_lines',
    );
    expect(Number(sum!.s)).toBe(0);
  });

  it('التسليم مرتين مايسجلش الفلوس مرتين', async () => {
    const order = await deliverableOrder();
    const first = await driver.post(`/orders/${order.id}/deliver`, { cashCollected: order.total });
    expect(first.status).toBe(200);
    const before = await balances();
    const second = await driver.post(`/orders/${order.id}/deliver`, { cashCollected: order.total });
    expect(second.status).toBe(409);
    expect(await balances()).toEqual(before);
  });

  it('الطيار مايقدرش يسجل مبلغ أكبر من المطلوب، ولو أقل لازم سبب', async () => {
    const order = await deliverableOrder();
    expect(
      (await driver.post(`/orders/${order.id}/deliver`, { cashCollected: order.total + 100 }))
        .status,
    ).toBe(400);
    expect(
      (await driver.post(`/orders/${order.id}/deliver`, { cashCollected: order.total - 500 }))
        .status,
    ).toBe(400);
  });

  it('فرق التحصيل بيفضل معلّق لحد ما المدير يقرر، ولو اتحمّل للطيار بيزود عهدته', async () => {
    const order = await deliverableOrder();
    const before = await balances();
    const res = await driver.post(`/orders/${order.id}/deliver`, {
      cashCollected: order.total - 500,
      note: 'العميل ماكانش معاه فكة',
    });
    expect(res.status).toBe(200);
    expect(res.body.cashDiffStatus).toBe('pending');

    const pending = await ops.get('/ops/finance/cash-differences');
    expect(pending.body.some((d: { orderId: string }) => d.orderId === order.id)).toBe(true);

    const resolve = await ops.post(`/ops/finance/cash-differences/${order.id}/resolve`, {
      decision: 'charge_driver',
    });
    expect(resolve.status).toBe(201);
    const after = await balances();
    expect(after.driverCash - before.driverCash).toBe(order.total);

    const again = await ops.post(`/ops/finance/cash-differences/${order.id}/resolve`, {
      decision: 'write_off',
    });
    expect(again.status).toBe(409);
  });

  it('التسوية اليومية: العجز بيفضل على الطيار، ومايقدرش يسلّم أكتر من عهدته', async () => {
    const { driverCash } = await balances();
    expect(driverCash).toBeGreaterThan(1000);

    const tooMuch = await ops.post(`/ops/finance/drivers/${driverId}/settle`, {
      receivedAmount: driverCash + 1,
    });
    expect(tooMuch.status).toBe(400);

    const res = await ops.post(`/ops/finance/drivers/${driverId}/settle`, {
      receivedAmount: driverCash - 1000,
    });
    expect(res.status).toBe(201);
    expect(res.body.expectedAmount).toBe(driverCash);
    expect(res.body.shortage).toBe(1000);
    expect((await balances()).driverCash).toBe(1000);

    const list = await ops.get('/ops/finance/settlements');
    expect(list.body[0].shortage).toBe(1000);
  });

  it('صرف مستحقات المحل مايزيدش عن المستحق', async () => {
    const { grillPayable } = await balances();
    const stores = await ops.get('/ops/finance/stores');
    const grill = stores.body.find((s: { name: string }) => s.name === 'مشويات أبو علي');
    expect(
      (await ops.post(`/ops/finance/stores/${grill.id}/payout`, { amount: grillPayable + 1 }))
        .status,
    ).toBe(400);
    const ok = await ops.post(`/ops/finance/stores/${grill.id}/payout`, { amount: grillPayable });
    expect(ok.status).toBe(201);
    expect((await balances()).grillPayable).toBe(0);
  });

  it('ملخص اليوم بيطلع أرقام صح', async () => {
    const res = await ops.get('/ops/finance/summary');
    expect(res.status).toBe(200);
    expect(res.body.ordersByStatus.delivered).toBeGreaterThanOrEqual(3);
    expect(res.body.commission).toBeGreaterThan(0);
    expect(res.body.cashWithDrivers).toBe(1000);
  });

  describe('🔒 قاعدة البيانات نفسها بتحمي الدفتر', () => {
    async function asApp<T>(fn: (c: Client) => Promise<T>): Promise<T> {
      const c = new Client({ connectionString: process.env.DATABASE_URL });
      await c.connect();
      try {
        const [tenant] = await ownerQuery<{ id: string }>(
          `select id from tenants where slug = $1`,
          [BS],
        );
        await c.query('begin');
        await c.query(`select set_config('app.tenant_id', $1, true)`, [tenant!.id]);
        return await fn(c);
      } finally {
        await c.query('rollback').catch(() => undefined);
        await c.end();
      }
    }

    it('ممنوع تعديل أو مسح سطر في دفتر الحسابات', async () => {
      await expect(
        asApp((c) => c.query('update ledger_lines set amount = amount + 100')),
      ).rejects.toThrow();
      await expect(asApp((c) => c.query('delete from ledger_lines'))).rejects.toThrow();
    });

    it('ممنوع مسح سجل العمليات، حتى لصاحب القاعدة', async () => {
      await expect(asApp((c) => c.query('delete from audit_logs'))).rejects.toThrow();
      await expect(ownerQuery('delete from audit_logs')).rejects.toThrow(/ممنوع/);
    });

    it('القيد غير المتوازن بيترفض', async () => {
      await expect(
        asApp(async (c) => {
          const [tenant] = await ownerQuery<{ id: string }>(
            `select id from tenants where slug = $1`,
            [BS],
          );
          const j = await c.query(
            `insert into journals (tenant_id, kind, ref_id, description) values ($1, 'store_payout', gen_random_uuid(), 'x') returning id`,
            [tenant!.id],
          );
          const acc = await c.query(`select id from ledger_accounts limit 1`);
          await c.query(
            `insert into ledger_lines (tenant_id, journal_id, account_id, amount) values ($1, $2, $3, 500)`,
            [tenant!.id, j.rows[0].id, acc.rows[0].id],
          );
          await c.query('commit');
        }),
      ).rejects.toThrow(/متوازن/);
    });
  });
});
