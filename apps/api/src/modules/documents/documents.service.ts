import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { documentCorrectionSchema, documentMetadataSchema, documentReviewSchema, maskIdentifier } from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { CryptoService } from '../../common/crypto.service';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { d, iso, today } from '../../common/util';
import { loadConfig } from '../../config';
import { MalwareScanner, sniffMime, StorageService } from './storage';

export interface UploadedFile {
  side: string;
  buffer: Buffer;
  originalName?: string;
}

export type RequirementState = 'SATISFIED' | 'MISSING' | 'AWAITING_REVIEW' | 'REJECTED' | 'EXPIRED' | 'REUPLOAD_REQUESTED';

const SIDES = ['FRONT', 'BACK', 'PAGE'];

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
    private readonly storage: StorageService,
    private readonly scanner: MalwareScanner,
    private readonly audit: AuditService,
  ) {}

  private actor(ctx: RequestContext) {
    return { actorId: ctx.userId, actorType: ctx.isGuest ? 'GUEST' : 'USER' };
  }

  /** List view: never includes the document number, only a masked suffix. */
  present(doc: any) {
    return {
      id: doc.id,
      guestId: doc.guestId,
      reservationId: doc.reservationId,
      typeCode: doc.typeCode,
      issuingCountry: doc.issuingCountry,
      documentNumberMasked: doc.documentNumberLast4 ? maskIdentifier('xxxxxxxx' + doc.documentNumberLast4) : null,
      holderName: doc.holderName,
      issueDate: iso(doc.issueDate),
      expiryDate: iso(doc.expiryDate),
      status: doc.status,
      uploadedByGuest: doc.uploadedByGuest,
      reviewedAt: doc.reviewedAt,
      rejectionReason: doc.rejectionReason,
      purgedAt: doc.purgedAt,
      retentionUntil: doc.retentionUntil,
      createdAt: doc.createdAt,
      files: (doc.files ?? [])
        .filter((f: any) => !f.purgedAt)
        .map((f: any) => ({ id: f.id, side: f.side, pageNo: f.pageNo, mimeType: f.mimeType, sizeBytes: f.sizeBytes, scanStatus: f.scanStatus, superseded: !!f.supersededAt, createdAt: f.createdAt })),
    };
  }

  private async validateAndStore(file: UploadedFile, uploadedById: string | null) {
    const max = loadConfig().UPLOAD_MAX_MB * 1024 * 1024;
    if (file.buffer.length === 0) throw new AppError('FILE_EMPTY');
    if (file.buffer.length > max) throw new AppError('FILE_TOO_LARGE', 413, { maxMb: loadConfig().UPLOAD_MAX_MB });
    if (!SIDES.includes(file.side)) throw new AppError('INVALID_FILE_SIDE');
    const mime = sniffMime(file.buffer);
    if (!mime) throw new AppError('FILE_TYPE_NOT_ALLOWED', 415);
    const scan = await this.scanner.scan(file.buffer);
    if (scan === 'INFECTED') throw new AppError('FILE_REJECTED_MALWARE', 422);
    const key = this.storage.newKey(this.crypto);
    await this.storage.put(key, file.buffer, mime);
    return {
      side: file.side,
      storageKey: key,
      mimeType: mime,
      sizeBytes: file.buffer.length,
      sha256: createHash('sha256').update(file.buffer).digest('hex'),
      scanStatus: scan === 'ERROR' ? 'PENDING' : scan,
      uploadedById,
    };
  }

  async upload(ctx: RequestContext, meta: z.infer<typeof documentMetadataSchema>, files: UploadedFile[]) {
    if (!files.length) throw new AppError('FILE_REQUIRED');
    if (files.length > 10) throw new AppError('TOO_MANY_FILES');
    const guest = await this.prisma.guest.findFirst({ where: { id: meta.guestId, propertyId: ctx.propertyId } });
    if (!guest) throw notFound('GUEST');
    if (meta.reservationId) {
      const res = await this.prisma.reservation.findFirst({ where: { id: meta.reservationId, propertyId: ctx.propertyId } });
      if (!res) throw notFound('RESERVATION');
    }
    if (ctx.isGuest) {
      // Guests may only upload for occupants of their own reservation.
      const occ = await this.prisma.reservationOccupant.findFirst({ where: { reservationId: ctx.guestReservationId, guestId: meta.guestId } });
      if (!occ) throw notFound('GUEST');
      meta.reservationId = ctx.guestReservationId;
    }
    const policy = await this.prisma.checkInPolicy.findUnique({ where: { propertyId: ctx.propertyId } });
    if (policy && !policy.acceptedTypes.includes(meta.typeCode)) throw new AppError('DOCUMENT_TYPE_NOT_ACCEPTED');
    const typeCfg = await this.prisma.documentTypeConfig.findUnique({ where: { propertyId_code: { propertyId: ctx.propertyId, code: meta.typeCode } } });
    for (const field of typeCfg?.requiredFields ?? []) {
      // Guests may submit without metadata; staff completes required fields during review.
      if (!ctx.isGuest && !(meta as any)[field]) throw new AppError('DOCUMENT_FIELD_REQUIRED', 400, { field });
    }
    if (meta.expiryDate && meta.expiryDate < today(ctx.property)) throw new AppError('DOCUMENT_EXPIRED');

    const stored: Awaited<ReturnType<DocumentsService['validateAndStore']>>[] = [];
    try {
      const pageCounter: Record<string, number> = {};
      for (const f of files) {
        const s = await this.validateAndStore(f, ctx.userId);
        pageCounter[s.side] = (pageCounter[s.side] ?? 0) + 1;
        stored.push({ ...s, pageNo: pageCounter[s.side] } as any);
      }
      const retentionDays = policy?.documentRetentionDays ?? 365;
      const doc = await this.prisma.$transaction(async (tx) => {
        const created = await tx.identityDocument.create({
          data: {
            propertyId: ctx.propertyId,
            guestId: meta.guestId,
            reservationId: meta.reservationId ?? null,
            typeCode: meta.typeCode,
            issuingCountry: meta.issuingCountry ?? null,
            documentNumberEnc: meta.documentNumber ? this.crypto.encryptString(meta.documentNumber) : null,
            documentNumberLast4: meta.documentNumber ? meta.documentNumber.slice(-4) : null,
            holderName: meta.holderName ?? null,
            issueDate: meta.issueDate ? d(meta.issueDate) : null,
            expiryDate: meta.expiryDate ? d(meta.expiryDate) : null,
            status: 'AWAITING_REVIEW',
            uploadedById: ctx.userId,
            uploadedByGuest: !!ctx.isGuest,
            retentionUntil: new Date(Date.now() + retentionDays * 86_400_000),
            files: { create: stored },
          },
          include: { files: true },
        });
        await tx.identityDocument.updateMany({
          where: { guestId: meta.guestId, typeCode: meta.typeCode, id: { not: created.id }, status: 'REUPLOAD_REQUESTED' },
          data: { status: 'REJECTED' },
        });
        await tx.documentEvent.create({ data: { documentId: created.id, action: 'UPLOADED', ...this.actor(ctx), details: { files: stored.length, typeCode: meta.typeCode } } });
        await this.audit.log(ctx, 'DOCUMENT_UPLOADED', 'IdentityDocument', created.id, { guestId: meta.guestId, files: stored.length }, tx, ctx.isGuest ? 'GUEST' : 'USER');
        return created;
      });
      return this.present(doc);
    } catch (e) {
      // Do not leave orphaned files when the DB write fails.
      await Promise.all(stored.map((s) => this.storage.delete(s.storageKey).catch(() => undefined)));
      throw e;
    }
  }

  /** Replace or add a file while keeping the superseded one in history (until retention purge). */
  async replaceFile(ctx: RequestContext, documentId: string, file: UploadedFile) {
    const doc = await this.find(ctx, documentId);
    if (doc.purgedAt) throw new AppError('DOCUMENT_PURGED');
    const s = await this.validateAndStore(file, ctx.userId);
    await this.prisma.$transaction(async (tx) => {
      await tx.documentFile.updateMany({ where: { documentId, side: file.side, supersededAt: null }, data: { supersededAt: new Date() } });
      await tx.documentFile.create({ data: { ...s, documentId } });
      await tx.identityDocument.update({ where: { id: documentId }, data: { status: 'AWAITING_REVIEW', reviewerId: null, reviewedAt: null, rejectionReason: null } });
      await tx.documentEvent.create({ data: { documentId, action: 'FILE_REPLACED', ...this.actor(ctx), details: { side: file.side } } });
      await this.audit.log(ctx, 'DOCUMENT_FILE_REPLACED', 'IdentityDocument', documentId, { side: file.side }, tx);
    });
    return this.get(ctx, documentId);
  }

  private async find(ctx: RequestContext, id: string, tx: Tx = this.prisma) {
    const doc = await tx.identityDocument.findFirst({ where: { id, propertyId: ctx.propertyId }, include: { files: true } });
    if (!doc) throw notFound('DOCUMENT');
    if (ctx.isGuest) {
      const occ = await tx.reservationOccupant.findFirst({ where: { reservationId: ctx.guestReservationId, guestId: doc.guestId } });
      if (!occ) throw notFound('DOCUMENT');
    }
    return doc;
  }

  async listForGuest(ctx: RequestContext, guestId: string) {
    const docs = await this.prisma.identityDocument.findMany({
      where: { propertyId: ctx.propertyId, guestId },
      include: { files: true },
      orderBy: { createdAt: 'desc' },
    });
    return docs.map((x) => this.present(x));
  }

  async reviewQueue(ctx: RequestContext) {
    const docs = await this.prisma.identityDocument.findMany({
      where: { propertyId: ctx.propertyId, status: 'AWAITING_REVIEW', purgedAt: null },
      include: { files: true, guest: { select: { id: true, firstName: true, lastName: true, nationality: true } } },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });
    return docs.map((x) => ({ ...this.present(x), guest: x.guest }));
  }

  /** Full detail for authorised reviewers, including decrypted document number. Audited. */
  async get(ctx: RequestContext, id: string) {
    const doc = await this.find(ctx, id);
    const events = await this.prisma.documentEvent.findMany({ where: { documentId: id }, orderBy: { createdAt: 'desc' } });
    const guest = await this.prisma.guest.findUniqueOrThrow({ where: { id: doc.guestId }, select: { id: true, firstName: true, lastName: true, nationality: true, dateOfBirth: true } });
    await this.audit.log(ctx, 'DOCUMENT_VIEWED', 'IdentityDocument', id, {});
    return {
      ...this.present(doc),
      documentNumber: doc.documentNumberEnc ? this.crypto.decryptString(doc.documentNumberEnc) : null,
      guest: { ...guest, dateOfBirth: iso(guest.dateOfBirth) },
      events,
    };
  }

  /** Streams a file through the API after authorisation; there are no public URLs. */
  async readFile(ctx: RequestContext, documentId: string, fileId: string) {
    const doc = await this.find(ctx, documentId);
    const file = doc.files.find((f) => f.id === fileId);
    if (!file || file.purgedAt) throw notFound('FILE');
    if (file.scanStatus === 'INFECTED') throw new AppError('FILE_QUARANTINED', 423);
    const data = await this.storage.get(file.storageKey);
    await this.prisma.documentEvent.create({ data: { documentId, action: 'FILE_VIEWED', ...this.actor(ctx), details: { fileId } } });
    await this.audit.log(ctx, 'DOCUMENT_FILE_VIEWED', 'IdentityDocument', documentId, { fileId });
    return { data, mimeType: file.mimeType };
  }

  async review(ctx: RequestContext, id: string, input: z.infer<typeof documentReviewSchema>) {
    const doc = await this.find(ctx, id);
    if (doc.purgedAt) throw new AppError('DOCUMENT_PURGED');
    let status: 'VERIFIED' | 'REJECTED' | 'REUPLOAD_REQUESTED' | 'EXPIRED';
    if (input.decision === 'VERIFY') {
      if (doc.files.some((f) => !f.supersededAt && f.scanStatus === 'INFECTED')) throw new AppError('FILE_QUARANTINED', 423);
      if (!doc.files.some((f) => !f.supersededAt)) throw new AppError('FILE_REQUIRED');
      const typeCfg = await this.prisma.documentTypeConfig.findUnique({ where: { propertyId_code: { propertyId: ctx.propertyId, code: doc.typeCode } } });
      for (const field of typeCfg?.requiredFields ?? []) {
        const value = field === 'documentNumber' ? doc.documentNumberEnc : (doc as any)[field];
        if (!value) throw new AppError('DOCUMENT_FIELD_REQUIRED', 400, { field });
      }
      if (typeCfg?.requiresBack && !doc.files.some((f) => !f.supersededAt && f.side === 'BACK')) throw new AppError('DOCUMENT_BACK_REQUIRED');
      status = doc.expiryDate && iso(doc.expiryDate)! < today(ctx.property) ? 'EXPIRED' : 'VERIFIED';
    } else {
      status = input.decision === 'REJECT' ? 'REJECTED' : 'REUPLOAD_REQUESTED';
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.identityDocument.update({
        where: { id },
        data: { status, reviewerId: ctx.userId, reviewedAt: new Date(), rejectionReason: input.decision === 'VERIFY' ? null : input.reason },
      });
      await tx.documentEvent.create({ data: { documentId: id, action: `REVIEW_${input.decision}`, actorId: ctx.userId, details: { status, ...('reason' in input ? { reason: input.reason } : {}), ...('note' in input && input.note ? { note: input.note } : {}) } } });
      await this.audit.log(ctx, 'DOCUMENT_REVIEWED', 'IdentityDocument', id, { decision: input.decision, status }, tx);
    });
    return this.get(ctx, id);
  }

  async correct(ctx: RequestContext, id: string, input: z.infer<typeof documentCorrectionSchema>) {
    const doc = await this.find(ctx, id);
    if (doc.purgedAt) throw new AppError('DOCUMENT_PURGED');
    const data: Prisma.IdentityDocumentUpdateInput = {};
    const changed: string[] = [];
    if (input.issuingCountry !== undefined) (data.issuingCountry = input.issuingCountry), changed.push('issuingCountry');
    if (input.holderName !== undefined) (data.holderName = input.holderName), changed.push('holderName');
    if (input.issueDate !== undefined) (data.issueDate = input.issueDate ? d(input.issueDate) : null), changed.push('issueDate');
    if (input.expiryDate !== undefined) (data.expiryDate = input.expiryDate ? d(input.expiryDate) : null), changed.push('expiryDate');
    if (input.documentNumber !== undefined) {
      data.documentNumberEnc = input.documentNumber ? this.crypto.encryptString(input.documentNumber) : null;
      data.documentNumberLast4 = input.documentNumber ? input.documentNumber.slice(-4) : null;
      changed.push('documentNumber');
    }
    // A verified document whose data changes must be re-reviewed.
    if (doc.status === 'VERIFIED') data.status = 'AWAITING_REVIEW';
    await this.prisma.$transaction(async (tx) => {
      await tx.identityDocument.update({ where: { id }, data });
      await tx.documentEvent.create({ data: { documentId: id, action: 'METADATA_CORRECTED', actorId: ctx.userId, details: { changed, reason: input.reason } } });
      await this.audit.log(ctx, 'DOCUMENT_CORRECTED', 'IdentityDocument', id, { changed, reason: input.reason }, tx);
    });
    return this.get(ctx, id);
  }

  /** Deletes stored files and personal metadata; the record and audit trail remain. */
  async purge(ctx: RequestContext | null, id: string, reason: string, propertyId?: string) {
    const doc = await this.prisma.identityDocument.findFirst({
      where: { id, propertyId: ctx?.propertyId ?? propertyId },
      include: { files: true, guest: { select: { legalHold: true } } },
    });
    if (!doc) throw notFound('DOCUMENT');
    if (doc.guest.legalHold) throw new AppError('LEGAL_HOLD_ACTIVE', 409);
    if (doc.purgedAt) return { ok: true };
    for (const f of doc.files.filter((x) => !x.purgedAt)) await this.storage.delete(f.storageKey);
    await this.prisma.$transaction(async (tx) => {
      await tx.documentFile.updateMany({ where: { documentId: id }, data: { purgedAt: new Date() } });
      await tx.identityDocument.update({
        where: { id },
        data: { purgedAt: new Date(), documentNumberEnc: null, holderName: null, ocrData: Prisma.DbNull },
      });
      await tx.documentEvent.create({ data: { documentId: id, action: 'PURGED', actorId: ctx?.userId ?? null, actorType: ctx ? 'USER' : 'SYSTEM', details: { reason } } });
      await this.audit.log(ctx ? ctx : { userId: null, propertyId: doc.propertyId, ip: null, correlationId: null }, 'DOCUMENT_PURGED', 'IdentityDocument', id, { reason }, tx, ctx ? 'USER' : 'SYSTEM');
    });
    return { ok: true };
  }

  // ---------------------------------------------------------------- Check-in requirements

  /**
   * Evaluates identity-document requirements for a reservation (optionally one room of it)
   * against the property's configurable check-in policy.
   */
  async requirements(propertyId: string, reservationId: string, reservationRoomId?: string, tx: Tx = this.prisma) {
    const property = await tx.property.findUniqueOrThrow({ where: { id: propertyId } });
    const policy =
      (await tx.checkInPolicy.findUnique({ where: { propertyId } })) ??
      ({ documentScope: 'ALL_ADULTS', acceptedTypes: ['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT'], requireVerification: true, homeCountry: null } as any);
    const occupants = await tx.reservationOccupant.findMany({
      // Occupants not linked to a specific room line count for every room of the reservation.
      where: { reservationId, ...(reservationRoomId ? { OR: [{ reservationRoomId }, { reservationRoomId: null }] } : {}) },
      include: { guest: true },
    });
    const date = today(property);
    let required = occupants;
    switch (policy.documentScope) {
      case 'NONE':
        required = [];
        break;
      case 'PRIMARY_GUEST':
        required = occupants.filter((o) => o.isPrimary);
        break;
      case 'ALL_ADULTS':
        required = occupants.filter((o) => o.isAdult);
        break;
      case 'FOREIGN_ADULTS':
        required = occupants.filter((o) => o.isAdult && (!o.guest.nationality || o.guest.nationality !== policy.homeCountry));
        break;
    }
    const guests = [];
    for (const o of required) {
      const docs = await tx.identityDocument.findMany({
        where: { propertyId, guestId: o.guestId, purgedAt: null, typeCode: { in: policy.acceptedTypes } },
        orderBy: { createdAt: 'desc' },
      });
      const valid = (x: (typeof docs)[number]) => !x.expiryDate || iso(x.expiryDate)! >= date;
      let state: RequirementState = 'MISSING';
      if (docs.some((x) => x.status === 'VERIFIED' && valid(x))) state = 'SATISFIED';
      else if (!policy.requireVerification && docs.some((x) => ['UPLOADED', 'AWAITING_REVIEW'].includes(x.status) && valid(x))) state = 'SATISFIED';
      else if (docs.some((x) => ['UPLOADED', 'AWAITING_REVIEW'].includes(x.status) && valid(x))) state = 'AWAITING_REVIEW';
      else if (docs.some((x) => x.status === 'REUPLOAD_REQUESTED')) state = 'REUPLOAD_REQUESTED';
      else if (docs.some((x) => x.status === 'EXPIRED' || !valid(x))) state = 'EXPIRED';
      else if (docs.some((x) => x.status === 'REJECTED')) state = 'REJECTED';
      guests.push({ guestId: o.guestId as string | null, name: `${o.guest.firstName} ${o.guest.lastName}`, isPrimary: o.isPrimary, nationality: o.guest.nationality, state, unregistered: false });
    }
    // Every adult on the booking must be registered: adults booked but not yet registered count as missing.
    if (policy.documentScope === 'ALL_ADULTS') {
      const lines = await tx.reservationRoom.findMany({ where: { reservationId, active: true, ...(reservationRoomId ? { id: reservationRoomId } : {}) }, select: { adults: true } });
      const bookedAdults = lines.reduce((a, l) => a + l.adults, 0);
      const registeredAdults = occupants.filter((o) => o.isAdult).length;
      for (let i = registeredAdults; i < bookedAdults; i++) {
        guests.push({ guestId: null, name: '', isPrimary: false, nationality: null, state: 'MISSING', unregistered: true });
      }
    }
    return {
      policy: { documentScope: policy.documentScope, acceptedTypes: policy.acceptedTypes, requireVerification: policy.requireVerification, allowExceptions: policy.allowExceptions ?? false },
      satisfied: guests.every((g) => g.state === 'SATISFIED'),
      guests,
    };
  }
}
