// Team & Roles S3 (spec 2026-07-10-admin-capability-grants-field-role §4.2).
//
// FIELD pre-live scope guard. FIELD reps hold the assisted-onboarding on-behalf
// capabilities (merchant:edit / submit / manage-branches / manage-documents /
// manage-vouchers), but owner-locked (2026-07-10) those powers apply ONLY to
// PRE-LIVE merchants (Merchant.status IN {REGISTERED, PENDING_APPROVAL}), never
// to live/inactive/suspended/deleted ones. A capability grant is role-wide and
// cannot itself encode "only pre-live", so the scope is enforced SERVER-SIDE
// here, as a role-conditional clamp.
//
// This is DEFENCE IN DEPTH on top of `requireAdminCapability`, NOT a replacement:
// the capability gate still runs first; this guard runs after, once the target
// merchantId is known. It clamps ONLY the FIELD role — OPERATIONS and SUPER_ADMIN
// (who hold the same caps by role / short-circuit) act on any merchant unchanged,
// preserving their existing post-live edit powers.

import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from '../shared/errors'

// The merchant lifecycle states in which a FIELD rep's on-behalf caps apply.
// Mirrors the pre-live set the on-behalf routes already key on (createMerchantDraft
// seeds REGISTERED; submit-on-behalf keys on REGISTERED / PENDING_APPROVAL).
const PRE_LIVE_STATUSES: ReadonlySet<string> = new Set(['REGISTERED', 'PENDING_APPROVAL'])

/**
 * Clamp a FIELD actor's on-behalf mutation to PRE-LIVE merchants only.
 *
 * - `adminRole !== 'FIELD'` -> NO-OP (returns immediately, no DB read). OPERATIONS
 *   and SUPER_ADMIN are never scope-restricted by this guard.
 * - FIELD actor -> load the target merchant's status (a single authoritative read
 *   at guard time, so the decision cannot drift from a status the caller passed in)
 *   and throw:
 *     - `MERCHANT_NOT_FOUND` (404) if the merchant does not exist;
 *     - `MERCHANT_NOT_PRE_LIVE_FOR_FIELD` (403) unless the status is in the
 *       pre-live set.
 *
 * Call this AFTER `requireAdminCapability` and AFTER the target merchantId is
 * resolved (branch-scoped routes must resolve the owning merchantId first).
 */
export async function assertFieldPreLiveScope(
  prisma: PrismaClient,
  adminRole: string | undefined,
  merchantId: string,
): Promise<void> {
  if (adminRole !== 'FIELD') return

  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { status: true },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (!PRE_LIVE_STATUSES.has(merchant.status)) throw new AppError('MERCHANT_NOT_PRE_LIVE_FOR_FIELD')
}
