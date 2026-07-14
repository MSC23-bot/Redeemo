import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { submitInvite } from '../../../../src/api/customer/invites/service'
import { buildInviterKey } from '../../../../src/api/customer/invites/identity'

/**
 * Codex correction round (2026-07-14) — real-DB integration tests for the
 * two same-transaction advisory locks in submitInvite
 * (src/api/customer/invites/service.ts): the placeKey lock (one
 * MerchantLead per new business under concurrency) and the inviterKey lock
 * (atomic open-invite cap, no TOCTOU overshoot).
 *
 * Mocked tests (service.test.ts) prove branch shape and the exact P2002
 * matcher with a stubbed `tx`. They cannot prove the lock semantics — only
 * a real Postgres `pg_advisory_xact_lock` can. Setup mirrors
 * tests/api/redemption/advisory-lock-race.integration.test.ts EXACTLY:
 * inline PrismaClient + PrismaPg adapter, beforeAll fixture creation /
 * afterAll teardown in dependency order, real DATABASE_URL guarded by the
 * project-global strict-loopback check in tests/integration.setup.ts (wired
 * into the `integration` vitest project only — see vitest.config.ts).
 *
 * DO NOT RUN standalone in this environment (no loopback DB available
 * here) — this file only needs to typecheck and follow the
 * `*.integration.test.ts` lane conventions so CI / the integration project
 * can run it for real.
 */

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! })
const prisma  = new PrismaClient({ adapter })

const ts = Date.now()

// Scenario 1 fixture: 6 distinct users racing to invite the SAME new
// business. No googlePlaceId — placeKey is the fuzzy name+locality slug,
// identical across all 6 calls.
const RACE_BUSINESS_NAME = `TEST concurrency race business ${ts}`
const RACE_LOCALITY = 'TEST Concurrency Locality'
let raceUserIds: string[] = []

// Scenario 2 fixture: 1 user submitting 12 DIFFERENT businesses in
// parallel — same inviterKey lock component on every call, distinct
// placeKey per call.
const CAP_BUSINESS_COUNT = 12
let capUserId: string
const capBusinessNames: string[] = Array.from(
  { length: CAP_BUSINESS_COUNT },
  (_, i) => `TEST concurrency cap business ${ts}-${i}`,
)

async function createTestUser(suffix: string) {
  const user = await prisma.user.create({
    data: {
      email: `concurrency-test-${suffix}-${ts}@redeemo.test`,
      passwordHash: 'placeholder',
      firstName: 'Concurrency',
      lastName: 'Test',
      phoneVerified: true,
    },
    select: { id: true },
  })
  return user.id
}

beforeAll(async () => {
  raceUserIds = await Promise.all(
    Array.from({ length: 6 }, (_, i) => createTestUser(`race-${i}`)),
  )
  capUserId = await createTestUser('cap')
})

afterAll(async () => {
  // Dependency order (bare-id FK-free house pattern, but tear down
  // logically-dependent rows first regardless): invites -> leads -> users.
  await prisma.merchantInvite.deleteMany({
    where: { inviterUserId: { in: [...raceUserIds, capUserId].filter(Boolean) } },
  })
  await prisma.merchantLead.deleteMany({ where: { businessName: RACE_BUSINESS_NAME } })
  await prisma.user.deleteMany({ where: { id: { in: [...raceUserIds, capUserId].filter(Boolean) } } })
  await prisma.$disconnect()
})

describe('submitInvite advisory locks — real-DB concurrency (integration)', () => {
  it('N=6 parallel submitInvite calls for the SAME new business from 6 different users create EXACTLY ONE MerchantLead', async () => {
    const results = await Promise.allSettled(
      raceUserIds.map((userId) =>
        submitInvite(prisma, {
          userId,
          businessNameRaw: RACE_BUSINESS_NAME,
          localityRaw: RACE_LOCALITY,
          googlePlaceId: null,
          note: null,
          consentShareName: true,
          ip: '203.0.113.10',
          userAgent: 'concurrency-test',
        }),
      ),
    )

    // A fresh business, well under the per-inviter cap — every submit
    // should succeed (no already_live, no cap rejection).
    const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof submitInvite>>> => r.status === 'fulfilled')
    expect(fulfilled.length).toBe(6)
    for (const r of fulfilled) expect(r.value).toEqual({ kind: 'ok' })

    // The placeKey advisory lock must have serialised the attach-or-create
    // race: exactly one MerchantLead row exists for this business, no
    // matter how many of the 6 transactions raced to create it.
    const leads = await prisma.merchantLead.findMany({ where: { businessName: RACE_BUSINESS_NAME } })
    expect(leads.length).toBe(1)

    // All 6 invites attached to that single lead, one per inviter.
    const invites = await prisma.merchantInvite.findMany({
      where: { inviterUserId: { in: raceUserIds } },
    })
    expect(invites.length).toBe(6)
    expect(invites.every((inv) => inv.leadId === leads[0].id)).toBe(true)
    expect(new Set(invites.map((inv) => inv.inviterKey)).size).toBe(6)
  }, 30000)

  it('12 parallel submits of 12 different businesses from ONE user end with at most 10 non-anonymised invites', async () => {
    const results = await Promise.allSettled(
      capBusinessNames.map((businessName) =>
        submitInvite(prisma, {
          userId: capUserId,
          businessNameRaw: businessName,
          localityRaw: null,
          googlePlaceId: null,
          note: null,
          consentShareName: true,
          ip: '203.0.113.11',
          userAgent: 'concurrency-test',
        }),
      ),
    )

    const fulfilled = results.filter((r) => r.status === 'fulfilled')
    const rejected  = results.filter((r) => r.status === 'rejected')
    expect(fulfilled.length + rejected.length).toBe(CAP_BUSINESS_COUNT)

    // The inviterKey advisory lock serialises the cap check: no more than
    // OPEN_INVITE_CAP (10) may commit, however the 12 calls interleave.
    expect(fulfilled.length).toBeLessThanOrEqual(10)

    // Every rejection must be the typed cap error, not some other failure.
    for (const r of rejected) {
      const reason = (r as PromiseRejectedResult).reason
      expect(reason?.code).toBe('INVITE_CAP_REACHED')
    }

    // The DB agrees with the in-memory tally: at most 10 non-anonymised
    // invites exist for this inviter's key.
    const inviterKey = buildInviterKey(capUserId)
    const openInviteCount = await prisma.merchantInvite.count({
      where: { inviterKey, anonymisedAt: null },
    })
    expect(openInviteCount).toBeLessThanOrEqual(10)
    expect(openInviteCount).toBe(fulfilled.length)
  }, 30000)
})
