import { PrismaClient } from '../../../../generated/prisma/client'
import type Redis from 'ioredis'
import { hashPassword, validatePasswordPolicy } from '../../shared/password'
import { AppError } from '../../shared/errors'
import { RedisKey } from '../../shared/redis-keys'
import {
  revokeAllSessionsForEntity,
  revokeAllUserSessionRecords,
} from '../../shared/session'
import { writeAuditLog } from '../../shared/audit'
import { generateSecureToken } from '../../shared/tokens'

async function assertBranchOwnership(
  prisma: PrismaClient,
  merchantAdminId: string,
  branchId: string
): Promise<string> {
  const admin = await prisma.merchantAdmin.findUnique({ where: { id: merchantAdminId } })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')

  const branch = await prisma.branch.findUnique({ where: { id: branchId } })
  if (!branch || branch.merchantId !== admin.merchantId) throw new AppError('BRANCH_NOT_OWNED')

  return admin.merchantId
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

export async function resetBranchUserPassword(
  prisma: PrismaClient,
  redis: Redis,
  data: {
    merchantAdminId: string
    branchId: string
    ipAddress: string
    userAgent: string
  }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const branchUser = await prisma.branchUser.findFirst({ where: { branchId: data.branchId } })
  if (!branchUser) throw new AppError('BRANCH_USER_NOT_FOUND')

  const tempPassword = generateSecureToken(8).slice(0, 12).replace(/[^a-zA-Z0-9]/g, 'x') + 'A1!'
  const passwordHash = await hashPassword(tempPassword)

  await prisma.branchUser.update({
    where: { id: branchUser.id },
    data:  { passwordHash, mustChangePassword: true },
  })

  await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUser.id })
  await revokeAllUserSessionRecords(prisma, { entityId: branchUser.id, entityType: 'branch', reason: 'ADMIN_PASSWORD_RESET' })
  await redis.del(RedisKey.authBranch(branchUser.id))

  console.info(`[dev] Branch user ${branchUser.email} temp password: ${tempPassword}`)

  writeAuditLog(prisma, {
    entityId:   data.merchantAdminId,
    entityType: 'merchant',
    event:      'BRANCH_USER_PASSWORD_RESET',
    ipAddress:  data.ipAddress,
    userAgent:  data.userAgent,
    metadata:   { branchUserId: branchUser.id, branchId: data.branchId },
  })

  return { message: 'Password reset. Branch user must set a new password on next login.' }
}

export async function deactivateBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { merchantAdminId: string; branchId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const branchUser = await prisma.branchUser.findFirst({ where: { branchId: data.branchId } })
  if (!branchUser) throw new AppError('BRANCH_USER_NOT_FOUND')

  await prisma.branchUser.update({ where: { id: branchUser.id }, data: { status: 'INACTIVE' } })

  await revokeAllSessionsForEntity(redis, { role: 'branch', entityId: branchUser.id })
  await revokeAllUserSessionRecords(prisma, { entityId: branchUser.id, entityType: 'branch', reason: 'BRANCH_USER_DEACTIVATED' })
  await redis.del(RedisKey.authBranch(branchUser.id))

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_USER_DEACTIVATED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchUserId: branchUser.id, branchId: data.branchId },
  })

  return { message: 'Branch user deactivated.' }
}

export async function reactivateBranchUser(
  prisma: PrismaClient,
  redis: Redis,
  data: { merchantAdminId: string; branchId: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const branchUser = await prisma.branchUser.findFirst({ where: { branchId: data.branchId } })
  if (!branchUser) throw new AppError('BRANCH_USER_NOT_FOUND')

  await prisma.branchUser.update({ where: { id: branchUser.id }, data: { status: 'ACTIVE' } })

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_USER_REACTIVATED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchUserId: branchUser.id },
  })

  return { message: 'Branch user reactivated.' }
}

export async function setBranchPin(
  prisma: PrismaClient,
  data: { merchantAdminId: string; branchId: string; pin: string; ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  await assertBranchOwnership(prisma, data.merchantAdminId, data.branchId)

  const pinHash = await hashPassword(data.pin)
  await prisma.branch.update({ where: { id: data.branchId }, data: { redemptionPin: pinHash } })

  writeAuditLog(prisma, {
    entityId: data.merchantAdminId, entityType: 'merchant', event: 'BRANCH_PIN_CHANGED',
    ipAddress: data.ipAddress, userAgent: data.userAgent,
    metadata: { branchId: data.branchId },
  })

  return { message: 'Branch PIN updated.' }
}
