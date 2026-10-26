import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from '../../common/prisma.service';
import { TEMPLATES } from './templates';

export interface EnqueueInput {
  propertyId: string;
  channel: 'EMAIL' | 'SMS';
  template: keyof typeof TEMPLATES | string;
  locale: string;
  recipient: string | null | undefined;
  payload: Record<string, unknown>;
  /** Unique key: the same logical message is never queued twice. */
  dedupeKey: string;
}

/**
 * Transactional outbox. Messages are written in the same DB transaction as the business change
 * and delivered asynchronously by the worker (apps/worker), which retries with backoff.
 */
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async enqueue(input: EnqueueInput, tx?: Tx) {
    if (!input.recipient) return null;
    const db = tx ?? this.prisma;
    return db.notification.upsert({
      where: { dedupeKey: input.dedupeKey },
      update: {},
      create: {
        propertyId: input.propertyId,
        channel: input.channel,
        template: input.template,
        locale: input.locale === 'en' ? 'en' : 'ar',
        recipient: input.recipient,
        payload: input.payload as Prisma.InputJsonValue,
        dedupeKey: input.dedupeKey,
      },
    });
  }

  list(propertyId: string, status?: string) {
    return this.prisma.notification.findMany({
      where: { propertyId, ...(status ? { status } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: { id: true, channel: true, template: true, locale: true, status: true, attempts: true, lastError: true, createdAt: true, sentAt: true },
    });
  }

  async retry(propertyId: string, id: string) {
    await this.prisma.notification.updateMany({
      where: { id, propertyId, status: 'FAILED' },
      data: { status: 'QUEUED', nextAttemptAt: new Date(), attempts: 0 },
    });
  }
}
