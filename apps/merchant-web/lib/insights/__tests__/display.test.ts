/**
 * PR-B final-review: Insights-LOCAL display helpers.
 *
 * insightsVoucherTypeLabel returns the LOCKED merchant-facing labels from spec section
 * 1.16 (NOT the sentence-cased shared lib/redemptions/display labels). resolveScopeLabel
 * swaps the backend "Viewing: selected branch" placeholder for the real branch name when
 * a branchId filter is active.
 */
import { insightsVoucherTypeLabel, resolveScopeLabel, REPEAT_RATE_EXPLAINER } from '../display'
import type { VoucherType7 } from '@/lib/api/insights'

describe('insightsVoucherTypeLabel (spec 1.16 locked labels)', () => {
  it('returns the locked label for every one of the seven types', () => {
    const expected: Record<VoucherType7, string> = {
      BOGO: 'Buy one, get one free',
      SPEND_AND_SAVE: 'Spend & save',
      DISCOUNT: 'Discount',
      FREEBIE: 'Freebie',
      PACKAGE_DEAL: 'Package deal',
      TIME_LIMITED: 'Time limited',
      REUSABLE: 'Reusable',
    }
    for (const [type, label] of Object.entries(expected)) {
      expect(insightsVoucherTypeLabel(type as VoucherType7)).toBe(label)
    }
  })

  it('does NOT sentence-case (the shared display helper would say "Spend and save")', () => {
    expect(insightsVoucherTypeLabel('SPEND_AND_SAVE')).toBe('Spend & save')
    expect(insightsVoucherTypeLabel('PACKAGE_DEAL')).toBe('Package deal')
    expect(insightsVoucherTypeLabel('TIME_LIMITED')).toBe('Time limited')
  })

  it('merges DISCOUNT to the single "Discount" label', () => {
    expect(insightsVoucherTypeLabel('DISCOUNT')).toBe('Discount')
  })

  it('falls back to the raw input for an unknown/forward value (never mislabelled)', () => {
    expect(insightsVoucherTypeLabel('SOMETHING_NEW')).toBe('SOMETHING_NEW')
  })
})

describe('resolveScopeLabel (Reports/printable scope label)', () => {
  const branches = [
    { id: 'b1', name: 'Roe Cafe Soho' },
    { id: 'b2', name: 'Roe Cafe Shoreditch' },
  ]

  it('returns the raw label when no branchId filter is active', () => {
    expect(resolveScopeLabel('All branches', undefined, branches)).toBe('All branches')
    expect(resolveScopeLabel('All my branches', null, branches)).toBe('All my branches')
  })

  it('resolves the human branch name when a branchId filter is active', () => {
    expect(resolveScopeLabel('Viewing: selected branch', 'b1', branches)).toBe(
      'Viewing: Roe Cafe Soho',
    )
    expect(resolveScopeLabel('Viewing: selected branch', 'b2', branches)).toBe(
      'Viewing: Roe Cafe Shoreditch',
    )
  })

  it('falls back to the raw label when the branchId is not in the authorised list', () => {
    expect(resolveScopeLabel('Viewing: selected branch', 'unknown', branches)).toBe(
      'Viewing: selected branch',
    )
  })
})

describe('REPEAT_RATE_EXPLAINER (accurate eligibility exclusion copy)', () => {
  it('names the real excluded cohorts (test, QA, deleted), in plain English', () => {
    expect(REPEAT_RATE_EXPLAINER).toMatch(/test accounts/i)
    expect(REPEAT_RATE_EXPLAINER).toMatch(/QA accounts/i)
    expect(REPEAT_RATE_EXPLAINER).toMatch(/deleted customers/i)
  })

  it('does NOT claim a removal/reversal rule that does not exist', () => {
    // The eligibility predicate excludes test data, QA accounts, and DELETED-status
    // customers - there is no redemption-removal/reversal exclusion. The copy must
    // not imply one.
    expect(REPEAT_RATE_EXPLAINER).not.toMatch(/removed records/i)
    expect(REPEAT_RATE_EXPLAINER).not.toMatch(/reversed|reversal/i)
  })
})
