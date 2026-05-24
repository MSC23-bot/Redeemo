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

    const expiryAt = new Date(targetRedeemedAt.getTime() + PRESENTATION_WINDOW_MIN * 60 * 1000)
    const nowAt = new Date()
    const stateLabel =
      minutesUntilExpiry > 0
        ? `IN-WINDOW  (${minutesUntilExpiry.toFixed(1)} min until expiry)`
        : `OUT-OF-WINDOW  (${Math.abs(minutesUntilExpiry).toFixed(1)} min past 2h boundary)`

    // Device-local timezone resolution — what the customer-app would
    // render `formatTimeLine(redeemedAt)` and `formatExpiryLine(redeemedAt)`
    // as on a device with this Node-host's TZ. Different from London
    // BST or any specific user's device; printed here as a sanity-
    // check anchor, not as the user-facing output.
    const localTz = Intl.DateTimeFormat().resolvedOptions().timeZone
    const fmtLocal = (d: Date) => d.toLocaleString('en-GB', {
      timeZone: localTz,
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    })
    const fmtLondon = (d: Date) => d.toLocaleString('en-GB', {
      timeZone: 'Europe/London',
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
      hour12: false,
    })

    // BEFORE block — prints exactly what's currently in the DB so
    // the QA tester has a baseline to verify against. Owner direction
    // 2026-05-09 (PR #49 device QA wave 4): explicit timezone-labelled
    // output so the customer-app's display rendering can be cross-
    // checked against the absolute UTC math without ambiguity.
    console.log('')
    console.log('────────────── BEFORE ──────────────')
    console.log(`  redemption  : ${redemption.id}`)
    console.log(`  user        : ${user.email}`)
    console.log(`  voucher     : ${voucher.code ?? voucher.id} · ${voucher.title}`)
    console.log(`  code        : ${redemption.redemptionCode}`)
    console.log(`  redeemedAt  : ${redemption.redeemedAt.toISOString()}     (raw DB / UTC)`)
    if (redemption.isValidated && redemption.validatedAt) {
      console.log(`  validatedAt : ${redemption.validatedAt.toISOString()}     (validated by staff)`)
    } else {
      console.log(`  validatedAt : (not validated)`)
    }

    await prisma.voucherRedemption.update({
      where: { id: redemption.id },
      data:  {
        redeemedAt:  targetRedeemedAt,
        validatedAt: nextValidatedAt,
        isTestData:  true, // §DG — QA script touches make this test data
      },
    })

    // AFTER block — re-reads the row to confirm the write took.
    // (Skipping the re-read would let "the write succeeded" be a
    // tautology; reading back proves the row really changed.)
    const updated = await prisma.voucherRedemption.findUnique({
      where:  { id: redemption.id },
      select: { redeemedAt: true, validatedAt: true },
    })
    console.log('')
    console.log('────────────── AFTER  ──────────────')
    console.log(`  redeemedAt  : ${updated?.redeemedAt.toISOString() ?? '(not found — write failed?)'}     (raw DB / UTC)`)
    if (updated?.validatedAt) {
      console.log(`  validatedAt : ${updated.validatedAt.toISOString()}`)
    } else {
      console.log(`  validatedAt : (not validated)`)
    }
    console.log(`  minutes ago : ${args.minutesAgo}`)
    console.log('')
    console.log('────────────── EXPIRY MATH (absolute UTC + display previews) ──────────────')
    console.log(`  redeemedAt UTC          : ${targetRedeemedAt.toISOString()}`)
    console.log(`  + 2h presentation window`)
    console.log(`  expires at UTC          : ${expiryAt.toISOString()}`)
    console.log(`  delta                   : 2:00:00 (absolute, timezone-independent)`)
    console.log('')
    console.log(`  How the customer-app card will display these (en-GB, 24-hour):`)
    console.log(`    redeemed (this host's TZ = ${localTz}):  ${fmtLocal(targetRedeemedAt)}`)
    console.log(`    expires  (this host's TZ = ${localTz}):  ${fmtLocal(expiryAt)}`)
    console.log(`    redeemed (Europe/London — UK reference): ${fmtLondon(targetRedeemedAt)}`)
    console.log(`    expires  (Europe/London — UK reference): ${fmtLondon(expiryAt)}`)
    console.log('')
    console.log(`  now (this host UTC) : ${nowAt.toISOString()}`)
    console.log(`  state               : ${stateLabel}`)
    console.log('')
    console.log('  IMPORTANT: the in-app card uses DEVICE-LOCAL timezone for the redeemed Date/')
    console.log('  Time rows AND the "Available to show staff until …" helper line, so on a')
    console.log('  device in a different TZ from this host, the displayed clock will differ —')
    console.log('  but the absolute redeemedAt/expiry instants above are the same on every device.')
    console.log('')
    console.log('────────────── NEXT STEPS ──────────────')
    console.log('  React Query caches `getCustomerVoucher` aggressively. To force the app')
    console.log('  to pick up the new redeemedAt:')
    console.log('  1. EITHER kill the app and relaunch, then open the voucher again;')
    console.log('  2. OR navigate back to merchant profile, then re-tap the voucher.')
    console.log('  3. (Pull-to-refresh on Voucher Detail is NOT currently wired — option 1')
    console.log('     or 2 above is the reliable path.)')
    console.log('  Once Voucher Detail re-mounts with the new redeemedAt, the')
    console.log('  presentation-window hook arms a setTimeout for the remaining window;')
    console.log('  no further reloads are needed to observe the boundary flip.')
    console.log('')
  } finally {
    await prisma.$disconnect()
    await pool.end()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
