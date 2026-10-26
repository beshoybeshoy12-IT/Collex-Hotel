import type { HousekeepingStatus, MaintenanceStatus } from './enums';
import { rangesOverlap } from './dates';

export interface RoomCandidate {
  id: string;
  number: string;
  categoryId: string;
  categoryRank: number;
  floorLevel: number;
  maxOccupancy: number;
  housekeepingStatus: HousekeepingStatus;
  maintenanceStatus: MaintenanceStatus;
  active: boolean;
  accessible: boolean;
  bedType: string | null;
  features: string[];
  /** Existing planned/active allocations of this room. */
  allocations: { start: string; end: string; reservationRoomId: string }[];
  /** Maintenance blocks: work orders blocking the room for a date range (end exclusive, null = open-ended). */
  blocks: { start: string; end: string | null }[];
}

export interface AssignmentRequest {
  reservationRoomId: string;
  categoryId: string;
  categoryRank: number;
  start: string;
  end: string;
  occupants: number;
  /** True when the guest is arriving now (requires the room to be ready). */
  immediateCheckIn: boolean;
  requireInspection: boolean;
  allowUpgrade: boolean;
  preferences: { accessible?: boolean; bedType?: string; features?: string[]; nearFloorLevel?: number };
}

export type IneligibilityReason =
  | 'INACTIVE'
  | 'CATEGORY_MISMATCH'
  | 'DOWNGRADE_NOT_ALLOWED'
  | 'CAPACITY_EXCEEDED'
  | 'OVERLAPPING_ALLOCATION'
  | 'MAINTENANCE_BLOCK'
  | 'OUT_OF_ORDER'
  | 'NOT_CLEAN'
  | 'NOT_INSPECTED';

export interface EligibilityResult {
  roomId: string;
  eligible: boolean;
  reasons: IneligibilityReason[];
  score: number;
  /** Positive explanation codes for ranking. */
  explanations: string[];
  isUpgrade: boolean;
}

const BLOCKING_MAINTENANCE: MaintenanceStatus[] = ['OUT_OF_ORDER', 'OUT_OF_SERVICE', 'UNDER_MAINTENANCE'];

export function evaluateRoom(room: RoomCandidate, req: AssignmentRequest): EligibilityResult {
  const reasons: IneligibilityReason[] = [];
  const explanations: string[] = [];
  let score = 0;
  const isUpgrade = room.categoryId !== req.categoryId;

  if (!room.active) reasons.push('INACTIVE');
  if (room.categoryId !== req.categoryId) {
    if (!req.allowUpgrade) reasons.push('CATEGORY_MISMATCH');
    else if (room.categoryRank < req.categoryRank) reasons.push('DOWNGRADE_NOT_ALLOWED');
  }
  if (room.maxOccupancy < req.occupants) reasons.push('CAPACITY_EXCEEDED');
  if (
    room.allocations.some(
      (a) => a.reservationRoomId !== req.reservationRoomId && rangesOverlap(a.start, a.end, req.start, req.end),
    )
  ) {
    reasons.push('OVERLAPPING_ALLOCATION');
  }
  if (room.blocks.some((b) => rangesOverlap(b.start, b.end ?? '9999-12-31', req.start, req.end))) {
    reasons.push('MAINTENANCE_BLOCK');
  }
  if (BLOCKING_MAINTENANCE.includes(room.maintenanceStatus)) reasons.push('OUT_OF_ORDER');
  if (req.immediateCheckIn) {
    const ready = req.requireInspection
      ? room.housekeepingStatus === 'INSPECTED'
      : room.housekeepingStatus === 'INSPECTED' || room.housekeepingStatus === 'CLEAN';
    if (!ready) reasons.push(req.requireInspection && room.housekeepingStatus === 'CLEAN' ? 'NOT_INSPECTED' : 'NOT_CLEAN');
  }

  // Ranking
  if (!isUpgrade) {
    score += 100;
    explanations.push('EXACT_CATEGORY');
  } else {
    score += 40 - (room.categoryRank - req.categoryRank) * 5;
    explanations.push('UPGRADE');
  }
  if (room.housekeepingStatus === 'INSPECTED') {
    score += 30;
    explanations.push('READY_INSPECTED');
  } else if (room.housekeepingStatus === 'CLEAN') {
    score += 20;
    explanations.push('READY_CLEAN');
  }
  if (req.preferences.accessible) {
    if (room.accessible) {
      score += 50;
      explanations.push('ACCESSIBLE_MATCH');
    } else score -= 50;
  }
  if (req.preferences.bedType && room.bedType === req.preferences.bedType) {
    score += 15;
    explanations.push('BED_TYPE_MATCH');
  }
  const wanted = req.preferences.features ?? [];
  const matched = wanted.filter((f) => room.features.includes(f));
  if (matched.length) {
    score += matched.length * 5;
    explanations.push('FEATURE_MATCH');
  }
  if (req.preferences.nearFloorLevel !== undefined) {
    const distance = Math.abs(room.floorLevel - req.preferences.nearFloorLevel);
    score += Math.max(0, 10 - distance * 5);
    if (distance === 0) explanations.push('SAME_FLOOR_AS_GROUP');
  }
  // Prefer rooms whose existing bookings leave no small gaps (reduces fragmentation).
  const adjacent = room.allocations.some((a) => a.end === req.start || a.start === req.end);
  if (adjacent) {
    score += 5;
    explanations.push('MINIMIZES_GAPS');
  }
  // Excess capacity is slightly penalised to keep larger rooms for larger parties.
  score -= Math.max(0, room.maxOccupancy - req.occupants);

  return { roomId: room.id, eligible: reasons.length === 0, reasons, score, explanations, isUpgrade };
}

/** Evaluates and ranks rooms; eligible rooms first, by score desc then room number. */
export function rankRooms(rooms: RoomCandidate[], req: AssignmentRequest): (EligibilityResult & { number: string })[] {
  return rooms
    .map((r) => ({ ...evaluateRoom(r, req), number: r.number }))
    .sort((a, b) =>
      a.eligible !== b.eligible ? (a.eligible ? -1 : 1) : b.score - a.score || a.number.localeCompare(b.number, 'en', { numeric: true }),
    );
}
