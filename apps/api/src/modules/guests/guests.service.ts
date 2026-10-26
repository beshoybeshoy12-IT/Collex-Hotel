import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { GuestInput } from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { d, iso, paginate } from '../../common/util';
import { DocumentsService } from '../documents/documents.service';

@Injectable()
export class GuestsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly documents: DocumentsService) {}

  toData(input: Partial<GuestInput>): Omit<Prisma.GuestUncheckedCreateInput, 'propertyId'> {
    return {
      firstName: input.firstName!,
      lastName: input.lastName!,
      email: input.email ?? null,
      phone: input.phone ?? null,
      nationality: input.nationality ?? null,
      dateOfBirth: input.dateOfBirth ? d(input.dateOfBirth) : null,
      preferredLocale: input.preferredLocale ?? 'ar',
      address: input.address ?? null,
      vip: input.vip ?? false,
      notes: input.notes ?? null,
      preferences: (input.preferences ?? {}) as Prisma.InputJsonValue,
    };
  }

  present(g: any) {
    return { ...g, dateOfBirth: iso(g.dateOfBirth) };
  }

  async create(ctx: RequestContext, input: GuestInput, tx: Tx = this.prisma) {
    const g = await tx.guest.create({ data: { propertyId: ctx.propertyId, ...this.toData(input) } });
    await this.audit.log(ctx, 'GUEST_CREATED', 'Guest', g.id, {}, tx);
    return g;
  }

  async update(ctx: RequestContext, id: string, input: GuestInput) {
    const g = await this.ensure(ctx, id);
    if (g.anonymizedAt) throw new AppError('GUEST_ANONYMIZED');
    const updated = await this.prisma.guest.update({ where: { id }, data: this.toData(input) });
    await this.audit.log(ctx, 'GUEST_UPDATED', 'Guest', id, { fields: Object.keys(input) });
    return this.present(updated);
  }

  async ensure(ctx: Pick<RequestContext, 'propertyId'>, id: string, tx: Tx = this.prisma) {
    const g = await tx.guest.findFirst({ where: { id, propertyId: ctx.propertyId } });
    if (!g) throw notFound('GUEST');
    return g;
  }

  async list(ctx: RequestContext, q: { q?: string; page: number; pageSize: number }) {
    const where: Prisma.GuestWhereInput = {
      propertyId: ctx.propertyId,
      anonymizedAt: null,
      ...(q.q
        ? {
            OR: [
              { firstName: { contains: q.q, mode: 'insensitive' } },
              { lastName: { contains: q.q, mode: 'insensitive' } },
              { email: { contains: q.q, mode: 'insensitive' } },
              { phone: { contains: q.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.guest.findMany({ where, orderBy: { updatedAt: 'desc' }, ...paginate(q.page, q.pageSize) }),
      this.prisma.guest.count({ where }),
    ]);
    return { items: items.map((g) => this.present(g)), total, page: q.page, pageSize: q.pageSize };
  }

  async detail(ctx: RequestContext, id: string) {
    const g = await this.ensure(ctx, id);
    const [reservations, documents] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { propertyId: ctx.propertyId, occupants: { some: { guestId: id } } },
        orderBy: { arrivalDate: 'desc' },
        take: 50,
        select: { id: true, confirmationNo: true, status: true, arrivalDate: true, departureDate: true, grandTotal: true, currency: true },
      }),
      this.documents.listForGuest(ctx, id),
    ]);
    return {
      ...this.present(g),
      reservations: reservations.map((r) => ({ ...r, arrivalDate: iso(r.arrivalDate), departureDate: iso(r.departureDate) })),
      documents,
    };
  }

  async setLegalHold(ctx: RequestContext, id: string, legalHold: boolean, reason: string) {
    await this.ensure(ctx, id);
    await this.prisma.guest.update({ where: { id }, data: { legalHold } });
    await this.audit.log(ctx, legalHold ? 'LEGAL_HOLD_SET' : 'LEGAL_HOLD_RELEASED', 'Guest', id, { reason });
    return { ok: true };
  }

  /**
   * Privacy erasure: anonymises personal fields and purges identity documents.
   * Reservations, folios and audit records are retained (statutory financial records) but no longer identify the person.
   */
  async anonymize(ctx: RequestContext, id: string, reason: string) {
    const g = await this.ensure(ctx, id);
    if (g.legalHold) throw new AppError('LEGAL_HOLD_ACTIVE', 409);
    const active = await this.prisma.reservation.count({
      where: { propertyId: ctx.propertyId, occupants: { some: { guestId: id } }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'PENDING', 'AWAITING_PAYMENT'] } },
    });
    if (active) throw new AppError('GUEST_HAS_ACTIVE_RESERVATIONS', 409);
    const docs = await this.prisma.identityDocument.findMany({ where: { guestId: id, purgedAt: null }, select: { id: true } });
    for (const doc of docs) await this.documents.purge(ctx, doc.id, `guest erasure: ${reason}`);
    await this.prisma.guest.update({
      where: { id },
      data: {
        firstName: 'ANONYMIZED',
        lastName: id.slice(-6),
        email: null,
        phone: null,
        dateOfBirth: null,
        address: null,
        notes: null,
        preferences: {},
        anonymizedAt: new Date(),
      },
    });
    await this.audit.log(ctx, 'GUEST_ANONYMIZED', 'Guest', id, { reason, documentsPurged: docs.length });
    return { ok: true };
  }

  /** Data-subject export (JSON) for authorised staff; excludes document images. */
  async export(ctx: RequestContext, id: string) {
    const detail = await this.detail(ctx, id);
    await this.audit.log(ctx, 'GUEST_EXPORTED', 'Guest', id);
    return detail;
  }
}
