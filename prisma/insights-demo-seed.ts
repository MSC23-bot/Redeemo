// ─────────────────────────────────────────────────────────────────────────────
// Insights demo fixture seed runner (PR-A Task A10; finding #11).
//
// A GUARDED executable so an operator can actually seed the isolated Insights demo
// dataset on STAGING. It constructs a real PrismaClient against DATABASE_URL and
// calls seedInsightsDemoFixture, which enforces its OWN server-owned guards before
// any DB access:
//   - REDEEMO_DEPLOY_ENV === 'staging'        (staging-identity hard gate, finding #8)
//   - INSIGHTS_DEMO_FIXTURE === '1'           (explicit default-off flag)
//   - INSIGHTS_DEMO_ADMIN_PASSWORD set        (operator secret, finding #10)
// On a production deploy (REDEEMO_DEPLOY_ENV='production'), unset, or any non-staging
// value the seed throws and nothing is written.
//
// This runner PRINTS ONLY non-secret identifiers + counts (merchant id, branch
// count, voucher count, redemptions created). It NEVER prints the password or any
// connection string. After running, record the printed demo merchant id and enable
// the runtime display per docs/runbooks/insights-demo-fixture.md.
//
// Usage (staging only):
//   REDEEMO_DEPLOY_ENV=staging INSIGHTS_DEMO_FIXTURE=1 \
//   INSIGHTS_DEMO_ADMIN_PASSWORD='<operator-chosen-secret>' \
//   npm run insights:demo:seed
// ─────────────────────────────────────────────────────────────────────────────

import 'dotenv/config'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { seedInsightsDemoFixture } from './insights-demo-fixture'

async function main(): Promise<void> {
  const connectionString = process.env.DATABASE_URL
  if (typeof connectionString !== 'string' || connectionString.length === 0) {
    throw new Error('DATABASE_URL is not set. Refusing to run the Insights demo seed.')
  }

  const adapter = new PrismaPg({ connectionString })
  const prisma = new PrismaClient({ adapter })

  try {
    // The seed function enforces the staging-identity + flag + credential guards
    // before any DB access; we do NOT re-implement them here.
    const result = await seedInsightsDemoFixture(prisma)

    // NON-SECRET output only: ids + counts. Never the password, never the DSN.
    console.log('────────────────────────────────────────────────────────')
    console.log('  Insights demo fixture seeded (staging)')
    console.log('────────────────────────────────────────────────────────')
    console.log(`  demo merchant id : ${result.merchantId}`)
    console.log(`  login email      : ${result.loginEmail}`)
    console.log(`  branches         : ${result.branchIds.length}`)
    console.log(`  vouchers         : ${result.voucherIds.length}`)
    console.log(`  redemptions      : ${result.redemptionsCreated}`)
    console.log('────────────────────────────────────────────────────────')
    console.log('  Next: enable display by setting')
    console.log('    INSIGHTS_DEMO_INCLUDE=1')
    console.log(`    INSIGHTS_DEMO_MERCHANT_ID=${result.merchantId}`)
    console.log('  (See docs/runbooks/insights-demo-fixture.md)')
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  // Print only the error message (the guards' messages are non-secret by design).
  console.error((e as Error).message)
  process.exit(1)
})
