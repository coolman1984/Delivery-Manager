import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import Redis from 'ioredis';
import { Client } from 'pg';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/bootstrap';
import { loadEnv } from '../src/config/env';
import { DEMO_PASSWORD, seed } from '../src/db/seed';

export const BS = 'beni-suef';
export const FY = 'fayoum';

/** أرقام الحسابات التجريبية (شوف seed.ts) */
export const phones = {
  [BS]: {
    admin: '01000000001',
    ops: '01000000002',
    grill: '01000000011',
    pharmacy: '01000000012',
    driver1: '01000000021',
    driver2: '01000000022',
    customer1: '01000000031',
    customer2: '01000000032',
  },
  [FY]: {
    admin: '01100000001',
    ops: '01100000002',
    grill: '01100000011',
    pharmacy: '01100000012',
    driver1: '01100000021',
    driver2: '01100000022',
    customer1: '01100000031',
    customer2: '01100000032',
  },
} as const;

export async function ownerQuery<T = Record<string, unknown>>(
  text: string,
  params: unknown[] = [],
): Promise<T[]> {
  const client = new Client({ connectionString: process.env.MIGRATION_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(text, params)).rows as T[];
  } finally {
    await client.end();
  }
}

/** بنرجّع قاعدة البيانات لحالة البيانات التجريبية قبل كل ملف اختبار */
export async function resetData(): Promise<void> {
  await ownerQuery(`
    TRUNCATE tenants, tenant_counters, zones, stores, users, refresh_tokens, addresses, driver_profiles,
      products, orders, order_items, order_events, ratings, ledger_accounts, journals, ledger_lines,
      settlements, audit_logs, leads, tenant_settings, push_subscriptions, coupons, coupon_redemptions,
      loyalty_points CASCADE`);
  const redis = new Redis(process.env.REDIS_URL!);
  await redis.flushdb();
  await redis.quit();
  await seed(process.env.MIGRATION_DATABASE_URL!);
}

export async function createApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication<NestExpressApplication>({
    bodyParser: false,
    logger: ['error'],
  });
  configureApp(app, loadEnv());
  await app.init();
  return app;
}

export class Api {
  constructor(
    private readonly app: INestApplication,
    readonly tenant: string,
    readonly token?: string,
  ) {}

  private withHeaders(req: request.Test): request.Test {
    req.set('x-tenant', this.tenant);
    if (this.token) req.set('authorization', `Bearer ${this.token}`);
    return req;
  }

  get(path: string) {
    return this.withHeaders(request(this.app.getHttpServer()).get(`/api/v1${path}`));
  }
  post(path: string, body?: object) {
    return this.withHeaders(request(this.app.getHttpServer()).post(`/api/v1${path}`)).send(
      body ?? {},
    );
  }
  patch(path: string, body?: object) {
    return this.withHeaders(request(this.app.getHttpServer()).patch(`/api/v1${path}`)).send(
      body ?? {},
    );
  }
  delete(path: string) {
    return this.withHeaders(request(this.app.getHttpServer()).delete(`/api/v1${path}`));
  }
}

export async function loginStaff(
  app: INestApplication,
  tenant: string,
  phone: string,
): Promise<Api> {
  const res = await new Api(app, tenant).post('/auth/login', { phone, password: DEMO_PASSWORD });
  if (res.status !== 200)
    throw new Error(`login failed for ${phone}: ${res.status} ${JSON.stringify(res.body)}`);
  return new Api(app, tenant, res.body.accessToken);
}

export async function loginCustomer(
  app: INestApplication,
  tenant: string,
  phone: string,
  name?: string,
): Promise<Api> {
  const anon = new Api(app, tenant);
  const req = await anon.post('/auth/otp/request', { phone });
  if (req.status !== 200)
    throw new Error(`otp request failed: ${req.status} ${JSON.stringify(req.body)}`);
  const res = await anon.post('/auth/otp/verify', {
    phone,
    code: req.body.devCode,
    ...(name ? { name } : {}),
  });
  if (res.status !== 200)
    throw new Error(`otp verify failed: ${res.status} ${JSON.stringify(res.body)}`);
  return new Api(app, tenant, res.body.accessToken);
}

export function uuid(): string {
  return crypto.randomUUID();
}

/** يعمل طلب كامل من العميل ويرجّع بياناته */
export async function placeOrder(customer: Api, storeName = 'مشويات أبو علي', quantity = 2) {
  const stores = await customer.get('/catalog/stores');
  const store = stores.body.find((s: { name: string }) => s.name === storeName);
  const detail = await customer.get(`/catalog/stores/${store.id}`);
  const product = detail.body.products[0];
  const addresses = await customer.get('/me/addresses');
  const res = await customer.post('/orders', {
    clientRequestId: uuid(),
    storeId: store.id,
    addressId: addresses.body[0].id,
    items: [{ productId: product.id, quantity }],
  });
  if (res.status !== 201)
    throw new Error(`order failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { order: res.body, store, product };
}
