import { Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { tenants } from '../db/schema';
import { TenantInfo } from './auth-context';
import { DbService } from './db.service';

const CACHE_MS = 30_000;

export type TenantLookup = TenantInfo & { active: boolean };

/** معرفة الشركة من اسمها المختصر، مع ذاكرة قصيرة عشان مانسألش القاعدة كل طلب */
@Injectable()
export class TenantsService {
  private readonly cache = new Map<string, { value: TenantLookup | null; at: number }>();

  constructor(private readonly dbs: DbService) {}

  findBySlug(slug: string): Promise<TenantLookup | null> {
    if (!/^[a-z0-9-]{2,40}$/.test(slug)) return Promise.resolve(null);
    return this.cached(`s:${slug}`, () => this.load(eq(tenants.slug, slug)));
  }

  findById(id: string): Promise<TenantLookup | null> {
    return this.cached(`i:${id}`, () => this.load(eq(tenants.id, id)));
  }

  /** بعد إيقاف أو تشغيل شركة: ننسى اللي فاكرينه عنها فوراً */
  forget(): void {
    this.cache.clear();
  }

  private async cached(
    key: string,
    loader: () => Promise<TenantLookup | null>,
  ): Promise<TenantLookup | null> {
    const hit = this.cache.get(key);
    if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;
    const value = await loader();
    this.cache.set(key, { value, at: Date.now() });
    return value;
  }

  private async load(where: ReturnType<typeof eq>): Promise<TenantLookup | null> {
    const [row] = await this.dbs.db
      .select({
        id: tenants.id,
        slug: tenants.slug,
        name: tenants.name,
        governorate: tenants.governorate,
        status: tenants.status,
      })
      .from(tenants)
      .where(where)
      .limit(1);
    if (!row) return null;
    const { status, ...info } = row;
    return { ...info, active: status === 'active' };
  }
}
