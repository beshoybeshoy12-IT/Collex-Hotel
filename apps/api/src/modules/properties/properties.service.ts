import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import {
  buildingSchema,
  canTransitionHousekeeping,
  checkInPolicySchema,
  floorPlanSchema,
  floorSchema,
  HousekeepingStatus,
  propertyUpdateSchema,
  roomCategorySchema,
  roomSchema,
  roomStatusSchema,
} from '@collex/shared';
import { PrismaService, Tx } from '../../common/prisma.service';
import { AuditService } from '../../common/audit.service';
import { AppError, notFound } from '../../common/errors';
import type { RequestContext } from '../../common/context';
import { iso, today } from '../../common/util';

@Injectable()
export class PropertiesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  get(ctx: RequestContext) {
    return this.prisma.property.findUniqueOrThrow({ where: { id: ctx.propertyId } });
  }

  async update(ctx: RequestContext, input: z.infer<typeof propertyUpdateSchema>) {
    const before = await this.get(ctx);
    if (input.timezone) {
      try {
        new Intl.DateTimeFormat('en', { timeZone: input.timezone });
      } catch {
        throw new AppError('INVALID_TIMEZONE');
      }
    }
    const updated = await this.prisma.property.update({ where: { id: ctx.propertyId }, data: input });
    await this.audit.log(ctx, 'PROPERTY_UPDATED', 'Property', ctx.propertyId, { changed: Object.keys(input), before: pick(before, Object.keys(input)) });
    return updated;
  }

  async getPolicy(ctx: RequestContext) {
    return this.prisma.checkInPolicy.upsert({ where: { propertyId: ctx.propertyId }, update: {}, create: { propertyId: ctx.propertyId } });
  }

  async updatePolicy(ctx: RequestContext, input: z.infer<typeof checkInPolicySchema>) {
    const policy = await this.prisma.checkInPolicy.upsert({
      where: { propertyId: ctx.propertyId },
      update: input,
      create: { propertyId: ctx.propertyId, ...input },
    });
    await this.audit.log(ctx, 'CHECKIN_POLICY_UPDATED', 'CheckInPolicy', policy.id, input);
    return policy;
  }

  documentTypes(ctx: RequestContext) {
    return this.prisma.documentTypeConfig.findMany({ where: { propertyId: ctx.propertyId }, orderBy: { code: 'asc' } });
  }

  // ---------------- Structure

  buildings(ctx: RequestContext) {
    return this.prisma.building.findMany({
      where: { propertyId: ctx.propertyId },
      include: { floors: { orderBy: { level: 'asc' } } },
      orderBy: { name: 'asc' },
    });
  }

  async createBuilding(ctx: RequestContext, input: z.infer<typeof buildingSchema>) {
    const b = await this.prisma.building.create({ data: { propertyId: ctx.propertyId, ...input } });
    await this.audit.log(ctx, 'BUILDING_CREATED', 'Building', b.id, input);
    return b;
  }

  async createFloor(ctx: RequestContext, input: z.infer<typeof floorSchema>) {
    await this.prisma.building.findFirstOrThrow({ where: { id: input.buildingId, propertyId: ctx.propertyId } }).catch(() => {
      throw notFound('BUILDING');
    });
    const f = await this.prisma.floor.create({ data: { propertyId: ctx.propertyId, ...input } });
    await this.audit.log(ctx, 'FLOOR_CREATED', 'Floor', f.id, input);
    return f;
  }

  categories(ctx: RequestContext) {
    return this.prisma.roomCategory.findMany({
      where: { propertyId: ctx.propertyId },
      orderBy: [{ rank: 'asc' }, { code: 'asc' }],
      include: { _count: { select: { rooms: true } } },
    });
  }

  async upsertCategory(ctx: RequestContext, input: z.infer<typeof roomCategorySchema>, id?: string) {
    if (input.maxOccupancy < input.maxAdults) throw new AppError('OCCUPANCY_LESS_THAN_ADULTS');
    let cat;
    if (id) {
      await this.ensureCategory(ctx, id);
      cat = await this.prisma.roomCategory.update({ where: { id }, data: input });
    } else {
      cat = await this.prisma.roomCategory.create({ data: { propertyId: ctx.propertyId, ...input } });
    }
    await this.audit.log(ctx, id ? 'CATEGORY_UPDATED' : 'CATEGORY_CREATED', 'RoomCategory', cat.id, input);
    return cat;
  }

  async ensureCategory(ctx: RequestContext, id: string, tx: Tx = this.prisma) {
    const c = await tx.roomCategory.findFirst({ where: { id, propertyId: ctx.propertyId } });
    if (!c) throw notFound('CATEGORY');
    return c;
  }

  // ---------------- Rooms

  async rooms(ctx: RequestContext, filters: { floorId?: string; categoryId?: string; q?: string }) {
    const date = today(ctx.property);
    const rooms = await this.prisma.room.findMany({
      where: {
        propertyId: ctx.propertyId,
        ...(filters.floorId ? { floorId: filters.floorId } : {}),
        ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
        ...(filters.q ? { number: { contains: filters.q } } : {}),
      },
      include: {
        category: { select: { id: true, code: true, nameEn: true, nameAr: true, maxOccupancy: true } },
        floor: { select: { id: true, name: true, nameAr: true, level: true } },
        assignments: {
          where: { status: { in: ['PLANNED', 'ACTIVE'] }, endDate: { gt: new Date(date) } },
          orderBy: { startDate: 'asc' },
          take: 3,
          include: {
            reservationRoom: {
              select: { reservation: { select: { id: true, confirmationNo: true, primaryGuest: { select: { firstName: true, lastName: true } } } } },
            },
          },
        },
      },
      orderBy: { number: 'asc' },
    });
    return rooms.map((r) => this.presentRoom(r, date));
  }

  /** Derives occupancy/assignment state; these dimensions are kept separate from housekeeping and maintenance. */
  presentRoom(r: any, date: string) {
    const active = r.assignments.find((a: any) => a.status === 'ACTIVE');
    const nextPlanned = r.assignments.find((a: any) => a.status === 'PLANNED');
    return {
      id: r.id,
      number: r.number,
      category: r.category,
      floor: r.floor,
      housekeepingStatus: r.housekeepingStatus,
      maintenanceStatus: r.maintenanceStatus,
      doNotDisturb: r.doNotDisturb,
      accessible: r.accessible,
      bedType: r.bedType,
      features: r.features,
      active: r.active,
      occupancy: active ? 'OCCUPIED' : 'VACANT',
      assignmentState: active ? 'IN_HOUSE' : nextPlanned && iso(nextPlanned.startDate) === date ? 'ARRIVING_TODAY' : nextPlanned ? 'ASSIGNED_FUTURE' : 'UNASSIGNED',
      currentGuest: active
        ? {
            reservationId: active.reservationRoom.reservation.id,
            confirmationNo: active.reservationRoom.reservation.confirmationNo,
            name: `${active.reservationRoom.reservation.primaryGuest.firstName} ${active.reservationRoom.reservation.primaryGuest.lastName}`,
            departure: iso(active.endDate),
          }
        : null,
      nextArrival: nextPlanned
        ? {
            reservationId: nextPlanned.reservationRoom.reservation.id,
            confirmationNo: nextPlanned.reservationRoom.reservation.confirmationNo,
            arrival: iso(nextPlanned.startDate),
          }
        : null,
    };
  }

  async upsertRoom(ctx: RequestContext, input: z.infer<typeof roomSchema>, id?: string) {
    await this.ensureCategory(ctx, input.categoryId);
    const floor = await this.prisma.floor.findFirst({ where: { id: input.floorId, propertyId: ctx.propertyId } });
    if (!floor) throw notFound('FLOOR');
    let room;
    if (id) {
      await this.ensureRoom(ctx, id);
      room = await this.prisma.room.update({ where: { id }, data: input });
    } else {
      room = await this.prisma.room.create({ data: { propertyId: ctx.propertyId, ...input } });
    }
    await this.audit.log(ctx, id ? 'ROOM_UPDATED' : 'ROOM_CREATED', 'Room', room.id, input);
    return room;
  }

  async ensureRoom(ctx: Pick<RequestContext, 'propertyId'>, id: string, tx: Tx = this.prisma) {
    const r = await tx.room.findFirst({ where: { id, propertyId: ctx.propertyId } });
    if (!r) throw notFound('ROOM');
    return r;
  }

  async roomDetail(ctx: RequestContext, id: string) {
    await this.ensureRoom(ctx, id);
    const [room, history, tasks, workOrders] = await Promise.all([
      this.prisma.room.findUniqueOrThrow({
        where: { id },
        include: {
          category: true,
          floor: true,
          assignments: {
            where: { status: { in: ['PLANNED', 'ACTIVE'] } },
            orderBy: { startDate: 'asc' },
            include: { reservationRoom: { select: { reservation: { select: { id: true, confirmationNo: true, primaryGuest: { select: { firstName: true, lastName: true } } } } } } },
          },
        },
      }),
      this.prisma.roomStatusHistory.findMany({ where: { roomId: id }, orderBy: { createdAt: 'desc' }, take: 30 }),
      this.prisma.housekeepingTask.findMany({ where: { roomId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
      this.prisma.maintenanceWorkOrder.findMany({ where: { roomId: id }, orderBy: { createdAt: 'desc' }, take: 10 }),
    ]);
    return { ...this.presentRoom(room, today(ctx.property)), upcoming: room.assignments.map((a) => ({ id: a.id, status: a.status, start: iso(a.startDate), end: iso(a.endDate), reservation: a.reservationRoom.reservation })), history, tasks, workOrders };
  }

  /** Housekeeping status change with transition rules. Maintenance is changed only via work orders. */
  async setRoomStatus(ctx: RequestContext, id: string, input: z.infer<typeof roomStatusSchema>, tx?: Tx) {
    const run = async (db: Tx) => {
      const room = await this.ensureRoom(ctx, id, db);
      const data: Prisma.RoomUpdateInput = {};
      if (input.housekeepingStatus && input.housekeepingStatus !== room.housekeepingStatus) {
        if (!canTransitionHousekeeping(room.housekeepingStatus as HousekeepingStatus, input.housekeepingStatus)) {
          throw new AppError('INVALID_HOUSEKEEPING_TRANSITION', 400, { from: room.housekeepingStatus, to: input.housekeepingStatus });
        }
        if (input.housekeepingStatus === 'INSPECTED' && !ctx.permissions.has('housekeeping.supervise')) {
          throw new AppError('PERMISSION_DENIED', 403, { missing: ['housekeeping.supervise'] });
        }
        data.housekeepingStatus = input.housekeepingStatus;
        await db.roomStatusHistory.create({
          data: { propertyId: ctx.propertyId, roomId: id, field: 'housekeepingStatus', fromValue: room.housekeepingStatus, toValue: input.housekeepingStatus, reason: input.reason, actorId: ctx.userId },
        });
      }
      if (input.doNotDisturb !== undefined && input.doNotDisturb !== room.doNotDisturb) {
        data.doNotDisturb = input.doNotDisturb;
        await db.roomStatusHistory.create({
          data: { propertyId: ctx.propertyId, roomId: id, field: 'doNotDisturb', fromValue: String(room.doNotDisturb), toValue: String(input.doNotDisturb), reason: input.reason, actorId: ctx.userId },
        });
      }
      const updated = await db.room.update({ where: { id }, data });
      await this.audit.log(ctx, 'ROOM_STATUS_CHANGED', 'Room', id, input as Record<string, unknown>, db);
      return updated;
    };
    return tx ? run(tx) : this.prisma.$transaction(run);
  }

  // ---------------- Floor plans

  async floorPlan(ctx: RequestContext, floorId: string) {
    const floor = await this.prisma.floor.findFirst({ where: { id: floorId, propertyId: ctx.propertyId }, include: { layout: { include: { rooms: true } } } });
    if (!floor) throw notFound('FLOOR');
    return {
      floor: { id: floor.id, name: floor.name, nameAr: floor.nameAr, level: floor.level },
      width: floor.layout?.width ?? 1200,
      height: floor.layout?.height ?? 700,
      rooms: floor.layout?.rooms.map((g) => ({ roomId: g.roomId, x: g.x, y: g.y, w: g.w, h: g.h, rotation: g.rotation })) ?? [],
    };
  }

  async saveFloorPlan(ctx: RequestContext, floorId: string, input: z.infer<typeof floorPlanSchema>) {
    const floor = await this.prisma.floor.findFirst({ where: { id: floorId, propertyId: ctx.propertyId } });
    if (!floor) throw notFound('FLOOR');
    const roomIds = input.rooms.map((r) => r.roomId);
    const valid = await this.prisma.room.count({ where: { id: { in: roomIds }, propertyId: ctx.propertyId } });
    if (valid !== new Set(roomIds).size) throw new AppError('FLOORPLAN_UNKNOWN_ROOM');
    await this.prisma.$transaction(async (tx) => {
      const layout = await tx.floorPlanLayout.upsert({
        where: { floorId },
        update: { width: input.width, height: input.height, updatedById: ctx.userId },
        create: { floorId, width: input.width, height: input.height, updatedById: ctx.userId },
      });
      await tx.roomGeometry.deleteMany({ where: { layoutId: layout.id } });
      await tx.roomGeometry.createMany({ data: input.rooms.map((r) => ({ layoutId: layout.id, ...r })) });
      await this.audit.log(ctx, 'FLOORPLAN_SAVED', 'Floor', floorId, { rooms: input.rooms.length }, tx);
    });
    return this.floorPlan(ctx, floorId);
  }
}

function pick(obj: Record<string, any>, keys: string[]) {
  return Object.fromEntries(keys.map((k) => [k, obj[k]]));
}
