// src/api/shared/moderation.ts
//
// Phase 0 PR-0.6: photo SAFEGUARDS — the provider-agnostic image-moderation scan
// hook + the per-branch photo count cap. Ships DARK: with MODERATION_ENABLED != true
// or MODERATION_PROVIDER=none (the MVP default), scanImage() returns UNAVAILABLE,
// so a photo stays PENDING (admin review) and never auto-publishes.
//
// There is NO upload route here — uploads + the moderation ENQUEUE call site land
// in Phase 2 (with capability/ownership checks). This is the gate + helper layer
// the Phase-2 route will drive; Phase 0 ships it validated + tested.

import type { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from './errors'

export type ScanVerdict = 'CLEAN' | 'FLAGGED' | 'UNAVAILABLE'

const isModerationEnabled = (): boolean => (process.env.MODERATION_ENABLED ?? '') === 'true'
const moderationProvider = (): string => (process.env.MODERATION_PROVIDER ?? 'none').trim().toLowerCase()

/**
 * Scan an image URL for unsafe content. Provider-agnostic + FAIL-SAFE: any state
 * where we cannot get a definitive CLEAN/FLAGGED verdict returns UNAVAILABLE, so
 * the caller leaves the photo PENDING (never auto-publishes). The MVP default
 * (MODERATION_ENABLED off / provider 'none') ⇒ UNAVAILABLE → admin review. Real
 * provider adapters (Rekognition / Sightengine, D1) are wired when chosen.
 */
export async function scanImage(_url: string): Promise<ScanVerdict> {
  if (!isModerationEnabled()) return 'UNAVAILABLE' // master gate off → admin review

  switch (moderationProvider()) {
    case 'none':
      return 'UNAVAILABLE'
    // case 'rekognition': return rekognitionScan(_url)  // Phase 2+ (D1)
    // case 'sightengine': return sightengineScan(_url)  // Phase 2+ (D1)
    default:
      // An enabled-but-unimplemented provider must NEVER publish photos. Fail safe.
      console.warn(
        `[moderation] MODERATION_PROVIDER='${moderationProvider()}' is not implemented — ` +
          `treating as UNAVAILABLE (photos stay PENDING for admin review)`,
      )
      return 'UNAVAILABLE'
  }
}

// ── Per-branch photo count cap ────────────────────────────────────
/** D5 — the default per-branch photo cap; override via PHOTO_COUNT_CAP_PER_BRANCH. */
export const PHOTO_COUNT_CAP_DEFAULT = 15

/** The effective per-branch photo cap (positive-integer env override, else default). */
export function photoCountCap(): number {
  const raw = Number(process.env.PHOTO_COUNT_CAP_PER_BRANCH)
  return Number.isInteger(raw) && raw > 0 ? raw : PHOTO_COUNT_CAP_DEFAULT
}

/**
 * Throw PHOTO_LIMIT_REACHED if the branch is already at its photo cap. FLAGGED
 * rows do NOT count toward the cap (they are invisible + removable), so the cap
 * governs the rows that can occupy a real slot (PENDING + APPROVED). Exported for
 * the Phase-2 upload route to call BEFORE creating a new BranchPhoto.
 */
export async function assertPhotoCapNotExceeded(prisma: PrismaClient, branchId: string): Promise<void> {
  const cap = photoCountCap()
  const count = await prisma.branchPhoto.count({
    where: { branchId, moderationStatus: { not: 'FLAGGED' } },
  })
  if (count >= cap) throw new AppError('PHOTO_LIMIT_REACHED')
}
