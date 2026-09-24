import type { INestApplication } from '@nestjs/common';
import sharp from 'sharp';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { Api, BS, createApp, loginStaff, phones, resetData } from './helpers';

describe('🖼️ رفع الصور وطلبات الانضمام', () => {
  let app: INestApplication;
  let grill: Api;
  let pharmacy: Api;
  let png: Buffer;

  beforeAll(async () => {
    await resetData();
    app = await createApp();
    grill = await loginStaff(app, BS, phones[BS].grill);
    pharmacy = await loginStaff(app, BS, phones[BS].pharmacy);
    png = await sharp({ create: { width: 900, height: 700, channels: 3, background: '#e85d04' } })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    await app.close();
  });

  const upload = (api: Api, path: string, file: Buffer, name = 'photo.png') =>
    request(app.getHttpServer())
      .post(`/api/v1${path}`)
      .set('x-tenant', BS)
      .set('authorization', `Bearer ${api.token}`)
      .attach('image', file, name);

  it('المحل يرفع صورة منتج، وبتتحول لصيغة خفيفة ومقاس ثابت', async () => {
    const product = (await grill.get('/store/products')).body[0];
    const res = await upload(grill, `/store/products/${product.id}/image`, png);
    expect(res.status).toBe(201);
    expect(res.body.url).toMatch(/^\/api\/v1\/media\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);

    const img = await request(app.getHttpServer()).get(res.body.url).buffer(true);
    expect(img.status).toBe(200);
    expect(img.headers['content-type']).toBe('image/webp');
    const meta = await sharp(img.body as Buffer).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(600);
  });

  it('ملف مش صورة (حتى لو اسمه .png) بيترفض', async () => {
    const product = (await grill.get('/store/products')).body[0];
    const fake = Buffer.from('<?php system($_GET["c"]); ?>');
    expect(
      (await upload(grill, `/store/products/${product.id}/image`, fake, 'shell.png')).status,
    ).toBe(400);
  });

  it('محل مايقدرش يغيّر صورة منتج محل تاني', async () => {
    const other = (await pharmacy.get('/store/products')).body[0];
    expect((await upload(grill, `/store/products/${other.id}/image`, png)).status).toBe(404);
  });

  it('المحل يغيّر اللوجو والغلاف، وبيظهروا للعملاء', async () => {
    expect((await upload(grill, '/store/me/logo', png)).status).toBe(201);
    expect((await upload(grill, '/store/me/cover', png)).status).toBe(201);
    expect((await upload(grill, '/store/me/banner', png)).status).toBe(404);
    const stores = await new Api(app, BS).get('/catalog/stores');
    const s = stores.body.find((x: { name: string }) => x.name === 'مشويات أبو علي');
    expect(s.logoUrl).toMatch(/\.webp$/);
    expect(s.coverUrl).toMatch(/\.webp$/);
  });

  it('مسارات الصور مقفولة ضد الخروج بره الفولدر', async () => {
    const server = request(app.getHttpServer());
    expect((await server.get('/api/v1/media/..%2F..%2Fetc/passwd')).status).toBe(404);
    expect((await server.get('/api/v1/media/abc/..%2F.env')).status).toBe(404);
  });

  it('أي حد يقدر يبعت طلب انضمام، والمدير بس يشوفهم', async () => {
    const anon = new Api(app, BS);
    const res = await anon.post('/public/leads', {
      type: 'driver',
      name: 'طيار جديد',
      phone: '01099887766',
    });
    expect(res.status).toBe(201);
    expect(
      (await anon.post('/public/leads', { type: 'hacker', name: 'x', phone: '01099887766' }))
        .status,
    ).toBe(400);
    const admin = await loginStaff(app, BS, phones[BS].admin);
    const list = await admin.get('/admin/leads');
    expect(list.body[0].name).toBe('طيار جديد');
    expect((await grill.get('/admin/leads')).status).toBe(403);
  });
});
