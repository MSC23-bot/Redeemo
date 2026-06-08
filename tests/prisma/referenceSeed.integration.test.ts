import 'dotenv/config' // load DATABASE_URL for the DB-backed assertions (same pattern as seed-guardrail.test.ts)
import { afterAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { referenceWriteGuard } from '../../prisma/seed-data/referenceWriteGuard'

// PR2b — bounded integration proof that the $extends wiring actually blocks
// non-reference writes end-to-end against a REAL PrismaClient (not just the pure
// allow-list function). Deliberately bounded per the plan's test decision:
//   - performs NO writes — blocked writes throw in the guard BEFORE reaching the
//     DB; the allowed-path assertions are READS (count) only;
//   - does NOT run the slow catchment/markets phase (that stays out of CI).
// DB-backed: runs only when DATABASE_URL is set; skips gracefully otherwise so CI
// never depends on a live connection for this file.

const hasDb = !!process.env.DATABASE_URL
const adapter = hasDb ? new PrismaPg({ connectionString: process.env.DATABASE_URL }) : null
const base = adapter ? new PrismaClient({ adapter }) : null
const guarded = base ? (base.$extends(referenceWriteGuard) as unknown as PrismaClient) : null

afterAll(async () => {
  if (base) await base.$disconnect()
})

describe.runIf(hasDb)('referenceWriteGuard — bounded integration (real client, no writes)', () => {
  it('BLOCKS a marketplace write (merchant.create) before it reaches the DB', async () => {
    await expect((guarded as PrismaClient).merchant.create({ data: {} as never })).rejects.toThrow(/reference-seed-guard/)
  })

  it('BLOCKS a customer write (user.create)', async () => {
    await expect((guarded as PrismaClient).user.create({ data: {} as never })).rejects.toThrow(/reference-seed-guard/)
  })

  it('BLOCKS a review write (review.create)', async () => {
    await expect((guarded as PrismaClient).review.create({ data: {} as never })).rejects.toThrow(/reference-seed-guard/)
  })

  it('ALLOWS the reads the reference phases need (merchantCategory.count)', async () => {
    const n = await (guarded as PrismaClient).merchantCategory.count()
    expect(typeof n).toBe('number')
  })

  it('ALLOWS reads on a reference model (category.count)', async () => {
    const n = await (guarded as PrismaClient).category.count()
    expect(typeof n).toBe('number')
  })

  // Proves the runtime hook lets an ALLOWED (and tricky-cased) write THROUGH: the
  // empty payload is rejected by Prisma's CLIENT-SIDE validation (required fields
  // missing), NOT by the guard — so nothing is written, and we confirm the guard
  // did not block CmsContent / RmvTemplate (the PascalCase allow-list matches).
  it('does NOT guard-block allowed-model writes (cmsContent / rmvTemplate reach Prisma validation)', async () => {
    for (const attempt of [
      () => (guarded as PrismaClient).cmsContent.create({ data: {} as never }),
      () => (guarded as PrismaClient).rmvTemplate.create({ data: {} as never }),
    ]) {
      const err = await attempt().then(() => null).catch((e: unknown) => e)
      expect(err, 'empty create should be rejected (by Prisma validation, not the DB)').toBeInstanceOf(Error)
      expect(String((err as Error).message), 'the guard must NOT block an allow-listed write').not.toMatch(/reference-seed-guard/)
    }
  })
})
