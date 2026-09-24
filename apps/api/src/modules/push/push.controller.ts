import { ROLES } from '@dm/shared';
import { pushSubscribeSchema, type PushSubscribeInput } from '@dm/shared/schemas';
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import type { AuthUser } from '../../common/auth-context';
import { CurrentUser, Public, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { PushService } from './push.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: PushService) {}

  @Public()
  @Get('key')
  key() {
    return { enabled: this.push.enabled, publicKey: this.push.publicKey };
  }

  @Post('subscribe')
  @HttpCode(204)
  @Roles(...ROLES)
  async subscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(pushSubscribeSchema)) body: PushSubscribeInput,
  ) {
    await this.push.subscribe(user.tenantId, user.userId, body);
  }

  @Post('unsubscribe')
  @HttpCode(204)
  @Roles(...ROLES)
  async unsubscribe(
    @CurrentUser() user: AuthUser,
    @Body(new ZodPipe(pushSubscribeSchema)) body: PushSubscribeInput,
  ) {
    await this.push.unsubscribe(user.tenantId, user.userId, body.endpoint);
  }
}
