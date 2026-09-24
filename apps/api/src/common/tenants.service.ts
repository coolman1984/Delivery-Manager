import { Injectable } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { tenants } from '../db/schema';
import { TenantInfo } from './auth-context';
import { DbService } from './db.service';

const CACHE_MS = 30_000;

/** معرفة الشركة من اسمها المختصر، مع ذاكرة قصيرة عشان مانسألش القاعدة كل طلب */
@Injectable()
export class TenantsService {
  private readonly cache = new Map<string, { value: TenantInfo | null; at: number }>();

  constructor(private readonly dbs: DbService) {}

  findBySlug(slug: string): Promise<TenantInfo | null> {
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return Promise.resolve(null);
    return this.cached(`s:${slug}`, () => this.load(eq(tenants.slug, slug)));
  }

  findById(id: string): Promise<TenantInfo | null> {
    return this.cached(`i:${id}`, () => this.load(eq(tenants.id, id)));
  }

  private async cached(
    key: string,
    loader: () => Promise<TenantInfo | null>,
  ): Promise<TenantInfo | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await loader();
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  private async load(where: ReturnType<typeof eq>): Promise<TenantInfo | null> {
    const [row] = await this.dbs.db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        governorate: tenants.governorate,
      })
      .from(tenants)
      .where(and(where, eq(tenants.status, 'active')))
      .limit(1);
    return row ?? null;
  }
}
