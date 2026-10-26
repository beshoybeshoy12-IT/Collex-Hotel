import { addDays } from '@collex/shared';
import { PrismaService } from '../src/common/prisma.service';
import { ReservationsService } from '../src/modules/reservations/reservations.service';
import { DocumentsService } from '../src/modules/documents/documents.service';
import { NotificationsService } from '../src/modules/notifications/notifications.service';
import { renderTemplate, TEMPLATES } from '../src/modules/notifications/templates';
import { Jobs } from '../src/worker/jobs';
import { Delivery } from '../src/worker/delivery';
import { reservationBody, setupTestEnv, staff, TestEnv, uploadDocument } from './helpers';

describe('Notifications and background jobs', () => {
  let env: TestEnv;
  let jobs: Jobs;
  beforeAll(async () => {
    env = await setupTestEnv();
    jobs = new Jobs(env.app.get(PrismaService), env.app.get(ReservationsService), env.app.get(DocumentsService), env.app.get(NotificationsService), new Delivery());
  });
  afterAll(() => env.close());

  it('has Arabic and English versions of every template, with RTL markup for Arabic and escaped HTML', () => {
    for (const key of Object.keys(TEMPLATES)) {
      const ar = renderTemplate(key, 'ar', { name: '<b>سارة</b>' });
      const en = renderTemplate(key, 'en', { name: 'Sara' });
      expect(ar.html).toContain('dir="rtl"');
      expect(ar.html).toContain('lang="ar"');
      expect(ar.html).not.toContain('<b>سارة</b>');
      expect(en.html).toContain('dir="ltr"');
      expect(/[؀-ۿ]/.test(ar.subject + ar.text)).toBe(true);
    }
  });

  it('queues a confirmation once per booking in the guest language and delivers it without a real provider', async () => {
    const reception = await staff(env, 'reception');
    const r = (await reception.post('/v1/reservations', reservationBody(env, { arrival: addDays(env.today, 2), guest: { preferredLocale: 'ar', email: 'guest.ar@example.test' } }))).body;
    const queued = await env.prisma.notification.findMany({ where: { dedupeKey: `confirm:${r.id}` } });
    expect(queued).toHaveLength(1);
    expect(queued[0].locale).toBe('ar');
    await jobs.deliverNotifications(100);
    const after = await env.prisma.notification.findUniqueOrThrow({ where: { id: queued[0].id } });
    expect(after.status).toBe('LOGGED'); // no provider configured: nothing was actually sent

    // Pre-arrival + missing-document reminder (idempotent)
    await jobs.preArrival();
    await jobs.preArrival();
    expect(await env.prisma.notification.count({ where: { dedupeKey: `docreminder:${r.id}` } })).toBe(1);
  });

  it('expires documents and purges files after retention, keeping the audit record', async () => {
    const reception = await staff(env, 'reception');
    const r = (await reception.post('/v1/reservations', reservationBody(env, { arrival: addDays(env.today, 3) }))).body;
    const up = (await uploadDocument(reception, r.primaryGuestId)).body;
    await reception.post(`/v1/documents/${up.id}/review`, { decision: 'VERIFY', legible: true });
    await env.prisma.identityDocument.update({ where: { id: up.id }, data: { expiryDate: new Date('2020-01-01') } });
    await jobs.expireDocuments();
    expect((await env.prisma.identityDocument.findUniqueOrThrow({ where: { id: up.id } })).status).toBe('EXPIRED');

    await reception.post(`/v1/reservations/${r.id}/cancel`, { reason: 'test retention' });
    await env.prisma.identityDocument.update({ where: { id: up.id }, data: { retentionUntil: new Date(Date.now() - 1000) } });
    await jobs.purgeRetention();
    const doc = await env.prisma.identityDocument.findUniqueOrThrow({ where: { id: up.id }, include: { files: true } });
    expect(doc.purgedAt).not.toBeNull();
    expect(doc.documentNumberEnc).toBeNull();
    expect(doc.files.every((f) => f.purgedAt)).toBe(true);
    expect(await env.prisma.auditEvent.count({ where: { entityId: up.id, action: 'DOCUMENT_PURGED' } })).toBe(1);
    expect((await reception.get(`/v1/documents/${up.id}/files/${doc.files[0].id}`)).status).toBe(404);
  });
});
