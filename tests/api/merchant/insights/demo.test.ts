import { describe, it, expect, afterEach } from 'vitest'
import { demoIncludeMerchantId, isStagingDeploy } from '../../../../src/api/merchant/insights/demo'

// Insights PR-A Task A10 - demo include-path RESOLVER (spec 2.6, plan A10). Pure
// server-owned config read. No real DB, no routes, no SQL.
//
// Locked invariants under test (the gate.ts pattern):
//   - SERVER-OWNED ONLY: the only inputs are the authz'd merchantId + three
//     server-owned process-config reads; nothing in a request/header/body/query/
//     cookie can flip it.
//   - STAGING IDENTITY HARD GATE (finding #8): REDEEMO_DEPLOY_ENV must be exactly
//     'staging'. Unset / empty / 'local' / 'test' / 'production' / unknown all
//     FAIL CLOSED. NODE_ENV is NOT consulted (Railway staging runs
//     NODE_ENV=production), so the REAL staging combo
//     (NODE_ENV='production' AND REDEEMO_DEPLOY_ENV='staging') ENABLES the demo.
//   - DEFAULT OFF: with no INSIGHTS_DEMO_INCLUDE flag set => undefined.
//   - MERCHANT ALLOWLIST: returns the merchantId ONLY when it equals the server-
//     owned INSIGHTS_DEMO_MERCHANT_ID; a normal merchant => undefined.
//
// We manipulate process.env directly and restore it in afterEach so no other suite
// is affected by the REDEEMO_DEPLOY_ENV / NODE_ENV / INSIGHTS_DEMO_* mutations.

const SAVED = {
  NODE_ENV: process.env.NODE_ENV,
  REDEEMO_DEPLOY_ENV: process.env.REDEEMO_DEPLOY_ENV,
  INSIGHTS_DEMO_INCLUDE: process.env.INSIGHTS_DEMO_INCLUDE,
  INSIGHTS_DEMO_MERCHANT_ID: process.env.INSIGHTS_DEMO_MERCHANT_ID,
}

function restore(key: keyof typeof SAVED): void {
  const value = SAVED[key]
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[key]
  else process.env[key] = value
}

afterEach(() => {
  restore('NODE_ENV')
  restore('REDEEMO_DEPLOY_ENV')
  restore('INSIGHTS_DEMO_INCLUDE')
  restore('INSIGHTS_DEMO_MERCHANT_ID')
})

const DEMO_ID = 'demo-merchant-abc'

describe('isStagingDeploy (finding #8 - server-owned staging identity)', () => {
  it('true ONLY when REDEEMO_DEPLOY_ENV === "staging" (exact)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(isStagingDeploy()).toBe(true)
  })

  it('FAILS CLOSED for unset / empty / unknown / local / test / production', () => {
    for (const bad of [undefined, '', 'STAGING', ' staging', 'staging ', 'local', 'test', 'production', 'unknown', 'prod']) {
      if (bad === undefined) delete process.env.REDEEMO_DEPLOY_ENV
      else process.env.REDEEMO_DEPLOY_ENV = bad
      expect(isStagingDeploy(), `value ${JSON.stringify(bad)}`).toBe(false)
    }
  })

  it('does NOT consult NODE_ENV: NODE_ENV=production with REDEEMO_DEPLOY_ENV=staging is staging', () => {
    process.env.NODE_ENV = 'production'
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    expect(isStagingDeploy()).toBe(true)
  })

  it('NODE_ENV alone NEVER makes it staging', () => {
    delete process.env.REDEEMO_DEPLOY_ENV
    for (const env of ['staging', 'development', 'test', 'production']) {
      process.env.NODE_ENV = env
      expect(isStagingDeploy(), `NODE_ENV ${env}`).toBe(false)
    }
  })
})

describe('demoIncludeMerchantId (server-owned demo resolver)', () => {
  it('ACTIVE: staging deploy + flag=1 + id match => returns the merchantId', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBe(DEMO_ID)
  })

  it('THE REAL STAGING COMBO (finding #8 bug fix): NODE_ENV=production AND REDEEMO_DEPLOY_ENV=staging + flags => ENABLED', () => {
    // This is the locked staging reality on Railway: NODE_ENV stays 'production',
    // and the demo must STILL be enabled because REDEEMO_DEPLOY_ENV==='staging'.
    process.env.NODE_ENV = 'production'
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBe(DEMO_ID)
  })

  it('PRODUCTION deploy hard gate: REDEEMO_DEPLOY_ENV=production => undefined even with flag=1 AND id match', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('staging-identity UNSET => undefined even with flag=1 AND id match (fail closed)', () => {
    delete process.env.REDEEMO_DEPLOY_ENV
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('staging-identity unknown / local / test / empty => undefined (fail closed)', () => {
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    for (const bad of ['', 'local', 'test', 'unknown', 'STAGING']) {
      process.env.REDEEMO_DEPLOY_ENV = bad
      expect(demoIncludeMerchantId(DEMO_ID), `value ${JSON.stringify(bad)}`).toBeUndefined()
    }
  })

  it('NODE_ENV alone never enables: NODE_ENV non-production but REDEEMO_DEPLOY_ENV unset => undefined', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.REDEEMO_DEPLOY_ENV
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('DEFAULT OFF: flag unset => undefined (even on a staging deploy + id configured)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    delete process.env.INSIGHTS_DEMO_INCLUDE
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('flag must be exactly "1" (not any truthy string)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    for (const bad of ['0', 'true', 'yes', '', ' 1', '1 ', 'TRUE']) {
      process.env.INSIGHTS_DEMO_INCLUDE = bad
      expect(demoIncludeMerchantId(DEMO_ID), `value ${JSON.stringify(bad)}`).toBeUndefined()
    }
  })

  it('MERCHANT ALLOWLIST: a NORMAL merchant with flag=1 + a DIFFERENT allowlisted id => undefined', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    // A real merchant id that is NOT the allowlisted demo id never qualifies.
    expect(demoIncludeMerchantId('a-real-paying-merchant')).toBeUndefined()
  })

  it('allowlist id UNSET => undefined (no demo merchant configured)', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    delete process.env.INSIGHTS_DEMO_MERCHANT_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
    // An empty configured id never matches a real merchant id either.
    process.env.INSIGHTS_DEMO_MERCHANT_ID = ''
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('production deploy stays dead regardless of which merchant id is asked', () => {
    process.env.REDEEMO_DEPLOY_ENV = 'production'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
    expect(demoIncludeMerchantId('anything-else')).toBeUndefined()
  })
})
