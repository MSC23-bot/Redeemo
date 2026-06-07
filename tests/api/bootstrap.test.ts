import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { bootstrap } from '../../src/api/bootstrap'
import { REQUIRED_SECRETS } from '../../src/api/shared/env'

// Regression test for Gate-PR-1b (boot-validation correctness).
//
// The bug: `src/index.ts` statically imported the app graph, which loads
// `shared/stripe.ts` and calls `requireSecret('STRIPE_SECRET_KEY')` at module
// import time — BEFORE `validateRequiredEnv()` ran. So `npm run dev` reported
// only ONE missing secret (STRIPE_SECRET_KEY) instead of the aggregated list.
//
// The fix: `bootstrap()` runs `validateRequiredEnv()` first, then dynamically
// imports the app. This test proves the aggregated error fires before any
// module-level secret consumer.
describe('bootstrap — env validation runs before any app module import', () => {
  let saved: Record<string, string | undefined>
  beforeEach(() => {
    saved = {}
    for (const k of REQUIRED_SECRETS) saved[k] = process.env[k]
  })
  afterEach(() => {
    for (const k of REQUIRED_SECRETS) {
      if (saved[k] === undefined) delete process.env[k]
      else process.env[k] = saved[k]
    }
  })

  it('with multiple missing secrets, throws ONE aggregated error listing ALL of them (not a single module-level secret error)', async () => {
    for (const k of REQUIRED_SECRETS) delete process.env[k]

    let message = ''
    try {
      await bootstrap()
    } catch (err) {
      message = (err as Error).message
    }

    // One aggregated boot error...
    expect(message).toMatch(/Refusing to start/)
    // ...listing MULTIPLE distinct secrets in the single message. A regression
    // (app graph imported before validation) would surface only the first
    // module-level consumer — STRIPE_SECRET_KEY via shared/stripe.ts — and would
    // NOT mention JWT_SECRET_CUSTOMER. Asserting both proves aggregation runs first.
    expect(message).toContain('JWT_SECRET_CUSTOMER')
    expect(message).toContain('STRIPE_SECRET_KEY')
    for (const k of REQUIRED_SECRETS) expect(message).toContain(k)
  })
})
