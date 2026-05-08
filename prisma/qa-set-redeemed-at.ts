/**
 * One-shot dev/QA helper to set the `redeemedAt` of an existing
 * VoucherRedemption row to "now minus N minutes". Used to test the
 * Voucher Detail §AE5 presentation-window gate (locked 2026-05-08,
 * PR #49) without waiting two real hours per cycle.
 *
 * What it does:
 *   1. Looks up the User by email.
 *   2. Looks up the most-recent VoucherRedemption for (user, voucher).
 *   3. Updates ONLY that one row's `redeemedAt` (and `validatedAt`
 *      if already validated, by the same delta — keeps the relative
 *      ordering coherent).
 *   4. Prints what it changed.
 *
 * Scope:
 *   • Default email: customer@redeemo.com (the seeded QA customer).
 *   • Default voucher: COV-RCV-001 (Covelum freebie).
 *   • Default offset: 115 minutes ago (1h55m — 5 minutes inside the
 *     2-hour presentation window, so the in-window state is visible
 *     for the first ~5 minutes of QA, then the boundary flip can be
 *     observed live without restarting the script).
 *   • Touches NO other (user, voucher) pair. Safe to run on dev DB
 *     against the QA customer; do not run against production.
 *
 * What it does NOT do:
 *   • Does NOT create a redemption — the user must have redeemed the
 *     voucher in the current cycle first. If no row exists, the
 *     script exits with an instructive error pointing you at the
 *     redeem flow.
 *   • Does NOT touch the cycle-state row — `redeemedAt` is decoupled
 *     from `cycleStartDate`, and the cycle gate is still authoritative
 *     for "have you redeemed this cycle".
 *   • Does NOT touch dependent `RedemptionScreenshotEvent` rows.
 *
 * Examples:
 *   # Default: bump customer@redeemo.com's COV-RCV-001 redeemedAt to
 *   # 1h55m ago — 5 minutes from window expiry.
 *   npx tsx prisma/qa-set-redeemed-at.ts
 *
 *   # Set 30 seconds before the boundary flips (tighter QA window).
 *   npx tsx prisma/qa-set-redeemed-at.ts --minutes-ago 119.5
 *
 *   # Set already-expired (60 minutes past the 2h boundary):
 *   npx tsx prisma/qa-set-redeemed-at.ts --minutes-ago 180
 *
 *   # Different user / voucher.
 *   npx tsx prisma/qa-set-redeemed-at.ts --email me@example.com --voucherId COV-RMV-002 --minutes-ago 90
 *
 * Cross-ref:
 *   • CLAUDE.md Phase 3C.1c (M3) §AE — 2-hour presentation window.
 *   • apps/customer-app/src/features/voucher/utils/presentationWindow.ts
 *     — `PRESENTATION_WINDOW_MS = 2 * 60 * 60 * 1000`.
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'

dotenv.config()

const DEFAULT_EMAIL          = 'customer@redeemo.com'
const DEFAULT_VOUCHER_CODE   = 'COV-RCV-001'   // Covelum FREEBIE
const DEFAULT_MINUTES_AGO    = 115             // 1h55m — 5 min inside the 2h window
const PRESENTATION_WINDOW_MIN = 120            // mirror of client constant for clarity

interface Args {
  email:          string
  voucherIdOrCode: string
  minutesAgo:     number
}

function parseArgs(argv: string[]): Args {
  let email           = DEFAULT_EMAIL
  let voucherIdOrCode = DEFAULT_VOUCHER_CODE
  let minutesAgo      = DEFAULT_MINUTES_AGO
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    if (arg === '--email') {
      email = argv[++i] ?? email
    } else if (arg === '--voucherId') {
      voucherIdOrCode = argv[++i] ?? voucherIdOrCode
    } else if (arg === '--minutes-ago') {
      const n = Number(argv[++i])
      if (!Number.isFinite(n) || n < 0) {
        console.error('\nERROR: --minutes-ago must be a non-negative number.\n')
        process.exit(2)
      }
      minutesAgo = n
    } else if (arg === '--help' || arg === '-h') {
      console.log(
        'Usage: npx tsx prisma/qa-set-redeemed-at.ts ' +
        '[--email <email>] [--voucherId <id-or-code>] [--minutes-ago <n>]\n\n' +
        'Defaults: email=customer@redeemo.com, voucherId=COV-RCV-001, minutes-ago=115',
      )
      process.exit(0)
    }
  }
  return { email, voucherIdOrCode, minutesAgo }
}

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error('\nERROR: DATABASE_URL is not set. Add it to .env and re-run.\n')
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  const targetRedeemedAt = new Date(Date.now() - args.minutesAgo * 60 * 1000)
  const minutesUntilExpiry = PRESENTATION_WINDOW_MIN - args.minutesAgo

  const pool   = new Pool({ connectionString: process.env.DATABASE_URL })
  const adapter = new PrismaPg(pool)
  const prisma  = new PrismaClient({ adapter } as any)

  try {
    const user = await prisma.user.findUnique({
      where:  { email: args.email },
      select: { id: true, email: true },
    })
    if (!user) {
      console.error(`\nERROR: No user with email ${args.email}.\n`)
      process.exit(3)
    }

    const voucher = await prisma.voucher.findFirst({
      where:  { OR: [{ id: args.voucherIdOrCode }, { code: args.voucherIdOrCode }] },
      select: { id: true, code: true, title: true },
    })
    if (!voucher) {
      console.error(`\nERROR: No voucher with id or code "${args.voucherIdOrCode}".\n`)
      process.exit(3)
    }

    // Most-recent redemption for (user, voucher). The §AE window keys
    // off the most-recent row, so that's the one we shift.
    const redemption = await prisma.voucherRedemption.findFirst({
      where:   { userId: user.id, voucherId: voucher.id },
      orderBy: { redeemedAt: 'desc' },
      select:  {
        id:           true,
        redemptionCode: true,
        redeemedAt:   true,
        isValidated:  true,
        validatedAt:  true,
      },
    })
    if (!redemption) {
      console.error(
        `\nERROR: No VoucherRedemption found for ${user.email} + voucher ` +
        `${voucher.code ?? voucher.id}. Redeem the voucher in-app first, then re-run.\n`,
      )
      process.exit(3)
    }

    // If validated, shift validatedAt by the same delta so the
    // relative ordering stays coherent (validatedAt > redeemedAt).
    let nextValidatedAt: Date | null = redemption.validatedAt
    if (redemption.isValidated && redemption.validatedAt) {
      const deltaMs =
        redemption.redeemedAt.getTime() - targetRedeemedAt.getTime()
      nextValidatedAt = new Date(redemption.validatedAt.getTime() - deltaMs)
    }

    await prisma.voucherRedemption.update({
      where: { id: redemption.id },
      data:  {
        redeemedAt:  targetRedeemedAt,
        validatedAt: nextValidatedAt,
      },
    })

    const stateLabel =
      minutesUntilExpiry > 0
        ? `IN-WINDOW (${minutesUntilExpiry.toFixed(1)} min until expiry)`
        : `OUT-OF-WINDOW (${Math.abs(minutesUntilExpiry).toFixed(1)} min past 2h boundary)`

    console.log('')
    console.log(`✓ Updated VoucherRedemption ${redemption.id}`)
    console.log(`    user        : ${user.email}`)
    console.log(`    voucher     : ${voucher.code ?? voucher.id} · ${voucher.title}`)
    console.log(`    code        : ${redemption.redemptionCode}`)
    console.log(`    was         : redeemedAt=${redemption.redeemedAt.toISOString()}`)
    console.log(`    now         : redeemedAt=${targetRedeemedAt.toISOString()}`)
    console.log(`    minutes ago : ${args.minutesAgo}`)
    console.log(`    state       : ${stateLabel}`)
    if (redemption.isValidated && redemption.validatedAt && nextValidatedAt) {
      console.log(`    validatedAt : ${redemption.validatedAt.toISOString()} → ${nextValidatedAt.toISOString()}`)
    }
    console.log('')
    console.log('Now reload Voucher Detail in the app (pull-to-refresh OR navigate away')
    console.log('and back) so the React Query cache picks up the new redeemedAt. The')
    console.log('hook will arm a setTimeout for the remaining window; no further app')
    console.log('reload is needed to observe the boundary flip.')
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
