/**
 * Grants an ACTIVE monthly subscription to customer@redeemo.com for local testing.
 * No Stripe required — uses nullable stripeSubscriptionId/stripeCustomerId.
 * Run: npx tsx prisma/grant-dev-subscription.ts
 *
 * The Monthly plan is resolved at runtime by stripePriceId so this script
 * keeps working across DB resets — the previous version hardcoded the
 * plan UUID, which became stale whenever `prisma migrate reset` regenerated
 * `SubscriptionPlan.id`.
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

// The seeded Monthly plan is uniquely identified by its stripePriceId
// ('price_monthly_dev' — see prisma/seed.ts). UUID-based lookup is brittle:
// `prisma migrate reset` regenerates it. Stripe price ID is stable.
const MONTHLY_PLAN_STRIPE_PRICE_ID = 'price_monthly_dev'
const CUSTOMER_EMAIL  = 'customer@redeemo.com'

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: CUSTOMER_EMAIL },
    select: { id: true, email: true },
  })

  const plan = await prisma.subscriptionPlan.findFirst({
    where: { stripePriceId: MONTHLY_PLAN_STRIPE_PRICE_ID },
    select: { id: true, name: true, billingInterval: true },
  })
  if (!plan) {
    throw new Error(
      `No SubscriptionPlan found with stripePriceId="${MONTHLY_PLAN_STRIPE_PRICE_ID}". ` +
      `Run \`npx prisma db seed\` first to populate SubscriptionPlan rows, then re-run this script.`,
    )
  }

  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setFullYear(periodEnd.getFullYear() + 1) // 1-year window — won't expire during testing

  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId:             user.id,
      planId:             plan.id,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      cycleAnchorDate:    now,
    },
    update: {
      planId:             plan.id,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
    },
  })

  console.log(`✅  Subscription granted to ${user.email}`)
  console.log(`    Plan:   ${plan.name} (${plan.billingInterval})`)
  console.log(`    ID:     ${sub.id}`)
  console.log(`    Status: ${sub.status}`)
  console.log(`    Until:  ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
