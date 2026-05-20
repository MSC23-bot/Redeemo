// PR #112 fixup-6 (2026-05-20) — search query normalisation pin.
//
// Owner-flagged regression: query `restaurant` returned Fino's Pizzeria + The
// Coffee House, while `restaurant ` (trailing space) returned Covelum
// Restaurant + My Kerala Restaurant.  A leading/trailing space MUST NEVER
// change matches; repeated internal whitespace ALSO must not change matches.
//
// `normalizeSearchQuery` is the single helper both `searchBranches` and
// `searchMerchants` route the user query through.  Display surfaces may
// echo the user-typed query verbatim, but backend matching uses the
// normalised value.

import { describe, it, expect } from 'vitest'
import { normalizeSearchQuery } from '../../../../src/api/customer/discovery/service'

describe('normalizeSearchQuery (PR #112 fixup-6)', () => {
  it('returns null for null', () => {
    expect(normalizeSearchQuery(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(normalizeSearchQuery(undefined)).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(normalizeSearchQuery('')).toBeNull()
  })

  it('returns null for whitespace-only string', () => {
    expect(normalizeSearchQuery('   ')).toBeNull()
    expect(normalizeSearchQuery('\t \n')).toBeNull()
  })

  it('passes through a clean single word', () => {
    expect(normalizeSearchQuery('restaurant')).toBe('restaurant')
  })

  it('passes through a clean multi-word phrase', () => {
    expect(normalizeSearchQuery('coffee shop')).toBe('coffee shop')
  })

  it('strips trailing whitespace — owner regression case (restaurant)', () => {
    expect(normalizeSearchQuery('restaurant ')).toBe('restaurant')
    expect(normalizeSearchQuery('restaurant\t')).toBe('restaurant')
    expect(normalizeSearchQuery('restaurant\n')).toBe('restaurant')
  })

  it('strips leading whitespace', () => {
    expect(normalizeSearchQuery(' restaurant')).toBe('restaurant')
    expect(normalizeSearchQuery('  restaurant  ')).toBe('restaurant')
  })

  it('collapses repeated internal whitespace — owner regression case (coffee shop)', () => {
    expect(normalizeSearchQuery('coffee  shop')).toBe('coffee shop')
    expect(normalizeSearchQuery('coffee   shop')).toBe('coffee shop')
    expect(normalizeSearchQuery('coffee\tshop')).toBe('coffee shop')
    expect(normalizeSearchQuery('coffee\nshop')).toBe('coffee shop')
  })

  it('handles mixed whitespace types in one input', () => {
    expect(normalizeSearchQuery('\t coffee \n shop \t')).toBe('coffee shop')
  })

  it('preserves internal punctuation + case', () => {
    expect(normalizeSearchQuery("McDonald's ")).toBe("McDonald's")
    expect(normalizeSearchQuery(' Pizza Express  Cafe ')).toBe('Pizza Express Cafe')
  })

  // Idempotency: normalising an already-normalised string is a no-op.
  it('is idempotent', () => {
    const once = normalizeSearchQuery('  restaurant  ')
    expect(once).toBe('restaurant')
    const twice = normalizeSearchQuery(once)
    expect(twice).toBe('restaurant')
  })

  // The two owner-flagged regression rows MUST yield the SAME normalised value.
  it('"restaurant" and "restaurant " produce identical normalised output (owner regression pin)', () => {
    expect(normalizeSearchQuery('restaurant')).toBe(normalizeSearchQuery('restaurant '))
  })

  it('"coffee" and "coffee " produce identical normalised output (non-restaurant pin)', () => {
    expect(normalizeSearchQuery('coffee')).toBe(normalizeSearchQuery('coffee '))
  })
})
