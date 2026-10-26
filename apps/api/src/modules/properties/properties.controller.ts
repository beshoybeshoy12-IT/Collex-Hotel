import { Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import {
  buildingSchema,
  checkInPolicySchema,
  floorPlanSchema,
  floorSchema,
  Permissions as P,
  propertyUpdateSchema,
  roomCategorySchema,
  roomSchema,
  roomStatusSchema,
} from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody } from '../../common/zod';
import { PropertiesService } from './properties.service';

@ApiTags('property')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/property')
export class PropertiesController {
  constructor(private readonly svc: PropertiesService) {}

  @Get()
  @Perm(P.PROPERTY_READ)
  get(@Ctx() ctx: RequestContext) {
    return this.svc.get(ctx);
  }

  @Patch()
  @Perm(P.PROPERTY_MANAGE)
  update(@Ctx() ctx: RequestContext, @ZBody(propertyUpdateSchema) body: z.infer<typeof propertyUpdateSchema>) {
    return this.svc.update(ctx, body);
  }

  @Get('check-in-policy')
  @Perm(P.PROPERTY_READ)
  policy(@Ctx() ctx: RequestContext) {
    return this.svc.getPolicy(ctx);
  }

  @Put('check-in-policy')
  @Perm(P.PROPERTY_MANAGE)
  updatePolicy(@Ctx() ctx: RequestContext, @ZBody(checkInPolicySchema) body: z.infer<typeof checkInPolicySchema>) {
    return this.svc.updatePolicy(ctx, body);
  }

  @Get('document-types')
  @Perm(P.PROPERTY_READ)
  documentTypes(@Ctx() ctx: RequestContext) {
    return this.svc.documentTypes(ctx);
  }

  @Get('buildings')
  @Perm(P.ROOMS_READ)
  buildings(@Ctx() ctx: RequestContext) {
    return this.svc.buildings(ctx);
  }

  @Post('buildings')
  @Perm(P.ROOMS_MANAGE)
  createBuilding(@Ctx() ctx: RequestContext, @ZBody(buildingSchema) body: z.infer<typeof buildingSchema>) {
    return this.svc.createBuilding(ctx, body);
  }

  @Post('floors')
  @Perm(P.ROOMS_MANAGE)
  createFloor(@Ctx() ctx: RequestContext, @ZBody(floorSchema) body: z.infer<typeof floorSchema>) {
    return this.svc.createFloor(ctx, body);
  }

  @Get('floors/:id/plan')
  @Perm(P.ROOMS_READ)
  floorPlan(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.floorPlan(ctx, id);
  }

  @Put('floors/:id/plan')
  @Perm(P.FLOORPLAN_EDIT)
  saveFloorPlan(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(floorPlanSchema) body: z.infer<typeof floorPlanSchema>) {
    return this.svc.saveFloorPlan(ctx, id, body);
  }

  @Get('categories')
  @Perm(P.ROOMS_READ)
  categories(@Ctx() ctx: RequestContext) {
    return this.svc.categories(ctx);
  }

  @Post('categories')
  @Perm(P.ROOMS_MANAGE)
  createCategory(@Ctx() ctx: RequestContext, @ZBody(roomCategorySchema) body: z.infer<typeof roomCategorySchema>) {
    return this.svc.upsertCategory(ctx, body);
  }

  @Put('categories/:id')
  @Perm(P.ROOMS_MANAGE)
  updateCategory(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(roomCategorySchema) body: z.infer<typeof roomCategorySchema>) {
    return this.svc.upsertCategory(ctx, body, id);
  }

  @Get('rooms')
  @Perm(P.ROOMS_READ)
  rooms(@Ctx() ctx: RequestContext, @Query('floorId') floorId?: string, @Query('categoryId') categoryId?: string, @Query('q') q?: string) {
    return this.svc.rooms(ctx, { floorId, categoryId, q });
  }

  @Post('rooms')
  @Perm(P.ROOMS_MANAGE)
  createRoom(@Ctx() ctx: RequestContext, @ZBody(roomSchema) body: z.infer<typeof roomSchema>) {
    return this.svc.upsertRoom(ctx, body);
  }

  @Get('rooms/:id')
  @Perm(P.ROOMS_READ)
  room(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    return this.svc.roomDetail(ctx, id);
  }

  @Put('rooms/:id')
  @Perm(P.ROOMS_MANAGE)
  updateRoom(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(roomSchema) body: z.infer<typeof roomSchema>) {
    return this.svc.upsertRoom(ctx, body, id);
  }

  @Patch('rooms/:id/status')
  @Perm(P.HOUSEKEEPING_WORK)
  setStatus(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(roomStatusSchema) body: z.infer<typeof roomStatusSchema>) {
    return this.svc.setRoomStatus(ctx, id, body);
  }
}
