import { Module } from '@nestjs/common';
import { FinanceController } from './finance.controller';
import { FinanceService } from './finance.service';
import { LedgerService } from './ledger.service';

@Module({
  controllers: [FinanceController],
  providers: [LedgerService, FinanceService],
  exports: [LedgerService, FinanceService],
})
export class FinanceModule {}
