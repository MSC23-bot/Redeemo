import type { Redis } from 'ioredis'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { isStorageEnabled, deleteObject } from '../../shared/storage'
import { resolveAdminMerchant, type EditActor } from '../shared'
import {
  getServedAgreement,
  isVersionWatermarked,
  renderAndStoreAgreementPdf,
  SELF_SERVE_SIGNER_NOT_CAPTURED,
} from '../agreement/service'
import { emitMerchantSubmittedAlert, emitMerchantResubmittedAlert } from '../../shared/adminNotify'
import { getMerchantOwnerContact } from '../../shared/merchantMembership'
import { notify } from '../../shared/notify'
import { merchantSubmittedOnBehalfEmail } from '../../shared/merchantEmails'

// D65 Slice 0: the hardcoded CONTRACT_VERSION / CONTRACT_TEXT constants are
// SUPERSEDED by the agreement version registry (src/api/merchant/agreement/versions.ts).
// GET /contract + acceptContract now read the SERVED version + content from the registry
// (behaviour-compatible: GET /contract still returns { version, text }). Review-round S2:
// getServedAgreement serves + binds the legacy non-draft 1.0 in PRODUCTION while the
// current version is a draft (preserving pre-D65 production onboarding), and the current
// draft in non-production for QA. The registry is the single source of the version id +
// the sha256 content hash pinned into evidence.

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

/**
 * M2 B2 (D5): the merchant-facing onboarding taxonomy READ for the category +
 * identity picker. Returns active TOP-LEVEL categories, each with:
 *   - `eligible`: active rmvTemplates >= 2 for that category (mirrors the admin
 *     `listAdminCategories` flag + the provisioning constraint), so the picker can
 *     surface which categories can yet onboard their two flagship vouchers. (B3
 *     reframes templates to per-(category,type) and may revisit this rule.)
 *   - `subcategories`: the category's FULL child list. This is the OPPOSITE of the
 *     customer `listActiveCategories`, which supply-filters subcategories to
 *     `merchants: { some active }` UK-wide. A merchant is often the FIRST in their
 *     subcategory, so onboarding MUST show the full taxonomy regardless of supply.
 *   - per-subcategory cuisine/specialty `tags` from SubcategoryTag, each carrying
 *     `isPrimaryEligible` so the UI knows which can be the primary descriptor.
 *
 * Reads existing tables only (Category + SubcategoryTag + Tag). No schema, no
 * supply filter, no write.
 */
export async function getOnboardingTaxonomy(prisma: PrismaClient) {
  const [topLevels, subcategories] = await Promise.all([
    prisma.category.findMany({
      where: { parentId: null, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        parentId: true,
        sortOrder: true,
        _count: { select: { rmvTemplates: { where: { isActive: true } } } },
      },
    }),
    // NON-supply-filtered: no `merchants: { some: ... }` clause. Every active
    // subcategory surfaces regardless of how many merchants it has.
    prisma.category.findMany({
      where: { parentId: { not: null }, isActive: true },
      orderBy: { sortOrder: 'asc' },
      select: {
        id: true,
        name: true,
        parentId: true,
        sortOrder: true,
        tagLinks: {
          select: {
            isPrimaryEligible: true,
            tag: { select: { id: true, label: true, type: true } },
          },
        },
      },
    }),
  ])

  // Group subcategories under their top-level parent (preserve sortOrder ordering
  // from the query).
  const subsByParent = new Map<string, typeof subcategories>()
  for (const sub of subcategories) {
    const key = sub.parentId as string
    const list = subsByParent.get(key) ?? []
    list.push(sub)
    subsByParent.set(key, list)
  }

  return {
    categories: topLevels.map((c) => ({
      id: c.id,
      name: c.name,
      parentId: c.parentId,
      eligible: c._count.rmvTemplates >= 2,
      subcategories: (subsByParent.get(c.id) ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        parentId: s.parentId,
        tags: s.tagLinks.map((tl) => ({
          id: tl.tag.id,
          label: tl.tag.label,
          type: tl.tag.type,
          isPrimaryEligible: tl.isPrimaryEligible,
        })),
      })),
    })),
  }
}

/**
 * M2 B4 (D8c): the merchant-facing read of the merchant's OWN onboarding approval
 * status + changes-requested reason. The onboarding `AdminApproval` is identified
 * by `{ type: 'MERCHANT_ONBOARDING', referenceId: merchantId }` (the same shape
 * `submitForApprovalCore` creates/reopens). `comment` carries the admin's
 * changes-requested reason when the admin requests changes; a system string
 * otherwise. Returns `{ status, comment, actionedAt }`.
 *
 * Scoped via `resolveAdminMerchant`, so the caller can NEVER read another
 * merchant's approval (the referenceId is always the caller's own merchantId, never
 * an attacker-supplied id). When no approval row exists yet (never submitted), a
 * null-ish shape is returned (NOT a 500) so the lifecycle home can render a clean
 * "not submitted yet" state.
 *
 * Read-only over the existing AdminApproval.comment + status (no schema, no write).
 */
export async function getOnboardingStatus(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const approval = await prisma.adminApproval.findFirst({
    where:   { type: 'MERCHANT_ONBOARDING', referenceId: merchantId },
    select:  { status: true, comment: true, actionedAt: true },
    // submitForApprovalCore reopens the SAME onboarding row (no duplicate threads),
    // so there is normally one row; the order is defensive (newest first).
    orderBy: { submittedAt: 'desc' },
  })
  if (!approval) {
    return { status: null, comment: null, actionedAt: null }
  }
  return {
    status:     approval.status,
    comment:    approval.comment,
    actionedAt: approval.actionedAt,
  }
}

/**
 * Merchant self-serve click-to-agree (the fallback path preserved beside the D65
 * assisted ceremony). D65 Slice 2 retrofit: this ALSO renders a signed PDF + writes
 * an immutable MerchantAgreementRecord (method SELF_SERVE_CLICK, actorAdminId null)
 * so the fallback gains the same evidence pack.
 *
 * `signerName` is threaded from the route but stays OPTIONAL for backward
 * compatibility (the current merchant-web form does not send it yet). When absent, a
 * documented placeholder (SELF_SERVE_SIGNER_NOT_CAPTURED) is recorded rather than a
 * fabricated name - flagged for the merchant-web to start sending the typed name.
 *
 * The version + hash pinned into the evidence record AND the MerchantContract.tcVersion
 * pointer all come from getServedAgreement() (authoritative: the legacy 1.0 in production
 * while the current version is a draft, the current draft in non-production), resolved
 * ONCE. The client-echoed `version` is an INTEGRITY CHECK ONLY: it must equal the served
 * version or the request is refused (AGREEMENT_VERSION_MISMATCH, 409) BEFORE any PDF
 * render/upload, guarding against binding a merchant to text they did not review (a stale
 * page). The honest merchant-web client echoes the version it fetched from GET /contract,
 * which IS the served version, so an honest client never hits the 409.
 *
 * Storage posture: the retrofit is ADDITIVE and must never break onboarding. When
 * STORAGE_ENABLED is off (local/dev/tests), it degrades to the pre-D65 behaviour
 * (contract row + status flip + audit, NO PDF/evidence record), since the evidence
 * record requires a pdfKey. Where storage is live (staging/prod) it always writes the
 * evidence record. This path is NOT production-gated by AGREEMENT_LEGAL_REVIEW_REQUIRED
 * (the existing self-serve flow already flips contractStatus in production today;
 * gating it would break onboarding). FIX 3: the PDF is watermarked only when the SERVED
 * version is a draft. In production the served version is the non-draft legacy 1.0, so the
 * bound PDF is CLEAN; in non-production the served draft is watermarked for QA.
 */
export async function acceptContract(
  prisma: PrismaClient,
  adminId: string,
  version: string,
  ctx: { ipAddress: string; userAgent: string },
  opts?: { signerName?: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { contractStatus: true, businessName: true, tradingName: true, companyNumber: true, vatNumber: true },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (merchant.contractStatus === 'SIGNED') throw new AppError('CONTRACT_ALREADY_SIGNED')

  const agreement = getServedAgreement()

  // Integrity check (runs BEFORE any PDF render/upload): the client echoes the version it
  // fetched from GET /contract, which IS the served version, so an honest client always
  // matches. A mismatch means the client reviewed a stale page; refuse (409) here so no
  // PDF, evidence record, or pointer is written under a version the merchant did not see.
  if (version !== agreement.version) {
    throw new AppError('AGREEMENT_VERSION_MISMATCH')
  }

  const signedAt = new Date()
  const typedName = opts?.signerName?.trim()
  const signerName = typedName && typedName.length > 0 ? typedName : SELF_SERVE_SIGNER_NOT_CAPTURED

  // Render + store the evidence PDF only when storage is live; degrade otherwise so
  // onboarding never breaks in a storage-dark environment.
  let pdfKey: string | null = null
  if (isStorageEnabled()) {
    pdfKey = await renderAndStoreAgreementPdf({
      merchantId,
      agreement,
      signerName,
      signerRoleConfirmation: 'Self-serve (merchant portal)',
      businessLegalName: merchant.businessName,
      tradingName: merchant.tradingName,
      companyNumber: merchant.companyNumber,
      vatNumber: merchant.vatNumber,
      method: 'SELF_SERVE_CLICK',
      witnessLabel: null,
      signedAt,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
      drawnSignature: null,
    })
  }

  // FIX 1: when a PDF was rendered+stored above (storage live), it is already in R2 before
  // this transaction. If the transaction fails, that object would orphan, so a compensating
  // best-effort delete runs in the catch before the original error is rethrown; a cleanup
  // failure is logged and swallowed so it can never mask the original error. When storage is
  // dark (pdfKey null) there is nothing to compensate.
  try {
    await prisma.$transaction(async (tx) => {
    await tx.merchantContract.create({
      data: {
        merchantId,
        signedAt,
        ipAddress: ctx.ipAddress,
        // The pointer takes its authority from the SERVER-selected served agreement (the
        // same object that renders the PDF + stamps the evidence record), never client input.
        tcVersion: agreement.version,
        signatureMethod: 'CLICK_TO_AGREE',
      },
    })

    await tx.merchant.update({
      where: { id: merchantId },
      data: { contractStatus: 'SIGNED', contractStartDate: signedAt },
    })

    // Preserve the existing status-flip audit (backward compat), in-transaction now.
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event: 'MERCHANT_CONTRACT_ACCEPTED',
      actorId: adminId,
      actorType: 'MERCHANT_ADMIN',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    // D65: the immutable evidence record + its own audit, only when a PDF was stored.
    if (pdfKey) {
      const record = await tx.merchantAgreementRecord.create({
        data: {
          merchantId,
          agreementVersion: agreement.version,
          contentHash: agreement.contentHash,
          signerName,
          signerRoleConfirmation: 'Self-serve (merchant portal)',
          actorAdminId: null,
          method: 'SELF_SERVE_CLICK',
          signedAt,
          ipAddress: ctx.ipAddress,
          userAgent: ctx.userAgent,
          pdfKey,
          drawnSignatureKey: null,
        },
        select: { id: true },
      })
      await writeAuditLogTx(tx, {
        entityId: merchantId,
        entityType: 'merchant',
        event: 'MERCHANT_AGREEMENT_SIGNED_SELF_SERVE',
        actorId: adminId,
        actorType: 'MERCHANT_ADMIN',
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        metadata: {
          recordId: record.id,
          agreementVersion: agreement.version,
          contentHash: agreement.contentHash,
          method: 'SELF_SERVE_CLICK',
          signerNameCaptured: Boolean(typedName && typedName.length > 0),
        },
      })
    }
    })
  } catch (err) {
    if (pdfKey) {
      try {
        await deleteObject(pdfKey)
      } catch (cleanupErr) {
        console.warn(`[acceptContract] orphan PDF cleanup for "${pdfKey}" failed (ignored):`, cleanupErr)
      }
    }
    throw err
  }

  // FIX 3: the confirmation "gated" flag reflects the SERVED version's draft status
  // (watermark), decoupled from the env flag: false for the non-draft legacy 1.0 bound in
  // production, true for the draft served in non-production.
  return { accepted: true, gated: isVersionWatermarked(agreement) }
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
