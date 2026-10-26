import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';

export type Tx = Prisma.TransactionClient;

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }

  /** Runs fn in a transaction holding a property-wide inventory lock (serialises booking/allocation). */
  async withInventoryLock<T>(propertyId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
    return this.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'inventory:' + propertyId}))`;
        return fn(tx);
      },
      { timeout: 20_000, maxWait: 10_000 },
    );
  }
}
