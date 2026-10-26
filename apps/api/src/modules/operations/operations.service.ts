import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  canTransitionWorkOrder,
  housekeepingTaskSchema,
  housekeepingTaskUpdateSchema,
  lostFoundSchema,
  serviceRequestSchema,
  serviceRequestUpdateSchema,
  workOrderSchema,
  workOrderUpdateSchema,
  WorkOrderStatus,
} from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { d, iso, nextSequence, today } from '../../common/util';
import { PropertiesService } from '../properties/properties.service';
import { FinanceService } from '../finance/finance.service';
import { NotificationsService } from '../notifications/notifications.service';
import { defaultChecklist } from '../frontdesk/frontdesk.service';

@Injectable()
export class OperationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly properties: PropertiesService,
    private readonly finance: FinanceService,
    private readonly notifications: NotificationsService,
  ) {}

  // ---------------------------------------------------------------- Housekeeping

  async tasks(ctx: RequestContext, q: { status?: string; mine?: boolean }) {
    const restrictToOwn = q.mine || (!ctx.permissions.has('housekeeping.supervise') && !ctx.permissions.has('rooms.manage'));
    return this.prisma.housekeepingTask.findMany({
      where: {
        propertyId: ctx.propertyId,
        ...(q.status ? { status: q.status } : { status: { in: ['PENDING', 'IN_PROGRESS', 'DONE'] } }),
        ...(restrictToOwn ? { OR: [{ assignedToId: ctx.userId }, { assignedToId: null }] } : {}),
      },
      include: { room: { select: { id: true, number: true, housekeepingStatus: true, doNotDisturb: true, floor: { select: { name: true } } } } },
      orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
      take: 500,
    });
  }

  async createTask(ctx: RequestContext, input: z.infer<typeof housekeepingTaskSchema>) {
    await this.properties.ensureRoom(ctx, input.roomId);
    if (input.assignedToId) await this.ensureStaff(ctx, input.assignedToId);
    const t = await this.prisma.housekeepingTask.create({
      data: { propertyId: ctx.propertyId, ...input, dueAt: input.dueAt ? new Date(input.dueAt) : null, createdById: ctx.userId, checklist: defaultChecklist(input.type) },
    });
    await this.audit.log(ctx, 'HK_TASK_CREATED', 'HousekeepingTask', t.id, { roomId: input.roomId, type: input.type });
    return t;
  }

  /**
   * Task workflow drives room housekeeping status:
   * IN_PROGRESS → room CLEANING; DONE → CLEAN or AWAITING_INSPECTION (when policy requires inspection);
   * INSPECTED (supervisor only) → room INSPECTED.
   */
  async updateTask(ctx: RequestContext, id: string, input: z.infer<typeof housekeepingTaskUpdateSchema>) {
    return this.prisma.$transaction(async (tx) => {
      const task = await tx.housekeepingTask.findFirst({ where: { id, propertyId: ctx.propertyId }, include: { room: true } });
      if (!task) throw notFound('TASK');
      const supervisor = ctx.permissions.has('housekeeping.supervise');
      if (!supervisor && task.assignedToId && task.assignedToId !== ctx.userId) throw new AppError('TASK_ASSIGNED_TO_OTHER', 403);
      if ((input.assignedToId !== undefined || input.priority) && !supervisor) throw new AppError('PERMISSION_DENIED', 403, { missing: ['housekeeping.supervise'] });
      if (input.assignedToId) await this.ensureStaff(ctx, input.assignedToId);
      const data: Prisma.HousekeepingTaskUpdateInput = {};
      if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;
      if (input.priority) data.priority = input.priority;
      if (input.checklist) data.checklist = input.checklist;
      if (input.notes !== undefined) data.notes = input.notes;
      if (input.status && input.status !== task.status) {
        const allowed: Record<string, string[]> = {
          PENDING: ['IN_PROGRESS', 'CANCELLED'],
          IN_PROGRESS: ['DONE', 'PENDING'],
          DONE: ['INSPECTED', 'IN_PROGRESS'],
          INSPECTED: [],
          CANCELLED: [],
        };
        if (!allowed[task.status]?.includes(input.status)) throw new AppError('INVALID_TASK_TRANSITION', 409, { from: task.status, to: input.status });
        if (input.status === 'INSPECTED' && !supervisor) throw new AppError('PERMISSION_DENIED', 403, { missing: ['housekeeping.supervise'] });
        if (input.status === 'IN_PROGRESS' && task.room.doNotDisturb) throw new AppError('ROOM_DO_NOT_DISTURB', 409);
        data.status = input.status;
        const policy = await tx.checkInPolicy.findUnique({ where: { propertyId: ctx.propertyId } });
        let roomStatus: string | null = null;
        if (input.status === 'IN_PROGRESS') {
          data.startedAt = new Date();
          if (!data.assignedToId && !task.assignedToId) data.assignedToId = ctx.userId;
          if (task.type !== 'INSPECTION') roomStatus = 'CLEANING';
        } else if (input.status === 'DONE') {
          data.completedAt = new Date();
          roomStatus = task.type === 'INSPECTION' ? null : policy?.requireInspectedRoom ? 'AWAITING_INSPECTION' : 'CLEAN';
        } else if (input.status === 'INSPECTED') {
          data.inspectedById = ctx.userId;
          data.inspectedAt = new Date();
          roomStatus = 'INSPECTED';
        }
        if (roomStatus && roomStatus !== task.room.housekeepingStatus) {
          await tx.room.update({ where: { id: task.roomId }, data: { housekeepingStatus: roomStatus as any } });
          await tx.roomStatusHistory.create({ data: { propertyId: ctx.propertyId, roomId: task.roomId, field: 'housekeepingStatus', fromValue: task.room.housekeepingStatus, toValue: roomStatus, reason: `TASK_${input.status}`, actorId: ctx.userId } });
        }
      }
      const updated = await tx.housekeepingTask.update({ where: { id }, data });
      await this.audit.log(ctx, 'HK_TASK_UPDATED', 'HousekeepingTask', id, input as Record<string, unknown>, tx);
      return updated;
    });
  }

  /** Room board: housekeeping, maintenance, occupancy shown as separate dimensions. */
  async board(ctx: RequestContext) {
    return this.properties.rooms(ctx, {});
  }

  lostFound(ctx: RequestContext) {
    return this.prisma.lostFoundItem.findMany({ where: { propertyId: ctx.propertyId }, orderBy: { createdAt: 'desc' }, take: 200 });
  }

  async addLostFound(ctx: RequestContext, input: z.infer<typeof lostFoundSchema>) {
    if (input.roomId) await this.properties.ensureRoom(ctx, input.roomId);
    const item = await this.prisma.lostFoundItem.create({ data: { propertyId: ctx.propertyId, ...input, foundById: ctx.userId } });
    await this.audit.log(ctx, 'LOST_FOUND_LOGGED', 'LostFoundItem', item.id, { roomId: input.roomId });
    return item;
  }

  async closeLostFound(ctx: RequestContext, id: string, status: 'RETURNED' | 'DISPOSED', returnedTo?: string) {
    const n = await this.prisma.lostFoundItem.updateMany({ where: { id, propertyId: ctx.propertyId, status: 'STORED' }, data: { status, returnedTo: returnedTo ?? null, closedAt: new Date() } });
    if (!n.count) throw notFound('ITEM');
    await this.audit.log(ctx, 'LOST_FOUND_CLOSED', 'LostFoundItem', id, { status });
    return { ok: true };
  }

  // ---------------------------------------------------------------- Maintenance

  workOrders(ctx: RequestContext, status?: string) {
    return this.prisma.maintenanceWorkOrder.findMany({
      where: { propertyId: ctx.propertyId, ...(status ? { status } : { status: { notIn: ['CLOSED', 'CANCELLED'] } }) },
      include: { room: { select: { id: true, number: true } }, notes: { orderBy: { createdAt: 'desc' }, take: 20 } },
      orderBy: [{ createdAt: 'desc' }],
      take: 300,
    }).then((rows) => rows.map((w) => ({ ...w, blockFrom: iso(w.blockFrom), blockUntil: iso(w.blockUntil) })));
  }

  /** Recomputes a room's maintenance status from its open work orders. */
  private async syncRoomMaintenance(tx: Tx, ctx: RequestContext, roomId: string, reason: string) {
    const date = today(ctx.property);
    const open = await tx.maintenanceWorkOrder.findMany({ where: { roomId, status: { notIn: ['CLOSED', 'CANCELLED'] } } });
    const blocking = open.filter((w) => w.blockType !== 'NONE' && (!w.blockFrom || iso(w.blockFrom)! <= date) && (!w.blockUntil || iso(w.blockUntil)! > date));
    let status = 'OPERATIONAL';
    if (blocking.some((w) => w.blockType === 'OUT_OF_ORDER')) status = 'OUT_OF_ORDER';
    else if (blocking.some((w) => w.blockType === 'OUT_OF_SERVICE')) status = 'OUT_OF_SERVICE';
    else if (open.some((w) => w.status === 'IN_PROGRESS')) status = 'UNDER_MAINTENANCE';
    else if (open.length) status = 'MAINTENANCE_REQUESTED';
    const room = await tx.room.findUniqueOrThrow({ where: { id: roomId } });
    if (room.maintenanceStatus !== status) {
      await tx.room.update({ where: { id: roomId }, data: { maintenanceStatus: status as any } });
      await tx.roomStatusHistory.create({ data: { propertyId: ctx.propertyId, roomId, field: 'maintenanceStatus', fromValue: room.maintenanceStatus, toValue: status, reason, actorId: ctx.userId } });
    }
  }

  async createWorkOrder(ctx: RequestContext, input: z.infer<typeof workOrderSchema>) {
    if (input.blockType !== 'NONE' && !input.roomId) throw new AppError('ROOM_REQUIRED_FOR_BLOCK');
    if (input.blockType !== 'NONE' && !ctx.permissions.has('maintenance.approve') && !ctx.permissions.has('housekeeping.supervise')) {
      throw new AppError('PERMISSION_DENIED', 403, { missing: ['maintenance.approve'] });
    }
    if (input.blockFrom && input.blockUntil && input.blockFrom >= input.blockUntil) throw new AppError('END_BEFORE_START');
    return this.prisma.$transaction(async (tx) => {
      if (input.roomId) await this.properties.ensureRoom(ctx, input.roomId, tx);
      const blockFrom = input.blockType !== 'NONE' ? input.blockFrom ?? today(ctx.property) : null;
      // Warn about guests already allocated to a room being blocked.
      let conflicts: { start: string; end: string }[] = [];
      if (input.roomId && blockFrom) {
        const allocs = await tx.roomAssignment.findMany({
          where: { roomId: input.roomId, status: { in: ['PLANNED', 'ACTIVE'] }, endDate: { gt: d(blockFrom) }, ...(input.blockUntil ? { startDate: { lt: d(input.blockUntil) } } : {}) },
        });
        conflicts = allocs.map((a) => ({ start: iso(a.startDate)!, end: iso(a.endDate)! }));
      }
      const number = await nextSequence(tx, ctx.propertyId, 'workorder');
      const wo = await tx.maintenanceWorkOrder.create({
        data: {
          propertyId: ctx.propertyId,
          number,
          roomId: input.roomId,
          title: input.title,
          description: input.description,
          category: input.category,
          severity: input.severity,
          priority: input.priority,
          blockType: input.blockType,
          blockFrom: blockFrom ? d(blockFrom) : null,
          blockUntil: input.blockUntil ? d(input.blockUntil) : null,
          assignedToId: input.assignedToId,
          status: input.assignedToId ? 'ASSIGNED' : 'OPEN',
          estimatedCost: input.estimatedCost,
          reportedById: ctx.userId,
        },
      });
      if (input.roomId) await this.syncRoomMaintenance(tx, ctx, input.roomId, `WORK_ORDER_${number}`);
      await this.audit.log(ctx, 'WORK_ORDER_CREATED', 'MaintenanceWorkOrder', wo.id, { number, blockType: input.blockType, conflicts: conflicts.length }, tx);
      return { ...wo, conflicts };
    });
  }

  /** Closing a work order (releasing the room) requires maintenance.approve. */
  async updateWorkOrder(ctx: RequestContext, id: string, input: z.infer<typeof workOrderUpdateSchema>) {
    return this.prisma.$transaction(async (tx) => {
      const wo = await tx.maintenanceWorkOrder.findFirst({ where: { id, propertyId: ctx.propertyId } });
      if (!wo) throw notFound('WORK_ORDER');
      const data: Prisma.MaintenanceWorkOrderUpdateInput = {};
      if (input.status && input.status !== wo.status) {
        if (!canTransitionWorkOrder(wo.status as WorkOrderStatus, input.status)) throw new AppError('INVALID_STATUS_TRANSITION', 409, { from: wo.status, to: input.status });
        if (['CLOSED', 'CANCELLED'].includes(input.status) && !ctx.permissions.has('maintenance.approve')) {
          throw new AppError('PERMISSION_DENIED', 403, { missing: ['maintenance.approve'] });
        }
        data.status = input.status;
        if (input.status === 'RESOLVED') data.resolvedAt = new Date();
        if (input.status === 'CLOSED') Object.assign(data, { closedAt: new Date(), approvedById: ctx.userId });
      }
      if (input.assignedToId !== undefined) {
        if (input.assignedToId) await this.ensureStaff(ctx, input.assignedToId);
        data.assignedToId = input.assignedToId;
        if (input.assignedToId && wo.status === 'OPEN' && !input.status) data.status = 'ASSIGNED';
      }
      if (input.priority) data.priority = input.priority;
      if (input.partsNotes !== undefined) data.partsNotes = input.partsNotes;
      if (input.estimatedCost !== undefined) data.estimatedCost = input.estimatedCost;
      const updated = await tx.maintenanceWorkOrder.update({ where: { id }, data });
      if (input.note) await tx.workOrderNote.create({ data: { workOrderId: id, authorId: ctx.userId, body: input.note } });
      if (wo.roomId) {
        await this.syncRoomMaintenance(tx, ctx, wo.roomId, `WORK_ORDER_${wo.number}_${updated.status}`);
        if (updated.status === 'CLOSED' && wo.blockType !== 'NONE') {
          // Released rooms must be cleaned and inspected before sale.
          const room = await tx.room.findUniqueOrThrow({ where: { id: wo.roomId } });
          if (room.housekeepingStatus !== 'DIRTY') {
            await tx.room.update({ where: { id: wo.roomId }, data: { housekeepingStatus: 'DIRTY' } });
            await tx.roomStatusHistory.create({ data: { propertyId: ctx.propertyId, roomId: wo.roomId, field: 'housekeepingStatus', fromValue: room.housekeepingStatus, toValue: 'DIRTY', reason: 'MAINTENANCE_RELEASED', actorId: ctx.userId } });
          }
          await tx.housekeepingTask.create({ data: { propertyId: ctx.propertyId, roomId: wo.roomId, type: 'DEEP_CLEAN', priority: 'NORMAL', createdById: ctx.userId, checklist: defaultChecklist('DEEP_CLEAN') } });
        }
      }
      await this.audit.log(ctx, 'WORK_ORDER_UPDATED', 'MaintenanceWorkOrder', id, input as Record<string, unknown>, tx);
      return updated;
    });
  }

  // ---------------------------------------------------------------- Guest services

  serviceRequests(ctx: RequestContext, q: { status?: string; department?: string }) {
    return this.prisma.serviceRequest.findMany({
      where: { propertyId: ctx.propertyId, ...(q.status ? { status: q.status } : { status: { in: ['OPEN', 'IN_PROGRESS'] } }), ...(q.department ? { department: q.department } : {}) },
      orderBy: [{ createdAt: 'asc' }],
      take: 300,
    });
  }

  async createServiceRequest(ctx: RequestContext, input: z.infer<typeof serviceRequestSchema> & { guestId?: string | null; reservationId?: string | null }, tx?: Tx) {
    const run = async (db: Tx) => {
      let roomId = input.roomId;
      let reservationId = input.reservationId ?? null;
      let guestId = input.guestId ?? null;
      if (input.stayId) {
        const stay = await db.stay.findFirst({ where: { id: input.stayId, propertyId: ctx.propertyId }, include: { reservation: true, reservationRoom: { include: { assignments: { where: { status: 'ACTIVE' } } } } } });
        if (!stay) throw notFound('STAY');
        roomId = roomId ?? stay.reservationRoom.assignments[0]?.roomId ?? null;
        reservationId = stay.reservationId;
        guestId = guestId ?? stay.reservation.primaryGuestId;
      }
      if (roomId) await this.properties.ensureRoom(ctx, roomId, db);
      const sr = await db.serviceRequest.create({
        data: {
          propertyId: ctx.propertyId,
          stayId: input.stayId,
          roomId,
          guestId,
          reservationId,
          category: input.category,
          description: input.description,
          priority: input.priority,
          department: input.department,
          assignedToId: input.assignedToId,
          chargeAmount: input.chargeAmount,
          createdByGuest: !!ctx.isGuest,
          createdById: ctx.userId,
        },
      });
      await this.audit.log(ctx, 'SERVICE_REQUEST_CREATED', 'ServiceRequest', sr.id, { category: input.category }, db, ctx.isGuest ? 'GUEST' : 'USER');
      return sr;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  /** Completing a request with a charge posts it to the reservation folio exactly once. */
  async updateServiceRequest(ctx: RequestContext, id: string, input: z.infer<typeof serviceRequestUpdateSchema>) {
    return this.prisma.$transaction(async (tx) => {
      const sr = await tx.serviceRequest.findFirst({ where: { id, propertyId: ctx.propertyId } });
      if (!sr) throw notFound('SERVICE_REQUEST');
      if (['COMPLETED', 'CANCELLED'].includes(sr.status)) throw new AppError('SERVICE_REQUEST_CLOSED', 409);
      const data: Prisma.ServiceRequestUpdateInput = {};
      if (input.assignedToId !== undefined) data.assignedToId = input.assignedToId;
      if (input.resolution !== undefined) data.resolution = input.resolution;
      if (input.chargeAmount !== undefined) data.chargeAmount = input.chargeAmount;
      if (input.status) {
        data.status = input.status;
        if (input.status === 'IN_PROGRESS') data.startedAt = new Date();
        if (input.status === 'COMPLETED') data.completedAt = new Date();
      }
      const charge = input.chargeAmount ?? sr.chargeAmount?.toString();
      if (input.status === 'COMPLETED' && charge && Number(charge) > 0 && sr.reservationId) {
        if (!ctx.permissions.has('folio.post')) throw new AppError('PERMISSION_DENIED', 403, { missing: ['folio.post'] });
        const folio = await this.finance.primaryFolio(tx, sr.reservationId);
        const type = sr.category === 'MINIBAR' ? 'MINIBAR' : sr.category === 'LAUNDRY' ? 'LAUNDRY' : sr.category === 'ROOM_SERVICE' ? 'RESTAURANT' : 'SERVICE';
        const entry = await this.finance.post(tx, { folioId: folio.id, propertyId: ctx.propertyId, type, description: `${sr.category}: ${sr.description.slice(0, 80)}`, amount: charge, businessDate: today(ctx.property), postedById: ctx.userId, idempotencyKey: `service:${sr.id}` });
        data.chargePostedId = entry.id;
      }
      const updated = await tx.serviceRequest.update({ where: { id }, data });
      if (input.status && sr.guestId) {
        const g = await tx.guest.findUnique({ where: { id: sr.guestId } });
        if (g) await this.notifications.enqueue({ propertyId: ctx.propertyId, channel: 'EMAIL', template: 'SERVICE_UPDATE', locale: g.preferredLocale, recipient: g.email, payload: { name: g.firstName, status: input.status }, dedupeKey: `sr:${id}:${input.status}` }, tx);
      }
      await this.audit.log(ctx, 'SERVICE_REQUEST_UPDATED', 'ServiceRequest', id, input as Record<string, unknown>, tx);
      return updated;
    });
  }

  private async ensureStaff(ctx: RequestContext, userId: string) {
    const role = await this.prisma.userRole.findFirst({ where: { userId, OR: [{ propertyId: ctx.propertyId }, { groupId: ctx.property.groupId, propertyId: null }] } });
    if (!role) throw notFound('STAFF');
  }
}
