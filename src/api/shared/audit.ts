import { PrismaClient } from '../../../generated/prisma/client'

export type AuditEvent =
  | 'AUTH_LOGIN_SUCCESS'
  | 'AUTH_LOGIN_FAILED'
  | 'AUTH_SSO_LOGIN_SUCCESS'
  | 'AUTH_LOGOUT'
  | 'AUTH_REFRESH_FAILED'
  // Merchant logout-durability (backend design 2026-07-06, merchant-only).
  // `event` is a String column, so these are union-only literals with NO
  // migration.
  //   AUTH_LOGOUT_REVOKE_PENDING     — a signed-JWT logout's unconditional DEL
  //     of the refresh-token key could not be confirmed after bounded retry,
  //     so a pending-revocation tombstone was written instead (§3.4 point 3).
  //   AUTH_LOGOUT_REVOKE_UNAVAILABLE — neither the DEL nor the tombstone could
  //     be written (Redis unreachable at logout) — the honestly-degraded case
  //     (§3.4 point 7); the session may remain valid until natural expiry.
  //   AUTH_REFRESH_REFUSED_REVOKED   — a refresh was refused because the
  //     session's pending-revocation tombstone was present (§3.2 step 0) —
  //     the pull-based durable enforcement of an earlier PENDING logout.
  | 'AUTH_LOGOUT_REVOKE_PENDING'
  | 'AUTH_LOGOUT_REVOKE_UNAVAILABLE'
  | 'AUTH_REFRESH_REFUSED_REVOKED'
  // H4 (2026-07-06 security audit): a refresh was refused because the account's
  // status was re-checked and found suspended/deactivated/deleted (customer/branch/
  // admin), and all of the account's sessions were revoked. String column, so this
  // is a union-only literal with NO migration. Distinct from AUTH_REFRESH_FAILED
  // (bad/expired token) so dashboards can track status-driven session termination.
  | 'AUTH_REFRESH_DENIED_STATUS'
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
  // Branches PR-3: a merchant OWNER instantly removed a live (APPROVED) branch
  // photo. `event` is a String column, so this is union-only (no migration). The
  // ADMIN-actor before-snapshot carries the removed photo id + url so the deletion
  // is attributable; the row itself is gone (instant, customer-invisible).
  | 'BRANCH_PHOTO_REMOVED'
  // Owner decision 7-photos (2026-07-11): the onboarding draft-window bypass for
  // branch photos (mirrors the logo/banner M2 D1 bypass). `event` is a String
  // column, so this is a union-only literal with NO migration. Fired when
  // createBranchPhotoEditRequest writes BranchPhoto rows DIRECTLY (APPROVED) /
  // removes them instead of staging a BranchPendingEdit + AdminApproval, because
  // the merchant lifecycle is in the draft window (isDraftWindow: status
  // REGISTERED or onboardingStep NEEDS_CHANGES): a not-yet-live branch has no
  // admin-review reason to leave first-branch photos invisible.
  | 'BRANCH_PHOTOS_DRAFT_APPLIED'
  // Branches PR-5 (D5): branch-lifecycle merchant actions. `event` is a String
  // column, so these are union-only literals with NO migration.
  //   BRANCH_CREATE_CANCELLED — merchant cancelled a pending-create branch (the
  //     never-live branch row + its BRANCH_CREATE approval are removed).
  //   BRANCH_CLOSE_REQUESTED — merchant requested to close a branch (lifecycleStatus
  //     -> PENDING_CLOSE; the branch stays live until admin approval).
  //   BRANCH_CLOSE_WITHDRAWN — merchant withdrew a pending close request (reverts to
  //     LIVE; the branch was live throughout).
  | 'BRANCH_CREATE_CANCELLED'
  | 'BRANCH_CLOSE_REQUESTED'
  | 'BRANCH_CLOSE_WITHDRAWN'
  | 'VOUCHER_CREATED'
  | 'VOUCHER_UPDATED'
  | 'VOUCHER_DELETED'
  | 'VOUCHER_SUBMITTED'
  // Day-2 Vouchers A5: admin VOUCHER-lane decisions. `event` is a String column
  // (see the MERCHANT_IDENTITY_UPDATED note above), so these are union-only
  // literals with NO migration, mirroring the editApplier's MERCHANT_EDIT_APPROVED
  // / MERCHANT_EDIT_REJECTED additions. Distinct from VOUCHER_UPDATED so an admin
  // approve / reject / request-changes decision is filterable in the audit trail.
  | 'VOUCHER_APPROVED'
  | 'VOUCHER_REJECTED'
  | 'VOUCHER_CHANGES_REQUESTED'
  // Voucher governed flows (2026-07-07). `event` is a String column, so these
  // are union-only literals with NO migration, mirroring the sibling
  // *_EDIT_REQUEST_* and *_EDIT_APPROVED/REJECTED naming.
  //   VOUCHER_EDIT_REQUEST_CREATED — merchant created a governed request
  //     (VoucherPendingEdit kind CHANGE on a live flagship, or END on a live
  //     custom voucher); metadata carries voucherId + pendingEditId + kind.
  //   VOUCHER_EDIT_REQUEST_WITHDRAWN — merchant self-service withdrew their own
  //     PENDING VoucherPendingEdit (its AdminApproval -> WITHDRAWN too).
  //   VOUCHER_EDIT_APPROVED / VOUCHER_EDIT_REJECTED — admin applier decisions on
  //     a VOUCHER_EDIT approval (APPROVED carries before/after; REJECTED the reason).
  //   VOUCHER_SUBMISSION_WITHDRAWN — merchant instantly withdrew a
  //     PENDING_APPROVAL custom-voucher submission (voucher -> DRAFT, the open
  //     VOUCHER AdminApproval -> WITHDRAWN; no admin involvement, D2).
  | 'VOUCHER_EDIT_REQUEST_CREATED'
  | 'VOUCHER_EDIT_REQUEST_WITHDRAWN'
  | 'VOUCHER_EDIT_APPROVED'
  | 'VOUCHER_EDIT_REJECTED'
  | 'VOUCHER_SUBMISSION_WITHDRAWN'
  | 'RMV_CREATED'
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
  // Branches PR-5 (D5): admin branch-lifecycle applier decisions. `event` is a
  // String column, so these are union-only literals with NO migration (mirroring
  // the editApplier additions above).
  //   BRANCH_CREATE_APPROVED — admin approved a pending-create branch -> LIVE +
  //     isActive=true (carries before/after).
  //   BRANCH_CREATE_CHANGES_REQUESTED — admin declined a pending-create branch;
  //     it stays PENDING_CREATE (NOT deleted) for the merchant to fix/cancel
  //     (carries the reason).
  //   BRANCH_CLOSE_APPROVED — admin approved a close request -> CLOSED + soft-delete
  //     (carries before/after).
  //   BRANCH_CLOSE_REJECTED — admin declined a close request -> reverts LIVE +
  //     clears closeReason (carries the reason + before/after).
  | 'BRANCH_CREATE_APPROVED'
  | 'BRANCH_CREATE_CHANGES_REQUESTED'
  | 'BRANCH_CLOSE_APPROVED'
  | 'BRANCH_CLOSE_REJECTED'
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
  // Team & Roles S1: SUPER_ADMIN team-management actions on the AdminUser /
  // AdminCapabilityGrant surface. `event` is a String column, so these are
  // union-only literals with NO migration. entityType 'admin', entityId = the
  // TARGET admin, actorId = the acting SUPER_ADMIN.
  //   ADMIN_ACCOUNT_CREATED      — a new admin account was created.
  //   ADMIN_ROLE_CHANGED         — an admin's base AdminRole was changed
  //                                (before/after carry the old/new role).
  //   ADMIN_ACCOUNT_DEACTIVATED  — an admin was deactivated (isActive=false +
  //                                sessions revoked).
  //   ADMIN_CAPABILITY_GRANTED   — a curated capability was granted (metadata
  //                                carries the capability + grant id).
  //   ADMIN_CAPABILITY_REVOKED   — an active grant was revoked (soft revokedAt +
  //                                sessions revoked = the immediate escape hatch).
  | 'ADMIN_ACCOUNT_CREATED'
  | 'ADMIN_ROLE_CHANGED'
  | 'ADMIN_ACCOUNT_DEACTIVATED'
  | 'ADMIN_CAPABILITY_GRANTED'
  | 'ADMIN_CAPABILITY_REVOKED'

export interface AuditContext {
  entityId: string
  // 'voucher' added for the voucher governed flows (2026-07-07): the claim/release
  // audit-entity resolution for a VOUCHER_EDIT approval targets the real voucher
  // (entityType String column — union-only, no migration).
  entityType: 'customer' | 'merchant' | 'branch' | 'admin' | 'voucher'
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
  // 'voucher': see the AuditContext note (voucher governed flows, 2026-07-07).
  entityType: 'customer' | 'merchant' | 'branch' | 'admin' | 'voucher'
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
