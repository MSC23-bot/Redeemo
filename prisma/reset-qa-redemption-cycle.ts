/**
 * One-shot dev/QA helper to clear the redemption + cycle-state for a
 * given customer + voucher pair so the redemption flow can be tested
 * repeatedly without burning through cycles or creating new vouchers.
 *
 * Why this exists:
 *   • Backend cycle-lockout enforcement (src/api/redemption/service.ts
 *     and src/api/customer/discovery/service.ts) is keyed on
 *     (userId, voucherId) per cycle, regardless of voucher type.
 *   • `VoucherType.REUSABLE` is currently a label-only voucher type —
 *     it has NO backend bypass for cycle lockout. A REUSABLE voucher
 *     that's been redeemed in the current cycle behaves identically to
 *     any other type: the next redeem attempt returns ALREADY_REDEEMED.
 *   • Production semantics for REUSABLE haven't been defined yet, so
 *     we explicitly do NOT add backend bypass logic. This dev script
 *     is the QA workaround until product decides what REUSABLE means.
 *
 * What this script does:
 *   1. Looks up the User by email + the Voucher by id.
 *   2. Deletes any VoucherRedemption rows for (user, voucher).
 *   3. Resets the UserVoucherCycleState row for (user, voucher) so
 *      `isRedeemedInCurrentCycle: false` and `cycleStartDate` is
 *      moved to the epoch (any value before the current cycle window
 *      is fine — the redemption guard only checks `cycleStartDate
 *      >= cycleStart`).
 *
 * Default: customer@redeemo.com + the seeded Covelum vouchers
 * (tax-voucher-covelum-001 / -002 / -003 — i.e. the COV-RMV-001,
 * COV-RMV-002, COV-RCV-001 IDs from the seed). Pass an `--email` and
 * `--voucherId` to override.
 *
 * Examples:
 *   # Reset the seeded customer's lock on every Covelum voucher.
 *   npx tsx prisma/reset-qa-redemption-cycle.ts
 *
 *   # Reset a specific voucher for a specific user.
 *   npx tsx prisma/reset-qa-redemption-cycle.ts --email me@example.com --voucherId COV-RMV-001
 *
 * Production safety: the script requires DATABASE_URL and exits
 * cleanly if the user / voucher / cycle row are missing. It NEVER
 * touches data outside the (user, voucher) scope it's been told to
 * clear, and prints exactly what it cleared.
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const DEFAULT_EMAIL = 'customer@redeemo.com'
// The seeded Covelum vouchers — covers the three QA paths (DISCOUNT_PERCENT,
// BOGO, FREEBIE). Default scope is intentionally small + obvious.
const DEFAULT_VOUCHER_CODES = ['COV-RMV-001', 'COV-RMV-002', 'COV-RCV-001']

interface Args {
  email: string
  voucherIdOrCode: string | null   // null → use DEFAULT_VOUCHER_CODES
}

function parseArgs(argv: string[]): Args {
  let email = DEFAULT_EMAIL
  let voucherIdOrCode: string | null = null
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--email') {
      email = argv[++i] ?? email
    } else if (arg === '--voucherId') {
      voucherIdOrCode = argv[++i] ?? null
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npx tsx prisma/reset-qa-redemption-cycle.ts [--email <email>] [--voucherId <id-or-code>]'
      )
      process.exit(0)
    }
  }
  return { email, voucherIdOrCode }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\nERROR: DATABASE_URL is not set. Add it to .env and re-run.\n')
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  const isCustomScope = args.email !== DEFAULT_EMAIL || args.voucherIdOrCode !== null

  if (isCustomScope) {
    console.log('CUSTOM SCOPE — overriding default Covelum/seeded-customer scope:')
    console.log(`  user:    ${args.email}`)
    console.log(`  voucher: ${args.voucherIdOrCode ?? '(default Covelum set)'}`)
    console.log('')
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma = new PrismaClient({ adapter } as any)

  try {
    // 1. Look up the user.
    const user = await prisma.user.findUnique({
      where: { email: args.email },
      select: { id: true, email: true },
    })
    if (!user) {
      console.error(`\nERROR: No user with email ${args.email}.\n`)
      process.exit(3)
    }

    // 2. Resolve voucher ids: either the explicit one passed in, or
    //    the default Covelum trio looked up by code.
    let vouchers: { id: string; code: string | null; title: string }[]
    if (args.voucherIdOrCode) {
      const v = await prisma.voucher.findFirst({
        where: { OR: [{ id: args.voucherIdOrCode }, { code: args.voucherIdOrCode }] },
        select: { id: true, code: true, title: true },
      })
      if (!v) {
        console.error(`\nERROR: No voucher with id or code "${args.voucherIdOrCode}".\n`)
        process.exit(3)
      }
      vouchers = [v]
    } else {
      vouchers = await prisma.voucher.findMany({
        where: { code: { in: DEFAULT_VOUCHER_CODES } },
        select: { id: true, code: true, title: true },
      })
      if (vouchers.length === 0) {
        console.error(
          `\nERROR: None of the default Covelum vouchers (${DEFAULT_VOUCHER_CODES.join(', ')}) ` +
          `found in the DB. Run \`npx prisma db seed\` to (re-)seed.\n`
        )
        process.exit(3)
      }
    }

    // 3. For each voucher, delete redemption rows + reset cycle state.
    console.log(`Resetting redemption + cycle-state for ${user.email} on ${vouchers.length} voucher(s)…`)
    for (const v of vouchers) {
      const redemptions = await prisma.voucherRedemption.deleteMany({
        where: { userId: user.id, voucherId: v.id },
      })
      // Reset cycle state if it exists. cycleStartDate is set to the
      // unix epoch — strictly before any plausible cycleStart, so the
      // backend's cycle-window check (cycleStartDate >= cycleStart)
      // always evaluates to false.
      const cycleReset = await prisma.userVoucherCycleState.updateMany({
        where: { userId: user.id, voucherId: v.id },
        data: {
          isRedeemedInCurrentCycle: false,
          cycleStartDate:           new Date(0),
        },
      })
      console.log(
        `  ✓ ${v.code ?? '(no code)'} · ${v.title} (id=${v.id}) — ` +
        `removed ${redemptions.count} redemption row(s), reset ${cycleReset.count} cycle-state row(s)`,
      )
    }

    console.log('')
    console.log('Note: VoucherType.REUSABLE is label-only today — backend cycle lockout still')
    console.log('applies regardless of type. Use this script between test attempts; production')
    console.log('semantics for REUSABLE vouchers are not yet defined.')
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
