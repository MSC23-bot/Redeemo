import type { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'

// My Account (Stage 1 backend prerequisites, no schema): read/update the
// logged-in MerchantAdmin's OWN personal account fields, and list their OWN
// live sessions ("Where you are signed in"). Distinct from
// src/api/merchant/profile (the BUSINESS/Merchant entity) — this module is
// scoped to the MerchantAdmin PERSON row, per-person like
// src/api/merchant/notifications, so every query/update is bound to the
// caller's own adminId (req.user.sub) with no merchant-org resolution and no
// suspend gate (a suspended/rejected merchant can still see/manage their own
// account, matching the notifications module's rationale).

const ACCOUNT_SELECT = {
  id: true,
  firstName: true,
  lastName: true,
  jobTitle: true,
  email: true,
  phone: true,
  phoneCountryCode: true,
  emailVerified: true,
} as const

// Audit events whose most recent row (for this admin, entityType 'merchant')
// marks the last time the password actually changed:
//   - PASSWORD_CHANGED    — the authenticated My Account change-password path
//     (changePasswordMerchant, src/api/auth/merchant/service.ts).
//   - AUTH_PASSWORD_RESET — the public forgot-password/reset-token path
//     (resetPasswordMerchant).
// Both mutate MerchantAdmin.passwordHash directly; no schema field records
// this, so it is DERIVED from the audit trail rather than invented.
const PASSWORD_CHANGE_EVENTS = ['PASSWORD_CHANGED', 'AUTH_PASSWORD_RESET'] as const

async function getLastPasswordChangeAt(prisma: PrismaClient, adminId: string): Promise<Date | null> {
  const row = await prisma.auditLog.findFirst({
    where: { entityId: adminId, entityType: 'merchant', event: { in: [...PASSWORD_CHANGE_EVENTS] } },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  return row?.createdAt ?? null
}

/**
 * GET account: the logged-in admin's own curated account fields plus a
 * derived `passwordChangedAt` (the most recent PASSWORD_CHANGED /
 * AUTH_PASSWORD_RESET audit row for this admin, or null if neither has ever
 * fired — e.g. a draft-claim-only account). Never selects passwordHash.
 */
export async function getMerchantAccount(prisma: PrismaClient, adminId: string) {
  const admin = await prisma.merchantAdmin.findUnique({
    where: { id: adminId },
    select: ACCOUNT_SELECT,
  })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  const passwordChangedAt = await getLastPasswordChangeAt(prisma, adminId)
  return { ...admin, passwordChangedAt }
}

// Strict allow-list — only these 3 fields are ever written. Email/phone are
// separate confirmed-change flows (out of scope here); role/passwordHash/etc.
// can never reach the DB write regardless of what the route lets through
// (defence in depth alongside the route's `.strict()` zod schema, which
// already rejects unknown keys at the wire boundary).
const ACCOUNT_UPDATE_FIELDS = ['firstName', 'lastName', 'jobTitle'] as const

export interface MerchantAccountUpdate {
  firstName: string
  lastName: string
  jobTitle?: string | null
}

/**
 * PATCH account: update ONLY firstName/lastName/jobTitle on the caller's own
 * MerchantAdmin row. Mirrors the prototype's "Your details -> Edit" scope —
 * email/phone changes are separate confirmed steps, not this route.
 */
export async function updateMerchantAccount(
  prisma: PrismaClient,
  adminId: string,
  updates: MerchantAccountUpdate,
  ctx: { ipAddress: string; userAgent: string }
) {
  const data: Record<string, unknown> = {}
  for (const key of ACCOUNT_UPDATE_FIELDS) {
    if (key in updates) data[key] = (updates as unknown as Record<string, unknown>)[key]
  }

  const admin = await prisma.merchantAdmin.update({
    where: { id: adminId },
    data,
    select: ACCOUNT_SELECT,
  })

  // Reuses the existing generic 'PROFILE_UPDATED' audit literal (today used
  // only by the customer profile-update path, src/api/customer/profile/service.ts)
  // rather than 'MERCHANT_PROFILE_UPDATED' (scoped to the Merchant BUSINESS
  // entity's identity fields — logo/tradingName/description/etc.). This is a
  // personal-profile edit on the MerchantAdmin PERSON row; entityType 'merchant'
  // matches every other MerchantAdmin-scoped audit row (login/password/claim/etc.).
  // FLAG for review: no MerchantAdmin-specific "own profile updated" literal
  // exists today, so this is a judgement call, not a locked convention.
  writeAuditLog(prisma, {
    entityId: adminId,
    entityType: 'merchant',
    event: 'PROFILE_UPDATED',
    ipAddress: ctx.ipAddress,
    userAgent: ctx.userAgent,
  })

  const passwordChangedAt = await getLastPasswordChangeAt(prisma, adminId)
  return { ...admin, passwordChangedAt }
}

export interface MerchantSessionSummary {
  deviceType: string
  deviceName: string | null
  userAgent: string
  ipAddress: string
  lastActiveAt: Date
  createdAt: Date
  isCurrent: boolean
}

/**
 * GET account/sessions: "Where you are signed in" — every live (non-revoked)
 * UserSession row for the caller's own adminId, newest-active first. No
 * geo/city lookup exists anywhere in the codebase, so only ipAddress is
 * surfaced (the UI shows device + last-active honestly, no invented location).
 * `isCurrent` is derived by comparing each row's sessionId to the CALLING
 * request's own sessionId (from the signed JWT, req.user.sessionId) — never
 * trusted from the client. sessionId itself is not part of the curated
 * response (internal comparison key only).
 */
export async function listMerchantSessions(
  prisma: PrismaClient,
  adminId: string,
  currentSessionId: string
): Promise<MerchantSessionSummary[]> {
  const sessions = await prisma.userSession.findMany({
    where: { entityId: adminId, entityType: 'merchant', revokedAt: null },
    orderBy: { lastActiveAt: 'desc' },
    select: {
      sessionId: true,
      deviceType: true,
      deviceName: true,
      userAgent: true,
      ipAddress: true,
      lastActiveAt: true,
      createdAt: true,
    },
  })

  return sessions.map((s) => ({
    deviceType: s.deviceType,
    deviceName: s.deviceName,
    userAgent: s.userAgent,
    ipAddress: s.ipAddress,
    lastActiveAt: s.lastActiveAt,
    createdAt: s.createdAt,
    isCurrent: s.sessionId === currentSessionId,
  }))
}
