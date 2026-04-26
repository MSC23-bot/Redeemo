/**
 * Dev-only: flip a User's verification flags + status so the login path
 * emits the intended AppError code. Use for exercising auth UX states
 * without real email / SMS / admin tooling.
 *
 * Usage:
 *   npx tsx prisma/set-auth-state.ts <email> <mode>
 *
 * Modes:
 *   verified          — restore: emailVerified=true, phoneVerified=true, status=ACTIVE
 *   email-unverified  — emailVerified=false  → login → EMAIL_NOT_VERIFIED
 *   phone-unverified  — emailVerified=true, phoneVerified=false → login → PHONE_NOT_VERIFIED
 *   inactive          — status=INACTIVE       → login → ACCOUNT_INACTIVE
 *   suspended         — status=SUSPENDED      → login → ACCOUNT_SUSPENDED
 *
 * Restore:
 *   npx tsx prisma/set-auth-state.ts <email> verified
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)

type Mode = 'verified' | 'email-only' | 'email-unverified' | 'phone-unverified' | 'inactive' | 'suspended'

const MODES: Record<Mode, { patch: object; expected: string }> = {
  'verified':         { patch: { emailVerified: true,  phoneVerified: true,  status: 'ACTIVE' },    expected: '(no error — login succeeds)' },
  // Use email-only to simulate a freshly-registered user who verified their
  // email (e.g. via this script) but hasn't yet verified their phone.
  'email-only':       { patch: { emailVerified: true,  phoneVerified: false, status: 'ACTIVE' },    expected: 'app advances to /(auth)/verify-phone' },
  'email-unverified': { patch: { emailVerified: false, phoneVerified: true,  status: 'ACTIVE' },    expected: 'EMAIL_NOT_VERIFIED (403) → redirects to /(auth)/verify-email' },
  'phone-unverified': { patch: { emailVerified: true,  phoneVerified: false, status: 'ACTIVE' },    expected: 'PHONE_NOT_VERIFIED (403) → redirects to /(auth)/verify-phone' },
  'inactive':         { patch: { emailVerified: true,  phoneVerified: true,  status: 'INACTIVE' },  expected: 'ACCOUNT_INACTIVE (403) → inline error' },
  'suspended':        { patch: { emailVerified: true,  phoneVerified: true,  status: 'SUSPENDED' }, expected: 'ACCOUNT_SUSPENDED (403) → inline error' },
}

async function main() {
  const [email, mode] = process.argv.slice(2)
  if (!email || !mode || !(mode in MODES)) {
    console.error('Usage: npx tsx prisma/set-auth-state.ts <email> <mode>')
    console.error(`Modes: ${Object.keys(MODES).join(', ')}`)
    process.exit(1)
  }

  const { patch, expected } = MODES[mode as Mode]
  const user = await prisma.user.update({
    where: { email },
    data:  patch,
    select: { email: true, emailVerified: true, phoneVerified: true, status: true },
  })

  console.log(`\n✓  ${user.email}`)
  console.log(`   emailVerified=${user.emailVerified}  phoneVerified=${user.phoneVerified}  status=${user.status}`)
  console.log(`   Expected on login: ${expected}`)
  if (mode !== 'verified') {
    console.log(`\n   Restore:  npx tsx prisma/set-auth-state.ts ${user.email} verified\n`)
  } else {
    console.log('')
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end() })
