import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ConsoleSmsProvider, SMS_PROVIDER } from './sms.provider';

@Module({
  controllers: [AuthController],
  providers: [AuthService, { provide: SMS_PROVIDER, useClass: ConsoleSmsProvider }],
  exports: [AuthService],
})
export class AuthModule {}
