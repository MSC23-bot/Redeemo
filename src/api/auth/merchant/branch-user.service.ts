import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { hashPassword, validatePasswordPolicy } from '../../shared/password'
import { encrypt } from '../../shared/encryption'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  revokeAllSessionsForEntity,
  revokeAllUserSessionRecords,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'
import { generateSecureToken } from '../../shared/tokens'
import { resolveAdminMerchant } from '../../merchant/shared'

async function assertBranchOwnership(
  prisma: PrismaClient,
  merchantAdminId: string,
  branchId: string
): Promise<string> {
  // M6b (D-1): resolve ownership via resolveAdminMerchant (MerchantMembership
  // source of truth, NOT the dropped MerchantAdmin.merchantId). This also extends
  // the M6a SEC-M2 suspended-merchant block to branch-user management — branch-user
  // mgmt IS merchant management, so a suspended owner must not manage via a cached
  // token (it throws MERCHANT_SUSPENDED). No session-revocation change here.
  const { merchantId } = await resolveAdminMerchant(prisma, merchantAdminId)

  const branch = await prisma.branch.findUnique({ where: { id: branchId } })
  if (!branch || branch.merchantId !== merchantId) throw new AppError('BRANCH_NOT_OWNED')

  return merchantId
}

export async function createBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: {
    merchantAdminId: string
    branchId: string
    contactName: string
    jobTitle?: string
    contactNumber?: string
    email: string
    password: string
    ipAddress: string
    userAgent: string
  }
): Promise<object> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  if (!validatePasswordPolicy(data.password)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const existing = await prisma.branchUser.findUnique({ where: { email: data.email } })
  if (existing) throw new AppError('EMAIL_ALREADY_EXISTS')

  const [firstName, ...rest] = data.contactName.split(' ')
  const lastName = rest.join(' ') || '-'

  const passwordHash = await hashPassword(data.password)
  const branchUser = await prisma.branchUser.create({
    data: {
      branchId:          data.branchId,
      email:             data.email,
      firstName,
      lastName,
      jobTitle:          data.jobTitle,
      phone:             data.contactNumber,
      passwordHash,
      mustChangePassword: true,
      status:            'ACTIVE',
    },
  })

  console.info(`[dev] BranchUser created: ${branchUser.email}, must change password on first login`)

  writeAuditLog(prisma, {
    entityId:   data.merchantAdminId,
    entityType: 'merchant',
    event:      'BRANCH_USER_CREATED',
    ipAddress:  data.ipAddress,
    userAgent:  data.userAgent,
    metadata:   { branchUserId: branchUser.id, branchId: data.branchId },
  })

  return { branchUser: { id: branchUser.id, email: branchUser.email, branchId: data.branchId } }
}

/**
 * Staff & Access B4 (spec §5.3): the one-app-user-per-branch route shape selects
 * the target by `branchId` alone. With >1 BranchUser at a branch the old
 * `findFirst({where:{branchId}})` acted on a NON-DETERMINISTIC row. This resolves
 * the single target ATOMICALLY inside `tx`: `findMany({take:2})` is the cheap >1
 * detector. 0 -> BRANCH_USER_NOT_FOUND; >1 -> refuse with MULTIPLE_BRANCH_USERS
 * (mutate nothing); exactly 1 -> the caller acts on that row's id. The re-count
 * inside the transaction closes the read-then-act TOCTOU residual called out in
 * §5.3 (it must become a hard guard once multi-user-per-branch / by-id addressing
 * lands; flagged there).
 */
async function resolveSingleBranchUserId(
  tx: { branchUser: { findMany: (args: any) => Promise<Array<{ id: string }>> } },
  branchId: string
): Promise<string> {
  const rows = await tx.branchUser.findMany({ where: { branchId }, select: { id: true }, take: 2 })
  if (rows.length === 0) throw new AppError('BRANCH_USER_NOT_FOUND')
  if (rows.length > 1) throw new AppError('MULTIPLE_BRANCH_USERS')
  return rows[0].id
}

export async function resetBranchUserPassword(
  prisma: PrismaClient,
  redis: Redis,
  data: {
    merchantAdminId: string
    branchId: string
    ipAddress: string
    userAgent: string
  }
): Promise<{ message: string; temporaryPassword: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const tempPassword = generateSecureToken(8).slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x') + 'A1!'
  const passwordHash = await hashPassword(tempPassword)

  // B4: count+select+update atomically; the >1 path refuses + mutates nothing.
  const branchUserId = await prisma.$transaction(async (tx) => {
    const id = await resolveSingleBranchUserId(tx, data.branchId)
    await tx.branchUser.update({
      where: { id },
      data:  { passwordHash, mustChangePassword: true },
    })
    return id
  })

  await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUserId })
  await revokeAllUserSessionRecords(prisma, { entityId: branchUserId, entityType: 'branch', reason: 'ADMIN_PASSWORD_RESET' })
  await redis.del(RedisKey.authBranch(branchUserId))

  writeAuditLog(prisma, {
    entityId:   data.merchantAdminId,
    entityType: 'merchant',
    event:      'BRANCH_USER_PASSWORD_RESET',
    ipAddress:  data.ipAddress,
    userAgent:  data.userAgent,
    metadata:   { branchUserId, branchId: data.branchId },
  })

  // SEC-H1: the temp password is returned to the authenticated merchant admin
  // who owns the branch (the one-time delivery to relay to the staff member) —
  // it is NEVER written to logs. Proper email delivery is a later comms phase.
  return {
    message: 'Password reset. Branch user must set a new password on next login.',
    temporaryPassword: tempPassword,
  }
}

export async function deactivateBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { merchantAdminId: string; branchId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  // B4: count+select+update atomically; the >1 path refuses + mutates nothing.
  const branchUserId = await prisma.$transaction(async (tx) => {
    const id = await resolveSingleBranchUserId(tx, data.branchId)
    await tx.branchUser.update({ where: { id }, data: { status: 'INACTIVE' } })
    return id
  })

  await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUserId })
  await revokeAllUserSessionRecords(prisma, { entityId: branchUserId, entityType: 'branch', reason: 'BRANCH_USER_DEACTIVATED' })
  await redis.del(RedisKey.authBranch(branchUserId))

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_USER_DEACTIVATED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchUserId, branchId: data.branchId },
  })

  return { message: 'Branch user deactivated.' }
}

export async function reactivateBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { merchantAdminId: string; branchId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  // B4: count+select+update atomically; the >1 path refuses + mutates nothing.
  const branchUserId = await prisma.$transaction(async (tx) => {
    const id = await resolveSingleBranchUserId(tx, data.branchId)
    await tx.branchUser.update({ where: { id }, data: { status: 'ACTIVE' } })
    return id
  })

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_USER_REACTIVATED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchUserId },
  })

  return { message: 'Branch user reactivated.' }
}

/**
 * Staff & Access B4 / B1b (D7): the read-only app-user surface. Lists the
 * merchant's BranchUsers grouped by branch, with a per-branch `appUserCount` so
 * the merchant-web UI can disable the per-user reset/deactivate/reactivate row
 * actions when a branch has >1 app user (the §5.3 UI guard). Curated select:
 * NEVER returns `passwordHash`. Owner-only management is enforced upstream in the
 * staff route (`assertOwner`); this query is scoped to the merchant's branches.
 */
export async function listBranchAppUsers(
  prisma: PrismaClient,
  merchantId: string
): Promise<{
  branches: Array<{
    branchId: string
    branchName: string
    appUserCount: number
    users: Array<{
      id: string
      branchId: string
      firstName: string
      lastName: string
      jobTitle: string | null
      email: string
      status: string
      lastLoginAt: Date | null
    }>
  }>
}> {
  const branches = await prisma.branch.findMany({
    where: { merchantId, deletedAt: null },
    select: { id: true, name: true },
    orderBy: [{ isMainBranch: 'desc' }, { name: 'asc' }],
  })

  const users = await prisma.branchUser.findMany({
    where: { branch: { merchantId } },
    select: {
      id: true,
      branchId: true,
      firstName: true,
      lastName: true,
      jobTitle: true,
      email: true,
      status: true,
      lastLoginAt: true,
    },
    orderBy: { createdAt: 'asc' },
  })

  return {
    branches: branches.map((b) => {
      const branchUsers = users.filter((u) => u.branchId === b.id)
      return {
        branchId: b.id,
        branchName: b.name,
        appUserCount: branchUsers.length,
        users: branchUsers,
      }
    }),
  }
}

export async function setBranchPin(
  prisma: PrismaClient,
  data: { merchantAdminId: string; branchId: string; pin: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const pinHash = encrypt(data.pin)
  await prisma.branch.update({ where: { id: data.branchId }, data: { redemptionPin: pinHash } })

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_PIN_CHANGED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchId: data.branchId },
  })

  return { message: 'Branch PIN updated.' }
}
