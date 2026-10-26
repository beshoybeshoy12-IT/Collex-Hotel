import { Injectable } from '@nestjs/common';
import { Prisma, RatePlan } from '@prisma/client';
import {
  INVENTORY_HOLDING_STATUSES,
  nightCount,
  PriceQuote,
  PricingError,
  quoteStay,
  stayNights,
  currencyDecimals,
} from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AppError } from '../../common/errors';
import { d, iso } from '../../common/util';

export interface CategoryAvailability {
  categoryId: string;
  total: number;
  /** Minimum sellable rooms across all nights of the stay. */
  available: number;
  perNight: { date: string; available: number }[];
}

@Injectable()
export class AvailabilityService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Sellable inventory per category = active rooms − rooms blocked by maintenance work orders
   * − reservation-room lines of inventory-holding reservations (+ overbooking allowance when enabled).
   * Must be called inside the property inventory lock when used for a write decision.
   */
  async byCategory(
    propertyId: string,
    arrival: string,
    departure: string,
    opts: { excludeReservationId?: string; tx?: Tx } = {},
  ): Promise<Map<string, CategoryAvailability>> {
    const db = opts.tx ?? this.prisma;
    const nights = stayNights(arrival, departure);
    const property = await db.property.findUniqueOrThrow({ where: { id: propertyId } });
    const rooms = await db.room.findMany({ where: { propertyId, active: true }, select: { id: true, categoryId: true } });
    const roomCategory = new Map(rooms.map((r) => [r.id, r.categoryId]));
    const blocks = await db.maintenanceWorkOrder.findMany({
      where: {
        propertyId,
        blockType: { not: 'NONE' },
        status: { notIn: ['CLOSED', 'CANCELLED'] },
        roomId: { not: null },
        blockFrom: { lt: d(departure) },
        OR: [{ blockUntil: null }, { blockUntil: { gt: d(arrival) } }],
      },
      select: { roomId: true, blockFrom: true, blockUntil: true },
    });
    const booked = await db.reservationRoom.findMany({
      where: {
        propertyId,
        active: true,
        arrivalDate: { lt: d(departure) },
        departureDate: { gt: d(arrival) },
        reservation: {
          status: { in: INVENTORY_HOLDING_STATUSES as any },
          OR: [{ holdExpiresAt: null }, { holdExpiresAt: { gt: new Date() } }],
          ...(opts.excludeReservationId ? { id: { not: opts.excludeReservationId } } : {}),
        },
      },
      select: { categoryId: true, arrivalDate: true, departureDate: true },
    });

    const result = new Map<string, CategoryAvailability>();
    const totals = new Map<string, number>();
    rooms.forEach((r) => totals.set(r.categoryId, (totals.get(r.categoryId) ?? 0) + 1));
    const categories = await db.roomCategory.findMany({ where: { propertyId, active: true }, select: { id: true } });
    const allowance = property.overbookingEnabled ? property.overbookingLimit : 0;

    for (const c of categories) {
      const perNight = nights.map((date) => {
        const blockedRooms = new Set(
          blocks
            .filter((b) => roomCategory.get(b.roomId!) === c.id && iso(b.blockFrom)! <= date && (!b.blockUntil || date < iso(b.blockUntil)!))
            .map((b) => b.roomId),
        );
        const bookedCount = booked.filter((b) => b.categoryId === c.id && iso(b.arrivalDate)! <= date && date < iso(b.departureDate)!).length;
        return { date, available: (totals.get(c.id) ?? 0) - blockedRooms.size - bookedCount + allowance };
      });
      result.set(c.id, {
        categoryId: c.id,
        total: totals.get(c.id) ?? 0,
        available: Math.max(0, Math.min(...perNight.map((n) => n.available))),
        perNight,
      });
    }
    return result;
  }

  /** Validates stay restrictions (closed, CTA/CTD, min/max stay) for a rate plan and category. */
  async checkRestrictions(propertyId: string, plan: RatePlan, categoryId: string, arrival: string, departure: string, tx?: Tx) {
    const db = tx ?? this.prisma;
    const n = nightCount(arrival, departure);
    if (n < plan.minStay) throw new AppError('MIN_STAY_NOT_MET', 400, { minStay: plan.minStay });
    if (n > plan.maxStay) throw new AppError('MAX_STAY_EXCEEDED', 400, { maxStay: plan.maxStay });
    const restrictions = await db.rateRestriction.findMany({
      where: {
        propertyId,
        date: { gte: d(arrival), lte: d(departure) },
        AND: [{ OR: [{ ratePlanId: null }, { ratePlanId: plan.id }] }, { OR: [{ categoryId: null }, { categoryId }] }],
      },
    });
    for (const r of restrictions) {
      const date = iso(r.date)!;
      if (r.closed && date < departure) throw new AppError('DATES_CLOSED', 400, { date });
      if (r.closedToArrival && date === arrival) throw new AppError('CLOSED_TO_ARRIVAL', 400, { date });
      if (r.closedToDeparture && date === departure) throw new AppError('CLOSED_TO_DEPARTURE', 400, { date });
      if (r.minStay && date === arrival && n < r.minStay) throw new AppError('MIN_STAY_NOT_MET', 400, { minStay: r.minStay });
    }
  }

  /** Prices a stay for one room using the rate plan's price rules and property taxes. */
  async quote(
    propertyId: string,
    plan: RatePlan,
    categoryId: string,
    arrival: string,
    departure: string,
    adults: number,
    children: number,
    tx?: Tx,
  ): Promise<PriceQuote> {
    const db = tx ?? this.prisma;
    const [property, category, prices] = await Promise.all([
      db.property.findUniqueOrThrow({ where: { id: propertyId } }),
      db.roomCategory.findFirstOrThrow({ where: { id: categoryId, propertyId } }),
      db.ratePrice.findMany({ where: { ratePlanId: plan.id, categoryId, startDate: { lt: d(departure) }, endDate: { gt: d(arrival) } } }),
    ]);
    if (adults > category.maxAdults || children > category.maxChildren || adults + children > category.maxOccupancy) {
      throw new AppError('OCCUPANCY_EXCEEDED', 400, { categoryId });
    }
    try {
      return quoteStay({
        arrival,
        departure,
        adults,
        children,
        baseOccupancy: category.baseOccupancy,
        rules: prices.map((p) => ({
          startDate: iso(p.startDate)!,
          endDate: iso(p.endDate)!,
          weekdays: p.weekdays,
          amount: p.amount.toString(),
          extraAdultAmount: p.extraAdultAmount.toString(),
          extraChildAmount: p.extraChildAmount.toString(),
          priority: p.priority,
        })),
        taxPercent: property.taxPercent.toString(),
        serviceChargePercent: property.serviceChargePercent.toString(),
        discountPercent: plan.discountPercent.toString(),
        decimals: currencyDecimals(property.currency),
      });
    } catch (e) {
      if (e instanceof PricingError) throw new AppError(e.code, 400, { date: e.date });
      throw e;
    }
  }

  /** Searchable offers per category & rate plan (used by public booking engine and staff). */
  async search(
    propertyId: string,
    q: { arrival: string; departure: string; adults: number; children: number; rooms: number; promoCode?: string },
    opts: { includePrivate?: boolean } = {},
  ) {
    const avail = await this.byCategory(propertyId, q.arrival, q.departure);
    const where: Prisma.RatePlanWhereInput = {
      propertyId,
      active: true,
      ...(opts.includePrivate ? {} : { OR: [{ public: true, promoCode: null }, ...(q.promoCode ? [{ promoCode: q.promoCode }] : [])] }),
    };
    const [plans, categories] = await Promise.all([
      this.prisma.ratePlan.findMany({ where, orderBy: { code: 'asc' } }),
      this.prisma.roomCategory.findMany({ where: { propertyId, active: true }, orderBy: { rank: 'asc' } }),
    ]);
    const adultsPerRoom = Math.ceil(q.adults / q.rooms);
    const childrenPerRoom = Math.ceil(q.children / q.rooms);
    const results = [];
    for (const c of categories) {
      const a = avail.get(c.id);
      const fits = adultsPerRoom <= c.maxAdults && childrenPerRoom <= c.maxChildren && adultsPerRoom + childrenPerRoom <= c.maxOccupancy;
      const offers = [];
      if (fits && a && a.available >= q.rooms) {
        for (const plan of plans) {
          try {
            await this.checkRestrictions(propertyId, plan, c.id, q.arrival, q.departure);
            const quote = await this.quote(propertyId, plan, c.id, q.arrival, q.departure, adultsPerRoom, childrenPerRoom);
            offers.push({
              ratePlan: { id: plan.id, code: plan.code, nameEn: plan.nameEn, nameAr: plan.nameAr, refundable: plan.refundable, freeCancellationHours: plan.freeCancellationHours, depositPercent: plan.depositPercent.toString() },
              quote,
            });
          } catch (e) {
            if (!(e instanceof AppError)) throw e;
          }
        }
      }
      results.push({
        category: { id: c.id, code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, descriptionEn: c.descriptionEn, descriptionAr: c.descriptionAr, maxAdults: c.maxAdults, maxChildren: c.maxChildren, maxOccupancy: c.maxOccupancy, bedConfig: c.bedConfig, amenities: c.amenities, images: c.images, sizeSqm: c.sizeSqm },
        available: a?.available ?? 0,
        fits,
        offers,
      });
    }
    return results;
  }
}
