import {
  CTA_LABELS,
  FAIR_USE_TITLE,
  HOW_IT_WORKS_STEPS,
  deriveDineInPill,
  fairUseLinesForVoucherType,
  splitTermsIntoBullets,
} from '@/features/voucher/constants/productCopy'

// Pin the deterministic product-copy helpers consumed by the
// CouponTopCard / CouponBodyCard / RedeemCTA. These are pure
// functions — no mocking needed — but easy to break by accident.

describe('productCopy — fairUseLinesForVoucherType', () => {
  it('BOGO returns the guest/group line first, then the universal three', () => {
    const lines = fairUseLinesForVoucherType('BOGO')
    expect(lines.length).toBe(4)
    expect(lines[0]).toMatch(/1 voucher per 2 guests/)
    expect(lines[0]).toMatch(/Groups of 4 may use 2/)
    expect(lines[1]).toMatch(/Present voucher before ordering/)
    expect(lines[2]).toMatch(/non-transferable/)
    expect(lines[3]).toMatch(/right to refuse/)
  })

  it('PACKAGE_DEAL returns the per-table line first, then universal', () => {
    const lines = fairUseLinesForVoucherType('PACKAGE_DEAL')
    expect(lines.length).toBe(4)
    expect(lines[0]).toMatch(/1 voucher per group \/ table/)
  })

  it.each(['DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE', 'SPEND_AND_SAVE', 'TIME_LIMITED', 'REUSABLE'] as const)(
    '%s returns ONLY the universal three lines (no BOGO-specific line)',
    (type) => {
      const lines = fairUseLinesForVoucherType(type)
      expect(lines.length).toBe(3)
      expect(lines.some(l => /1 voucher per 2 guests/.test(l))).toBe(false)
      expect(lines.some(l => /1 voucher per group \/ table/.test(l))).toBe(false)
      expect(lines[0]).toMatch(/Present voucher before ordering/)
    },
  )
})

describe('productCopy — deriveDineInPill', () => {
  it('returns "Dine-in only" when terms contain "In-house only" at the start of a bullet', () => {
    expect(deriveDineInPill('In-house only. Cannot be combined with other offers. Once per cycle.')).toBe('Dine-in only')
  })

  it('returns "Dine-in only" when terms contain "Dine-in only" at the start of a bullet', () => {
    expect(deriveDineInPill('Dine-in only. Valid until 31 December.')).toBe('Dine-in only')
  })

  it('case-insensitive: "in-house only" / "DINE-IN ONLY" both match', () => {
    expect(deriveDineInPill('in-house only. blah.')).toBe('Dine-in only')
    expect(deriveDineInPill('DINE-IN ONLY. blah.')).toBe('Dine-in only')
  })

  it('also matches space-separated variants ("In house only" / "Dine in only")', () => {
    expect(deriveDineInPill('In house only. Blah.')).toBe('Dine-in only')
    expect(deriveDineInPill('Dine in only. Blah.')).toBe('Dine-in only')
  })

  it('does NOT match when phrase appears mid-sentence (avoids false positives)', () => {
    // The heuristic anchors at the start of a bullet (^), so phrases
    // appearing inside a sentence don't trip it.
    expect(deriveDineInPill('Cannot be combined with in-house only specials.')).toBeNull()
  })

  it('returns null for null terms / empty string / no matching phrase', () => {
    expect(deriveDineInPill(null)).toBeNull()
    expect(deriveDineInPill('')).toBeNull()
    expect(deriveDineInPill('Min spend £20. Cannot combine.')).toBeNull()
  })

  it('matches across line-break-formatted terms too', () => {
    expect(deriveDineInPill('In-house only\nCannot combine')).toBe('Dine-in only')
  })
})

describe('productCopy — splitTermsIntoBullets', () => {
  it('splits paragraph-format terms on sentence boundaries', () => {
    const out = splitTermsIntoBullets('In-house only. Cannot be combined with other offers. Once per cycle.')
    expect(out).toEqual([
      'In-house only',
      'Cannot be combined with other offers',
      'Once per cycle',
    ])
  })

  it('splits on line-breaks when present (overrides sentence-boundary split)', () => {
    const out = splitTermsIntoBullets('In-house only.\nCannot combine.\n')
    expect(out).toEqual(['In-house only', 'Cannot combine'])
  })

  it('returns empty list for null / empty / whitespace-only', () => {
    expect(splitTermsIntoBullets(null)).toEqual([])
    expect(splitTermsIntoBullets('')).toEqual([])
    expect(splitTermsIntoBullets('   \n  ')).toEqual([])
  })

  it('handles single-sentence terms (no boundary) as a single bullet', () => {
    expect(splitTermsIntoBullets('Valid until December.')).toEqual(['Valid until December'])
  })
})

describe('productCopy — CTA + How It Works copy is Title Case (v4 parity)', () => {
  it('all CTA labels match v4 mockup exactly', () => {
    expect(CTA_LABELS.redeemActive).toBe('Redeem This Voucher')
    expect(CTA_LABELS.redeemSubscribe).toBe('Subscribe to Redeem — £6.99/mo')
    expect(CTA_LABELS.redeemed).toBe('Already Redeemed This Cycle')
    expect(CTA_LABELS.expired).toBe('Expired')
    expect(CTA_LABELS.unavailable).toBe('Currently Unavailable')
    expect(CTA_LABELS.branchLoading).toBe('Resolving Branch…')
  })

  it('How It Works has 4 steps ending with "Enjoy Your Deal!"', () => {
    expect(HOW_IT_WORKS_STEPS.length).toBe(4)
    expect(HOW_IT_WORKS_STEPS[0]?.label).toBe('Tap Redeem')
    expect(HOW_IT_WORKS_STEPS[3]?.label).toBe('Enjoy Your Deal!')
  })

  it('FAIR_USE_TITLE is the v4-locked heading text', () => {
    expect(FAIR_USE_TITLE).toBe('Fair Use Policy')
  })
})
