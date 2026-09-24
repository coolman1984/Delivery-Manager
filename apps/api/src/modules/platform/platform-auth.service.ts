import type { PlatformEnrollInput, PlatformLoginInput } from '@dm/shared/schemas';
import { Inject, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { eq } from 'drizzle-orm';
import { createHmac } from 'node:crypto';
import { ENV, type Env } from '../../config/env';
import type { RequestMeta } from '../../common/auth-context';
import { CryptoService } from '../../common/crypto.service';
import type { Tx } from '../../common/db.service';
import { RateLimitService } from '../../common/rate-limit.service';
import { RedisService } from '../../common/redis.service';
import { generateTotpSecret, totpUri, verifyTotp } from '../../common/totp';
import { platformAdmins, platformAuditLogs } from '../../db/schema';
import { ARGON2_OPTIONS } from '../auth/auth.service';
import type { PlatformAdmin } from './platform-context';
import { PlatformDbService } from './platform-db.service';

const MAX_FAILURES = 5;
const LOCK_MINUTES = 30;
export const SESSION_HOURS = 8;
const GENERIC = 'الإيميل أو كلمة السر أو الكود غلط';

type AdminRow = typeof platformAdmins.$inferSelect;

export type LoginResult =
  | { status: 'ok'; token: string; admin: PlatformAdmin }
  | { status: 'code_required' }
  | { status: 'enroll'; enrollToken: string; secret: string; uri: string };

interface SessionPayload {
  sub: string;
  ver: number;
}

/**
 * دخول مالك المنصة: إيميل + كلمة سر + كود من تطبيق على الموبايل (إجباري).
 * أول دخول: السيرفر بيدي سر جديد يتسجل في تطبيق الموبايل، ومايتفعّلش غير لما يتكتب كود صح منه.
 * الجلسة في كوكي مقفولة، ومفتاح توقيعها غير مفتاح جلسات الشركات.
 */
@Injectable()
export class PlatformAuthService {
  private readonly jwt: JwtService;
  private readonly dummyHash: Promise<string>;

  constructor(
    @Inject(ENV) env: Env,
    private readonly pdb: PlatformDbService,
    private readonly crypto: CryptoService,
    private readonly limiter: RateLimitService,
    private readonly redis: RedisService,
  ) {
    const secret = createHmac('sha256', env.JWT_ACCESS_SECRET)
      .update('platform-session-v1')
      .digest('hex');
    this.jwt = new JwtService({
      secret,
      signOptions: { algorithm: 'HS256', issuer: 'dm-platform' },
    });
    this.dummyHash = argon2.hash(this.crypto.randomToken(), ARGON2_OPTIONS);
  }

  async login(input: PlatformLoginInput, meta: RequestMeta): Promise<LoginResult> {
    await this.limiter.hit(`plogin:ip:${meta.ip}`, 20, 900);
    await this.limiter.hit(`plogin:email:${input.email}`, 10, 900);

    const outcome = await this.pdb.tx(async (tx): Promise<LoginResult | { error: string }> => {
      const [admin] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.email, input.email))
        .limit(1);
      if (!admin) {
        await argon2.verify(await this.dummyHash, input.password);
        await this.log(tx, null, 'platform.login_failed', meta, { reason: 'unknown' });
        return { error: GENERIC };
      }
      if (admin.lockedUntil && admin.lockedUntil > new Date()) {
        await this.log(tx, admin.id, 'platform.login_blocked_locked', meta);
        return { error: `الحساب مقفول مؤقتاً بسبب محاولات غلط. جرّب بعد ${LOCK_MINUTES} دقيقة` };
      }
      if (!(await argon2.verify(admin.passwordHash, input.password))) {
        return this.fail(tx, admin, meta, 'password');
      }
      if (!admin.isActive) {
        await this.log(tx, admin.id, 'platform.login_blocked_inactive', meta);
        return { error: 'الحساب ده موقوف' };
      }
      // أول مرة: تسجيل تطبيق الموبايل
      if (!admin.totpSecretEnc || !admin.totpEnabledAt) {
        const secret = generateTotpSecret();
        const enrollToken = await this.jwt.signAsync(
          { sub: admin.id, ver: admin.tokenVersion, sec: this.crypto.encrypt(secret) },
          { audience: 'platform-enroll', expiresIn: '10m' },
        );
        return {
          status: 'enroll',
          enrollToken,
          secret,
          uri: totpUri(secret, admin.email, 'منصة التوصيل'),
        };
      }
      if (!input.code) return { status: 'code_required' };
      if (!(await this.checkCode(admin.id, this.crypto.decrypt(admin.totpSecretEnc), input.code))) {
        return this.fail(tx, admin, meta, 'code');
      }
      return this.success(tx, admin, meta);
    });
    if ('error' in outcome) throw new UnauthorizedException(outcome.error);
    return outcome;
  }

  async enroll(input: PlatformEnrollInput, meta: RequestMeta): Promise<LoginResult> {
    await this.limiter.hit(`penroll:ip:${meta.ip}`, 20, 900);
    let payload: { sub: string; ver: number; sec: string };
    try {
      payload = await this.jwt.verifyAsync(input.enrollToken, {
        audience: 'platform-enroll',
        issuer: 'dm-platform',
        algorithms: ['HS256'],
      });
    } catch {
      throw new UnauthorizedException('انتهت مهلة التسجيل، سجّل دخول من الأول');
    }
    const secret = this.crypto.decrypt(payload.sec);
    const outcome = await this.pdb.tx(async (tx): Promise<LoginResult | { error: string }> => {
      const [admin] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.id, payload.sub))
        .for('update')
        .limit(1);
      if (!admin || !admin.isActive || admin.tokenVersion !== payload.ver || admin.totpEnabledAt) {
        return { error: 'انتهت مهلة التسجيل، سجّل دخول من الأول' };
      }
      if (!(await this.checkCode(admin.id, secret, input.code))) {
        return this.fail(tx, admin, meta, 'enroll_code');
      }
      await tx
        .update(platformAdmins)
        .set({ totpSecretEnc: this.crypto.encrypt(secret), totpEnabledAt: new Date() })
        .where(eq(platformAdmins.id, admin.id));
      await this.log(tx, admin.id, 'platform.totp_enrolled', meta);
      return this.success(tx, admin, meta);
    });
    if ('error' in outcome) throw new UnauthorizedException(outcome.error);
    return outcome;
  }

  /** التأكد من الجلسة في كل طلب: التوقيع، والحساب لسه شغال، ومفيش خروج من كل الأجهزة بعدها */
  async verifySession(token: string): Promise<PlatformAdmin | null> {
    let payload: SessionPayload;
    try {
      payload = await this.jwt.verifyAsync<SessionPayload>(token, {
        audience: 'platform',
        issuer: 'dm-platform',
        algorithms: ['HS256'],
      });
    } catch {
      return null;
    }
    const [admin] = await this.pdb.db
      .select()
      .from(platformAdmins)
      .where(eq(platformAdmins.id, payload.sub))
      .limit(1);
    if (!admin || !admin.isActive || !admin.totpEnabledAt || admin.tokenVersion !== payload.ver)
      return null;
    return { id: admin.id, email: admin.email, name: admin.name };
  }

  /** الخروج: بيلغي كل الجلسات المفتوحة للحساب ده على كل الأجهزة */
  async logout(adminId: string, meta: RequestMeta): Promise<void> {
    await this.pdb.tx(async (tx) => {
      const [admin] = await tx
        .select()
        .from(platformAdmins)
        .where(eq(platformAdmins.id, adminId))
        .limit(1);
      if (!admin) return;
      await tx
        .update(platformAdmins)
        .set({ tokenVersion: admin.tokenVersion + 1 })
        .where(eq(platformAdmins.id, adminId));
      await this.log(tx, adminId, 'platform.logout', meta);
    });
  }

  private async checkCode(adminId: string, secret: string, code: string): Promise<boolean> {
    const step = verifyTotp(secret, code);
    if (step === null) return false;
    // نفس الكود مايتستخدمش مرتين (لو حد شافه أو اتسرق)
    const fresh = await this.redis.client.set(`totp:used:${adminId}:${step}`, '1', 'EX', 180, 'NX');
    return fresh === 'OK';
  }

  private async fail(
    tx: Tx,
    admin: AdminRow,
    meta: RequestMeta,
    reason: string,
  ): Promise<{ error: string }> {
    const failures = admin.failedLoginCount + 1;
    const lock = failures >= MAX_FAILURES;
    await tx
      .update(platformAdmins)
      .set({
        failedLoginCount: lock ? 0 : failures,
        lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : admin.lockedUntil,
      })
      .where(eq(platformAdmins.id, admin.id));
    await this.log(tx, admin.id, lock ? 'platform.account_locked' : 'platform.login_failed', meta, {
      reason,
      failures,
    });
    return { error: GENERIC };
  }

  private async success(tx: Tx, admin: AdminRow, meta: RequestMeta): Promise<LoginResult> {
    await tx
      .update(platformAdmins)
      .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
      .where(eq(platformAdmins.id, admin.id));
    await this.log(tx, admin.id, 'platform.login', meta);
    const token = await this.jwt.signAsync(
      { sub: admin.id, ver: admin.tokenVersion },
      { audience: 'platform', expiresIn: `${SESSION_HOURS}h` },
    );
    return { status: 'ok', token, admin: { id: admin.id, email: admin.email, name: admin.name } };
  }

  private async log(
    tx: Tx,
    adminId: string | null,
    action: string,
    meta: RequestMeta,
    extra?: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(platformAuditLogs).values({
      adminId,
      action,
      ip: meta.ip,
      userAgent: meta.userAgent,
      meta: extra ?? null,
    });
  }
}
