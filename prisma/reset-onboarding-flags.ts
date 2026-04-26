/**
 * Dev-only: reset onboardingCompletedAt + subscriptionPromptSeenAt to null
 * so the welcome screen and subscription-prompt flow can be tested again.
 *
 * Usage:
 *   npx tsx prisma/reset-onboarding-flags.ts <email>
 *
 * Example:
 *   npx tsx prisma/reset-onboarding-flags.ts customer@redeemo.com
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool    = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma  = new PrismaClient({ adapter } as any)

async function main() {
  const email = process.argv[2]
  if (!email) {
    console.error('Usage: npx tsx prisma/reset-onboarding-flags.ts <email>')
    process.exit(1)
  }

  const result = await prisma.user.updateMany({
    where: { email },
    data:  {
      onboardingCompletedAt:    null,
      subscriptionPromptSeenAt: null,
    },
  })

  if (result.count === 0) {
    console.error(`✗ No user found: ${email}`)
    process.exit(1)
  }
  console.log(`✓ Reset onboardingCompletedAt + subscriptionPromptSeenAt → null for ${email}`)
  console.log('  Restart the app to re-trigger the welcome → plan picker flow.')
}

main()
  .catch(console.error)
  .finally(() => void prisma.$disconnect())
