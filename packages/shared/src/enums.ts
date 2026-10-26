/** Domain enumerations shared by API and web. Keep in sync with prisma/schema.prisma. */

export const ReservationStatus = [
  'INQUIRY',
  'PENDING',
  'AWAITING_PAYMENT',
  'CONFIRMED',
  'CHECKED_IN',
  'CHECKED_OUT',
  'CANCELLED',
  'NO_SHOW',
  'EXPIRED',
] as const;
export type ReservationStatus = (typeof ReservationStatus)[number];

export const HousekeepingStatus = ['DIRTY', 'CLEANING', 'CLEAN', 'AWAITING_INSPECTION', 'INSPECTED'] as const;
export type HousekeepingStatus = (typeof HousekeepingStatus)[number];

export const MaintenanceStatus = [
  'OPERATIONAL',
  'MAINTENANCE_REQUESTED',
  'UNDER_MAINTENANCE',
  'OUT_OF_ORDER',
  'OUT_OF_SERVICE',
] as const;
export type MaintenanceStatus = (typeof MaintenanceStatus)[number];

export const DocumentStatus = [
  'NOT_REQUIRED',
  'REQUIRED',
  'AWAITING_UPLOAD',
  'UPLOADED',
  'AWAITING_REVIEW',
  'VERIFIED',
  'REJECTED',
  'EXPIRED',
  'REUPLOAD_REQUESTED',
] as const;
export type DocumentStatus = (typeof DocumentStatus)[number];

export const DocumentTypeCode = ['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT', 'DRIVING_LICENSE', 'OTHER'] as const;
export type DocumentTypeCode = (typeof DocumentTypeCode)[number];

export const AssignmentStatus = ['PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'MOVED'] as const;
export type AssignmentStatus = (typeof AssignmentStatus)[number];

export const AssignmentSource = ['AUTO', 'MANUAL', 'WALK_IN', 'GROUP', 'MOVE', 'UPGRADE'] as const;
export type AssignmentSource = (typeof AssignmentSource)[number];

export const ReservationSource = ['WEB', 'WALK_IN', 'PHONE', 'EMAIL', 'OTA', 'CORPORATE', 'GROUP'] as const;
export type ReservationSource = (typeof ReservationSource)[number];

export const HousekeepingTaskType = ['DEPARTURE_CLEAN', 'STAYOVER', 'INSPECTION', 'TOUCH_UP', 'DEEP_CLEAN'] as const;
export type HousekeepingTaskType = (typeof HousekeepingTaskType)[number];

export const TaskStatus = ['PENDING', 'IN_PROGRESS', 'DONE', 'INSPECTED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TaskStatus)[number];

export const WorkOrderStatus = ['OPEN', 'ASSIGNED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED', 'CLOSED', 'CANCELLED'] as const;
export type WorkOrderStatus = (typeof WorkOrderStatus)[number];

export const Priority = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type Priority = (typeof Priority)[number];

export const ServiceCategory = [
  'ROOM_SERVICE',
  'AMENITIES',
  'LAUNDRY',
  'HOUSEKEEPING',
  'MAINTENANCE',
  'WAKE_UP_CALL',
  'TRANSPORT',
  'LUGGAGE',
  'COMPLAINT',
  'MINIBAR',
  'EXTRA_BED',
  'OTHER',
] as const;
export type ServiceCategory = (typeof ServiceCategory)[number];

export const ServiceStatus = ['OPEN', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
export type ServiceStatus = (typeof ServiceStatus)[number];

export const FolioEntryType = [
  'ROOM',
  'TAX',
  'SERVICE_CHARGE',
  'SERVICE',
  'MINIBAR',
  'LAUNDRY',
  'RESTAURANT',
  'DISCOUNT',
  'ADJUSTMENT',
  'PAYMENT',
  'REFUND',
] as const;
export type FolioEntryType = (typeof FolioEntryType)[number];

export const PaymentMethod = ['CASH', 'CARD', 'BANK_TRANSFER', 'ONLINE', 'CITY_LEDGER'] as const;
export type PaymentMethod = (typeof PaymentMethod)[number];

export const PaymentStatus = [
  'PENDING',
  'SUCCEEDED',
  'FAILED',
  'CANCELLED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'DISPUTED',
] as const;
export type PaymentStatus = (typeof PaymentStatus)[number];

export const DocumentScope = ['NONE', 'PRIMARY_GUEST', 'ALL_ADULTS', 'FOREIGN_ADULTS'] as const;
export type DocumentScope = (typeof DocumentScope)[number];

export const Locale = ['ar', 'en'] as const;
export type Locale = (typeof Locale)[number];
export const DEFAULT_LOCALE: Locale = 'ar';
