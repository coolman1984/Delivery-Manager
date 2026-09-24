import { Module } from '@nestjs/common';
import { PlatformAuthService } from './platform-auth.service';
import { PlatformDbService } from './platform-db.service';
import { DomainCheckController } from './domain.controller';
import { PlatformAuthController, PlatformController } from './platform.controller';
import { PlatformGuard } from './platform.guard';
import { PlatformService } from './platform.service';

@Module({
  controllers: [PlatformAuthController, PlatformController, DomainCheckController],
  providers: [PlatformDbService, PlatformAuthService, PlatformGuard, PlatformService],
  exports: [PlatformService],
})
export class PlatformModule {}
