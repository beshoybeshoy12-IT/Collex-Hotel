-- CreateEnum
CREATE TYPE "HousekeepingStatus" AS ENUM ('DIRTY', 'CLEANING', 'CLEAN', 'AWAITING_INSPECTION', 'INSPECTED');

-- CreateEnum
CREATE TYPE "MaintenanceStatus" AS ENUM ('OPERATIONAL', 'MAINTENANCE_REQUESTED', 'UNDER_MAINTENANCE', 'OUT_OF_ORDER', 'OUT_OF_SERVICE');

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('NOT_REQUIRED', 'REQUIRED', 'AWAITING_UPLOAD', 'UPLOADED', 'AWAITING_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED', 'REUPLOAD_REQUESTED');

-- CreateEnum
CREATE TYPE "ReservationStatus" AS ENUM ('INQUIRY', 'PENDING', 'AWAITING_PAYMENT', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED', 'NO_SHOW', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AssignmentStatus" AS ENUM ('PLANNED', 'ACTIVE', 'COMPLETED', 'CANCELLED', 'MOVED');

-- CreateTable
CREATE TABLE "HotelGroup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HotelGroup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Property" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "timezone" TEXT NOT NULL DEFAULT 'Asia/Riyadh',
    "currency" CHAR(3) NOT NULL DEFAULT 'SAR',
    "defaultLocale" TEXT NOT NULL DEFAULT 'ar',
    "arabicNumerals" BOOLEAN NOT NULL DEFAULT false,
    "checkInTime" TEXT NOT NULL DEFAULT '15:00',
    "checkOutTime" TEXT NOT NULL DEFAULT '12:00',
    "taxPercent" DECIMAL(6,3) NOT NULL DEFAULT 15,
    "serviceChargePercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "overbookingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "overbookingLimit" INTEGER NOT NULL DEFAULT 0,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "policiesEn" TEXT NOT NULL DEFAULT '',
    "policiesAr" TEXT NOT NULL DEFAULT '',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "phone" TEXT NOT NULL DEFAULT '',
    "email" TEXT NOT NULL DEFAULT '',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Property_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PropertySequence" (
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PropertySequence_pkey" PRIMARY KEY ("propertyId","name")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "locale" TEXT NOT NULL DEFAULT 'ar',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
    "mfaSecretEnc" TEXT,
    "failedLogins" INTEGER NOT NULL DEFAULT 0,
    "lockedUntil" TIMESTAMPTZ,
    "lastLoginAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "groupId" TEXT,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "permissions" TEXT[],
    "system" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserRole" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "groupId" TEXT,
    "propertyId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserRole_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "revokedAt" TIMESTAMPTZ,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMPTZ NOT NULL,
    "usedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Building" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,

    CONSTRAINT "Building_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Floor" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,

    CONSTRAINT "Floor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FloorPlanLayout" (
    "id" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "width" INTEGER NOT NULL DEFAULT 1200,
    "height" INTEGER NOT NULL DEFAULT 700,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "FloorPlanLayout_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomGeometry" (
    "id" TEXT NOT NULL,
    "layoutId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "RoomGeometry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomCategory" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "descriptionEn" TEXT NOT NULL DEFAULT '',
    "descriptionAr" TEXT NOT NULL DEFAULT '',
    "maxAdults" INTEGER NOT NULL,
    "maxChildren" INTEGER NOT NULL,
    "maxOccupancy" INTEGER NOT NULL,
    "baseOccupancy" INTEGER NOT NULL DEFAULT 2,
    "bedConfig" TEXT NOT NULL DEFAULT '',
    "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "images" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "sizeSqm" INTEGER,
    "rank" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RoomCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Room" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "floorId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "housekeepingStatus" "HousekeepingStatus" NOT NULL DEFAULT 'INSPECTED',
    "maintenanceStatus" "MaintenanceStatus" NOT NULL DEFAULT 'OPERATIONAL',
    "doNotDisturb" BOOLEAN NOT NULL DEFAULT false,
    "accessible" BOOLEAN NOT NULL DEFAULT false,
    "bedType" TEXT,
    "features" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Room_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomStatusHistory" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "field" TEXT NOT NULL,
    "fromValue" TEXT,
    "toValue" TEXT NOT NULL,
    "reason" TEXT,
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RoomStatusHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePlan" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "refundable" BOOLEAN NOT NULL DEFAULT true,
    "freeCancellationHours" INTEGER NOT NULL DEFAULT 24,
    "penaltyNights" INTEGER NOT NULL DEFAULT 1,
    "depositPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "minStay" INTEGER NOT NULL DEFAULT 1,
    "maxStay" INTEGER NOT NULL DEFAULT 30,
    "promoCode" TEXT,
    "discountPercent" DECIMAL(6,3) NOT NULL DEFAULT 0,
    "corporateAccount" TEXT,
    "public" BOOLEAN NOT NULL DEFAULT true,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RatePlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RatePrice" (
    "id" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
    "amount" DECIMAL(14,3) NOT NULL,
    "extraAdultAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "extraChildAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "priority" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RatePrice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RateRestriction" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "ratePlanId" TEXT,
    "categoryId" TEXT,
    "date" DATE NOT NULL,
    "closed" BOOLEAN NOT NULL DEFAULT false,
    "closedToArrival" BOOLEAN NOT NULL DEFAULT false,
    "closedToDeparture" BOOLEAN NOT NULL DEFAULT false,
    "minStay" INTEGER,

    CONSTRAINT "RateRestriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Guest" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "nationality" CHAR(2),
    "dateOfBirth" DATE,
    "preferredLocale" TEXT NOT NULL DEFAULT 'ar',
    "address" TEXT,
    "vip" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "preferences" JSONB NOT NULL DEFAULT '{}',
    "anonymizedAt" TIMESTAMPTZ,
    "legalHold" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Guest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentTypeConfig" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "nameEn" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "requiresBack" BOOLEAN NOT NULL DEFAULT false,
    "multiPage" BOOLEAN NOT NULL DEFAULT false,
    "requiredFields" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "DocumentTypeConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CheckInPolicy" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "documentScope" TEXT NOT NULL DEFAULT 'ALL_ADULTS',
    "acceptedTypes" TEXT[] DEFAULT ARRAY['PASSPORT', 'NATIONAL_ID', 'RESIDENCE_PERMIT']::TEXT[],
    "requireVerification" BOOLEAN NOT NULL DEFAULT true,
    "allowExceptions" BOOLEAN NOT NULL DEFAULT false,
    "homeCountry" CHAR(2),
    "requireDepositBeforeCheckIn" BOOLEAN NOT NULL DEFAULT false,
    "requireInspectedRoom" BOOLEAN NOT NULL DEFAULT false,
    "documentRetentionDays" INTEGER NOT NULL DEFAULT 365,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CheckInPolicy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IdentityDocument" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "guestId" TEXT NOT NULL,
    "reservationId" TEXT,
    "typeCode" TEXT NOT NULL,
    "issuingCountry" CHAR(2),
    "documentNumberEnc" TEXT,
    "documentNumberLast4" TEXT,
    "holderName" TEXT,
    "issueDate" DATE,
    "expiryDate" DATE,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "uploadedById" TEXT,
    "uploadedByGuest" BOOLEAN NOT NULL DEFAULT false,
    "reviewerId" TEXT,
    "reviewedAt" TIMESTAMPTZ,
    "rejectionReason" TEXT,
    "ocrData" JSONB,
    "retentionUntil" TIMESTAMPTZ,
    "purgedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "IdentityDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentFile" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "side" TEXT NOT NULL DEFAULT 'FRONT',
    "pageNo" INTEGER NOT NULL DEFAULT 1,
    "storageKey" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "scanStatus" TEXT NOT NULL DEFAULT 'PENDING',
    "supersededAt" TIMESTAMPTZ,
    "purgedAt" TIMESTAMPTZ,
    "uploadedById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentEvent" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "details" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Reservation" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "confirmationNo" TEXT NOT NULL,
    "status" "ReservationStatus" NOT NULL,
    "source" TEXT NOT NULL,
    "primaryGuestId" TEXT NOT NULL,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "roomTotal" DECIMAL(14,3) NOT NULL,
    "discountTotal" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "serviceChargeTotal" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "taxTotal" DECIMAL(14,3) NOT NULL,
    "grandTotal" DECIMAL(14,3) NOT NULL,
    "depositRequired" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "policySnapshot" JSONB NOT NULL,
    "holdExpiresAt" TIMESTAMPTZ,
    "specialRequests" TEXT NOT NULL DEFAULT '',
    "groupName" TEXT,
    "companyName" TEXT,
    "promoCode" TEXT,
    "cancelledAt" TIMESTAMPTZ,
    "cancellationReason" TEXT,
    "cancellationFee" DECIMAL(14,3),
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Reservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationRoom" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "ratePlanId" TEXT NOT NULL,
    "adults" INTEGER NOT NULL,
    "children" INTEGER NOT NULL,
    "arrivalDate" DATE NOT NULL,
    "departureDate" DATE NOT NULL,
    "nightlyRates" JSONB NOT NULL,
    "roomTotal" DECIMAL(14,3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReservationRoom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationOccupant" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "reservationRoomId" TEXT,
    "guestId" TEXT NOT NULL,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "isAdult" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "ReservationOccupant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReservationHistory" (
    "id" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "fromStatus" TEXT,
    "toStatus" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "actorId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReservationHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RoomAssignment" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationRoomId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "startDate" DATE NOT NULL,
    "endDate" DATE NOT NULL,
    "status" "AssignmentStatus" NOT NULL DEFAULT 'PLANNED',
    "source" TEXT NOT NULL,
    "assignedById" TEXT,
    "previousAssignmentId" TEXT,
    "reason" TEXT,
    "approvedById" TEXT,
    "checkedInAt" TIMESTAMPTZ,
    "checkedOutAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "RoomAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Stay" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "reservationRoomId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_HOUSE',
    "checkedInAt" TIMESTAMPTZ NOT NULL,
    "checkedOutAt" TIMESTAMPTZ,
    "checkedInById" TEXT,
    "checkedOutById" TEXT,
    "docExceptionReason" TEXT,
    "docExceptionApprovedBy" TEXT,
    "docExceptionAt" TIMESTAMPTZ,
    "keyCardsIssued" INTEGER NOT NULL DEFAULT 0,
    "acknowledgements" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Stay_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HousekeepingTask" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "assignedToId" TEXT,
    "dueAt" TIMESTAMPTZ,
    "checklist" JSONB NOT NULL DEFAULT '[]',
    "notes" TEXT NOT NULL DEFAULT '',
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,
    "inspectedById" TEXT,
    "inspectedAt" TIMESTAMPTZ,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "HousekeepingTask_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LostFoundItem" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "description" TEXT NOT NULL,
    "storageLocation" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'STORED',
    "foundById" TEXT,
    "returnedTo" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ,

    CONSTRAINT "LostFoundItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MaintenanceWorkOrder" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "roomId" TEXT,
    "number" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "blockType" TEXT NOT NULL DEFAULT 'NONE',
    "blockFrom" DATE,
    "blockUntil" DATE,
    "assignedToId" TEXT,
    "estimatedCost" DECIMAL(14,3),
    "partsNotes" TEXT NOT NULL DEFAULT '',
    "reportedById" TEXT,
    "resolvedAt" TIMESTAMPTZ,
    "approvedById" TEXT,
    "closedAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "MaintenanceWorkOrder_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkOrderNote" (
    "id" TEXT NOT NULL,
    "workOrderId" TEXT NOT NULL,
    "authorId" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WorkOrderNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ServiceRequest" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "stayId" TEXT,
    "roomId" TEXT,
    "guestId" TEXT,
    "reservationId" TEXT,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "department" TEXT NOT NULL DEFAULT 'FRONT_DESK',
    "assignedToId" TEXT,
    "chargeAmount" DECIMAL(14,3),
    "chargePostedId" TEXT,
    "resolution" TEXT NOT NULL DEFAULT '',
    "createdByGuest" BOOLEAN NOT NULL DEFAULT false,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,
    "startedAt" TIMESTAMPTZ,
    "completedAt" TIMESTAMPTZ,

    CONSTRAINT "ServiceRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Folio" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "reservationId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "payer" TEXT NOT NULL DEFAULT 'GUEST',
    "payerName" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "currency" CHAR(3) NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMPTZ,

    CONSTRAINT "Folio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FolioEntry" (
    "id" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "businessDate" DATE NOT NULL,
    "postedById" TEXT,
    "reversalOfId" TEXT,
    "paymentId" TEXT,
    "refundId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FolioEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerRef" TEXT,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "refundedAmount" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "currency" CHAR(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isDeposit" BOOLEAN NOT NULL DEFAULT false,
    "reference" TEXT,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Refund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "amount" DECIMAL(14,3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "providerRef" TEXT,
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMPTZ,
    "error" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invoice" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "folioId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'INVOICE',
    "totals" JSONB NOT NULL,
    "currency" CHAR(3) NOT NULL,
    "issuedById" TEXT,
    "issuedAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invoice_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "template" TEXT NOT NULL,
    "locale" TEXT NOT NULL,
    "recipient" TEXT NOT NULL,
    "payload" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "dedupeKey" TEXT NOT NULL,
    "nextAttemptAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentAt" TIMESTAMPTZ,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT,
    "actorId" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'USER',
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "details" JSONB NOT NULL DEFAULT '{}',
    "ip" TEXT,
    "correlationId" TEXT,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "IntegrationConfig" (
    "id" TEXT NOT NULL,
    "propertyId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "settings" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "IntegrationConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Property_code_key" ON "Property"("code");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Role_groupId_code_key" ON "Role"("groupId", "code");

-- CreateIndex
CREATE INDEX "UserRole_userId_idx" ON "UserRole"("userId");

-- CreateIndex
CREATE INDEX "UserRole_propertyId_idx" ON "UserRole"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_tokenHash_key" ON "PasswordResetToken"("tokenHash");

-- CreateIndex
CREATE INDEX "Building_propertyId_idx" ON "Building"("propertyId");

-- CreateIndex
CREATE INDEX "Floor_propertyId_idx" ON "Floor"("propertyId");

-- CreateIndex
CREATE UNIQUE INDEX "FloorPlanLayout_floorId_key" ON "FloorPlanLayout"("floorId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomGeometry_layoutId_roomId_key" ON "RoomGeometry"("layoutId", "roomId");

-- CreateIndex
CREATE UNIQUE INDEX "RoomCategory_propertyId_code_key" ON "RoomCategory"("propertyId", "code");

-- CreateIndex
CREATE INDEX "Room_propertyId_categoryId_idx" ON "Room"("propertyId", "categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "Room_propertyId_number_key" ON "Room"("propertyId", "number");

-- CreateIndex
CREATE INDEX "RoomStatusHistory_roomId_createdAt_idx" ON "RoomStatusHistory"("roomId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "RatePlan_propertyId_code_key" ON "RatePlan"("propertyId", "code");

-- CreateIndex
CREATE INDEX "RatePrice_ratePlanId_categoryId_idx" ON "RatePrice"("ratePlanId", "categoryId");

-- CreateIndex
CREATE INDEX "RateRestriction_propertyId_date_idx" ON "RateRestriction"("propertyId", "date");

-- CreateIndex
CREATE INDEX "Guest_propertyId_lastName_idx" ON "Guest"("propertyId", "lastName");

-- CreateIndex
CREATE INDEX "Guest_propertyId_email_idx" ON "Guest"("propertyId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentTypeConfig_propertyId_code_key" ON "DocumentTypeConfig"("propertyId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "CheckInPolicy_propertyId_key" ON "CheckInPolicy"("propertyId");

-- CreateIndex
CREATE INDEX "IdentityDocument_propertyId_guestId_idx" ON "IdentityDocument"("propertyId", "guestId");

-- CreateIndex
CREATE INDEX "IdentityDocument_propertyId_status_idx" ON "IdentityDocument"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentFile_storageKey_key" ON "DocumentFile"("storageKey");

-- CreateIndex
CREATE INDEX "DocumentEvent_documentId_createdAt_idx" ON "DocumentEvent"("documentId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "Reservation_confirmationNo_key" ON "Reservation"("confirmationNo");

-- CreateIndex
CREATE INDEX "Reservation_propertyId_arrivalDate_idx" ON "Reservation"("propertyId", "arrivalDate");

-- CreateIndex
CREATE INDEX "Reservation_propertyId_departureDate_idx" ON "Reservation"("propertyId", "departureDate");

-- CreateIndex
CREATE INDEX "Reservation_propertyId_status_idx" ON "Reservation"("propertyId", "status");

-- CreateIndex
CREATE INDEX "ReservationRoom_propertyId_categoryId_arrivalDate_departure_idx" ON "ReservationRoom"("propertyId", "categoryId", "arrivalDate", "departureDate");

-- CreateIndex
CREATE UNIQUE INDEX "ReservationOccupant_reservationId_guestId_key" ON "ReservationOccupant"("reservationId", "guestId");

-- CreateIndex
CREATE INDEX "ReservationHistory_reservationId_createdAt_idx" ON "ReservationHistory"("reservationId", "createdAt");

-- CreateIndex
CREATE INDEX "RoomAssignment_propertyId_roomId_idx" ON "RoomAssignment"("propertyId", "roomId");

-- CreateIndex
CREATE INDEX "RoomAssignment_reservationRoomId_idx" ON "RoomAssignment"("reservationRoomId");

-- CreateIndex
CREATE UNIQUE INDEX "Stay_reservationRoomId_key" ON "Stay"("reservationRoomId");

-- CreateIndex
CREATE INDEX "Stay_propertyId_status_idx" ON "Stay"("propertyId", "status");

-- CreateIndex
CREATE INDEX "HousekeepingTask_propertyId_status_idx" ON "HousekeepingTask"("propertyId", "status");

-- CreateIndex
CREATE INDEX "LostFoundItem_propertyId_idx" ON "LostFoundItem"("propertyId");

-- CreateIndex
CREATE INDEX "MaintenanceWorkOrder_propertyId_status_idx" ON "MaintenanceWorkOrder"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MaintenanceWorkOrder_propertyId_number_key" ON "MaintenanceWorkOrder"("propertyId", "number");

-- CreateIndex
CREATE INDEX "ServiceRequest_propertyId_status_idx" ON "ServiceRequest"("propertyId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Folio_propertyId_number_key" ON "Folio"("propertyId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "FolioEntry_reversalOfId_key" ON "FolioEntry"("reversalOfId");

-- CreateIndex
CREATE UNIQUE INDEX "FolioEntry_idempotencyKey_key" ON "FolioEntry"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FolioEntry_folioId_idx" ON "FolioEntry"("folioId");

-- CreateIndex
CREATE INDEX "FolioEntry_propertyId_businessDate_idx" ON "FolioEntry"("propertyId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_propertyId_createdAt_idx" ON "Payment"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_provider_providerRef_idx" ON "Payment"("provider", "providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Refund_idempotencyKey_key" ON "Refund"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentProviderEvent_provider_eventId_key" ON "PaymentProviderEvent"("provider", "eventId");

-- CreateIndex
CREATE UNIQUE INDEX "Invoice_propertyId_kind_number_key" ON "Invoice"("propertyId", "kind", "number");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_dedupeKey_key" ON "Notification"("dedupeKey");

-- CreateIndex
CREATE INDEX "Notification_status_nextAttemptAt_idx" ON "Notification"("status", "nextAttemptAt");

-- CreateIndex
CREATE INDEX "AuditEvent_propertyId_createdAt_idx" ON "AuditEvent"("propertyId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_entityType_entityId_idx" ON "AuditEvent"("entityType", "entityId");

-- CreateIndex
CREATE UNIQUE INDEX "IntegrationConfig_propertyId_kind_key" ON "IntegrationConfig"("propertyId", "kind");

-- AddForeignKey
ALTER TABLE "Property" ADD CONSTRAINT "Property_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HotelGroup"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PropertySequence" ADD CONSTRAINT "PropertySequence_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HotelGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "HotelGroup"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserRole" ADD CONSTRAINT "UserRole_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Building" ADD CONSTRAINT "Building_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Floor" ADD CONSTRAINT "Floor_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "Building"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FloorPlanLayout" ADD CONSTRAINT "FloorPlanLayout_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomGeometry" ADD CONSTRAINT "RoomGeometry_layoutId_fkey" FOREIGN KEY ("layoutId") REFERENCES "FloorPlanLayout"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomGeometry" ADD CONSTRAINT "RoomGeometry_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomCategory" ADD CONSTRAINT "RoomCategory_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_floorId_fkey" FOREIGN KEY ("floorId") REFERENCES "Floor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Room" ADD CONSTRAINT "Room_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RoomCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomStatusHistory" ADD CONSTRAINT "RoomStatusHistory_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePlan" ADD CONSTRAINT "RatePlan_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePrice" ADD CONSTRAINT "RatePrice_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RatePrice" ADD CONSTRAINT "RatePrice_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "RoomCategory"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RateRestriction" ADD CONSTRAINT "RateRestriction_ratePlanId_fkey" FOREIGN KEY ("ratePlanId") REFERENCES "RatePlan"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Guest" ADD CONSTRAINT "Guest_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentTypeConfig" ADD CONSTRAINT "DocumentTypeConfig_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CheckInPolicy" ADD CONSTRAINT "CheckInPolicy_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "IdentityDocument" ADD CONSTRAINT "IdentityDocument_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentFile" ADD CONSTRAINT "DocumentFile_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IdentityDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentEvent" ADD CONSTRAINT "DocumentEvent_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "IdentityDocument"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_propertyId_fkey" FOREIGN KEY ("propertyId") REFERENCES "Property"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_primaryGuestId_fkey" FOREIGN KEY ("primaryGuestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationOccupant" ADD CONSTRAINT "ReservationOccupant_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationOccupant" ADD CONSTRAINT "ReservationOccupant_reservationRoomId_fkey" FOREIGN KEY ("reservationRoomId") REFERENCES "ReservationRoom"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationOccupant" ADD CONSTRAINT "ReservationOccupant_guestId_fkey" FOREIGN KEY ("guestId") REFERENCES "Guest"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ReservationHistory" ADD CONSTRAINT "ReservationHistory_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_reservationRoomId_fkey" FOREIGN KEY ("reservationRoomId") REFERENCES "ReservationRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Stay" ADD CONSTRAINT "Stay_reservationRoomId_fkey" FOREIGN KEY ("reservationRoomId") REFERENCES "ReservationRoom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HousekeepingTask" ADD CONSTRAINT "HousekeepingTask_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MaintenanceWorkOrder" ADD CONSTRAINT "MaintenanceWorkOrder_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "Room"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkOrderNote" ADD CONSTRAINT "WorkOrderNote_workOrderId_fkey" FOREIGN KEY ("workOrderId") REFERENCES "MaintenanceWorkOrder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Folio" ADD CONSTRAINT "Folio_reservationId_fkey" FOREIGN KEY ("reservationId") REFERENCES "Reservation"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FolioEntry" ADD CONSTRAINT "FolioEntry_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invoice" ADD CONSTRAINT "Invoice_folioId_fkey" FOREIGN KEY ("folioId") REFERENCES "Folio"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Hand-written integrity constraints (not expressible in Prisma schema)
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- A physical room can never have two overlapping PLANNED/ACTIVE assignments.
-- Ranges are half-open [start, end): back-to-back stays are allowed.
ALTER TABLE "RoomAssignment"
  ADD CONSTRAINT "RoomAssignment_no_overlap"
  EXCLUDE USING gist (
    "roomId" WITH =,
    daterange("startDate", "endDate", '[)') WITH &&
  ) WHERE ("status" IN ('PLANNED', 'ACTIVE'));

ALTER TABLE "RoomAssignment" ADD CONSTRAINT "RoomAssignment_valid_range" CHECK ("endDate" > "startDate");
ALTER TABLE "Reservation" ADD CONSTRAINT "Reservation_valid_range" CHECK ("departureDate" > "arrivalDate");
ALTER TABLE "ReservationRoom" ADD CONSTRAINT "ReservationRoom_valid_range" CHECK ("departureDate" > "arrivalDate");
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_positive" CHECK ("amount" > 0 AND "refundedAmount" >= 0 AND "refundedAmount" <= "amount");
ALTER TABLE "Refund" ADD CONSTRAINT "Refund_positive" CHECK ("amount" > 0);

-- Only one active stay per reservation room is enforced by the unique index on Stay.reservationRoomId.
