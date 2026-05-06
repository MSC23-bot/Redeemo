/**
 * One-shot dev/QA helper to reset PINs for the seeded Covelum branches.
 *
 * Direct DB write — does NOT use the merchant API, does NOT log in as
 * any merchant admin, does NOT bypass OTP, does NOT touch Redis. Just
 * connects to the database, encrypts the plaintext PIN with the
 * backend's `encrypt()` helper, and writes the encrypted value to
 * `Branch.redemptionPin` for both Covelum branches.
 *
 * Why direct DB rather than API:
 *   • The seeded `merchant@redeemo.com` admin belongs to a DIFFERENT
 *     merchant (The Coffee House — `dev-merchant-001`). The merchant
 *     API would reject any PIN-reset call against a Covelum branch on
 *     branch-ownership authorization grounds — and rightly so.
 *   • Direct DB is simpler, scoped only to QA/dev, and avoids
 *     modifying any auth state.
 *
 * Requirements:
 *   • DATABASE_URL set (in .env or env)
 *   • ENCRYPTION_KEY set (64-char hex, same as the API server uses)
 *
 * Run: npx tsx prisma/reset-covelum-pins.ts
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { encrypt } from '../src/api/shared/encryption'

dotenv.config()

const NEW_PIN = '1234'

// Hardcoded seed ids — this script is intentionally scoped to the
// seeded Covelum merchant only. Running against a non-seeded database
// will fail cleanly at the existence check below.
const COVELUM_MERCHANT_ID = 'tax-merchant-covelum-001'
const COVELUM_BRANCH_IDS  = ['tax-branch-covelum-001', 'tax-branch-covelum-002']

async function main() {
  // 1. Hard pre-flight: required env vars.
  if (!process.env.DATABASE_URL) {
    console.error('\nERROR: DATABASE_URL is not set. Add it to .env and re-run.\n')
    process.exit(2)
  }
  if (!process.env.ENCRYPTION_KEY) {
    console.error(
      '\nERROR: ENCRYPTION_KEY is not set in the dev-script environment.\n' +
      'Add it to .env (the same 64-char hex value the API server runs with) and re-run.\n'
    )
    process.exit(2)
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter } as any)

  try {
    // 2. Fetch both Covelum branches by id (also confirms the seeded
    //    merchant + branches exist before we touch anything).
    const branches = await prisma.branch.findMany({
      where: {
        id:         { in: COVELUM_BRANCH_IDS },
        merchantId: COVELUM_MERCHANT_ID,
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    })

    const foundIds = new Set(branches.map((b) => b.id))
    const missing = COVELUM_BRANCH_IDS.filter((id) => !foundIds.has(id))
    if (missing.length > 0) {
      console.error(
        `\nERROR: Could not find seeded Covelum branch(es): ${missing.join(', ')}\n` +
        `Expected merchantId: ${COVELUM_MERCHANT_ID}\n` +
        `Run \`npx prisma db seed\` to (re-)seed the dev database.\n`
      )
      process.exit(3)
    }

    // 3. Encrypt the plaintext PIN ONCE per branch (each call uses a
    //    fresh IV so the ciphertext differs even though the plaintext
    //    is the same — matches how the API stores PINs).
    console.log(`Resetting PIN to "${NEW_PIN}" for ${branches.length} Covelum branch(es)…`)
    for (const b of branches) {
      const encryptedPin = encrypt(NEW_PIN)
      await prisma.branch.update({
        where: { id: b.id },
        data:  { redemptionPin: encryptedPin },
      })
      // Intentionally not logging the encrypted value.
      console.log(`  ✓ ${b.name} (id=${b.id}) → PIN reset to ${NEW_PIN}`)
    }
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
