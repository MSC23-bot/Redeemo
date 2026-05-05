/**
 * Grants an ACTIVE monthly subscription to customer@redeemo.com for local testing.
 * No Stripe required — uses nullable stripeSubscriptionId/stripeCustomerId.
 * Run: npx tsx prisma/grant-dev-subscription.ts
 *
 * Plan lookup: resolved at runtime by stripePriceId so this script keeps
 * working across `prisma migrate reset` (which regenerates plan UUIDs).
 *
 * Cycle behaviour (DEV TOOLING — differs from production):
 *   • cycleAnchorDate is set to midnight UTC of "now" on BOTH create and
 *     update. The script's job is to grant/repair a clean known-state QA
 *     entitlement, so re-running it leaves customer@redeemo.com in a
 *     reproducible state.
 *   • Production resubscription path (src/api/subscription/service.ts via
 *     Stripe webhook) treats cycleAnchorDate as immutable once set per the
 *     schema rule — that path is NOT this script.
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { toMidnightUTC } from '../src/api/subscription/cycle'
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

  // Schema contract (prisma/schema.prisma): cycleAnchorDate is stored at
  // midnight UTC on the anchor day. `getCurrentCycleWindow()` only reads
  // the day-of-month so a non-midnight value works in practice, but the
  // canonical form is midnight — match it here.
  const cycleAnchor = toMidnightUTC(now)

  // DEV-ONLY policy (script is QA tooling, not production code):
  // Reset cycleAnchorDate on BOTH create and update. The script's job is
  // to grant/repair a clean known-state QA entitlement for
  // customer@redeemo.com — we want the dev fixture to be reproducible
  // each time the script runs. This deliberately differs from the
  // schema's resubscribe/reactivation rule (which says cycleAnchorDate
  // is immutable once set in the production Stripe-driven path); the
  // production path goes through `createSubscription` in
  // src/api/subscription/service.ts, NOT through this script. Dev
  // tooling resets the anchor; production keeps it.
  const sub = await prisma.subscription.upsert({
    where: { userId: user.id },
    create: {
      userId:             user.id,
      planId:             plan.id,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      cycleAnchorDate:    cycleAnchor,
    },
    update: {
      planId:             plan.id,
      status:             'ACTIVE',
      currentPeriodStart: now,
      currentPeriodEnd:   periodEnd,
      cycleAnchorDate:    cycleAnchor,
      cancelAtPeriodEnd:  false, // clear any prior cancellation flag
    },
  })

  console.log(`✅  Subscription granted to ${user.email}`)
  console.log(`    Plan:   ${plan.name} (${plan.billingInterval})`)
  console.log(`    ID:     ${sub.id}`)
  console.log(`    Status: ${sub.status}`)
  console.log(`    Anchor: ${sub.cycleAnchorDate.toISOString()}`)
  console.log(`    Until:  ${sub.currentPeriodEnd.toISOString().slice(0, 10)}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
