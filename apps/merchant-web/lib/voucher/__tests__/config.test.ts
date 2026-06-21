import {
  CATEGORY_DATA,
  CATEGORY_FALLBACK_KEY,
  FREE_QUAL_SUGGEST,
  PKG_ITEM_SUGGEST,
  PKG_ITEM_PLACEHOLDERS,
  resolveCategoryKey,
  buySuggestChips,
  freeBogoChips,
  freebieItemChips,
  freeQualifyChips,
  spendChips,
  saveChips,
  discountAmountChips,
  discountPercentChips,
  discountTypicalOrderChips,
  discountMinSpendChips,
  packageItemChips,
  packagePriceChips,
  packageNormalChips,
  packageItemPlaceholders,
  freebieWorthChips,
} from '@/lib/voucher/config'

// M2 F5: pure config map ported VERBATIM from the S0 extraction (S0 §1). These
// pin the chip lists per category x type so a value drift is caught by a test.

describe('resolveCategoryKey (top-level NAME -> S0 config key)', () => {
  it('maps the 11 top-level category names to their S0 keys', () => {
    expect(resolveCategoryKey('Food & Drink')).toBe('food_drink')
    expect(resolveCategoryKey('Beauty & Wellness')).toBe('beauty_wellness')
    expect(resolveCategoryKey('Health & Fitness')).toBe('health_fitness')
    expect(resolveCategoryKey('Out & About')).toBe('out_about')
    expect(resolveCategoryKey('Shopping')).toBe('shopping')
    expect(resolveCategoryKey('Home & Local Services')).toBe('home_local')
    expect(resolveCategoryKey('Travel & Hotels')).toBe('travel_hotels')
    expect(resolveCategoryKey('Health & Medical')).toBe('health_medical')
    expect(resolveCategoryKey('Family & Kids')).toBe('family_kids')
    expect(resolveCategoryKey('Auto & Garage')).toBe('auto_garage')
    expect(resolveCategoryKey('Pet Services')).toBe('pet_services')
  })

  it('falls back to the neutral key for an unknown / null name', () => {
    expect(resolveCategoryKey('Something Unknown')).toBe(CATEGORY_FALLBACK_KEY)
    expect(resolveCategoryKey(null)).toBe(CATEGORY_FALLBACK_KEY)
    expect(resolveCategoryKey(undefined)).toBe(CATEGORY_FALLBACK_KEY)
  })
})

describe('CATEGORY_DATA verbatim (S0 §1.1)', () => {
  it('food_drink chip amounts + bogoBuy + freebie', () => {
    const c = CATEGORY_DATA.food_drink
    expect(c.bogoBuy).toEqual(['A main', 'A hot drink', 'A starter'])
    expect(c.freebie).toEqual(['A side', 'A dessert', 'A hot drink'])
    expect(c.spendAmt).toEqual([15, 25, 40])
    expect(c.spendSave).toEqual([5, 8, 10])
  })

  it('beauty_wellness chip amounts', () => {
    const c = CATEGORY_DATA.beauty_wellness
    expect(c.spendAmt).toEqual([30, 50, 80])
    expect(c.spendSave).toEqual([5, 10, 15])
  })

  it('travel_hotels spendAmt', () => {
    expect(CATEGORY_DATA.travel_hotels.spendAmt).toEqual([50, 100, 200])
  })

  it('all 11 keys plus the fallback exist', () => {
    const keys = Object.keys(CATEGORY_DATA)
    expect(keys).toContain('food_drink')
    expect(keys).toContain('pet_services')
    expect(keys).toContain(CATEGORY_FALLBACK_KEY)
    expect(keys.length).toBe(12)
  })
})

describe('BOGO buy chips (S0 §1.2): literal "Any full price item" + category bogoBuy, capped at 4', () => {
  it('food_drink', () => {
    expect(buySuggestChips('food_drink')).toEqual([
      'Any full price item',
      'A main',
      'A hot drink',
      'A starter',
    ])
  })

  it('falls back for unknown', () => {
    expect(buySuggestChips('zzz' as never)).toEqual([
      'Any full price item',
      'A full price item',
      'An item',
      'A service',
    ])
  })
})

describe('BOGO free chips are FIXED (S0 §1.2 / CC-6)', () => {
  it('not category-driven', () => {
    expect(freeBogoChips()).toEqual([
      'A second of equal or lower value',
      'Another of the same item',
      'A second item',
    ])
  })
})

describe('Freebie chips (S0 §1.2)', () => {
  it('freebie item chips come from CATEGORY_DATA.freebie', () => {
    expect(freebieItemChips('food_drink')).toEqual(['A side', 'A dessert', 'A hot drink'])
  })

  it('freebie qualify chips come from FREE_QUAL_SUGGEST', () => {
    expect(freeQualifyChips('food_drink')).toEqual([
      'Any main',
      'Any meal',
      'A spend of £15 or more',
    ])
    expect(FREE_QUAL_SUGGEST.health_medical).toEqual([
      'Any consultation',
      'Any appointment',
      'A spend of £40 or more',
    ])
  })

  it('freebie qualify falls back when no map entry', () => {
    expect(freeQualifyChips('zzz' as never)).toEqual([
      'Any full price item',
      'Any purchase',
      'A spend of £25 or more',
    ])
  })

  it('freebie worth chips are FIXED [4, 6, 8]', () => {
    expect(freebieWorthChips()).toEqual([4, 6, 8])
  })
})

describe('Spend & save chips (S0 §1.2)', () => {
  it('spend + save come from CATEGORY_DATA', () => {
    expect(spendChips('food_drink')).toEqual([15, 25, 40])
    expect(saveChips('food_drink')).toEqual([5, 8, 10])
  })
})

describe('Discount chips are FIXED numeric, NOT category-keyed (S0 §1.2 / CC-4)', () => {
  it('amount/percent/typical/min', () => {
    expect(discountAmountChips()).toEqual([5, 10, 15])
    expect(discountPercentChips()).toEqual([10, 15, 20])
    expect(discountTypicalOrderChips()).toEqual([20, 30, 50])
    expect(discountMinSpendChips()).toEqual([15, 25, 40])
  })
})

describe('Package chips (S0 §1.2)', () => {
  it('item chips from PKG_ITEM_SUGGEST', () => {
    expect(packageItemChips('food_drink')).toEqual([
      'A starter, main and dessert',
      'Two mains and a side',
      'A sharing platter for two',
    ])
    expect(PKG_ITEM_SUGGEST.health_medical).toEqual([
      'A consultation and a follow up',
      'A check and a report',
    ])
  })

  it('item chips fall back', () => {
    expect(packageItemChips('zzz' as never)).toEqual([
      'A bundle of items',
      'Two things together',
      'A set',
    ])
  })

  it('package price + normal chips are FIXED', () => {
    expect(packagePriceChips()).toEqual([25, 40, 60])
    expect(packageNormalChips()).toEqual([35, 55, 80])
  })

  it('package list placeholders from PKG_ITEM_PLACEHOLDERS', () => {
    expect(packageItemPlaceholders('food_drink')).toEqual([
      'e.g. a starter',
      'e.g. a main',
      'e.g. a drink',
      'e.g. a side',
      'e.g. a dessert',
    ])
    expect(PKG_ITEM_PLACEHOLDERS.beauty_wellness?.[0]).toBe('e.g. a treatment')
  })

  it('placeholders fall back', () => {
    expect(packageItemPlaceholders('zzz' as never)).toEqual(['e.g. an item'])
  })
})
