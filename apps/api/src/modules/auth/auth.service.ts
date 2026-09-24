import type { Role } from '@dm/shared';
import type { ChangePasswordInput, LoginInput, OtpVerifyInput } from '@dm/shared/schemas';
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { and, eq, isNull } from 'drizzle-orm';
import { randomInt, randomUUID } from 'node:crypto';
import { AuditService } from '../../common/audit.service';
import type { RequestMeta, TenantInfo } from '../../common/auth-context';
import { CryptoService } from '../../common/crypto.service';
import { DbService, Tx } from '../../common/db.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { RedisService } from '../../common/redis.service';
import { ENV, type Env } from '../../config/env';
import { refreshTokens, users } from '../../db/schema';
import { SMS_PROVIDER, type SmsProvider } from './sms.provider';

const OTP_TTL_SECONDS = 300;
const OTP_MAX_ATTEMPTS = 5;
const LOGIN_MAX_FAILURES = 5;
const LOCK_MINUTES = 15;

/** معايير argon2id الموصى بيها عالمياً لتشفير كلمات السر */
export const ARGON2_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

export interface SessionUser {
  id: string;
  name: string;
  phone: string;
  role: Role;
  storeId: string | null;
}

export interface IssuedSession {
  accessToken: string;
  refreshToken: string;
  refreshExpiresAt: Date;
  user: SessionUser;
}

type UserRow = typeof users.$inferSelect;

@Injectable()
export class AuthService {
  private dummyHash: Promise<string>;

  constructor(
    private readonly dbs: DbService,
    private readonly redis: RedisService,
    private readonly limiter: RateLimitService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly jwt: JwtService,
    @Inject(ENV) private readonly env: Env,
    @Inject(SMS_PROVIDER) private readonly sms: SmsProvider,
  ) {
    // بنستخدمه عشان وقت الرد يبقى واحد سواء الرقم متسجل أو لأ (منع تخمين الأرقام المسجلة)
    this.dummyHash = argon2.hash(this.crypto.randomToken(), ARGON2_OPTIONS);
  }

  // ———— دخول العملاء بكود على الموبايل ————

  async requestOtp(
    tenant: TenantInfo,
    phone: string,
    meta: RequestMeta,
  ): Promise<{ sent: true; devCode?: string }> {
    await this.limiter.hit(`otp-req:ip:${meta.ip}`, 10, 3600);
    await this.limiter.hit(`otp-req:phone:${tenant.id}:${phone}`, 3, 900);

    const existing = await this.dbs.withTenant(tenant.id, (tx) => this.findByPhone(tx, phone));
    if (existing && existing.role !== 'customer') {
      throw new BadRequestException('الحساب ده بيدخل بكلمة السر');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.client.set(
      this.otpKey(tenant.id, phone),
      JSON.stringify({ h: this.crypto.hmac(`${tenant.id}:${phone}:${code}`), a: 0 }),
      'EX',
      OTP_TTL_SECONDS,
    );
    await this.sms.send(phone, `كود الدخول لـ ${tenant.name}: ${code}\nماتدّيش الكود ده لأي حد.`);

    const exposeCode = this.env.NODE_ENV !== 'production' && this.env.SMS_PROVIDER === 'console';
    return exposeCode ? { sent: true, devCode: code } : { sent: true };
  }

  async verifyOtp(
    tenant: TenantInfo,
    input: OtpVerifyInput,
    meta: RequestMeta,
  ): Promise<IssuedSession> {
    await this.limiter.hit(`otp-verify:ip:${meta.ip}`, 30, 900);
    const key = this.otpKey(tenant.id, input.phone);
    const raw = await this.redis.client.get(key);
    if (!raw) throw new BadRequestException('الكود انتهى أو مش موجود، اطلب كود جديد');

    const stored = JSON.parse(raw) as { h: string; a: number };
    if (stored.a >= OTP_MAX_ATTEMPTS) {
      await this.redis.client.del(key);
      throw new BadRequestException('محاولات كتير، اطلب كود جديد');
    }
    stored.a += 1;
    await this.redis.client.set(key, JSON.stringify(stored), 'KEEPTTL');

    const expected = this.crypto.hmac(`${tenant.id}:${input.phone}:${input.code}`);
    if (!this.crypto.safeEqual(expected, stored.h)) {
      throw new BadRequestException('الكود غلط');
    }

    const session = await this.dbs.withTenant(tenant.id, async (tx) => {
      let user = await this.findByPhone(tx, input.phone);
      if (user && user.role !== 'customer')
        throw new BadRequestException('الحساب ده بيدخل بكلمة السر');
      if (user && !user.isActive) throw new ForbiddenException('الحساب ده موقوف');

      if (!user) {
        if (!input.name) {
          throw new BadRequestException({
            statusCode: 400,
            message: 'اكتب اسمك',
            code: 'NAME_REQUIRED',
          });
        }
        [user] = await tx
          .insert(users)
          .values({
            tenantId: tenant.id,
            phone: input.phone,
            name: input.name,
            role: 'customer',
            phoneVerifiedAt: new Date(),
          })
          .returning();
        await this.audit.log(tx, {
          tenantId: tenant.id,
          actorId: user!.id,
          actorRole: 'customer',
          ...meta,
          action: 'auth.register',
          entityType: 'user',
          entityId: user!.id,
        });
      }
      await this.audit.log(tx, {
        tenantId: tenant.id,
        actorId: user!.id,
        actorRole: 'customer',
        ...meta,
        action: 'auth.login_otp',
        entityType: 'user',
        entityId: user!.id,
      });
      return this.issueSession(tx, user!, meta);
    });

    await this.redis.client.del(key);
    return session;
  }

  // ———— دخول الموظفين بكلمة سر ————

  async login(tenant: TenantInfo, input: LoginInput, meta: RequestMeta): Promise<IssuedSession> {
    await this.limiter.hit(`login:ip:${meta.ip}`, 30, 900);
    await this.limiter.hit(`login:phone:${tenant.id}:${input.phone}`, 10, 900);

    const genericError = 'رقم الموبايل أو كلمة السر غلط';
    const outcome = await this.dbs.withTenant(tenant.id, async (tx) => {
      const user = await this.findByPhone(tx, input.phone);
      const auditBase = { tenantId: tenant.id, ...meta, entityType: 'user' };

      if (!user || !user.passwordHash || user.role === 'customer') {
        await argon2.verify(await this.dummyHash, input.password);
        await this.audit.log(tx, {
          ...auditBase,
          action: 'auth.login_failed',
          meta: { reason: 'unknown_user' },
        });
        return { error: genericError } as const;
      }
      if (user.lockedUntil && user.lockedUntil > new Date()) {
        await this.audit.log(tx, {
          ...auditBase,
          entityId: user.id,
          action: 'auth.login_blocked_locked',
        });
        return {
          error: `الحساب مقفول مؤقتاً بسبب محاولات غلط كتير. جرّب بعد ${LOCK_MINUTES} دقيقة`,
        } as const;
      }
      const ok = await argon2.verify(user.passwordHash, input.password);
      if (!ok) {
        const failures = user.failedLoginCount + 1;
        const lock = failures >= LOGIN_MAX_FAILURES;
        await tx
          .update(users)
          .set({
            failedLoginCount: lock ? 0 : failures,
            lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
          })
          .where(eq(users.id, user.id));
        await this.audit.log(tx, {
          ...auditBase,
          entityId: user.id,
          action: lock ? 'auth.account_locked' : 'auth.login_failed',
          meta: { failures },
        });
        return { error: genericError } as const;
      }
      if (!user.isActive) {
        await this.audit.log(tx, {
          ...auditBase,
          entityId: user.id,
          action: 'auth.login_blocked_inactive',
        });
        return { error: 'الحساب ده موقوف' } as const;
      }
      await tx
        .update(users)
        .set({ failedLoginCount: 0, lockedUntil: null })
        .where(eq(users.id, user.id));
      await this.audit.log(tx, {
        ...auditBase,
        actorId: user.id,
        actorRole: user.role,
        entityId: user.id,
        action: 'auth.login',
      });
      return { session: await this.issueSession(tx, user, meta) } as const;
    });

    if ('error' in outcome) throw new UnauthorizedException(outcome.error);
    await this.limiter.reset(`login:phone:${tenant.id}:${input.phone}`);
    return outcome.session;
  }

  // ———— تجديد الجلسة ————

  async refresh(rawToken: string | undefined, meta: RequestMeta): Promise<IssuedSession> {
    const tenantId = this.tenantFromRefresh(rawToken);
    await this.limiter.hit(`refresh:ip:${meta.ip}`, 60, 900);

    const outcome = await this.dbs.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select()
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, this.crypto.sha256(rawToken!)))
        .limit(1);
      if (!row) return { error: true } as const;

      if (row.revokedAt) {
        // توكن اتستخدم قبل كده = غالباً اتسرق. نقفل كل جلسات العيلة دي فوراً
        await this.revokeFamily(tx, row.familyId);
        await this.audit.log(tx, {
          tenantId,
          actorId: row.userId,
          ...meta,
          action: 'auth.refresh_reuse_detected',
          entityType: 'user',
          entityId: row.userId,
        });
        return { error: true } as const;
      }
      if (row.expiresAt < new Date()) return { error: true } as const;

      const [user] = await tx.select().from(users).where(eq(users.id, row.userId)).limit(1);
      if (!user || !user.isActive) {
        await this.revokeFamily(tx, row.familyId);
        return { error: true } as const;
      }
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(eq(refreshTokens.id, row.id));
      return { session: await this.issueSession(tx, user, meta, row.familyId) } as const;
    });

    if ('error' in outcome) throw new UnauthorizedException('انتهت الجلسة، سجل دخول تاني');
    return outcome.session;
  }

  async logout(rawToken: string | undefined): Promise<void> {
    let tenantId: string;
    try {
      tenantId = this.tenantFromRefresh(rawToken);
    } catch {
      return;
    }
    await this.dbs.withTenant(tenantId, async (tx) => {
      const [row] = await tx
        .select({ familyId: refreshTokens.familyId })
        .from(refreshTokens)
        .where(eq(refreshTokens.tokenHash, this.crypto.sha256(rawToken!)))
        .limit(1);
      if (row) await this.revokeFamily(tx, row.familyId);
    });
  }

  async changePassword(
    tenantId: string,
    userId: string,
    input: ChangePasswordInput,
    meta: RequestMeta,
  ): Promise<void> {
    await this.limiter.hit(`change-pw:${userId}`, 5, 900);
    const newHash = await argon2.hash(input.newPassword, ARGON2_OPTIONS);
    const ok = await this.dbs.withTenant(tenantId, async (tx) => {
      const [user] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      if (!user?.passwordHash || !(await argon2.verify(user.passwordHash, input.currentPassword))) {
        await this.audit.log(tx, {
          tenantId,
          actorId: userId,
          ...meta,
          action: 'auth.password_change_failed',
          entityType: 'user',
          entityId: userId,
        });
        return false;
      }
      await tx
        .update(users)
        .set({ passwordHash: newHash, updatedAt: new Date() })
        .where(eq(users.id, userId));
      // خروج من كل الأجهزة التانية
      await tx
        .update(refreshTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(refreshTokens.userId, userId), isNull(refreshTokens.revokedAt)));
      await this.audit.log(tx, {
        tenantId,
        actorId: userId,
        actorRole: user.role,
        ...meta,
        action: 'auth.password_changed',
        entityType: 'user',
        entityId: userId,
      });
      return true;
    });
    if (!ok) throw new BadRequestException('كلمة السر الحالية غلط');
  }

  async me(tenantId: string, userId: string): Promise<SessionUser> {
    const user = await this.dbs.withTenant(tenantId, async (tx) => {
      const [row] = await tx.select().from(users).where(eq(users.id, userId)).limit(1);
      return row;
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    return this.toSessionUser(user);
  }

  // ———— أدوات داخلية ————

  private async issueSession(
    tx: Tx,
    user: UserRow,
    meta: RequestMeta,
    familyId?: string,
  ): Promise<IssuedSession> {
    const accessToken = await this.jwt.signAsync(
      { sub: user.id, tid: user.tenantId, role: user.role, sid: user.storeId },
      { algorithm: 'HS256', expiresIn: this.env.ACCESS_TOKEN_TTL_SECONDS },
    );
    const refreshToken = `${user.tenantId}.${this.crypto.randomToken(32)}`;
    const refreshExpiresAt = new Date(Date.now() + this.env.REFRESH_TOKEN_TTL_DAYS * 86_400_000);
    await tx.insert(refreshTokens).values({
      tenantId: user.tenantId,
      userId: user.id,
      tokenHash: this.crypto.sha256(refreshToken),
      familyId: familyId ?? randomUUID(),
      expiresAt: refreshExpiresAt,
      ip: meta.ip,
      userAgent: meta.userAgent,
    });
    return { accessToken, refreshToken, refreshExpiresAt, user: this.toSessionUser(user) };
  }

  private async revokeFamily(tx: Tx, familyId: string): Promise<void> {
    await tx
      .update(refreshTokens)
      .set({ revokedAt: new Date() })
      .where(and(eq(refreshTokens.familyId, familyId), isNull(refreshTokens.revokedAt)));
  }

  private tenantFromRefresh(rawToken: string | undefined): string {
    const tenantId = rawToken?.split('.')[0];
    if (!rawToken || rawToken.length > 200 || !tenantId || !/^[0-9a-f-]{36}$/.test(tenantId)) {
      throw new UnauthorizedException('انتهت الجلسة، سجل دخول تاني');
    }
    return tenantId;
  }

  private async findByPhone(tx: Tx, phone: string): Promise<UserRow | undefined> {
    const [row] = await tx.select().from(users).where(eq(users.phone, phone)).limit(1);
    return row;
  }

  private otpKey(tenantId: string, phone: string): string {
    return `otp:${tenantId}:${phone}`;
  }

  private toSessionUser(u: UserRow): SessionUser {
    return { id: u.id, name: u.name, phone: u.phone, role: u.role, storeId: u.storeId };
  }
}
