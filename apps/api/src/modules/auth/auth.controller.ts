import {
  loginSchema,
  otpRequestSchema,
  otpVerifySchema,
  ROLES,
  type LoginInput,
  type OtpRequestInput,
  type OtpVerifyInput,
} from '@dm/shared';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  HttpCode,
  Inject,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import type { AppRequest, AuthUser, RequestMeta, TenantInfo } from '../../common/auth-context';
import { CurrentTenant, CurrentUser, Meta, Public, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ENV, Env } from '../../config/env';
import { AuthService, IssuedSession } from './auth.service';

const REFRESH_COOKIE = 'dm_rt';
const COOKIE_PATH = '/api/v1/auth';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Public()
  @Get('tenant')
  tenant(@CurrentTenant() tenant: TenantInfo) {
    return { name: tenant.name, slug: tenant.slug, governorate: tenant.governorate };
  }

  @Public()
  @Post('otp/request')
  @HttpCode(200)
  requestOtp(
    @CurrentTenant() tenant: TenantInfo,
    @Body(new ZodPipe(otpRequestSchema)) body: OtpRequestInput,
    @Meta() meta: RequestMeta,
  ) {
    return this.auth.requestOtp(tenant, body.phone, meta);
  }

  @Public()
  @Post('otp/verify')
  @HttpCode(200)
  async verifyOtp(
    @CurrentTenant() tenant: TenantInfo,
    @Body(new ZodPipe(otpVerifySchema)) body: OtpVerifyInput,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.verifyOtp(tenant, body, meta));
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(
    @CurrentTenant() tenant: TenantInfo,
    @Body(new ZodPipe(loginSchema)) body: LoginInput,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.respond(res, await this.auth.login(tenant, body, meta));
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  async refresh(
    @Req() req: AppRequest,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.assertCsrfHeader(req);
    return this.respond(res, await this.auth.refresh(this.readCookie(req), meta));
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: AppRequest, @Res({ passthrough: true }) res: Response): Promise<void> {
    this.assertCsrfHeader(req);
    await this.auth.logout(this.readCookie(req));
    res.clearCookie(REFRESH_COOKIE, { path: COOKIE_PATH });
  }

  @Get('me')
  @Roles(...ROLES)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user.tenantId, user.userId);
  }

  /** التوكن الطويل بيتحفظ في كوكي مقفولة: الجافاسكريبت مايقدرش يقراها، فمايتسرقش بثغرات الصفحات */
  private respond(res: Response, session: IssuedSession) {
    res.cookie(REFRESH_COOKIE, session.refreshToken, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: COOKIE_PATH,
      expires: session.refreshExpiresAt,
    });
    return { accessToken: session.accessToken, user: session.user };
  }

  private readCookie(req: AppRequest): string | undefined {
    const value: unknown = req.cookies?.[REFRESH_COOKIE];
    return typeof value === 'string' ? value : undefined;
  }

  /** حماية من تزوير الطلبات من مواقع تانية: المتصفح مش بيسمح لموقع غريب يبعت الهيدر ده */
  private assertCsrfHeader(req: AppRequest): void {
    if (req.get('x-requested-with') !== 'dm') throw new ForbiddenException();
  }
}
