import {
  planCreateSchema,
  planUpdateSchema,
  platformEnrollSchema,
  platformLoginSchema,
  platformTenantCreateSchema,
  platformTenantUpdateSchema,
  subscriptionPaymentSchema,
  tenantSuspendSchema,
  type PlanCreateInput,
  type PlanUpdateInput,
  type PlatformEnrollInput,
  type PlatformLoginInput,
  type PlatformTenantCreateInput,
  type PlatformTenantUpdateInput,
  type SubscriptionPaymentInput,
} from '@dm/shared/schemas';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Response } from 'express';
import { z } from 'zod';
import { ENV, type Env } from '../../config/env';
import { Meta, Public } from '../../common/decorators';
import type { RequestMeta } from '../../common/auth-context';
import { ZodPipe } from '../../common/zod.pipe';
import { PlatformAuthService, SESSION_HOURS, type LoginResult } from './platform-auth.service';
import {
  CurrentPlatformActor,
  PLATFORM_COOKIE,
  PLATFORM_COOKIE_PATH,
  type PlatformActor,
  type PlatformRequest,
} from './platform-context';
import { PlatformDbService } from './platform-db.service';
import { assertPlatformRequest, PlatformGuard } from './platform.guard';
import { PlatformService } from './platform.service';

const auditQuery = z.strictObject({ limit: z.coerce.number().int().min(1).max(500).default(200) });

/** دخول وخروج مالك المنصة */
@Controller('platform/auth')
@Public()
export class PlatformAuthController {
  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly pdb: PlatformDbService,
    private readonly auth: PlatformAuthService,
  ) {}

  @Post('login')
  @HttpCode(200)
  async login(
    @Req() req: PlatformRequest,
    @Body(new ZodPipe(platformLoginSchema)) body: PlatformLoginInput,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertPlatformRequest(req, this.env, this.pdb);
    return this.respond(res, await this.auth.login(body, meta));
  }

  @Post('enroll')
  @HttpCode(200)
  async enroll(
    @Req() req: PlatformRequest,
    @Body(new ZodPipe(platformEnrollSchema)) body: PlatformEnrollInput,
    @Meta() meta: RequestMeta,
    @Res({ passthrough: true }) res: Response,
  ) {
    assertPlatformRequest(req, this.env, this.pdb);
    return this.respond(res, await this.auth.enroll(body, meta));
  }

  @Post('logout')
  @HttpCode(204)
  @UseGuards(PlatformGuard)
  async logout(
    @CurrentPlatformActor() actor: PlatformActor,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.logout(actor.id, actor);
    res.clearCookie(PLATFORM_COOKIE, { path: PLATFORM_COOKIE_PATH });
  }

  @Get('me')
  @UseGuards(PlatformGuard)
  me(@CurrentPlatformActor() actor: PlatformActor) {
    return { id: actor.id, email: actor.email, name: actor.name };
  }

  private respond(res: Response, result: LoginResult) {
    if (result.status !== 'ok') return result;
    res.cookie(PLATFORM_COOKIE, result.token, {
      httpOnly: true,
      secure: this.env.NODE_ENV === 'production',
      sameSite: 'strict',
      path: PLATFORM_COOKIE_PATH,
      maxAge: SESSION_HOURS * 3_600_000,
    });
    return { status: 'ok' as const, admin: result.admin };
  }
}

/** لوحة مالك المنصة: الشركات والباقات والمدفوعات */
@Controller('platform')
@Public()
@UseGuards(PlatformGuard)
export class PlatformController {
  constructor(private readonly platform: PlatformService) {}

  @Get('overview')
  overview() {
    return this.platform.overview();
  }

  @Get('tenants')
  tenants() {
    return this.platform.listTenants();
  }

  @Get('tenants/:id')
  tenant(@Param('id', ParseUUIDPipe) id: string) {
    return this.platform.getTenant(id);
  }

  @Post('tenants')
  createTenant(
    @CurrentPlatformActor() actor: PlatformActor,
    @Body(new ZodPipe(platformTenantCreateSchema)) body: PlatformTenantCreateInput,
  ) {
    return this.platform.createTenant(body, actor);
  }

  @Patch('tenants/:id')
  updateTenant(
    @CurrentPlatformActor() actor: PlatformActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(platformTenantUpdateSchema)) body: PlatformTenantUpdateInput,
  ) {
    return this.platform.updateTenant(id, body, actor);
  }

  @Post('tenants/:id/suspend')
  @HttpCode(200)
  suspend(
    @CurrentPlatformActor() actor: PlatformActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(tenantSuspendSchema)) body: { reason: string },
  ) {
    return this.platform.setStatus(id, false, body.reason, actor);
  }

  @Post('tenants/:id/activate')
  @HttpCode(200)
  activate(@CurrentPlatformActor() actor: PlatformActor, @Param('id', ParseUUIDPipe) id: string) {
    return this.platform.setStatus(id, true, null, actor);
  }

  @Post('tenants/:id/payments')
  pay(
    @CurrentPlatformActor() actor: PlatformActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(subscriptionPaymentSchema)) body: SubscriptionPaymentInput,
  ) {
    return this.platform.recordPayment(id, body, actor);
  }

  @Post('tenants/:id/admins/:userId/reset-password')
  @HttpCode(200)
  resetPassword(
    @CurrentPlatformActor() actor: PlatformActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Param('userId', ParseUUIDPipe) userId: string,
  ) {
    return this.platform.resetAdminPassword(id, userId, actor);
  }

  @Get('plans')
  plans() {
    return this.platform.listPlans();
  }

  @Post('plans')
  createPlan(
    @CurrentPlatformActor() actor: PlatformActor,
    @Body(new ZodPipe(planCreateSchema)) body: PlanCreateInput,
  ) {
    return this.platform.createPlan(body, actor);
  }

  @Patch('plans/:id')
  updatePlan(
    @CurrentPlatformActor() actor: PlatformActor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(planUpdateSchema)) body: PlanUpdateInput,
  ) {
    return this.platform.updatePlan(id, body, actor);
  }

  @Get('audit-logs')
  audit(@Query(new ZodPipe(auditQuery)) q: { limit: number }) {
    return this.platform.auditLogs(q.limit);
  }
}
