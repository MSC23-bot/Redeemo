import { scoreVoucher, type ScoreInput } from '@/lib/voucher/scoring'

// M2 F5: the "How this voucher stacks up" advisory scoring engine, ported VERBATIM
// from S0 §4 + §7. Pins the exact tier thresholds, the generosity inputs, the
// strengths/improvements feedback sets, and the SINGLE-fact-set guarantee.

// A baseline "Great" discount: generous, clear title, edited helpful description,
// real photo, few fair terms.
function greatDiscountInput(): ScoreInput {
  return {
    type: 'discount',
    savingValue: 20,
    savingPercent: 50,
    previewTitle: '20% off your order',
    previewDesc: 'A genuinely generous saving on your whole order, every time you visit us here.',
    descUntouched: false,
    hasPhoto: true,
    freeStandalone: false,
    reuseFrequent: false,
    selectedClauses: [{ id: 'tell_staff', label: 'Tell staff', tier: 'fair' }],
    customs: [],
  }
}

describe('scoring TIERS (S0 §4.1 / §4.2)', () => {
  it('Too weak when below the £5 minimum saving', () => {
    const res = scoreVoucher({ ...greatDiscountInput(), savingValue: 3, savingPercent: 10 })
    expect(res.calKey).toBe('weak')
    expect(res.label).toBe('Too weak')
    expect(res.desc).toBe(
      "Below Redeemo's £5 minimum saving. Make it more generous so it is worth a customer's trip.",
    )
    expect(res.belowMinSaving).toBe(true)
  })

  it('Too weak when too restrictive (2+ restrictive terms)', () => {
    const res = scoreVoucher({
      ...greatDiscountInput(),
      selectedClauses: [
        { id: 'a', label: 'x', tier: 'restrictive' },
        { id: 'b', label: 'y', tier: 'restrictive' },
      ],
    })
    expect(res.calKey).toBe('weak')
    expect(res.tooRestrictive).toBe(true)
    expect(res.desc).toBe(
      'Your offer is too restrictive to score well. Drop a term or two so customers can actually redeem.',
    )
  })

  it('Too weak when 4+ open improvements', () => {
    // no title, no photo, untouched desc, below-generous saving but >= 5 -> several improvements
    const res = scoreVoucher({
      type: 'discount',
      savingValue: 6,
      savingPercent: 8,
      previewTitle: 'x',
      previewDesc: '',
      descUntouched: true,
      hasPhoto: false,
      freeStandalone: false,
      reuseFrequent: false,
      selectedClauses: [],
      customs: [],
    })
    expect(res.improveCount).toBeGreaterThanOrEqual(4)
    expect(res.calKey).toBe('weak')
    expect(res.desc).toBe(
      'This offer needs work before it is ready. Clear the points below to lift it out of Too weak.',
    )
  })

  it('Great when generous, zero improvements, no restrictive flag, <= 3 terms', () => {
    const res = scoreVoucher(greatDiscountInput())
    expect(res.calKey).toBe('great')
    expect(res.label).toBe('Great')
    expect(res.desc).toBe('Great offer. Customers will love this.')
    expect(res.improveCount).toBe(0)
    expect(res.isGenerous).toBe(true)
  })

  it('Good is everything in between (one improvement left)', () => {
    // generous + clear title + photo + few terms, but description untouched -> 1 improvement
    const res = scoreVoucher({ ...greatDiscountInput(), descUntouched: true, previewDesc: '' })
    expect(res.calKey).toBe('good')
    expect(res.label).toBe('Good')
    expect(res.desc).toBe('A solid offer. Address the points below to reach Great.')
    expect(res.improveCount).toBeGreaterThan(0)
  })
})

describe('generosity inputs (S0 §4.3 / CC-7 / CC-8)', () => {
  it('absolute floors per type: BOGO/Discount >= 15, Freebie >= 10, Spend/Package never absolute', () => {
    // discount 15 absolute generous
    expect(scoreVoucher({ ...greatDiscountInput(), savingValue: 15, savingPercent: 10 }).isGenerous).toBe(true)
    // discount 14 not absolute and 10% not relative -> not generous
    expect(scoreVoucher({ ...greatDiscountInput(), savingValue: 14, savingPercent: 10 }).isGenerous).toBe(false)
  })

  it('relative floors: Discount/Spend/Package >= 20%, BOGO >= 40%', () => {
    // discount 6 (>= 5) at 20% relative -> generous
    expect(scoreVoucher({ ...greatDiscountInput(), savingValue: 6, savingPercent: 20 }).isGenerous).toBe(true)
    // bogo 6 at 20% NOT generous (needs 40%); at 40% generous
    const bogoBase: ScoreInput = { ...greatDiscountInput(), type: 'bogo' }
    expect(scoreVoucher({ ...bogoBase, savingValue: 6, savingPercent: 20 }).isGenerous).toBe(false)
    expect(scoreVoucher({ ...bogoBase, savingValue: 6, savingPercent: 40 }).isGenerous).toBe(true)
  })

  it('a standalone freebie with any positive value is generous; below £5 exempt from belowMinSaving', () => {
    const res = scoreVoucher({
      type: 'freebie',
      savingValue: 4,
      savingPercent: 100,
      previewTitle: 'Free coffee',
      previewDesc: 'A free coffee on us, no purchase needed, just show this voucher when you come in.',
      descUntouched: false,
      hasPhoto: true,
      freeStandalone: true,
      reuseFrequent: false,
      selectedClauses: [{ id: 'tell_staff', label: 'x', tier: 'fair' }],
      customs: [],
    })
    expect(res.belowMinSaving).toBe(false) // standalone freebie exempt
    expect(res.isGenerous).toBe(true)
    expect(res.calKey).toBe('great')
  })
})

describe('score input helpers (S0 §4.4)', () => {
  it('titleClear: >= 8 chars OR "X% off"/"£X off"', () => {
    expect(scoreVoucher({ ...greatDiscountInput(), previewTitle: 'Big sale!' }).titleClear).toBe(true) // >=8
    expect(scoreVoucher({ ...greatDiscountInput(), previewTitle: '20% off' }).titleClear).toBe(true) // pattern
    expect(scoreVoucher({ ...greatDiscountInput(), previewTitle: 'short' }).titleClear).toBe(false)
  })

  it('descHelpful: >= 30 chars AND edited', () => {
    const long = 'This is a nice long description over thirty characters.'
    expect(scoreVoucher({ ...greatDiscountInput(), previewDesc: long, descUntouched: false }).descHelpful).toBe(true)
    expect(scoreVoucher({ ...greatDiscountInput(), previewDesc: long, descUntouched: true }).descHelpful).toBe(false)
    expect(scoreVoucher({ ...greatDiscountInput(), previewDesc: 'short', descUntouched: false }).descHelpful).toBe(false)
  })
})

describe('strengths + improvements feedback sets (S0 §7)', () => {
  it('a Great voucher lists strengths and no improvements', () => {
    const res = scoreVoucher(greatDiscountInput())
    expect(res.strengths.length).toBeGreaterThan(0)
    expect(res.strengths).toContain('A clear, easy title')
    expect(res.strengths).toContain('A real photo, not a placeholder')
    expect(res.improvements).toEqual([])
  })

  it('a below-floor voucher recommends raising the saving', () => {
    const res = scoreVoucher({ ...greatDiscountInput(), savingValue: 3, savingPercent: 5 })
    expect(res.improvements).toContain('Raise the saving to at least £5')
  })

  it('an unedited description recommends making it your own; no photo recommends a photo', () => {
    const res = scoreVoucher({
      ...greatDiscountInput(),
      descUntouched: true,
      previewDesc: 'Suggested copy here that is long enough to pass length.',
      hasPhoto: false,
    })
    expect(res.improvements).toContain(
      'Make the description your own. Add a line about why customers will love it, or a detail only you would know.',
    )
    expect(res.improvements).toContain('Add a photo so your offer stands out to customers')
  })

  it('strengths list is capped at 4, improvements capped at 4 (improveCount is the full pre-cap)', () => {
    const res = scoreVoucher({
      type: 'discount',
      savingValue: 4,
      savingPercent: 2,
      previewTitle: 'x',
      previewDesc: '',
      descUntouched: true,
      hasPhoto: false,
      freeStandalone: false,
      reuseFrequent: false,
      selectedClauses: [],
      customs: [],
    })
    expect(res.improvements.length).toBeLessThanOrEqual(4)
    expect(res.strengths.length).toBeLessThanOrEqual(4)
  })
})

describe('single-fact-set guarantee (S0 §7.3): meter + lists never disagree', () => {
  it('a Great meter implies zero improvements', () => {
    const res = scoreVoucher(greatDiscountInput())
    if (res.calKey === 'great') expect(res.improvements).toEqual([])
  })
})
