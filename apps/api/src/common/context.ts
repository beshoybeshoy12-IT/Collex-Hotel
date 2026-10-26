import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { Property } from '@prisma/client';
import type { Permission } from '@collex/shared';

export interface AuthUser {
  id: string;
  email: string;
  fullName: string;
  locale: string;
  sessionId: string;
  roles: { roleCode: string; permissions: string[]; groupId: string | null; propertyId: string | null }[];
}

/** Per-request context for property-scoped endpoints. */
export interface RequestContext {
  userId: string | null;
  propertyId: string;
  property: Property;
  permissions: Set<string>;
  ip: string | null;
  correlationId: string | null;
  isGuest?: boolean;
  guestReservationId?: string;
}

export const IS_PUBLIC = 'isPublic';
export const PERMISSIONS = 'permissions';
export const SKIP_CSRF = 'skipCsrf';
export const GUEST_AUTH = 'guestAuth';

/** Endpoint does not require a staff session. */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Endpoint is exempt from CSRF header check (webhooks with their own signature verification). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
/** Property-scoped endpoint; caller needs ALL listed permissions at the property in `x-property-id`. */
export const Perm = (...perms: Permission[]) => SetMetadata(PERMISSIONS, perms);
/** Endpoint requires a guest-portal session cookie. */
export const GuestAuth = () => SetMetadata(GUEST_AUTH, true);

export const Ctx = createParamDecorator((_: unknown, ec: ExecutionContext): RequestContext => {
  return ec.switchToHttp().getRequest().ctx;
});

export const CurrentUser = createParamDecorator((_: unknown, ec: ExecutionContext): AuthUser => {
  return ec.switchToHttp().getRequest().user;
});

export function hasPerm(ctx: RequestContext, perm: Permission) {
  return ctx.permissions.has(perm);
}
