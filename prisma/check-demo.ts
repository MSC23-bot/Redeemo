import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

async function main() {
  const [merchants, branches, vouchers, featured, reviews] = await Promise.all([
    prisma.merchant.count({ where: { id: { startsWith: 'demo-merchant-' } } }),
    prisma.branch.count({ where: { merchantId: { startsWith: 'demo-merchant-' } } }),
    prisma.voucher.count({ where: { code: { startsWith: 'R' }, merchantId: { startsWith: 'demo-merchant-' } } }),
    prisma.featuredMerchant.count({ where: { merchantId: { startsWith: 'demo-merchant-' }, isActive: true } }),
    prisma.review.count({ where: { branch: { merchantId: { startsWith: 'demo-merchant-' } } } }),
  ])
  console.log({ merchants, branches, vouchers, featured, reviews })

  const sample = await prisma.merchant.findFirst({
    where: { id: 'demo-merchant-01' },
    select: {
      id: true, tradingName: true, status: true,
      primaryCategory: { select: { name: true } },
      branches: { select: { id: true, name: true, isActive: true, city: true } },
      _count: { select: { vouchers: true } },
    },
  })
  console.log('Sample:', JSON.stringify(sample, null, 2))
}

main().finally(() => prisma.$disconnect())
