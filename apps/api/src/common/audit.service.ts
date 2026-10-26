import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService, Tx } from './prisma.service';

const SENSITIVE_KEYS = /password|token|secret|documentNumber|cardNumber|cvc|cvv|mfa/i;

/** Removes sensitive values from audit details. */
export function redact(value: unknown, depth = 0): unknown {
  if (depth > 5 || value === null || value === undefined) return value;
  if (Array.isArray(value)) return value.map((v) => redact(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.test(k) ? '[REDACTED]' : redact(v, depth + 1);
    }
    return out;
  }
  return value;
}

export interface AuditActor {
  userId: string | null;
  propertyId: string | null;
  ip: string | null;
  correlationId: string | null;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async log(
    ctx: AuditActor | null,
    action: string,
    entityType: string,
    entityId: string | null,
    details: Record<string, unknown> = {},
    tx?: Tx,
    actorType: 'USER' | 'GUEST' | 'SYSTEM' | 'PROVIDER' = 'USER',
  ) {
    const db = tx ?? this.prisma;
    await db.auditEvent.create({
      data: {
        propertyId: ctx?.propertyId ?? null,
        actorId: ctx?.userId ?? null,
        actorType,
        action,
        entityType,
        entityId,
        details: redact(details) as Prisma.InputJsonValue,
        ip: ctx?.ip ?? null,
        correlationId: ctx?.correlationId ?? null,
      },
    });
  }
}
