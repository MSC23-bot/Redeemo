import {
  PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

export async function addFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  try {
    return await prisma.favouriteMerchant.create({
      data: { userId, merchantId },
      select: { id: true, merchantId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  try {
    await prisma.favouriteMerchant.delete({ where: { userId_merchantId: { userId, merchantId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

export async function listFavouriteMerchants(prisma: PrismaClient, userId: string) {
  const rows = await prisma.favouriteMerchant.findMany({
    where: {
      userId,
      merchant: { status: MerchantStatus.ACTIVE },
    },
    select: {
      createdAt: true,
      merchant: {
        select: {
          id: true, businessName: true, tradingName: true, logoUrl: true, status: true,
          primaryCategory: { select: { id: true, name: true } },
          vouchers: {
            where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
            select: { id: true, title: true, estimatedSaving: true, type: true },
            take: 2,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map(r => ({ ...r.merchant, favouritedAt: r.createdAt }))
}

export async function addFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  try {
    return await prisma.favouriteVoucher.create({
      data: { userId, voucherId },
      select: { id: true, voucherId: true, createdAt: true },
    })
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new AppError('ALREADY_FAVOURITED')
    }
    throw e
  }
}

export async function removeFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  try {
    await prisma.favouriteVoucher.delete({ where: { userId_voucherId: { userId, voucherId } } })
    return { success: true }
  } catch (e: unknown) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      throw new AppError('FAVOURITE_NOT_FOUND')
    }
    throw e
  }
}

export async function listFavouriteVouchers(prisma: PrismaClient, userId: string) {
  const rows = await prisma.favouriteVoucher.findMany({
    where: {
      userId,
      voucher: {
        status: VoucherStatus.ACTIVE,
        approvalStatus: ApprovalStatus.APPROVED,
        merchant: { status: MerchantStatus.ACTIVE },
      },
    },
    select: {
      createdAt: true,
      voucher: {
        select: {
          id: true, title: true, type: true, estimatedSaving: true,
          imageUrl: true, status: true, approvalStatus: true,
          merchant: {
            select: { id: true, businessName: true, logoUrl: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows.map(r => ({ ...r.voucher, favouritedAt: r.createdAt }))
}
