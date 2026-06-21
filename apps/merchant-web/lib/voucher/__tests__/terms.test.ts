import {
  tierOf,
  isRestrictiveText,
  tierBadge,
  buildClauseList,
  defaultSelectedClauseIds,
  countTermTiers,
  CUSTOM_CHAR_LIMIT,
} from '@/lib/voucher/terms'

// M2 F5: the terms engine, ported VERBATIM from S0 §2. Pins the core/per-type/
// category-conditional assembly, the Fair/Caution/Restrictive tags, the
// restrictive-word classifier, and the stacking counts.

describe('restrictive-word classifier (S0 §2.1)', () => {
  it('flags restrictive words', () => {
    expect(isRestrictiveText('Minimum spend of £20')).toBe(true)
    expect(isRestrictiveText('Weekdays only')).toBe(true)
    expect(isRestrictiveText('Excludes bank holidays')).toBe(true)
    expect(isRestrictiveText('Not valid on weekends')).toBe(true)
    expect(isRestrictiveText('After 6pm only')).toBe(true)
    expect(isRestrictiveText('Members only')).toBe(true)
    expect(isRestrictiveText('Peak hours apply')).toBe(true)
  })

  it('does not flag a plain custom term', () => {
    expect(isRestrictiveText('Please be kind to staff')).toBe(false)
  })

  it('tierOf: custom terms are never fair, restrictive-by-words else caution', () => {
    expect(tierOf('Minimum spend applies')).toBe('restrictive')
    expect(tierOf('Have a nice day')).toBe('caution')
  })

  it('tierBadge: fair shows no badge, caution/restrictive show their text', () => {
    expect(tierBadge.fair).toBe('')
    expect(tierBadge.caution).toBe('Caution')
    expect(tierBadge.restrictive).toBe('Restrictive')
  })

  it('custom char limit is 80', () => {
    expect(CUSTOM_CHAR_LIMIT).toBe(80)
  })
})

describe('universal CORE terms (S0 §2.2 - exactly 3, all Fair / CC-2)', () => {
  it('BOGO clause list starts with the 3-item core', () => {
    const clauses = buildClauseList({ type: 'bogo', categoryKey: 'home_local', spendAmt: 30 })
    const core = clauses.filter((c) => ['tell_staff', 'no_combine', 'per_visit'].includes(c.id))
    expect(core.map((c) => c.id)).toEqual(['tell_staff', 'no_combine', 'per_visit'])
    expect(core.every((c) => c.tier === 'fair')).toBe(true)
    expect(core[0].label).toBe('Tell the staff you are using a Redeemo voucher before you order or pay')
    expect(core[1].label).toBe('Not valid with any other voucher')
    expect(core[2].label).toBe('One voucher per customer each visit')
  })
})

describe('per-type FAIR terms (S0 §2.3)', () => {
  it('BOGO adds same_transaction', () => {
    const clauses = buildClauseList({ type: 'bogo', categoryKey: 'home_local' })
    const same = clauses.find((c) => c.id === 'same_transaction')
    expect(same?.label).toBe('Both items must be in the same transaction')
    expect(same?.tier).toBe('fair')
  })

  it('Spend & save uses the live spend amount in spend_single', () => {
    const clauses = buildClauseList({ type: 'spend', categoryKey: 'home_local', spendAmt: 45 })
    const single = clauses.find((c) => c.id === 'spend_single')
    expect(single?.label).toBe('Spend £45 or more in a single visit')
    // defaults to 30 when blank
    const blank = buildClauseList({ type: 'spend', categoryKey: 'home_local' })
    expect(blank.find((c) => c.id === 'spend_single')?.label).toBe('Spend £30 or more in a single visit')
  })

  it('Discount disc_total_bill swaps "bill" (food) vs "order" (else)', () => {
    const food = buildClauseList({ type: 'discount', categoryKey: 'food_drink' })
    expect(food.find((c) => c.id === 'disc_total_bill')?.label).toBe('Valid on your total bill')
    const shop = buildClauseList({ type: 'discount', categoryKey: 'shopping' })
    expect(shop.find((c) => c.id === 'disc_total_bill')?.label).toBe('Valid on your total order')
  })

  it('Package pkg_one_visit swaps "table or visit" (food) vs "visit" (else)', () => {
    const food = buildClauseList({ type: 'package', categoryKey: 'food_drink' })
    expect(food.find((c) => c.id === 'pkg_one_visit')?.label).toBe('The package is for one table or visit')
    const beauty = buildClauseList({ type: 'package', categoryKey: 'beauty_wellness' })
    expect(beauty.find((c) => c.id === 'pkg_one_visit')?.label).toBe('The package is for one visit')
  })

  it('Package adds pkg_before_service ONLY for food_drink / travel_hotels', () => {
    const food = buildClauseList({ type: 'package', categoryKey: 'food_drink' })
    expect(food.some((c) => c.id === 'pkg_before_service')).toBe(true)
    const travel = buildClauseList({ type: 'package', categoryKey: 'travel_hotels' })
    expect(travel.some((c) => c.id === 'pkg_before_service')).toBe(true)
    const shop = buildClauseList({ type: 'package', categoryKey: 'shopping' })
    expect(shop.some((c) => c.id === 'pkg_before_service')).toBe(false)
  })

  it('Freebie adds with_qualifying ONLY when needs a purchase', () => {
    const withP = buildClauseList({ type: 'freebie', categoryKey: 'home_local', freeNeedsPurchase: true })
    expect(withP.some((c) => c.id === 'with_qualifying')).toBe(true)
    const standalone = buildClauseList({ type: 'freebie', categoryKey: 'home_local', freeNeedsPurchase: false })
    expect(standalone.some((c) => c.id === 'with_qualifying')).toBe(false)
  })
})

describe('category-conditional CAUTION terms (S0 §2.4 + §2.6)', () => {
  it('food_drink (booking + fullPrice + dineIn flags) emits booking/full_price/dine_in caution terms', () => {
    const clauses = buildClauseList({ type: 'discount', categoryKey: 'food_drink' })
    const ids = clauses.map((c) => c.id)
    expect(ids).toContain('booking_rec')
    expect(ids).toContain('booking_req')
    expect(ids).toContain('full_price')
    expect(ids).toContain('dine_in')
    const booking = clauses.find((c) => c.id === 'booking_rec')
    expect(booking?.tier).toBe('caution')
    expect(booking?.label).toBe('Booking recommended')
  })

  it('home_local (no flags) emits NO category caution terms', () => {
    const clauses = buildClauseList({ type: 'discount', categoryKey: 'home_local' })
    const cautionIds = clauses.filter((c) => c.tier === 'caution').map((c) => c.id)
    expect(cautionIds).toEqual([])
  })

  it('beauty_wellness emits one_treatment caution', () => {
    const clauses = buildClauseList({ type: 'discount', categoryKey: 'beauty_wellness' })
    expect(clauses.find((c) => c.id === 'one_treatment')?.label).toBe('One treatment per visit')
  })

  it('Freebie ALWAYS adds while_stocks (isFree) even when category flag is off', () => {
    const clauses = buildClauseList({ type: 'freebie', categoryKey: 'home_local', freeNeedsPurchase: false })
    expect(clauses.find((c) => c.id === 'while_stocks')?.label).toBe('While stocks last')
  })

  it('shopping (whileStocks flag) adds while_stocks on a non-freebie type', () => {
    const clauses = buildClauseList({ type: 'discount', categoryKey: 'shopping' })
    expect(clauses.some((c) => c.id === 'while_stocks')).toBe(true)
  })
})

describe('Discount minimum-spend restrictive term (S0 §2.5)', () => {
  it('adds disc_min_spend (Restrictive) when percent-kind has a minimum spend', () => {
    const clauses = buildClauseList({
      type: 'discount', categoryKey: 'home_local', discountKind: 'percent', discMin: 25,
    })
    const min = clauses.find((c) => c.id === 'disc_min_spend')
    expect(min?.tier).toBe('restrictive')
    expect(min?.label).toBe('Minimum spend of £25 applies')
  })

  it('omits disc_min_spend when no minimum spend', () => {
    const clauses = buildClauseList({ type: 'discount', categoryKey: 'home_local', discountKind: 'percent' })
    expect(clauses.some((c) => c.id === 'disc_min_spend')).toBe(false)
  })
})

describe('default-selected clauses on entering the build step (S0 §2.8)', () => {
  it('per type', () => {
    expect(defaultSelectedClauseIds('bogo')).toEqual([])
    expect(defaultSelectedClauseIds('spend')).toEqual(['spend_single', 'tell_staff', 'per_visit'])
    expect(defaultSelectedClauseIds('freebie')).toEqual(['one_free_item', 'tell_staff', 'per_visit'])
    expect(defaultSelectedClauseIds('package')).toEqual(['pkg_one_visit', 'pkg_together', 'tell_staff'])
    expect(defaultSelectedClauseIds('discount')).toEqual(['disc_total_bill', 'disc_one_visit', 'tell_staff'])
  })
})

describe('stacking counts + thresholds (S0 §4.5)', () => {
  it('counts caution / restrictive across selected clauses + custom terms', () => {
    const clauses = buildClauseList({ type: 'discount', categoryKey: 'food_drink' })
    const byId = new Map(clauses.map((c) => [c.id, c]))
    // pick: tell_staff (fair) + booking_rec (caution) + full_price (caution)
    const selected = ['tell_staff', 'booking_rec', 'full_price']
      .map((id) => byId.get(id)!)
      .filter(Boolean)
    const customs = [{ text: 'Minimum spend applies', tier: tierOf('Minimum spend applies') }]
    const counts = countTermTiers(selected, customs)
    expect(counts.cautionCount).toBe(2)
    expect(counts.restrictiveCount).toBe(1) // the custom
    expect(counts.totalTermsCount).toBe(4)
  })

  it('thresholds: becomingRestrictive vs tooRestrictive (S0 §4.5)', () => {
    // becomingRestrictive = restrictive>=1 OR total>=5 OR caution>=2
    expect(countTermTiers([], []).becomingRestrictive).toBe(false)
    // 2 caution -> becoming
    const twoCaution = countTermTiers(
      [
        { id: 'a', label: 'x', tier: 'caution' },
        { id: 'b', label: 'y', tier: 'caution' },
      ],
      [],
    )
    expect(twoCaution.becomingRestrictive).toBe(true)
    expect(twoCaution.tooRestrictive).toBe(false)
    // 4 caution -> too restrictive
    const fourCaution = countTermTiers(
      [
        { id: 'a', label: 'x', tier: 'caution' },
        { id: 'b', label: 'y', tier: 'caution' },
        { id: 'c', label: 'z', tier: 'caution' },
        { id: 'd', label: 'w', tier: 'caution' },
      ],
      [],
    )
    expect(fourCaution.tooRestrictive).toBe(true)
    // 2 restrictive -> too restrictive
    const twoRestrictive = countTermTiers(
      [
        { id: 'a', label: 'x', tier: 'restrictive' },
        { id: 'b', label: 'y', tier: 'restrictive' },
      ],
      [],
    )
    expect(twoRestrictive.tooRestrictive).toBe(true)
  })
})
