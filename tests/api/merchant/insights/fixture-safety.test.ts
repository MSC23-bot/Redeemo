import { describe, it, expect, afterEach } from 'vitest'
import {
  assertInsightsDemoFixtureAllowed,
  seedInsightsDemoFixture,
  INSIGHTS_DEMO_MERCHANT_NAME,
} from '../../../../prisma/insights-demo-fixture'

// Insights PR-A Task A10 - DEMO-FIXTURE SAFETY (guard-only, NO DB).
//
// The demo fixture's include-path is the single server-owned function
// seedInsightsDemoFixture(prisma). These tests pin the call-time guard:
//   - PRODUCTION refuses even with the flag set (NODE_ENV==='production').
//   - the flag UNSET refuses everywhere (default-off, fail-closed).
//   - a REQUEST-SHAPED object cannot enable it (no opener argument exists;
//     the guard reads ONLY server-owned process config).
//   - the allowlisted demo-merchant name is a fixed sentinel (not request-derived).
// The isTestData=true + eligible-exclusion proof needs a real DB and lives in
// fixture-safety.integration.test.ts.

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_DEMO_FLAG = process.env.INSIGHTS_DEMO_FIXTURE

afterEach(() => {
  // Restore the exact original env after every case (never leak across tests).
  if (ORIGINAL_NODE_ENV === undefined) delete process.env.NODE_ENV
  else process.env.NODE_ENV = ORIGINAL_NODE_ENV
  if (ORIGINAL_DEMO_FLAG === undefined) delete process.env.INSIGHTS_DEMO_FIXTURE
  else process.env.INSIGHTS_DEMO_FIXTURE = ORIGINAL_DEMO_FLAG
})

describe('assertInsightsDemoFixtureAllowed (call-time guard)', () => {
  it('THROWS in production even when the staging flag is set', () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow(/production/i)
  })

  it('THROWS when the staging flag is unset (default-off, fail-closed) in non-production', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow(/INSIGHTS_DEMO_FIXTURE/)
  })

  it('THROWS when the staging flag is unset even in development', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow(/default-off|fail-closed|INSIGHTS_DEMO_FIXTURE/)
  })

  it('THROWS when the flag is a non-affirmative value (only "1" opens it)', () => {
    process.env.NODE_ENV = 'staging'
    for (const bad of ['0', 'true', 'yes', '', ' 1', '1 ', 'TRUE']) {
      process.env.INSIGHTS_DEMO_FIXTURE = bad
      expect(() => assertInsightsDemoFixtureAllowed(), `value ${JSON.stringify(bad)}`).toThrow()
    }
  })

  it('does NOT throw when NODE_ENV is non-production AND the flag is exactly "1"', () => {
    process.env.NODE_ENV = 'staging'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).not.toThrow()
  })

  it('treats production as production-only via NODE_ENV (the flag cannot override it)', () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow()
    // And remains blocked with the flag explicitly removed too.
    delete process.env.INSIGHTS_DEMO_FIXTURE
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow()
  })
})

describe('seedInsightsDemoFixture (include-path guard - no DB reached before the guard)', () => {
  // A request-shaped object: nothing here can open the gate. The function takes
  // ONLY a PrismaClient and never reads a caller-supplied flag, so a crafted
  // "request" (with headers/body/query/cookies pretending to enable the fixture)
  // is irrelevant. We pass a Prisma double whose first DB call would throw if it
  // were ever reached, proving the guard runs BEFORE any DB access.
  const requestShaped = {
    headers: { 'x-insights-demo-fixture': '1', authorization: 'Bearer anything' },
    body: { INSIGHTS_DEMO_FIXTURE: '1', enableDemo: true, nodeEnv: 'staging' },
    query: { INSIGHTS_DEMO_FIXTURE: '1', demo: '1' },
    cookies: { INSIGHTS_DEMO_FIXTURE: '1' },
  }

  const explodingPrisma = {
    merchant: {
      findFirst: () => {
        throw new Error('DB MUST NOT be reached: the guard should have thrown first')
      },
    },
  } as never

  it('cannot be enabled by a request-shaped object (production, flag unset)', async () => {
    process.env.NODE_ENV = 'production'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    // Even smuggling the "flag" through a request-shaped payload changes nothing:
    // the function signature has no opener argument; only prisma is passed.
    void requestShaped
    await expect(seedInsightsDemoFixture(explodingPrisma)).rejects.toThrow(/production/i)
  })

  it('refuses (no DB touched) when the staging flag is unset in non-production', async () => {
    process.env.NODE_ENV = 'test'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    await expect(seedInsightsDemoFixture(explodingPrisma)).rejects.toThrow(/INSIGHTS_DEMO_FIXTURE/)
  })

  it('exposes a fixed, non-request-derived demo-merchant allowlist sentinel', () => {
    // The allowlist key is a compile-time constant, never built from caller input.
    expect(INSIGHTS_DEMO_MERCHANT_NAME).toBe('INSIGHTS DEMO (test-data only)')
  })
})
