import { reportQuerySchema } from '@dm/shared/schemas';
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import type { Actor } from '../../common/auth-context';
import { CurrentActor, Roles } from '../../common/decorators';
import { ZodPipe } from '../../common/zod.pipe';
import { ReportsService } from './reports.service';

@Controller('ops/reports')
@Roles('ops', 'admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get()
  report(
    @CurrentActor() actor: Actor,
    @Query(new ZodPipe(reportQuerySchema)) q: { from: string; to: string },
  ) {
    return this.reports.report(actor, q);
  }

  @Get('export')
  async export(
    @CurrentActor() actor: Actor,
    @Query(new ZodPipe(reportQuerySchema)) q: { from: string; to: string },
    @Res() res: Response,
  ): Promise<void> {
    const csv = await this.reports.exportOrders(actor, q);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="orders-${q.from}-${q.to}.csv"`);
    res.send(csv);
  }
}
