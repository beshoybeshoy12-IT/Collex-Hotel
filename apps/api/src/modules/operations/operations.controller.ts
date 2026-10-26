import { Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  housekeepingTaskSchema,
  housekeepingTaskUpdateSchema,
  lostFoundSchema,
  Permissions as P,
  serviceRequestSchema,
  serviceRequestUpdateSchema,
  workOrderSchema,
  workOrderUpdateSchema,
} from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody } from '../../common/zod';
import { OperationsService } from './operations.service';

@ApiTags('operations')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1')
export class OperationsController {
  constructor(private readonly svc: OperationsService) {}

  @Get('housekeeping/tasks')
  @Perm(P.HOUSEKEEPING_READ)
  tasks(@Ctx() ctx: RequestContext, @Query('status') status?: string, @Query('mine') mine?: string) {
    return this.svc.tasks(ctx, { status, mine: mine === 'true' });
  }

  @Post('housekeeping/tasks')
  @Perm(P.HOUSEKEEPING_SUPERVISE)
  createTask(@Ctx() ctx: RequestContext, @ZBody(housekeepingTaskSchema) body: z.infer<typeof housekeepingTaskSchema>) {
    return this.svc.createTask(ctx, body);
  }

  @Patch('housekeeping/tasks/:id')
  @Perm(P.HOUSEKEEPING_WORK)
  updateTask(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(housekeepingTaskUpdateSchema) body: z.infer<typeof housekeepingTaskUpdateSchema>) {
    return this.svc.updateTask(ctx, id, body);
  }

  @Get('housekeeping/board')
  @Perm(P.HOUSEKEEPING_READ)
  board(@Ctx() ctx: RequestContext) {
    return this.svc.board(ctx);
  }

  @Get('housekeeping/lost-found')
  @Perm(P.HOUSEKEEPING_READ)
  lostFound(@Ctx() ctx: RequestContext) {
    return this.svc.lostFound(ctx);
  }

  @Post('housekeeping/lost-found')
  @Perm(P.HOUSEKEEPING_WORK)
  addLostFound(@Ctx() ctx: RequestContext, @ZBody(lostFoundSchema) body: z.infer<typeof lostFoundSchema>) {
    return this.svc.addLostFound(ctx, body);
  }

  @Post('housekeeping/lost-found/:id/close')
  @Perm(P.HOUSEKEEPING_SUPERVISE)
  closeLostFound(
    @Ctx() ctx: RequestContext,
    @Param('id') id: string,
    @ZBody(z.object({ status: z.enum(['RETURNED', 'DISPOSED']), returnedTo: z.string().max(200).optional() })) body: { status: 'RETURNED' | 'DISPOSED'; returnedTo?: string },
  ) {
    return this.svc.closeLostFound(ctx, id, body.status, body.returnedTo);
  }

  @Get('maintenance/work-orders')
  @Perm(P.MAINTENANCE_READ)
  workOrders(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    return this.svc.workOrders(ctx, status);
  }

  @Post('maintenance/work-orders')
  @Perm(P.MAINTENANCE_READ)
  createWorkOrder(@Ctx() ctx: RequestContext, @ZBody(workOrderSchema) body: z.infer<typeof workOrderSchema>) {
    return this.svc.createWorkOrder(ctx, body);
  }

  @Patch('maintenance/work-orders/:id')
  @Perm(P.MAINTENANCE_WORK)
  updateWorkOrder(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(workOrderUpdateSchema) body: z.infer<typeof workOrderUpdateSchema>) {
    return this.svc.updateWorkOrder(ctx, id, body);
  }

  @Get('services/requests')
  @Perm(P.SERVICES_READ)
  requests(@Ctx() ctx: RequestContext, @Query('status') status?: string, @Query('department') department?: string) {
    return this.svc.serviceRequests(ctx, { status, department });
  }

  @Post('services/requests')
  @Perm(P.SERVICES_WRITE)
  createRequest(@Ctx() ctx: RequestContext, @ZBody(serviceRequestSchema) body: z.infer<typeof serviceRequestSchema>) {
    return this.svc.createServiceRequest(ctx, body);
  }

  @Patch('services/requests/:id')
  @Perm(P.SERVICES_WRITE)
  updateRequest(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(serviceRequestUpdateSchema) body: z.infer<typeof serviceRequestUpdateSchema>) {
    return this.svc.updateServiceRequest(ctx, id, body);
  }
}
