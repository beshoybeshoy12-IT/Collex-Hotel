import { Controller, Get, Param, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { guestSchema, paginationSchema, Permissions as P, type GuestInput } from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody, ZQuery } from '../../common/zod';
import { GuestsService } from './guests.service';

const reasonSchema = z.object({ reason: z.string().trim().min(3).max(200) });

@ApiTags('guests')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/guests')
export class GuestsController {
  constructor(private readonly svc: GuestsService) {}

  @Get()
  @Perm(P.GUESTS_READ)
  list(@Ctx() ctx: RequestContext, @ZQuery(paginationSchema) q: z.infer<typeof paginationSchema>) {
    return this.svc.list(ctx, q);
  }

  @Post()
  @Perm(P.GUESTS_WRITE)
  async create(@Ctx() ctx: RequestContext, @ZBody(guestSchema) body: GuestInput) {
    return this.svc.present(await this.svc.create(ctx, body));
  }

  @Get(':id')
  @Perm(P.GUESTS_READ)
  detail(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.detail(ctx, id);
  }

  @Put(':id')
  @Perm(P.GUESTS_WRITE)
  update(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(guestSchema) body: GuestInput) {
    return this.svc.update(ctx, id, body);
  }

  @Post(':id/legal-hold')
  @Perm(P.GUESTS_ERASE)
  legalHold(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(reasonSchema.extend({ legalHold: z.boolean() })) body: { legalHold: boolean; reason: string }) {
    return this.svc.setLegalHold(ctx, id, body.legalHold, body.reason);
  }

  @Post(':id/anonymize')
  @Perm(P.GUESTS_ERASE)
  anonymize(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(reasonSchema) body: { reason: string }) {
    return this.svc.anonymize(ctx, id, body.reason);
  }

  @Get(':id/export')
  @Perm(P.GUESTS_ERASE)
  export(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.export(ctx, id);
  }
}
