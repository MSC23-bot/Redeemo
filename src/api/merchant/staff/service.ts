import { z } from 'zod'
import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { AppError } from '../../shared/errors'
import { emailSchema } from '../../shared/schemas'
import { isEmailEnabled } from '../../shared/email'
import { writeAuditLogTx, type AuditEvent } from '../../shared/audit'
import {
  revokeAllSessionsForEntity,
  revokeAllUserSessionRecords,
} from '../../shared/session'
import { assertNotLastOwner } from '../../shared/merchantMembership'
import { RedisKey } from '../../shared/redis-keys'
import { resolveAdminMerchant, type MerchantContext } from '../shared'
import { issueMerchantClaim } from '../../auth/merchant/service'
import { listBranchAppUsers } from '../../auth/merchant/branch-user.service'

// ─────────────────────────────────────────────────────────────────────────────
// Staff & Access (v1) PR-B — portal membership management service (D5/D6/D8).
//
// Every management entry point is OWNER-only in v1 (assertOwner is enforced at the
// route via the caller's resolveMerchantContext). The route hands the resolved
// caller context (`ctx`) into these functions; the merchant scope is derived from
// `resolveAdminMerchant` (owner-only, the safe-deny resolver) so a non-owner caller
// can never reach here even if a future route mis-wires the guard.
//
// `inviteDelivery` is a NON-SECRET status only — the claim token NEVER leaves
// `issueMerchantClaim` (Redis + the CommunicationLog payload). See §5.1.2.
//
// SPECIFIC_BRANCHES_ENABLED gates "Specific branches" (allBranches:false) invites.
// FLIPPED to TRUE in Task B7 (spec §5.2 in-v1 sequencing gate): branch-scope
// enforcement is now complete across the SCOPED route set (Tasks B5 + B6 — branch
// reads, redemptions reads, and the two † redemption routes all enforce
// assertBranchAllowed / allowed-branch intersect), so the invariant "never display a
// branch boundary the server does not enforce" (D4) is satisfied and scoped invites
// are now accepted. inviteMember/updateMemberAccess still validate that every
// requested branch belongs to the caller's merchant before writing the scope rows.
// ─────────────────────────────────────────────────────────────────────────────

export const SPECIFIC_BRANCHES_ENABLED = true

// `event` is a String column at runtime (see audit.ts header). The staff-specific
// event literals are union-only additions; `src/api/shared/audit.ts` is out of
// chunk-1 scope, so the literals are cast to AuditEvent at the single boundary
// here rather than widening the shared union in this PR slice.
const STAFF_AUDIT = {
  MEMBER_INVITED: 'MEMBER_INVITED',
  MEMBER_ACCESS_UPDATED: 'MEMBER_ACCESS_UPDATED',
  MEMBER_DEACTIVATED: 'MEMBER_DEACTIVATED',
  MEMBER_REACTIVATED: 'MEMBER_REACTIVATED',
  MEMBER_REMOVED: 'MEMBER_REMOVED',
  MEMBER_INVITE_RESENT: 'MEMBER_INVITE_RESENT',
} as const satisfies Record<string, string>
const staffEvent = (e: keyof typeof STAFF_AUDIT): AuditEvent => STAFF_AUDIT[e] as AuditEvent

export type StaffServiceContext = MerchantContext

type ReqMeta = { ipAddress: string; userAgent: string }
type CtxWithMeta = MerchantContext & ReqMeta

export type MemberRow = {
  id: string
  name: string
  email: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  status: string
  canManageVouchers: boolean
  allBranches: boolean
  branchIds: string[]
  claimed: boolean
  lastLoginAt: Date | null
}

const roleSchema = z.enum(['OWNER', 'BRANCH_MANAGER', 'STAFF'])

// Invite body. The "Specific branches" path is refused at the schema level while
// SPECIFIC_BRANCHES_ENABLED is off (-> ZodError -> VALIDATION_ERROR 400).
const inviteBodySchema = z
  .object({
    email: emailSchema,
    firstName: z.string().min(1).max(100),
    lastName: z.string().min(1).max(100),
    jobTitle: z.string().max(100).optional(),
    role: roleSchema,
    allBranches: z.boolean(),
    branchIds: z.array(z.string()).optional(),
    canManageVouchers: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    if (!b.allBranches) {
      if (!SPECIFIC_BRANCHES_ENABLED) {
        ctx.addIssue({ code: 'custom', message: 'Specific branches are not available yet. Invite as all branches.' })
        return
      }
      if (!b.branchIds || b.branchIds.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Select at least one branch for a specific-branch member.' })
      }
    }
  })

const updateBodySchema = z
  .object({
    role: roleSchema,
    allBranches: z.boolean(),
    branchIds: z.array(z.string()).optional(),
    canManageVouchers: z.boolean().optional(),
  })
  .superRefine((b, ctx) => {
    if (!b.allBranches) {
      if (!SPECIFIC_BRANCHES_ENABLED) {
        ctx.addIssue({ code: 'custom', message: 'Specific branches are not available yet. Set all branches.' })
        return
      }
      if (!b.branchIds || b.branchIds.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'Select at least one branch for a specific-branch member.' })
      }
    }
  })

/**
 * Role-elevation guard (§7 #3): only an OWNER caller may create/assign an OWNER
 * role OR grant `canManageVouchers`; STAFF can never receive `canManageVouchers`
 * (§D3). Server decides — client payloads never trusted.
 */
function assertRoleElevationAllowed(
  ctx: MerchantContext,
  target: { role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'; canManageVouchers?: boolean }
): void {
  const wantsOwner = target.role === 'OWNER'
  const wantsManageVouchers = target.canManageVouchers === true
  if ((wantsOwner || wantsManageVouchers) && ctx.role !== 'OWNER') {
    throw new AppError('INSUFFICIENT_PERMISSIONS')
  }
  // STAFF can never hold canManageVouchers (even from an OWNER caller).
  if (target.role === 'STAFF' && wantsManageVouchers) {
    throw new AppError('INSUFFICIENT_PERMISSIONS')
  }
}

/** Resolve the caller's owner-scoped merchant; the safe-deny resolver guarantees owner-only reach. */
async function resolveCallerMerchant(prisma: PrismaClient, adminId: string): Promise<string> {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return merchantId
}

// ── B1: list members ─────────────────────────────────────────────────────────

export async function listMembers(prisma: PrismaClient, adminId: string): Promise<MemberRow[]> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)

  const rows = await prisma.merchantMembership.findMany({
    where: { merchantId, status: { not: 'DELETED' } },
    select: {
      id: true,
      role: true,
      status: true,
      canManageVouchers: true,
      allBranches: true,
      // NEVER select passwordHash — only the fields the UI needs + the claimed flag.
      merchantAdmin: { select: { id: true, firstName: true, lastName: true, email: true, passwordHash: true, lastLoginAt: true } },
      branches: { select: { branchId: true } },
    },
    orderBy: { createdAt: 'asc' },
  })

  return rows.map((r) => ({
    id: r.id,
    name: `${r.merchantAdmin.firstName} ${r.merchantAdmin.lastName}`.trim(),
    email: r.merchantAdmin.email,
    role: r.role as MemberRow['role'],
    status: r.status,
    canManageVouchers: r.canManageVouchers,
    allBranches: r.allBranches,
    branchIds: r.branches.map((b) => b.branchId),
    claimed: r.merchantAdmin.passwordHash != null,
    lastLoginAt: r.merchantAdmin.lastLoginAt,
  }))
}

// ── B1 / B2a: invite member (+ re-invite-after-remove) ───────────────────────

export async function inviteMember(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  body: {
    email: string
    firstName: string
    lastName: string
    jobTitle?: string
    role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
    allBranches: boolean
    branchIds?: string[]
    canManageVouchers?: boolean
  },
  ctx: CtxWithMeta
): Promise<{ memberId: string; inviteDelivery: 'EMAIL_DARK' | 'QUEUED' }> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)
  const parsed = inviteBodySchema.parse(body)
  assertRoleElevationAllowed(ctx, parsed)

  const wantBranchIds = !parsed.allBranches && parsed.branchIds ? parsed.branchIds : []
  // Validate every requested branch belongs to this merchant (defence-in-depth;
  // only reachable once SPECIFIC_BRANCHES_ENABLED is on).
  if (wantBranchIds.length > 0) {
    const owned = await prisma.branch.findMany({ where: { id: { in: wantBranchIds }, merchantId }, select: { id: true } })
    if (owned.length !== wantBranchIds.length) throw new AppError('BRANCH_NOT_OWNED')
  }

  // D5b x D6: an existing MerchantAdmin email is normally rejected — EXCEPT the
  // re-invite-after-remove case (admin exists + their membership for THIS merchant
  // is DELETED), which reactivates that membership instead of a dead-end.
  const existing = await prisma.merchantAdmin.findUnique({
    where: { email: parsed.email },
    select: {
      id: true,
      memberships: { select: { id: true, merchantId: true, status: true } },
    },
  })

  const grantCanManageVouchers = parsed.role === 'BRANCH_MANAGER' && parsed.canManageVouchers === true

  if (existing) {
    const thisMerchantMembership = existing.memberships.find((m) => m.merchantId === merchantId)
    // Re-invite-after-remove: only a DELETED membership for THIS merchant reactivates.
    if (thisMerchantMembership && thisMerchantMembership.status === 'DELETED') {
      const memberId = thisMerchantMembership.id
      await prisma.$transaction(async (tx) => {
        await tx.merchantMembership.update({
          where: { id: memberId },
          data: {
            status: 'ACTIVE',
            role: parsed.role,
            allBranches: parsed.allBranches,
            canManageVouchers: grantCanManageVouchers,
            invitedById: adminId,
          },
        })
        // Reset branch scope to the new selection (cleared on the prior remove).
        await tx.merchantMembershipBranch.deleteMany({ where: { membershipId: memberId } })
        if (wantBranchIds.length > 0) {
          await tx.merchantMembershipBranch.createMany({
            data: wantBranchIds.map((branchId) => ({ membershipId: memberId, branchId })),
          })
        }
        await writeAuditLogTx(tx, {
          entityId: memberId, entityType: 'merchant', event: staffEvent('MEMBER_INVITED'),
          actorId: adminId, actorType: 'MERCHANT_ADMIN',
          after: { role: parsed.role, allBranches: parsed.allBranches, canManageVouchers: grantCanManageVouchers, reinvited: true },
          ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
          metadata: { merchantId, reinviteAfterRemove: true },
        })
      })
      await issueMerchantClaim(prisma, redis, { adminId: existing.id, email: parsed.email, ip: ctx.ipAddress })
      return { memberId, inviteDelivery: isEmailEnabled() ? 'QUEUED' : 'EMAIL_DARK' }
    }
    // Any other existing-admin case (ACTIVE/INACTIVE here, or a different merchant,
    // or a DELETED membership for a different merchant only) -> reject. Multi-merchant
    // identity is deferred (D5b).
    throw new AppError('EMAIL_ALREADY_EXISTS')
  }

  // Fresh invite: create admin (passwordHash:null) + membership (+ branch rows) + audit.
  const memberId = await prisma.$transaction(async (tx) => {
    const newAdmin = await tx.merchantAdmin.create({
      data: {
        email: parsed.email,
        firstName: parsed.firstName,
        lastName: parsed.lastName,
        jobTitle: parsed.jobTitle ?? null,
        passwordHash: null,
        status: 'ACTIVE',
        emailVerified: false,
      },
      select: { id: true },
    })
    const membership = await tx.merchantMembership.create({
      data: {
        merchantId,
        merchantAdminId: newAdmin.id,
        role: parsed.role,
        allBranches: parsed.allBranches,
        canManageVouchers: grantCanManageVouchers,
        status: 'ACTIVE',
        invitedById: adminId,
      },
      select: { id: true },
    })
    if (wantBranchIds.length > 0) {
      await tx.merchantMembershipBranch.createMany({
        data: wantBranchIds.map((branchId) => ({ membershipId: membership.id, branchId })),
      })
    }
    await writeAuditLogTx(tx, {
      entityId: membership.id, entityType: 'merchant', event: staffEvent('MEMBER_INVITED'),
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      after: { email: parsed.email, role: parsed.role, allBranches: parsed.allBranches, canManageVouchers: grantCanManageVouchers },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { merchantId, newAdminId: newAdmin.id },
    })
    return { membershipId: membership.id, newAdminId: newAdmin.id }
  })

  await issueMerchantClaim(prisma, redis, { adminId: memberId.newAdminId, email: parsed.email, ip: ctx.ipAddress })
  return { memberId: memberId.membershipId, inviteDelivery: isEmailEnabled() ? 'QUEUED' : 'EMAIL_DARK' }
}

// ── B2: load the target membership scoped to the caller's merchant ───────────

type TargetMembership = {
  id: string
  merchantId: string
  merchantAdminId: string
  role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'
  status: string
  allBranches: boolean
  canManageVouchers: boolean
  merchantAdmin: { id: string; email: string; passwordHash: string | null; firstName: string; lastName: string }
}

async function loadTarget(prisma: PrismaClient, merchantId: string, memberId: string): Promise<TargetMembership> {
  const m = await prisma.merchantMembership.findUnique({
    where: { id: memberId },
    select: {
      id: true, merchantId: true, merchantAdminId: true, role: true, status: true, allBranches: true, canManageVouchers: true,
      merchantAdmin: { select: { id: true, email: true, passwordHash: true, firstName: true, lastName: true } },
    },
  })
  // Cross-tenant safe: a membership of another merchant is treated as not found.
  // No `errors.ts` change is in chunk-1 scope, so reuse the existing USER_NOT_FOUND
  // (404) — a portal member is a person/user. (A dedicated MEMBER_NOT_FOUND code is
  // a trivial later add if the UI wants member-specific copy.)
  if (!m || m.merchantId !== merchantId) throw new AppError('USER_NOT_FOUND')
  return m as TargetMembership
}

// ── B2: update access ────────────────────────────────────────────────────────

export async function updateMemberAccess(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  memberId: string,
  body: { role: 'OWNER' | 'BRANCH_MANAGER' | 'STAFF'; allBranches: boolean; branchIds?: string[]; canManageVouchers?: boolean },
  ctx: CtxWithMeta
): Promise<{ id: string }> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)
  const parsed = updateBodySchema.parse(body)
  assertRoleElevationAllowed(ctx, parsed)

  const target = await loadTarget(prisma, merchantId, memberId)

  // Last-owner protection (§7 #4): demoting an OWNER away from OWNER, when they are
  // the only active owner, is refused.
  if (target.role === 'OWNER' && parsed.role !== 'OWNER') {
    await assertNotLastOwner(prisma, merchantId, target.id)
  }

  const wantBranchIds = !parsed.allBranches && parsed.branchIds ? parsed.branchIds : []
  if (wantBranchIds.length > 0) {
    const owned = await prisma.branch.findMany({ where: { id: { in: wantBranchIds }, merchantId }, select: { id: true } })
    if (owned.length !== wantBranchIds.length) throw new AppError('BRANCH_NOT_OWNED')
  }

  const grantCanManageVouchers = parsed.role === 'BRANCH_MANAGER' && parsed.canManageVouchers === true
  const before = { role: target.role, allBranches: target.allBranches, canManageVouchers: target.canManageVouchers }

  await prisma.$transaction(async (tx) => {
    await tx.merchantMembership.update({
      where: { id: target.id },
      data: { role: parsed.role, allBranches: parsed.allBranches, canManageVouchers: grantCanManageVouchers },
    })
    await tx.merchantMembershipBranch.deleteMany({ where: { membershipId: target.id } })
    if (wantBranchIds.length > 0) {
      await tx.merchantMembershipBranch.createMany({
        data: wantBranchIds.map((branchId) => ({ membershipId: target.id, branchId })),
      })
    }
    await writeAuditLogTx(tx, {
      entityId: target.id, entityType: 'merchant', event: staffEvent('MEMBER_ACCESS_UPDATED'),
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      before, after: { role: parsed.role, allBranches: parsed.allBranches, canManageVouchers: grantCanManageVouchers },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { merchantId },
    })
  })

  return { id: target.id }
}

// ── B2: deactivate / reactivate / remove ─────────────────────────────────────

async function revokeMemberSessions(prisma: PrismaClient, redis: Redis, merchantAdminId: string, reason: string): Promise<void> {
  await revokeAllSessionsForEntity(redis, { role: 'merchant', entityId: merchantAdminId })
  await revokeAllUserSessionRecords(prisma, { entityId: merchantAdminId, entityType: 'merchant', reason })
  await redis.del(RedisKey.authMerchant(merchantAdminId))
}

export async function deactivateMember(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  memberId: string,
  ctx: CtxWithMeta
): Promise<{ id: string }> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)
  const target = await loadTarget(prisma, merchantId, memberId)

  if (target.role === 'OWNER') await assertNotLastOwner(prisma, merchantId, target.id)

  await prisma.$transaction(async (tx) => {
    await tx.merchantMembership.update({ where: { id: target.id }, data: { status: 'INACTIVE' } })
    await writeAuditLogTx(tx, {
      entityId: target.id, entityType: 'merchant', event: staffEvent('MEMBER_DEACTIVATED'),
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      before: { status: target.status }, after: { status: 'INACTIVE' },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { merchantId },
    })
  })

  await revokeMemberSessions(prisma, redis, target.merchantAdminId, 'MEMBER_DEACTIVATED')
  return { id: target.id }
}

export async function reactivateMember(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  memberId: string,
  ctx: CtxWithMeta
): Promise<{ id: string }> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)
  const target = await loadTarget(prisma, merchantId, memberId)

  await prisma.$transaction(async (tx) => {
    await tx.merchantMembership.update({ where: { id: target.id }, data: { status: 'ACTIVE' } })
    await writeAuditLogTx(tx, {
      entityId: target.id, entityType: 'merchant', event: staffEvent('MEMBER_REACTIVATED'),
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      before: { status: target.status }, after: { status: 'ACTIVE' },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { merchantId },
    })
  })

  return { id: target.id }
}

export async function removeMember(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  memberId: string,
  ctx: CtxWithMeta
): Promise<{ id: string }> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)
  const target = await loadTarget(prisma, merchantId, memberId)

  if (target.role === 'OWNER') await assertNotLastOwner(prisma, merchantId, target.id)

  await prisma.$transaction(async (tx) => {
    await tx.merchantMembership.update({ where: { id: target.id }, data: { status: 'DELETED' } })
    await tx.merchantMembershipBranch.deleteMany({ where: { membershipId: target.id } })
    await writeAuditLogTx(tx, {
      entityId: target.id, entityType: 'merchant', event: staffEvent('MEMBER_REMOVED'),
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      before: { status: target.status, role: target.role }, after: { status: 'DELETED' },
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { merchantId },
    })
  })

  await revokeMemberSessions(prisma, redis, target.merchantAdminId, 'MEMBER_REMOVED')
  return { id: target.id }
}

// ── B2: resend invite ────────────────────────────────────────────────────────

export async function resendInvite(
  prisma: PrismaClient,
  redis: Redis,
  adminId: string,
  memberId: string,
  ctx: CtxWithMeta
): Promise<{ memberId: string; inviteDelivery: 'EMAIL_DARK' | 'QUEUED' }> {
  const merchantId = await resolveCallerMerchant(prisma, adminId)
  const target = await loadTarget(prisma, merchantId, memberId)

  // Only an unclaimed member (passwordHash==null) can be re-invited. A claimed
  // member already set their own password (claim sets emailVerified=true), so we
  // reuse ALREADY_VERIFIED (409) rather than a new error code.
  if (target.merchantAdmin.passwordHash != null) throw new AppError('ALREADY_VERIFIED')

  // issueMerchantClaim mints a FRESH single-use token (the prior one is superseded:
  // claim consumes by token, and a new token is the only live credential the member
  // receives). Audit the resend.
  await prisma.$transaction(async (tx) => {
    await writeAuditLogTx(tx, {
      entityId: target.id, entityType: 'merchant', event: staffEvent('MEMBER_INVITE_RESENT'),
      actorId: adminId, actorType: 'MERCHANT_ADMIN',
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { merchantId, merchantAdminId: target.merchantAdminId },
    })
  })

  await issueMerchantClaim(prisma, redis, { adminId: target.merchantAdminId, email: target.merchantAdmin.email, ip: ctx.ipAddress })
  return { memberId: target.id, inviteDelivery: isEmailEnabled() ? 'QUEUED' : 'EMAIL_DARK' }
}

// ── B1b / B4: read-only app-user surface (delegates to the branch-user service) ──

export async function listStaffAppUsers(prisma: PrismaClient, merchantId: string) {
  return listBranchAppUsers(prisma, merchantId)
}
