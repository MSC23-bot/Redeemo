/**
 * Finds branches whose merchant businessName matches the search term
 * and prints the decrypted PIN for each of their branches.
 * Run: npx tsx prisma/get-branch-pin.ts "old foundry"
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import { decrypt } from '../src/api/shared/encryption'

dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

async function main() {
  const term = (process.argv[2] ?? 'old foundry').toLowerCase()

  const branches = await prisma.branch.findMany({
    where: {
      merchant: {
        OR: [
          { businessName: { contains: term, mode: 'insensitive' } },
          { tradingName:  { contains: term, mode: 'insensitive' } },
        ],
      },
    },
    // Note: NOT selecting `isMainBranch` — branches are equivalent in
    // user/product-facing language and the dev-script output should
    // not amplify "(main)" framing. See deferred-followups index §M
    // / §Q for the broader isMainBranch neutralisation track.
    select: {
      id: true, name: true, redemptionPin: true,
      merchant: { select: { businessName: true, tradingName: true } },
    },
  })

  if (branches.length === 0) {
    console.log(`No merchant matched "${term}"`)
    return
  }

  // Guard the decrypt step — when ENCRYPTION_KEY isn't loaded into the
  // dev-script's env (e.g. .env doesn't include it), surface a clear
  // message instead of a cryptic "ENCRYPTION_KEY must be a 64-character
  // hex string" stack trace.
  if (!process.env.ENCRYPTION_KEY) {
    console.error(
      '\nERROR: ENCRYPTION_KEY is not set in the dev-script environment.\n' +
      'Add it to .env (the same value the API server runs with) and re-run.\n'
    )
    process.exit(2)
  }

  for (const b of branches) {
    const merchantLabel = b.merchant.tradingName ?? b.merchant.businessName
    const pin = b.redemptionPin ? decrypt(b.redemptionPin) : '(not set)'
    console.log(`${merchantLabel} · ${b.name} (id=${b.id}) → PIN: ${pin}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
