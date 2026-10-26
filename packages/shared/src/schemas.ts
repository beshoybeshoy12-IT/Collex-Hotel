import { z } from 'zod';
import { isIsoDate } from './dates';
import { isCountryCode, isValidDocumentNumber } from './countries';
import {
  DocumentScope,
  DocumentTypeCode,
  FolioEntryType,
  HousekeepingStatus,
  HousekeepingTaskType,
  Locale,
  MaintenanceStatus,
  PaymentMethod,
  Priority,
  ReservationSource,
  ServiceCategory,
  ServiceStatus,
  TaskStatus,
  WorkOrderStatus,
} from './enums';

export const isoDate = z.string().refine(isIsoDate, { message: 'invalid_date' });
/** ISO 3166-1 alpha-2 country code (nationality, issuing country). */
const country = z.string().trim().toUpperCase().refine(isCountryCode, { message: 'invalid_country' });
const money = z.string().regex(/^-?\d{1,10}(\.\d{1,3})?$/, 'invalid_amount');
const positiveMoney = money.refine((v) => Number(v) > 0, 'amount_must_be_positive');
const id = z.string().min(1).max(64);
const shortText = z.string().trim().max(200);
const longText = z.string().trim().max(4000);

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(200),
  mfaCode: z.string().regex(/^\d{6}$/).optional(),
});

export const passwordSchema = z
  .string()
  .min(10, 'password_too_short')
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), 'password_too_weak');

export const passwordResetRequestSchema = z.object({ email: z.string().trim().toLowerCase().email() });
export const passwordResetSchema = z.object({ token: z.string().min(20).max(200), password: passwordSchema });

export const createUserSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  fullName: shortText.min(1),
  password: passwordSchema,
  locale: z.enum(Locale).default('ar'),
  roleCode: z.string().min(1),
});

export const propertyUpdateSchema = z.object({
  name: shortText.min(1).optional(),
  nameAr: shortText.min(1).optional(),
  timezone: z.string().min(1).max(64).optional(),
  currency: z.string().length(3).optional(),
  checkInTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  checkOutTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  taxPercent: money.optional(),
  serviceChargePercent: money.optional(),
  overbookingEnabled: z.boolean().optional(),
  arabicNumerals: z.boolean().optional(),
  descriptionEn: longText.optional(),
  descriptionAr: longText.optional(),
  policiesEn: longText.optional(),
  policiesAr: longText.optional(),
  phone: shortText.optional(),
  email: z.string().email().optional(),
  address: shortText.optional(),
});

export const roomCategorySchema = z.object({
  code: z.string().trim().min(1).max(20).regex(/^[A-Z0-9_-]+$/i),
  nameEn: shortText.min(1),
  nameAr: shortText.min(1),
  descriptionEn: longText.default(''),
  descriptionAr: longText.default(''),
  maxAdults: z.number().int().min(1).max(20),
  maxChildren: z.number().int().min(0).max(20),
  maxOccupancy: z.number().int().min(1).max(30),
  baseOccupancy: z.number().int().min(1).max(20).default(2),
  bedConfig: shortText.default(''),
  amenities: z.array(z.string().max(60)).max(50).default([]),
  images: z.array(z.string().url().max(500)).max(20).default([]),
  sizeSqm: z.number().int().min(0).max(10000).optional(),
  rank: z.number().int().min(0).max(100).default(0),
});

export const buildingSchema = z.object({ name: shortText.min(1), nameAr: shortText.default('') });
export const floorSchema = z.object({ buildingId: id, name: shortText.min(1), nameAr: shortText.default(''), level: z.number().int().min(-10).max(300) });

export const roomSchema = z.object({
  number: z.string().trim().min(1).max(20),
  floorId: id,
  categoryId: id,
  accessible: z.boolean().default(false),
  bedType: z.string().max(40).nullable().default(null),
  features: z.array(z.string().max(40)).max(30).default([]),
  active: z.boolean().default(true),
});

export const roomStatusSchema = z.object({
  housekeepingStatus: z.enum(HousekeepingStatus).optional(),
  doNotDisturb: z.boolean().optional(),
  reason: shortText.optional(),
});

export const floorPlanSchema = z.object({
  width: z.number().int().min(200).max(5000),
  height: z.number().int().min(200).max(5000),
  rooms: z
    .array(
      z.object({
        roomId: id,
        x: z.number().min(0).max(5000),
        y: z.number().min(0).max(5000),
        w: z.number().min(10).max(2000),
        h: z.number().min(10).max(2000),
        rotation: z.number().min(-360).max(360).default(0),
      }),
    )
    .max(1000),
});

export const ratePlanSchema = z.object({
  code: z.string().trim().min(1).max(20),
  nameEn: shortText.min(1),
  nameAr: shortText.min(1),
  refundable: z.boolean().default(true),
  freeCancellationHours: z.number().int().min(0).max(24 * 365).default(24),
  penaltyNights: z.number().int().min(0).max(30).default(1),
  depositPercent: money.default('0'),
  minStay: z.number().int().min(1).max(365).default(1),
  maxStay: z.number().int().min(1).max(365).default(30),
  promoCode: z.string().trim().max(40).nullable().default(null),
  discountPercent: money.default('0'),
  corporateAccount: shortText.nullable().default(null),
  public: z.boolean().default(true),
  active: z.boolean().default(true),
});

export const ratePriceSchema = z
  .object({
    categoryId: id,
    startDate: isoDate,
    endDate: isoDate,
    weekdays: z.array(z.number().int().min(1).max(7)).max(7).default([]),
    amount: positiveMoney,
    extraAdultAmount: money.default('0'),
    extraChildAmount: money.default('0'),
    priority: z.number().int().min(0).max(1000).default(0),
  })
  .refine((v) => v.startDate < v.endDate, { message: 'end_before_start', path: ['endDate'] });

export const restrictionSchema = z.object({
  date: isoDate,
  categoryId: id.nullable().default(null),
  ratePlanId: id.nullable().default(null),
  closed: z.boolean().default(false),
  closedToArrival: z.boolean().default(false),
  closedToDeparture: z.boolean().default(false),
  minStay: z.number().int().min(1).max(365).nullable().default(null),
});

const stayDates = { arrival: isoDate, departure: isoDate };

export const availabilitySearchSchema = z
  .object({
    ...stayDates,
    adults: z.coerce.number().int().min(1).max(20).default(2),
    children: z.coerce.number().int().min(0).max(20).default(0),
    rooms: z.coerce.number().int().min(1).max(20).default(1),
    promoCode: z.string().trim().max(40).optional(),
  })
  .refine((v) => v.arrival < v.departure, { message: 'departure_after_arrival', path: ['departure'] });

export const guestSchema = z.object({
  firstName: shortText.min(1),
  lastName: shortText.min(1),
  email: z.string().trim().toLowerCase().email().max(254).nullable().optional(),
  phone: z.string().trim().max(40).nullable().optional(),
  nationality: country.nullable().optional(),
  dateOfBirth: isoDate.nullable().optional(),
  preferredLocale: z.enum(Locale).default('ar'),
  address: shortText.nullable().optional(),
  vip: z.boolean().default(false),
  notes: longText.nullable().optional(),
  preferences: z
    .object({
      accessible: z.boolean().optional(),
      bedType: z.string().max(40).optional(),
      features: z.array(z.string().max(40)).max(10).optional(),
    })
    .default({}),
});
export type GuestInput = z.infer<typeof guestSchema>;

export const reservationRoomInput = z.object({
  categoryId: id,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
});

export const createReservationSchema = z
  .object({
    ...stayDates,
    ratePlanId: id,
    source: z.enum(ReservationSource).default('PHONE'),
    rooms: z.array(reservationRoomInput).min(1).max(50),
    primaryGuest: guestSchema.optional(),
    primaryGuestId: id.optional(),
    additionalGuests: z.array(guestSchema.extend({ isAdult: z.boolean().default(true) })).max(50).default([]),
    specialRequests: longText.default(''),
    groupName: shortText.nullable().default(null),
    companyName: shortText.nullable().default(null),
    promoCode: z.string().trim().max(40).optional(),
    holdMinutes: z.number().int().min(5).max(24 * 60).optional(),
    confirm: z.boolean().default(true),
  })
  .refine((v) => v.arrival < v.departure, { message: 'departure_after_arrival', path: ['departure'] })
  .refine((v) => v.primaryGuest || v.primaryGuestId, { message: 'guest_required', path: ['primaryGuest'] });
export type CreateReservationInput = z.infer<typeof createReservationSchema>;

export const publicBookingSchema = z
  .object({
    ...stayDates,
    ratePlanId: id,
    rooms: z.array(reservationRoomInput).min(1).max(10),
    guest: guestSchema.pick({ firstName: true, lastName: true, email: true, phone: true, nationality: true, preferredLocale: true }).extend({
      email: z.string().trim().toLowerCase().email().max(254),
    }),
    specialRequests: longText.default(''),
    promoCode: z.string().trim().max(40).optional(),
    acceptPolicies: z.literal(true),
  })
  .refine((v) => v.arrival < v.departure, { message: 'departure_after_arrival', path: ['departure'] });

export const modifyReservationSchema = z
  .object({
    arrival: isoDate.optional(),
    departure: isoDate.optional(),
    specialRequests: longText.optional(),
    groupName: shortText.nullable().optional(),
    companyName: shortText.nullable().optional(),
  });

export const cancelReservationSchema = z.object({ reason: shortText.min(1), waiveFee: z.boolean().default(false) });

export const guestLookupSchema = z.object({
  confirmationNo: z.string().trim().toUpperCase().min(4).max(20),
  lastName: shortText.min(1),
});

const documentMetadataBase = z.object({
  guestId: id,
  reservationId: id.nullable().optional(),
  typeCode: z.enum(DocumentTypeCode),
  issuingCountry: country.nullable().optional(),
  documentNumber: z.string().trim().max(40).nullable().optional(),
  holderName: shortText.nullable().optional(),
  issueDate: isoDate.nullable().optional(),
  expiryDate: isoDate.nullable().optional(),
});

/** Document number format follows the document type (ICAO Doc 9303 for passports). */
export const documentMetadataSchema = documentMetadataBase.superRefine((v, ctx) => {
  if (v.documentNumber && !isValidDocumentNumber(v.typeCode, v.documentNumber)) {
    ctx.addIssue({ code: 'custom', message: 'invalid_document_number', path: ['documentNumber'] });
  }
});

export const documentReviewSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('VERIFY'), legible: z.literal(true), note: shortText.optional() }),
  z.object({ decision: z.literal('REJECT'), reason: shortText.min(3) }),
  z.object({ decision: z.literal('REQUEST_REUPLOAD'), reason: shortText.min(3) }),
]);

export const documentCorrectionSchema = documentMetadataBase
  .pick({ issuingCountry: true, documentNumber: true, holderName: true, issueDate: true, expiryDate: true })
  .extend({ reason: shortText.min(3) });

export const checkInPolicySchema = z.object({
  documentScope: z.enum(DocumentScope),
  acceptedTypes: z.array(z.enum(DocumentTypeCode)).min(1),
  requireVerification: z.boolean(),
  allowExceptions: z.boolean(),
  homeCountry: country.nullable(),
  requireDepositBeforeCheckIn: z.boolean(),
  requireInspectedRoom: z.boolean(),
  documentRetentionDays: z.number().int().min(1).max(3650),
});

export const assignRoomSchema = z.object({
  reservationRoomId: id,
  roomId: id,
  reason: shortText.optional(),
  /** Client's view of the recommendation; server re-validates and rejects stale selections. */
  allowUpgrade: z.boolean().default(false),
});

export const autoAssignSchema = z.object({ reservationId: id, keepTogether: z.boolean().default(true) });

export const roomMoveSchema = z.object({
  stayId: id,
  toRoomId: id,
  reason: shortText.min(3),
  allowUpgrade: z.boolean().default(false),
});

export const checkInSchema = z.object({
  reservationRoomId: id,
  roomId: id.optional(),
  acknowledgements: z.object({ policiesAccepted: z.literal(true), registrationSigned: z.boolean().default(true) }),
  documentException: z.object({ reason: shortText.min(5) }).optional(),
  keyCardsIssued: z.number().int().min(0).max(10).default(0),
});

export const checkOutSchema = z.object({
  stayId: id,
  allowOutstandingBalance: z.boolean().default(false),
  note: shortText.optional(),
});

export const extendStaySchema = z.object({ reservationId: id, newDeparture: isoDate });

export const walkInSchema = z.object({
  departure: isoDate,
  ratePlanId: id,
  categoryId: id,
  adults: z.number().int().min(1).max(20),
  children: z.number().int().min(0).max(20).default(0),
  guest: guestSchema,
  additionalGuests: z.array(guestSchema.extend({ isAdult: z.boolean().default(true) })).max(20).default([]),
  specialRequests: longText.default(''),
  /** Physical room chosen by the receptionist; re-validated by the server. Omit to auto-assign the best ready room. */
  roomId: id.optional(),
});

export const walkInRoomsSchema = z.object({
  categoryId: id,
  departure: isoDate,
  adults: z.coerce.number().int().min(1).max(20).default(1),
  children: z.coerce.number().int().min(0).max(20).default(0),
});

export const housekeepingTaskSchema = z.object({
  roomId: id,
  type: z.enum(HousekeepingTaskType),
  priority: z.enum(Priority).default('NORMAL'),
  assignedToId: id.nullable().default(null),
  dueAt: z.string().datetime().nullable().default(null),
  notes: longText.default(''),
});

export const housekeepingTaskUpdateSchema = z.object({
  status: z.enum(TaskStatus).optional(),
  assignedToId: id.nullable().optional(),
  priority: z.enum(Priority).optional(),
  checklist: z.array(z.object({ item: z.string().max(100), done: z.boolean() })).max(50).optional(),
  notes: longText.optional(),
});

export const lostFoundSchema = z.object({
  roomId: id.nullable().default(null),
  description: shortText.min(2),
  storageLocation: shortText.default(''),
});

export const workOrderSchema = z.object({
  roomId: id.nullable().default(null),
  title: shortText.min(2),
  description: longText.default(''),
  category: z.enum(['PLUMBING', 'ELECTRICAL', 'HVAC', 'FURNITURE', 'APPLIANCE', 'IT', 'STRUCTURAL', 'OTHER']),
  severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']),
  priority: z.enum(Priority).default('NORMAL'),
  blockType: z.enum(['NONE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE']).default('NONE'),
  blockFrom: isoDate.nullable().default(null),
  blockUntil: isoDate.nullable().default(null),
  assignedToId: id.nullable().default(null),
  estimatedCost: money.nullable().default(null),
});

export const workOrderUpdateSchema = z.object({
  status: z.enum(WorkOrderStatus).optional(),
  assignedToId: id.nullable().optional(),
  priority: z.enum(Priority).optional(),
  partsNotes: longText.optional(),
  estimatedCost: money.nullable().optional(),
  note: longText.optional(),
});

export const maintenanceStatusSchema = z.object({ maintenanceStatus: z.enum(MaintenanceStatus), reason: shortText.min(2) });

export const serviceRequestSchema = z.object({
  stayId: id.nullable().default(null),
  roomId: id.nullable().default(null),
  category: z.enum(ServiceCategory),
  description: longText.min(2),
  priority: z.enum(Priority).default('NORMAL'),
  department: z.enum(['FRONT_DESK', 'HOUSEKEEPING', 'MAINTENANCE', 'FOOD_BEVERAGE', 'CONCIERGE']).default('FRONT_DESK'),
  assignedToId: id.nullable().default(null),
  chargeAmount: money.nullable().default(null),
});

export const serviceRequestUpdateSchema = z.object({
  status: z.enum(ServiceStatus).optional(),
  assignedToId: id.nullable().optional(),
  resolution: longText.optional(),
  chargeAmount: money.nullable().optional(),
});

export const guestServiceRequestSchema = z.object({
  category: z.enum(ServiceCategory),
  description: longText.min(2),
});

export const postChargeSchema = z.object({
  type: z.enum(FolioEntryType).refine((t) => !['PAYMENT', 'REFUND'].includes(t), 'use_payment_endpoint'),
  description: shortText.min(1),
  amount: money.refine((v) => Number(v) !== 0, 'amount_nonzero'),
  idempotencyKey: z.string().min(8).max(100),
});

export const reverseEntrySchema = z.object({ reason: shortText.min(3), idempotencyKey: z.string().min(8).max(100) });

export const takePaymentSchema = z.object({
  folioId: id,
  amount: positiveMoney,
  method: z.enum(PaymentMethod),
  isDeposit: z.boolean().default(false),
  reference: shortText.optional(),
  idempotencyKey: z.string().min(8).max(100),
});

export const refundSchema = z.object({
  paymentId: id,
  amount: positiveMoney,
  reason: shortText.min(3),
  idempotencyKey: z.string().min(8).max(100),
});

export const createFolioSchema = z.object({
  reservationId: id,
  payer: z.enum(['GUEST', 'COMPANY']).default('GUEST'),
  payerName: shortText.min(1),
});

export const reportQuerySchema = z
  .object({ from: isoDate, to: isoDate, categoryId: id.optional() })
  .refine((v) => v.from <= v.to, { message: 'to_before_from', path: ['to'] });

export const paginationSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  q: z.string().trim().max(100).optional(),
  sort: z.string().max(40).optional(),
});
