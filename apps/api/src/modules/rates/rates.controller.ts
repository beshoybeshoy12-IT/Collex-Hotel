import { Controller, Delete, Get, Param, Post, Put } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { availabilitySearchSchema, Permissions as P, ratePlanSchema, ratePriceSchema, restrictionSchema } from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody, ZQuery } from '../../common/zod';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { notFound } from '../../common/errors';
import { d, iso } from '../../common/util';
import { AvailabilityService } from './availability.service';

@ApiTags('rates')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/rates')
export class RatesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly availability: AvailabilityService) {}

  @Get('plans')
  @Perm(P.RATES_READ)
  async plans(@Ctx() ctx: RequestContext) {
    const plans = await this.prisma.ratePlan.findMany({
      where: { propertyId: ctx.propertyId },
      include: { prices: { orderBy: [{ categoryId: 'asc' }, { startDate: 'asc' }] } },
      orderBy: { code: 'asc' },
    });
    return plans.map((p) => ({ ...p, prices: p.prices.map((x) => ({ ...x, startDate: iso(x.startDate), endDate: iso(x.endDate) })) }));
  }

  @Post('plans')
  @Perm(P.RATES_MANAGE)
  async createPlan(@Ctx() ctx: RequestContext, @ZBody(ratePlanSchema) body: z.infer<typeof ratePlanSchema>) {
    const plan = await this.prisma.ratePlan.create({ data: { propertyId: ctx.propertyId, ...body } });
    await this.audit.log(ctx, 'RATE_PLAN_CREATED', 'RatePlan', plan.id, body);
    return plan;
  }

  @Put('plans/:id')
  @Perm(P.RATES_MANAGE)
  async updatePlan(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(ratePlanSchema) body: z.infer<typeof ratePlanSchema>) {
    await this.ensurePlan(ctx, id);
    const plan = await this.prisma.ratePlan.update({ where: { id }, data: body });
    await this.audit.log(ctx, 'RATE_PLAN_UPDATED', 'RatePlan', id, body);
    return plan;
  }

  @Post('plans/:id/prices')
  @Perm(P.RATES_MANAGE)
  async addPrice(@Ctx() ctx: RequestContext, @Param('id') id: string, @ZBody(ratePriceSchema) body: z.infer<typeof ratePriceSchema>) {
    await this.ensurePlan(ctx, id);
    const cat = await this.prisma.roomCategory.findFirst({ where: { id: body.categoryId, propertyId: ctx.propertyId } });
    if (!cat) throw notFound('CATEGORY');
    const price = await this.prisma.ratePrice.create({
      data: { ...body, ratePlanId: id, startDate: d(body.startDate), endDate: d(body.endDate) },
    });
    await this.audit.log(ctx, 'RATE_PRICE_ADDED', 'RatePlan', id, body);
    return price;
  }

  @Delete('plans/:id/prices/:priceId')
  @Perm(P.RATES_MANAGE)
  async deletePrice(@Ctx() ctx: RequestContext, @Param('id') id: string, @Param('priceId') priceId: string) {
    await this.ensurePlan(ctx, id);
    // Removing a future price rule does not affect existing reservations: their prices are snapshotted.
    await this.prisma.ratePrice.deleteMany({ where: { id: priceId, ratePlanId: id } });
    await this.audit.log(ctx, 'RATE_PRICE_REMOVED', 'RatePlan', id, { priceId });
    return { ok: true };
  }

  @Get('restrictions')
  @Perm(P.RATES_READ)
  restrictions(@Ctx() ctx: RequestContext) {
    return this.prisma.rateRestriction.findMany({ where: { propertyId: ctx.propertyId }, orderBy: { date: 'asc' }, take: 500 });
  }

  @Post('restrictions')
  @Perm(P.RATES_MANAGE)
  async addRestriction(@Ctx() ctx: RequestContext, @ZBody(restrictionSchema) body: z.infer<typeof restrictionSchema>) {
    if (body.ratePlanId) await this.ensurePlan(ctx, body.ratePlanId);
    const r = await this.prisma.rateRestriction.create({ data: { ...body, propertyId: ctx.propertyId, date: d(body.date) } });
    await this.audit.log(ctx, 'RESTRICTION_ADDED', 'RateRestriction', r.id, body);
    return r;
  }

  @Delete('restrictions/:id')
  @Perm(P.RATES_MANAGE)
  async removeRestriction(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    await this.prisma.rateRestriction.deleteMany({ where: { id, propertyId: ctx.propertyId } });
    await this.audit.log(ctx, 'RESTRICTION_REMOVED', 'RateRestriction', id);
    return { ok: true };
  }

  @Get('availability')
  @Perm(P.RESERVATIONS_READ)
  search(@Ctx() ctx: RequestContext, @ZQuery(availabilitySearchSchema) q: z.infer<typeof availabilitySearchSchema>) {
    return this.availability.search(ctx.propertyId, q, { includePrivate: true });
  }

  private async ensurePlan(ctx: RequestContext, id: string) {
    const plan = await this.prisma.ratePlan.findFirst({ where: { id, propertyId: ctx.propertyId } });
    if (!plan) throw notFound('RATE_PLAN');
    return plan;
  }
}
