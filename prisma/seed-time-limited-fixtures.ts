/**
 * Admin script: populate TIME_LIMITED voucher fixtures for QA.
 *
 * Adds windows to selected demo merchants (Covelum / Kovalam) so on-device
 * QA can exercise the 6 voucher-detail states + merchant-card pill states.
 *
 * Run:
 *   npx tsx prisma/seed-time-limited-fixtures.ts
 *
 * Idempotent: re-running deletes existing windows on the target merchants'
 * vouchers before recreating them. Does NOT alter non-TIME_LIMITED vouchers.
 */
import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const FIXTURES: Array<{
  merchantName: string
  voucherTitle: string
  windows: Array<{ dayOfWeek: number; openTime: string; closeTime: string }>
}> = [
  // Covelum: weekday lunch BOGO 11am-3pm
  {
    merchantName: 'Covelum',
    voucherTitle: 'Lunch BOGO',
    windows: [1, 2, 3, 4, 5].map(d => ({ dayOfWeek: d, openTime: '11:00', closeTime: '15:00' })),
  },
  // Kovalam: Tuesday wing night only
  {
    merchantName: 'Kovalam',
    voucherTitle: 'Tuesday Wing Night',
    windows: [{ dayOfWeek: 2, openTime: '18:00', closeTime: '22:00' }],
  },
  // Covelum: weekend brunch
  {
    merchantName: 'Covelum',
    voucherTitle: 'Weekend Brunch',
    windows: [
      { dayOfWeek: 6, openTime: '10:00', closeTime: '14:00' },
      { dayOfWeek: 0, openTime: '10:00', closeTime: '14:00' },
    ],
  },
  // Kovalam: cross-midnight late-night offer (Friday 22:00 → Saturday 02:00)
  {
    merchantName: 'Kovalam',
    voucherTitle: 'Late Night Special',
    windows: [
      { dayOfWeek: 5, openTime: '22:00', closeTime: '24:00' },
      { dayOfWeek: 6, openTime: '00:00', closeTime: '02:00' },
    ],
  },
  // Covelum: split-day (lunch + dinner Monday only)
  {
    merchantName: 'Covelum',
    voucherTitle: 'Monday Lunch & Dinner',
    windows: [
      { dayOfWeek: 1, openTime: '11:00', closeTime: '15:00' },
      { dayOfWeek: 1, openTime: '18:00', closeTime: '22:00' },
    ],
  },
]

async function main() {
  for (const fx of FIXTURES) {
    const merchant = await prisma.merchant.findFirst({
      where: { businessName: { contains: fx.merchantName, mode: 'insensitive' } },
    })
    if (!merchant) {
      console.warn(`[skip] merchant ${fx.merchantName} not found`)
      continue
    }

    let voucher = await prisma.voucher.findFirst({
      where: { merchantId: merchant.id, title: fx.voucherTitle, type: 'TIME_LIMITED' },
    })
    if (!voucher) {
      voucher = await prisma.voucher.create({
        data: {
          merchantId: merchant.id,
          code: `FIX-TL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(-4).toUpperCase()}`,
          title: fx.voucherTitle,
          type: 'TIME_LIMITED',
          description: `${fx.voucherTitle} — TIME_LIMITED demo voucher.`,
          estimatedSaving: 8.5,
          status: 'ACTIVE',
          approvalStatus: 'APPROVED',
        },
      })
      console.log(`[created] voucher ${voucher.id} (${fx.voucherTitle})`)
    }

    await prisma.voucherAvailabilityWindow.deleteMany({ where: { voucherId: voucher.id } })
    await prisma.voucherAvailabilityWindow.createMany({
      data: fx.windows.map(w => ({ ...w, voucherId: voucher!.id })),
    })
    console.log(`[ok] ${fx.merchantName} / "${fx.voucherTitle}" → ${fx.windows.length} window(s)`)
  }

  await prisma.$disconnect()
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
