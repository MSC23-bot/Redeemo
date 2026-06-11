import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { resolveAdminMerchant } from '../shared'

export const CONTRACT_VERSION = '1.0'
export const CONTRACT_TEXT = `
Redeemo Merchant Agreement v${CONTRACT_VERSION}

By accepting this agreement, you agree to offer a minimum of two Redeemo Mandatory Vouchers (RMV) on the platform. These vouchers are performance-based — you are only promoted when a customer redeems. You retain full control of your custom vouchers. Redeemo reserves the right to suspend merchants who fail to honour redeemed vouchers.

Full legal terms are available at redeemo.co.uk/merchant-terms.
`.trim()

// Checklist computation keyed by merchantId — shared by the merchant-facing
// getOnboardingChecklist (resolves via adminId) and the M3 admin actioner
// (which already has the merchantId from AdminApproval.referenceId).
export async function computeOnboardingChecklist(prisma: PrismaClient, merchantId: string) {
  const [merchant, branchCount, rmvCount] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } }),
    // M3 pre-existing-bug fix: `Branch` has no `deletedAt` column (schema + DB),
    // so the old `deletedAt: null` filter threw `Unknown argument deletedAt` on a
    // real DB (masked because onboarding tests mock branch.count). Surfaced by the
    // M3 getApproval real-DB test. Count existing branches by merchantId. The
    // BROADER `branch/service.ts` deletedAt references are a separate Tier-2 fix.
    prisma.branch.count({ where: { merchantId } }),
    prisma.voucher.count({ where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } } }),
  ])
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  const branch_created  = branchCount >= 1
  const contract_signed = merchant.contractStatus === 'SIGNED'
  const rmv_configured  = rmvCount >= 2

  return {
    branch_created,
    contract_signed,
    rmv_configured,
    all_complete: branch_created && contract_signed && rmv_configured,
  }
}

export async function getOnboardingChecklist(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  return computeOnboardingChecklist(prisma, merchantId)
}

export async function acceptContract(
  prisma: PrismaClient,
  adminId: string,
  version: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (merchant.contractStatus === 'SIGNED') throw new AppError('CONTRACT_ALREADY_SIGNED')

  await prisma.merchantContract.create({
    data: {
      merchantId,
      signedAt:        new Date(),
      ipAddress:       ctx.ipAddress,
      tcVersion:       version,
      signatureMethod: 'CLICK_TO_AGREE',
    },
  })

  await prisma.merchant.update({
    where: { id: merchantId },
    data:  { contractStatus: 'SIGNED', contractStartDate: new Date() },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_CONTRACT_ACCEPTED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return { accepted: true }
}

export async function submitForApproval(
  prisma: PrismaClient,
  adminId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true, onboardingStep: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  // Spec §2: the merchant stays PENDING_APPROVAL through the whole review loop.
  // Allowed: REGISTERED (initial submit) or PENDING_APPROVAL+NEEDS_CHANGES
  // (resubmit after changes-requested). Anything else (under review, live,
  // rejected, suspended) is not submittable.
  const isResubmit = merchant.status === 'PENDING_APPROVAL' && merchant.onboardingStep === 'NEEDS_CHANGES'
  const canSubmit = merchant.status === 'REGISTERED' || isResubmit
  if (!canSubmit) throw new AppError('ALREADY_SUBMITTED')

  const checklist = await getOnboardingChecklist(prisma, adminId)
  if (!checklist.all_complete) throw new AppError('ONBOARDING_GATES_INCOMPLETE')

  // M3: atomic submit. Set verificationStatus PENDING (was inert) and reopen the
  // SAME onboarding approval on resubmit (clear the prior claim) instead of
  // creating a duplicate thread.
  const updated = await prisma.$transaction(async (tx) => {
    const m = await tx.merchant.update({
      where: { id: merchantId },
      data:  { status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED', verificationStatus: 'PENDING' },
    })

    const existing = await tx.adminApproval.findFirst({
      where:  { type: 'MERCHANT_ONBOARDING', referenceId: merchantId },
      select: { id: true },
    })
    if (existing) {
      await tx.adminApproval.update({
        where: { id: existing.id },
        data:  {
          status:      'PENDING',
          claimedById: null,
          claimedAt:   null,
          actionedAt:  null,
          comment:     'Merchant resubmitted for onboarding approval',
        },
      })
    } else {
      await tx.adminApproval.create({
        data: {
          type:          'MERCHANT_ONBOARDING',
          status:        'PENDING',
          referenceId:   merchantId,
          referenceType: 'merchant',
          comment:       'Merchant submitted for onboarding approval',
        },
      })
    }
    return m
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: isResubmit ? 'MERCHANT_RESUBMITTED' : 'MERCHANT_SUBMITTED_FOR_APPROVAL', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}
