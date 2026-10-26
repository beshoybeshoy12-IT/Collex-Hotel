import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { PrismaService } from '../common/prisma.service';
import { ReservationsService } from '../modules/reservations/reservations.service';
import { DocumentsService } from '../modules/documents/documents.service';
import { NotificationsService } from '../modules/notifications/notifications.service';
import { loadConfig } from '../config';
import { Delivery } from './delivery';
import { Jobs } from './jobs';

/**
 * Background worker. Uses the PostgreSQL transactional outbox with SKIP LOCKED for durable,
 * horizontally-scalable processing (see DECISIONS.md). Run with: node dist/src/worker/main.js
 */
async function main() {
  loadConfig();
  const logger = new Logger('Worker');
  const ctx = await NestFactory.createApplicationContext(AppModule, { logger: ['log', 'warn', 'error'] });
  const jobs = new Jobs(ctx.get(PrismaService), ctx.get(ReservationsService), ctx.get(DocumentsService), ctx.get(NotificationsService), new Delivery());

  let stopping = false;
  const every = (name: string, ms: number, fn: () => Promise<unknown>) => {
    const run = async () => {
      if (stopping) return;
      try {
        await fn();
      } catch (e) {
        logger.error(`${name} failed: ${(e as Error).message}`);
      }
      if (!stopping) setTimeout(run, ms);
    };
    void run();
  };
  every('notifications', 5_000, () => jobs.deliverNotifications());
  every('holds', 60_000, () => jobs.expireHolds());
  every('document-expiry', 3600_000, () => jobs.expireDocuments());
  every('retention', 3600_000, () => jobs.purgeRetention());
  every('pre-arrival', 3600_000, () => jobs.preArrival());
  logger.log('worker started');

  const shutdown = async () => {
    stopping = true;
    await ctx.close();
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
