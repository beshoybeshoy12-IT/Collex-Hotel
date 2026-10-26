import type { HousekeepingStatus, ReservationStatus, WorkOrderStatus } from './enums';

/** Allowed reservation status transitions. Validated on the backend for every change. */
export const RESERVATION_TRANSITIONS: Record<ReservationStatus, ReservationStatus[]> = {
  INQUIRY: ['PENDING', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  PENDING: ['AWAITING_PAYMENT', 'CONFIRMED', 'CANCELLED', 'EXPIRED'],
  AWAITING_PAYMENT: ['CONFIRMED', 'CANCELLED', 'EXPIRED'],
  CONFIRMED: ['CHECKED_IN', 'CANCELLED', 'NO_SHOW'],
  CHECKED_IN: ['CHECKED_OUT'],
  CHECKED_OUT: [],
  CANCELLED: [],
  NO_SHOW: [],
  EXPIRED: [],
};

export function canTransitionReservation(from: ReservationStatus, to: ReservationStatus): boolean {
  return RESERVATION_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses that hold inventory (count against availability). */
export const INVENTORY_HOLDING_STATUSES: ReservationStatus[] = [
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
];

export const HOUSEKEEPING_TRANSITIONS: Record<HousekeepingStatus, HousekeepingStatus[]> = {
  DIRTY: ['CLEANING', 'CLEAN'],
  CLEANING: ['CLEAN', 'AWAITING_INSPECTION', 'DIRTY'],
  CLEAN: ['AWAITING_INSPECTION', 'INSPECTED', 'DIRTY'],
  AWAITING_INSPECTION: ['INSPECTED', 'DIRTY'],
  INSPECTED: ['DIRTY'],
};

export function canTransitionHousekeeping(from: HousekeepingStatus, to: HousekeepingStatus): boolean {
  return from === to || (HOUSEKEEPING_TRANSITIONS[from]?.includes(to) ?? false);
}

export const WORK_ORDER_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  OPEN: ['ASSIGNED', 'IN_PROGRESS', 'CANCELLED'],
  ASSIGNED: ['IN_PROGRESS', 'ON_HOLD', 'CANCELLED'],
  IN_PROGRESS: ['ON_HOLD', 'RESOLVED'],
  ON_HOLD: ['IN_PROGRESS', 'CANCELLED'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: [],
  CANCELLED: [],
};

export function canTransitionWorkOrder(from: WorkOrderStatus, to: WorkOrderStatus): boolean {
  return WORK_ORDER_TRANSITIONS[from]?.includes(to) ?? false;
}
