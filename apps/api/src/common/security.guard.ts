import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { GUEST_AUTH, IS_PUBLIC, PERMISSIONS, RequestContext, SKIP_CSRF, AuthUser } from './context';
import { AppError, forbidden } from './errors';
import { PrismaService } from './prisma.service';
import { GUEST_COOKIE, SESSION_COOKIE, SessionsService } from '../modules/auth/sessions.service';

const SAFE_METHODS = ['GET', 'HEAD', 'OPTIONS'];

/** Resolves the effective permission set of a user at a property. */
export function permissionsAt(user: AuthUser, propertyId: string, groupId: string): Set<string> {
  const perms = new Set<string>();
  for (const r of user.roles) {
    const applies =
      (r.propertyId === null && r.groupId === null) || // platform scope
      (r.propertyId === null && r.groupId === groupId) || // group scope
      r.propertyId === propertyId;
    if (applies) r.permissions.forEach((p) => perms.add(p));
  }
  return perms;
}

/**
 * Global guard:
 *  1. CSRF: state-changing requests must carry `x-collex-csrf: 1` (cannot be sent cross-site without CORS approval).
 *  2. Staff session authentication (httpOnly cookie) unless @Public().
 *  3. Guest-portal authentication for @GuestAuth().
 *  4. Property-scoped permission checks for @Perm(...). Access is denied unless the user holds a role
 *     at the property, its group, or platform scope — never based on client-side filtering.
 */
@Injectable()
export class SecurityGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessions: SessionsService,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(ec: ExecutionContext): Promise<boolean> {
    const req = ec.switchToHttp().getRequest<Request & Record<string, any>>();
    const meta = <T>(key: string) => this.reflector.getAllAndOverride<T>(key, [ec.getHandler(), ec.getClass()]);

    if (!SAFE_METHODS.includes(req.method) && !meta<boolean>(SKIP_CSRF) && req.headers['x-collex-csrf'] !== '1') {
      throw new AppError('CSRF_HEADER_MISSING', 403);
    }

    const ip = req.ip ?? null;
    const correlationId = req.correlationId ?? null;

    if (meta<boolean>(GUEST_AUTH)) {
      const reservationId = this.sessions.verifyGuestToken(req.cookies?.[GUEST_COOKIE]);
      if (!reservationId) throw new AppError('GUEST_SESSION_REQUIRED', 401);
      const reservation = await this.prisma.reservation.findUnique({ where: { id: reservationId }, include: { property: true } });
      if (!reservation) throw new AppError('GUEST_SESSION_REQUIRED', 401);
      req.ctx = {
        userId: null,
        propertyId: reservation.propertyId,
        property: reservation.property,
        permissions: new Set<string>(),
        ip,
        correlationId,
        isGuest: true,
        guestReservationId: reservationId,
      } satisfies RequestContext;
      return true;
    }

    if (meta<boolean>(IS_PUBLIC)) {
      return true;
    }

    const user = await this.sessions.resolve(req.cookies?.[SESSION_COOKIE]);
    if (!user) throw new AppError('UNAUTHENTICATED', 401);
    req.user = user;

    const required = meta<string[]>(PERMISSIONS);
    if (required && required.length) {
      const propertyId = String(req.headers['x-property-id'] ?? '');
      if (!propertyId || propertyId.length > 64) throw new AppError('PROPERTY_REQUIRED', 400);
      const property = await this.prisma.property.findUnique({ where: { id: propertyId } });
      if (!property) throw forbidden('PROPERTY_ACCESS_DENIED');
      const perms = permissionsAt(user, property.id, property.groupId);
      if (perms.size === 0) throw forbidden('PROPERTY_ACCESS_DENIED');
      const missing = required.filter((p) => !perms.has(p));
      if (missing.length) throw new AppError('PERMISSION_DENIED', 403, { missing });
      req.ctx = { userId: user.id, propertyId, property, permissions: perms, ip, correlationId } satisfies RequestContext;
    }
    return true;
  }
}
