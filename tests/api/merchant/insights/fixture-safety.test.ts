import { describe, it, expect, afterEach } from 'vitest'
import {
  assertInsightsDemoFixtureAllowed,
  requireInsightsDemoAdminPassword,
  seedInsightsDemoFixture,
  INSIGHTS_DEMO_MERCHANT_NAME,
} from '../../../../prisma/insights-demo-fixture'

// Insights PR-A Task A10 - DEMO-FIXTURE SAFETY (guard-only, NO DB).
//
// The demo fixture's include-path is the single server-owned function
// seedInsightsDemoFixture(prisma). These tests pin the call-time guards:
//   - NON-STAGING refuses even with the flag set (finding #8: requires
//     REDEEMO_DEPLOY_ENV==='staging' exactly; production / unset / unknown fail
//     closed; NODE_ENV is NOT consulted).
//   - the flag UNSET refuses everywhere (default-off, fail-closed).
//   - the credential env var UNSET refuses (finding #10: no password committed).
//   - a REQUEST-SHAPED object cannot enable it (no opener argument exists;
//     the guard reads ONLY server-owned process config).
//   - the allowlisted demo-merchant name is a fixed sentinel (not request-derived).
// The isTestData=true + eligible-exclusion + collision/preservation/atomicity proofs
// need a real DB and live in fixture-safety.integration.test.ts.

const ORIGINAL_NODE_ENV = process.env.NODE_ENV
const ORIGINAL_DEPLOY_ENV = process.env.REDEEMO_DEPLOY_ENV
const ORIGINAL_DEMO_FLAG = process.env.INSIGHTS_DEMO_FIXTURE
const ORIGINAL_DEMO_PW = process.env.INSIGHTS_DEMO_ADMIN_PASSWORD

function restoreEnv(key: string, value: string | undefined): void {
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[key]
  else process.env[key] = value
}

afterEach(() => {
  // Restore the exact original env after every case (never leak across tests).
  restoreEnv('NODE_ENV', ORIGINAL_NODE_ENV)
  restoreEnv('REDEEMO_DEPLOY_ENV', ORIGINAL_DEPLOY_ENV)
  restoreEnv('INSIGHTS_DEMO_FIXTURE', ORIGINAL_DEMO_FLAG)
  restoreEnv('INSIGHTS_DEMO_ADMIN_PASSWORD', ORIGINAL_DEMO_PW)
})

describe('assertInsightsDemoFixtureAllowed (call-time guard, finding #8 staging identity)', () => {
  it('THROWS on a production deploy even when the staging flag is set', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow(/staging/i)
  })

  it('THROWS when REDEEMO_DEPLOY_ENV is unset even with the flag set', () => {
    delete process.env.REDEEMO_DEPLOY_ENV
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow(/staging/i)
  })

  it('THROWS for any non-"staging" deploy identity (local / test / unknown / casing / whitespace)', () => {
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    for (const bad of ['', 'local', 'test', 'unknown', 'STAGING', ' staging', 'staging ', 'prod']) {
      process.env.REDEEMO_DEPLOY_ENV = bad
      expect(() => assertInsightsDemoFixtureAllowed(), `deploy ${JSON.stringify(bad)}`).toThrow()
    }
  })

  it('THROWS when the staging flag is unset (default-off, fail-closed) on a staging deploy', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    expect(() => assertInsightsDemoFixtureAllowed()).toThrow(/INSIGHTS_DEMO_FIXTURE/)
  })

  it('THROWS when the flag is a non-affirmative value (only "1" opens it)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    for (const bad of ['0', 'true', 'yes', '', ' 1', '1 ', 'TRUE']) {
      process.env.INSIGHTS_DEMO_FIXTURE = bad
      expect(() => assertInsightsDemoFixtureAllowed(), `value ${JSON.stringify(bad)}`).toThrow()
    }
  })

  it('does NOT throw when REDEEMO_DEPLOY_ENV is exactly "staging" AND the flag is exactly "1"', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).not.toThrow()
  })

  it('THE REAL STAGING COMBO (finding #8): NODE_ENV=production + REDEEMO_DEPLOY_ENV=staging + flag => allowed', () => {
    process.env.NODE_ENV = 'production'
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    expect(() => assertInsightsDemoFixtureAllowed()).not.toThrow()
  })

  it('NODE_ENV alone NEVER opens it (REDEEMO_DEPLOY_ENV unset, flag set)', () => {
    delete process.env.REDEEMO_DEPLOY_ENV
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    for (const env of ['development', 'test', 'staging']) {
      process.env.NODE_ENV = env
      expect(() => assertInsightsDemoFixtureAllowed(), `NODE_ENV ${env}`).toThrow(/staging/i)
    }
  })
})

describe('requireInsightsDemoAdminPassword (finding #10 - credential fail-closed)', () => {
  it('THROWS when INSIGHTS_DEMO_ADMIN_PASSWORD is unset', () => {
    delete process.env.INSIGHTS_DEMO_ADMIN_PASSWORD
    expect(() => requireInsightsDemoAdminPassword()).toThrow(/INSIGHTS_DEMO_ADMIN_PASSWORD/)
  })

  it('THROWS when INSIGHTS_DEMO_ADMIN_PASSWORD is empty', () => {
    process.env.INSIGHTS_DEMO_ADMIN_PASSWORD = ''
    expect(() => requireInsightsDemoAdminPassword()).toThrow(/INSIGHTS_DEMO_ADMIN_PASSWORD/)
  })

  it('returns the operator-supplied secret when set (and never logs it)', () => {
    process.env.INSIGHTS_DEMO_ADMIN_PASSWORD = 'operator-chosen-secret'
    expect(requireInsightsDemoAdminPassword()).toBe('operator-chosen-secret')
  })

  it('the error message does NOT include any committed password literal', () => {
    delete process.env.INSIGHTS_DEMO_ADMIN_PASSWORD
    try {
      requireInsightsDemoAdminPassword()
      throw new Error('expected requireInsightsDemoAdminPassword to throw')
    } catch (e) {
      // The old committed literal must never appear in code/messages again.
      expect((e as Error).message).not.toContain('InsightsDemo1!')
    }
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
    body: { INSIGHTS_DEMO_FIXTURE: '1', enableDemo: true, deployEnv: 'staging' },
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

  it('cannot be enabled by a request-shaped object (production deploy, flag unset)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    // Even smuggling the "flag" through a request-shaped payload changes nothing:
    // the function signature has no opener argument; only prisma is passed.
    void requestShaped
    await expect(seedInsightsDemoFixture(explodingPrisma)).rejects.toThrow(/staging/i)
  })

  it('refuses (no DB touched) when the staging flag is unset on a staging deploy', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    delete process.env.INSIGHTS_DEMO_FIXTURE
    await expect(seedInsightsDemoFixture(explodingPrisma)).rejects.toThrow(/INSIGHTS_DEMO_FIXTURE/)
  })

  it('refuses (no DB touched) when the credential env var is unset, even with the guards open (finding #10)', async () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_FIXTURE = '1'
    delete process.env.INSIGHTS_DEMO_ADMIN_PASSWORD
    // The credential is read + hashed BEFORE any DB access, so the exploding prisma
    // double is never reached.
    await expect(seedInsightsDemoFixture(explodingPrisma)).rejects.toThrow(/INSIGHTS_DEMO_ADMIN_PASSWORD/)
  })

  it('exposes a fixed, non-request-derived demo-merchant allowlist sentinel', () => {
    // The allowlist key is a compile-time constant, never built from caller input.
    expect(INSIGHTS_DEMO_MERCHANT_NAME).toBe('INSIGHTS DEMO (test-data only)')
  })
})
