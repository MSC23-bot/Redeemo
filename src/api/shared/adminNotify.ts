// src/api/shared/adminNotify.ts
//
// Phase 2 (Admin Panel) M8 — the admin ALERT emitters. M2 shipped the admin
// notification FOUNDATION (the Notification `ADMIN` recipient type, the IN_APP
// channel, the admin bell read endpoints + UI). M8 adds the two EMITTERS that
// actually light the bell up: a merchant SUBMITTED for approval, and a merchant
// RESUBMITTED after changes were requested.
//
// Two deliberate separations from notify():
//   1. `adminNotify` is IN-APP ONLY. It writes ONE Notification row (channel
//      IN_APP) and creates NO CommunicationLog row and NO email job. notify()
//      ALWAYS commits a CommunicationLog outbox row and enqueues a delivery job;
//      the admin bell fan-out must not. (The ops EMAIL alert is sent separately,
//      via notify(), without an `inApp` field — that is the one CommunicationLog
//      row, to the single ops inbox / the one reviewer.)
//   2. The emit functions are BEST-EFFORT. A notification/email failure must
//      never fail the merchant's submit (mirrors the actioner `safeNotify`
//      pattern) — the merchant is submitted regardless.
//
// Owner-locked M8 scope: ONLY ADMIN_MERCHANT_SUBMITTED + ADMIN_MERCHANT_RESUBMITTED.
// BOUNCED / DELIVERY_FAILED / CLAIM_STALE / REVIEW_ASSIGNED are deferred — there
// is deliberately NO "email failed → alert" path here, so the dark ops email
// (marked FAILED by the worker because EMAIL_ENABLED is unset) triggers nothing.

import type { Redis } from 'ioredis'
import type { PrismaClient } from '../../../generated/prisma/client'
import type { NotificationType } from '../../../generated/prisma/enums'
import { adminMerchantSubmittedEmail, adminMerchantResubmittedEmail } from './emailTemplates'

/** The admin roles that receive ops alerts (queue fan-out). */
const ALERTABLE_ROLES = ['OPERATIONS', 'SUPER_ADMIN'] as const

export interface AdminNotifyInput {
  /** Target AdminUser id — written to Notification.recipientId. */
  adminUserId: string
  type: NotificationType
  title: string
  body: string
  referenceId?: string
  referenceType?: string
}

/**
 * Write ONE in-app admin bell Notification. NO CommunicationLog, NO email job —
 * this is the in-app-only writer (notify() is the email path). `userId` is
 * hardcoded null: the M2 invariant is that an ADMIN-recipient Notification never
 * carries the legacy USER FK. Pure prisma write (no redis).
 */
export async function adminNotify(prisma: PrismaClient, input: AdminNotifyInput): Promise<void> {
  await prisma.notification.create({
    data: {
      recipientType: 'ADMIN',
      recipientId: input.adminUserId,
      userId: null, // ADMIN invariant (M2): never the legacy USER FK.
      channel: 'IN_APP',
      type: input.type,
      title: input.title,
      body: input.body,
      referenceId: input.referenceId ?? null,
      referenceType: input.referenceType ?? null,
    },
  })
}

export interface AlertableAdmin {
  id: string
  email: string
  firstName: string
  lastName: string
}

/** Active OPERATIONS + SUPER_ADMIN admins — the SUBMITTED bell fan-out set. */
export async function getAlertableAdmins(prisma: PrismaClient): Promise<AlertableAdmin[]> {
  return prisma.adminUser.findMany({
    where: { isActive: true, role: { in: [...ALERTABLE_ROLES] } },
    select: { id: true, email: true, firstName: true, lastName: true },
  })
}

/** Minimal merchant shape the emitters need (id + name for the bell/email copy). */
export interface AlertMerchant {
  id: string
  businessName: string
}

/**
 * SUBMITTED alert: fan-out an in-app bell Notification to every alertable admin,
 * then (if ADMIN_OPS_ALERT_EMAIL is a non-empty string) send ONE email-only alert
 * to that ops inbox. If the env var is unset the email is skipped — the bell rows
 * are still written. BEST-EFFORT: any failure is logged and swallowed so it can
 * never fail the caller's already-committed submit.
 */
export async function emitMerchantSubmittedAlert(
  prisma: PrismaClient,
  redis: Redis,
  merchant: AlertMerchant,
): Promise<void> {
  try {
    const admins = await getAlertableAdmins(prisma)
    for (const admin of admins) {
      await adminNotify(prisma, {
        adminUserId: admin.id,
        type: 'ADMIN_MERCHANT_SUBMITTED',
        title: 'New merchant submitted for approval',
        body: `${merchant.businessName} has submitted for approval. Open the queue to review it.`,
        referenceId: merchant.id,
        referenceType: 'merchant',
      })
    }

    const opsEmail = process.env.ADMIN_OPS_ALERT_EMAIL
    if (typeof opsEmail === 'string' && opsEmail.trim().length > 0) {
      // Lazy import keeps adminNotify free of the email dispatcher at module load
      // (mirrors the existing admin emitters) and avoids any import cycle.
      const { notify } = await import('./notify')
      // Email-only: NO `inApp` field ⇒ notify() writes a CommunicationLog row but
      // NO Notification. The bell rows above are the in-app side.
      await notify(prisma, redis, {
        to: opsEmail.trim(),
        recipientType: 'ADMIN',
        recipientId: merchant.id,
        userId: null,
        type: 'admin_merchant_submitted',
        email: adminMerchantSubmittedEmail(merchant.businessName),
        ip: null,
      })
    }
  } catch (err) {
    console.warn(
      `[admin-alert] best-effort SUBMITTED alert for merchant ${merchant.id} failed — submit committed, NOT rolled back:`,
      err,
    )
  }
}

/**
 * RESUBMITTED alert: target the reviewer who requested the changes (resolved from
 * AdminApproval.adminUserId, captured by the caller). If that id is null, or the
 * admin no longer exists, or is inactive, the alert is SKIPPED entirely ("where
 * resolvable"). When resolvable: ONE bell Notification + ONE email-only alert to
 * that reviewer. BEST-EFFORT: any failure is logged and swallowed.
 */
export async function emitMerchantResubmittedAlert(
  prisma: PrismaClient,
  redis: Redis,
  merchant: AlertMerchant,
  reviewerAdminId: string | null | undefined,
): Promise<void> {
  try {
    if (!reviewerAdminId) return // not resolvable — no reviewer captured.

    const reviewer = await prisma.adminUser.findUnique({
      where: { id: reviewerAdminId },
      select: { id: true, email: true, isActive: true },
    })
    if (!reviewer || !reviewer.isActive) return // gone or deactivated — skip.

    await adminNotify(prisma, {
      adminUserId: reviewer.id,
      type: 'ADMIN_MERCHANT_RESUBMITTED',
      title: 'Merchant resubmitted after changes',
      body: `${merchant.businessName} has resubmitted after you requested changes. Open the queue to review it.`,
      referenceId: merchant.id,
      referenceType: 'merchant',
    })

    const { notify } = await import('./notify')
    await notify(prisma, redis, {
      to: reviewer.email,
      recipientType: 'ADMIN',
      recipientId: merchant.id,
      userId: null,
      type: 'admin_merchant_resubmitted',
      email: adminMerchantResubmittedEmail(merchant.businessName),
      ip: null,
    })
  } catch (err) {
    console.warn(
      `[admin-alert] best-effort RESUBMITTED alert for merchant ${merchant.id} failed — submit committed, NOT rolled back:`,
      err,
    )
  }
}
