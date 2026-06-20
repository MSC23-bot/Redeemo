/**
 * Dev-only: issue a Merchant Portal token into Redis so a flow can be tested while
 * email is dark. Looks the owner up by email (MerchantAdmin) and writes the token.
 *
 * Usage:
 *   npx tsx prisma/issue-merchant-token.ts <kind> <email> [ttlSeconds]
 *   kind = claim | reset | verify
 *
 *   claim  -> merchant-claim:<token>            (set-password link), TTL default 7d
 *   reset  -> pwd-reset:merchant:<token>        (reset-password link), TTL default 1h
 *   verify -> merchant-email-verify:<challenge> with a real 6-digit code (HMAC,
 *             keyed by ENCRYPTION_KEY), TTL default 24h. Prints the challenge + code
 *             for POST /api/v1/merchant/auth/register/verify.
 *
 * For the expired / invalid path, just use a bogus token / challenge in the request.
 */
import crypto from 'crypto'
import Redis from 'ioredis'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import { RedisKey } from '../src/api/shared/redis-keys'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

const KINDS = ['claim', 'reset', 'verify'] as const
type Kind = (typeof KINDS)[number]
const DEFAULT_TTL: Record<Kind, number> = { claim: 7 * 24 * 3600, reset: 3600, verify: 24 * 3600 }

async function main() {
  const [kind, email, ttlArg] = process.argv.slice(2)
  if (!kind || !email || !KINDS.includes(kind as Kind)) {
    console.error('Usage: npx tsx prisma/issue-merchant-token.ts <claim|reset|verify> <email> [ttlSeconds]')
    process.exit(1)
  }
  const k = kind as Kind
  const ttl = ttlArg ? Number(ttlArg) : DEFAULT_TTL[k]
  if (!Number.isFinite(ttl) || ttl < 1) { console.error('ttlSeconds must be a positive integer'); process.exit(1) }

  const admin = await prisma.merchantAdmin.findUnique({ where: { email }, select: { id: true, email: true } })
  if (!admin) { console.error(`No MerchantAdmin with email ${email}`); process.exit(1) }

  const base = (process.env.MERCHANT_PORTAL_URL || 'http://localhost:3003').replace(/\/+$/, '')

  if (k === 'claim') {
    const token = crypto.randomBytes(32).toString('hex')
    await redis.set(RedisKey.merchantClaim(token), admin.id, 'EX', ttl)
    console.log(`\nIssued claim token for ${admin.email} (expires in ${ttl}s)`)
    console.log(`  ${base}/claim?token=${token}\n`)
    return
  }

  if (k === 'reset') {
    const token = crypto.randomBytes(32).toString('hex')
    await redis.set(RedisKey.passwordReset('merchant', token), admin.id, 'EX', ttl)
    console.log(`\nIssued reset token for ${admin.email} (expires in ${ttl}s)`)
    console.log(`  ${base}/reset-password?token=${token}\n`)
    return
  }

  // verify: a challenge + a real 6-digit code (HMAC-stored) for /register/verify
  const encKey = process.env.ENCRYPTION_KEY
  if (!encKey) { console.error('ENCRYPTION_KEY must be set to issue a verify code'); process.exit(1) }
  const challenge = crypto.randomBytes(16).toString('hex')
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHmac = crypto.createHmac('sha256', encKey).update(challenge + ':' + code).digest('hex')
  await redis.set(
    RedisKey.merchantEmailVerify(challenge),
    JSON.stringify({ adminId: admin.id, deviceId: 'dev-device', deviceType: 'web', codeHmac, attempts: 0 }),
    'EX', ttl,
  )
  console.log(`\nIssued verify challenge for ${admin.email} (expires in ${ttl}s)`)
  console.log(`  sessionChallenge=${challenge}`)
  console.log(`  code=${code}`)
  console.log(`  POST /api/v1/merchant/auth/register/verify  { "sessionChallenge": "${challenge}", "code": "${code}" }\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); redis.disconnect() })
