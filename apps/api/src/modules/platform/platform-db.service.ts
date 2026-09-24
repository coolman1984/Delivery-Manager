import { Inject, Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ENV, type Env } from '../../config/env';
import type { Db, Tx } from '../../common/db.service';
import * as schema from '../../db/schema';

/**
 * اتصال قاعدة البيانات الخاص بلوحة مالك المنصة، بحساب منفصل وصلاحيات مختلفة عن السيرفر العادي.
 * لو PLATFORM_DATABASE_URL مش مكتوب، اللوحة كلها بتبقى مقفولة.
 */
@Injectable()
export class PlatformDbService implements OnModuleDestroy {
  private readonly pool: Pool | null;
  private readonly database: Db | null;

  constructor(@Inject(ENV) env: Env) {
    this.pool = env.PLATFORM_DATABASE_URL
      ? new Pool({
          connectionString: env.PLATFORM_DATABASE_URL,
          max: 5,
          statement_timeout: 15_000,
          idle_in_transaction_session_timeout: 15_000,
        })
      : null;
    this.database = this.pool ? drizzle(this.pool, { schema }) : null;
  }

  get enabled(): boolean {
    return this.database !== null;
  }

  get db(): Db {
    if (!this.database) throw new NotFoundException();
    return this.database;
  }

  tx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(fn);
  }

  /** الشغل على حساب مدير شركة: بنختم المعاملة بختم الشركة دي بس */
  async stampTenant(tx: Tx, tenantId: string): Promise<void> {
    await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool?.end();
  }
}
