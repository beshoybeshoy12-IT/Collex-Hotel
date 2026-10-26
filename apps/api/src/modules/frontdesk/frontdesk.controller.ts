import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  assignRoomSchema,
  autoAssignSchema,
  checkInSchema,
  checkOutSchema,
  extendStaySchema,
  Permissions as P,
  roomMoveSchema,
  walkInSchema,
} from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody } from '../../common/zod';
import { AssignmentsService } from './assignments.service';
import { FrontDeskService } from './frontdesk.service';

@ApiTags('front-desk')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/front-desk')
export class FrontDeskController {
  constructor(private readonly svc: FrontDeskService, private readonly assignments: AssignmentsService) {}

  @Get('dashboard')
  @Perm(P.RESERVATIONS_READ)
  dashboard(@Ctx() ctx: RequestContext) {
    return this.svc.dashboard(ctx);
  }

  @Get('unassigned')
  @Perm(P.RESERVATIONS_READ)
  unassigned(@Ctx() ctx: RequestContext, @Query('days') days?: string) {
    return this.assignments.unassignedQueue(ctx, Math.min(30, Math.max(0, Number(days ?? 3) || 3)));
  }

  @Get('recommendations/:reservationRoomId')
  @Perm(P.ASSIGN_ROOMS)
  recommend(@Ctx() ctx: RequestContext, @Param('reservationRoomId') id: string, @Query('allowUpgrade') allowUpgrade?: string) {
    return this.assignments.recommend(ctx, id, allowUpgrade === 'true');
  }

  @Post('assign')
  @Perm(P.ASSIGN_ROOMS)
  assign(@Ctx() ctx: RequestContext, @ZBody(assignRoomSchema) body: z.infer<typeof assignRoomSchema>) {
    return this.assignments.assign(ctx, body);
  }

  @Post('assignments/:id/unassign')
  @Perm(P.ASSIGN_ROOMS)
  unassign(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(z.object({ reason: z.string().min(2).max(200) })) body: { reason: string }) {
    return this.assignments.unassign(ctx, id, body.reason);
  }

  @Post('auto-assign')
  @Perm(P.ASSIGN_ROOMS)
  autoAssign(@Ctx() ctx: RequestContext, @ZBody(autoAssignSchema) body: z.infer<typeof autoAssignSchema>) {
    return this.assignments.autoAssign(ctx, body.reservationId, body.keepTogether);
  }

  @Post('check-in')
  @Perm(P.CHECKIN)
  checkIn(@Ctx() ctx: RequestContext, @ZBody(checkInSchema) body: z.infer<typeof checkInSchema>) {
    return this.svc.checkIn(ctx, body);
  }

  @Post('check-out')
  @Perm(P.CHECKOUT)
  checkOut(@Ctx() ctx: RequestContext, @ZBody(checkOutSchema) body: z.infer<typeof checkOutSchema>) {
    return this.svc.checkOut(ctx, body);
  }

  @Post('walk-in')
  @Perm(P.RESERVATIONS_WRITE, P.CHECKIN)
  walkIn(@Ctx() ctx: RequestContext, @ZBody(walkInSchema) body: z.infer<typeof walkInSchema>) {
    return this.svc.walkIn(ctx, body);
  }

  @Post('extend')
  @Perm(P.RESERVATIONS_WRITE)
  extend(@Ctx() ctx: RequestContext, @ZBody(extendStaySchema) body: z.infer<typeof extendStaySchema>) {
    return this.svc.extend(ctx, body.reservationId, body.newDeparture);
  }

  @Post('room-move')
  @Perm(P.ASSIGN_ROOMS)
  move(@Ctx() ctx: RequestContext, @ZBody(roomMoveSchema) body: z.infer<typeof roomMoveSchema>) {
    return this.svc.roomMove(ctx, body);
  }

  @Post('night-audit')
  @Perm(P.FOLIO_POST)
  nightAudit(@Ctx() ctx: RequestContext) {
    return this.svc.nightAudit(ctx);
  }

  @Get('stays/:id/registration-card')
  @Perm(P.CHECKIN)
  registration(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.registrationCard(ctx, id);
  }
}
