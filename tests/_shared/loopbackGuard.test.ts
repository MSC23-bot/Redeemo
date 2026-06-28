import { describe, it, expect } from 'vitest'
import { assertIntegrationDbLoopback } from './loopbackGuard'

// PR-G1a1: pins the project-global integration loopback guard. Imports ONLY the pure
// helper - never the auto-running `tests/integration.setup.ts` - so this unit test
// cannot accidentally execute the guard against the real process.env as an import
// side effect. Lives in the `unit` project (no DB).
//
// The two variables are validated INDEPENDENTLY: a safe localhost TEST_DATABASE_URL
// must never mask a Neon-backed DATABASE_URL.

const LOOPBACK = 'postgresql://ci:ci@127.0.0.1:5432/redeemo_integration_test'
const LOCALHOST = 'postgresql://ci:ci@localhost:5432/redeemo_integration_test'
const NEON = 'postgresql://u:p@ep-cool-rain-123456.eu-west-2.aws.neon.tech/redeemo?sslmode=require'
const RAILWAY = 'postgresql://postgres:p@containers-us-west-42.railway.app:5432/railway'

describe('assertIntegrationDbLoopback', () => {
  it('passes when DATABASE_URL is loopback and TEST_DATABASE_URL is unset', () => {
    expect(() => assertIntegrationDbLoopback({ DATABASE_URL: LOOPBACK })).not.toThrow()
    expect(() => assertIntegrationDbLoopback({ DATABASE_URL: LOCALHOST })).not.toThrow()
  })

  it('passes when BOTH are independently loopback', () => {
    expect(() =>
      assertIntegrationDbLoopback({ DATABASE_URL: LOOPBACK, TEST_DATABASE_URL: LOOPBACK }),
    ).not.toThrow()
  })

  it('throws when DATABASE_URL is unset (required)', () => {
    expect(() => assertIntegrationDbLoopback({})).toThrow(/DATABASE_URL is required/)
  })

  it('throws when DATABASE_URL is empty (required)', () => {
    expect(() => assertIntegrationDbLoopback({ DATABASE_URL: '   ' })).toThrow(/DATABASE_URL is required/)
  })

  it('throws when DATABASE_URL is a Neon host', () => {
    expect(() => assertIntegrationDbLoopback({ DATABASE_URL: NEON })).toThrow(/not loopback/i)
  })

  it('throws when DATABASE_URL is a Railway host', () => {
    expect(() => assertIntegrationDbLoopback({ DATABASE_URL: RAILWAY })).toThrow(/not loopback/i)
  })

  it('throws when DATABASE_URL is malformed', () => {
    expect(() => assertIntegrationDbLoopback({ DATABASE_URL: 'not a url' })).toThrow(/not a valid URL/)
  })

  it('throws when a localhost TEST_DATABASE_URL would otherwise MASK a Neon DATABASE_URL', () => {
    // The exact masking case the independent-validation contract closes.
    expect(() =>
      assertIntegrationDbLoopback({ DATABASE_URL: NEON, TEST_DATABASE_URL: LOOPBACK }),
    ).toThrow(/DATABASE_URL host .* is not loopback/i)
  })

  it('throws when TEST_DATABASE_URL is non-loopback even if DATABASE_URL is loopback', () => {
    expect(() =>
      assertIntegrationDbLoopback({ DATABASE_URL: LOOPBACK, TEST_DATABASE_URL: NEON }),
    ).toThrow(/TEST_DATABASE_URL host .* is not loopback/i)
  })

  it('throws when TEST_DATABASE_URL is malformed (independently validated)', () => {
    expect(() =>
      assertIntegrationDbLoopback({ DATABASE_URL: LOOPBACK, TEST_DATABASE_URL: 'garbage' }),
    ).toThrow(/TEST_DATABASE_URL is not a valid URL/)
  })

  it('never leaks credentials or the full connection string in the error', () => {
    let msg = ''
    try {
      assertIntegrationDbLoopback({ DATABASE_URL: NEON })
    } catch (e) {
      msg = (e as Error).message
    }
    expect(msg).toMatch(/not loopback/i)
    expect(msg).not.toContain('u:p@') // no credentials
    expect(msg).not.toContain('sslmode=require') // no full connection string
    expect(msg).not.toContain(NEON)
  })
})
