/**
 * Grants an ACTIVE monthly subscription to customer@redeemo.com for local testing.
 * No Stripe required — uses nullable stripeSubscriptionId/stripeCustomerId.
 * Run: npx tsx prisma/grant-dev-subscription.ts
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

const MONTHLY_PLAN_ID = 'f06a6803-4622-4126-b599-8f3eb21d68de'
const CUSTOMER_EMAIL  = 'customer@redeemo.com'

async function main() {
  const user = await prisma.user.findUniqueOrThrow({
    where: { email: CUSTOMER_EMAIL },
    select: { id: true, email: true },
  })

  const now = new Date()
  const periodEnd = new Date(now)
  periodEnd.setFullYear(periodEnd.getFullYear() + 1) // 1-year window — won't expire during testing

  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId:             user.id,
      planId:             MONTHLY_PLAN_ID,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      cycleAnchorDate:    now,
    },
    update: {
      planId:             MONTHLY_PLAN_ID,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
    },
  })

  console.log(`✅  Subscription granted to ${user.email}`)
  console.log(`    ID:     ${sub.id}`)
  console.log(`    Status: ${sub.status}`)
  console.log(`    Until:  ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
