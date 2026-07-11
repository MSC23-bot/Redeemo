import { PrismaClient } from '../../../../generated/prisma/client'
import { getMerchantOwner, deriveSelfOnboarded } from '../approvals/service'

// Phase 2 Slice 1 M7 — the merchant communication + activity timeline (READ
// ONLY). It interleaves (a) merchant AuditLog actions and (b) the merchant
// OWNER's lifecycle emails (from CommunicationLog) with delivery state, so an
// actioner can see "what happened, and what the merchant was told" in one feed.
//
// SAFETY (the whole point of M7 — see the integration test):
//  1. CommunicationLog.payload is NEVER selected/returned — it can hold a reset
//     link or a branch PIN during the QUEUED delivery window. The Prisma select
//     omits it entirely.
//  2. Only the OWNER's lifecycle emails are included: filter on the resolved
//     owner's adminId AND recipientType 'MERCHANT_ADMIN'. The branch_pin email
//     is written with recipientType 'BRANCH_USER' + a branch recipientId, so it
//     is excluded on BOTH conditions.
//  3. Output carries only safe display fields — no recipientId / recipientType /
//     externalId / userId / payload.
// The `type` string is passed through raw (no allow-list) so future owner email
// types appear automatically; the frontend maps it to a label.

export type CommunicationStatusValue = 'QUEUED' | 'SENT' | 'FAILED' | 'BOUNCED'
export type CommunicationChannelValue = 'EMAIL' | 'SMS' | 'PUSH'

export type TimelineItem =
  | {
      kind: 'action'
      id: string
      at: string // ISO string — the AuditLog.createdAt
      event: string // raw AuditLog.event (frontend maps to a label)
      actorType: string | null
      actorName: string | null // resolved admin "First Last", or null for non-admin/unresolved
      reason: string | null
      // Team & Roles S4 (spec §5.3): true ONLY on the MERCHANT_GO_LIVE row when
      // that go-live was a self-approval (the approving admin also created the
      // merchant's draft). false on every other row, including a rejected/
      // changes-requested action, so the badge can never mislabel a non-go-live
      // action. Always present (never omitted) so the frontend renders it the
      // same way it does the queue History row's field of the same name.
      selfOnboarded: boolean
    }
  | {
      kind: 'email'
      id: string
      at: string // ISO string — the CommunicationLog.sentAt
      type: string // raw CommunicationLog.type (frontend maps to a label)
      subject: string | null
      status: CommunicationStatusValue
      channel: CommunicationChannelValue
    }

export interface MerchantTimeline {
  items: TimelineItem[] // merged, sorted by `at` DESCENDING (newest first)
  state: {
    status: string
    onboardingStep: string | null
    verificationStatus: string
  } | null // null when the merchant does not exist
  emailsResolvedViaOwner: boolean // true iff an ACTIVE OWNER was resolved
}

/**
 * Read-only merchant timeline: merchant lifecycle state + a merged, newest-first
 * feed of merchant AuditLog actions and the OWNER's lifecycle emails with
 * delivery state. Never throws for an unknown merchant — returns the empty
 * shape (auditLog/owner/comms queries naturally return empty for an unknown id).
 */
export async function getMerchantTimeline(prisma: PrismaClient, merchantId: string): Promise<MerchantTimeline> {
  // 1. Fetch the merchant state, the ACTIVE OWNER, and the recent AuditLog in
  //    parallel. Owner resolution reuses the approvals helper (membership →
  //    merchantAdmin), keeping the OWNER definition identical to the actioner.
  const [merchant, owner, auditRows] = await Promise.all([
    prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { status: true, onboardingStep: true, verificationStatus: true },
    }),
    getMerchantOwner(prisma, merchantId),
    // Recent merchant AuditLog (newest-first, capped at 50). Mirrors M4 exactly:
    // before/after are deliberately NOT selected (out of scope for M7).
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

  // 2. Owner emails: ONLY when an ACTIVE OWNER resolved. Filter on the owner's
  //    adminId AND recipientType 'MERCHANT_ADMIN' (excludes the branch_pin row
  //    on both conditions). payload is NEVER selected.
  const emailRows = owner
    ? await prisma.communicationLog.findMany({
        where: { recipientId: owner.adminId, recipientType: 'MERCHANT_ADMIN' },
        orderBy: { sentAt: 'desc' },
        take: 50,
        select: { id: true, type: true, subject: true, status: true, channel: true, sentAt: true },
      })
    : []

  // 3. Resolve admin actor names for the audit rows (batch one query).
  const adminIdSet = new Set<string>()
  for (const row of auditRows) {
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

  // 3b. Team & Roles S4 (spec §5.3): resolve self-approval for the
  //     MERCHANT_GO_LIVE row, if this merchant has one. A merchant goes live
  //     at most once (approveApproval's already-live branch is idempotent and
  //     never writes a second MERCHANT_GO_LIVE row), so this is O(1) — not
  //     per-row. Reuses the S1 derivation (durable metadata stamp, falling
  //     back to a live actorId comparison for rows approved before the stamp
  //     existed) so this can never drift from the queue History badge.
  const goLiveRow = auditRows.find((row) => row.event === 'MERCHANT_GO_LIVE')
  const goLiveSelfOnboarded = goLiveRow
    ? await deriveSelfOnboarded(prisma, merchantId, goLiveRow.actorId)
    : false

  // 4. Build action + email items, then merge and sort by `at` (the row
  //    timestamp) strictly descending. Each source is independently capped at
  //    50 above, so this is a recent-activity feed, not a strict global
  //    newest-50 across both kinds (fine for a review-screen timeline).
  const actionItems: TimelineItem[] = auditRows.map((row) => ({
    kind: 'action' as const,
    id: row.id,
    at: row.createdAt.toISOString(),
    event: row.event,
    actorType: row.actorType ?? null,
    actorName: row.actorType === 'ADMIN' && row.actorId ? adminById.get(row.actorId) ?? null : null,
    reason: row.reason ?? null,
    selfOnboarded: row.event === 'MERCHANT_GO_LIVE' ? goLiveSelfOnboarded : false,
  }))

  const emailItems: TimelineItem[] = emailRows.map((row) => ({
    kind: 'email' as const,
    id: row.id,
    at: row.sentAt.toISOString(),
    type: row.type,
    subject: row.subject ?? null,
    status: row.status as CommunicationStatusValue,
    channel: row.channel as CommunicationChannelValue,
  }))

  const items = [...actionItems, ...emailItems].sort(
    (a, b) => new Date(b.at).getTime() - new Date(a.at).getTime(),
  )

  return {
    items,
    state: merchant
      ? {
          status: merchant.status,
          onboardingStep: merchant.onboardingStep,
          verificationStatus: merchant.verificationStatus,
        }
      : null,
    emailsResolvedViaOwner: owner !== null,
  }
}
