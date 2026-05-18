import {
  voucherTypeLabel,
  voucherTypeLabelShort,
  voucherGradient,
  formatPounds,
} from '@/features/voucher/utils/voucherTheme'

// §BO Revision (2026-05-18) — pins the long-vs-short label contract
// for all 8 voucher types.  These are pure pinning tests; the
// surrounding RedemptionRow integration tests prove the helpers are
// wired into the dense-row context correctly.
//
// Long form (`voucherTypeLabel`) is the canonical marketing-tone
// label used on Voucher Detail, Redemption Receipt, SuccessPopup,
// Merchant Profile, and accessibility labels everywhere.
//
// Short form (`voucherTypeLabelShort`) is for VISIBLE TEXT on
// dense row contexts (Savings RedemptionRow + future analytics
// surfaces).  Most types pass through unchanged so callers don't
// need per-type branching; only BOGO + PACKAGE_DEAL + TIME_LIMITED
// shorten meaningfully.

describe('voucherTheme — voucherTypeLabel (long form, canonical)', () => {
  // Confirms the long-form labels stay verbatim — anyone tightening
  // these without a separate review breaks Voucher Detail copy.
  const cases: Array<[Parameters<typeof voucherTypeLabel>[0], string]> = [
    ['BOGO',             'Buy one, get one free'],
    ['DISCOUNT_FIXED',   'Discount'],
    ['DISCOUNT_PERCENT', 'Discount'],
    ['FREEBIE',          'Freebie'],
    ['SPEND_AND_SAVE',   'Spend & save'],
    ['PACKAGE_DEAL',     'Package deal'],
    ['TIME_LIMITED',     'Time limited'],
    ['REUSABLE',         'Reusable'],
  ]
  it.each(cases)('%s → %s', (type, expected) => {
    expect(voucherTypeLabel(type)).toBe(expected)
  })
})

describe('voucherTheme — voucherTypeLabelShort (dense-row form, §BO)', () => {
  // Pins exactly which types shorten and which pass through.
  // BOGO + PACKAGE_DEAL + TIME_LIMITED change; everything else
  // is identical to the long form.
  const cases: Array<[Parameters<typeof voucherTypeLabelShort>[0], string]> = [
    ['BOGO',             'BOGO'],          // ← long is "Buy one, get one free"
    ['DISCOUNT_FIXED',   'Discount'],
    ['DISCOUNT_PERCENT', 'Discount'],
    ['FREEBIE',          'Freebie'],
    ['SPEND_AND_SAVE',   'Spend & save'],
    ['PACKAGE_DEAL',     'Package'],       // ← long is "Package deal"
    ['TIME_LIMITED',     'Time-limited'],  // ← long is "Time limited" (space → hyphen)
    ['REUSABLE',         'Reusable'],
  ]
  it.each(cases)('%s → %s', (type, expected) => {
    expect(voucherTypeLabelShort(type)).toBe(expected)
  })

  it('every type returns a non-empty string (no fall-through to default for known types)', () => {
    const allTypes = [
      'BOGO', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE',
      'SPEND_AND_SAVE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE',
    ] as const
    for (const t of allTypes) {
      const short = voucherTypeLabelShort(t)
      expect(short).toBeTruthy()
      expect(short.length).toBeGreaterThan(0)
      // Defensive: the fall-through default 'Voucher' should NOT
      // fire for any known type — that would mean a TYPE_LABELS_SHORT
      // map gap, which §BO Revision (2026-05-18) is supposed to
      // close.  Pin the absence here.
      expect(short).not.toBe('Voucher')
    }
  })

  it('short form is always ≤ long form length (the whole point of §BO)', () => {
    const allTypes = [
      'BOGO', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE',
      'SPEND_AND_SAVE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE',
    ] as const
    for (const t of allTypes) {
      const long  = voucherTypeLabel(t)
      const short = voucherTypeLabelShort(t)
      expect(short.length).toBeLessThanOrEqual(long.length)
    }
  })

  it('BOGO short form is materially shorter than long form (the load-bearing case)', () => {
    // §BO root-cause check: BOGO "Buy one, get one free" (21 chars)
    // was the type causing dense-row truncation.  Short form
    // "BOGO" (4 chars) is a ~5x reduction.  Pin this so a future
    // edit to TYPE_LABELS_SHORT['BOGO'] doesn't quietly lengthen
    // it back to the long form.
    expect(voucherTypeLabel('BOGO').length).toBeGreaterThan(20)
    expect(voucherTypeLabelShort('BOGO').length).toBeLessThan(6)
  })
})

describe('voucherTheme — voucherGradient (regression pin, unchanged by §BO)', () => {
  // §BO does NOT touch the gradient palette.  Pinning the per-type
  // tuple here as a regression guard so a future edit to one helper
  // doesn't accidentally ripple through the other.
  it('returns the BOGO violet pair', () => {
    expect(voucherGradient('BOGO')).toEqual(['#B7A4F2', '#6E3DD3'])
  })
  it('returns the REUSABLE teal pair', () => {
    expect(voucherGradient('REUSABLE')).toEqual(['#84DCC2', '#198375'])
  })
})

describe('voucherTheme — formatPounds (regression pin, unchanged by §BO)', () => {
  it('whole pounds → "£5" (no decimals)', () => {
    expect(formatPounds(5)).toBe('£5')
  })
  it('pennies → "£5.50" (always 2 decimals)', () => {
    expect(formatPounds(5.5)).toBe('£5.50')
  })
})
