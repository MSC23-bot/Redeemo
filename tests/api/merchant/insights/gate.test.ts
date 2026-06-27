import { describe, it, expect, afterEach } from 'vitest'
import {
  behaviouralGateOpen,
  busyPeakMinCount,
  repeatRateMinCohort,
} from '../../../../src/api/merchant/insights/gate'

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
  INSIGHTS_BUSY_PEAK_MIN_COUNT: process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT,
  INSIGHTS_REPEAT_RATE_MIN_COHORT: process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT,
}

function restore(key: keyof typeof SAVED): void {
  const value = SAVED[key]
  if (value === undefined) delete (process.env as Record<string, string | undefined>)[key]
  else process.env[key] = value
}

afterEach(() => {
  restore('NODE_ENV')
  restore('INSIGHTS_BEHAVIOURAL_GATE')
  restore('INSIGHTS_BUSY_PEAK_MIN_COUNT')
  restore('INSIGHTS_REPEAT_RATE_MIN_COHORT')
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

// Undecided PR-0a D6 thresholds (Codex finding #4): server-owned, fail-closed
// positive-integer config readers. UNSET / non-positive / junk => null (no approved
// threshold). Only an exact positive-integer decimal string returns a number. These
// MUST NOT carry a hard-coded default that silently decides D6 policy.

describe('busyPeakMinCount (undecided PR-0a D6 busy-times peak threshold)', () => {
  it('default (unset) -> null (no approved threshold; busiest never named pre-D6)', () => {
    delete process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT
    expect(busyPeakMinCount()).toBeNull()
  })

  it('production + unset -> null (fail closed)', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT
    expect(busyPeakMinCount()).toBeNull()
  })

  it('empty string -> null', () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = ''
    expect(busyPeakMinCount()).toBeNull()
  })

  it("'0' -> null (zero is not a positive threshold)", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '0'
    expect(busyPeakMinCount()).toBeNull()
  })

  it("negative '-3' -> null", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '-3'
    expect(busyPeakMinCount()).toBeNull()
  })

  it("float '3.5' -> null (integer only)", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '3.5'
    expect(busyPeakMinCount()).toBeNull()
  })

  it("junk 'three' -> null", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = 'three'
    expect(busyPeakMinCount()).toBeNull()
  })

  it("whitespace ' 4 ' -> null (strict; no trimming)", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = ' 4 '
    expect(busyPeakMinCount()).toBeNull()
  })

  it("a recorded positive integer '5' -> 5", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '5'
    expect(busyPeakMinCount()).toBe(5)
  })

  it("a recorded positive integer '1' -> 1", () => {
    process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT = '1'
    expect(busyPeakMinCount()).toBe(1)
  })

  it('takes no caller-supplied input (arity 0; no opener argument)', () => {
    expect(busyPeakMinCount.length).toBe(0)
    delete process.env.INSIGHTS_BUSY_PEAK_MIN_COUNT
    const tryRead = busyPeakMinCount as unknown as (...args: unknown[]) => number | null
    expect(tryRead('5')).toBeNull()
    expect(tryRead({ INSIGHTS_BUSY_PEAK_MIN_COUNT: '5' })).toBeNull()
  })
})

describe('repeatRateMinCohort (undecided PR-0a D6 repeat-rate min cohort)', () => {
  it('default (unset) -> null (no approved minimum; repeat-rate always insufficient pre-D6)', () => {
    delete process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT
    expect(repeatRateMinCohort()).toBeNull()
  })

  it('production + unset -> null (fail closed)', () => {
    process.env.NODE_ENV = 'production'
    delete process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT
    expect(repeatRateMinCohort()).toBeNull()
  })

  it('empty string -> null', () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = ''
    expect(repeatRateMinCohort()).toBeNull()
  })

  it("'0' -> null (zero is not a positive minimum; a 1-person cohort cannot be reliable)", () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = '0'
    expect(repeatRateMinCohort()).toBeNull()
  })

  it("negative '-1' -> null", () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = '-1'
    expect(repeatRateMinCohort()).toBeNull()
  })

  it("float '2.0' -> null (integer only)", () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = '2.0'
    expect(repeatRateMinCohort()).toBeNull()
  })

  it("junk 'lots' -> null", () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = 'lots'
    expect(repeatRateMinCohort()).toBeNull()
  })

  it("a recorded positive integer '10' -> 10", () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = '10'
    expect(repeatRateMinCohort()).toBe(10)
  })

  it("a recorded positive integer '1' -> 1", () => {
    process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT = '1'
    expect(repeatRateMinCohort()).toBe(1)
  })

  it('takes no caller-supplied input (arity 0; no opener argument)', () => {
    expect(repeatRateMinCohort.length).toBe(0)
    delete process.env.INSIGHTS_REPEAT_RATE_MIN_COHORT
    const tryRead = repeatRateMinCohort as unknown as (...args: unknown[]) => number | null
    expect(tryRead('1')).toBeNull()
    expect(tryRead({ INSIGHTS_REPEAT_RATE_MIN_COHORT: '1' })).toBeNull()
  })
})
