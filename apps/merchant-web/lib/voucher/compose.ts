// M2 F5: title/description auto-compose + estimatedSaving + savingPercent derivation,
// ported VERBATIM from the S0 extraction (S0 §6).
//
// The DraftFields model is the single per-type structured-field bag the builder owns.
// All of it is stored in the RMV's `merchantFields` JSON (the backend
// updateRmvVoucher merges the PATCH body into merchantFields; the top-level title /
// description / estimatedSaving / terms / imageUrl keys are ALSO merged into
// merchantFields by the core - see lib/api/voucher.ts for the reconciliation note).

import type { BuilderType } from './terms'

export const TITLE_CHAR_LIMIT = 60
export const DESC_CHAR_LIMIT = 300

export interface DraftFields {
  type: BuilderType
  merchantBusinessName?: string

  // BOGO
  bogoBuy?: string
  bogoBuyFullPrice?: number
  bogoFree?: string
  bogoFreePrice?: number

  // Spend & save
  spendAmount?: number
  spendSave?: number

  // Discount
  discountKind?: 'fixed' | 'percent'
  discAmount?: number
  discPercent?: number
  discTypicalOrder?: number
  discMin?: number

  // Freebie
  freeItem?: string
  freeWorth?: number
  freeNeedsPurchase?: boolean
  freeQualify?: string

  // Package
  packageItems?: string
  packagePrice?: number
  packageNormal?: number
}

// --- helpers (S0 §6) ---------------------------------------------------------
function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}
function lc(s: string): string {
  return s.length ? s.charAt(0).toLowerCase() + s.slice(1) : s
}
function cap(s: string): string {
  return s.length ? s.charAt(0).toUpperCase() + s.slice(1) : s
}
function noun(s: string): string {
  return s.replace(/^(a|an|any|the)\s+/i, '').trim()
}
function slice(s: string, limit: number): string {
  return s.length > limit ? s.slice(0, limit) : s
}

// "same kind" heuristic for BOGO free item (S0 §6.5).
function freeIsSame(freeText: string): boolean {
  return /\b(second|same|another|equal)\b/i.test(freeText)
}

// --- Title compose (S0 §6) ---------------------------------------------------
export function composeTitle(f: DraftFields): string {
  return slice(composeTitleRaw(f), TITLE_CHAR_LIMIT)
}

function composeTitleRaw(f: DraftFields): string {
  switch (f.type) {
    case 'discount': {
      if (f.discountKind === 'fixed') {
        const am = typeof f.discAmount === 'number' && f.discAmount > 0 ? f.discAmount : 10
        return f.discMin ? `£${money(am)} off when you spend £${money(f.discMin)}` : `£${money(am)} off`
      }
      const pc = typeof f.discPercent === 'number' && f.discPercent > 0 ? f.discPercent : 20
      return f.discMin ? `${pc}% off when you spend £${money(f.discMin)}` : `${pc}% off`
    }
    case 'spend': {
      const sa = typeof f.spendAmount === 'number' && f.spendAmount > 0 ? f.spendAmount : 30
      const sv = typeof f.spendSave === 'number' && f.spendSave > 0 ? f.spendSave : 8
      return `Spend £${money(sa)}, Save £${money(sv)}`
    }
    case 'freebie': {
      const itemN = f.freeItem ? noun(f.freeItem) : 'item'
      if (f.freeNeedsPurchase) {
        const qualPhrase = f.freeQualify ? lc(f.freeQualify) : 'any purchase'
        return `Free ${itemN} with ${qualPhrase}`
      }
      return `Free ${itemN}`
    }
    case 'package': {
      const pr = typeof f.packagePrice === 'number' && f.packagePrice > 0 ? f.packagePrice : 40
      const items = f.packageItems?.trim()
      return items ? `${cap(items)} for £${money(pr)}` : `A bundle for £${money(pr)}`
    }
    case 'bogo': {
      const buyNoun = f.bogoBuy ? noun(f.bogoBuy) : ''
      const freeNoun = f.bogoFree ? noun(f.bogoFree) : ''
      if (!f.bogoBuy && !f.bogoFree) return 'Buy one, get one free'
      const same = !f.bogoFree || freeIsSame(f.bogoFree)
      if (same) return `Buy one ${buyNoun || 'item'}, get one free`
      return `Buy a ${buyNoun || 'item'}, get a ${freeNoun || 'second'} free`
    }
    default:
      return ''
  }
}

// --- Description compose (S0 §6) ---------------------------------------------
export function composeDescription(f: DraftFields): string {
  return slice(composeDescriptionRaw(f), DESC_CHAR_LIMIT)
}

function composeDescriptionRaw(f: DraftFields): string {
  switch (f.type) {
    case 'discount': {
      const minClause = f.discMin ? ` Valid when you spend £${money(f.discMin)} or more.` : ''
      if (f.discountKind === 'fixed') {
        const am = typeof f.discAmount === 'number' && f.discAmount > 0 ? f.discAmount : 10
        return `Get £${money(am)} off your order with this voucher.${minClause} A simple saving when you visit.`
      }
      const pc = typeof f.discPercent === 'number' && f.discPercent > 0 ? f.discPercent : 20
      return `Get ${pc}% off your order with this voucher.${minClause} A simple saving when you visit.`
    }
    case 'spend': {
      const sa = typeof f.spendAmount === 'number' && f.spendAmount > 0 ? f.spendAmount : 30
      const sv = typeof f.spendSave === 'number' && f.spendSave > 0 ? f.spendSave : 8
      return `Spend £${money(sa)} or more in a single visit and save £${money(sv)}. A little extra for treating yourself.`
    }
    case 'freebie': {
      const itemN = f.freeItem ? noun(f.freeItem) : 'item'
      if (f.freeNeedsPurchase) {
        const qualPhrase = f.freeQualify ? lc(f.freeQualify) : 'any purchase'
        return `Get a free ${itemN} when you buy ${qualPhrase}. A little treat on us when you visit.`
      }
      return `Enjoy a free ${itemN} on us. Just show this voucher when you visit.`
    }
    case 'package': {
      const pr = typeof f.packagePrice === 'number' && f.packagePrice > 0 ? f.packagePrice : 40
      const items = f.packageItems?.trim()
      const normal = typeof f.packageNormal === 'number' ? f.packageNormal : 0
      const sv = Math.max(0, normal - pr)
      const lead = items ? `Get ${lc(items)} together for £${money(pr)}` : `Get the whole bundle together for £${money(pr)}`
      const tail =
        normal > pr
          ? `, normally £${money(normal)}. That is £${money(sv)} saved when you take them as a set.`
          : '. Everything in one simple price.'
      return `${lead}${tail}`
    }
    case 'bogo': {
      const buyPhrase = f.bogoBuy ? lc(f.bogoBuy) : 'an item'
      const same = !f.bogoFree || freeIsSame(f.bogoFree)
      const freePhrase = same ? 'a second one' : f.bogoFree ? lc(f.bogoFree) : 'an extra'
      const at = f.merchantBusinessName ? ` at ${f.merchantBusinessName}` : ''
      return `When you buy ${buyPhrase}, we will give you ${freePhrase} free${at}. If the two items are different prices, the cheaper one is free.`
    }
    default:
      return ''
  }
}

// --- estimatedSaving derivation (S0 §6.8) ------------------------------------
export function deriveSaving(f: DraftFields): number {
  switch (f.type) {
    case 'bogo':
      return num(f.bogoFreePrice)
    case 'spend':
      return num(f.spendSave)
    case 'freebie':
      return num(f.freeWorth)
    case 'package':
      return Math.max(0, num(f.packageNormal) - num(f.packagePrice))
    case 'discount':
      if (f.discountKind === 'fixed') return num(f.discAmount)
      // percent: round((pct/100) * ref), ref = min spend if set else typical order
      {
        const pct = num(f.discPercent)
        const ref = f.discMin ? num(f.discMin) : num(f.discTypicalOrder)
        return Math.round((pct / 100) * ref)
      }
    default:
      return 0
  }
}

// --- savingPercent (S0 §4.3) -------------------------------------------------
export function deriveSavingPercent(f: DraftFields): number {
  let pct = 0
  switch (f.type) {
    case 'bogo':
      pct = ratio(f.bogoFreePrice, sum(f.bogoBuyFullPrice, f.bogoFreePrice))
      break
    case 'spend':
      pct = ratio(f.spendSave, f.spendAmount)
      break
    case 'package': {
      const normal = num(f.packageNormal)
      pct = normal > 0 ? ratio(Math.max(0, normal - num(f.packagePrice)), normal) : 0
      break
    }
    case 'discount': {
      const ref = f.discMin ? num(f.discMin) : num(f.discTypicalOrder)
      pct = ratio(deriveSaving(f), ref)
      break
    }
    case 'freebie':
      pct = 100
      break
    default:
      pct = 0
  }
  return Math.min(100, Math.round(pct))
}

function num(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function sum(a: number | undefined, b: number | undefined): number {
  return num(a) + num(b)
}
function ratio(part: number | undefined, whole: number | undefined): number {
  const w = num(whole)
  if (w <= 0) return 0
  return (num(part) / w) * 100
}
