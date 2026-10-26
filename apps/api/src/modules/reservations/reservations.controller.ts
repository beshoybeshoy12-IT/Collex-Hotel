import { Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  cancelReservationSchema,
  createReservationSchema,
  guestSchema,
  isoDate,
  modifyReservationSchema,
  paginationSchema,
  Permissions as P,
  ReservationStatus,
} from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody, ZQuery } from '../../common/zod';
import { ReservationsService } from './reservations.service';

const listSchema = paginationSchema.extend({
  status: z.enum(ReservationStatus).optional(),
  arrivalFrom: isoDate.optional(),
  arrivalTo: isoDate.optional(),
});

const occupantSchema = z
  .object({ guestId: z.string().optional(), guest: guestSchema.optional(), isAdult: z.boolean().default(true), reservationRoomId: z.string().optional() })
  .refine((v) => v.guestId || v.guest, 'guest_required');

@ApiTags('reservations')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/reservations')
export class ReservationsController {
  constructor(private readonly svc: ReservationsService) {}

  @Get()
  @Perm(P.RESERVATIONS_READ)
  list(@Ctx() ctx: RequestContext, @ZQuery(listSchema) q: z.infer<typeof listSchema>) {
    return this.svc.list(ctx, q);
  }

  @Post()
  @Perm(P.RESERVATIONS_WRITE)
  create(@Ctx() ctx: RequestContext, @ZBody(createReservationSchema) body: z.infer<typeof createReservationSchema>) {
    return this.svc.create(ctx, body);
  }

  @Get(':id')
  @Perm(P.RESERVATIONS_READ)
  detail(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.detail(ctx, id);
  }

  @Patch(':id')
  @Perm(P.RESERVATIONS_WRITE)
  modify(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(modifyReservationSchema) body: z.infer<typeof modifyReservationSchema>) {
    return this.svc.modify(ctx, id, body);
  }

  @Post(':id/occupants')
  @Perm(P.GUESTS_WRITE)
  addOccupant(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(occupantSchema) body: z.infer<typeof occupantSchema>) {
    return this.svc.addOccupant(ctx, id, body as any);
  }

  @Post(':id/confirm')
  @Perm(P.RESERVATIONS_WRITE)
  confirm(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.confirm(ctx, id);
  }

  @Post(':id/cancel')
  @Perm(P.RESERVATIONS_CANCEL)
  cancel(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(cancelReservationSchema) body: z.infer<typeof cancelReservationSchema>) {
    return this.svc.cancel(ctx, id, body);
  }

  @Post(':id/no-show')
  @Perm(P.RESERVATIONS_CANCEL)
  noShow(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.noShow(ctx, id);
  }
}
