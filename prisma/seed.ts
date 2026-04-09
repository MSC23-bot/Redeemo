import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import * as crypto from 'crypto'

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
const prisma = new PrismaClient({ adapter })

// Simple hash for dev seed only — use bcrypt in production API code
function devHash(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex')
}

async function main() {
  console.log('Seeding database...')

  // ── Admin user ──
  const adminUser = await prisma.adminUser.upsert({
    where: { email: 'admin@redeemo.com' },
    update: {},
    create: {
      email: 'admin@redeemo.com',
      passwordHash: devHash('Admin1234!'),
      firstName: 'Redeemo',
      lastName: 'Admin',
      role: 'SUPER_ADMIN',
    },
  })
  console.log('Created admin user:', adminUser.email)

  // ── Subscription plans ──
  const monthlyPlan = await prisma.subscriptionPlan.upsert({
    where: { stripePriceId: 'price_monthly_dev' },
    update: {},
    create: {
      name: 'Monthly',
      description: 'Unlimited voucher redemptions, billed monthly',
      priceGbp: 6.99,
      billingInterval: 'MONTHLY',
      stripePriceId: 'price_monthly_dev',
      isActive: true,
      sortOrder: 1,
    },
  })

  const annualPlan = await prisma.subscriptionPlan.upsert({
    where: { stripePriceId: 'price_annual_dev' },
    update: {},
    create: {
      name: 'Annual',
      description: 'Unlimited voucher redemptions, billed annually (~2 months free)',
      priceGbp: 69.99,
      billingInterval: 'ANNUAL',
      stripePriceId: 'price_annual_dev',
      isActive: true,
      sortOrder: 2,
    },
  })
  console.log('Created subscription plans:', monthlyPlan.name, annualPlan.name)

  // ── Categories ──
  const foodCat = await prisma.category.upsert({
    where: { name: 'Food & Drink' },
    update: {},
    create: { name: 'Food & Drink', sortOrder: 1, isActive: true },
  })
  const beautyCat = await prisma.category.upsert({
    where: { name: 'Beauty & Wellness' },
    update: {},
    create: { name: 'Beauty & Wellness', sortOrder: 2, isActive: true },
  })
  for (const [name, order] of [['Health & Fitness', 3], ['Retail & Shopping', 4], ['Entertainment', 5], ['Professional Services', 6]] as [string, number][]) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, sortOrder: order, isActive: true },
    })
  }
  // Subcategories
  for (const [name, parentId, order] of [
    ['Restaurants', foodCat.id, 1],
    ['Cafes & Coffee', foodCat.id, 2],
    ['Bars & Pubs', foodCat.id, 3],
    ['Hair Salons', beautyCat.id, 1],
    ['Nail & Beauty', beautyCat.id, 2],
  ] as [string, string, number][]) {
    await prisma.category.upsert({
      where: { name },
      update: {},
      create: { name, parentId, sortOrder: order, isActive: true },
    })
  }
  console.log('Created categories')

  // ── RMV Templates ──
  // Food & Drink — suitable for restaurants, cafes, bars
  const rmvFoodTemplates = [
    {
      voucherType: 'BOGO' as const,
      title: 'Buy One Get One Free',
      description: 'Customer gets a second item free when they purchase one at full price.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
    {
      voucherType: 'DISCOUNT_PERCENT' as const,
      title: '25% Off Your Total Bill',
      description: 'Customer receives 25% off their total food/drink bill.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
  ]
  for (const t of rmvFoodTemplates) {
    await prisma.rmvTemplate.upsert({
      where: { categoryId_title: { categoryId: foodCat.id, title: t.title } },
      update: {},
      create: { ...t, categoryId: foodCat.id, isActive: true },
    })
  }

  // Beauty & Wellness — suitable for salons, spas, nail bars
  const rmvBeautyTemplates = [
    {
      voucherType: 'DISCOUNT_PERCENT' as const,
      title: '20% Off Your First Visit',
      description: 'New customers receive 20% off any service on their first visit.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
    {
      voucherType: 'FREEBIE' as const,
      title: 'Free Treatment with Any Booking',
      description: 'Customer receives a complimentary add-on treatment with any full-price booking.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
  ]
  for (const t of rmvBeautyTemplates) {
    await prisma.rmvTemplate.upsert({
      where: { categoryId_title: { categoryId: beautyCat.id, title: t.title } },
      update: {},
      create: { ...t, categoryId: beautyCat.id, isActive: true },
    })
  }

  // Generic fallback templates for remaining top-level categories
  const otherCats = await prisma.category.findMany({
    where: { name: { in: ['Health & Fitness', 'Retail & Shopping', 'Entertainment', 'Professional Services'] }, parentId: null },
  })
  for (const cat of otherCats) {
    const genericTemplates = [
      {
        voucherType: 'DISCOUNT_PERCENT' as const,
        title: '20% Off',
        description: 'Customer receives 20% off any product or service.',
        allowedFields: ['terms', 'expiryDate'],
        minimumSaving: 5.00,
      },
      {
        voucherType: 'SPEND_AND_SAVE' as const,
        title: 'Spend £30, Save £10',
        description: 'Customer saves £10 when they spend £30 or more.',
        allowedFields: ['terms', 'expiryDate'],
        minimumSaving: 10.00,
      },
    ]
    for (const t of genericTemplates) {
      await prisma.rmvTemplate.upsert({
        where: { categoryId_title: { categoryId: cat.id, title: t.title } },
        update: {},
        create: { ...t, categoryId: cat.id, isActive: true },
      })
    }
  }
  console.log('Created RMV templates')

  // ── Amenities ──
  for (const name of ['Free WiFi', 'Parking', 'Accessible', 'Outdoor Seating', 'Takeaway', 'Delivery', 'Card Payment', 'Cash Only']) {
    await prisma.amenity.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    })
  }
  console.log('Created amenities')

  // ── Interests ──
  for (const name of ['Food & Dining', 'Beauty & Skincare', 'Fitness & Sport', 'Shopping', 'Entertainment & Events', 'Travel & Leisure', 'Health & Wellbeing', 'Professional Development']) {
    await prisma.interest.upsert({
      where: { name },
      update: {},
      create: { name, isActive: true },
    })
  }
  console.log('Created interests')

  // ── Dev customer ──
  const customer = await prisma.user.upsert({
    where: { email: 'customer@redeemo.com' },
    update: {},
    create: {
      email: 'customer@redeemo.com',
      phone: '+447700900001',
      phoneCountryCode: 'GB',
      passwordHash: devHash('Customer1234!'),
      firstName: 'Jane',
      lastName: 'Smith',
      status: 'ACTIVE',
      tutorialSeen: true,
      tcConsentVersion: '1.0',
      tcConsentAt: new Date(),
    },
  })
  console.log('Created dev customer:', customer.email)

  // ── Dev merchant ──
  const merchant = await prisma.merchant.upsert({
    where: { id: 'dev-merchant-001' },
    update: {},
    create: {
      id: 'dev-merchant-001',
      businessName: 'The Coffee House',
      tradingName: 'The Coffee House',
      status: 'ACTIVE',
      verificationStatus: 'VERIFIED',
      contractStatus: 'SIGNED',
      contractStartDate: new Date(),
      contractEndDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      description: 'A cosy independent coffee shop in central London.',
      categories: {
        create: [{ categoryId: foodCat.id, isPrimary: true }],
      },
    },
  })

  // ── Dev merchant admin ──
  await prisma.merchantAdmin.upsert({
    where: { email: 'merchant@redeemo.com' },
    update: {},
    create: {
      merchantId: merchant.id,
      email: 'merchant@redeemo.com',
      passwordHash: devHash('Merchant1234!'),
      firstName: 'John',
      lastName: 'Doe',
      jobTitle: 'Owner',
      status: 'ACTIVE',
    },
  })

  // ── Dev branch ──
  const branch = await prisma.branch.upsert({
    where: { id: 'dev-branch-001' },
    update: {},
    create: {
      id: 'dev-branch-001',
      merchantId: merchant.id,
      name: 'Main Branch',
      isMainBranch: true,
      addressLine1: '12 High Street',
      city: 'London',
      postcode: 'EC1A 1BB',
      country: 'GB',
      latitude: 51.5194,
      longitude: -0.0988,
      phone: '+442071234567',
      email: 'london@thecoffeehouse.com',
      redemptionPin: devHash('1234'),
      isActive: true,
    },
  })

  // ── Dev branch user ──
  await prisma.branchUser.upsert({
    where: { email: 'staff@redeemo.com' },
    update: {},
    create: {
      branchId: branch.id,
      email: 'staff@redeemo.com',
      passwordHash: devHash('Staff1234!'),
      firstName: 'Alice',
      lastName: 'Staff',
      jobTitle: 'Barista',
      status: 'ACTIVE',
    },
  })
  console.log('Created dev merchant, branch, and users')

  // ── Dev vouchers ──
  await prisma.voucher.upsert({
    where: { code: 'RMV-001' },
    update: {},
    create: {
      merchantId: merchant.id,
      code: 'RMV-001',
      isMandatory: true,
      type: 'BOGO',
      title: 'Buy One Get One Free Coffee',
      description: 'Buy any coffee and get a second one of equal or lesser value for free.',
      terms: 'In-house only. Cannot be combined with other offers. Can only be redeemed once per month by the same user.',
      estimatedSaving: 3.50,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
    },
  })

  await prisma.voucher.upsert({
    where: { code: 'RMV-002' },
    update: {},
    create: {
      merchantId: merchant.id,
      code: 'RMV-002',
      isMandatory: true,
      type: 'DISCOUNT_PERCENT',
      title: '20% Off Any Meal',
      description: 'Get 20% off your total food bill.',
      terms: 'In-house only. Cannot be combined with other offers. Can only be redeemed once per month by the same user.',
      estimatedSaving: 5.00,
      status: 'ACTIVE',
      approvalStatus: 'APPROVED',
      approvedAt: new Date(),
    },
  })
  console.log('Created dev vouchers')

  // ── CMS content placeholders ──
  for (const key of ['terms_and_conditions', 'privacy_policy', 'about_us', 'help_faq']) {
    await prisma.cmsContent.upsert({
      where: { key },
      update: {},
      create: { key, content: `[${key.replace(/_/g, ' ').toUpperCase()} — to be filled by admin]` },
    })
  }
  console.log('Created CMS content placeholders')

  console.log('✅ Seed complete.')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
