import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    root: './',
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    // اختبارات التكامل بتشتغل على قاعدة بيانات حقيقية، فبتتنفذ واحد ورا التاني
    fileParallelism: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    globalSetup: ['./test/global-setup.ts'],
    env: {
      NODE_ENV: 'test',
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ??
        'postgres://dm_app_test:test_app_password_1234@localhost:5432/delivery_test',
      MIGRATION_DATABASE_URL:
        process.env.TEST_MIGRATION_DATABASE_URL ??
        'postgres://postgres:dev_owner_password@localhost:5432/delivery_test',
      REDIS_URL: process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/15',
      JWT_ACCESS_SECRET: 'test-secret-that-is-long-enough-for-hs256-signing',
      DATA_ENCRYPTION_KEY: '0'.repeat(64),
      SMS_PROVIDER: 'console',
      OTP_ENABLED: 'true',
      MEDIA_DIR: '/tmp/dm-test-media',
    },
  },
  plugins: [swc.vite({ module: { type: 'es6' } })],
});
