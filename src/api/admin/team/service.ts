// Team & Roles S1 (spec 2026-07-10-admin-capability-grants-field-role §6).
// SUPER_ADMIN-only team-management service: create admin accounts, set base
// role, deactivate, and grant/revoke curated capabilities. Every mutation writes
// an AuditLog row inside the same transaction. Grant/revoke enforce the
// server-side GRANTABLE_CAPABILITIES allow-list; revoke additionally revokes the
// grantee's sessions (the immediate escape hatch, spec §3.3).
//
// Route-level gating on `admin:manage-team` (SUPER_ADMIN-only) is applied in
// routes.ts; these functions assume the caller already passed that gate.

import crypto from 'crypto'
import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { AppError } from '../../shared/errors'
import { hashPassword } from '../../shared/password'
import { writeAuditLogTx } from '../../shared/audit'
import { revokeAllSessionsForEntity, revokeAllUserSessionRecords } from '../../shared/session'
import { isGrantableCapability } from '../capability'

// The base roles that may be assigned via Team & Roles (SUPER_ADMIN is assigned
// out of band, never through this surface, so a grantee can never mint a peer
// superuser here).
const ASSIGNABLE_ROLES = ['OPERATIONS', 'FINANCE', 'CONTENT', 'SUPPORT', 'FIELD'] as const
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number]

export function isAssignableRole(role: string): role is AssignableRole {
  return (ASSIGNABLE_ROLES as readonly string[]).includes(role)
}

// S1 INTERIM GUARD (adversarial-review Finding 1, 2026-07-10): the FIELD role's
// on-behalf capabilities (edit/submit/manage-branches/manage-documents/manage-
// vouchers) are confined to PRE-LIVE merchants only by the SERVER-SIDE scope guard
// in slice S3 (spec §4.2). That guard is NOT in S1. Until S3 lands, a FIELD admin
// would hold those caps against ANY merchant (incl. live), so FIELD must not be
// ASSIGNABLE to a real account yet. Two natural gates already block it (the FIELD
// enum value is unapplied on staging/prod DBs, and assignment is SUPER_ADMIN-only),
// but this is the belt-and-braces code block. REMOVE this guard in S3 once
// `requirePreLiveMerchant` is wired onto the FIELD on-behalf routes.
function assertRoleAssignableNow(role: AssignableRole): void {
  if (role === 'FIELD') throw new AppError('FIELD_ROLE_NOT_YET_ASSIGNABLE')
}

interface ActorCtx {
  ipAddress: string
  userAgent: string
}

/**
 * Active (non-revoked) grant capabilities for an admin. Used at token-sign time
 * (login + refresh) to compute the effective `caps` claim, and by the read
 * surface. Returns the raw capability strings; effective-cap resolution filters
 * them against the grantable allow-list.
 */
export async function getActiveGrantCapabilities(
  prisma: PrismaClient,
  adminUserId: string,
): Promise<string[]> {
  const rows = await prisma.adminCapabilityGrant.findMany({
    where: { adminUserId, revokedAt: null },
    select: { capability: true },
  })
  return rows.map((r: { capability: string }) => r.capability)
}

/**
 * Create an admin account. A random, unusable password is set (the account
 * bootstraps via the standard admin password-reset flow); NO email is sent here
 * (email delivery is a separate slice). Rejects a duplicate email (409).
 */
export async function createAdminAccount(
  prisma: PrismaClient,
  actorId: string,
  input: { email: string; firstName: string; lastName: string; role: AssignableRole },
  ctx: ActorCtx,
) {
  assertRoleAssignableNow(input.role)
  const existing = await prisma.adminUser.findUnique({ where: { email: input.email }, select: { id: true } })
  if (existing) throw new AppError('EMAIL_ALREADY_EXISTS')

  // Random, unusable password: the account cannot log in until it goes through
  // the admin password-reset flow. Never returned to the caller, never logged.
  const randomPassword = crypto.randomBytes(24).toString('base64url') + 'Aa1!'
  const passwordHash = await hashPassword(randomPassword)

  return prisma.$transaction(async (tx: any) => {
    const admin = await tx.adminUser.create({
      data: {
        email: input.email,
        passwordHash,
        firstName: input.firstName,
        lastName: input.lastName,
        role: input.role,
      },
      select: { id: true, email: true, firstName: true, lastName: true, role: true, isActive: true, createdAt: true },
    })

    await writeAuditLogTx(tx, {
      entityId: admin.id,
      entityType: 'admin',
      event: 'ADMIN_ACCOUNT_CREATED',
      actorId,
      actorType: 'ADMIN',
      after: { email: admin.email, role: admin.role },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return admin
  })
}

/** Set an admin's base role (any ASSIGNABLE_ROLE, including FIELD). */
export async function setAdminRole(
  prisma: PrismaClient,
  actorId: string,
  targetAdminId: string,
  role: AssignableRole,
  ctx: ActorCtx,
) {
  assertRoleAssignableNow(role)
  return prisma.$transaction(async (tx: any) => {
    const target = await tx.adminUser.findUnique({ where: { id: targetAdminId }, select: { id: true, role: true } })
    if (!target) throw new AppError('ADMIN_NOT_FOUND')

    const updated = await tx.adminUser.update({
      where: { id: targetAdminId },
      data: { role },
      select: { id: true, email: true, role: true, isActive: true },
    })

    await writeAuditLogTx(tx, {
      entityId: targetAdminId,
      entityType: 'admin',
      event: 'ADMIN_ROLE_CHANGED',
      actorId,
      actorType: 'ADMIN',
      before: { role: target.role },
      after: { role: updated.role },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return updated
  })
}

/**
 * Deactivate an admin account (isActive=false) and revoke ALL of its sessions
 * (the escape hatch: H4 already denies refresh for an inactive admin; revoking
 * sessions here cuts the current access token to next-request rather than
 * waiting out its TTL). An admin cannot deactivate their own account.
 */
export async function deactivateAdmin(
  prisma: PrismaClient,
  redis: Redis,
  actorId: string,
  targetAdminId: string,
  ctx: ActorCtx,
) {
  if (actorId === targetAdminId) throw new AppError('ADMIN_SELF_ACTION_FORBIDDEN')

  const result = await prisma.$transaction(async (tx: any) => {
    const target = await tx.adminUser.findUnique({ where: { id: targetAdminId }, select: { id: true, isActive: true } })
    if (!target) throw new AppError('ADMIN_NOT_FOUND')

    const updated = await tx.adminUser.update({
      where: { id: targetAdminId },
      data: { isActive: false },
      select: { id: true, email: true, role: true, isActive: true },
    })

    await writeAuditLogTx(tx, {
      entityId: targetAdminId,
      entityType: 'admin',
      event: 'ADMIN_ACCOUNT_DEACTIVATED',
      actorId,
      actorType: 'ADMIN',
      before: { isActive: target.isActive },
      after: { isActive: false },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return updated
  })

  // Escape hatch: revoke every session after the commit. Isolated + best-effort
  // (a Redis blip must not turn the clean success into a 500); H4 is the durable
  // backstop on the next refresh regardless.
  await revokeAdminSessions(prisma, redis, targetAdminId)

  return result
}

/**
 * Grant a curated capability to an admin. REJECTS any capability not on the
 * GRANTABLE_CAPABILITIES allow-list with a clean 400 (privilege-escalation
 * guard). Idempotent: an already-active grant of the same capability is returned
 * as-is (no duplicate row).
 */
export async function grantCapability(
  prisma: PrismaClient,
  actorId: string,
  targetAdminId: string,
  capability: string,
  ctx: ActorCtx,
) {
  if (!isGrantableCapability(capability)) throw new AppError('CAPABILITY_NOT_GRANTABLE')

  return prisma.$transaction(async (tx: any) => {
    const target = await tx.adminUser.findUnique({ where: { id: targetAdminId }, select: { id: true } })
    if (!target) throw new AppError('ADMIN_NOT_FOUND')

    const existing = await tx.adminCapabilityGrant.findFirst({
      where: { adminUserId: targetAdminId, capability, revokedAt: null },
      select: { id: true, capability: true, grantedAt: true },
    })
    if (existing) return { ...existing, alreadyGranted: true as const }

    const grant = await tx.adminCapabilityGrant.create({
      data: { adminUserId: targetAdminId, capability, grantedById: actorId },
      select: { id: true, capability: true, grantedAt: true },
    })

    await writeAuditLogTx(tx, {
      entityId: targetAdminId,
      entityType: 'admin',
      event: 'ADMIN_CAPABILITY_GRANTED',
      actorId,
      actorType: 'ADMIN',
      after: { capability, grantId: grant.id },
      metadata: { capability, grantId: grant.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return { ...grant, alreadyGranted: false as const }
  })
}

/**
 * Revoke a capability grant (soft: set revokedAt/revokedById on every active
 * row) and revoke the grantee's sessions (the immediate escape hatch, spec
 * §3.3). 404 if the admin holds no active grant of the capability.
 */
export async function revokeCapability(
  prisma: PrismaClient,
  redis: Redis,
  actorId: string,
  targetAdminId: string,
  capability: string,
  ctx: ActorCtx,
) {
  const revoked = await prisma.$transaction(async (tx: any) => {
    const active = await tx.adminCapabilityGrant.findMany({
      where: { adminUserId: targetAdminId, capability, revokedAt: null },
      select: { id: true },
    })
    if (active.length === 0) throw new AppError('GRANT_NOT_FOUND')

    await tx.adminCapabilityGrant.updateMany({
      where: { adminUserId: targetAdminId, capability, revokedAt: null },
      data: { revokedAt: new Date(), revokedById: actorId },
    })

    await writeAuditLogTx(tx, {
      entityId: targetAdminId,
      entityType: 'admin',
      event: 'ADMIN_CAPABILITY_REVOKED',
      actorId,
      actorType: 'ADMIN',
      before: { capability, activeGrantCount: active.length },
      after: { capability, revoked: true },
      metadata: { capability },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return { capability, revokedCount: active.length }
  })

  // Escape hatch: force the grantee to re-auth so the revoked capability is gone
  // by next request, not only at the <=15m access-token TTL.
  await revokeAdminSessions(prisma, redis, targetAdminId)

  return revoked
}

/**
 * Revoke every session for an admin (Redis refresh keys + DB UserSession
 * records). Isolated try/catch on each so a Redis outage on one cannot skip the
 * other; both best-effort (the caller's mutation already committed).
 */
async function revokeAdminSessions(prisma: PrismaClient, redis: Redis, adminId: string): Promise<void> {
  try {
    await revokeAllSessionsForEntity(redis, { role: 'admin', entityId: adminId })
  } catch { /* best-effort */ }
  try {
    await revokeAllUserSessionRecords(prisma, { entityId: adminId, entityType: 'admin', reason: 'ACCOUNT_STATUS_CHANGED' })
  } catch { /* best-effort */ }
}
