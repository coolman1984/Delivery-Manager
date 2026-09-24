import type {
  PlanCreateInput,
  PlanUpdateInput,
  PlatformTenantCreateInput,
  PlatformTenantUpdateInput,
  SubscriptionPaymentInput,
} from '@dm/shared/schemas';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  OnApplicationBootstrap,
  OnModuleDestroy,
} from '@nestjs/common';
import * as argon2 from 'argon2';
import { and, asc, desc, eq, isNull, lt, sql } from 'drizzle-orm';
import { ENV, type Env } from '../../config/env';
import { CryptoService } from '../../common/crypto.service';
import type { Tx } from '../../common/db.service';
import { TenantsService } from '../../common/tenants.service';
import {
  plans,
  platformAdmins,
  platformAuditLogs,
  refreshTokens,
  subscriptionPayments,
  tenants,
  users,
} from '../../db/schema';
import { ARGON2_OPTIONS } from '../auth/auth.service';
import type { PlatformActor } from './platform-context';
import { PlatformDbService } from './platform-db.service';

/** سبب الإيقاف التلقائي: لما الشركة تدفع، بترجع تشتغل لوحدها */
export const OVERDUE_REASON = 'انتهى الاشتراك ومادفعش';
const SWEEP_EVERY_MS = 10 * 60_000;
const DAY_MS = 86_400_000;

type TenantStats = {
  tenant_id: string;
  orders_30d: string;
  delivered_30d: string;
  gmv_30d: string;
  stores: string;
  drivers: string;
  customers: string;
  last_order_at: Date | null;
};

export function addMonths(from: Date, months: number): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/**
 * لوحة مالك المنصة: الشركات المشتركة، والباقات، والمدفوعات، وإيقاف المتأخرين.
 * كل عملية بتتسجل في سجل عمليات المنصة (مين عمل إيه وإمتى).
 */
@Injectable()
export class PlatformService implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger('Platform');
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly pdb: PlatformDbService,
    private readonly crypto: CryptoService,
    private readonly tenantsCache: TenantsService,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.pdb.enabled || this.env.NODE_ENV === 'test') return;
    const run = () =>
      this.suspendOverdue().catch((err: unknown) =>
        this.logger.error(`فشل فحص المتأخرين: ${String(err)}`),
      );
    void run();
    this.timer = setInterval(run, SWEEP_EVERY_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ———— نظرة عامة ————
  async overview() {
    const list = await this.listTenants();
    const now = Date.now();
    const active = list.filter((t) => t.status === 'active');
    const [collected] = await this.pdb.db
      .select({ total: sql<number>`coalesce(sum(${subscriptionPayments.amount}), 0)::int` })
      .from(subscriptionPayments)
      .where(
        sql`${subscriptionPayments.createdAt} >= date_trunc('month', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo'`,
      );
    return {
      tenants: list.length,
      active: active.length,
      suspended: list.length - active.length,
      monthlyRecurring: active.reduce((s, t) => s + (t.plan?.monthlyPrice ?? 0), 0),
      collectedThisMonth: collected?.total ?? 0,
      orders30d: list.reduce((s, t) => s + t.stats.orders30d, 0),
      gmv30d: list.reduce((s, t) => s + t.stats.gmv30d, 0),
      overdue: list.filter((t) => t.paidUntil && t.paidUntil.getTime() < now),
      expiringSoon: list.filter(
        (t) =>
          t.paidUntil && t.paidUntil.getTime() >= now && t.paidUntil.getTime() < now + 7 * DAY_MS,
      ),
    };
  }

  // ———— الشركات ————
  async listTenants() {
    const rows = await this.pdb.db
      .select({ tenant: tenants, plan: plans })
      .from(tenants)
      .leftJoin(plans, eq(plans.id, tenants.planId))
      .orderBy(asc(tenants.createdAt));
    const stats = await this.pdb.db.execute<TenantStats>(
      sql`select * from platform_tenant_stats()`,
    );
    const byId = new Map(stats.rows.map((r) => [r.tenant_id, r]));
    return rows.map(({ tenant, plan }) => {
      const s = byId.get(tenant.id);
      return {
        ...tenant,
        plan: plan
          ? {
              id: plan.id,
              name: plan.name,
              monthlyPrice: plan.monthlyPrice,
              maxStores: plan.maxStores,
              maxDrivers: plan.maxDrivers,
            }
          : null,
        stats: {
          orders30d: Number(s?.orders_30d ?? 0),
          delivered30d: Number(s?.delivered_30d ?? 0),
          gmv30d: Number(s?.gmv_30d ?? 0),
          stores: Number(s?.stores ?? 0),
          drivers: Number(s?.drivers ?? 0),
          customers: Number(s?.customers ?? 0),
          lastOrderAt: s?.last_order_at ?? null,
        },
      };
    });
  }

  async getTenant(id: string) {
    const tenant = (await this.listTenants()).find((t) => t.id === id);
    if (!tenant) throw new NotFoundException('الشركة مش موجودة');
    const payments = await this.pdb.db
      .select()
      .from(subscriptionPayments)
      .where(eq(subscriptionPayments.tenantId, id))
      .orderBy(desc(subscriptionPayments.createdAt))
      .limit(100);
    const admins = await this.pdb.tx(async (tx) => {
      await this.pdb.stampTenant(tx, id);
      return tx
        .select({ id: users.id, name: users.name, phone: users.phone, createdAt: users.createdAt })
        .from(users)
        .where(eq(users.role, 'admin'))
        .orderBy(asc(users.createdAt));
    });
    return { ...tenant, payments, admins };
  }

  /** شركة جديدة بضغطة زرار: الشركة + مديرها بكلمة سر عشوائية تظهر مرة واحدة بس */
  async createTenant(input: PlatformTenantCreateInput, actor: PlatformActor) {
    const password = this.crypto.randomToken(9);
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    try {
      const tenant = await this.pdb.tx(async (tx) => {
        await this.activePlan(tx, input.planId);
        const [row] = await tx
          .insert(tenants)
          .values({
            slug: input.slug,
            name: input.name,
            governorate: input.governorate,
            planId: input.planId,
            paidUntil: new Date(Date.now() + input.trialDays * DAY_MS),
            contactName: input.adminName,
            contactPhone: input.contactPhone ?? input.adminPhone,
          })
          .returning();
        await this.pdb.stampTenant(tx, row!.id);
        await tx.insert(users).values({
          tenantId: row!.id,
          phone: input.adminPhone,
          name: input.adminName,
          role: 'admin',
          passwordHash,
          phoneVerifiedAt: new Date(),
        });
        await this.log(tx, actor, 'tenant.created', row!.id, {
          slug: input.slug,
          planId: input.planId,
          trialDays: input.trialDays,
        });
        return row!;
      });
      return { tenant, admin: { phone: input.adminPhone, password } };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw new ConflictException('الاسم المختصر ده مستخدم لشركة تانية');
      }
      throw err;
    }
  }

  async updateTenant(id: string, input: PlatformTenantUpdateInput, actor: PlatformActor) {
    return this.pdb.tx(async (tx) => {
      if (input.planId) await this.activePlan(tx, input.planId);
      const [row] = await tx.update(tenants).set(input).where(eq(tenants.id, id)).returning();
      if (!row) throw new NotFoundException('الشركة مش موجودة');
      await this.log(tx, actor, 'tenant.updated', id, { fields: Object.keys(input) });
      this.tenantsCache.forget();
      return row;
    });
  }

  async setStatus(id: string, active: boolean, reason: string | null, actor: PlatformActor) {
    return this.pdb.tx(async (tx) => {
      const [row] = await tx
        .update(tenants)
        .set({ status: active ? 'active' : 'suspended', suspendedReason: active ? null : reason })
        .where(eq(tenants.id, id))
        .returning();
      if (!row) throw new NotFoundException('الشركة مش موجودة');
      await this.log(
        tx,
        actor,
        active ? 'tenant.activated' : 'tenant.suspended',
        id,
        reason ? { reason } : undefined,
      );
      this.tenantsCache.forget();
      return row;
    });
  }

  /** تسجيل دفعة اشتراك: بتمد الاشتراك من آخر يوم مدفوع (أو من النهارده لو كان خلصان) */
  async recordPayment(id: string, input: SubscriptionPaymentInput, actor: PlatformActor) {
    return this.pdb.tx(async (tx) => {
      const [row] = await tx
        .select({ tenant: tenants, plan: plans })
        .from(tenants)
        .leftJoin(plans, eq(plans.id, tenants.planId))
        .where(eq(tenants.id, id))
        .for('update', { of: tenants })
        .limit(1);
      if (!row) throw new NotFoundException('الشركة مش موجودة');
      const amount = input.amount ?? (row.plan?.monthlyPrice ?? 0) * input.months;
      const now = new Date();
      const from = row.tenant.paidUntil && row.tenant.paidUntil > now ? row.tenant.paidUntil : now;
      const to = addMonths(from, input.months);
      const [payment] = await tx
        .insert(subscriptionPayments)
        .values({
          tenantId: id,
          amount,
          months: input.months,
          periodFrom: from,
          periodTo: to,
          note: input.note ?? null,
          createdBy: actor.id,
        })
        .returning();
      const reactivate =
        row.tenant.status === 'suspended' && row.tenant.suspendedReason === OVERDUE_REASON;
      await tx
        .update(tenants)
        .set({
          paidUntil: to,
          ...(reactivate ? { status: 'active' as const, suspendedReason: null } : {}),
        })
        .where(eq(tenants.id, id));
      await this.log(tx, actor, 'subscription.payment', id, {
        amount,
        months: input.months,
        paidUntil: to,
        reactivate,
      });
      if (reactivate) this.tenantsCache.forget();
      return { payment: payment!, paidUntil: to, reactivated: reactivate };
    });
  }

  /** مدير الشركة نسي كلمة السر: كلمة سر جديدة تظهر مرة واحدة، وخروجه من كل الأجهزة */
  async resetAdminPassword(tenantId: string, userId: string, actor: PlatformActor) {
    const password = this.crypto.randomToken(9);
    const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
    return this.pdb.tx(async (tx) => {
      await this.pdb.stampTenant(tx, tenantId);
      const [admin] = await tx
        .select({ id: users.id, phone: users.phone })
        .from(users)
        .where(and(eq(users.id, userId), eq(users.role, 'admin')))
        .limit(1);
      if (!admin) throw new NotFoundException('المدير مش موجود');
      await tx
        .update(users)
        .set({ passwordHash, failedLoginCount: 0, lockedUntil: null, updatedAt: new Date() })
        .where(eq(users.id, admin.id));
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, admin.id), isNull(refreshTokens.revokedAt)));
      await this.log(tx, actor, 'tenant.admin_password_reset', tenantId, { userId: admin.id });
      return { phone: admin.phone, password };
    });
  }

  /** إيقاف الشركات اللي اشتراكها خلص وعدّت أيام السماح (بيشتغل لوحده كل ١٠ دقايق) */
  async suspendOverdue(): Promise<string[]> {
    const cutoff = new Date(Date.now() - this.env.SUBSCRIPTION_GRACE_DAYS * DAY_MS);
    const ids = await this.pdb.tx(async (tx) => {
      const rows = await tx
        .update(tenants)
        .set({ status: 'suspended', suspendedReason: OVERDUE_REASON })
        .where(and(eq(tenants.status, 'active'), lt(tenants.paidUntil, cutoff)))
        .returning({ id: tenants.id, slug: tenants.slug, paidUntil: tenants.paidUntil });
      for (const r of rows) {
        await tx.insert(platformAuditLogs).values({
          action: 'tenant.auto_suspended',
          targetTenantId: r.id,
          meta: { paidUntil: r.paidUntil },
        });
      }
      return rows.map((r) => r.slug);
    });
    if (ids.length) {
      this.tenantsCache.forget();
      this.logger.warn(`اتوقفت شركات اشتراكها خلص: ${ids.join(', ')}`);
    }
    return ids;
  }

  // ———— الباقات ————
  listPlans() {
    return this.pdb.db.select().from(plans).orderBy(asc(plans.monthlyPrice));
  }

  async createPlan(input: PlanCreateInput, actor: PlatformActor) {
    try {
      return await this.pdb.tx(async (tx) => {
        const [row] = await tx.insert(plans).values(input).returning();
        await this.log(tx, actor, 'plan.created', null, { planId: row!.id, ...input });
        return row!;
      });
    } catch (err) {
      if ((err as { code?: string }).code === '23505')
        throw new ConflictException('فيه باقة بنفس الاسم');
      throw err;
    }
  }

  async updatePlan(id: string, input: PlanUpdateInput, actor: PlatformActor) {
    return this.pdb.tx(async (tx) => {
      const [row] = await tx.update(plans).set(input).where(eq(plans.id, id)).returning();
      if (!row) throw new NotFoundException('الباقة مش موجودة');
      await this.log(tx, actor, 'plan.updated', null, { planId: id, ...input });
      return row;
    });
  }

  // ———— السجل ————
  auditLogs(limit: number) {
    return this.pdb.db
      .select({
        id: platformAuditLogs.id,
        action: platformAuditLogs.action,
        targetTenantId: platformAuditLogs.targetTenantId,
        tenantName: tenants.name,
        adminName: platformAdmins.name,
        ip: platformAuditLogs.ip,
        meta: platformAuditLogs.meta,
        createdAt: platformAuditLogs.createdAt,
      })
      .from(platformAuditLogs)
      .leftJoin(tenants, eq(tenants.id, platformAuditLogs.targetTenantId))
      .leftJoin(platformAdmins, eq(platformAdmins.id, platformAuditLogs.adminId))
      .orderBy(desc(platformAuditLogs.createdAt))
      .limit(limit);
  }

  private async activePlan(tx: Tx, planId: string): Promise<void> {
    const [plan] = await tx
      .select({ isActive: plans.isActive })
      .from(plans)
      .where(eq(plans.id, planId))
      .limit(1);
    if (!plan?.isActive) throw new BadRequestException('الباقة مش موجودة أو موقوفة');
  }

  private async log(
    tx: Tx,
    actor: PlatformActor,
    action: string,
    targetTenantId: string | null,
    meta?: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(platformAuditLogs).values({
      adminId: actor.id,
      action,
      targetTenantId,
      ip: actor.ip,
      userAgent: actor.userAgent,
      meta: meta ?? null,
    });
  }
}
