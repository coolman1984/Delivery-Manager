import {
  dateQuerySchema,
  payoutSchema,
  resolveCashDiffSchema,
  settleSchema,
  type PayoutInput,
  type ResolveCashDiffInput,
  type SettleInput,
} from '@dm/shared';
import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import type { Actor } from '../../common/auth-context';
import { CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { FinanceService } from './finance.service';

@Controller('ops/finance')
@Roles('ops', 'admin')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get('summary')
  summary(@CurrentActor() actor: Actor, @Query(new ZodPipe(dateQuerySchema)) q: { date?: string }) {
    return this.finance.summary(actor, q.date);
  }

  @Get('drivers')
  drivers(@CurrentActor() actor: Actor) {
    return this.finance.driversOverview(actor);
  }

  @Post('drivers/:id/settle')
  settle(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(settleSchema)) body: SettleInput,
  ) {
    return this.finance.settle(actor, id, body);
  }

  @Get('settlements')
  settlements(
    @CurrentActor() actor: Actor,
    @Query(new ZodPipe(dateQuerySchema)) q: { date?: string },
  ) {
    return this.finance.settlementsList(actor, q.date);
  }

  @Get('stores')
  stores(@CurrentActor() actor: Actor) {
    return this.finance.storeBalances(actor);
  }

  @Post('stores/:id/payout')
  payout(
    @CurrentActor() actor: Actor,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodPipe(payoutSchema)) body: PayoutInput,
  ) {
    return this.finance.payoutStore(actor, id, body);
  }

  @Get('cash-differences')
  cashDifferences(@CurrentActor() actor: Actor) {
    return this.finance.cashDifferences(actor);
  }

  @Post('cash-differences/:orderId/resolve')
  resolve(
    @CurrentActor() actor: Actor,
    @Param('orderId', ParseUUIDPipe) orderId: string,
    @Body(new ZodPipe(resolveCashDiffSchema)) body: ResolveCashDiffInput,
  ) {
    return this.finance.resolveCashDifference(actor, orderId, body);
  }
}
