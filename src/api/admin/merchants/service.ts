import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLogTx } from '../../shared/audit'

export interface CreateMerchantDraftInput {
  businessName: string
  tradingName?: string
  ownerEmail: string
  ownerFirstName: string
  ownerLastName: string
  jobTitle?: string
}

export interface CreateMerchantDraftResult {
  merchantId: string
  ownerAdminId: string
  ownerEmail: string
  // The owner sets their password via the existing password-reset flow; the
  // admin never receives a password or token. This flag tells the caller the
  // draft owner still needs to claim their account.
  passwordSetupRequired: true
}

/**
 * Create a merchant DRAFT on an admin's behalf (Phase 2 Slice 1 M2, D-3).
 *
 * One transaction creates the Merchant (defaults to status REGISTERED /
 * verificationStatus NOT_SUBMITTED / onboardingStep REGISTERED), the owner
 * MerchantAdmin (no password — `mustChangePassword: true`), and the first
 * OWNER MerchantMembership, then writes the transactional audit. The owner
 * claims the account later via password-reset (no admin-known password/token).
 */
export async function createMerchantDraft(
  prisma: PrismaClient,
  adminId: string,
  input: CreateMerchantDraftInput,
  ctx: { ipAddress: string; userAgent: string }
): Promise<CreateMerchantDraftResult> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.merchantAdmin.findUnique({
      where: { email: input.ownerEmail },
      select: { id: true },
    })
    if (existing) throw new AppError('EMAIL_ALREADY_EXISTS')

    const merchant = await tx.merchant.create({
      data: {
        businessName: input.businessName,
        tradingName: input.tradingName,
        status: 'REGISTERED',
      },
      select: { id: true },
    })

    const admin = await tx.merchantAdmin.create({
      data: {
        merchantId: merchant.id,
        email: input.ownerEmail,
        firstName: input.ownerFirstName,
        lastName: input.ownerLastName,
        jobTitle: input.jobTitle,
        mustChangePassword: true,
        // passwordHash intentionally omitted — set by the owner via reset flow.
      },
      select: { id: true },
    })

    const membership = await tx.merchantMembership.create({
      data: {
        merchantId: merchant.id,
        merchantAdminId: admin.id,
        role: 'OWNER',
        allBranches: true,
        status: 'ACTIVE',
      },
      select: { id: true },
    })

    await writeAuditLogTx(tx, {
      entityId: merchant.id,
      entityType: 'merchant',
      event: 'MERCHANT_DRAFT_CREATED',
      actorId: adminId,
      actorType: 'ADMIN',
      after: { merchantId: merchant.id, ownerAdminId: admin.id, ownerEmail: input.ownerEmail },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
    await writeAuditLogTx(tx, {
      entityId: merchant.id,
      entityType: 'merchant',
      event: 'MEMBERSHIP_CREATED',
      actorId: adminId,
      actorType: 'ADMIN',
      after: { membershipId: membership.id, role: 'OWNER', merchantAdminId: admin.id },
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })

    return {
      merchantId: merchant.id,
      ownerAdminId: admin.id,
      ownerEmail: input.ownerEmail,
      passwordSetupRequired: true as const,
    }
  })
}
