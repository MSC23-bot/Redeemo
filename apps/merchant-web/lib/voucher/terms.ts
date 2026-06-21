// M2 F5: the terms engine, ported VERBATIM from the S0 extraction (S0 §2).
//
// Three pools assemble per type:
//   - the universal CORE (3 Fair terms, S0 §2.2 / CC-2 - exactly 3, not 4)
//   - the per-type FAIR terms (S0 §2.3, mechanic-specific)
//   - the category-conditional CAUTION terms (S0 §2.4, driven by the §2.6 flags)
//   - the Discount-percent minimum-spend RESTRICTIVE term (S0 §2.5)
// plus "add your own" custom terms (auto-tagged via the restrictive-word regex).

import { CATEGORY_DATA, type CategoryKey } from './config'

export type Tier = 'fair' | 'caution' | 'restrictive'

export interface Clause {
  id: string
  label: string
  tier: Tier
}

export type BuilderType = 'bogo' | 'spend' | 'discount' | 'freebie' | 'package'

// S0 §2.1: fair shows NO badge; caution + restrictive show their badge text.
export const tierBadge: Record<Tier, string> = {
  fair: '',
  caution: 'Caution',
  restrictive: 'Restrictive',
}

// S0 §2.1 restrictive-word regex for custom "add your own" terms.
const RESTRICTIVE_WORDS =
  /minimum|only|excludes?|not valid|after \d|before \d|weekday|weekend|peak|restrict|members? only/i

export function isRestrictiveText(text: string): boolean {
  return RESTRICTIVE_WORDS.test(text)
}

// S0 §2.1: custom terms are NEVER auto-tagged fair - restrictive-by-words or caution.
export function tierOf(text: string): Tier {
  return isRestrictiveText(text) ? 'restrictive' : 'caution'
}

export const CUSTOM_CHAR_LIMIT = 80

// --- The universal core (S0 §2.2) --------------------------------------------
const CORE: Clause[] = [
  { id: 'tell_staff', label: 'Tell the staff you are using a Redeemo voucher before you order or pay', tier: 'fair' },
  { id: 'no_combine', label: 'Not valid with any other voucher', tier: 'fair' },
  { id: 'per_visit', label: 'One voucher per customer each visit', tier: 'fair' },
]

export interface ClauseBuildInput {
  type: BuilderType
  categoryKey: CategoryKey
  /** Spend & save: the live spend amount (defaults 30 in the term copy). */
  spendAmt?: number
  /** Freebie: whether the free item needs a qualifying purchase. */
  freeNeedsPurchase?: boolean
  /** Discount: 'fixed' | 'percent'. */
  discountKind?: 'fixed' | 'percent'
  /** Discount: the minimum spend (only the percent branch surfaces disc_min_spend). */
  discMin?: number
}

// S0 §2.4 + §2.6: the category-conditional caution pool, driven by the per-category
// `terms` flags. The Freebie mechanic ALWAYS adds while_stocks (isFree).
function categoryCaution(categoryKey: CategoryKey, isFree: boolean): Clause[] {
  const flags = (CATEGORY_DATA[categoryKey] ?? CATEGORY_DATA.CATEGORY_FALLBACK).terms
  const out: Clause[] = []
  if (flags.booking) {
    out.push({ id: 'booking_rec', label: 'Booking recommended', tier: 'caution' })
    out.push({ id: 'booking_req', label: 'Advance booking required', tier: 'caution' })
  }
  if (flags.fullPrice) out.push({ id: 'full_price', label: 'Valid on full price items only', tier: 'caution' })
  if (flags.dineIn) out.push({ id: 'dine_in', label: 'Dine in only', tier: 'caution' })
  if (flags.whileStocks || isFree) out.push({ id: 'while_stocks', label: 'While stocks last', tier: 'caution' })
  if (flags.subjectAvail) out.push({ id: 'subject_avail', label: 'Subject to availability', tier: 'caution' })
  if (flags.oneTreatment) out.push({ id: 'one_treatment', label: 'One treatment per visit', tier: 'caution' })
  return out
}

// S0 §2.7: per-type built-in clause ASSEMBLY (in order).
export function buildClauseList(input: ClauseBuildInput): Clause[] {
  const { type, categoryKey, spendAmt, freeNeedsPurchase, discountKind, discMin } = input
  const isFood = categoryKey === 'food_drink'
  const isFreebie = type === 'freebie'
  const baseCaution = categoryCaution(categoryKey, isFreebie)

  if (type === 'bogo') {
    const bogoFair: Clause = { id: 'same_transaction', label: 'Both items must be in the same transaction', tier: 'fair' }
    return [...CORE, bogoFair, ...baseCaution]
  }

  if (type === 'spend') {
    const amt = typeof spendAmt === 'number' && spendAmt > 0 ? spendAmt : 30
    const single: Clause = { id: 'spend_single', label: `Spend £${amt} or more in a single visit`, tier: 'fair' }
    const service: Clause = { id: 'before_service', label: 'Worked out before any service charge', tier: 'fair' }
    return [single, ...CORE, service, ...baseCaution]
  }

  if (type === 'freebie') {
    const one: Clause = { id: 'one_free_item', label: 'One free item per visit', tier: 'fair' }
    const qualify: Clause = { id: 'with_qualifying', label: 'With any qualifying purchase', tier: 'fair' }
    return freeNeedsPurchase
      ? [one, qualify, ...CORE, ...baseCaution]
      : [one, ...CORE, ...baseCaution]
  }

  if (type === 'package') {
    const oneVisit: Clause = {
      id: 'pkg_one_visit',
      label: isFood ? 'The package is for one table or visit' : 'The package is for one visit',
      tier: 'fair',
    }
    const together: Clause = { id: 'pkg_together', label: 'All items in the package are taken together', tier: 'fair' }
    const beforeService: Clause = { id: 'pkg_before_service', label: 'Worked out before any service charge', tier: 'fair' }
    const pkgTerms =
      categoryKey === 'food_drink' || categoryKey === 'travel_hotels'
        ? [oneVisit, together, beforeService]
        : [oneVisit, together]
    return [...pkgTerms, ...CORE, ...baseCaution]
  }

  // discount
  const totalBill: Clause = {
    id: 'disc_total_bill',
    label: isFood ? 'Valid on your total bill' : 'Valid on your total order',
    tier: 'fair',
  }
  const onePerVisit: Clause = { id: 'disc_one_visit', label: 'One discount per visit', tier: 'fair' }
  const hasPercentMin = discountKind === 'percent' && typeof discMin === 'number' && discMin > 0
  const discTerms = hasPercentMin
    ? [
        totalBill,
        onePerVisit,
        { id: 'disc_min_spend', label: `Minimum spend of £${discMin} applies`, tier: 'restrictive' as const },
      ]
    : [totalBill, onePerVisit]
  return [...discTerms, ...CORE, ...baseCaution]
}

// S0 §2.8: per-type default-selected clause ids (pre-ticked on the build step).
export function defaultSelectedClauseIds(type: BuilderType): string[] {
  switch (type) {
    case 'bogo':
      return []
    case 'spend':
      return ['spend_single', 'tell_staff', 'per_visit']
    case 'freebie':
      return ['one_free_item', 'tell_staff', 'per_visit']
    case 'package':
      return ['pkg_one_visit', 'pkg_together', 'tell_staff']
    case 'discount':
      return ['disc_total_bill', 'disc_one_visit', 'tell_staff']
    default:
      return []
  }
}

export interface CustomTerm {
  text: string
  tier: Tier
}

export interface TermCounts {
  cautionCount: number
  restrictiveCount: number
  totalTermsCount: number
  becomingRestrictive: boolean
  tooRestrictive: boolean
  tooManyTerms: boolean
}

// S0 §4.5: count tiers across selected built-in clauses + custom terms, then derive
// the stacking thresholds verbatim.
export function countTermTiers(selected: Clause[], customs: CustomTerm[]): TermCounts {
  let cautionCount = 0
  let restrictiveCount = 0
  for (const c of selected) {
    if (c.tier === 'caution') cautionCount += 1
    else if (c.tier === 'restrictive') restrictiveCount += 1
  }
  for (const c of customs) {
    if (c.tier === 'caution') cautionCount += 1
    else if (c.tier === 'restrictive') restrictiveCount += 1
  }
  const totalTermsCount = selected.length + customs.length
  const becomingRestrictive = restrictiveCount >= 1 || totalTermsCount >= 5 || cautionCount >= 2
  const tooRestrictive = restrictiveCount >= 2 || totalTermsCount >= 7 || cautionCount >= 4
  const tooManyTerms = totalTermsCount >= 5
  return { cautionCount, restrictiveCount, totalTermsCount, becomingRestrictive, tooRestrictive, tooManyTerms }
}
