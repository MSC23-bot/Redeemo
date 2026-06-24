// src/api/shared/merchantNotify.ts
//
// Branches PR-7 (D8) — the MERCHANT-side redemption-alert emitter. The
// MERCHANT_ADMIN analogue of adminNotify (src/api/shared/adminNotify.ts), built
// for the SAME reason: an in-app bell fan-out must NOT write email outbox rows.
//
// Two deliberate separations from notify():
//   1. `merchantNotify` is IN-APP ONLY. It writes ONE Notification row (channel
//      IN_APP) and creates NO CommunicationLog row and NO email job. notify()
//      ALWAYS commits a CommunicationLog EMAIL outbox row + enqueues a delivery
//      job + passes through the email rate limiter; per-validation, per-recipient
//      that would burn an email-quota slot for a high-frequency event AND breach
//      the email-dark lock (EMAIL_ENABLED off => the row is marked FAILED by the
//      worker, terminal, never flushed). The redemption alert is in-app NOW,
//      email LATER (a separate email-enabled slice).
//   2. The producer that calls this is BEST-EFFORT (see verifyRedemption): a
//      notification failure must never fail the merchant validation. The
//      redemption is validated by the isValidated:true update regardless; the
//      alert is a post-commit side-effect (mirrors the actioner safeNotify
//      pattern).
//
// Recipient model (D8 + the owner grill-me decision): the active OWNER(s) +
// the branch's scope-covering BRANCH_MANAGERs. STAFF is excluded (low-privilege
// portal role); BranchUser (app/staff-side) is excluded entirely (no app
// delivery in merchant-web). Self-action is silenced (the validating
// MerchantAdmin, when the actor is a merchant).

import type { PrismaClient } from '../../../generated/prisma/client'
import type { NotificationType } from '../../../generated/prisma/enums'

export interface MerchantNotifyInput {
  /** Target MerchantAdmin id — written to Notification.recipientId. */
  merchantAdminId: string
  type: NotificationType
  title: string
  body: string
  referenceId?: string
  referenceType?: string
}

/**
 * Write ONE in-app merchant bell Notification. NO CommunicationLog, NO email job
 * — this is the in-app-only writer (notify() is the email path). `userId` is
 * hardcoded null: a MERCHANT_ADMIN-recipient Notification never carries the
 * legacy USER FK (mirrors adminNotify's ADMIN invariant). Pure prisma write.
 */
export async function merchantNotify(prisma: PrismaClient, input: MerchantNotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientType: 'MERCHANT_ADMIN',
      recipientId: input.merchantAdminId,
      userId: null, // MERCHANT_ADMIN invariant: never the legacy USER FK.
      channel: 'IN_APP',
      type: input.type,
      title: input.title,
      body: input.body,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null,
    },
  })
}

/**
 * Resolve the SET of MerchantAdmin ids that should receive a redemption alert for
 * a validation at `branchId` of `merchantId`:
 *   - every ACTIVE OWNER membership (multi-owner is supported — enumerate ALL,
 *     never the single-owner getMerchantOwnerContact findFirst);
 *   - every ACTIVE BRANCH_MANAGER membership whose scope covers the branch
 *     (allBranches=true OR a MerchantMembershipBranch row for the branch).
 * STAFF is excluded (D8); BranchUser is not a MerchantMembership row at all, so
 * the app/staff side is excluded by construction.
 *
 * SELF-ACTION SILENCE: `excludeMerchantAdminId` drops the validating merchant-
 * admin from the set (a merchant-portal validation should not alert the person
 * who just validated). The branch-actor (BranchUser) path passes no exclusion —
 * a BranchUser is never a recipient anyway.
 *
 * Returns a DISTINCT list of MerchantAdmin ids (a single membership maps to one
 * MerchantAdmin; the @@unique([merchantId, merchantAdminId]) makes the set
 * naturally distinct, but we de-dup defensively).
 */
export async function resolveRedemptionAlertRecipients(
  prisma: PrismaClient,
  args: { merchantId: string; branchId: string; excludeMerchantAdminId?: string | null },
): Promise<string[]> {
  const memberships = await prisma.merchantMembership.findMany({
    where: {
      merchantId: args.merchantId,
      status: 'ACTIVE',
      role: { in: ['OWNER', 'BRANCH_MANAGER'] },
    },
    select: {
      merchantAdminId: true,
      role: true,
      allBranches: true,
      branches: { select: { branchId: true } },
    },
  })

  const recipients = new Set<string>()
  for (const m of memberships) {
    // Defence-in-depth: only OWNER + BRANCH_MANAGER are recipients. The DB `where`
    // already filters to these two roles, but the in-memory role check ensures a
    // STAFF row can NEVER become a recipient even if a future query change widened
    // the filter (STAFF is excluded per D8 + the owner grill-me decision).
    if (m.role !== 'OWNER' && m.role !== 'BRANCH_MANAGER') continue
    // OWNER: always a recipient. BRANCH_MANAGER: only when scope covers the branch.
    const scopeCovers =
      m.role === 'OWNER' ||
      m.allBranches ||
      m.branches.some((b) => b.branchId === args.branchId)
    if (!scopeCovers) continue
    if (args.excludeMerchantAdminId && m.merchantAdminId === args.excludeMerchantAdminId) continue
    recipients.add(m.merchantAdminId)
  }
  return [...recipients]
}
