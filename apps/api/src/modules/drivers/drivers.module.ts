import { Module } from '@nestjs/common';
import { FinanceModule } from '../finance/finance.module';
import { DriversController } from './drivers.controller';

@Module({ imports: [FinanceModule], controllers: [DriversController] })
export class DriversModule {}
