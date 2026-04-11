import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

export async function addFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  const existing = await prisma.favouriteMerchant.findUnique({
    where: { userId_merchantId: { userId, merchantId } },
  })
  if (existing) throw new AppError('ALREADY_FAVOURITED')

  return prisma.favouriteMerchant.create({
    data: { userId, merchantId },
    select: { id: true, merchantId: true, createdAt: true },
  })
}

export async function removeFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  const existing = await prisma.favouriteMerchant.findUnique({
    where: { userId_merchantId: { userId, merchantId } },
  })
  if (!existing) throw new AppError('FAVOURITE_NOT_FOUND')

  await prisma.favouriteMerchant.delete({ where: { userId_merchantId: { userId, merchantId } } })
  return { removed: true }
}

export async function listFavouriteMerchants(prisma: PrismaClient, userId: string) {
  const rows = await prisma.favouriteMerchant.findMany({
    where: { userId },
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

  return rows
    .filter(r => r.merchant.status === MerchantStatus.ACTIVE)
    .map(r => ({ ...r.merchant, favouritedAt: r.createdAt }))
}

export async function addFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  const existing = await prisma.favouriteVoucher.findUnique({
    where: { userId_voucherId: { userId, voucherId } },
  })
  if (existing) throw new AppError('ALREADY_FAVOURITED')

  return prisma.favouriteVoucher.create({
    data: { userId, voucherId },
    select: { id: true, voucherId: true, createdAt: true },
  })
}

export async function removeFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  const existing = await prisma.favouriteVoucher.findUnique({
    where: { userId_voucherId: { userId, voucherId } },
  })
  if (!existing) throw new AppError('FAVOURITE_NOT_FOUND')

  await prisma.favouriteVoucher.delete({ where: { userId_voucherId: { userId, voucherId } } })
  return { removed: true }
}

export async function listFavouriteVouchers(prisma: PrismaClient, userId: string) {
  const rows = await prisma.favouriteVoucher.findMany({
    where: { userId },
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

  return rows
    .filter(r =>
      r.voucher.status         === VoucherStatus.ACTIVE &&
      r.voucher.approvalStatus === ApprovalStatus.APPROVED &&
      r.voucher.merchant.status === MerchantStatus.ACTIVE
    )
    .map(r => ({ ...r.voucher, favouritedAt: r.createdAt }))
}
