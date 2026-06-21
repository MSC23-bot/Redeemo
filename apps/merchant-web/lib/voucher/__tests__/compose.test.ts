import {
  composeTitle,
  composeDescription,
  deriveSaving,
  deriveSavingPercent,
  TITLE_CHAR_LIMIT,
  DESC_CHAR_LIMIT,
  type DraftFields,
} from '@/lib/voucher/compose'

// M2 F5: title/description auto-compose + estimatedSaving derivation, ported VERBATIM
// from the S0 extraction (S0 §6).

const base: DraftFields = {
  type: 'discount',
  merchantBusinessName: 'The Old Foundry',
}

describe('char limits (S0 §6 / CC-12)', () => {
  it('title 60 / desc 300', () => {
    expect(TITLE_CHAR_LIMIT).toBe(60)
    expect(DESC_CHAR_LIMIT).toBe(300)
  })
})

describe('Discount compose (S0 §6.1)', () => {
  it('percent without min spend', () => {
    const f: DraftFields = { ...base, discountKind: 'percent', discPercent: 20 }
    expect(composeTitle(f)).toBe('20% off')
    expect(composeDescription(f)).toBe('Get 20% off your order with this voucher. A simple saving when you visit.')
  })

  it('percent with min spend', () => {
    const f: DraftFields = { ...base, discountKind: 'percent', discPercent: 20, discMin: 25 }
    expect(composeTitle(f)).toBe('20% off when you spend £25')
    expect(composeDescription(f)).toBe(
      'Get 20% off your order with this voucher. Valid when you spend £25 or more. A simple saving when you visit.',
    )
  })

  it('fixed', () => {
    const f: DraftFields = { ...base, discountKind: 'fixed', discAmount: 10 }
    expect(composeTitle(f)).toBe('£10 off')
    expect(composeDescription(f)).toBe('Get £10 off your order with this voucher. A simple saving when you visit.')
  })
})

describe('Spend & save compose (S0 §6.2)', () => {
  it('title + desc', () => {
    const f: DraftFields = { ...base, type: 'spend', spendAmount: 30, spendSave: 8 }
    expect(composeTitle(f)).toBe('Spend £30, Save £8')
    expect(composeDescription(f)).toBe('Spend £30 or more in a single visit and save £8. A little extra for treating yourself.')
  })

  it('defaults spend 30 / save 8 when blank', () => {
    const f: DraftFields = { ...base, type: 'spend' }
    expect(composeTitle(f)).toBe('Spend £30, Save £8')
  })
})

describe('Freebie compose (S0 §6.3)', () => {
  it('needs purchase', () => {
    const f: DraftFields = { ...base, type: 'freebie', freeItem: 'A coffee', freeNeedsPurchase: true, freeQualify: 'Any breakfast' }
    expect(composeTitle(f)).toBe('Free coffee with any breakfast')
    expect(composeDescription(f)).toBe('Get a free coffee when you buy any breakfast. A little treat on us when you visit.')
  })

  it('standalone', () => {
    const f: DraftFields = { ...base, type: 'freebie', freeItem: 'A coffee', freeNeedsPurchase: false }
    expect(composeTitle(f)).toBe('Free coffee')
    expect(composeDescription(f)).toBe('Enjoy a free coffee on us. Just show this voucher when you visit.')
  })
})

describe('Package compose (S0 §6.4)', () => {
  it('with items + saving', () => {
    const f: DraftFields = { ...base, type: 'package', packageItems: 'a starter, main and dessert', packagePrice: 25, packageNormal: 35 }
    expect(composeTitle(f)).toBe('A starter, main and dessert for £25')
    expect(composeDescription(f)).toBe(
      'Get a starter, main and dessert together for £25, normally £35. That is £10 saved when you take them as a set.',
    )
  })

  it('no items + no saving', () => {
    const f: DraftFields = { ...base, type: 'package', packagePrice: 40, packageNormal: 40 }
    expect(composeTitle(f)).toBe('A bundle for £40')
    expect(composeDescription(f)).toBe('Get the whole bundle together for £40. Everything in one simple price.')
  })
})

describe('BOGO compose (S0 §6.5)', () => {
  it('no entries', () => {
    const f: DraftFields = { ...base, type: 'bogo' }
    expect(composeTitle(f)).toBe('Buy one, get one free')
  })

  it('same-kind free item', () => {
    const f: DraftFields = { ...base, type: 'bogo', bogoBuy: 'A main', bogoFree: 'A second of the same item' }
    expect(composeTitle(f)).toBe('Buy one main, get one free')
  })

  it('desc names the merchant', () => {
    const f: DraftFields = { ...base, type: 'bogo', bogoBuy: 'A main', bogoFree: 'A second item' }
    expect(composeDescription(f)).toContain('at The Old Foundry')
    expect(composeDescription(f)).toContain('the cheaper one is free')
  })
})

describe('estimatedSaving derivation (S0 §6.8)', () => {
  it('Spend & save = the save field', () => {
    expect(deriveSaving({ ...base, type: 'spend', spendSave: 8 })).toBe(8)
  })

  it('Freebie = the worth field; savingPercent 100', () => {
    expect(deriveSaving({ ...base, type: 'freebie', freeWorth: 6 })).toBe(6)
    expect(deriveSavingPercent({ ...base, type: 'freebie', freeWorth: 6 })).toBe(100)
  })

  it('Package = max(0, normal - price)', () => {
    expect(deriveSaving({ ...base, type: 'package', packagePrice: 25, packageNormal: 35 })).toBe(10)
    expect(deriveSaving({ ...base, type: 'package', packagePrice: 40, packageNormal: 30 })).toBe(0)
  })

  it('Discount fixed = the amount; percent = round((pct/100) * ref)', () => {
    expect(deriveSaving({ ...base, type: 'discount', discountKind: 'fixed', discAmount: 10 })).toBe(10)
    // percent with min spend -> ref = min
    expect(deriveSaving({ ...base, type: 'discount', discountKind: 'percent', discPercent: 20, discMin: 25 })).toBe(5)
    // percent without min spend -> ref = typical order
    expect(deriveSaving({ ...base, type: 'discount', discountKind: 'percent', discPercent: 20, discTypicalOrder: 50 })).toBe(10)
  })

  it('BOGO = the free item full price (editable)', () => {
    expect(deriveSaving({ ...base, type: 'bogo', bogoFreePrice: 12 })).toBe(12)
  })

  it('savingPercent caps at 100', () => {
    expect(deriveSavingPercent({ ...base, type: 'spend', spendAmount: 10, spendSave: 20 })).toBe(100)
  })
})
