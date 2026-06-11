import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'

export interface ConfirmBranchLocationInput {
  latitude: number
  longitude: number
}

export interface ConfirmBranchLocationResult {
  branchId: string
  latitude: number
  longitude: number
  locationConfidence: 'MANUALLY_CONFIRMED'
}

/**
 * Admin location pin-drop fallback (Phase 2 Slice 1 M4, slice spec §8 / Q7).
 *
 * Sets a branch's coordinates and marks its location `MANUALLY_CONFIRMED`, the
 * single confidence that makes a branch map-eligible (real pin) and — once M5
 * lands — go-live-eligible (it is in `CONFIRMED_LOCATION_SET`). This is the
 * admin escape hatch for when automated postcode/address geocoding could not
 * resolve a precise position.
 *
 * Idempotent: re-confirming simply overwrites the coordinates and re-stamps
 * MANUALLY_CONFIRMED. One transaction does the read → update → in-tx audit so
 * the `BRANCH_LOCATION_CONFIRMED` row (with before/after) commits atomically
 * with the coordinate change.
 *
 * Does NOT touch discovery list-vs-map admission rules — flipping a branch to
 * MANUALLY_CONFIRMED is exactly how it earns a map pin under the existing
 * PR #81 contract; no separate discovery change is needed.
 */
export async function confirmBranchLocation(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  input: ConfirmBranchLocationInput,
  ctx: { ipAddress: string; userAgent: string },
): Promise<ConfirmBranchLocationResult> {
  return prisma.$transaction(async (tx) => {
    const before = await tx.branch.findUnique({
      where: { id: branchId },
      select: { id: true, latitude: true, longitude: true, locationConfidence: true },
    })
    if (!before) throw new AppError('BRANCH_NOT_FOUND')

    const updated = await tx.branch.update({
      where: { id: branchId },
      data: {
        latitude: input.latitude,
        longitude: input.longitude,
        locationConfidence: 'MANUALLY_CONFIRMED',
      },
      select: { id: true, latitude: true, longitude: true, locationConfidence: true },
    })

    await writeAuditLogTx(tx, {
      entityId: branchId,
      entityType: 'branch',
      event: 'BRANCH_LOCATION_CONFIRMED',
      actorId: adminId,
      actorType: 'ADMIN',
      before: {
        latitude: before.latitude !== null ? Number(before.latitude) : null,
        longitude: before.longitude !== null ? Number(before.longitude) : null,
        locationConfidence: before.locationConfidence,
      },
      after: {
        latitude: input.latitude,
        longitude: input.longitude,
        locationConfidence: 'MANUALLY_CONFIRMED',
      },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return {
      branchId: updated.id,
      latitude: Number(updated.latitude),
      longitude: Number(updated.longitude),
      locationConfidence: 'MANUALLY_CONFIRMED' as const,
    }
  })
}
