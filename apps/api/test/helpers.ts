import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaClient } from '@prisma/client';
import { addDays, businessDateInZone } from '@collex/shared';
import { createApp } from '../src/bootstrap';
import { seed, SeedResult } from '../prisma/seed-data';

export const PASSWORD = 'Test-Password-123';

export interface TestEnv {
  app: INestApplication;
  prisma: PrismaClient;
  data: SeedResult;
  today: string;
  close(): Promise<void>;
}

/** Truncates all tables in the *_test database and loads fresh seed data. */
export async function setupTestEnv(): Promise<TestEnv> {
  const prisma = new PrismaClient();
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
  const data = await seed(prisma, PASSWORD);
  const app = await createApp({ logger: false });
  await app.init();
  return {
    app,
    prisma,
    data,
    today: businessDateInZone('Asia/Riyadh'),
    async close() {
      await app.close();
      await prisma.$disconnect();
    },
  };
}

export class Client {
  agent: ReturnType<typeof request.agent>;
  constructor(private readonly app: INestApplication, public propertyId?: string) {
    this.agent = request.agent(app.getHttpServer());
  }
  async login(email: string, password = PASSWORD) {
    const res = await this.agent.post('/v1/auth/login').set('x-collex-csrf', '1').send({ email, password });
    if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
    return this;
  }
  private h(r: request.Test) {
    r.set('x-collex-csrf', '1');
    if (this.propertyId) r.set('x-property-id', this.propertyId);
    return r;
  }
  get(url: string) {
    return this.h(this.agent.get(url));
  }
  post(url: string, body?: unknown) {
    return this.h(this.agent.post(url)).send(body as any);
  }
  patch(url: string, body?: unknown) {
    return this.h(this.agent.patch(url)).send(body as any);
  }
  put(url: string, body?: unknown) {
    return this.h(this.agent.put(url)).send(body as any);
  }
}

export const emails = {
  admin: 'admin@collex.test',
  manager: 'manager.ruh@collex.test',
  reception: 'reception.ruh@collex.test',
  agent: 'agent.ruh@collex.test',
  cashier: 'cashier.ruh@collex.test',
  hksup: 'hk.supervisor.ruh@collex.test',
  hk: 'hk.ruh@collex.test',
  maint: 'maintenance.ruh@collex.test',
  auditor: 'auditor@collex.test',
  receptionJed: 'reception.jed@collex.test',
};

export async function staff(env: TestEnv, who: keyof typeof emails, property: 'RUH' | 'JED' = 'RUH') {
  return new Client(env.app, env.data.properties[property].id).login(emails[who]);
}

/** Minimal valid JPEG (magic bytes + padding) used as a test document scan. */
export function fakeJpeg(size = 2048) {
  const buf = Buffer.alloc(size, 0x11);
  buf[0] = 0xff;
  buf[1] = 0xd8;
  buf[2] = 0xff;
  buf[3] = 0xe0;
  return buf;
}

export function guest(overrides: Record<string, unknown> = {}) {
  return { firstName: 'John', lastName: 'Smith', email: 'john.smith@example.test', nationality: 'GB', preferredLocale: 'en', ...overrides };
}

export function reservationBody(env: TestEnv, opts: { arrival?: string; nights?: number; category?: string; plan?: string; rooms?: number; adults?: number; guest?: Record<string, unknown>; additional?: Record<string, unknown>[] } = {}) {
  const p = env.data.properties.RUH;
  const arrival = opts.arrival ?? env.today;
  return {
    arrival,
    departure: addDays(arrival, opts.nights ?? 2),
    ratePlanId: p.ratePlans[opts.plan ?? 'BAR'],
    source: 'PHONE',
    rooms: Array.from({ length: opts.rooms ?? 1 }, () => ({ categoryId: p.categories[opts.category ?? 'STD'], adults: opts.adults ?? 1, children: 0 })),
    primaryGuest: guest(opts.guest),
    additionalGuests: opts.additional ?? [],
    confirm: true,
  };
}

export async function uploadDocument(client: Client, guestId: string, meta: Record<string, unknown> = {}, file = fakeJpeg()) {
  return client.agent
    .post('/v1/documents')
    .set('x-collex-csrf', '1')
    .set('x-property-id', client.propertyId!)
    .field('meta', JSON.stringify({ guestId, typeCode: 'PASSPORT', issuingCountry: 'GB', documentNumber: 'X1234567', holderName: 'JOHN SMITH', expiryDate: '2030-01-01', ...meta }))
    .field('sides', JSON.stringify(['FRONT']))
    .attach('files', file, { filename: 'scan.jpg', contentType: 'image/jpeg' });
}
