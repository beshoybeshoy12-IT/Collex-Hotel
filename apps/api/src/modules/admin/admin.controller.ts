import { Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiHeader, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { createUserSchema, paginationSchema, Permissions as P } from '@collex/shared';
import { Ctx, Perm, type RequestContext } from '../../common/context';
import { ZBody, ZQuery } from '../../common/zod';
import { PrismaService } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import { paginate } from '../../common/util';
import { hashPassword } from '../auth/auth.service';
import { SessionsService } from '../auth/sessions.service';
import { NotificationsService } from '../notifications/notifications.service';

@ApiTags('admin')
@ApiHeader({ name: 'x-property-id', required: true })
@Controller('v1/admin')
export class AdminController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly sessions: SessionsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Staff with a role at this property (or its group). */
  @Get('users')
  @Perm(P.PROPERTY_READ)
  async users(@Ctx() ctx: RequestContext) {
    const roles = await this.prisma.userRole.findMany({
      where: { OR: [{ propertyId: ctx.propertyId }, { groupId: ctx.property.groupId, propertyId: null }] },
      include: { role: true, user: { select: { id: true, email: true, fullName: true, active: true, mfaEnabled: true, lastLoginAt: true, locale: true } } },
    });
    const byUser = new Map<string, any>();
    for (const r of roles) {
      const u = byUser.get(r.userId) ?? { ...r.user, roles: [] as any[] };
      u.roles.push({ id: r.id, code: r.role.code, nameEn: r.role.nameEn, nameAr: r.role.nameAr, scope: r.propertyId ? 'PROPERTY' : 'GROUP' });
      byUser.set(r.userId, u);
    }
    // Only users-managers see e-mail addresses.
    return [...byUser.values()].map((u) => (ctx.permissions.has(P.USERS_MANAGE) ? u : { ...u, email: undefined }));
  }

  @Get('roles')
  @Perm(P.USERS_MANAGE)
  roles(@Ctx() ctx: RequestContext) {
    return this.prisma.role.findMany({ where: { OR: [{ groupId: ctx.property.groupId }, { groupId: null }] }, orderBy: { code: 'asc' } });
  }

  @Post('users')
  @Perm(P.USERS_MANAGE)
  async createUser(@Ctx() ctx: RequestContext, @ZBody(createUserSchema) body: z.infer<typeof createUserSchema>) {
    const role = await this.prisma.role.findFirst({ where: { code: body.roleCode, groupId: ctx.property.groupId } });
    if (!role || role.code === 'PLATFORM_ADMIN' || role.code === 'GROUP_ADMIN') throw new AppError('ROLE_NOT_ASSIGNABLE');
    const existing = await this.prisma.user.findUnique({ where: { email: body.email } });
    const user = await this.prisma.$transaction(async (tx) => {
      const u = existing ?? (await tx.user.create({ data: { email: body.email, fullName: body.fullName, locale: body.locale, passwordHash: await hashPassword(body.password) } }));
      await tx.userRole.create({ data: { userId: u.id, roleId: role.id, propertyId: ctx.propertyId } });
      await this.audit.log(ctx, 'USER_ROLE_GRANTED', 'User', u.id, { role: role.code, created: !existing }, tx);
      return u;
    });
    return { id: user.id, email: user.email, fullName: user.fullName };
  }

  @Post('user-roles/:id/revoke')
  @Perm(P.USERS_MANAGE)
  async revokeRole(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    const ur = await this.prisma.userRole.findFirst({ where: { id, propertyId: ctx.propertyId } });
    if (!ur) throw notFound('USER_ROLE');
    await this.prisma.userRole.delete({ where: { id } });
    await this.sessions.revokeAllForUser(ur.userId);
    await this.audit.log(ctx, 'USER_ROLE_REVOKED', 'User', ur.userId, { userRoleId: id });
    return { ok: true };
  }

  @Post('users/:id/deactivate')
  @Perm(P.USERS_MANAGE)
  async deactivate(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    const ur = await this.prisma.userRole.findFirst({ where: { userId: id, propertyId: ctx.propertyId } });
    if (!ur) throw notFound('USER');
    if (id === ctx.userId) throw new AppError('CANNOT_DEACTIVATE_SELF');
    // Users with roles at other properties are only removed from this property.
    const others = await this.prisma.userRole.count({ where: { userId: id, NOT: { propertyId: ctx.propertyId } } });
    if (others) await this.prisma.userRole.deleteMany({ where: { userId: id, propertyId: ctx.propertyId } });
    else await this.prisma.user.update({ where: { id }, data: { active: false } });
    await this.sessions.revokeAllForUser(id);
    await this.audit.log(ctx, 'USER_DEACTIVATED', 'User', id, { scope: others ? 'PROPERTY' : 'ACCOUNT' });
    return { ok: true };
  }

  @Get('audit')
  @Perm(P.AUDIT_READ)
  async auditLog(
    @Ctx() ctx: RequestContext,
    @ZQuery(paginationSchema.extend({ entityType: z.string().max(60).optional(), action: z.string().max(60).optional() })) q: any,
  ) {
    const where = {
      propertyId: ctx.propertyId,
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.action ? { action: q.action } : {}),
      ...(q.q ? { entityId: q.q } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.auditEvent.findMany({ where, orderBy: { createdAt: 'desc' }, ...paginate(q.page, q.pageSize) }),
      this.prisma.auditEvent.count({ where }),
    ]);
    const actors = await this.prisma.user.findMany({ where: { id: { in: items.map((i) => i.actorId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } });
    const refs = await this.resolveRefs(ctx.propertyId, items);
    return {
      items: items.map((i) => ({ ...i, actorName: actors.find((a) => a.id === i.actorId)?.fullName ?? null, entityLabel: i.entityId ? refs[i.entityId] ?? null : null })),
      refs,
      total,
      page: q.page,
      pageSize: q.pageSize,
    };
  }

  /**
   * Maps internal IDs found in audit entries to human-readable labels (room number, guest name,
   * confirmation number) so staff never need to read raw identifiers. Lookups are scoped to the property.
   */
  private async resolveRefs(propertyId: string, items: { entityType: string; entityId: string | null; details: unknown }[]) {
    const ids = new Set<string>();
    const collect = (v: unknown) => {
      if (typeof v === 'string' && /^c[a-z0-9]{20,}$/.test(v)) ids.add(v);
      else if (Array.isArray(v)) v.forEach(collect);
      else if (v && typeof v === 'object') Object.values(v).forEach(collect);
    };
    items.forEach((i) => {
      if (i.entityId) ids.add(i.entityId);
      collect(i.details);
    });
    const list = [...ids];
    if (!list.length) return {} as Record<string, string>;
    const where = { id: { in: list }, propertyId };
    const [rooms, guests, reservations, stays, lines, assignments, docs] = await Promise.all([
      this.prisma.room.findMany({ where, select: { id: true, number: true } }),
      this.prisma.guest.findMany({ where, select: { id: true, firstName: true, lastName: true } }),
      this.prisma.reservation.findMany({ where, select: { id: true, confirmationNo: true } }),
      this.prisma.stay.findMany({ where, select: { id: true, reservation: { select: { confirmationNo: true } } } }),
      this.prisma.reservationRoom.findMany({ where, select: { id: true, reservation: { select: { confirmationNo: true } } } }),
      this.prisma.roomAssignment.findMany({ where, select: { id: true, room: { select: { number: true } } } }),
      this.prisma.identityDocument.findMany({ where, select: { id: true, guest: { select: { firstName: true, lastName: true } } } }),
    ]);
    const refs: Record<string, string> = {};
    rooms.forEach((r) => (refs[r.id] = `#${r.number}`));
    guests.forEach((g) => (refs[g.id] = `${g.firstName} ${g.lastName}`));
    reservations.forEach((r) => (refs[r.id] = r.confirmationNo));
    stays.forEach((s) => (refs[s.id] = s.reservation.confirmationNo));
    lines.forEach((l) => (refs[l.id] = l.reservation.confirmationNo));
    assignments.forEach((a) => (refs[a.id] = `#${a.room.number}`));
    docs.forEach((d) => (refs[d.id] = `${d.guest.firstName} ${d.guest.lastName}`));
    return refs;
  }

  @Get('notifications')
  @Perm(P.PROPERTY_MANAGE)
  notificationsList(@Ctx() ctx: RequestContext, @Query('status') status?: string) {
    return this.notifications.list(ctx.propertyId, status);
  }

  @Post('notifications/:id/retry')
  @Perm(P.PROPERTY_MANAGE)
  async retry(@Ctx() ctx: RequestContext, @Param('id') id: string) {
    await this.notifications.retry(ctx.propertyId, id);
    return { ok: true };
  }
}
