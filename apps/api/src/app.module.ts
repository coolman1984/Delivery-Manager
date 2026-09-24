import { Controller, Get, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthGuard } from './common/auth.guard';
import { CommonModule } from './common/common.module';
import { Public } from './common/decorators';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { IpRateLimitGuard } from './common/ip-rate-limit.guard';
import { loadEnv } from './config/env';
import { AdminModule } from './modules/admin/admin.module';
import { AuthModule } from './modules/auth/auth.module';
import { CatalogModule } from './modules/catalog/catalog.module';
import { CustomersModule } from './modules/customers/customers.module';
import { DriversModule } from './modules/drivers/drivers.module';
import { FinanceModule } from './modules/finance/finance.module';
import { LeadsModule } from './modules/leads/leads.module';
import { MediaModule } from './modules/media/media.module';
import { MarketingModule } from './modules/marketing/marketing.module';
import { PlatformModule } from './modules/platform/platform.module';
import { PushModule } from './modules/push/push.module';
import { ReportsModule } from './modules/reports/reports.module';
import { SettingsModule } from './modules/settings/settings.module';
import { OrdersModule } from './modules/orders/orders.module';
import { RealtimeModule } from './modules/realtime/realtime.module';

@Controller('health')
class HealthController {
  @Public()
  @Get()
  health() {
    return { ok: true };
  }
}

@Module({
  imports: [
    CommonModule,
    JwtModule.registerAsync({
      global: true,
      useFactory: () => ({
        secret: loadEnv().JWT_ACCESS_SECRET,
        signOptions: { algorithm: 'HS256' },
        verifyOptions: { algorithms: ['HS256'] },
      }),
    }),
    RealtimeModule,
    SettingsModule,
    PushModule,
    MarketingModule,
    ReportsModule,
    PlatformModule,
    AuthModule,
    CatalogModule,
    CustomersModule,
    OrdersModule,
    DriversModule,
    FinanceModule,
    AdminModule,
    MediaModule,
    LeadsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_GUARD, useClass: IpRateLimitGuard },
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
