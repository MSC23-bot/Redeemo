import { describe, it, expect } from 'vitest'
import {
  isQaAccountEmail,
  QA_ACCOUNT_EMAILS,
  QA_ACCOUNT_EMAIL_DOMAINS,
} from '../../../../src/api/customer/discovery/qaAccountFilter'

// §DG spec 2026-05-23-popular-ranking-design.md §6.2 — QA account email
// filter for Popular ranking + Trending inclusion query.  Compile-time
// constants + helper.  Belt-and-braces against scripts that forget to
// set isTestData on direct Prisma redemption creates.

describe('qaAccountFilter (§DG §6.2)', () => {
  it('exposes customer@redeemo.com as the canonical seeded QA email', () => {
    expect(QA_ACCOUNT_EMAILS).toContain('customer@redeemo.com')
  })

  it('exposes redeemo.dev as a QA domain', () => {
    expect(QA_ACCOUNT_EMAIL_DOMAINS).toContain('redeemo.dev')
  })

  it('isQaAccountEmail returns true for exact-match QA emails', () => {
    expect(isQaAccountEmail('customer@redeemo.com')).toBe(true)
  })

  it('isQaAccountEmail returns true for case-insensitive exact match', () => {
    expect(isQaAccountEmail('CUSTOMER@redeemo.com')).toBe(true)
    expect(isQaAccountEmail('Customer@Redeemo.com')).toBe(true)
  })

  it('isQaAccountEmail returns true for QA-domain emails', () => {
    expect(isQaAccountEmail('sarah.k@redeemo.dev')).toBe(true)
    expect(isQaAccountEmail('any.name@redeemo.dev')).toBe(true)
  })

  it('isQaAccountEmail returns true for case-insensitive domain match', () => {
    expect(isQaAccountEmail('sarah@REDEEMO.DEV')).toBe(true)
  })

  it('isQaAccountEmail returns false for real customer emails', () => {
    expect(isQaAccountEmail('jane@example.com')).toBe(false)
    expect(isQaAccountEmail('user@gmail.com')).toBe(false)
    expect(isQaAccountEmail('real@redeemo.co.uk')).toBe(false)  // .uk not .dev
  })

  it('isQaAccountEmail returns false for null/empty/undefined', () => {
    expect(isQaAccountEmail(null)).toBe(false)
    expect(isQaAccountEmail('')).toBe(false)
    expect(isQaAccountEmail(undefined)).toBe(false)
  })
})
