import type { INestApplication } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import type { Env } from './config/env';

/** إعدادات الحماية العامة للسيرفر (مشتركة بين التشغيل والاختبارات) */
export function configureApp(app: INestApplication, env: Env): void {
  const express = app as NestExpressApplication;
  express.set('trust proxy', env.TRUST_PROXY);
  express.disable('x-powered-by');
  express.useBodyParser('json', { limit: '100kb' });
  app.use(
    helmet({
      contentSecurityPolicy: { directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] } },
      crossOriginResourcePolicy: { policy: 'same-site' },
      hsts: env.NODE_ENV === 'production' ? { maxAge: 31_536_000, includeSubDomains: true } : false,
    }),
  );
  app.use(cookieParser());
  app.enableCors({
    origin: env.CORS_ORIGINS.split(',').map((o) => o.trim()),
    credentials: true,
    allowedHeaders: ['content-type', 'authorization', 'x-tenant', 'x-requested-with'],
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });
  app.setGlobalPrefix('api/v1', { exclude: [] });
  app.enableShutdownHooks();
}
