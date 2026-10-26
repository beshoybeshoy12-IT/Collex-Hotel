import { Body, Controller, Get, HttpCode, Param, Post, Res, UploadedFiles, UseInterceptors, Patch } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import {
  availabilitySearchSchema,
  documentMetadataSchema,
  guestLookupSchema,
  guestServiceRequestSchema,
  publicBookingSchema,
} from '@collex/shared';
import { Ctx, GuestAuth, Public, type RequestContext } from '../../common/context';
import { ZBody, ZodPipe, ZQuery } from '../../common/zod';
import { PrismaService } from '../../common/prisma.service';
import { AppError, notFound } from '../../common/errors';
import { iso } from '../../common/util';
import { AvailabilityService } from '../rates/availability.service';
import { ReservationsService } from '../reservations/reservations.service';
import { DocumentsService } from '../documents/documents.service';
import { FinanceService } from '../finance/finance.service';
import { OperationsService } from '../operations/operations.service';
import { cookieOptions, GUEST_COOKIE, SessionsService } from '../auth/sessions.service';
import { parseMultipart, uploadInterceptor } from '../documents/documents.controller';
import { MockPaymentProvider } from '../finance/providers';
import { loadConfig } from '../../config';

const PUBLIC_PROPERTY_FIELDS = {
  id: true, code: true, name: true, nameAr: true, descriptionEn: true, descriptionAr: true, policiesEn: true, policiesAr: true,
  amenities: true, images: true, address: true, city: true, phone: true, email: true, currency: true, timezone: true, checkInTime: true, checkOutTime: true, taxPercent: true,
} as const;

@ApiTags('public')
@Controller('v1/public')
export class PublicController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly availability: AvailabilityService,
    private readonly reservations: ReservationsService,
    private readonly documents: DocumentsService,
    private readonly finance: FinanceService,
    private readonly operations: OperationsService,
    private readonly sessions: SessionsService,
  ) {}

  private async propertyCtx(code: string): Promise<RequestContext> {
    const property = await this.prisma.property.findFirst({ where: { code, active: true } });
    if (!property) throw notFound('PROPERTY');
    return { userId: null, propertyId: property.id, property, permissions: new Set(), ip: null, correlationId: null };
  }

  @Public()
  @Get('properties')
  properties() {
    return this.prisma.property.findMany({ where: { active: true }, select: PUBLIC_PROPERTY_FIELDS, orderBy: { name: 'asc' } });
  }

  @Public()
  @Get('properties/:code')
  async property(@Param('code') code: string) {
    const p = await this.prisma.property.findFirst({ where: { code, active: true }, select: PUBLIC_PROPERTY_FIELDS });
    if (!p) throw notFound('PROPERTY');
    const categories = await this.prisma.roomCategory.findMany({ where: { propertyId: p.id, active: true }, orderBy: { rank: 'asc' } });
    return { ...p, categories };
  }

  @Public()
  @Throttle({ default: { limit: 60, ttl: 60_000 } })
  @Get('properties/:code/availability')
  async search(@Param('code') code: string, @ZQuery(availabilitySearchSchema) q: z.infer<typeof availabilitySearchSchema>) {
    const ctx = await this.propertyCtx(code);
    return this.availability.search(ctx.propertyId, q);
  }

  /** Public booking. Deposits put the booking on a 30-minute hold awaiting provider-confirmed payment. */
  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('properties/:code/bookings')
  async book(@Param('code') code: string, @ZBody(publicBookingSchema) body: z.infer<typeof publicBookingSchema>, @Res({ passthrough: true }) res: Response) {
    const ctx = await this.propertyCtx(code);
    const reservation = await this.reservations.create(
      { ...ctx, isGuest: true },
      {
        arrival: body.arrival,
        departure: body.departure,
        ratePlanId: body.ratePlanId,
        source: 'WEB',
        rooms: body.rooms,
        primaryGuest: { ...body.guest, vip: false, preferences: {} } as any,
        additionalGuests: [],
        specialRequests: body.specialRequests,
        groupName: null,
        companyName: null,
        promoCode: body.promoCode,
        confirm: true,
      },
      { depositHoldMinutes: 30 },
    );
    let payment: { clientSecret: string | null; paymentId: string } | null = null;
    if (reservation.status === 'AWAITING_PAYMENT') {
      const folio = await this.prisma.folio.findFirstOrThrow({ where: { reservationId: reservation.id } });
      const r = await this.finance.takePayment(
        { ...ctx, permissions: new Set(['payments.take']) },
        { folioId: folio.id, amount: reservation.depositRequired.toFixed(2), method: 'ONLINE', isDeposit: true, idempotencyKey: `deposit-${reservation.id}` },
      );
      payment = { clientSecret: r.clientSecret, paymentId: r.payment.id };
    }
    res.cookie(GUEST_COOKIE, this.sessions.issueGuestToken(reservation.id), cookieOptions(new Date(Date.now() + 7 * 86400_000)));
    return { confirmationNo: reservation.confirmationNo, status: reservation.status, grandTotal: reservation.grandTotal.toString(), deposit: reservation.depositRequired.toString(), currency: reservation.currency, payment };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('guest/lookup')
  @HttpCode(200)
  async lookup(@ZBody(guestLookupSchema) body: z.infer<typeof guestLookupSchema>, @Res({ passthrough: true }) res: Response) {
    const r = await this.prisma.reservation.findUnique({ where: { confirmationNo: body.confirmationNo }, include: { primaryGuest: true } });
    // Same error for unknown code and wrong name to prevent enumeration.
    if (!r || r.primaryGuest.lastName.trim().toLowerCase() !== body.lastName.trim().toLowerCase()) throw new AppError('BOOKING_NOT_FOUND', 404);
    res.cookie(GUEST_COOKIE, this.sessions.issueGuestToken(r.id), cookieOptions(new Date(Date.now() + 7 * 86400_000)));
    return { ok: true };
  }

  @GuestAuth()
  @Post('guest/logout')
  @HttpCode(200)
  logout(@Res({ passthrough: true }) res: Response) {
    res.clearCookie(GUEST_COOKIE, cookieOptions());
    return { ok: true };
  }

  /** Guest-safe reservation view: no internal notes, staff names or other guests' documents. */
  @GuestAuth()
  @Get('guest/reservation')
  async myReservation(@Ctx() ctx: RequestContext) {
    const id = ctx.guestReservationId!;
    const r = await this.prisma.reservation.findUniqueOrThrow({
      where: { id },
      include: { primaryGuest: true, rooms: true, occupants: { include: { guest: { select: { id: true, firstName: true, lastName: true } } } } },
    });
    const categories = await this.prisma.roomCategory.findMany({ where: { propertyId: r.propertyId }, select: { id: true, nameEn: true, nameAr: true } });
    const [requirements, balances, folios, requests, docs] = await Promise.all([
      this.documents.requirements(r.propertyId, id),
      this.finance.balances(id),
      this.prisma.folio.findMany({ where: { reservationId: id }, include: { entries: { orderBy: { createdAt: 'asc' } }, payments: { select: { id: true, amount: true, status: true, method: true, createdAt: true } } } }),
      this.prisma.serviceRequest.findMany({ where: { reservationId: id }, select: { id: true, category: true, description: true, status: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
      this.prisma.identityDocument.findMany({ where: { reservationId: id }, select: { id: true, guestId: true, typeCode: true, status: true, rejectionReason: true, createdAt: true } }),
    ]);
    const snap = r.policySnapshot as any;
    return {
      confirmationNo: r.confirmationNo,
      status: r.status,
      arrival: iso(r.arrivalDate),
      departure: iso(r.departureDate),
      adults: r.adults,
      children: r.children,
      currency: r.currency,
      grandTotal: r.grandTotal.toString(),
      depositRequired: r.depositRequired.toString(),
      specialRequests: r.specialRequests,
      holdExpiresAt: r.holdExpiresAt,
      policy: { refundable: snap.refundable, freeCancellationHours: snap.freeCancellationHours, penaltyNights: snap.penaltyNights, ratePlan: snap.ratePlan },
      property: await this.prisma.property.findUniqueOrThrow({ where: { id: r.propertyId }, select: PUBLIC_PROPERTY_FIELDS }),
      guest: { firstName: r.primaryGuest.firstName, lastName: r.primaryGuest.lastName, email: r.primaryGuest.email },
      rooms: r.rooms.filter((x) => x.active).map((x) => ({ id: x.id, category: categories.find((c) => c.id === x.categoryId), adults: x.adults, children: x.children, nightlyRates: x.nightlyRates })),
      occupants: r.occupants.map((o) => ({ guestId: o.guest.id, name: `${o.guest.firstName} ${o.guest.lastName}`, isPrimary: o.isPrimary, isAdult: o.isAdult })),
      documentRequirements: requirements,
      documents: docs,
      balances,
      folios: folios.map((f) => ({ id: f.id, number: f.number, entries: f.entries.map((e) => ({ id: e.id, type: e.type, description: e.description, amount: e.amount.toString(), businessDate: iso(e.businessDate) })), payments: f.payments })),
      requests,
      pendingPayment: await this.prisma.payment.findFirst({ where: { folio: { reservationId: id }, status: 'PENDING' }, select: { id: true, amount: true, provider: true } }),
    };
  }

  @GuestAuth()
  @Patch('guest/reservation')
  async updateRequests(@Ctx() ctx: RequestContext, @ZBody(z.object({ specialRequests: z.string().max(2000) })) body: { specialRequests: string }) {
    await this.reservations.modify(ctx, ctx.guestReservationId!, { specialRequests: body.specialRequests });
    return { ok: true };
  }

  @GuestAuth()
  @Post('guest/cancel')
  @HttpCode(200)
  cancel(@Ctx() ctx: RequestContext, @ZBody(z.object({ reason: z.string().trim().min(2).max(200) })) body: { reason: string }) {
    return this.reservations.cancel(ctx, ctx.guestReservationId!, { reason: `GUEST: ${body.reason}`, waiveFee: false });
  }

  @GuestAuth()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('guest/documents')
  @UseInterceptors(uploadInterceptor())
  upload(@Ctx() ctx: RequestContext, @Body() body: any, @UploadedFiles() files: Express.Multer.File[]) {
    const parsed = parseMultipart(body, files);
    const meta = new ZodPipe(documentMetadataSchema).transform(parsed.meta, { type: 'body' });
    return this.documents.upload(ctx, meta, parsed.files);
  }

  @GuestAuth()
  @Post('guest/requests')
  async request(@Ctx() ctx: RequestContext, @ZBody(guestServiceRequestSchema) body: z.infer<typeof guestServiceRequestSchema>) {
    const r = await this.prisma.reservation.findUniqueOrThrow({ where: { id: ctx.guestReservationId! } });
    if (!['CONFIRMED', 'CHECKED_IN'].includes(r.status)) throw new AppError('RESERVATION_CLOSED', 409);
    const stay = await this.prisma.stay.findFirst({ where: { reservationId: r.id, status: 'IN_HOUSE' } });
    return this.operations.createServiceRequest(ctx, {
      ...body,
      stayId: stay?.id ?? null,
      roomId: null,
      priority: 'NORMAL',
      department: ['HOUSEKEEPING', 'AMENITIES', 'LAUNDRY', 'EXTRA_BED'].includes(body.category) ? 'HOUSEKEEPING' : body.category === 'MAINTENANCE' ? 'MAINTENANCE' : body.category === 'ROOM_SERVICE' ? 'FOOD_BEVERAGE' : 'FRONT_DESK',
      assignedToId: null,
      chargeAmount: null,
      guestId: r.primaryGuestId,
      reservationId: r.id,
    });
  }

  /**
   * DEVELOPMENT ONLY: simulates the payment provider calling our webhook for the guest's pending
   * deposit. It goes through the same signature-verified webhook path as a real provider.
   */
  @GuestAuth()
  @Post('guest/dev-simulate-payment')
  @HttpCode(200)
  async simulate(@Ctx() ctx: RequestContext) {
    const c = loadConfig();
    if (c.NODE_ENV === 'production' || c.PAYMENT_PROVIDER !== 'mock') throw new AppError('NOT_AVAILABLE', 404);
    const p = await this.prisma.payment.findFirst({ where: { folio: { reservationId: ctx.guestReservationId }, status: 'PENDING', provider: 'mock' } });
    if (!p) throw notFound('PAYMENT');
    const body = JSON.stringify({ id: `evt_${randomUUID()}`, type: 'payment.succeeded', data: { providerRef: p.providerRef } });
    return this.finance.handleWebhook('mock', Buffer.from(body), { 'x-mock-signature': MockPaymentProvider.sign(body) });
  }
}
