import { describe, it, expect, afterEach } from 'vitest'
import { demoIncludeMerchantId } from '../../../../src/api/merchant/insights/demo'

// Insights PR-A Task A10 - demo include-path RESOLVER (spec 2.6, plan A10). Pure
// server-owned config read. No real DB, no routes, no SQL.
//
// Locked invariants under test (the gate.ts pattern):
//   - SERVER-OWNED ONLY: the only inputs are the authz'd merchantId + three
//     server-owned process-config reads; nothing in a request/header/body/query/
//     cookie can flip it.
//   - PRODUCTION HARD GATE: NODE_ENV==='production' => ALWAYS undefined (even with
//     the flag set + id matching).
//   - DEFAULT OFF: with no INSIGHTS_DEMO_INCLUDE flag set => undefined.
//   - MERCHANT ALLOWLIST: returns the merchantId ONLY when it equals the server-
//     owned INSIGHTS_DEMO_MERCHANT_ID; a normal merchant => undefined.
//
// We manipulate process.env directly and restore it in afterEach so no other suite
// is affected by the NODE_ENV / INSIGHTS_DEMO_* mutations.

const SAVED = {
  NODE_ENV: process.env.NODE_ENV,
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
  restore('INSIGHTS_DEMO_INCLUDE')
  restore('INSIGHTS_DEMO_MERCHANT_ID')
})

const DEMO_ID = 'demo-merchant-abc'

describe('demoIncludeMerchantId (server-owned demo resolver)', () => {
  it('ACTIVE: non-production + flag=1 + id match => returns the merchantId', () => {
    process.env.NODE_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBe(DEMO_ID)
  })

  it('PRODUCTION hard gate: returns undefined even with flag=1 AND id match', () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('DEFAULT OFF: flag unset => undefined (even non-production + id configured)', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.INSIGHTS_DEMO_INCLUDE
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('flag must be exactly "1" (not any truthy string)', () => {
    process.env.NODE_ENV = 'test'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    for (const bad of ['0', 'true', 'yes', '', ' 1', '1 ', 'TRUE']) {
      process.env.INSIGHTS_DEMO_INCLUDE = bad
      expect(demoIncludeMerchantId(DEMO_ID), `value ${JSON.stringify(bad)}`).toBeUndefined()
    }
  })

  it('MERCHANT ALLOWLIST: a NORMAL merchant with flag=1 + a DIFFERENT allowlisted id => undefined', () => {
    process.env.NODE_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    // A real merchant id that is NOT the allowlisted demo id never qualifies.
    expect(demoIncludeMerchantId('a-real-paying-merchant')).toBeUndefined()
  })

  it('allowlist id UNSET => undefined (no demo merchant configured)', () => {
    process.env.NODE_ENV = 'staging'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    delete process.env.INSIGHTS_DEMO_MERCHANT_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
    // An empty configured id never matches a real merchant id either.
    process.env.INSIGHTS_DEMO_MERCHANT_ID = ''
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
  })

  it('production stays dead regardless of which merchant id is asked', () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_DEMO_INCLUDE = '1'
    process.env.INSIGHTS_DEMO_MERCHANT_ID = DEMO_ID
    expect(demoIncludeMerchantId(DEMO_ID)).toBeUndefined()
    expect(demoIncludeMerchantId('anything-else')).toBeUndefined()
  })
})
