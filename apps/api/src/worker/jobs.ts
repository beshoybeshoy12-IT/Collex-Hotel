import { Logger } from '@nestjs/common';
import { addDays, businessDateInZone } from '@collex/shared';
import { PrismaService } from '../common/prisma.service';
import { ReservationsService } from '../modules/reservations/reservations.service';
import { DocumentsService } from '../modules/documents/documents.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { renderTemplate } from '../modules/notifications/templates';
import { d, iso } from '../common/util';
import { loadConfig } from '../config';
import { Delivery } from './delivery';

const MAX_ATTEMPTS = 6;

export class Jobs {
  private readonly logger = new Logger('Worker');
  constructor(
    private readonly prisma: PrismaService,
    private readonly reservations: ReservationsService,
    private readonly documents: DocumentsService,
    private readonly notifications: NotificationsService,
    private readonly delivery: Delivery,
  ) {}

  /** Claims queued notifications with SKIP LOCKED so several workers can run safely. */
  async deliverNotifications(batch = 20) {
    const claimed = await this.prisma.$queryRaw<{ id: string }[]>`
      UPDATE "Notification" SET status = 'SENDING', attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM "Notification"
        WHERE status = 'QUEUED' AND "nextAttemptAt" <= now()
        ORDER BY "createdAt" LIMIT ${batch}
        FOR UPDATE SKIP LOCKED
      ) RETURNING id`;
    for (const { id } of claimed) {
      const n = await this.prisma.notification.findUniqueOrThrow({ where: { id } });
      try {
        const msg = renderTemplate(n.template, n.locale, n.payload as Record<string, unknown>);
        const outcome = await this.delivery.send({ channel: n.channel, recipient: n.recipient, ...msg });
        await this.prisma.notification.update({ where: { id }, data: { status: outcome, sentAt: new Date(), lastError: null } });
      } catch (e) {
        const failed = n.attempts >= MAX_ATTEMPTS;
        const backoffMs = Math.min(3600_000, 2 ** n.attempts * 30_000);
        await this.prisma.notification.update({
          where: { id },
          data: { status: failed ? 'FAILED' : 'QUEUED', lastError: (e as Error).message.slice(0, 300), nextAttemptAt: new Date(Date.now() + backoffMs) },
        });
        this.logger.warn(`notification ${id} attempt ${n.attempts} failed${failed ? ' permanently' : ''}`);
      }
    }
    // Recover messages stuck in SENDING (e.g. worker crash) after 10 minutes.
    await this.prisma.notification.updateMany({ where: { status: 'SENDING', nextAttemptAt: { lt: new Date(Date.now() - 600_000) } }, data: { status: 'QUEUED' } });
    return claimed.length;
  }

  async expireHolds() {
    const n = await this.reservations.expireHolds();
    if (n) this.logger.log(`expired ${n} holds`);
  }

  /** Marks verified documents past their expiry date as EXPIRED. */
  async expireDocuments() {
    const props = await this.prisma.property.findMany({ select: { id: true, timezone: true } });
    for (const p of props) {
      const today = businessDateInZone(p.timezone);
      const docs = await this.prisma.identityDocument.findMany({ where: { propertyId: p.id, status: { in: ['VERIFIED', 'AWAITING_REVIEW', 'UPLOADED'] }, expiryDate: { lt: d(today) } }, select: { id: true } });
      for (const doc of docs) {
        await this.prisma.$transaction([
          this.prisma.identityDocument.update({ where: { id: doc.id }, data: { status: 'EXPIRED' } }),
          this.prisma.documentEvent.create({ data: { documentId: doc.id, action: 'EXPIRED', actorType: 'SYSTEM' } }),
        ]);
      }
    }
  }

  /** Purges document files past their retention date (skips guests under legal hold and in-house stays). */
  async purgeRetention() {
    const due = await this.prisma.identityDocument.findMany({
      where: { purgedAt: null, retentionUntil: { lt: new Date() }, guest: { legalHold: false } },
      select: { id: true, propertyId: true, guestId: true },
      take: 200,
    });
    for (const doc of due) {
      const active = await this.prisma.reservationOccupant.count({ where: { guestId: doc.guestId, reservation: { status: { in: ['CONFIRMED', 'CHECKED_IN'] } } } });
      if (active) continue;
      await this.documents.purge(null, doc.id, 'RETENTION_PERIOD_ELAPSED', doc.propertyId).catch((e) => this.logger.warn(`purge ${doc.id}: ${e.message}`));
    }
  }

  /** Daily pre-arrival messages and missing-document reminders for arrivals in 2 days. */
  async preArrival() {
    const props = await this.prisma.property.findMany();
    for (const p of props) {
      const target = addDays(businessDateInZone(p.timezone), 2);
      const arrivals = await this.prisma.reservation.findMany({ where: { propertyId: p.id, status: 'CONFIRMED', arrivalDate: d(target) }, include: { primaryGuest: true } });
      for (const r of arrivals) {
        const g = r.primaryGuest;
        const base = { name: g.firstName, confirmationNo: r.confirmationNo, arrival: iso(r.arrivalDate), hotel: p.name, checkInTime: p.checkInTime, portalUrl: `${loadConfig().WEB_ORIGIN}/${g.preferredLocale}/portal` };
        await this.notifications.enqueue({ propertyId: p.id, channel: 'EMAIL', template: 'PRE_ARRIVAL', locale: g.preferredLocale, recipient: g.email, payload: base, dedupeKey: `prearrival:${r.id}` });
        const req = await this.documents.requirements(p.id, r.id);
        if (!req.satisfied) {
          await this.notifications.enqueue({ propertyId: p.id, channel: 'EMAIL', template: 'DOCUMENT_REMINDER', locale: g.preferredLocale, recipient: g.email, payload: base, dedupeKey: `docreminder:${r.id}` });
        }
      }
    }
  }
}
