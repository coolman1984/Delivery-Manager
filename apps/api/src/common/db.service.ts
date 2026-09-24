import { Inject, Injectable, OnModuleDestroy } from '@nestjs/common';
import { sql } from 'drizzle-orm';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import { ENV, Env } from '../config/env';
import * as schema from '../db/schema';

export type Db = NodePgDatabase<typeof schema>;
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0];

/**
 * بوابة قاعدة البيانات. أي شغل على بيانات شركة لازم يعدّي من withTenant:
 * بتفتح معاملة وتختمها بختم الشركة، وقاعدة البيانات نفسها بتخفي أي صف مش بتاعها.
 * لو المبرمج نسي الختم، الاستعلام بيرجع فاضي بدل ما يسرّب بيانات.
 */
@Injectable()
export class DbService implements OnModuleDestroy {
  readonly pool: Pool;
  readonly db: Db;

  constructor(@Inject(ENV) env: Env) {
    this.pool = new Pool({
      connectionString: env.DATABASE_URL,
      max: 20,
      statement_timeout: 10_000,
      idle_in_transaction_session_timeout: 15_000,
    });
    this.db = drizzle(this.pool, { schema });
  }

  withTenant<T>(tenantId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select set_config('app.tenant_id', ${tenantId}, true)`);
      return fn(tx);
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
