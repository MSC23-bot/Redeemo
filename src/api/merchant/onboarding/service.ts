import type { Redis } from 'ioredis'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog, writeAuditLogTx } from '../../shared/audit'
import { resolveAdminMerchant, type EditActor } from '../shared'
import { emitMerchantSubmittedAlert, emitMerchantResubmittedAlert } from '../../shared/adminNotify'
import { getMerchantOwnerContact } from '../../shared/merchantMembership'
import { notify } from '../../shared/notify'
import { merchantSubmittedOnBehalfEmail } from '../../shared/merchantEmails'

export const CONTRACT_VERSION = '1.0'
export const CONTRACT_TEXT = `
Redeemo Merchant Agreement v${CONTRACT_VERSION}

By accepting this agreement, you agree to offer a minimum of two Redeemo Mandatory Vouchers (RMV) on the platform. These vouchers are performance-based — you are only promoted when a customer redeems. You retain full control of your custom vouchers. Redeemo reserves the right to suspend merchants who fail to honour redeemed vouchers.

Full legal terms are available at redeemo.co.uk/merchant-terms.
`.trim()

// Checklist computation keyed by merchantId — shared by the merchant-facing
// getOnboardingChecklist (resolves via adminId) and the M3 admin actioner
// (which already has the merchantId from AdminApproval.referenceId).
export async function computeOnboardingChecklist(prisma: PrismaClient, merchantId: string) {
  const [merchant, branchCount, rmvCount] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } }),
    // §BRANCHDEL: Branch now has a `deletedAt` column (soft-delete), so count only
    // non-deleted branches toward the "main branch added" gate — a removed branch
    // must not satisfy onboarding. (M3 temporarily dropped this filter because the
    // column didn't exist yet; restored now that the migration has landed.)
    prisma.branch.count({ where: { merchantId, deletedAt: null } }),
    prisma.voucher.count({ where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } } }),
  ])
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  const branch_created  = branchCount >= 1
  const contract_signed = merchant.contractStatus === 'SIGNED'
  const rmv_configured  = rmvCount >= 2

  return {
    branch_created,
    contract_signed,
    rmv_configured,
    all_complete: branch_created && contract_signed && rmv_configured,
  }
}

export async function getOnboardingChecklist(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return computeOnboardingChecklist(prisma, merchantId)
}

export async function acceptContract(
  prisma: PrismaClient,
  adminId: string,
  version: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (merchant.contractStatus === 'SIGNED') throw new AppError('CONTRACT_ALREADY_SIGNED')

  await prisma.merchantContract.create({
    data: {
      merchantId,
      signedAt:        new Date(),
      ipAddress:       ctx.ipAddress,
      tcVersion:       version,
      signatureMethod: 'CLICK_TO_AGREE',
    },
  })

  await prisma.merchant.update({
    where: { id: merchantId },
    data:  { contractStatus: 'SIGNED', contractStartDate: new Date() },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_CONTRACT_ACCEPTED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return { accepted: true }
}

/**
 * Option B B3: the shared submit-for-approval core, keyed by merchantId + actor.
 * The merchant wrapper (actor MERCHANT_ADMIN, resolved from the JWT via
 * resolveAdminMerchant) and the new admin route (actor ADMIN + reason, resolved
 * by id via resolveTargetMerchantForAdmin) run the SAME validation/apply/audit
 * path — no weaker path. Reuses computeOnboardingChecklist VERBATIM (branch +
 * contract SIGNED + RMV); B3 adds NO new gates and NO admin contract-signing. The
 * ONBOARDING_GATES_INCOMPLETE throw is PAYLOAD-FREE (C1) — the admin UI reads
 * per-gate state from getMerchantDetail.submitChecklist. D2: the audit is written
 * IN-TRANSACTION + actor-attributed (actorType MERCHANT_ADMIN on the merchant
 * path, ADMIN + reason on the admin path), so it commits/rolls back atomically
 * with the state. After commit (best-effort, never fails the submit): the ops
 * fan-out on first-submit (the acting admin silenced on the admin path, D4) or
 * the requesting-reviewer alert on resubmit; plus an owner notice on the admin
 * path (D3). B3 only QUEUES — claim + go-live stay the separate actioner flow.
 */
export async function submitForApprovalCore(
  prisma: PrismaClient,
  redis: Redis,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  ctx: { ipAddress: string; userAgent: string }
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true, onboardingStep: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  // Spec §2: the merchant stays PENDING_APPROVAL through the whole review loop.
  // Allowed: REGISTERED (initial submit) or PENDING_APPROVAL+NEEDS_CHANGES
  // (resubmit after changes-requested). Anything else (under review, live,
  // rejected, suspended) is not submittable → ALREADY_SUBMITTED. On the admin
  // path resolveTargetMerchantForAdmin allows a SUSPENDED merchant, so a suspended
  // merchant reaches here and is correctly refused as not-submittable (no separate
  // code — the status gate already covers it).
  const isResubmit = merchant.status === 'PENDING_APPROVAL' && merchant.onboardingStep === 'NEEDS_CHANGES'
  const canSubmit = merchant.status === 'REGISTERED' || isResubmit
  if (!canSubmit) throw new AppError('ALREADY_SUBMITTED')

  const checklist = await computeOnboardingChecklist(prisma, merchantId)
  if (!checklist.all_complete) throw new AppError('ONBOARDING_GATES_INCOMPLETE')

  // M3: atomic submit. Set verificationStatus PENDING (was inert) and reopen the
  // SAME onboarding approval on resubmit (clear the prior claim) instead of
  // creating a duplicate thread.
  const { updated, reviewerAdminId } = await prisma.$transaction(async (tx) => {
    const m = await tx.merchant.update({
      where: { id: merchantId },
      data:  { status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' },
    })

    const existing = await tx.adminApproval.findFirst({
      where:  { type: 'MERCHANT_ONBOARDING', referenceId: merchantId },
      // M8: also capture adminUserId — on a resubmit the approval is RESET
      // (claim cleared) but adminUserId still points at the reviewer who
      // requested the changes, so we can alert exactly that reviewer.
      select: { id: true, adminUserId: true },
    })
    if (existing) {
      await tx.adminApproval.update({
        where: { id: existing.id },
        data:  {
          status:      'PENDING',
          claimedById: null,
          claimedAt:   null,
          actionedAt:  null,
          comment:     'Merchant resubmitted for onboarding approval',
        },
      })
    } else {
      await tx.adminApproval.create({
        data: {
          type:          'MERCHANT_ONBOARDING',
          status:        'PENDING',
          referenceId:   merchantId,
          referenceType: 'merchant',
          comment:       'Merchant submitted for onboarding approval',
        },
      })
    }

    // D2: in-transaction, actor-attributed audit (replaces the prior post-commit
    // fire-and-forget writeAuditLog). The event is unchanged (already in the
    // AuditEvent union; `event` is a String column — no migration).
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: isResubmit ? 'MERCHANT_RESUBMITTED' : 'MERCHANT_SUBMITTED_FOR_APPROVAL',
      actorId: actor.id,
      actorType: actor.type,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return { updated: m, reviewerAdminId: existing?.adminUserId ?? null }
  })

  // Best-effort admin alerts AFTER the submit commits. A notification/email
  // failure must NEVER fail the submit (both emit helpers swallow + log).
  const alertMerchant = { id: updated.id, businessName: updated.businessName }
  if (isResubmit) {
    // Resubmit → alert the requesting reviewer. Self-action parity (M3): if the
    // acting admin IS that reviewer, skip (they just resubmitted on behalf).
    if (!(actor.type === 'ADMIN' && reviewerAdminId === actor.id)) {
      await emitMerchantResubmittedAlert(prisma, redis, alertMerchant, reviewerAdminId)
    }
  } else {
    // First submit → fan out to the ops queue. D4: silence the acting admin on
    // the admin path so they aren't alerted about their own action.
    await emitMerchantSubmittedAlert(prisma, redis, alertMerchant, {
      excludeAdminId: actor.type === 'ADMIN' ? actor.id : undefined,
    })
  }

  // D3: best-effort owner notice on the ADMIN path only (a merchant who
  // self-submits already knows). Reuses the actioner owner-notify shape
  // (MERCHANT_VERIFICATION_UPDATE) — schema-free. R1: forward-compat record-only
  // today (the merchant surface is Phase 4; email is dark until Phase 6).
  if (actor.type === 'ADMIN') {
    await emitSubmittedOnBehalfOwnerNotice(prisma, redis, merchantId, updated.businessName, ctx.ipAddress)
  }

  return updated
}

/**
 * Merchant-facing submit-for-approval (UNCHANGED signature + route). Resolves the
 * caller's OWN merchant via resolveAdminMerchant (keeps INVALID_CREDENTIALS + the
 * SEC-M2 SUSPENDED block), then delegates to the shared core as a MERCHANT_ADMIN
 * actor. The only observable change vs before is D2: the audit is now
 * in-transaction and carries actorType MERCHANT_ADMIN.
 */
export async function submitForApproval(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return submitForApprovalCore(prisma, redis, { merchantId, actor: { type: 'MERCHANT_ADMIN', id: adminId } }, ctx)
}

/**
 * Option B B3 / D3: best-effort notice to the merchant OWNER that an admin
 * submitted their application on their behalf. Mirrors the actioner owner-notify
 * shape (recipientType MERCHANT_ADMIN, MERCHANT_VERIFICATION_UPDATE in-app + a
 * transactional email) — schema-free, no new NotificationType. BEST-EFFORT: a
 * failure here must never fail the already-committed submit. R1: the in-app row
 * is forward-compat (the merchant portal that surfaces it is Phase 4; email is
 * dark until Phase 6), so this is effectively a record-only write today.
 */
async function emitSubmittedOnBehalfOwnerNotice(
  prisma: PrismaClient,
  redis: Redis,
  merchantId: string,
  businessName: string,
  ip: string | null,
): Promise<void> {
  try {
    const owner = await getMerchantOwnerContact(prisma, merchantId)
    if (!owner) {
      console.warn(`[b3-submit] admin-submit committed for merchant ${merchantId} but no ACTIVE OWNER membership found — owner NOT notified`)
      return
    }
    await notify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'merchant_submitted_on_behalf',
      email: { ...merchantSubmittedOnBehalfEmail(businessName), sender: 'merchant' },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: 'Your application was submitted for review',
        body: 'The Redeemo team submitted your application for review on your behalf. We will let you know the outcome.',
        referenceId: merchantId,
        referenceType: 'merchant',
      },
      ip,
    })
  } catch (err) {
    console.warn(`[b3-submit] best-effort owner notice for merchant ${merchantId} failed — submit committed, NOT rolled back:`, err)
  }
}
