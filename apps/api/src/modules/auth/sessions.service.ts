import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma.service';
import { CryptoService } from '../../common/crypto.service';
import { loadConfig } from '../../config';
import type { AuthUser } from '../../common/context';

export const SESSION_COOKIE = 'collex_sid';
export const GUEST_COOKIE = 'collex_guest';

@Injectable()
export class SessionsService {
  constructor(private readonly prisma: PrismaService, private readonly crypto: CryptoService) {}

  async create(userId: string, ip: string | null, userAgent: string | null) {
    const token = this.crypto.randomToken(32);
    const expiresAt = new Date(Date.now() + loadConfig().SESSION_TTL_HOURS * 3600_000);
    await this.prisma.session.create({
      data: { userId, tokenHash: this.crypto.sha256(token), expiresAt, ip, userAgent: userAgent?.slice(0, 300) ?? null },
    });
    return { token, expiresAt };
  }

  async resolve(token: string | undefined): Promise<AuthUser | null> {
    if (!token || token.length > 200) return null;
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: this.crypto.sha256(token) },
      include: { user: { include: { roles: { include: { role: true } } } } },
    });
    if (!session || session.revokedAt || session.expiresAt < new Date() || !session.user.active) return null;
    // Touch at most once per minute to limit writes.
    if (Date.now() - session.lastSeenAt.getTime() > 60_000) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date() } });
    }
    const u = session.user;
    return {
      id: u.id,
      email: u.email,
      fullName: u.fullName,
      locale: u.locale,
      sessionId: session.id,
      roles: u.roles.map((r) => ({
        roleCode: r.role.code,
        permissions: r.role.permissions,
        groupId: r.groupId,
        propertyId: r.propertyId,
      })),
    };
  }

  async revoke(sessionId: string) {
    await this.prisma.session.updateMany({ where: { id: sessionId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  async revokeAllForUser(userId: string) {
    await this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }

  /** Signed, expiring guest-portal token bound to one reservation. */
  issueGuestToken(reservationId: string, ttlHours = 24 * 7): string {
    const exp = Date.now() + ttlHours * 3600_000;
    const body = `g1.${reservationId}.${exp}`;
    return `${body}.${this.crypto.sign(body)}`;
  }

  verifyGuestToken(token: string | undefined): string | null {
    if (!token) return null;
    const parts = token.split('.');
    if (parts.length !== 4 || parts[0] !== 'g1') return null;
    const body = parts.slice(0, 3).join('.');
    if (!this.crypto.safeEqual(this.crypto.sign(body), parts[3])) return null;
    if (Number(parts[2]) < Date.now()) return null;
    return parts[1];
  }
}

export function cookieOptions(expires?: Date) {
  return {
    httpOnly: true,
    secure: loadConfig().COOKIE_SECURE,
    sameSite: 'lax' as const,
    path: '/',
    ...(expires ? { expires } : {}),
  };
}
