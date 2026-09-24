import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { OrdersController } from './orders.controller';
import { DispatchService } from './dispatch.service';
import { OrdersService } from './orders.service';

@Module({
  imports: [FinanceModule],
  controllers: [OrdersController],
  providers: [OrdersService, DispatchService],
})
export class OrdersModule {}
