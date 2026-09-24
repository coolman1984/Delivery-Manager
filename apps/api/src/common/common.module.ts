import { Global, Module } from '@nestjs/common';
import { ENV, loadEnv } from '../config/env';
import { AuditService } from './audit.service';
import { CryptoService } from './crypto.service';
import { DbService } from './db.service';
import { RateLimitService } from './rate-limit.service';
import { RedisService } from './redis.service';
import { TenantsService } from './tenants.service';

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    DbService,
    RedisService,
    RateLimitService,
    CryptoService,
    AuditService,
    TenantsService,
  ],
  exports: [
    ENV,
    DbService,
    RedisService,
    RateLimitService,
    CryptoService,
    AuditService,
    TenantsService,
  ],
})
export class CommonModule {}
