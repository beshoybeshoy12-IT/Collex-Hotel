/** Granular permission codes. Roles are configurable sets of these codes. */
export const Permissions = {
  PROPERTY_READ: 'property.read',
  PROPERTY_MANAGE: 'property.manage',
  ROOMS_READ: 'rooms.read',
  ROOMS_MANAGE: 'rooms.manage',
  FLOORPLAN_EDIT: 'floorplan.edit',
  RATES_READ: 'rates.read',
  RATES_MANAGE: 'rates.manage',
  RESERVATIONS_READ: 'reservations.read',
  RESERVATIONS_WRITE: 'reservations.write',
  RESERVATIONS_CANCEL: 'reservations.cancel',
  GUESTS_READ: 'guests.read',
  GUESTS_WRITE: 'guests.write',
  GUESTS_ERASE: 'guests.erase',
  DOCUMENTS_UPLOAD: 'documents.upload',
  DOCUMENTS_VIEW: 'documents.view',
  DOCUMENTS_VERIFY: 'documents.verify',
  DOCUMENTS_DELETE: 'documents.delete',
  ASSIGN_ROOMS: 'assignments.write',
  CHECKIN: 'frontdesk.checkin',
  CHECKOUT: 'frontdesk.checkout',
  CHECKIN_EXCEPTION: 'frontdesk.checkin_exception',
  HOUSEKEEPING_READ: 'housekeeping.read',
  HOUSEKEEPING_WORK: 'housekeeping.work',
  HOUSEKEEPING_SUPERVISE: 'housekeeping.supervise',
  MAINTENANCE_READ: 'maintenance.read',
  MAINTENANCE_WORK: 'maintenance.work',
  MAINTENANCE_APPROVE: 'maintenance.approve',
  SERVICES_READ: 'services.read',
  SERVICES_WRITE: 'services.write',
  FOLIO_READ: 'folio.read',
  FOLIO_POST: 'folio.post',
  FOLIO_ADJUST: 'folio.adjust',
  PAYMENTS_TAKE: 'payments.take',
  PAYMENTS_REFUND: 'payments.refund',
  REPORTS_READ: 'reports.read',
  REPORTS_FINANCIAL: 'reports.financial',
  USERS_MANAGE: 'users.manage',
  AUDIT_READ: 'audit.read',
} as const;
export type Permission = (typeof Permissions)[keyof typeof Permissions];
export const ALL_PERMISSIONS = Object.values(Permissions) as Permission[];

const P = Permissions;

/** System role templates seeded for every hotel group. */
export const DEFAULT_ROLES: { code: string; nameEn: string; nameAr: string; permissions: Permission[] }[] = [
  { code: 'PLATFORM_ADMIN', nameEn: 'Platform administrator', nameAr: 'مدير المنصة', permissions: ALL_PERMISSIONS },
  { code: 'GROUP_ADMIN', nameEn: 'Hotel group administrator', nameAr: 'مدير مجموعة الفنادق', permissions: ALL_PERMISSIONS },
  {
    code: 'PROPERTY_MANAGER',
    nameEn: 'Property manager',
    nameAr: 'مدير الفندق',
    permissions: ALL_PERMISSIONS.filter((p) => p !== P.GUESTS_ERASE),
  },
  {
    code: 'RECEPTIONIST',
    nameEn: 'Front-desk receptionist',
    nameAr: 'موظف استقبال',
    permissions: [
      P.PROPERTY_READ, P.ROOMS_READ, P.RATES_READ, P.RESERVATIONS_READ, P.RESERVATIONS_WRITE, P.RESERVATIONS_CANCEL,
      P.GUESTS_READ, P.GUESTS_WRITE, P.DOCUMENTS_UPLOAD, P.DOCUMENTS_VIEW, P.DOCUMENTS_VERIFY, P.ASSIGN_ROOMS,
      P.CHECKIN, P.CHECKOUT, P.HOUSEKEEPING_READ, P.MAINTENANCE_READ, P.SERVICES_READ, P.SERVICES_WRITE,
      P.FOLIO_READ, P.FOLIO_POST, P.PAYMENTS_TAKE,
    ],
  },
  {
    code: 'RESERVATION_AGENT',
    nameEn: 'Reservation agent',
    nameAr: 'موظف حجوزات',
    permissions: [P.PROPERTY_READ, P.ROOMS_READ, P.RATES_READ, P.RESERVATIONS_READ, P.RESERVATIONS_WRITE, P.RESERVATIONS_CANCEL, P.GUESTS_READ, P.GUESTS_WRITE, P.DOCUMENTS_UPLOAD],
  },
  {
    code: 'CASHIER',
    nameEn: 'Cashier / finance',
    nameAr: 'أمين الصندوق / المالية',
    permissions: [P.PROPERTY_READ, P.RESERVATIONS_READ, P.GUESTS_READ, P.FOLIO_READ, P.FOLIO_POST, P.FOLIO_ADJUST, P.PAYMENTS_TAKE, P.PAYMENTS_REFUND, P.REPORTS_READ, P.REPORTS_FINANCIAL],
  },
  {
    code: 'HK_SUPERVISOR',
    nameEn: 'Housekeeping supervisor',
    nameAr: 'مشرف التدبير الفندقي',
    permissions: [P.PROPERTY_READ, P.ROOMS_READ, P.HOUSEKEEPING_READ, P.HOUSEKEEPING_WORK, P.HOUSEKEEPING_SUPERVISE, P.MAINTENANCE_READ, P.MAINTENANCE_WORK, P.SERVICES_READ, P.SERVICES_WRITE],
  },
  {
    code: 'HK_STAFF',
    nameEn: 'Housekeeping staff',
    nameAr: 'عامل التدبير الفندقي',
    permissions: [P.PROPERTY_READ, P.ROOMS_READ, P.HOUSEKEEPING_READ, P.HOUSEKEEPING_WORK, P.SERVICES_READ],
  },
  {
    code: 'MAINTENANCE',
    nameEn: 'Maintenance staff',
    nameAr: 'فني صيانة',
    permissions: [P.PROPERTY_READ, P.ROOMS_READ, P.MAINTENANCE_READ, P.MAINTENANCE_WORK, P.SERVICES_READ],
  },
  {
    code: 'AUDITOR',
    nameEn: 'Auditor (read-only)',
    nameAr: 'مدقق (قراءة فقط)',
    permissions: [P.PROPERTY_READ, P.ROOMS_READ, P.RATES_READ, P.RESERVATIONS_READ, P.GUESTS_READ, P.HOUSEKEEPING_READ, P.MAINTENANCE_READ, P.SERVICES_READ, P.FOLIO_READ, P.REPORTS_READ, P.REPORTS_FINANCIAL, P.AUDIT_READ],
  },
];
