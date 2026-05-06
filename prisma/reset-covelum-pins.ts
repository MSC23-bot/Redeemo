/**
 * One-shot dev script to reset PINs for the two seeded Covelum branches.
 *
 * Why this script:
 *   • The seeded merchant admin (merchant@redeemo.com) has a sha256
 *     passwordHash from prisma/seed.ts, but the live API uses bcrypt
 *     to verify. The seeded password never works through the API.
 *   • The local .env doesn't include ENCRYPTION_KEY, so we can't
 *     decrypt or re-encrypt PINs directly from a dev script.
 *
 * Strategy:
 *   1. Re-hash the merchant admin password with bcrypt + write to DB
 *      (so the API login starts working).
 *   2. Log in via the API to get a merchant access token.
 *   3. Call PUT /api/v1/merchant/branches/<id>/pin for both Covelum
 *      branches — the API uses its already-loaded ENCRYPTION_KEY in
 *      process memory; the script itself doesn't need it.
 *
 * Run: npx tsx prisma/reset-covelum-pins.ts
 */
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
import bcrypt from 'bcryptjs'
import crypto from 'crypto'
import Redis from 'ioredis'

dotenv.config()

const API_BASE = process.env.LOCAL_API_BASE_URL ?? 'http://localhost:3000'
const REDIS_URL = process.env.REDIS_URL ?? 'redis://localhost:6379'
const NEW_PIN = '1234'
const MERCHANT_EMAIL = 'merchant@redeemo.com'
const MERCHANT_PASSWORD = 'Merchant1234!'

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)
const redis = new Redis(REDIS_URL)

async function main() {
  // 1. Reset merchant admin password (bcrypt) + mark OTP as verified
  //    + pre-register a known deviceId in Redis so login skips the
  //    Twilio OTP step.
  console.log(`[1/3] Resetting merchant admin password + bypassing OTP for ${MERCHANT_EMAIL}…`)
  const passwordHash = await bcrypt.hash(MERCHANT_PASSWORD, 10)
  const knownDeviceId = '00000000-0000-4000-8000-000000000001' // valid UUID v4 shape
  const updated = await prisma.merchantAdmin.update({
    where: { email: MERCHANT_EMAIL },
    data: {
      passwordHash,
      // Set otpVerifiedAt so otpRequired() doesn't enforce "first ever login".
      otpVerifiedAt: new Date(),
    },
  })
  // Pre-register the device so otpRequired() also skips the new-device gate.
  await redis.set(
    `known-devices:merchant:${updated.id}`,
    JSON.stringify([knownDeviceId]),
  )
  console.log(`    ✓ merchant admin id=${updated.id}; OTP-verified + device pre-registered`)

  // 2. Log in via the API.
  console.log(`[2/3] Logging in as merchant admin via ${API_BASE}…`)
  const loginRes = await fetch(`${API_BASE}/api/v1/merchant/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: MERCHANT_EMAIL,
      password: MERCHANT_PASSWORD,
      deviceId: knownDeviceId,
      deviceType: 'web',
      deviceName: 'reset-covelum-pins.ts',
    }),
  })
  if (!loginRes.ok) {
    const body = await loginRes.text()
    throw new Error(`Login failed: ${loginRes.status} ${body}`)
  }
  const login = await loginRes.json()
  const token = (login as { accessToken?: string }).accessToken
  if (!token) throw new Error(`Login response missing accessToken: ${JSON.stringify(login)}`)
  console.log(`    ✓ got access token`)

  // 3. Reset PIN for both Covelum branches by id.
  const branches = await prisma.branch.findMany({
    where: {
      merchant: {
        OR: [
          { businessName: { contains: 'covelum', mode: 'insensitive' } },
          { tradingName:  { contains: 'covelum', mode: 'insensitive' } },
        ],
      },
    },
    select: { id: true, name: true, isActive: true },
    orderBy: { name: 'asc' },
  })
  if (branches.length === 0) throw new Error('No Covelum branches found in DB')

  console.log(`[3/3] Resetting PIN to "${NEW_PIN}" for ${branches.length} branch(es)…`)
  for (const b of branches) {
    const res = await fetch(`${API_BASE}/api/v1/merchant/branches/${b.id}/pin`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ pin: NEW_PIN }),
    })
    if (!res.ok) {
      const body = await res.text()
      console.error(`    ✗ ${b.name} (${b.id}) → ${res.status} ${body}`)
      continue
    }
    console.log(`    ✓ ${b.name} (id=${b.id}, isActive=${b.isActive}) → PIN: ${NEW_PIN}`)
  }
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => {
    await prisma.$disconnect()
    await pool.end()
    redis.disconnect()
  })
