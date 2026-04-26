/**
 * Dev-only: write a real password-reset token into Redis for a given user,
 * so the reset-password flow can be tested without live email delivery.
 *
 * Usage:
 *   npx tsx prisma/issue-reset-token.ts <email> [ttlSeconds=3600]
 *
 * For the expired / invalid token path, no helper is needed — any bogus
 * token in the URL (e.g. ?token=nope) triggers RESET_TOKEN_EXPIRED
 * because the backend's Redis lookup returns null.
 */
import crypto from 'crypto'
import Redis from 'ioredis'
import { PrismaClient } from '../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { Pool } from 'pg'
import * as dotenv from 'dotenv'
dotenv.config()

const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter } as any)
const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379')

async function main() {
  const [email, ttlArg] = process.argv.slice(2)
  if (!email) {
    console.error('Usage: npx tsx prisma/issue-reset-token.ts <email> [ttlSeconds=3600]')
    process.exit(1)
  }
  const ttl = ttlArg ? Number(ttlArg) : 3600
  if (!Number.isFinite(ttl) || ttl < 1) {
    console.error('ttlSeconds must be a positive integer')
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true } })
  if (!user) {
    console.error(`No user with email ${email}`)
    process.exit(1)
  }

  const token = crypto.randomBytes(32).toString('hex')
  await redis.set(`pwd-reset:customer:${token}`, user.id, 'EX', ttl)

  console.log(`\n✓  Reset token issued for ${user.email} (expires in ${ttl}s)`)
  console.log(`   Web:  http://localhost:3001/reset-password?token=${token}`)
  console.log(`   App:  redeemo://reset-password?token=${token}\n`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect(); await pool.end(); redis.disconnect() })
