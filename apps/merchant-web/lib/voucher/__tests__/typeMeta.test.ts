import {
  PICKER_TYPES,
  ELIGIBLE_BUILDER_TYPES,
  builderTypeToEnum,
  enumToBuilderType,
  exampleFor,
  PRIMER,
  type PickerTypeMeta,
} from '@/lib/voucher/typeMeta'

// M2 F5: the type-picker meta. CC-3 (LOCKED): 5 ELIGIBLE types (BOGO recommended)
// and Time-limited + Reusable DISABLED-with-copy. The prototype showed all 7
// selectable; F5 adds the eligibility restriction.

describe('CC-3: picker enumerates all 7 but only 5 are eligible', () => {
  it('lists 7 cards in order with BOGO recommended', () => {
    expect(PICKER_TYPES.map((t: PickerTypeMeta) => t.id)).toEqual([
      'bogo',
      'spend',
      'discount',
      'freebie',
      'package',
      'time',
      'reusable',
    ])
    const bogo = PICKER_TYPES.find((t) => t.id === 'bogo')!
    expect(bogo.recommended).toBe(true)
    expect(bogo.eligible).toBe(true)
  })

  it('time + reusable are NOT eligible and carry the disabled helper copy', () => {
    const time = PICKER_TYPES.find((t) => t.id === 'time')!
    const reusable = PICKER_TYPES.find((t) => t.id === 'reusable')!
    expect(time.eligible).toBe(false)
    expect(reusable.eligible).toBe(false)
    expect(time.disabledCopy).toContain('create these as custom vouchers later')
    expect(reusable.disabledCopy).toContain('create these as custom vouchers later')
  })

  it('the 5 eligible builder types', () => {
    expect(ELIGIBLE_BUILDER_TYPES).toEqual(['bogo', 'spend', 'discount', 'freebie', 'package'])
  })
})

describe('builder type <-> backend VoucherType enum mapping', () => {
  it('maps builder types (with discount kind) to the backend enum the create-flagship endpoint expects', () => {
    expect(builderTypeToEnum('bogo')).toBe('BOGO')
    expect(builderTypeToEnum('spend')).toBe('SPEND_AND_SAVE')
    expect(builderTypeToEnum('freebie')).toBe('FREEBIE')
    expect(builderTypeToEnum('package')).toBe('PACKAGE_DEAL')
    // discount defaults to PERCENT (the default kind), or FIXED when specified
    expect(builderTypeToEnum('discount')).toBe('DISCOUNT_PERCENT')
    expect(builderTypeToEnum('discount', 'percent')).toBe('DISCOUNT_PERCENT')
    expect(builderTypeToEnum('discount', 'fixed')).toBe('DISCOUNT_FIXED')
  })

  it('maps a backend enum back to a builder type', () => {
    expect(enumToBuilderType('BOGO')).toBe('bogo')
    expect(enumToBuilderType('SPEND_AND_SAVE')).toBe('spend')
    expect(enumToBuilderType('DISCOUNT_PERCENT')).toBe('discount')
    expect(enumToBuilderType('DISCOUNT_FIXED')).toBe('discount')
    expect(enumToBuilderType('FREEBIE')).toBe('freebie')
    expect(enumToBuilderType('PACKAGE_DEAL')).toBe('package')
  })
})

describe('per-category examples (S0 §1.3)', () => {
  it('food_drink discount + bogo examples', () => {
    expect(exampleFor('food_drink', 'discount')).toBe('20% off your bill')
    expect(exampleFor('food_drink', 'bogo')).toBe('Buy one main, get one free')
  })

  it('falls back when category is unknown', () => {
    expect(exampleFor('CATEGORY_FALLBACK', 'bogo')).toBe('Buy one, get one free')
  })
})

describe('primer copy (S0 §8)', () => {
  it('the redemption-cycle rule', () => {
    expect(PRIMER.cycleHeadline).toBe(
      'Each customer can use a voucher once a month, during their redemption cycle.',
    )
    expect(PRIMER.pickerHeader).toBe('Choose your flagship voucher')
  })
})
