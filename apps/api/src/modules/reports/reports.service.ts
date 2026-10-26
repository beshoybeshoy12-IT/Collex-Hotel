import { Injectable } from '@nestjs/common';
import { Decimal, stayNights } from '@collex/shared';
import { PrismaService } from '../../common/prisma.service';
import type { RequestContext } from '../../common/context';
import { d, iso } from '../../common/util';
import { addDays } from '@collex/shared';

/**
 * Report formulas (all per property, business dates in property time zone, ranges inclusive):
 *  - Available room-nights = active rooms × nights − room-nights blocked by OOO/OOS work orders.
 *  - Occupied room-nights  = nights covered by room lines of CONFIRMED / CHECKED_IN / CHECKED_OUT reservations.
 *  - Occupancy %           = occupied / available × 100.
 *  - Room revenue          = sum of snapshotted nightly room prices for occupied nights (net of taxes).
 *  - ADR                   = room revenue / occupied room-nights.
 *  - RevPAR                = room revenue / available room-nights.
 */
@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  async performance(ctx: RequestContext, from: string, to: string, categoryId?: string) {
    const end = addDays(to, 1);
    const nights = stayNights(from, end);
    const rooms = await this.prisma.room.findMany({ where: { propertyId: ctx.propertyId, active: true, ...(categoryId ? { categoryId } : {}) }, select: { id: true, categoryId: true } });
    const roomIds = new Set(rooms.map((r) => r.id));
    const blocks = await this.prisma.maintenanceWorkOrder.findMany({
      where: { propertyId: ctx.propertyId, blockType: { not: 'NONE' }, status: { not: 'CANCELLED' }, roomId: { in: [...roomIds] }, blockFrom: { lt: d(end) }, OR: [{ blockUntil: null }, { blockUntil: { gt: d(from) } }] },
      select: { roomId: true, blockFrom: true, blockUntil: true, closedAt: true },
    });
    const lines = await this.prisma.reservationRoom.findMany({
      where: {
        propertyId: ctx.propertyId,
        ...(categoryId ? { categoryId } : {}),
        arrivalDate: { lt: d(end) },
        departureDate: { gt: d(from) },
        reservation: { status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } },
      },
      select: { categoryId: true, nightlyRates: true, arrivalDate: true, departureDate: true },
    });
    const daily = nights.map((date) => {
      const blocked = new Set(blocks.filter((b) => iso(b.blockFrom)! <= date && (!b.blockUntil || date < iso(b.blockUntil)!)).map((b) => b.roomId)).size;
      const available = rooms.length - blocked;
      let occupied = 0;
      let revenue = new Decimal(0);
      for (const l of lines) {
        if (iso(l.arrivalDate)! <= date && date < iso(l.departureDate)!) {
          occupied++;
          const n = (l.nightlyRates as { date: string; amount: string }[]).find((x) => x.date === date);
          if (n) revenue = revenue.plus(n.amount);
        }
      }
      return { date, available, occupied, revenue };
    });
    const totals = daily.reduce((a, x) => ({ available: a.available + x.available, occupied: a.occupied + x.occupied, revenue: a.revenue.plus(x.revenue) }), { available: 0, occupied: 0, revenue: new Decimal(0) });
    const ratio = (num: Decimal | number, den: number) => (den ? new Decimal(num).dividedBy(den) : new Decimal(0));
    return {
      from,
      to,
      currency: ctx.property.currency,
      totals: {
        availableRoomNights: totals.available,
        occupiedRoomNights: totals.occupied,
        occupancyPercent: ratio(totals.occupied * 100, totals.available).toFixed(1),
        roomRevenue: totals.revenue.toFixed(2),
        adr: ratio(totals.revenue, totals.occupied).toFixed(2),
        revpar: ratio(totals.revenue, totals.available).toFixed(2),
      },
      daily: daily.map((x) => ({
        date: x.date,
        available: x.available,
        occupied: x.occupied,
        occupancyPercent: ratio(x.occupied * 100, x.available).toFixed(1),
        revenue: x.revenue.toFixed(2),
        adr: ratio(x.revenue, x.occupied).toFixed(2),
        revpar: ratio(x.revenue, x.available).toFixed(2),
      })),
    };
  }

  async bookings(ctx: RequestContext, from: string, to: string) {
    const created = await this.prisma.reservation.findMany({
      where: { propertyId: ctx.propertyId, createdAt: { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${addDays(to, 1)}T00:00:00Z`) } },
      select: { status: true, source: true, grandTotal: true, rooms: { select: { categoryId: true } } },
    });
    const byStatus: Record<string, number> = {};
    const bySource: Record<string, number> = {};
    const byCategory: Record<string, { count: number; revenue: Decimal }> = {};
    for (const r of created) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      bySource[r.source] = (bySource[r.source] ?? 0) + 1;
      for (const room of r.rooms) {
        byCategory[room.categoryId] ??= { count: 0, revenue: new Decimal(0) };
        byCategory[room.categoryId].count++;
        byCategory[room.categoryId].revenue = byCategory[room.categoryId].revenue.plus(new Decimal(r.grandTotal.toString()).dividedBy(r.rooms.length));
      }
    }
    const cats = await this.prisma.roomCategory.findMany({ where: { propertyId: ctx.propertyId } });
    const [arrivals, departures] = await Promise.all([
      this.prisma.reservation.count({ where: { propertyId: ctx.propertyId, arrivalDate: { gte: d(from), lte: d(to) }, status: { in: ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'] } } }),
      this.prisma.reservation.count({ where: { propertyId: ctx.propertyId, departureDate: { gte: d(from), lte: d(to) }, status: { in: ['CHECKED_IN', 'CHECKED_OUT'] } } }),
    ]);
    const total = created.length;
    return {
      total,
      arrivals,
      departures,
      cancellationRatePercent: total ? (((byStatus.CANCELLED ?? 0) * 100) / total).toFixed(1) : '0.0',
      noShows: byStatus.NO_SHOW ?? 0,
      byStatus,
      bySource,
      byCategory: cats.map((c) => ({ categoryId: c.id, code: c.code, nameEn: c.nameEn, nameAr: c.nameAr, bookings: byCategory[c.id]?.count ?? 0, revenue: (byCategory[c.id]?.revenue ?? new Decimal(0)).toFixed(2) })),
    };
  }

  async operations(ctx: RequestContext, from: string, to: string) {
    const range = { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${addDays(to, 1)}T00:00:00Z`) };
    const [tasks, workOrders, requests] = await Promise.all([
      this.prisma.housekeepingTask.findMany({ where: { propertyId: ctx.propertyId, completedAt: range }, select: { assignedToId: true, startedAt: true, completedAt: true, type: true } }),
      this.prisma.maintenanceWorkOrder.findMany({ where: { propertyId: ctx.propertyId, createdAt: range }, select: { status: true, category: true, createdAt: true, resolvedAt: true, blockType: true, blockFrom: true, blockUntil: true, closedAt: true } }),
      this.prisma.serviceRequest.findMany({ where: { propertyId: ctx.propertyId, createdAt: range }, select: { status: true, category: true, createdAt: true, startedAt: true, completedAt: true } }),
    ]);
    const users = await this.prisma.user.findMany({ where: { id: { in: tasks.map((t) => t.assignedToId).filter(Boolean) as string[] } }, select: { id: true, fullName: true } });
    const perStaff = new Map<string, { name: string; tasks: number; minutes: number }>();
    for (const t of tasks) {
      const key = t.assignedToId ?? 'unassigned';
      const e = perStaff.get(key) ?? { name: users.find((u) => u.id === key)?.fullName ?? '-', tasks: 0, minutes: 0 };
      e.tasks++;
      if (t.startedAt && t.completedAt) e.minutes += (t.completedAt.getTime() - t.startedAt.getTime()) / 60000;
      perStaff.set(key, e);
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const resolvedHours = workOrders.filter((w) => w.resolvedAt).map((w) => (w.resolvedAt!.getTime() - w.createdAt.getTime()) / 3_600_000);
    const responseMin = requests.filter((r) => r.startedAt).map((r) => (r.startedAt!.getTime() - r.createdAt.getTime()) / 60000);
    const completionMin = requests.filter((r) => r.completedAt).map((r) => (r.completedAt!.getTime() - r.createdAt.getTime()) / 60000);
    const downtimeNights = workOrders
      .filter((w) => w.blockType !== 'NONE' && w.blockFrom)
      .reduce((acc, w) => {
        const endIso = w.blockUntil ? iso(w.blockUntil)! : addDays(to, 1);
        const s = iso(w.blockFrom)! < from ? from : iso(w.blockFrom)!;
        const e = endIso > addDays(to, 1) ? addDays(to, 1) : endIso;
        return acc + Math.max(0, stayNights(s, e).length);
      }, 0);
    return {
      housekeeping: {
        tasksCompleted: tasks.length,
        perStaff: [...perStaff.values()].map((s) => ({ ...s, avgMinutes: s.tasks ? (s.minutes / s.tasks).toFixed(0) : '0' })),
      },
      maintenance: {
        incidents: workOrders.length,
        open: workOrders.filter((w) => !['CLOSED', 'CANCELLED', 'RESOLVED'].includes(w.status)).length,
        avgResolutionHours: avg(resolvedHours).toFixed(1),
        outOfOrderRoomNights: downtimeNights,
        byCategory: workOrders.reduce<Record<string, number>>((a, w) => ((a[w.category] = (a[w.category] ?? 0) + 1), a), {}),
      },
      services: {
        requests: requests.length,
        avgResponseMinutes: avg(responseMin).toFixed(0),
        avgCompletionMinutes: avg(completionMin).toFixed(0),
        byCategory: requests.reduce<Record<string, number>>((a, r) => ((a[r.category] = (a[r.category] ?? 0) + 1), a), {}),
      },
    };
  }

  /** Financial summary: payments by method (reconciliation) and open folio balances. Guest names only, no contact data. */
  async financial(ctx: RequestContext, from: string, to: string) {
    const range = { gte: new Date(`${from}T00:00:00Z`), lt: new Date(`${addDays(to, 1)}T00:00:00Z`) };
    const [payments, refunds, entries, openFolios] = await Promise.all([
      this.prisma.payment.groupBy({ by: ['method', 'status'], where: { propertyId: ctx.propertyId, createdAt: range }, _sum: { amount: true }, _count: true }),
      this.prisma.refund.aggregate({ where: { payment: { propertyId: ctx.propertyId }, createdAt: range, status: 'SUCCEEDED' }, _sum: { amount: true }, _count: true }),
      this.prisma.folioEntry.groupBy({ by: ['type'], where: { propertyId: ctx.propertyId, businessDate: { gte: d(from), lte: d(to) } }, _sum: { amount: true } }),
      this.prisma.folio.findMany({
        where: { propertyId: ctx.propertyId, status: 'OPEN' },
        include: { entries: { select: { amount: true } }, reservation: { select: { confirmationNo: true, status: true, primaryGuest: { select: { firstName: true, lastName: true } } } } },
      }),
    ]);
    const outstanding = openFolios
      .map((f) => ({
        folioId: f.id,
        folioNumber: f.number,
        reservationId: f.reservationId,
        confirmationNo: f.reservation.confirmationNo,
        reservationStatus: f.reservation.status,
        guestName: `${f.reservation.primaryGuest.firstName} ${f.reservation.primaryGuest.lastName}`,
        balance: f.entries.reduce((a, e) => a.plus(e.amount.toString()), new Decimal(0)),
      }))
      .filter((f) => !f.balance.isZero())
      .map((f) => ({ ...f, balance: f.balance.toFixed(2) }));
    return {
      currency: ctx.property.currency,
      paymentsByMethod: payments.map((p) => ({ method: p.method, status: p.status, count: p._count, amount: (p._sum.amount ?? 0).toString() })),
      refunds: { count: refunds._count, amount: (refunds._sum.amount ?? 0).toString() },
      revenueByType: entries.map((e) => ({ type: e.type, amount: (e._sum.amount ?? 0).toString() })),
      outstanding,
      outstandingTotal: outstanding.reduce((a, f) => a.plus(f.balance), new Decimal(0)).toFixed(2),
    };
  }
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    let s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v);
    // Neutralise spreadsheet formula injection.
    if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return '﻿' + [headers.join(','), ...rows.map((r) => headers.map((h) => esc(r[h])).join(','))].join('\n');
}
