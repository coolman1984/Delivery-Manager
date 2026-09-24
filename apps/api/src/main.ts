import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './bootstrap';
import { loadDotenv } from './config/load-dotenv';
import { loadEnv } from './config/env';

async function bootstrap(): Promise<void> {
  loadDotenv();
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
    logger: env.NODE_ENV === 'production' ? ['log', 'warn', 'error'] : undefined,
  });
  configureApp(app, env);
  await app.listen(env.PORT);
  new Logger('Bootstrap').log(`🚀 السيرفر شغال على المنفذ ${env.PORT}`);
}

void bootstrap();
