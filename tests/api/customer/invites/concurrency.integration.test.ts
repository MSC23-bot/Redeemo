import 'dotenv/config'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { PrismaClient } from '../../../../generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { submitInvite } from '../../../../src/api/customer/invites/service'
import { buildInviterKey, buildPlaceKey, hashInviteIp } from '../../../../src/api/customer/invites/identity'

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
 * Correction round 3 adds two more real-DB races that only a genuine
 * unique-index + advisory-lock combination can prove: an ordinary duplicate
 * resubmission sitting exactly at the open-invite cap boundary (must be
 * idempotent `ok`, never rejected, never a double-write), and two literally
 * identical concurrent submissions crossing the nine-to-ten boundary (must
 * both settle `ok`, with exactly one new row — the in-lock duplicate
 * pre-check must let the loser see the winner's row rather than either
 * double-creating or spuriously hitting the cap).
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

// Scenario 3 fixture (correction round 3): 1 user, seeded to exactly the
// cap (10 open invites), then re-submits the SAME (inviterKey, placeKey)
// as invite #10 — must be an idempotent ok, not a cap rejection or a
// double-write — followed by an 11th DISTINCT business, which must be
// rejected (the cap is genuinely exhausted).
const CAP_BOUNDARY_PREFIX = `TEST cap-boundary business ${ts}`
let capBoundaryUserId: string

// Scenario 4 fixture (correction round 3): 1 user seeded to 9 open
// invites, then TWO literally identical concurrent submits of the same
// 10th business — both must settle ok, with exactly ONE new row.
const NINE_TO_TEN_PREFIX = `TEST nine-to-ten business ${ts}`
let nineToTenUserId: string

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

/**
 * Directly seeds `count` ACTIVE, non-anonymised, countable open invites for
 * `userId`, one per freshly created MerchantLead — bypassing submitInvite
 * (which would re-run the LIVE/eligibility matching this fixture doesn't
 * need) so tests can start from an exact, known open-invite count. Business
 * names follow `${namePrefix}-${i}` so a single re-submit/race test can
 * reuse index `count` for its boundary-crossing business and keep the whole
 * family under one `startsWith` prefix for teardown.
 */
async function seedOpenInvites(userId: string, count: number, namePrefix: string): Promise<string[]> {
  const inviterKey = buildInviterKey(userId)
  const businessNames: string[] = []
  for (let i = 0; i < count; i++) {
    const businessName = `${namePrefix}-${i}`
    businessNames.push(businessName)
    const lead = await prisma.merchantLead.create({
      data: {
        businessName,
        locationHint: null,
        source: 'CUSTOMER_REQUEST',
        stage: 'LEAD',
      },
      select: { id: true },
    })
    await prisma.merchantInvite.create({
      data: {
        inviterUserId: userId,
        inviterKey,
        placeKey: buildPlaceKey({ businessName, locality: null }),
        businessNameRaw: businessName,
        localityRaw: null,
        googlePlaceId: null,
        consentShareName: true,
        status: 'ACTIVE',
        rewardEligible: true,
        countableAt: new Date(),
        leadId: lead.id,
        ipHash: hashInviteIp('203.0.113.99'),
      },
    })
  }
  return businessNames
}

beforeAll(async () => {
  raceUserIds = await Promise.all(
    Array.from({ length: 6 }, (_, i) => createTestUser(`race-${i}`)),
  )
  capUserId = await createTestUser('cap')
  capBoundaryUserId = await createTestUser('cap-boundary')
  nineToTenUserId = await createTestUser('nine-to-ten')
})

afterAll(async () => {
  const allUserIds = [...raceUserIds, capUserId, capBoundaryUserId, nineToTenUserId].filter(Boolean)
  // Dependency order (bare-id FK-free house pattern, but tear down
  // logically-dependent rows first regardless): invites -> leads -> users.
  await prisma.merchantInvite.deleteMany({ where: { inviterUserId: { in: allUserIds } } })
  await prisma.merchantLead.deleteMany({
    where: {
      OR: [
        { businessName: RACE_BUSINESS_NAME },
        { businessName: { startsWith: CAP_BOUNDARY_PREFIX } },
        { businessName: { startsWith: NINE_TO_TEN_PREFIX } },
      ],
    },
  })
  await prisma.user.deleteMany({ where: { id: { in: allUserIds } } })
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

  it('an ordinary duplicate resubmission sitting exactly at the cap boundary is an idempotent ok with no double-write, and an 11th DISTINCT business is genuinely rejected', async () => {
    // Seed exactly 10 open invites (the cap) for one user across 10
    // distinct businesses.
    const businessNames = await seedOpenInvites(capBoundaryUserId, 10, CAP_BOUNDARY_PREFIX)
    const tenthBusinessName = businessNames[9]

    const before = await prisma.merchantInvite.count({ where: { inviterUserId: capBoundaryUserId } })
    expect(before).toBe(10)

    // Re-submit business #10 EXACTLY (same businessNameRaw/localityRaw/
    // googlePlaceId -> the identical placeKey, and the same user ->
    // the identical inviterKey): the in-lock duplicate pre-check must find
    // the existing row and return ok BEFORE the cap check ever runs.
    const duplicateResult = await submitInvite(prisma, {
      userId: capBoundaryUserId,
      businessNameRaw: tenthBusinessName,
      localityRaw: null,
      googlePlaceId: null,
      note: null,
      consentShareName: true,
      ip: '203.0.113.12',
      userAgent: 'concurrency-test',
    })
    expect(duplicateResult).toEqual({ kind: 'ok' })

    const afterDuplicate = await prisma.merchantInvite.count({ where: { inviterUserId: capBoundaryUserId } })
    expect(afterDuplicate).toBe(10)

    // An 11th, genuinely DISTINCT business: no duplicate row exists for it,
    // so the pre-check falls through to the cap check, which is genuinely
    // exhausted (10 non-anonymised invites already exist).
    const eleventhBusinessName = `${CAP_BOUNDARY_PREFIX}-10`
    await expect(
      submitInvite(prisma, {
        userId: capBoundaryUserId,
        businessNameRaw: eleventhBusinessName,
        localityRaw: null,
        googlePlaceId: null,
        note: null,
        consentShareName: true,
        ip: '203.0.113.12',
        userAgent: 'concurrency-test',
      }),
    ).rejects.toMatchObject({ code: 'INVITE_CAP_REACHED' })

    const afterEleventh = await prisma.merchantInvite.count({ where: { inviterUserId: capBoundaryUserId } })
    expect(afterEleventh).toBe(10)
  }, 30000)

  it('two IDENTICAL concurrent submissions crossing the nine-to-ten boundary both settle ok, with exactly ONE new row', async () => {
    // Seed 9 open invites, then race the SAME (user, business) submit
    // twice — the placeKey+inviterKey locks (both identical across the two
    // calls, since this is the same user and the same business) serialise
    // them: the first creates the 10th row; the second, once unblocked,
    // must see that row via the in-lock duplicate pre-check and return ok
    // WITHOUT creating a second row or hitting the cap.
    await seedOpenInvites(nineToTenUserId, 9, NINE_TO_TEN_PREFIX)
    const tenthBusinessName = `${NINE_TO_TEN_PREFIX}-9`

    const input = {
      userId: nineToTenUserId,
      businessNameRaw: tenthBusinessName,
      localityRaw: null,
      googlePlaceId: null,
      note: null,
      consentShareName: true,
      ip: '203.0.113.13',
      userAgent: 'concurrency-test',
    }

    const results = await Promise.allSettled([submitInvite(prisma, input), submitInvite(prisma, input)])

    const fulfilled = results.filter(
      (r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof submitInvite>>> => r.status === 'fulfilled',
    )
    expect(fulfilled.length).toBe(2)
    for (const r of fulfilled) expect(r.value).toEqual({ kind: 'ok' })

    const totalCount = await prisma.merchantInvite.count({ where: { inviterUserId: nineToTenUserId } })
    expect(totalCount).toBe(10)

    const rowsForTenthBusiness = await prisma.merchantInvite.count({
      where: { inviterUserId: nineToTenUserId, businessNameRaw: tenthBusinessName },
    })
    expect(rowsForTenthBusiness).toBe(1)
  }, 30000)
})

describe('submitInvite lock-timeout contention — real-DB (round-3 F-C1)', () => {
  it('a held placeKey advisory lock beyond lock_timeout maps to the retryable INVITE_SUBMIT_CONTENTION, never an opaque failure', async () => {
    const userId = await createTestUser('contention')
    const businessName = `TEST contention business ${ts}`
    const placeKey = buildPlaceKey({ businessName, locality: null })
    try {
      await prisma.$transaction(
        async (holder) => {
          // Take the namespace-1 (place) lock and HOLD it by awaiting the
          // contender inside this transaction — deterministic, no sleeps.
          await holder.$executeRaw`SELECT pg_advisory_xact_lock(1, hashtext(${placeKey}))`
          // The contender runs on a separate pool connection, blocks on the
          // ns1 lock, hits its own SET LOCAL lock_timeout='3s', and must
          // surface the retryable contention code (real-adapter proof of
          // the 55P03 mapping that unit mocks can only assert by shape).
          await expect(
            submitInvite(prisma, {
              userId,
              businessNameRaw: businessName,
              localityRaw: null,
              googlePlaceId: null,
              note: null,
              consentShareName: false,
              ip: '203.0.113.99',
              userAgent: 'contention-test',
            }),
          ).rejects.toMatchObject({ code: 'INVITE_SUBMIT_CONTENTION' })
        },
        { timeout: 20000 },
      )
      // The timed-out transaction must have written NOTHING.
      const rows = await prisma.merchantInvite.count({ where: { inviterUserId: userId } })
      expect(rows).toBe(0)
      const leads = await prisma.merchantLead.count({ where: { businessName } })
      expect(leads).toBe(0)
    } finally {
      await prisma.merchantInvite.deleteMany({ where: { inviterUserId: userId } })
      await prisma.merchantLead.deleteMany({ where: { businessName } })
      await prisma.user.delete({ where: { id: userId } }).catch(() => {})
    }
  }, 30000)
})
