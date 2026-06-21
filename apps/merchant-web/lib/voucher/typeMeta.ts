// M2 F5: the type-picker meta + the redemption-cycle primer copy (S0 §1.3 + §8).
//
// CC-3 (LOCKED): the flagship picker enumerates all 7 prototype types but only 5 are
// ELIGIBLE (BOGO recommended, Spend & save, Discount, Freebie, Package deal).
// Time-limited + Reusable render as DISABLED cards with helper copy. The prototype
// let the merchant choose all 7; F5 adds the eligibility restriction. The backend
// create-flagship endpoint independently rejects ineligible types with
// VOUCHER_TYPE_NOT_ELIGIBLE (defence-in-depth).

import type { BuilderType } from './terms'
import type { CategoryKey } from './config'

export type PickerTypeId = BuilderType | 'time' | 'reusable'

export interface PickerTypeMeta {
  id: PickerTypeId
  label: string
  /** One-line "what it is" blurb on the picker card. */
  blurb: string
  eligible: boolean
  recommended?: boolean
  /** Shown on disabled (ineligible) cards. */
  disabledCopy?: string
  /** Accent colour (design-system voucher accents). */
  accent: string
}

const DISABLED_COPY =
  'Not available for your two flagship vouchers. You can create these as custom vouchers later.'

// In picker order (S0 §0 TYPES order). Accents per the design-system note.
export const PICKER_TYPES: PickerTypeMeta[] = [
  { id: 'bogo', label: 'Buy one, get one free', blurb: 'The easiest to understand and the strongest at bringing people in.', eligible: true, recommended: true, accent: '#7C3AED' },
  { id: 'spend', label: 'Spend & save', blurb: 'Reward customers who spend a little more in one visit.', eligible: true, accent: '#E84A00' },
  { id: 'discount', label: 'Discount', blurb: 'A straight saving off the price, fixed or a percentage.', eligible: true, accent: '#E20C04' },
  { id: 'freebie', label: 'Freebie', blurb: 'Give a free item, on its own or with a purchase.', eligible: true, accent: '#16A34A' },
  { id: 'package', label: 'Package deal', blurb: 'Bundle a few items together at one set price.', eligible: true, accent: '#2563EB' },
  { id: 'time', label: 'Time limited', blurb: 'A saving on your quieter days or hours.', eligible: false, disabledCopy: DISABLED_COPY, accent: '#D97706' },
  { id: 'reusable', label: 'Reusable', blurb: 'A small offer customers can come back and use again.', eligible: false, disabledCopy: DISABLED_COPY, accent: '#0D9488' },
]

export const ELIGIBLE_BUILDER_TYPES: BuilderType[] = ['bogo', 'spend', 'discount', 'freebie', 'package']

export function isEligiblePickerType(id: PickerTypeId): id is BuilderType {
  return (ELIGIBLE_BUILDER_TYPES as PickerTypeId[]).includes(id)
}

// Builder type (+ discount kind) -> backend VoucherType enum (the create-flagship
// body). Discount maps to PERCENT by default (the prototype default kind), FIXED when
// the merchant chose the fixed kind.
export function builderTypeToEnum(type: BuilderType, discountKind: 'fixed' | 'percent' = 'percent'): string {
  switch (type) {
    case 'bogo':
      return 'BOGO'
    case 'spend':
      return 'SPEND_AND_SAVE'
    case 'freebie':
      return 'FREEBIE'
    case 'package':
      return 'PACKAGE_DEAL'
    case 'discount':
      return discountKind === 'fixed' ? 'DISCOUNT_FIXED' : 'DISCOUNT_PERCENT'
    default:
      return 'BOGO'
  }
}

export function enumToBuilderType(enumType: string): BuilderType {
  switch (enumType) {
    case 'BOGO':
      return 'bogo'
    case 'SPEND_AND_SAVE':
      return 'spend'
    case 'FREEBIE':
      return 'freebie'
    case 'PACKAGE_DEAL':
      return 'package'
    case 'DISCOUNT_FIXED':
    case 'DISCOUNT_PERCENT':
      return 'discount'
    default:
      return 'bogo'
  }
}

// --- Per-category examples (S0 §1.3 EXAMPLE_BY_CAT, eligible types only) ------
type ExampleType = BuilderType
const EXAMPLE_BY_CAT: Partial<Record<CategoryKey, Record<ExampleType, string>>> = {
  food_drink: { discount: '20% off your bill', bogo: 'Buy one main, get one free', freebie: 'A free coffee with any breakfast', spend: 'Spend £30, save £8', package: 'Three courses for £25' },
  beauty_wellness: { discount: '20% off your treatment', bogo: 'Buy one treatment, get one free', freebie: 'A free add on with any treatment', spend: 'Spend £50, save £10', package: 'A cut and blow dry for £35' },
  health_fitness: { discount: '20% off your membership', bogo: 'Buy one class, get one free', freebie: 'A free guest pass with any class', spend: 'Spend £40, save £10', package: 'Five classes for £40' },
  shopping: { discount: '20% off your order', bogo: 'Buy one item, get one free', freebie: 'A free gift with any purchase', spend: 'Spend £50, save £10', package: 'Three items for £25' },
  home_local: { discount: '20% off your first job', bogo: 'Buy one service, get one free', freebie: 'A free callout with any booking', spend: 'Spend £100, save £20', package: 'A full service for £80' },
  travel_hotels: { discount: '20% off your stay', bogo: 'Buy one night, get one free', freebie: 'A free room upgrade with any stay', spend: 'Spend £150, save £30', package: 'Two nights and breakfast for £180' },
  out_about: { discount: '20% off your ticket', bogo: 'Buy one ticket, get one free', freebie: 'A free entry with any activity', spend: 'Spend £40, save £10', package: 'Entry and an activity for £25' },
  auto_garage: { discount: '20% off your service', bogo: 'Buy one wash, get one free', freebie: 'A free check with any service', spend: 'Spend £100, save £20', package: 'A service and wash for £80' },
  pet_services: { discount: '20% off your groom', bogo: 'Buy one groom, get one free', freebie: 'A free nail trim with any groom', spend: 'Spend £40, save £10', package: 'A groom and nail trim for £35' },
  family_kids: { discount: '20% off your entry', bogo: 'Buy one entry, get one free', freebie: 'A free activity with any entry', spend: 'Spend £30, save £8', package: 'Entry and a class for £20' },
  health_medical: { discount: '20% off your consultation', bogo: 'Buy one check, get one free', freebie: 'A free consultation with any check', spend: 'Spend £80, save £20', package: 'A consultation and check for £60' },
}

const EXAMPLE_FALLBACK: Record<ExampleType, string> = {
  discount: 'A clear saving on your most popular item',
  bogo: 'Buy one, get one free',
  freebie: 'A free item with any purchase',
  spend: 'Spend a little more, save a set amount',
  package: 'A few of your items bundled for one price',
}

export function exampleFor(key: CategoryKey, type: ExampleType): string {
  return (EXAMPLE_BY_CAT[key] ?? EXAMPLE_FALLBACK)[type] ?? EXAMPLE_FALLBACK[type]
}

// --- Primer copy (S0 §8) -----------------------------------------------------
export const PRIMER = {
  pickerHeader: 'Choose your flagship voucher',
  pickerSub:
    'This is the voucher that brings new customers through your door. Most businesses start with Buy one get one: it is the easiest for customers to understand and the strongest at bringing people in.',
  primerHeading: 'How Redeemo vouchers work',
  primerSub: 'A quick primer before you build, so it all makes sense.',
  mostImportantRule: 'The most important rule',
  cycleHeadline: 'Each customer can use a voucher once a month, during their redemption cycle.',
  cycleBody:
    'Once they use it, it is inactive for them until the next month. That protects your margin, your regulars keep paying full price, and Redeemo brings you new faces rather than constant giveaways.',
  howRedeemoWorks: [
    'Customers find your voucher on the Redeemo app and website, and redeem it in person at your branch.',
    'You write the offer. We help keep it strong enough to bring people in and fair enough not to let anyone down.',
    'Want a hand? Our team can help you build your offer, and you always approve it before it goes live.',
  ],
} as const
