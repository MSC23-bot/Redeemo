import { PrismaClient } from '../../../generated/prisma/client'

export type AuditEvent =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_SSO_LOGIN_SUCCESS'
  | 'AUTH_LOGOUT'
  | 'AUTH_REFRESH_FAILED'
  // Distinct from AUTH_REFRESH_FAILED — fired when the previous mobile
  // session was deliberately superseded by a newer login on another
  // device (one-mobile-device-per-account rule). Lets the audit log
  // distinguish "natural expiry" from "kicked off by another login"
  // so security/observability dashboards can track the latter
  // separately. Locked 2026-05-08, deferred-followups §AC6 / §AD2.
  | 'AUTH_SESSION_REPLACED'
  | 'AUTH_OTP_SENT'
  | 'AUTH_OTP_VERIFIED'
  | 'AUTH_OTP_FAILED'
  | 'AUTH_OTP_LOCKED'
  | 'AUTH_PASSWORD_RESET'
  | 'AUTH_EMAIL_CHANGED'
  | 'AUTH_PHONE_CHANGED'
  | 'AUTH_SESSION_REVOKED'
  | 'AUTH_SESSIONS_REVOKED'
  | 'AUTH_ACCOUNT_DELETED'
  | 'AUTH_ACCOUNT_SUSPENDED'
  | 'BRANCH_USER_CREATED'
  | 'BRANCH_USER_PASSWORD_SET'
  | 'BRANCH_USER_PASSWORD_CHANGED'
  | 'BRANCH_USER_PASSWORD_RESET'
  | 'BRANCH_USER_DEACTIVATED'
  | 'BRANCH_USER_REACTIVATED'
  | 'BRANCH_PIN_CHANGED'
  | 'REDEMPTION_QUICK_VALIDATED'
  | 'MERCHANT_DEACTIVATED'
  | 'MERCHANT_REACTIVATED'
  | 'MERCHANT_PROFILE_UPDATED'
  // Option B B2.2: a SUPER_ADMIN edited a merchant's registered identity fields
  // (vatNumber / companyNumber) on the merchant's behalf. Distinct from
  // MERCHANT_PROFILE_UPDATED so high-risk identity changes are filterable in the
  // audit trail. `event` is a String column, so this is union-only (no migration).
  | 'MERCHANT_IDENTITY_UPDATED'
  | 'MERCHANT_EDIT_REQUEST_CREATED'
  | 'MERCHANT_EDIT_REQUEST_WITHDRAWN'
  | 'MERCHANT_CONTRACT_ACCEPTED'
  | 'MERCHANT_SUBMITTED_FOR_APPROVAL'
  | 'BRANCH_CREATED'
  | 'BRANCH_UPDATED'
  | 'BRANCH_DELETED'
  | 'BRANCH_EDIT_REQUEST_CREATED'
  | 'BRANCH_EDIT_REQUEST_WITHDRAWN'
  | 'BRANCH_MAIN_CHANGED'
  | 'VOUCHER_CREATED'
  | 'VOUCHER_UPDATED'
  | 'VOUCHER_DELETED'
  | 'VOUCHER_SUBMITTED'
  | 'RMV_UPDATED'
  | 'RMV_SUBMITTED'
  | 'RMV_PROVISIONED'
  | 'CATEGORY_CHANGED'
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_PAYMENT_FAILED'
  | 'SUBSCRIPTION_PROMO_APPLIED'
  | 'VOUCHER_CYCLE_RESET'
  | 'VOUCHER_REDEEMED'
  | 'VOUCHER_VERIFIED'
  | 'BRANCH_PIN_SENT'
  | 'PROFILE_UPDATED'
  | 'PASSWORD_CHANGED'
  // Phase 2 Slice 1 M2 — admin actioner foundation
  | 'MERCHANT_DRAFT_CREATED'
  | 'MEMBERSHIP_CREATED'
  // Draft-owner claim — owner sets their own password via the emailed token
  | 'MERCHANT_CLAIM_COMPLETED'
  // Phase 2 Slice 1 M3 — actioner review loop
  | 'MERCHANT_APPROVAL_CLAIMED'
  | 'MERCHANT_APPROVAL_RELEASED'
  | 'MERCHANT_CHANGES_REQUESTED'
  | 'MERCHANT_APPROVAL_REJECTED'
  | 'MERCHANT_RESUBMITTED'
  // Phase 2 Slice 1 M4 — admin location-confidence pin-drop
  | 'BRANCH_LOCATION_CONFIRMED'
  // Phase 2 Slice 1 M5 — atomic approve / go-live
  | 'MERCHANT_APPROVAL_APPROVED'
  | 'MERCHANT_GO_LIVE'
  // Phase 2 Slice 1 M6a — admin suspend (reactivate reuses MERCHANT_REACTIVATED)
  | 'MERCHANT_SUSPENDED'
  // Option B B1: admin applies / rejects a merchant-requested identity edit.
  // APPROVED carries before/after (the live values vs the applied values);
  // REJECTED carries the reason (live entity unchanged).
  | 'MERCHANT_EDIT_APPROVED'
  | 'MERCHANT_EDIT_REJECTED'
  | 'BRANCH_EDIT_APPROVED'
  | 'BRANCH_EDIT_REJECTED'
  // Option B B4: a SUPER_ADMIN uploaded / deleted a merchant verification document
  // on the merchant's behalf. `event` is a String column, so this is union-only
  // (no migration). The audit payload carries documentId + documentType only; the
  // raw R2 storage key is deliberately NOT recorded (keeps keys out of the log too).
  | 'DOCUMENT_UPLOADED'
  | 'DOCUMENT_DELETED'
  // M1 Slice R: merchant self-serve registration + email-verify. `event` is a
  // String column, so these are union-only (no migration).
  | 'MERCHANT_SELF_REGISTERED'
  | 'MERCHANT_EMAIL_VERIFIED'

export interface AuditContext {
  entityId: string
  entityType: 'customer' | 'merchant' | 'branch' | 'admin'
  event: AuditEvent
  ipAddress: string
  userAgent: string
  deviceId?: string
  sessionId?: string
  metadata?: Record<string, unknown>
}

export function writeAuditLog(prisma: PrismaClient, ctx: AuditContext): void {
  // Fire-and-forget — does not block the request
  prisma.auditLog.create({
    data: {
      entityId:   ctx.entityId,
      entityType: ctx.entityType,
      event:      ctx.event,
      ipAddress:  ctx.ipAddress,
      userAgent:  ctx.userAgent,
      deviceId:   ctx.deviceId,
      sessionId:  ctx.sessionId,
      metadata:   ctx.metadata as any,
    },
  }).catch((err: unknown) => {
    console.error('[audit] Failed to write audit log:', err)
  })
}

// ── Phase 2 Slice 1 M2 — transactional audit with actor ─────────────────────

export type ActorType =
  | 'ADMIN'
  | 'MERCHANT_ADMIN'
  | 'BRANCH_MANAGER'
  | 'BRANCH_STAFF'
  | 'CUSTOMER'
  | 'SYSTEM'

export interface AuditActorContext {
  /** The TARGET of the action (e.g. the merchant being created). */
  entityId: string
  entityType: 'customer' | 'merchant' | 'branch' | 'admin'
  event: AuditEvent
  /** WHO performed the action. */
  actorId: string
  actorType: ActorType
  before?: unknown
  after?: unknown
  reason?: string
  ipAddress: string
  userAgent: string
  metadata?: Record<string, unknown>
}

// Accepts the Prisma `$transaction` client (or a mock) — structural so the
// helper stays decoupled from the generated client type and is easy to test.
// `args: any` lets the real (stricter-typed) tx client satisfy this shape; the
// runtime client still validates the `data` fields.
type AuditTxClient = {
  auditLog: { create: (args: any) => Promise<unknown> }
}

/**
 * Write an audit row INSIDE the caller's transaction, awaited — so the audit
 * record commits/rolls back atomically with the state change it documents.
 * (Contrast `writeAuditLog`, which is fire-and-forget telemetry.)
 */
export async function writeAuditLogTx(tx: AuditTxClient, ctx: AuditActorContext): Promise<void> {
  await tx.auditLog.create({
    data: {
      entityId:   ctx.entityId,
      entityType: ctx.entityType,
      event:      ctx.event,
      actorId:    ctx.actorId,
      actorType:  ctx.actorType,
      before:     ctx.before as unknown,
      after:      ctx.after as unknown,
      reason:     ctx.reason,
      ipAddress:  ctx.ipAddress,
      userAgent:  ctx.userAgent,
      metadata:   ctx.metadata as unknown,
    },
  })
}
