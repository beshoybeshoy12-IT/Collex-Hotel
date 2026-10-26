import { randomBytes } from 'node:crypto';
import { businessDateInZone, dateColumnToIso, isoToDateColumn } from '@collex/shared';
import type { Property } from '@prisma/client';
import { Tx } from './prisma.service';

export const d = isoToDateColumn;
export const iso = (v: Date | null | undefined) => (v ? dateColumnToIso(v) : null);

export function today(property: Pick<Property, 'timezone'>, at = new Date()) {
  return businessDateInZone(property.timezone, at);
}

/** Atomic per-property counter (folio numbers, invoice numbers, work order numbers). */
export async function nextSequence(tx: Tx, propertyId: string, name: string): Promise<number> {
  const rows = await tx.$queryRaw<{ value: number }[]>`
    INSERT INTO "PropertySequence" ("propertyId", "name", "value") VALUES (${propertyId}, ${name}, 1)
    ON CONFLICT ("propertyId", "name") DO UPDATE SET "value" = "PropertySequence"."value" + 1
    RETURNING "value"`;
  return rows[0].value;
}

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function confirmationCode(length = 8): string {
  const bytes = randomBytes(length);
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join('');
}

export function paginate(page = 1, pageSize = 25) {
  return { skip: (page - 1) * pageSize, take: pageSize };
}

/** Hours from now until the property-local check-in time on the arrival date. */
export function hoursUntilArrival(property: Pick<Property, 'timezone' | 'checkInTime'>, arrival: string, now = new Date()): number {
  // Find the UTC instant of `arrival checkInTime` in the property time zone.
  const [h, m] = property.checkInTime.split(':').map(Number);
  const guess = new Date(`${arrival}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`);
  const fmt = new Intl.DateTimeFormat('en-US', { timeZone: property.timezone, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });
  const parts = Object.fromEntries(fmt.formatToParts(guess).map((p) => [p.type, p.value]));
  const local = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour % 24, +parts.minute);
  const offset = local - guess.getTime();
  const instant = guess.getTime() - offset;
  return (instant - now.getTime()) / 3600_000;
}
