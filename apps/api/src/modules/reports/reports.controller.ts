import { Controller, Get, Res, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { z } from 'zod';
import { Permissions as P, reportQuerySchema } from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZQuery } from '../../common/zod';
import { AuditService } from '../../common/audit.service';
import { ReportsService, toCsv } from './reports.service';

type Q = z.infer<typeof reportQuerySchema>;

@ApiTags('reports')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/reports')
export class ReportsController {
  constructor(private readonly svc: ReportsService, private readonly audit: AuditService) {}

  private async send(ctx: RequestContext, name: string, data: any, rows: Record<string, unknown>[], format: string | undefined, res: Response) {
    if (format === 'csv') {
      await this.audit.log(ctx, 'REPORT_EXPORTED', 'Report', name, { format });
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="${name}.csv"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.send(toCsv(rows));
    }
    return res.json(data);
  }

  @Get('performance')
  @Perm(P.REPORTS_READ)
  async performance(@Ctx() ctx: RequestContext, @ZQuery(reportQuerySchema) q: Q, @Query('format') format: string | undefined, @Res() res: Response) {
    const data = await this.svc.performance(ctx, q.from, q.to, q.categoryId);
    return this.send(ctx, 'performance', data, data.daily, format, res);
  }

  @Get('bookings')
  @Perm(P.REPORTS_READ)
  async bookings(@Ctx() ctx: RequestContext, @ZQuery(reportQuerySchema) q: Q, @Query('format') format: string | undefined, @Res() res: Response) {
    const data = await this.svc.bookings(ctx, q.from, q.to);
    return this.send(ctx, 'bookings', data, data.byCategory, format, res);
  }

  @Get('operations')
  @Perm(P.REPORTS_READ)
  async operations(@Ctx() ctx: RequestContext, @ZQuery(reportQuerySchema) q: Q, @Query('format') format: string | undefined, @Res() res: Response) {
    const data = await this.svc.operations(ctx, q.from, q.to);
    return this.send(ctx, 'operations', data, data.housekeeping.perStaff, format, res);
  }

  @Get('financial')
  @Perm(P.REPORTS_FINANCIAL)
  async financial(@Ctx() ctx: RequestContext, @ZQuery(reportQuerySchema) q: Q, @Query('format') format: string | undefined, @Res() res: Response) {
    const data = await this.svc.financial(ctx, q.from, q.to);
    return this.send(ctx, 'financial', data, data.outstanding, format, res);
  }
}
