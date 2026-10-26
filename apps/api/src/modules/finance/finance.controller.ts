import { Controller, Get, HttpCode, Param, Post, Req, Headers } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { z } from 'zod';
import { createFolioSchema, Permissions as P, postChargeSchema, refundSchema, reverseEntrySchema, takePaymentSchema } from '@collex/shared';
import { Ctx, Perm, Public, SkipCsrf, type RequestContext } from '../../common/context';
import { ZBody } from '../../common/zod';
import { AppError } from '../../common/errors';
import { FinanceService } from './finance.service';

@ApiTags('finance')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/finance')
export class FinanceController {
  constructor(private readonly svc: FinanceService) {}

  @Get('reservations/:id/folios')
  @Perm(P.FOLIO_READ)
  folios(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.foliosFor(ctx, id);
  }

  @Post('folios')
  @Perm(P.FOLIO_ADJUST)
  addFolio(@Ctx() ctx: RequestContext, @ZBody(createFolioSchema) body: z.infer<typeof createFolioSchema>) {
    return this.svc.addFolio(ctx, body.reservationId, body.payer, body.payerName);
  }

  @Post('folios/:id/charges')
  @Perm(P.FOLIO_POST)
  charge(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(postChargeSchema) body: z.infer<typeof postChargeSchema>) {
    return this.svc.postCharge(ctx, id, body);
  }

  @Post('entries/:id/reverse')
  @Perm(P.FOLIO_ADJUST)
  reverse(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(reverseEntrySchema) body: z.infer<typeof reverseEntrySchema>) {
    return this.svc.reverse(ctx, id, body);
  }

  @Post('payments')
  @Perm(P.PAYMENTS_TAKE)
  pay(@Ctx() ctx: RequestContext, @ZBody(takePaymentSchema) body: z.infer<typeof takePaymentSchema>) {
    return this.svc.takePayment(ctx, body);
  }

  @Post('refunds')
  @Perm(P.PAYMENTS_REFUND)
  refund(@Ctx() ctx: RequestContext, @ZBody(refundSchema) body: z.infer<typeof refundSchema>) {
    return this.svc.refund(ctx, body);
  }

  @Post('folios/:id/invoices')
  @Perm(P.FOLIO_POST)
  invoice(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(z.object({ kind: z.enum(['INVOICE', 'RECEIPT']) })) body: { kind: 'INVOICE' | 'RECEIPT' }) {
    return this.svc.issueInvoice(ctx, id, body.kind);
  }

  @Get('folios/:id/print')
  @Perm(P.FOLIO_READ)
  print(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.printable(ctx, id);
  }
}

/** Provider webhooks: authenticated by provider signature, not by session or CSRF header. */
@ApiTags('finance')
@Controller('v1/payments/webhooks')
export class WebhooksController {
  constructor(private readonly svc: FinanceService) {}

  @Public()
  @SkipCsrf()
  @Throttle({ default: { limit: 300, ttl: 60_000 } })
  @Post(':provider')
  @HttpCode(200)
  async webhook(@Param('provider') provider: string, @Req() req: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string>) {
    if (!req.rawBody) throw new AppError('RAW_BODY_REQUIRED');
    return this.svc.handleWebhook(provider, req.rawBody, headers);
  }
}
