import 'dotenv/config' // load DATABASE_URL for the DB-backed assertions (same pattern as seed-guardrail.test.ts)
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { recomputeWriteGuard } from '../../prisma/seed-data/recomputeWriteGuard'

// Bounded integration proof that the recompute guard blocks non-Category/Tag
// writes end-to-end against a real PrismaClient. Deliberately bounded (D6):
//   - performs NO writes — blocked writes throw in the guard BEFORE the DB; the
//     allowed-path checks are READS / not-blocked assertions only;
//   - does NOT run the slow full recompute (helper correctness is covered by the
//     existing DB-backed tests/api/lib/merchantCount.test.ts).
// DB-backed: runs only when DATABASE_URL is set; skips gracefully otherwise.

const hasDb = !!process.env.DATABASE_URL
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null
const base = adapter ? new PrismaClient({ adapter }) : null
const guarded = base ? (base.$extends(recomputeWriteGuard) as unknown as PrismaClient) : null

afterAll(async () => {
  if (base) await base.$disconnect()
})

describe.runIf(hasDb)('recomputeWriteGuard — bounded integration (real client, no writes)', () => {
  it('BLOCKS a marketplace write (merchant.create) before the DB', async () => {
    await expect((guarded as PrismaClient).merchant.create({ data: {} as never })).rejects.toThrow(/recompute-guard/)
  })

  it('BLOCKS a branch write and a reference write (SubscriptionPlan)', async () => {
    await expect((guarded as PrismaClient).branch.create({ data: {} as never })).rejects.toThrow(/recompute-guard/)
    await expect((guarded as PrismaClient).subscriptionPlan.create({ data: {} as never })).rejects.toThrow(/recompute-guard/)
  })

  it('ALLOWS the reads the recompute helpers need (merchant.count, category.count)', async () => {
    expect(typeof (await (guarded as PrismaClient).merchant.count())).toBe('number')
    expect(typeof (await (guarded as PrismaClient).category.count())).toBe('number')
  })

  it('does NOT guard-block an allowed Category/Tag write (reaches Prisma, no mutation)', async () => {
    // update on a non-existent id → Prisma "record not found", NOT a guard error,
    // and nothing is written. Proves Category/Tag writes pass the guard.
    for (const attempt of [
      () => (guarded as PrismaClient).category.update({ where: { id: '__no_such_category__' }, data: {} }),
      () => (guarded as PrismaClient).tag.update({ where: { id: '__no_such_tag__' }, data: {} }),
    ]) {
      const err = await attempt().then(() => null).catch((e: unknown) => e)
      expect(err, 'update on a missing id should reject').toBeInstanceOf(Error)
      expect(String((err as Error).message), 'the guard must NOT block Category/Tag').not.toMatch(/recompute-guard/)
    }
  })
})
