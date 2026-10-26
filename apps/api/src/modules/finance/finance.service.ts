import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { Decimal, money, percentOf, postChargeSchema, refundSchema, reverseEntrySchema, takePaymentSchema, currencyDecimals } from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { d, iso, nextSequence, today } from '../../common/util';
import { NotificationsService } from '../notifications/notifications.service';
import { PaymentProviders } from './providers';

const ADJUSTING_TYPES = ['DISCOUNT', 'ADJUSTMENT'];

@Injectable()
export class FinanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly providers: PaymentProviders,
    private readonly notifications: NotificationsService,
  ) {}

  async createFolio(tx: Tx, propertyId: string, reservationId: string, payerName: string, currency: string, payer = 'GUEST') {
    const number = await nextSequence(tx, propertyId, 'folio');
    return tx.folio.create({ data: { propertyId, reservationId, number, payerName, payer, currency } });
  }

  /** Idempotent posting: the same idempotency key never creates a second entry. */
  async post(
    tx: Tx,
    e: { folioId: string; propertyId: string; type: string; description: string; amount: Decimal.Value; businessDate: string; postedById: string | null; idempotencyKey: string; paymentId?: string; refundId?: string; reversalOfId?: string },
  ) {
    const existing = await tx.folioEntry.findUnique({ where: { idempotencyKey: e.idempotencyKey } });
    if (existing) return existing;
    const folio = await tx.folio.findUniqueOrThrow({ where: { id: e.folioId } });
    if (folio.status === 'CLOSED' && !['PAYMENT', 'REFUND'].includes(e.type)) throw new AppError('FOLIO_CLOSED', 409);
    return tx.folioEntry.create({
      data: {
        folioId: e.folioId,
        propertyId: e.propertyId,
        type: e.type,
        description: e.description,
        amount: new Prisma.Decimal(money(e.amount).toFixed(3)),
        businessDate: d(e.businessDate),
        postedById: e.postedById,
        idempotencyKey: e.idempotencyKey,
        paymentId: e.paymentId,
        refundId: e.refundId,
        reversalOfId: e.reversalOfId,
      },
    });
  }

  /** Posts room, service charge and tax for one night from the reservation's price snapshot. */
  async postRoomNight(tx: Tx, reservationRoomId: string, date: string, postedById: string | null) {
    const rr = await tx.reservationRoom.findUniqueOrThrow({ where: { id: reservationRoomId }, include: { reservation: true } });
    const nights = rr.nightlyRates as { date: string; amount: string }[];
    const night = nights.find((n) => n.date === date);
    if (!night) return;
    const snap = rr.reservation.policySnapshot as any;
    const folio = await this.primaryFolio(tx, rr.reservationId);
    const dec = currencyDecimals(rr.reservation.currency);
    const discount = percentOf(night.amount, snap.discountPercent ?? 0, dec);
    const net = money(night.amount).minus(discount);
    const sc = percentOf(net, snap.serviceChargePercent ?? 0, dec);
    const tax = percentOf(net.plus(sc), snap.taxPercent ?? 0, dec);
    const base = { folioId: folio.id, propertyId: rr.propertyId, businessDate: date, postedById };
    await this.post(tx, { ...base, type: 'ROOM', description: `ROOM_NIGHT ${date}`, amount: net, idempotencyKey: `room:${rr.id}:${date}` });
    if (!sc.isZero()) await this.post(tx, { ...base, type: 'SERVICE_CHARGE', description: `SERVICE_CHARGE ${date}`, amount: sc, idempotencyKey: `sc:${rr.id}:${date}` });
    if (!tax.isZero()) await this.post(tx, { ...base, type: 'TAX', description: `TAX ${date}`, amount: tax, idempotencyKey: `tax:${rr.id}:${date}` });
  }

  async primaryFolio(tx: Tx, reservationId: string) {
    const folio = await tx.folio.findFirst({ where: { reservationId }, orderBy: { number: 'asc' } });
    if (!folio) throw notFound('FOLIO');
    return folio;
  }

  async balances(reservationId: string, tx: Tx = this.prisma) {
    const folios = await tx.folio.findMany({ where: { reservationId }, include: { entries: true } });
    let charges = new Decimal(0);
    let credits = new Decimal(0);
    for (const f of folios) {
      for (const e of f.entries) {
        const a = new Decimal(e.amount.toString());
        if (a.isPositive()) charges = charges.plus(a);
        else credits = credits.plus(a.abs());
      }
    }
    return { charges: charges.toFixed(2), credits: credits.toFixed(2), balance: charges.minus(credits).toFixed(2) };
  }

  async paidAmount(reservationId: string, tx: Tx = this.prisma) {
    const payments = await tx.payment.findMany({ where: { folio: { reservationId }, status: { in: ['SUCCEEDED', 'PARTIALLY_REFUNDED'] } } });
    return payments.reduce((acc, p) => acc.plus(p.amount.toString()).minus(p.refundedAmount.toString()), new Decimal(0));
  }

  async foliosFor(ctx: RequestContext, reservationId: string) {
    const res = await this.prisma.reservation.findFirst({ where: { id: reservationId, propertyId: ctx.propertyId } });
    if (!res) throw notFound('RESERVATION');
    const folios = await this.prisma.folio.findMany({
      where: { reservationId },
      include: { entries: { orderBy: { createdAt: 'asc' } }, payments: { include: { refunds: true }, orderBy: { createdAt: 'asc' } }, invoices: true },
      orderBy: { number: 'asc' },
    });
    return folios.map((f) => this.presentFolio(f));
  }

  presentFolio(f: any) {
    const balance = f.entries.reduce((acc: Decimal, e: any) => acc.plus(e.amount.toString()), new Decimal(0));
    return {
      ...f,
      entries: f.entries.map((e: any) => ({ ...e, businessDate: iso(e.businessDate) })),
      balance: balance.toFixed(2),
    };
  }

  async ensureFolio(ctx: RequestContext, folioId: string, tx: Tx = this.prisma) {
    const folio = await tx.folio.findFirst({ where: { id: folioId, propertyId: ctx.propertyId }, include: { reservation: { include: { primaryGuest: true } } } });
    if (!folio) throw notFound('FOLIO');
    return folio;
  }

  async addFolio(ctx: RequestContext, reservationId: string, payer: string, payerName: string) {
    const res = await this.prisma.reservation.findFirst({ where: { id: reservationId, propertyId: ctx.propertyId } });
    if (!res) throw notFound('RESERVATION');
    return this.prisma.$transaction(async (tx) => {
      const f = await this.createFolio(tx, ctx.propertyId, reservationId, payerName, res.currency, payer);
      await this.audit.log(ctx, 'FOLIO_CREATED', 'Folio', f.id, { payer }, tx);
      return f;
    });
  }

  async postCharge(ctx: RequestContext, folioId: string, input: z.infer<typeof postChargeSchema>) {
    const negative = money(input.amount).isNegative();
    if ((negative || ADJUSTING_TYPES.includes(input.type)) && !ctx.permissions.has('folio.adjust')) {
      throw new AppError('PERMISSION_DENIED', 403, { missing: ['folio.adjust'] });
    }
    return this.prisma.$transaction(async (tx) => {
      const folio = await this.ensureFolio(ctx, folioId, tx);
      const amount = input.type === 'DISCOUNT' ? money(input.amount).abs().negated() : money(input.amount);
      const entry = await this.post(tx, {
        folioId: folio.id,
        propertyId: ctx.propertyId,
        type: input.type,
        description: input.description,
        amount,
        businessDate: today(ctx.property),
        postedById: ctx.userId,
        idempotencyKey: `manual:${folio.id}:${input.idempotencyKey}`,
      });
      await this.audit.log(ctx, 'FOLIO_CHARGE_POSTED', 'Folio', folio.id, { type: input.type, amount: amount.toFixed(2), entryId: entry.id }, tx);
      return entry;
    });
  }

  async reverse(ctx: RequestContext, entryId: string, input: z.infer<typeof reverseEntrySchema>) {
    return this.prisma.$transaction(async (tx) => {
      const entry = await tx.folioEntry.findFirst({ where: { id: entryId, propertyId: ctx.propertyId } });
      if (!entry) throw notFound('FOLIO_ENTRY');
      if (['PAYMENT', 'REFUND'].includes(entry.type)) throw new AppError('USE_REFUND_FOR_PAYMENTS');
      if (entry.reversalOfId) throw new AppError('CANNOT_REVERSE_REVERSAL');
      const already = await tx.folioEntry.findUnique({ where: { reversalOfId: entry.id } });
      if (already) return already;
      const rev = await this.post(tx, {
        folioId: entry.folioId,
        propertyId: ctx.propertyId,
        type: 'ADJUSTMENT',
        description: `REVERSAL: ${entry.description} (${input.reason})`,
        amount: new Decimal(entry.amount.toString()).negated(),
        businessDate: today(ctx.property),
        postedById: ctx.userId,
        idempotencyKey: `reverse:${entry.id}`,
        reversalOfId: entry.id,
      });
      await this.audit.log(ctx, 'FOLIO_ENTRY_REVERSED', 'FolioEntry', entry.id, { reason: input.reason }, tx);
      return rev;
    });
  }

  /**
   * Staff-recorded payments (cash, card terminal, bank transfer) are recorded as SUCCEEDED by the cashier.
   * ONLINE payments create a provider intent and are only marked paid after a verified webhook.
   */
  async takePayment(ctx: RequestContext, input: z.infer<typeof takePaymentSchema>) {
    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey: `${ctx.propertyId}:${input.idempotencyKey}` } });
    if (existing) {
      if (existing.folioId !== input.folioId || !new Decimal(existing.amount.toString()).equals(input.amount)) {
        throw new AppError('IDEMPOTENCY_KEY_REUSED', 409);
      }
      return { payment: existing, clientSecret: null, replayed: true };
    }
    const folio = await this.ensureFolio(ctx, input.folioId);
    if (input.method === 'ONLINE') {
      const provider = this.providers.onlineProvider;
      const key = `${ctx.propertyId}:${input.idempotencyKey}`;
      const intent = await provider.createIntent({ amount: input.amount, currency: folio.currency, idempotencyKey: key, metadata: { folioId: folio.id, reservationId: folio.reservationId } });
      const payment = await this.prisma.payment.create({
        data: { propertyId: ctx.propertyId, folioId: folio.id, provider: provider.name, providerRef: intent.providerRef, method: 'ONLINE', amount: input.amount, currency: folio.currency, status: 'PENDING', isDeposit: input.isDeposit, idempotencyKey: key, createdById: ctx.userId, reference: input.reference },
      });
      await this.audit.log(ctx, 'PAYMENT_INTENT_CREATED', 'Payment', payment.id, { amount: input.amount, provider: provider.name });
      return { payment, clientSecret: intent.clientSecret, replayed: false };
    }
    const payment = await this.prisma.$transaction(async (tx) => {
      const p = await tx.payment.create({
        data: { propertyId: ctx.propertyId, folioId: folio.id, provider: 'manual', method: input.method, amount: input.amount, currency: folio.currency, status: 'SUCCEEDED', isDeposit: input.isDeposit, idempotencyKey: `${ctx.propertyId}:${input.idempotencyKey}`, createdById: ctx.userId, reference: input.reference },
      });
      await this.applySucceededPayment(tx, p.id, ctx.userId);
      await this.audit.log(ctx, 'PAYMENT_RECORDED', 'Payment', p.id, { amount: input.amount, method: input.method }, tx);
      return p;
    });
    return { payment, clientSecret: null, replayed: false };
  }

  /** Posts the credit entry and confirms awaiting-payment reservations. Idempotent. */
  async applySucceededPayment(tx: Tx, paymentId: string, actorId: string | null) {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { folio: { include: { reservation: { include: { primaryGuest: true, property: true } } } } } });
    const res = p.folio.reservation;
    await this.post(tx, {
      folioId: p.folioId,
      propertyId: p.propertyId,
      type: 'PAYMENT',
      description: `PAYMENT ${p.method}${p.reference ? ' ' + p.reference : ''}`,
      amount: new Decimal(p.amount.toString()).negated(),
      businessDate: today(res.property),
      postedById: actorId,
      idempotencyKey: `payment:${p.id}`,
      paymentId: p.id,
    });
    if (res.status === 'AWAITING_PAYMENT') {
      const paid = await this.paidAmount(res.id, tx);
      if (paid.greaterThanOrEqualTo(res.depositRequired.toString())) {
        await tx.reservation.update({ where: { id: res.id }, data: { status: 'CONFIRMED', holdExpiresAt: null, version: { increment: 1 } } });
        await tx.reservationHistory.create({ data: { reservationId: res.id, action: 'PAYMENT_CONFIRMED', fromStatus: 'AWAITING_PAYMENT', toStatus: 'CONFIRMED', actorId } });
        await this.notifications.enqueue(
          { propertyId: res.propertyId, channel: 'EMAIL', template: 'BOOKING_CONFIRMED', locale: res.primaryGuest.preferredLocale, recipient: res.primaryGuest.email, payload: { name: res.primaryGuest.firstName, confirmationNo: res.confirmationNo, arrival: iso(res.arrivalDate), departure: iso(res.departureDate), total: res.grandTotal.toString(), currency: res.currency, hotel: res.property.name }, dedupeKey: `confirm:${res.id}` },
          tx,
        );
      }
    }
    await this.notifications.enqueue(
      { propertyId: res.propertyId, channel: 'EMAIL', template: 'PAYMENT_RECEIPT', locale: res.primaryGuest.preferredLocale, recipient: res.primaryGuest.email, payload: { name: res.primaryGuest.firstName, amount: p.amount.toString(), currency: p.currency, confirmationNo: res.confirmationNo, hotel: res.property.name }, dedupeKey: `receipt:${p.id}` },
      tx,
    );
  }

  async refund(ctx: RequestContext, input: z.infer<typeof refundSchema>) {
    const key = `${ctx.propertyId}:${input.idempotencyKey}`;
    const existing = await this.prisma.refund.findUnique({ where: { idempotencyKey: key } });
    if (existing) return existing;
    const payment = await this.prisma.payment.findFirst({ where: { id: input.paymentId, propertyId: ctx.propertyId } });
    if (!payment) throw notFound('PAYMENT');
    if (!['SUCCEEDED', 'PARTIALLY_REFUNDED'].includes(payment.status)) throw new AppError('PAYMENT_NOT_REFUNDABLE', 409);
    const refundable = new Decimal(payment.amount.toString()).minus(payment.refundedAmount.toString());
    if (new Decimal(input.amount).greaterThan(refundable)) throw new AppError('REFUND_EXCEEDS_PAYMENT', 400, { refundable: refundable.toFixed(2) });

    let providerRef: string | null = null;
    let status: 'SUCCEEDED' | 'PENDING' = 'SUCCEEDED';
    if (payment.provider !== 'manual') {
      const r = await this.providers.byName(payment.provider).refund({ providerRef: payment.providerRef!, amount: input.amount, currency: payment.currency, idempotencyKey: key });
      providerRef = r.providerRef;
      status = r.status;
    }
    return this.prisma.$transaction(async (tx) => {
      // Re-check inside the transaction with a row lock to prevent concurrent over-refunds.
      await tx.$queryRaw`SELECT id FROM "Payment" WHERE id = ${payment.id} FOR UPDATE`;
      const fresh = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
      const remaining = new Decimal(fresh.amount.toString()).minus(fresh.refundedAmount.toString());
      if (new Decimal(input.amount).greaterThan(remaining)) throw new AppError('REFUND_EXCEEDS_PAYMENT', 400);
      const refund = await tx.refund.create({
        data: { paymentId: payment.id, amount: input.amount, status, providerRef, reason: input.reason, idempotencyKey: key, createdById: ctx.userId },
      });
      if (status === 'SUCCEEDED') {
        const refunded = new Decimal(fresh.refundedAmount.toString()).plus(input.amount);
        await tx.payment.update({
          where: { id: payment.id },
          data: { refundedAmount: refunded.toFixed(3), status: refunded.equals(fresh.amount.toString()) ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });
        await this.post(tx, {
          folioId: payment.folioId,
          propertyId: ctx.propertyId,
          type: 'REFUND',
          description: `REFUND ${input.reason}`,
          amount: input.amount,
          businessDate: today(ctx.property),
          postedById: ctx.userId,
          idempotencyKey: `refund:${refund.id}`,
          refundId: refund.id,
        });
      }
      await this.audit.log(ctx, 'REFUND_CREATED', 'Payment', payment.id, { amount: input.amount, status, reason: input.reason }, tx);
      return refund;
    });
  }

  /** Processes a verified provider webhook exactly once per (provider, eventId). */
  async handleWebhook(providerName: string, rawBody: Buffer, headers: Record<string, string | string[] | undefined>) {
    const provider = this.providers.byName(providerName);
    const event = provider.verifyWebhook(rawBody, headers);
    return this.prisma.$transaction(async (tx) => {
      const inserted = await tx.$executeRaw`
        INSERT INTO "PaymentProviderEvent" ("id", "provider", "eventId", "type", "payload", "createdAt")
        VALUES (gen_random_uuid()::text, ${provider.name}, ${event.eventId}, ${event.type}, ${JSON.stringify(event.raw)}::jsonb, now())
        ON CONFLICT ("provider", "eventId") DO NOTHING`;
      if (inserted === 0) return { duplicate: true };
      if (event.type !== 'ignored' && event.providerRef) {
        await tx.$queryRaw`SELECT id FROM "Payment" WHERE provider = ${provider.name} AND "providerRef" = ${event.providerRef} FOR UPDATE`;
        const payment = await tx.payment.findFirst({ where: { provider: provider.name, providerRef: event.providerRef } });
        if (payment) {
          if (event.type === 'payment.succeeded' && payment.status === 'PENDING') {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'SUCCEEDED' } });
            await this.applySucceededPayment(tx, payment.id, null);
          } else if (event.type === 'payment.failed' && payment.status === 'PENDING') {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
          } else if (event.type === 'payment.disputed') {
            await tx.payment.update({ where: { id: payment.id }, data: { status: 'DISPUTED' } });
          }
          await this.audit.log({ userId: null, propertyId: payment.propertyId, ip: null, correlationId: null }, 'PAYMENT_WEBHOOK', 'Payment', payment.id, { type: event.type, eventId: event.eventId }, tx, 'PROVIDER');
        }
      }
      await tx.paymentProviderEvent.update({ where: { provider_eventId: { provider: provider.name, eventId: event.eventId } }, data: { processedAt: new Date() } });
      return { duplicate: false };
    });
  }

  async issueInvoice(ctx: RequestContext, folioId: string, kind: 'INVOICE' | 'RECEIPT') {
    return this.prisma.$transaction(async (tx) => {
      const folio = await this.ensureFolio(ctx, folioId, tx);
      const entries = await tx.folioEntry.findMany({ where: { folioId }, orderBy: { createdAt: 'asc' } });
      const totals = this.summarize(entries);
      const number = await nextSequence(tx, ctx.propertyId, `invoice:${kind}`);
      const inv = await tx.invoice.create({ data: { propertyId: ctx.propertyId, folioId, number, kind, totals, currency: folio.currency, issuedById: ctx.userId } });
      await this.audit.log(ctx, 'INVOICE_ISSUED', 'Invoice', inv.id, { kind, number }, tx);
      return inv;
    });
  }

  summarize(entries: { type: string; amount: Prisma.Decimal }[]) {
    const by = (types: string[]) => entries.filter((e) => types.includes(e.type)).reduce((a, e) => a.plus(e.amount.toString()), new Decimal(0));
    const charges = entries.filter((e) => !['PAYMENT', 'REFUND'].includes(e.type)).reduce((a, e) => a.plus(e.amount.toString()), new Decimal(0));
    const payments = by(['PAYMENT']).negated();
    const refunds = by(['REFUND']);
    return {
      room: by(['ROOM']).toFixed(2),
      services: by(['SERVICE', 'MINIBAR', 'LAUNDRY', 'RESTAURANT']).toFixed(2),
      serviceCharge: by(['SERVICE_CHARGE']).toFixed(2),
      tax: by(['TAX']).toFixed(2),
      adjustments: by(['DISCOUNT', 'ADJUSTMENT']).toFixed(2),
      charges: charges.toFixed(2),
      payments: payments.toFixed(2),
      refunds: refunds.toFixed(2),
      balance: charges.minus(payments).plus(refunds).toFixed(2),
    };
  }

  /** Printable document data (rendered as RTL/LTR HTML by the web app for correct Arabic shaping). */
  async printable(ctx: RequestContext, folioId: string) {
    const folio = await this.ensureFolio(ctx, folioId);
    const [entries, invoices, payments] = await Promise.all([
      this.prisma.folioEntry.findMany({ where: { folioId }, orderBy: { createdAt: 'asc' } }),
      this.prisma.invoice.findMany({ where: { folioId }, orderBy: { issuedAt: 'desc' } }),
      this.prisma.payment.findMany({ where: { folioId }, orderBy: { createdAt: 'asc' } }),
    ]);
    await this.audit.log(ctx, 'FOLIO_PRINTED', 'Folio', folioId);
    const g = folio.reservation.primaryGuest;
    return {
      property: { name: ctx.property.name, nameAr: ctx.property.nameAr, address: ctx.property.address, phone: ctx.property.phone, email: ctx.property.email, taxPercent: ctx.property.taxPercent },
      folio: { id: folio.id, number: folio.number, payerName: folio.payerName, currency: folio.currency, status: folio.status },
      reservation: { confirmationNo: folio.reservation.confirmationNo, arrival: iso(folio.reservation.arrivalDate), departure: iso(folio.reservation.departureDate) },
      guest: { name: `${g.firstName} ${g.lastName}` },
      entries: entries.map((e) => ({ ...e, businessDate: iso(e.businessDate) })),
      payments,
      invoices,
      totals: this.summarize(entries),
    };
  }
}
