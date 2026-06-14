import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { ApprovalType, ApprovalStatus } from '../../../../generated/prisma/enums'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { notify } from '../../shared/notify'
import { merchantChangesRequestedEmail, merchantRejectedEmail, merchantLiveEmail } from '../../shared/merchantEmails'
import { computeOnboardingChecklist } from '../../merchant/onboarding/service'
import { isBranchLocationConfirmed } from '../../shared/location'
import { presignGet } from '../../shared/storage'

// Phase 2 Slice 1 M3 — the AdminApproval actioner (review loop; NO approve/
// go-live — that is M5). Every state-changing action is atomic + idempotent and
// writes a transactional audit; request-changes/reject notify the merchant
// owner after commit. The merchant stays PENDING_APPROVAL through the loop
// (spec §2) — only reject (here) or approve (M5) leaves it.

type AuditCtx = { ipAddress: string; userAgent: string }

const ACTIONABLE_STATUSES: ApprovalStatus[] = ['PENDING', 'CHANGES_REQUESTED']

/** Resolve a merchant's ACTIVE OWNER (id + email) for lifecycle notifications. */
async function getMerchantOwner(
  prisma: PrismaClient,
  merchantId: string
): Promise<{ adminId: string; email: string } | null> {
  const membership = await prisma.merchantMembership.findFirst({
    where: { merchantId, role: 'OWNER', status: 'ACTIVE' },
    select: { merchantAdmin: { select: { id: true, email: true } } },
  })
  return membership?.merchantAdmin
    ? { adminId: membership.merchantAdmin.id, email: membership.merchantAdmin.email }
    : null
}

/**
 * Actioner-notify best-effort hardening (spec §11). A lifecycle notification is
 * sent AFTER the actioner transaction commits; a notify/enqueue failure must
 * NEVER fail the already-committed action (the merchant is approved / rejected /
 * has changes requested regardless). Log + swallow. Used by approve/go-live,
 * reject, and request-changes.
 */
async function safeNotify(
  prisma: PrismaClient,
  redis: Redis,
  input: Parameters<typeof notify>[2],
): Promise<void> {
  try {
    await notify(prisma, redis, input)
  } catch (err) {
    console.warn(
      `[actioner] best-effort notify '${input.type}' (recipient ${input.recipientId}) failed — action committed, NOT rolled back:`,
      err
    )
  }
}

export interface ListApprovalsFilters {
  type?: ApprovalType
  status?: ApprovalStatus
  claimedById?: string
  /** Only approvals submitted more than N minutes ago (queue-age filter). */
  olderThanMinutes?: number
  page?: number
  pageSize?: number
}

/** Paginated unified queue. MERCHANT_ONBOARDING rows carry a merchant summary. */
export async function listApprovals(prisma: PrismaClient, filters: ListApprovalsFilters) {
  const page = Math.max(1, filters.page ?? 1)
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 20))

  const where = {
    ...(filters.type ? { type: filters.type } : {}),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.claimedById ? { claimedById: filters.claimedById } : {}),
    ...(filters.olderThanMinutes
      ? { submittedAt: { lt: new Date(Date.now() - filters.olderThanMinutes * 60_000) } }
      : {}),
  }

  const [total, approvals] = await Promise.all([
    prisma.adminApproval.count({ where }),
    prisma.adminApproval.findMany({
      where,
      orderBy: { submittedAt: 'asc' },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ])

  const merchantIds = approvals.filter((a) => a.type === 'MERCHANT_ONBOARDING').map((a) => a.referenceId)
  const merchants = merchantIds.length
    ? await prisma.merchant.findMany({
        where: { id: { in: merchantIds } },
        select: {
          id: true,
          businessName: true,
          status: true,
          onboardingStep: true,
          verificationStatus: true,
          contractStatus: true,
        },
      })
    : []
  const merchantById = new Map(merchants.map((m) => [m.id, m]))

  return {
    page,
    pageSize,
    total,
    approvals: approvals.map((a) => ({
      ...a,
      merchant: a.type === 'MERCHANT_ONBOARDING' ? (merchantById.get(a.referenceId) ?? null) : null,
    })),
  }
}

/** One approval + target detail. For MERCHANT_ONBOARDING: merchant + checklist + the 2 RMVs. */
export async function getApproval(prisma: PrismaClient, id: string) {
  const approval = await prisma.adminApproval.findUnique({ where: { id } })
  if (!approval) throw new AppError('APPROVAL_NOT_FOUND')

  if (approval.type !== 'MERCHANT_ONBOARDING') {
    return { ...approval, merchant: null, checklist: null, rmvs: [] as unknown[] }
  }

  const merchantId = approval.referenceId
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id: true,
      businessName: true,
      tradingName: true,
      status: true,
      onboardingStep: true,
      verificationStatus: true,
      contractStatus: true,
      createdAt: true,
    },
  })
  if (!merchant) return { ...approval, merchant: null, checklist: null, rmvs: [] as unknown[] }

  const [checklist, rmvs] = await Promise.all([
    computeOnboardingChecklist(prisma, merchantId),
    prisma.voucher.findMany({
      where: { merchantId, isRmv: true },
      select: { id: true, title: true, type: true, status: true, approvalStatus: true, estimatedSaving: true },
    }),
  ])

  return { ...approval, merchant, checklist, rmvs }
}

/** Claim-to-review: single-winner conditional claim; merchant → UNDER_REVIEW. */
export async function claimApproval(prisma: PrismaClient, id: string, adminId: string, ctx: AuditCtx) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id },
      select: { id: true, type: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')

    // Conditional update = single winner under concurrency. Claimable only when
    // PENDING (submitted/resubmitted) and not already claimed.
    const claimed = await tx.adminApproval.updateMany({
      where: { id, claimedById: null, status: 'PENDING' },
      data: { claimedById: adminId, claimedAt: new Date() },
    })
    if (claimed.count === 0) throw new AppError('APPROVAL_ALREADY_CLAIMED')

    if (approval.type === 'MERCHANT_ONBOARDING') {
      await tx.merchant.update({ where: { id: approval.referenceId }, data: { onboardingStep: 'UNDER_REVIEW' } })
    }

    await writeAuditLogTx(tx, {
      entityId: approval.referenceId,
      entityType: 'merchant',
      event: 'MERCHANT_APPROVAL_CLAIMED',
      actorId: adminId,
      actorType: 'ADMIN',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { claimed: true }
  })
}

/** Release a claim; merchant → SUBMITTED (back from UNDER_REVIEW). */
export async function releaseApproval(prisma: PrismaClient, id: string, adminId: string, adminRole: string, ctx: AuditCtx) {
  return prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id },
      select: { id: true, type: true, referenceId: true, claimedById: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (!approval.claimedById) throw new AppError('APPROVAL_NOT_ACTIONABLE')
    // D1: release-owner guard — the claimer can release their own claim; a
    // SUPER_ADMIN can force-release anyone's; an ordinary admin cannot release
    // another admin's claim. (Defence-in-depth: the UI also gates this.)
    if (approval.claimedById !== adminId && adminRole !== 'SUPER_ADMIN') {
      throw new AppError('APPROVAL_NOT_CLAIMER')
    }

    await tx.adminApproval.update({ where: { id }, data: { claimedById: null, claimedAt: null } })
    if (approval.type === 'MERCHANT_ONBOARDING') {
      await tx.merchant.update({ where: { id: approval.referenceId }, data: { onboardingStep: 'SUBMITTED' } })
    }

    await writeAuditLogTx(tx, {
      entityId: approval.referenceId,
      entityType: 'merchant',
      event: 'MERCHANT_APPROVAL_RELEASED',
      actorId: adminId,
      actorType: 'ADMIN',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return { released: true }
  })
}

/** Request changes: approval → CHANGES_REQUESTED, merchant → NEEDS_CHANGES; notify owner. */
export async function requestChanges(
  prisma: PrismaClient,
  redis: Redis,
  id: string,
  adminId: string,
  reason: string,
  ctx: AuditCtx
) {
  const merchantId = await prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id },
      select: { id: true, type: true, status: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (approval.type !== 'MERCHANT_ONBOARDING' || !ACTIONABLE_STATUSES.includes(approval.status)) {
      throw new AppError('APPROVAL_NOT_ACTIONABLE')
    }
    const merchant = await tx.merchant.findUnique({ where: { id: approval.referenceId }, select: { status: true } })
    if (!merchant || merchant.status === 'ACTIVE') throw new AppError('APPROVAL_NOT_ACTIONABLE')

    await tx.adminApproval.update({
      where: { id },
      data: {
        status: 'CHANGES_REQUESTED',
        comment: reason,
        claimedById: null,
        claimedAt: null,
        adminUserId: adminId,
        actionedAt: new Date(),
      },
    })
    // status stays PENDING_APPROVAL (spec §2); only the onboardingStep moves.
    await tx.merchant.update({ where: { id: approval.referenceId }, data: { onboardingStep: 'NEEDS_CHANGES' } })

    await writeAuditLogTx(tx, {
      entityId: approval.referenceId,
      entityType: 'merchant',
      event: 'MERCHANT_CHANGES_REQUESTED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return approval.referenceId
  })

  const owner = await getMerchantOwner(prisma, merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'merchant_changes_requested',
      email: { ...merchantChangesRequestedEmail(reason), sender: 'merchant' },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: 'Changes requested on your application',
        body: 'We need a few changes before we can approve your Redeemo application. Open the portal to see what to update.',
        referenceId: merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    // Action committed but the merchant has no ACTIVE OWNER membership to notify.
    // Keep the action successful (do NOT block on notification); log so the
    // data-invariant breach is diagnosable (every merchant should have an OWNER).
    console.warn(
      `[actioner] request-changes committed for merchant ${merchantId} but no ACTIVE OWNER membership found — merchant NOT notified`
    )
  }
  return { changesRequested: true }
}

/** Reject (reopenable): merchant → INACTIVE/REJECTED/REJECTED, approval → REJECTED; notify owner. */
export async function rejectApproval(
  prisma: PrismaClient,
  redis: Redis,
  id: string,
  adminId: string,
  reason: string,
  ctx: AuditCtx
) {
  const merchantId = await prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id },
      select: { id: true, type: true, status: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (approval.type !== 'MERCHANT_ONBOARDING' || !ACTIONABLE_STATUSES.includes(approval.status)) {
      throw new AppError('APPROVAL_NOT_ACTIONABLE')
    }
    const merchant = await tx.merchant.findUnique({ where: { id: approval.referenceId }, select: { status: true } })
    if (!merchant || merchant.status === 'ACTIVE') throw new AppError('APPROVAL_NOT_ACTIONABLE')

    await tx.adminApproval.update({
      where: { id },
      data: {
        status: 'REJECTED',
        comment: reason,
        claimedById: null,
        claimedAt: null,
        adminUserId: adminId,
        actionedAt: new Date(),
      },
    })
    await tx.merchant.update({
      where: { id: approval.referenceId },
      data: { status: 'INACTIVE', onboardingStep: 'REJECTED', verificationStatus: 'REJECTED' },
    })

    await writeAuditLogTx(tx, {
      entityId: approval.referenceId,
      entityType: 'merchant',
      event: 'MERCHANT_APPROVAL_REJECTED',
      actorId: adminId,
      actorType: 'ADMIN',
      reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    return approval.referenceId
  })

  const owner = await getMerchantOwner(prisma, merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'merchant_rejected',
      email: { ...merchantRejectedEmail(reason), sender: 'merchant' },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: 'Update on your application',
        body: 'We were unable to approve your Redeemo application. Open the portal for details.',
        referenceId: merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    // See request-changes: keep the action successful, log the missing-OWNER
    // data-invariant breach (merchant not notified). No block on notification.
    console.warn(
      `[actioner] reject committed for merchant ${merchantId} but no ACTIVE OWNER membership found — merchant NOT notified`
    )
  }
  return { rejected: true }
}

/**
 * Approve a merchant onboarding submission → atomic go-live (Phase 2 Slice 1
 * M5, spec §6). One transaction re-validates the go-live gates SERVER-SIDE
 * (never trusts the submit-time snapshot), flips the merchant to ACTIVE/LIVE/
 * VERIFIED, activates its mandatory RMVs, marks the approval APPROVED, and
 * writes two transactional audit rows (MERCHANT_APPROVAL_APPROVED +
 * MERCHANT_GO_LIVE, with before/after). After commit it best-effort notifies
 * the merchant OWNER ("you're live"). Idempotent: a merchant that is already
 * ACTIVE is a safe no-op (no re-activation, no re-notify) — spec §12.
 */
export async function approveApproval(
  prisma: PrismaClient,
  redis: Redis,
  id: string,
  adminId: string,
  ctx: AuditCtx
) {
  const result = await prisma.$transaction(async (tx) => {
    const approval = await tx.adminApproval.findUnique({
      where: { id },
      select: { id: true, type: true, status: true, referenceId: true },
    })
    if (!approval) throw new AppError('APPROVAL_NOT_FOUND')
    if (approval.type !== 'MERCHANT_ONBOARDING') throw new AppError('APPROVAL_NOT_ACTIONABLE')

    const merchant = await tx.merchant.findUnique({
      where: { id: approval.referenceId },
      select: {
        id: true,
        businessName: true,
        status: true,
        onboardingStep: true,
        verificationStatus: true,
        contractStatus: true,
        isTestData: true,
      },
    })
    if (!merchant) throw new AppError('APPROVAL_NOT_ACTIONABLE')

    // Idempotency (spec §12): a merchant that already went live is a safe
    // no-op — do NOT re-activate, re-stamp, or re-notify. This guard precedes
    // the actionable-status check so a duplicate/concurrent approve returns
    // cleanly instead of erroring on the now-APPROVED approval.
    if (merchant.status === 'ACTIVE') {
      return { merchantId: merchant.id, businessName: merchant.businessName, alreadyLive: true as const }
    }

    // Defence-in-depth: never go-live a seed/demo (test-data) merchant through
    // the actioner. (Discovery already filters isTestData, so this is belt-and-
    // braces.) Real merchants created via createMerchantDraft are isTestData=false.
    if (merchant.isTestData) throw new AppError('APPROVAL_NOT_ACTIONABLE')

    if (!ACTIONABLE_STATUSES.includes(approval.status)) throw new AppError('APPROVAL_NOT_ACTIONABLE')

    // Re-validate the onboarding completeness gates server-side. Mirrors
    // computeOnboardingChecklist (contract SIGNED, >=1 branch, >=2 RMVs present)
    // but runs inside this transaction against live state. The error carries the
    // per-gate checklist so the caller can see exactly what is missing.
    const branchCount = await tx.branch.count({ where: { merchantId: merchant.id } })
    const rmvCount = await tx.voucher.count({
      where: { merchantId: merchant.id, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
    })
    const checklist = {
      branch_created: branchCount >= 1,
      contract_signed: merchant.contractStatus === 'SIGNED',
      rmv_configured: rmvCount >= 2,
    }
    if (!(checklist.branch_created && checklist.contract_signed && checklist.rmv_configured)) {
      throw new AppError('ONBOARDING_GATES_INCOMPLETE', { checklist })
    }

    // Go-live location gate (M5 consumes the M4 CONFIRMED_LOCATION_SET helper):
    // the main branch must exist + be confirmed (locationConfidence ∈ the set).
    const mainBranch = await tx.branch.findFirst({
      where: { merchantId: merchant.id, isMainBranch: true, isActive: true },
      select: { id: true, locationConfidence: true },
    })
    if (!mainBranch) {
      throw new AppError('ONBOARDING_GATES_INCOMPLETE', { checklist: { ...checklist, branch_created: false } })
    }
    if (!isBranchLocationConfirmed(mainBranch)) throw new AppError('MAIN_BRANCH_LOCATION_UNCONFIRMED')

    const now = new Date()

    // Win the go-live flip EXACTLY ONCE (spec §12 — concurrency-safe idempotency).
    // Atomic compare-and-set: if a concurrent approve already flipped the merchant
    // to ACTIVE, this matches 0 rows → we lost the race → return the idempotent
    // already-live response BEFORE any RMV / approval / audit writes, so the
    // transition + its side effects run exactly once. (Mirrors the `claim` action's
    // conditional `WHERE … IS NULL` pattern.) The earlier `status === 'ACTIVE'`
    // guard is the sequential fast-path; this is the truly-concurrent net.
    const won = await tx.merchant.updateMany({
      where: { id: merchant.id, status: { not: 'ACTIVE' } },
      data: { status: 'ACTIVE', onboardingStep: 'LIVE', verificationStatus: 'VERIFIED' },
    })
    if (won.count === 0) {
      return { merchantId: merchant.id, businessName: merchant.businessName, alreadyLive: true as const }
    }

    // (winner only) Activate the mandatory RMVs (status→ACTIVE, approvalStatus→APPROVED).
    await tx.voucher.updateMany({
      where: { merchantId: merchant.id, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } },
      data: { status: 'ACTIVE', approvalStatus: 'APPROVED', approvedBy: adminId, approvedAt: now },
    })

    // Approval resolved.
    await tx.adminApproval.update({
      where: { id },
      data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })

    await writeAuditLogTx(tx, {
      entityId: merchant.id,
      entityType: 'merchant',
      event: 'MERCHANT_APPROVAL_APPROVED',
      actorId: adminId,
      actorType: 'ADMIN',
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    await writeAuditLogTx(tx, {
      entityId: merchant.id,
      entityType: 'merchant',
      event: 'MERCHANT_GO_LIVE',
      actorId: adminId,
      actorType: 'ADMIN',
      before: {
        status: merchant.status,
        onboardingStep: merchant.onboardingStep,
        verificationStatus: merchant.verificationStatus,
      },
      after: { status: 'ACTIVE', onboardingStep: 'LIVE', verificationStatus: 'VERIFIED' },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return { merchantId: merchant.id, businessName: merchant.businessName, alreadyLive: false as const }
  })

  if (result.alreadyLive) return { approved: true, alreadyLive: true as const }

  // After commit (best-effort): notify the merchant OWNER they are live.
  const owner = await getMerchantOwner(prisma, result.merchantId)
  if (owner) {
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'merchant_live',
      email: { ...merchantLiveEmail(result.businessName), sender: 'merchant' },
      inApp: {
        notificationType: 'MERCHANT_VERIFICATION_UPDATE',
        title: "You're live on Redeemo",
        body: 'Your business is now live. Members can find you and redeem your offers from today.',
        referenceId: result.merchantId,
        referenceType: 'merchant',
      },
      ip: ctx.ipAddress,
    })
  } else {
    console.warn(
      `[actioner] approve/go-live committed for merchant ${result.merchantId} but no ACTIVE OWNER membership found — merchant NOT notified`
    )
  }
  return { approved: true, alreadyLive: false as const }
}

/**
 * M4 — Full review context for an admin reviewing a merchant onboarding submission.
 *
 * Assembles merchant profile, owner contact, branches (redemptionPin NEVER included),
 * all vouchers (estimatedSaving coerced to Number), documents (presigned GET per view;
 * raw R2 key NEVER returned; unavailable when storage is disabled / presign fails),
 * the onboarding checklist, thin-area signals, and a recent AuditLog activity list
 * with actor names resolved via a single batched AdminUser lookup.
 *
 * Non-MERCHANT_ONBOARDING approvals degrade gracefully: approval block populated,
 * everything else null / []. No schema changes, no mutations.
 */
export async function getReviewContext(prisma: PrismaClient, id: string) {
  // 1. Load the approval.
  const approval = await prisma.adminApproval.findUnique({ where: { id } })
  if (!approval) throw new AppError('APPROVAL_NOT_FOUND')

  // 2. For non-onboarding types, return a minimal context immediately.
  if (approval.type !== 'MERCHANT_ONBOARDING') {
    return {
      approval: {
        id: approval.id,
        type: approval.type,
        status: approval.status,
        submittedAt: approval.submittedAt,
        actionedAt: approval.actionedAt,
        claimedAt: approval.claimedAt,
        comment: approval.comment,
        claimedBy: null,
        actionedBy: null,
      },
      merchant: null,
      owner: null,
      branches: [] as unknown[],
      vouchers: [] as unknown[],
      documents: [] as unknown[],
      checklist: null,
      thinAreas: null,
      activity: [] as unknown[],
    }
  }

  const merchantId = approval.referenceId

  // 3. Load all onboarding data in parallel.
  const [merchant, owner, branches, vouchers, documents, checklist, activityRows] = await Promise.all([
    // Merchant full profile + primary category
    prisma.merchant.findUnique({
      where: { id: merchantId },
      select: {
        id: true,
        businessName: true,
        tradingName: true,
        description: true,
        websiteUrl: true,
        logoUrl: true,
        bannerUrl: true,
        companyNumber: true,
        vatNumber: true,
        status: true,
        verificationStatus: true,
        contractStatus: true,
        contractStartDate: true,
        contractEndDate: true,
        onboardingStep: true,
        createdAt: true,
        primaryCategory: { select: { name: true } },
      },
    }),

    // Owner — active OWNER membership -> merchantAdmin
    prisma.merchantMembership.findFirst({
      where: { merchantId, role: 'OWNER', status: 'ACTIVE' },
      select: {
        merchantAdmin: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
    }),

    // Branches — redemptionPin MUST NOT be selected; filter soft-deleted
    prisma.branch.findMany({
      where: { merchantId, deletedAt: null },
      select: {
        id: true,
        name: true,
        isMainBranch: true,
        isActive: true,
        addressLine1: true,
        addressLine2: true,
        city: true,
        postcode: true,
        localityName: true,
        locationConfidence: true,
        // redemptionPin is intentionally omitted — NEVER expose it
      },
    }),

    // Vouchers (all types — RMV + custom)
    prisma.voucher.findMany({
      where: { merchantId },
      select: {
        id: true,
        title: true,
        type: true,
        isRmv: true,
        rmvTemplateId: true,
        status: true,
        approvalStatus: true,
        approvalComment: true,
        estimatedSaving: true, // Decimal — coerced below
        terms: true,
        description: true,
        expiryDate: true,
      },
    }),

    // Documents — fileUrl is fetched only to presign; NEVER included in output
    prisma.merchantDocument.findMany({
      where: { merchantId },
      select: { id: true, documentType: true, uploadedAt: true, fileUrl: true },
    }),

    // Onboarding checklist (reuses the shared helper)
    computeOnboardingChecklist(prisma, merchantId).catch(() => null),

    // Recent merchant AuditLog (newest-first, capped at 50)
    prisma.auditLog.findMany({
      where: { entityId: merchantId, entityType: 'merchant' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        event: true,
        createdAt: true,
        actorType: true,
        actorId: true,
        reason: true,
      },
    }),
  ])

  // 4. Collect all AdminUser IDs referenced in the approval + activity, then batch-fetch.
  const adminIdSet = new Set<string>()
  if (approval.claimedById) adminIdSet.add(approval.claimedById)
  if (approval.adminUserId) adminIdSet.add(approval.adminUserId)
  for (const row of activityRows) {
    if (row.actorType === 'ADMIN' && row.actorId) adminIdSet.add(row.actorId)
  }

  const adminUsers = adminIdSet.size
    ? await prisma.adminUser.findMany({
        where: { id: { in: Array.from(adminIdSet) } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const adminById = new Map(
    adminUsers.map((a: { id: string; firstName: string; lastName: string }) => [a.id, `${a.firstName} ${a.lastName}`]),
  )

  // 5. Presign each document's GET URL inside a try/catch.
  //    The raw fileUrl (R2 key) is NEVER included in the output — even on failure.
  const resolvedDocuments = await Promise.all(
    documents.map(async ({ id: docId, documentType, uploadedAt, fileUrl }: { id: string; documentType: string; uploadedAt: Date; fileUrl: string }) => {
      try {
        const { url } = await presignGet(fileUrl)
        return { id: docId, documentType, uploadedAt, url, available: true }
      } catch {
        return { id: docId, documentType, uploadedAt, url: null, available: false }
      }
    })
  )

  // 6. Assemble the response.
  return {
    approval: {
      id: approval.id,
      type: approval.type,
      status: approval.status,
      submittedAt: approval.submittedAt,
      actionedAt: approval.actionedAt,
      claimedAt: approval.claimedAt,
      comment: approval.comment,
      claimedBy: approval.claimedById
        ? { id: approval.claimedById, name: adminById.get(approval.claimedById) ?? null }
        : null,
      actionedBy: approval.adminUserId
        ? { id: approval.adminUserId, name: adminById.get(approval.adminUserId) ?? null }
        : null,
    },
    merchant: merchant
      ? {
          id: merchant.id,
          businessName: merchant.businessName,
          tradingName: merchant.tradingName,
          description: merchant.description,
          websiteUrl: merchant.websiteUrl,
          logoUrl: merchant.logoUrl,
          bannerUrl: merchant.bannerUrl,
          companyNumber: merchant.companyNumber,
          vatNumber: merchant.vatNumber,
          status: merchant.status,
          verificationStatus: merchant.verificationStatus,
          contractStatus: merchant.contractStatus,
          contractStartDate: merchant.contractStartDate,
          contractEndDate: merchant.contractEndDate,
          onboardingStep: merchant.onboardingStep,
          createdAt: merchant.createdAt,
          category: merchant.primaryCategory?.name ?? null,
        }
      : null,
    owner: owner?.merchantAdmin
      ? {
          id: owner.merchantAdmin.id,
          name: `${owner.merchantAdmin.firstName} ${owner.merchantAdmin.lastName}`,
          email: owner.merchantAdmin.email,
          phone: owner.merchantAdmin.phone ?? undefined,
        }
      : null,
    branches,
    vouchers: vouchers.map((v) => ({
      id: v.id,
      title: v.title,
      type: v.type,
      isRmv: v.isRmv,
      rmvTemplateId: v.rmvTemplateId,
      status: v.status,
      approvalStatus: v.approvalStatus,
      approvalComment: v.approvalComment,
      estimatedSaving: Number(v.estimatedSaving),
      terms: v.terms,
      description: v.description,
      expiryDate: v.expiryDate,
    })),
    documents: resolvedDocuments,
    checklist,
    thinAreas: merchant
      ? {
          documentsUploaded: documents.length > 0,
          companyTypeCaptured: false as const,
          registeredOfficeCaptured: false as const,
          sectorEvidenceCaptured: false as const,
          companyNumberProvided: merchant.companyNumber != null,
          vatNumberProvided: merchant.vatNumber != null,
          documentsGated: false as const,
        }
      : null,
    activity: activityRows.map((row) => ({
      id: row.id,
      event: row.event,
      createdAt: row.createdAt,
      actorType: row.actorType,
      reason: row.reason,
      actor:
        row.actorType === 'ADMIN' && row.actorId
          ? { id: row.actorId, name: adminById.get(row.actorId) ?? null }
          : null,
    })),
  }
}
