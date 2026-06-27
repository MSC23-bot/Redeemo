import { describe, it, expect, afterEach } from 'vitest'
import { behaviouralGateOpen } from '../../../../src/api/merchant/insights/gate'

// Foundation-stage unit tests (Insights PR-A Task A6; spec 13.5). Pure config read.
// No real DB, no routes, no SQL. The integration test that proves the gated
// service functions never execute a real $queryRaw while closed lives in A7.
//
// Locked invariants under test:
//   - DEFAULT OFF: with no config set, returns false.
//   - SERVER-OWNED ONLY: the function takes no caller-supplied input; nothing in a
//     request/header/body/query/cookie can flip it. The signature accepts no opener.
//   - PRODUCTION FAIL-CLOSED: in production an unset/empty/non-affirmative value is
//     closed; only an explicit affirmative recorded value ('1'/'true') opens it.
//
// We manipulate process.env directly and restore it in afterEach so no other
// suite is affected by the gate's NODE_ENV / INSIGHTS_BEHAVIOURAL_GATE mutations.

const SAVED = {
  NODE_ENV: process.env.NODE_ENV,
  INSIGHTS_BEHAVIOURAL_GATE: process.env.INSIGHTS_BEHAVIOURAL_GATE,
}

function restore(key: keyof typeof SAVED): void {
  const value = SAVED[key]
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[key]
  else process.env[key] = value
}

afterEach(() => {
  restore('NODE_ENV')
  restore('INSIGHTS_BEHAVIOURAL_GATE')
})

describe('behaviouralGateOpen', () => {
  it('default (unset config) -> false (default off)', () => {
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    expect(behaviouralGateOpen()).toBe(false)
  })

  it('production + unset -> false (fail closed)', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    expect(behaviouralGateOpen()).toBe(false)
  })

  it('production + empty string -> false (fail closed)', () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = ''
    expect(behaviouralGateOpen()).toBe(false)
  })

  it("production + '1' -> true (explicit affirmative recorded value)", () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    expect(behaviouralGateOpen()).toBe(true)
  })

  it("production + 'true' -> true (explicit affirmative recorded value)", () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = 'true'
    expect(behaviouralGateOpen()).toBe(true)
  })

  it('non-production + unset -> false (default off everywhere)', () => {
    process.env.NODE_ENV = 'development'
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    expect(behaviouralGateOpen()).toBe(false)
  })

  it('test env + unset -> false (default off everywhere)', () => {
    process.env.NODE_ENV = 'test'
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    expect(behaviouralGateOpen()).toBe(false)
  })

  it("non-production + affirmative '1' -> true", () => {
    process.env.NODE_ENV = 'development'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '1'
    expect(behaviouralGateOpen()).toBe(true)
  })

  it("non-production + affirmative 'true' -> true", () => {
    process.env.NODE_ENV = 'development'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = 'true'
    expect(behaviouralGateOpen()).toBe(true)
  })

  it("junk value 'yes' -> false (only explicit affirmative recorded values open it)", () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = 'yes'
    expect(behaviouralGateOpen()).toBe(false)
  })

  it("junk value 'on' -> false", () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = 'on'
    expect(behaviouralGateOpen()).toBe(false)
  })

  it("junk value 'open' -> false", () => {
    process.env.NODE_ENV = 'development'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = 'open'
    expect(behaviouralGateOpen()).toBe(false)
  })

  it('arbitrary numeric-but-not-one value -> false (only the recorded affirmative opens it)', () => {
    process.env.NODE_ENV = 'production'
    process.env.INSIGHTS_BEHAVIOURAL_GATE = '0'
    expect(behaviouralGateOpen()).toBe(false)
  })

  it('no parameter can open it: the signature accepts no opener argument', () => {
    // The gate is server-owned only. behaviouralGateOpen takes no caller-supplied
    // input (no request/header/body/query/cookie), so there is no argument that
    // could flip it. Statically the function arity is 0; dynamically, passing a
    // would-be "opener" has no effect while the config is unset/closed.
    expect(behaviouralGateOpen.length).toBe(0)

    process.env.NODE_ENV = 'production'
    delete process.env.INSIGHTS_BEHAVIOURAL_GATE
    const tryOpen = behaviouralGateOpen as unknown as (...args: unknown[]) => boolean
    expect(tryOpen(true)).toBe(false)
    expect(tryOpen('1')).toBe(false)
    expect(tryOpen('true')).toBe(false)
    expect(tryOpen({ INSIGHTS_BEHAVIOURAL_GATE: '1' })).toBe(false)
    expect(tryOpen({ headers: { 'x-insights-gate': '1' } })).toBe(false)
  })
})
