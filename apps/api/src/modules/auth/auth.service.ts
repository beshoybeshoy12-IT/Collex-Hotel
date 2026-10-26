import { Injectable } from '@nestjs/common';
import { hash, verify } from '@node-rs/argon2';
import { authenticator } from 'otplib';
import { PrismaService } from '../../common/prisma.service';
import { CryptoService } from '../../common/crypto.service';
import { AuditService } from '../../common/audit.service';
import { AppError } from '../../common/errors';
import { SessionsService } from './sessions.service';
import { permissionsAt } from '../../common/security.guard';
import type { AuthUser } from '../../common/context';
import { NotificationsService } from '../notifications/notifications.service';
import { loadConfig } from '../../config';

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;
// Pre-computed hash used to equalise timing when the user does not exist (prevents account enumeration).
let dummyHash: Promise<string> | undefined;

export const hashPassword = (password: string) => hash(password, { memoryCost: 19456, timeCost: 2, parallelism: 1 });

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly sessions: SessionsService,
    private readonly crypto: CryptoService,
    private readonly audit: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async login(email: string, password: string, mfaCode: string | undefined, ip: string | null, ua: string | null) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    dummyHash ??= hashPassword('dummy-password-for-timing');
    if (!user) {
      await verify(await dummyHash, password).catch(() => false);
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    if (user.lockedUntil && user.lockedUntil > new Date()) {
      throw new AppError('INVALID_CREDENTIALS', 401); // same response; lock is not disclosed
    }
    const ok = await verify(user.passwordHash, password).catch(() => false);
    if (!ok || !user.active) {
      const failed = user.failedLogins + 1;
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedLogins: failed >= MAX_FAILED ? 0 : failed,
          lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        },
      });
      await this.audit.log({ userId: user.id, propertyId: null, ip, correlationId: null }, 'LOGIN_FAILED', 'User', user.id);
      throw new AppError('INVALID_CREDENTIALS', 401);
    }
    if (user.mfaEnabled) {
      if (!mfaCode) throw new AppError('MFA_REQUIRED', 401);
      const secret = this.crypto.decryptString(user.mfaSecretEnc!);
      if (!authenticator.check(mfaCode, secret)) throw new AppError('MFA_INVALID', 401);
    }
    await this.prisma.user.update({ where: { id: user.id }, data: { failedLogins: 0, lockedUntil: null, lastLoginAt: new Date() } });
    const session = await this.sessions.create(user.id, ip, ua);
    await this.audit.log({ userId: user.id, propertyId: null, ip, correlationId: null }, 'LOGIN', 'User', user.id);
    return session;
  }

  /** Profile with the properties the user can access and permissions per property. */
  async me(user: AuthUser) {
    const platform = user.roles.some((r) => r.propertyId === null && r.groupId === null);
    const groupIds = user.roles.filter((r) => r.groupId && !r.propertyId).map((r) => r.groupId!);
    const propertyIds = user.roles.filter((r) => r.propertyId).map((r) => r.propertyId!);
    const properties = await this.prisma.property.findMany({
      where: platform ? {} : { OR: [{ groupId: { in: groupIds } }, { id: { in: propertyIds } }] },
      orderBy: { name: 'asc' },
      select: { id: true, code: true, name: true, nameAr: true, groupId: true, timezone: true, currency: true, arabicNumerals: true },
    });
    const dbUser = await this.prisma.user.findUniqueOrThrow({ where: { id: user.id }, select: { mfaEnabled: true } });
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      locale: user.locale,
      mfaEnabled: dbUser.mfaEnabled,
      properties: properties.map((p) => ({ ...p, permissions: [...permissionsAt(user, p.id, p.groupId)] })),
    };
  }

  async setLocale(userId: string, locale: string) {
    await this.prisma.user.update({ where: { id: userId }, data: { locale } });
  }

  async requestPasswordReset(email: string) {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Always respond identically to avoid account enumeration.
    if (!user || !user.active) return;
    const token = this.crypto.randomToken(32);
    await this.prisma.passwordResetToken.create({
      data: { userId: user.id, tokenHash: this.crypto.sha256(token), expiresAt: new Date(Date.now() + 30 * 60_000) },
    });
    const anyRole = await this.prisma.userRole.findFirst({ where: { userId: user.id, propertyId: { not: null } } });
    const property = anyRole?.propertyId
      ? anyRole.propertyId
      : (await this.prisma.property.findFirst({ select: { id: true } }))?.id;
    if (property) {
      await this.notifications.enqueue({
        propertyId: property,
        channel: 'EMAIL',
        template: 'PASSWORD_RESET',
        locale: user.locale,
        recipient: user.email,
        payload: { name: user.fullName, link: `${loadConfig().WEB_ORIGIN}/${user.locale}/reset-password#token=${token}` },
        dedupeKey: `pwreset:${this.crypto.sha256(token)}`,
      });
    }
  }

  async resetPassword(token: string, password: string) {
    const rec = await this.prisma.passwordResetToken.findUnique({ where: { tokenHash: this.crypto.sha256(token) } });
    if (!rec || rec.usedAt || rec.expiresAt < new Date()) throw new AppError('RESET_TOKEN_INVALID', 400);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: rec.userId }, data: { passwordHash: await hashPassword(password), failedLogins: 0, lockedUntil: null } }),
      this.prisma.passwordResetToken.update({ where: { id: rec.id }, data: { usedAt: new Date() } }),
      this.prisma.session.updateMany({ where: { userId: rec.userId, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await this.audit.log({ userId: rec.userId, propertyId: null, ip: null, correlationId: null }, 'PASSWORD_RESET', 'User', rec.userId);
  }

  async changePassword(userId: string, current: string, next: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!(await verify(user.passwordHash, current).catch(() => false))) throw new AppError('INVALID_CREDENTIALS', 400);
    await this.prisma.user.update({ where: { id: userId }, data: { passwordHash: await hashPassword(next) } });
    await this.audit.log({ userId, propertyId: null, ip: null, correlationId: null }, 'PASSWORD_CHANGED', 'User', userId);
  }

  async mfaSetup(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const secret = authenticator.generateSecret();
    await this.prisma.user.update({ where: { id: userId }, data: { mfaSecretEnc: this.crypto.encryptString(secret), mfaEnabled: false } });
    return { secret, otpauthUrl: authenticator.keyuri(user.email, 'Collex Hotel', secret) };
  }

  async mfaEnable(userId: string, code: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    if (!user.mfaSecretEnc || !authenticator.check(code, this.crypto.decryptString(user.mfaSecretEnc))) {
      throw new AppError('MFA_INVALID', 400);
    }
    await this.prisma.user.update({ where: { id: userId }, data: { mfaEnabled: true } });
    await this.audit.log({ userId, propertyId: null, ip: null, correlationId: null }, 'MFA_ENABLED', 'User', userId);
  }
}
