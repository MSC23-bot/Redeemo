import {
  CTA_LABELS,
  FAIR_USE_TITLE,
  HOW_IT_WORKS_STEPS_FREE,
  HOW_IT_WORKS_STEPS_SUBSCRIBED,
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
    expect(CTA_LABELS.redeemSubscribe).toBe('Subscribe to Redeem · £6.99/mo')
    expect(CTA_LABELS.redeemed).toBe('Already Redeemed This Cycle')
    expect(CTA_LABELS.expired).toBe('Expired')
    expect(CTA_LABELS.unavailable).toBe('Currently Unavailable')
  })

  it('no `branchLoading` label exists (hide-the-wrap pattern, locked 2026-05-07)', () => {
    // The previous "Resolving Branch…" disabled-primary CTA flashed
    // as the customer's first impression on hard-load / app
    // relaunch / post-login. Owner direction 2026-05-07: hide the
    // sticky CTA wrap entirely while branch is unresolved, rather
    // than render a large alarming button. The label constant was
    // removed to enforce this — anyone who tries to surface a
    // "loading" CTA copy must explicitly add a new state instead
    // of accidentally re-using the old label.
    expect((CTA_LABELS as Record<string, string>).branchLoading).toBeUndefined()
  })

  it('How It Works free-user variant has 5 steps starting with "Subscribe to Unlock"', () => {
    // Round 17: both variants are 5 steps; free-user variant starts
    // with the conversion gate, then the shared 4-step redemption
    // flow (Tell Staff First → Redeem When Ready → Enter the Branch
    // PIN → Show & Save).
    expect(HOW_IT_WORKS_STEPS_FREE.length).toBe(5)
    expect(HOW_IT_WORKS_STEPS_FREE[0]?.label).toBe('Subscribe to Unlock')
    expect(HOW_IT_WORKS_STEPS_FREE[1]?.label).toBe('Tell Staff First')
    expect(HOW_IT_WORKS_STEPS_FREE[2]?.label).toBe('Redeem When Ready')
    expect(HOW_IT_WORKS_STEPS_FREE[3]?.label).toBe('Enter the Branch PIN')
    expect(HOW_IT_WORKS_STEPS_FREE[4]?.label).toBe('Show & Save')
  })

  it('How It Works subscribed variant has 5 steps starting with "Review the Voucher"', () => {
    // Round 17: subscribed-user variant starts with orientation,
    // then the same 4-step redemption flow as the free-user variant.
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED.length).toBe(5)
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED[0]?.label).toBe('Review the Voucher')
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED[1]?.label).toBe('Tell Staff First')
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED[2]?.label).toBe('Redeem When Ready')
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED[3]?.label).toBe('Enter the Branch PIN')
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED[4]?.label).toBe('Show & Save')
    // Subscribed flow does NOT contain the Subscribe-to-Unlock step.
    expect(HOW_IT_WORKS_STEPS_SUBSCRIBED.some(s => s.label === 'Subscribe to Unlock')).toBe(false)
  })

  it('Steps 2-5 are identical across both variants (shared redemption flow)', () => {
    expect(HOW_IT_WORKS_STEPS_FREE.slice(1)).toEqual(HOW_IT_WORKS_STEPS_SUBSCRIBED.slice(1))
  })

  it('FAIR_USE_TITLE is the v4-locked heading text', () => {
    expect(FAIR_USE_TITLE).toBe('Fair Use Policy')
  })
})
