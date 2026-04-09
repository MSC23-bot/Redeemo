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

export async function getOnboardingChecklist(prisma: PrismaClient, adminId: string) {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)

  const [merchant, branchCount, rmvCount] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } }),
    prisma.branch.count({ where: { merchantId, deletedAt: null } }),
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
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true, contractStatus: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (merchant.status === 'PENDING_APPROVAL' || merchant.status === 'ACTIVE') {
    throw new AppError('ALREADY_SUBMITTED')
  }

  const checklist = await getOnboardingChecklist(prisma, adminId)
  if (!checklist.all_complete) throw new AppError('ONBOARDING_GATES_INCOMPLETE')

  const updated = await prisma.merchant.update({
    where: { id: merchantId },
    data:  { status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' },
  })

  await prisma.adminApproval.create({
    data: {
      type:          'MERCHANT_ONBOARDING',
      status:        'PENDING',
      referenceId:   merchantId,
      referenceType: 'merchant',
      comment:       'Merchant submitted for onboarding approval',
    },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_SUBMITTED_FOR_APPROVAL', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}
