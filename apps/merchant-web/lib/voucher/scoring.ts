// M2 F5: the "How this voucher stacks up" ADVISORY scoring engine, ported VERBATIM
// from the S0 extraction (S0 §4 + §7).
//
// CC-1 (LOCKED): the score is ADVISORY, NOT a submit gate. A "Too weak" voucher can
// still be saved/submitted. The £5 floor is a scoring INPUT only; admin review is the
// quality backstop. This module computes the score + feedback lists; it MUST NOT be
// wired to block submit. See the page/component wiring + the CC-1 page test.
//
// All meter/strengths/improvements derive from ONE fact set (S0 §7.3) so they can
// never disagree.

import { type Clause, type CustomTerm, countTermTiers } from './terms'

export type ScoreType = 'bogo' | 'spend' | 'discount' | 'freebie' | 'package'

export interface ScoreInput {
  type: ScoreType
  /** The estimated saving in GBP. */
  savingValue: number
  /** The saving as a percent share of the relevant full price (0-100). */
  savingPercent: number
  previewTitle: string
  previewDesc: string
  /** true when the description is still the auto-suggested text (not edited). */
  descUntouched: boolean
  /** true when a REAL image was uploaded (the default banner does not count). */
  hasPhoto: boolean
  /** Freebie with no qualifying purchase. */
  freeStandalone: boolean
  /** Reusable redeemed once a day or more often (flagship-ineligible; always false here). */
  reuseFrequent: boolean
  selectedClauses: Clause[]
  customs: CustomTerm[]
}

export type CalKey = 'weak' | 'good' | 'great'

export interface ScoreResult {
  calKey: CalKey
  label: string
  desc: string
  // Inputs surfaced for tests + UI.
  belowMinSaving: boolean
  tooRestrictive: boolean
  becomingRestrictive: boolean
  improveCount: number
  isGenerous: boolean
  titleClear: boolean
  descHelpful: boolean
  strengths: string[]
  improvements: string[]
  /** The meter order, fixed (S0 §4.1). */
  meter: CalKey[]
}

// S0 §4.7: motivational platform-framing line (no real data).
export const PLATFORM_FRAMING =
  'The score compares this offer to similar businesses on Redeemo, so yours stands out where it counts.'

const CAL_LABEL: Record<CalKey, string> = { weak: 'Too weak', good: 'Good', great: 'Great' }

function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

export function scoreVoucher(input: ScoreInput): ScoreResult {
  const {
    type, savingValue, savingPercent, previewTitle, previewDesc, descUntouched,
    hasPhoto, freeStandalone, reuseFrequent, selectedClauses, customs,
  } = input

  const isSpend = type === 'spend'
  const isPackage = type === 'package'
  const isFree = type === 'freebie'
  const isDiscount = type === 'discount'

  // --- S0 §4.4 inputs --------------------------------------------------------
  const titleClear = previewTitle.length >= 8 || /\d+%\s*off|£\d+\s*off/i.test(previewTitle)
  const descHelpful = previewDesc.length >= 30 && !descUntouched

  // --- S0 §4.3 generosity ----------------------------------------------------
  const generousAbsolute = isSpend || isPackage
    ? false
    : isFree
      ? savingValue >= 10
      : savingValue >= 15 // BOGO + Discount (time-limited is flagship-ineligible)
  const generousRelative = isFree
    ? false
    : isSpend || isPackage || isDiscount
      ? savingPercent >= 20
      : savingPercent >= 40 // BOGO
  const isGenerous =
    (freeStandalone && savingValue > 0) ||
    (reuseFrequent && savingValue >= 5) ||
    (savingValue >= 5 && (generousAbsolute || generousRelative))

  // --- S0 §4.2 belowMinSaving + stacking -------------------------------------
  const belowMinSaving = savingValue < 5 && !freeStandalone
  const counts = countTermTiers(selectedClauses, customs)
  const restrictiveOn = counts.becomingRestrictive

  // --- S0 §7 feedback (computed FIRST so improveCount drives the tier) --------
  const strengthsAll = buildStrengths(input, { isGenerous, belowMinSaving, restrictiveOn, counts, titleClear, descHelpful, hasPhoto })
  const improvementsAll = buildImprovements(input, { isGenerous, belowMinSaving, restrictiveOn, counts, titleClear, descHelpful, hasPhoto })
  const improveCount = improvementsAll.length // FULL count before the cap (S0 §7.2)

  // --- S0 §4.2 tier decision -------------------------------------------------
  const calWeak = belowMinSaving || counts.tooRestrictive || improveCount >= 4
  const calGreat =
    !calWeak && improveCount === 0 && isGenerous && !restrictiveOn && counts.totalTermsCount <= 3
  const calKey: CalKey = calWeak ? 'weak' : calGreat ? 'great' : 'good'

  const desc = tierDesc(calKey, { belowMinSaving, tooRestrictive: counts.tooRestrictive, improveCount })

  return {
    calKey,
    label: CAL_LABEL[calKey],
    desc,
    belowMinSaving,
    tooRestrictive: counts.tooRestrictive,
    becomingRestrictive: counts.becomingRestrictive,
    improveCount,
    isGenerous,
    titleClear,
    descHelpful,
    strengths: strengthsAll.slice(0, 4),
    improvements: improvementsAll.slice(0, 4),
    meter: ['weak', 'good', 'great'],
  }
}

// S0 §4.1 tier desc copy.
function tierDesc(
  key: CalKey,
  ctx: { belowMinSaving: boolean; tooRestrictive: boolean; improveCount: number },
): string {
  if (key === 'weak') {
    if (ctx.tooRestrictive) {
      return 'Your offer is too restrictive to score well. Drop a term or two so customers can actually redeem.'
    }
    if (ctx.belowMinSaving) {
      return "Below Redeemo's £5 minimum saving. Make it more generous so it is worth a customer's trip."
    }
    return 'This offer needs work before it is ready. Clear the points below to lift it out of Too weak.'
  }
  if (key === 'good') {
    return ctx.improveCount > 0
      ? 'A solid offer. Address the points below to reach Great.'
      : 'A solid offer.'
  }
  return 'Great offer. Customers will love this.'
}

interface FeedbackCtx {
  isGenerous: boolean
  belowMinSaving: boolean
  restrictiveOn: boolean
  counts: ReturnType<typeof countTermTiers>
  titleClear: boolean
  descHelpful: boolean
  hasPhoto: boolean
}

// S0 §7.1 strengths.
function buildStrengths(input: ScoreInput, ctx: FeedbackCtx): string[] {
  const { type, savingValue, savingPercent, freeStandalone } = input
  const out: string[] = []
  const save = money(savingValue)
  const pct = Math.round(savingPercent)

  if (ctx.isGenerous) {
    if (type === 'spend') {
      out.push(`A generous £${save} back on a £${spendTotal(input)} spend, about ${pct}%`)
    } else if (type === 'package') {
      out.push(`A generous £${save} off the £${packageTotal(input)} normal total, about ${pct}%`)
    } else if (type === 'freebie' && freeStandalone) {
      out.push(`A free item on its own, worth £${save}. That is a generous, easy yes for customers`)
    } else if (type === 'freebie') {
      out.push(`A generous free item worth £${save}`)
    } else {
      const total = otherTotal(input)
      out.push(total > 0 ? `A generous £${save} saving (about ${pct}% off £${money(total)})` : `A generous £${save} saving`)
    }
  } else if (savingValue >= 5) {
    out.push(
      type === 'freebie'
        ? `A free item worth £${save}, above our £5 minimum`
        : `A £${save} saving, above our £5 minimum`,
    )
  }

  if (ctx.titleClear) out.push('A clear, easy title')
  if (ctx.descHelpful) out.push('A helpful description in your own voice')
  if (ctx.hasPhoto) out.push('A real photo, not a placeholder')
  if (!ctx.restrictiveOn && ctx.counts.totalTermsCount <= 3) out.push('Few, fair terms')

  return out
}

// S0 §7.2 improvements.
function buildImprovements(input: ScoreInput, ctx: FeedbackCtx): string[] {
  const { type, savingValue, savingPercent, previewDesc, descUntouched } = input
  const out: string[] = []
  const save = money(savingValue)
  const pct = Math.round(savingPercent)

  if (ctx.belowMinSaving) {
    out.push('Raise the saving to at least £5')
  } else if (!ctx.isGenerous && savingValue >= 5) {
    // Low share (above floor but low %).
    if (type === 'spend') {
      out.push(`Improve the saving. £${save} back on a £${spendTotal(input)} spend is ${pct}%; a bigger share reads as Great.`)
    } else if (type === 'package') {
      out.push(`Improve the saving. £${save} off a £${packageTotal(input)} normal total is ${pct}%; a bigger share reads as Great.`)
    } else {
      out.push(`Lift the saving a little. ${pct}% off £${money(otherTotal(input))} is fine, but a more generous cut reads as Great.`)
    }
  }

  if (!ctx.titleClear) out.push('Write a clearer title')

  if (!ctx.descHelpful) {
    out.push(
      previewDesc.length === 0
        ? 'Add a short description that sells the offer'
        : descUntouched
          ? 'Make the description your own. Add a line about why customers will love it, or a detail only you would know.'
          : 'Add a short description that sells the offer',
    )
  }

  if (!ctx.hasPhoto) out.push('Add a photo so your offer stands out to customers')

  if (ctx.restrictiveOn) out.push('Drop or ease the restrictive term')
  if (ctx.counts.tooManyTerms) out.push(`Trim the terms. You have ${ctx.counts.totalTermsCount}; three or fewer reads cleaner.`)

  return out
}

// Derive the "total" the saving is a share of, for the feedback copy. These mirror
// the S0 savingPercent derivation per type; when only savingValue + savingPercent are
// known the total is reconstructed as save / (pct/100).
function reconstructTotal(savingValue: number, savingPercent: number): number {
  if (savingPercent <= 0) return 0
  return Math.round((savingValue / (savingPercent / 100)) * 100) / 100
}
function spendTotal(input: ScoreInput): string {
  return money(reconstructTotal(input.savingValue, input.savingPercent))
}
function packageTotal(input: ScoreInput): string {
  return money(reconstructTotal(input.savingValue, input.savingPercent))
}
function otherTotal(input: ScoreInput): number {
  return reconstructTotal(input.savingValue, input.savingPercent)
}
