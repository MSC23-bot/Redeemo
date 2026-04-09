import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from '../shared/errors'

export async function resolveAdminMerchant(
  prisma: PrismaClient,
  adminId: string
): Promise<{ adminId: string; merchantId: string }> {
  const admin = await prisma.merchantAdmin.findUnique({
    where: { id: adminId },
    select: { id: true, merchantId: true },
  })
  if (!admin) throw new AppError('INVALID_CREDENTIALS')
  return { adminId: admin.id, merchantId: admin.merchantId }
}
