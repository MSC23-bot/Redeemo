import { PrismaClient } from '../../../generated/prisma/client'

export async function createMerchantRequest(
  prisma: PrismaClient,
  userId: string,
  data: { businessName: string; location: string; note?: string }
) {
  return prisma.merchantRequest.create({
    data: {
      userId,
      businessName: data.businessName,
      location: data.location,
      note: data.note ?? null,
    },
  })
}
