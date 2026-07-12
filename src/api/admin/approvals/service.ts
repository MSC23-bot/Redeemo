import { PrismaClient } from '../../../../generated/prisma/client'
import type { Redis } from 'ioredis'
import { ApprovalType, ApprovalStatus } from '../../../../generated/prisma/enums'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'
import { notify } from '../../shared/notify'
import { merchantChangesRequestedEmail, merchantRejectedEmail, merchantLiveEmail, voucherNowLiveEmail, voucherNowLiveBatchEmail } from '../../shared/merchantEmails'
import { computeOnboardingChecklist } from '../../merchant/onboarding/service'
import { isBranchLocationConfirmed } from '../../shared/location'
import { presignGet } from '../../shared/storage'
import {
  serializeReviewBranch,
  parseStagedSuggestion,
  parsePendingEditSuggestion,
  reviewBranchSelect,
  STAGED_SUGGESTION_AUDIT_EVENTS,
  type StagedSuggestionAuditEvent,
  type ReviewLocationSuggestion,
} from './reviewBranchSerializer'

// Phase 2 Slice 1 M3 — the AdminApproval actioner (review loop; NO approve/
// go-live — that is M5). Every state-changing action is atomic + idempotent and
// writes a transactional audit; request-changes/reject notify the merchant
// owner after commit. The merchant stays PENDING_APPROVAL through the loop
// (spec §2) — only reject (here) or approve (M5) leaves it.

type AuditCtx = { ipAddress: string; userAgent: string }

const ACTIONABLE_STATUSES: ApprovalStatus[] = ['PENDING', 'CHANGES_REQUESTED']

/** Resolve a merchant's ACTIVE OWNER (id + email) for lifecycle notifications. */
export async function getMerchantOwner(
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
  /** Resolve a single merchant's approvals (the bell click-through hinge, PR4). */
  referenceId?: string
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
    ...(filters.referenceId ? { referenceId: filters.referenceId } : {}),
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

  // Team & Roles S4 (spec §5.3): batch-resolve self-approval for every
  // MERCHANT_ONBOARDING row on this page, so the queue History badge/filter
  // never re-derive per row (no N+1 — mirrors the STAGED_SUGGESTION batch
  // idiom in getReviewContext below: one findMany over two event types,
  // precedence resolved in JS). Reads the SAME two rows `deriveSelfOnboarded`
  // reads (the durable MERCHANT_GO_LIVE `metadata.selfOnboarded` stamp,
  // falling back to the MERCHANT_DRAFT_CREATED actorId for pre-stamp rows).
  //
  // Deliberately scoped to APPROVED rows only (see `selfOnboardedFor` below):
  // `deriveSelfOnboarded`'s single-row fallback compares WHOEVER actioned the
  // approval (which for a REJECTED or CHANGES_REQUESTED row is the
  // rejecter/reviewer, not an approver) against the draft creator. A merchant
  // that was rejected by the same admin who drafted it never went live, so it
  // must never carry a "Self-approved" badge — gating on status:APPROVED
  // (which is exactly when a MERCHANT_GO_LIVE audit row is guaranteed to
  // exist) keeps the list read correct without duplicating that risk here.
  const goLiveStampByMerchantId = new Map<string, boolean>()
  const draftCreatorByMerchantId = new Map<string, string>()
  if (merchantIds.length > 0) {
    const selfApprovalAuditRows = await prisma.auditLog.findMany({
      where: {
        entityType: 'merchant',
        entityId: { in: merchantIds },
        event: { in: ['MERCHANT_GO_LIVE', 'MERCHANT_DRAFT_CREATED'] },
      },
      select: { entityId: true, event: true, actorId: true, metadata: true },
      orderBy: { createdAt: 'desc' },
    })
    for (const row of selfApprovalAuditRows) {
      if (row.event === 'MERCHANT_GO_LIVE' && !goLiveStampByMerchantId.has(row.entityId)) {
        const meta = row.metadata as { selfOnboarded?: unknown } | null
        if (meta && typeof meta.selfOnboarded === 'boolean') {
          goLiveStampByMerchantId.set(row.entityId, meta.selfOnboarded)
        }
      }
      if (row.event === 'MERCHANT_DRAFT_CREATED' && !draftCreatorByMerchantId.has(row.entityId) && row.actorId) {
        draftCreatorByMerchantId.set(row.entityId, row.actorId)
      }
    }
  }
  function selfOnboardedFor(a: (typeof approvals)[number]): boolean {
    if (a.type !== 'MERCHANT_ONBOARDING' || a.status !== 'APPROVED' || !a.adminUserId) return false
    const stamped = goLiveStampByMerchantId.get(a.referenceId)
    if (stamped !== undefined) return stamped
    return draftCreatorByMerchantId.get(a.referenceId) === a.adminUserId
  }

  // Day-2 Vouchers A8b - VOUCHER queue enrichment (mirrors the onboarding
  // merchant-summary batch above). Collect the VOUCHER referenceIds, batch-load
  // the vouchers (curated select: id/title/type/status/approvalStatus/merchantId,
  // NO PII/redemptionPin) + their merchants (id/businessName/status), and compute
  // a per-distinct-merchant flagship-live flag (no N+1: one count per distinct
  // VOUCHER merchant). The .map below attaches a `voucher` summary + a
  // `goLiveHint` ('live-now' | 'waiting-for-go-live') so the queue can show enough
  // context before the reviewer opens the row. ONBOARDING / edit rows are untouched.
  const voucherIds = approvals.filter((a) => a.type === 'VOUCHER').map((a) => a.referenceId)
  const voucherRows = voucherIds.length
    ? await prisma.voucher.findMany({
        where: { id: { in: voucherIds } },
        select: { id: true, title: true, type: true, status: true, approvalStatus: true, merchantId: true },
      })
    : []
  const voucherById = new Map(voucherRows.map((v) => [v.id, v]))

  const voucherMerchantIds = Array.from(new Set(voucherRows.map((v) => v.merchantId)))
  const voucherMerchants = voucherMerchantIds.length
    ? await prisma.merchant.findMany({
        where: { id: { in: voucherMerchantIds } },
        select: { id: true, businessName: true, status: true },
      })
    : []
  const voucherMerchantById = new Map(voucherMerchants.map((m) => [m.id, m]))

  // Flagship-live per DISTINCT voucher merchant (one count each - no N+1 per row).
  const flagshipLiveByMerchant = new Map<string, boolean>(
    await Promise.all(
      voucherMerchantIds.map(async (mid): Promise<[string, boolean]> => {
        const notLive = await prisma.voucher.count({
          where: { merchantId: mid, isRmv: true, status: { not: 'ACTIVE' } },
        })
        return [mid, notLive === 0]
      }),
    ),
  )

  // Batch-resolve claimer names (mirrors the merchant-summary batch above + the
  // getReviewContext adminById pattern): one AdminUser lookup over the distinct
  // non-null claimedById set, keyed to "First Last". So the queue can render
  // "Claimed by <name>" instead of a bare "Claimed".
  //
  // Queue previously-reviewed-chip (owner-decided option 1): additively widen
  // the SAME batch to also cover each UNCLAIMED row's prior actioner
  // (adminUserId). On resubmission the backend reuses the same AdminApproval
  // row, clears claimedById, but PRESERVES adminUserId: so an unclaimed row
  // with a non-null adminUserId was reviewed before. No second AdminUser
  // query: the prior-reviewer ids are folded into the one claimer lookup.
  const previousReviewerIds = approvals
    .filter((a) => a.claimedById == null && a.adminUserId != null)
    .map((a) => a.adminUserId as string)
  const claimerIds = Array.from(
    new Set([
      ...approvals.map((a) => a.claimedById).filter((id): id is string => id != null),
      ...previousReviewerIds,
    ]),
  )
  const claimers = claimerIds.length
    ? await prisma.adminUser.findMany({
        where: { id: { in: claimerIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const claimerById = new Map(
    claimers.map((c: { id: string; firstName: string; lastName: string }) => [c.id, `${c.firstName} ${c.lastName}`]),
  )
  /** Unclaimed row + prior actioner -> { previousReviewerName }; omitted otherwise (optional field, mirrors voucherEditKind). */
  function previousReviewerFor(a: (typeof approvals)[number]): { previousReviewerName?: string | null } {
    if (a.claimedById != null || a.adminUserId == null) return {}
    return { previousReviewerName: claimerById.get(a.adminUserId) ?? null }
  }

  // Voucher governed flows: batch-resolve each VOUCHER_EDIT row's kind so the
  // queue can label "Voucher change request" vs "Voucher end request" without
  // opening the row. ONE findMany over the page's VOUCHER_EDIT referenceIds
  // (mirrors the voucher/merchant batches above - no N+1), curated select
  // (kind + merchantId — merchantId feeds the WF16 merchant-summary batch
  // below, so no second query is needed for this type). Additive/optional on
  // the row shape: other types omit voucherEditKind.
  const voucherEditIds = approvals.filter((a) => a.type === 'VOUCHER_EDIT').map((a) => a.referenceId)
  const voucherEditRows = voucherEditIds.length
    ? await prisma.voucherPendingEdit.findMany({
        where: { id: { in: voucherEditIds } },
        select: { id: true, kind: true, merchantId: true },
      })
    : []
  const voucherEditKindById = new Map(voucherEditRows.map((e) => [e.id, e.kind]))

  // WF16 (acceptance-walk finding): every non-onboarding, non-VOUCHER row
  // (identity-edit, branch-edit, branch-create/close) rendered "Unknown
  // merchant" in the queue because listApprovals only ever resolved a
  // `merchant` block for MERCHANT_ONBOARDING (referenceId IS the merchant id)
  // and VOUCHER (referenceId -> Voucher.merchantId). Every remaining type is
  // in fact ONE hop from a merchant too — verified against the actioner's own
  // referenceId-resolution code (claimApproval/releaseApproval above,
  // editApplier.ts, branchLifecycleApplier.ts) and the schema:
  //   - MERCHANT_IDENTITY_EDIT: referenceId -> MerchantPendingEdit.id, which
  //     carries merchantId as a direct column (schema.prisma MerchantPendingEdit).
  //   - BRANCH_IDENTITY_EDIT: referenceId -> BranchPendingEdit.id, which ALSO
  //     carries merchantId as a direct (denormalised) column alongside
  //     branchId — no join through Branch required.
  //   - VOUCHER_EDIT: referenceId -> VoucherPendingEdit.id, which likewise
  //     carries merchantId directly; reuses the voucherEditRows batch above
  //     (widened select) instead of a second query.
  //   - BRANCH_CREATE / BRANCH_CLOSE: referenceId IS the branch id directly
  //     (no PendingEdit indirection — see merchant/branch/service.ts's
  //     createBranch/requestClose writers), so Branch.merchantId resolves it.
  // MERCHANT_PROFILE_EDIT is deliberately left unresolved: no code path in
  // this codebase creates that type (a reserved enum value only), so its
  // referenceId shape is unverified — resolving it would be a guess. It keeps
  // the pre-existing null merchant, same as an unrecognised type.
  //
  // Same no-N+1 batch idiom as the rest of this function: one findMany per
  // distinct PendingEdit/Branch source (curated `{ id, merchantId }` selects),
  // then ONE merchant findMany over the union of merchantIds these batches
  // discover, merged with (but separate from) the existing onboarding/voucher
  // merchant maps.
  const identityEditIds = approvals.filter((a) => a.type === 'MERCHANT_IDENTITY_EDIT').map((a) => a.referenceId)
  const identityEdits = identityEditIds.length
    ? await prisma.merchantPendingEdit.findMany({
        where: { id: { in: identityEditIds } },
        select: { id: true, merchantId: true },
      })
    : []
  const merchantIdByIdentityEditId = new Map(identityEdits.map((e) => [e.id, e.merchantId]))

  const branchEditIds = approvals.filter((a) => a.type === 'BRANCH_IDENTITY_EDIT').map((a) => a.referenceId)
  const branchEdits = branchEditIds.length
    ? await prisma.branchPendingEdit.findMany({
        where: { id: { in: branchEditIds } },
        select: { id: true, merchantId: true },
      })
    : []
  const merchantIdByBranchEditId = new Map(branchEdits.map((e) => [e.id, e.merchantId]))

  const branchLifecycleIds = approvals
    .filter((a) => a.type === 'BRANCH_CREATE' || a.type === 'BRANCH_CLOSE')
    .map((a) => a.referenceId)
  const lifecycleBranches = branchLifecycleIds.length
    ? await prisma.branch.findMany({
        where: { id: { in: branchLifecycleIds } },
        select: { id: true, merchantId: true },
      })
    : []
  const merchantIdByBranchId = new Map(lifecycleBranches.map((b) => [b.id, b.merchantId]))

  const merchantIdByVoucherEditId = new Map(voucherEditRows.map((e) => [e.id, e.merchantId]))

  // Resolve a row's merchantId across the four edit/lifecycle sources above.
  // MERCHANT_ONBOARDING and VOUCHER are resolved separately (existing maps);
  // MERCHANT_PROFILE_EDIT and any unrecognised type return null (see above).
  function resolveEditMerchantId(a: (typeof approvals)[number]): string | null {
    if (a.type === 'MERCHANT_IDENTITY_EDIT') return merchantIdByIdentityEditId.get(a.referenceId) ?? null
    if (a.type === 'BRANCH_IDENTITY_EDIT') return merchantIdByBranchEditId.get(a.referenceId) ?? null
    if (a.type === 'VOUCHER_EDIT') return merchantIdByVoucherEditId.get(a.referenceId) ?? null
    if (a.type === 'BRANCH_CREATE' || a.type === 'BRANCH_CLOSE') return merchantIdByBranchId.get(a.referenceId) ?? null
    return null
  }

  const editMerchantIds = Array.from(
    new Set(
      approvals
        .map((a) => resolveEditMerchantId(a))
        .filter((id): id is string => id != null),
    ),
  )
  // Lean summary (mirrors the VOUCHER row's merchant shape): id/businessName/
  // status only — these rows have no onboarding-specific fields to show.
  const editMerchants = editMerchantIds.length
    ? await prisma.merchant.findMany({
        where: { id: { in: editMerchantIds } },
        select: { id: true, businessName: true, status: true },
      })
    : []
  const editMerchantById = new Map(editMerchants.map((m) => [m.id, m]))

  return {
    page,
    pageSize,
    total,
    approvals: approvals.map((a) => {
      // Day-2 Vouchers A8b - VOUCHER rows get a voucher summary + merchant +
      // goLiveHint; ONBOARDING rows keep the existing merchant block; the
      // WF16 fix above resolves `merchant` for every other recognised type too
      // (identity-edit, branch-edit, branch-create/close); only
      // MERCHANT_PROFILE_EDIT (and any future/unrecognised type) carries null.
      if (a.type === 'VOUCHER') {
        const claimedBy = a.claimedById ? { id: a.claimedById, name: claimerById.get(a.claimedById) ?? null } : null
        const v = voucherById.get(a.referenceId) ?? null
        // Codex review FIX 1: a VOUCHER approval pointing at a missing/deleted
        // voucher (no row in the batch load) returns the safe null shape EXPLICITLY.
        // This removes the prior fragile `v!` non-null assertion: it was only
        // runtime-safe because the goLive `&&` chain short-circuited when `m` was
        // null, so a reorder/refactor could have null-deref'd. The null branch never
        // touches flagshipLiveByMerchant.
        if (!v) {
          return { ...a, merchant: null, voucher: null, goLiveHint: null, claimedBy, selfOnboarded: false, ...previousReviewerFor(a) }
        }
        const m = voucherMerchantById.get(v.merchantId) ?? null
        const goLive = !!m && m.status === 'ACTIVE' && (flagshipLiveByMerchant.get(v.merchantId) ?? false)
        return {
          ...a,
          merchant: m,
          voucher: { title: v.title, type: v.type, status: v.status, approvalStatus: v.approvalStatus },
          goLiveHint: goLive ? ('live-now' as const) : ('waiting-for-go-live' as const),
          claimedBy,
          // VOUCHER rows are never self-approved (the concept is merchant
          // draft-creation vs go-live, not voucher review); see selfOnboardedFor.
          selfOnboarded: false,
          ...previousReviewerFor(a),
        }
      }
      const merchant = a.type === 'MERCHANT_ONBOARDING'
        ? (merchantById.get(a.referenceId) ?? null)
        : (() => {
            const mid = resolveEditMerchantId(a)
            return mid ? (editMerchantById.get(mid) ?? null) : null
          })()
      return {
        ...a,
        merchant,
        claimedBy: a.claimedById ? { id: a.claimedById, name: claimerById.get(a.claimedById) ?? null } : null,
        // Voucher governed flows: VOUCHER_EDIT rows carry the request kind
        // (CHANGE | END) for the queue label; null when the staging row is
        // missing. Other types omit the key entirely (optional field).
        ...(a.type === 'VOUCHER_EDIT'
          ? { voucherEditKind: voucherEditKindById.get(a.referenceId) ?? null }
          : {}),
        // Team & Roles S4 (spec §5.3): true only for a MERCHANT_ONBOARDING row
        // that went live via a self-approval (see selfOnboardedFor above);
        // false for every other type/status, including a rejected/changes-
        // requested onboarding row actioned by the merchant's own draft-creator.
        selfOnboarded: selfOnboardedFor(a),
        ...previousReviewerFor(a),
      }
    }),
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

    // Audit-entity resolution. For onboarding the referenceId IS the merchant id.
    // For the Option B B1 edit types the referenceId is a PendingEdit id, so the
    // real target (merchant for MERCHANT_IDENTITY_EDIT; branch for
    // BRANCH_IDENTITY_EDIT) must be resolved from the PendingEdit row. Disambiguate
    // by approval.type, NEVER by referenceType. Defaults to the onboarding shape.
    let entityId = approval.referenceId
    let entityType: 'merchant' | 'branch' | 'voucher' = 'merchant'
    if (approval.type === 'MERCHANT_IDENTITY_EDIT') {
      const edit = await tx.merchantPendingEdit.findUnique({
        where: { id: approval.referenceId },
        select: { merchantId: true },
      })
      if (edit) entityId = edit.merchantId
    } else if (approval.type === 'VOUCHER_EDIT') {
      // Voucher governed flows: the referenceId is a VoucherPendingEdit id, so
      // the real audit target (the voucher) is resolved from the staging row —
      // the same claim-audit entity fix Option B B1 made for the edit types.
      const edit = await tx.voucherPendingEdit.findUnique({
        where: { id: approval.referenceId },
        select: { voucherId: true },
      })
      if (edit) {
        entityId = edit.voucherId
        entityType = 'voucher'
      }
    } else if (approval.type === 'BRANCH_IDENTITY_EDIT') {
      const edit = await tx.branchPendingEdit.findUnique({
        where: { id: approval.referenceId },
        select: { branchId: true },
      })
      if (edit) {
        entityId = edit.branchId
        entityType = 'branch'
      }
    } else if (approval.type === 'BRANCH_CREATE' || approval.type === 'BRANCH_CLOSE') {
      // Branches PR-5 (§6): a branch-lifecycle approval's referenceId IS the branch id
      // directly (no PendingEdit indirection). Resolve the audit target to the branch
      // — NOT the default entityType:'merchant' arm (which would mislabel a branch id
      // as a merchant, the audit-entity mismatch Option B B1 fixed for edit rows). No
      // merchant onboardingStep side-effect is applied (that is MERCHANT_ONBOARDING-only
      // above).
      entityId = approval.referenceId
      entityType = 'branch'
    } else if (approval.type === 'VOUCHER') {
      // For a VOUCHER approval the referenceId is the Voucher id. The audit
      // target is the owning merchant (matching the voucherApprover DECISION
      // audits: entityId: voucher.merchantId, entityType:'merchant').
      const voucher = await tx.voucher.findUnique({
        where: { id: approval.referenceId },
        select: { merchantId: true },
      })
      if (voucher) entityId = voucher.merchantId
    }

    await writeAuditLogTx(tx, {
      entityId,
      entityType,
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

    // Audit-entity resolution. For onboarding (and the pre-existing edit-type
    // path, which is out of scope here) the referenceId is the merchant id. For
    // a VOUCHER approval the referenceId is the Voucher id, so resolve the
    // owning merchantId (matching the voucherApprover DECISION audits).
    let entityId = approval.referenceId
    let entityType: 'merchant' | 'branch' | 'voucher' = 'merchant'
    if (approval.type === 'VOUCHER') {
      const voucher = await tx.voucher.findUnique({
        where: { id: approval.referenceId },
        select: { merchantId: true },
      })
      if (voucher) entityId = voucher.merchantId
    } else if (approval.type === 'VOUCHER_EDIT') {
      // Voucher governed flows: resolve the staging row to the real voucher
      // (mirrors the claim-side resolution above).
      const edit = await tx.voucherPendingEdit.findUnique({
        where: { id: approval.referenceId },
        select: { voucherId: true },
      })
      if (edit) {
        entityId = edit.voucherId
        entityType = 'voucher'
      }
    } else if (approval.type === 'BRANCH_CREATE' || approval.type === 'BRANCH_CLOSE') {
      // Branches PR-5 (§6): the branch-lifecycle referenceId IS the branch id, so the
      // audit target is the branch — NOT the default entityType:'merchant'. No merchant
      // onboardingStep side-effect (MERCHANT_ONBOARDING-only above).
      entityId = approval.referenceId
      entityType = 'branch'
    }

    await writeAuditLogTx(tx, {
      entityId,
      entityType,
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

    // Day-2 Vouchers A7 - Model 1 delayed activation. With the merchant now live
    // AND the flagship RMVs just activated above, BOTH prerequisites for an
    // approved-waiting CUSTOM voucher are satisfied by construction, so flip every
    // approved-waiting custom (isRmv:false, approvalStatus:APPROVED,
    // status:PENDING_APPROVAL) to ACTIVE in the SAME transaction. STRICT no-op when
    // there are none (the findMany returns []; the updateMany is skipped). A
    // SUBMITTED-not-approved custom (approvalStatus:PENDING) is intentionally NOT
    // matched, so it is not activated. approvalStatus is already APPROVED, so only
    // status flips. The now-live notifications fire post-commit (see below) so they
    // can never roll back this transaction.
    const activatedCustoms = await tx.voucher.findMany({
      where: { merchantId: merchant.id, isRmv: false, approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' },
      select: { id: true, title: true },
    })
    if (activatedCustoms.length > 0) {
      await tx.voucher.updateMany({
        where: { merchantId: merchant.id, isRmv: false, approvalStatus: 'APPROVED', status: 'PENDING_APPROVAL' },
        data: { status: 'ACTIVE' },
      })
    }

    // Approval resolved.
    await tx.adminApproval.update({
      where: { id },
      data: { status: 'APPROVED', adminUserId: adminId, actionedAt: now, claimedById: null, claimedAt: null },
    })

    // Team & Roles S1 (spec §5.2): derive self-approval. The draft-creator is the
    // actorId on the durable MERCHANT_DRAFT_CREATED audit row for this merchant;
    // when the approving admin IS that draft-creator, this go-live is a
    // self-approval. Stamp the derived flag into the MERCHANT_GO_LIVE audit
    // metadata so the oversight badge/filter (S4) is durable and filterable
    // without a recompute. A self-serve merchant has no MERCHANT_DRAFT_CREATED
    // actor to match, so selfOnboarded is false. Schema-free (pure derivation).
    const draftRow = await tx.auditLog.findFirst({
      where: { entityId: merchant.id, entityType: 'merchant', event: 'MERCHANT_DRAFT_CREATED' },
      orderBy: { createdAt: 'desc' },
      select: { actorId: true },
    })
    const selfOnboarded = draftRow?.actorId != null && draftRow.actorId === adminId

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
      metadata: { selfOnboarded },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return {
      merchantId: merchant.id,
      businessName: merchant.businessName,
      alreadyLive: false as const,
      activatedCustoms,
    }
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

  // Day-2 Vouchers A7 - after the owner go-live notify, fire ONE now-live
  // VOUCHER_APPROVAL_UPDATE for the WHOLE set of CUSTOM vouchers activated by the
  // delayed-activation block above. Best-effort via safeNotify so a notify failure
  // NEVER fails the already-committed go-live. Email payload is provided (notify
  // requires it) but delivery stays dark this milestone; the in-app bell is the
  // user-visible signal.
  //
  // Fix 2 (notification-loss, review-driven deviation from the plan's literal
  // "one per voucher"): notify()'s 5/hour per-(type,recipient) send limit returns
  // BEFORE writing the in-app Notification row, so a per-voucher loop would silently
  // drop the 6th+ bell rows when many approved-waiting customs activate at once. We
  // send exactly ONE notify regardless of N. With a single activated voucher it
  // references that voucher by id + names its title; with many it carries a summary
  // body and deep-links to the first activated id so the bell still navigates.
  if (owner && result.activatedCustoms.length > 0) {
    const customs = result.activatedCustoms
    const count = customs.length
    const single = count === 1
    await safeNotify(prisma, redis, {
      to: owner.email,
      recipientType: 'MERCHANT_ADMIN',
      recipientId: owner.adminId,
      type: 'voucher_now_live',
      email: {
        ...(single ? voucherNowLiveEmail(customs[0].title) : voucherNowLiveBatchEmail(count)),
        sender: 'merchant',
      },
      inApp: {
        notificationType: 'VOUCHER_APPROVAL_UPDATE',
        title: single ? 'Your voucher is now live' : 'Your vouchers are now live',
        body: single
          ? 'Members in your area can find and redeem it from today.'
          : `${count} of your custom vouchers are now live on Redeemo.`,
        referenceId: customs[0].id, // single id, or first of the set for deep-link
        referenceType: 'voucher',
      },
      ip: ctx.ipAddress,
    })
  }

  return { approved: true, alreadyLive: false as const, activatedCustoms: result.activatedCustoms }
}

/**
 * Team & Roles S1 (spec §5.2/§5.3): derive whether a merchant's go-live was a
 * SELF-approval (the approving admin also created the merchant's draft). Prefers
 * the durable `selfOnboarded` stamp written onto the MERCHANT_GO_LIVE audit row
 * at approve time; falls back to live derivation (actioner == the
 * MERCHANT_DRAFT_CREATED actorId) for rows approved before the stamp existed.
 * Returns false when the approval has not been actioned, or when there is no
 * admin draft-creator (self-serve merchant). Schema-free; exported so S4's badge
 * and SUPER_ADMIN filter reuse one derivation.
 */
export async function deriveSelfOnboarded(
  prisma: PrismaClient,
  merchantId: string,
  actionedByAdminId: string | null | undefined,
): Promise<boolean> {
  if (!actionedByAdminId) return false
  const goLive = await prisma.auditLog.findFirst({
    where: { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_GO_LIVE' },
    orderBy: { createdAt: 'desc' },
    select: { metadata: true },
  })
  const stamped = goLive?.metadata as { selfOnboarded?: unknown } | null
  if (stamped && typeof stamped.selfOnboarded === 'boolean') return stamped.selfOnboarded
  const draftRow = await prisma.auditLog.findFirst({
    where: { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_DRAFT_CREATED' },
    orderBy: { createdAt: 'desc' },
    select: { actorId: true },
  })
  return draftRow?.actorId != null && draftRow.actorId === actionedByAdminId
}

/**
 * M4 — Full review context for an admin reviewing a merchant onboarding submission.
 *
 * Assembles merchant profile, owner contact, branches (redemptionPin NEVER included),
 * all vouchers (estimatedSaving coerced to Number), documents (presigned GET per view;
 * raw R2 key NEVER returned; unavailable when storage is disabled / presign fails),
 * the onboarding checklist, and thin-area signals. The approval's claimer/actioner
 * names are resolved via a single batched AdminUser lookup. (The merchant activity
 * timeline is owned by the separate GET /admin/merchants/:id/timeline endpoint
 * (M7) and is no longer assembled here.)
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
    }
  }

  const merchantId = approval.referenceId

  // 3. Load all onboarding data in parallel.
  const [merchant, owner, branches, vouchers, documents, checklist] = await Promise.all([
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

    // Branches — redemptionPin MUST NOT be selected; filter soft-deleted. The
    // projection is the test-pinned reviewBranchSelect (co-located with the DTO);
    // redemptionPin is DELIBERATELY absent there (see its doc-comment + test).
    prisma.branch.findMany({
      where: { merchantId, deletedAt: null },
      select: reviewBranchSelect,
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
  ])

  // 4. The only AdminUser ids we resolve are the approval's claimer + actioner.
  //    (The activity timeline, and its actor resolution, moved to the M7
  //    GET /admin/merchants/:id/timeline endpoint.)
  const adminIdSet = new Set<string>()
  if (approval.claimedById) adminIdSet.add(approval.claimedById)
  if (approval.adminUserId) adminIdSet.add(approval.adminUserId)

  const adminUsers = adminIdSet.size
    ? await prisma.adminUser.findMany({
        where: { id: { in: Array.from(adminIdSet) } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const adminById = new Map(
    adminUsers.map((a: { id: string; firstName: string; lastName: string }) => [a.id, `${a.firstName} ${a.lastName}`]),
  )

  // Team & Roles S1: expose self-approval on the read so S4 can badge/filter.
  const selfOnboarded = await deriveSelfOnboarded(prisma, merchantId, approval.adminUserId)

  // Branch Location Trust Slice 2 (lead-adjudicated widening): surface the
  // RELEVANT (freshest) staged Google suggestion per branch, from ANY of the
  // three Slice 1/1b lanes:
  //   - an OPEN (PENDING) BranchPendingEdit's proposedChanges.__locationSuggestion
  //     (the suggestion an admin is ABOUT to approve; reviewed-edit lane), OR
  //   - audit metadata.locationSuggestion on BRANCH_CREATED (create lane) or
  //     BRANCH_UPDATED (draft-window direct edit lane; the lane that stamps
  //     NEEDS_REVIEW immediately, so its suggestion IS the exception context).
  // Precedence: pending-edit WINS over the audit rows (it is the newer intent);
  // among audit rows the LATEST parseable one wins across BOTH events, so an
  // edit-time suggestion supersedes a stale create-time one after an address
  // change; null when none. A malformed blob is skipped, never a crash. This is
  // what the NEEDS_REVIEW exception context shows (suggested pin vs current
  // centroid), plus a source discriminator so the panel can say which it is.
  const branchIds = branches.map((b: { id: string }) => b.id)
  const pendingSuggestionByBranchId = new Map<string, ReviewLocationSuggestion>()
  const auditSuggestionByBranchId = new Map<string, ReviewLocationSuggestion>()
  if (branchIds.length > 0) {
    const [pendingEdits, auditRows] = await Promise.all([
      // OPEN edits only (PENDING): the change an admin is about to approve.
      prisma.branchPendingEdit.findMany({
        where: { branchId: { in: branchIds }, status: 'PENDING' },
        select: { branchId: true, proposedChanges: true },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.auditLog.findMany({
        where: {
          entityType: 'branch',
          entityId: { in: branchIds },
          event: { in: Object.keys(STAGED_SUGGESTION_AUDIT_EVENTS) },
        },
        select: { entityId: true, event: true, metadata: true },
        orderBy: { createdAt: 'desc' },
      }),
    ])
    for (const edit of pendingEdits) {
      if (pendingSuggestionByBranchId.has(edit.branchId)) continue // keep the latest only
      const parsed = parsePendingEditSuggestion(edit.proposedChanges)
      if (parsed) pendingSuggestionByBranchId.set(edit.branchId, parsed)
    }
    for (const row of auditRows) {
      if (auditSuggestionByBranchId.has(row.entityId)) continue // keep the latest only
      const parsed = parseStagedSuggestion(
        row.metadata,
        STAGED_SUGGESTION_AUDIT_EVENTS[row.event as StagedSuggestionAuditEvent],
      )
      if (parsed) auditSuggestionByBranchId.set(row.entityId, parsed)
    }
  }
  // Precedence resolver: pending-edit suggestion beats the audit-staged ones.
  const suggestionForBranch = (branchId: string): ReviewLocationSuggestion | null =>
    pendingSuggestionByBranchId.get(branchId) ?? auditSuggestionByBranchId.get(branchId) ?? null

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
      // Team & Roles S1 (spec §5.3): true when this go-live was self-approved
      // (approver == draft-creator). Drives the S4 "Self-approved" badge/filter.
      selfOnboarded,
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
    branches: branches.map((b: Parameters<typeof serializeReviewBranch>[0]) =>
      serializeReviewBranch(b, suggestionForBranch(b.id)),
    ),
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
  }
}
