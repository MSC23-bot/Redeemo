// Voucher Builder prototype-fidelity: pure copy + formatting helpers.
//
// PROVENANCE: ported from the Claude Design prototype source
//   docs/design/merchant-portal/voucher-builder-prototype-2026-07-13/Redeemo-for-Business.FULL.html
//   (the ~542KB app script) and reconciled against PROTOTYPE-INVENTORY.md addenda
//   A1-A14 (authoritative live-walk resolutions). Specific source line refs are cited
//   inline. These are the estimated-saving helper templates, the customer-preview
//   value/save lines, the schedule/interval formatters, and the title/description
//   schedule + cadence suffixes for the TIME_LIMITED / REUSABLE wrapper types.
//
// Pure (no React): the components consume these so copy stays in one testable place.

import type { DraftFields } from './compose'
import type { AvailabilityWindow } from '@/lib/api/voucher'

export function money(n: number): string {
  const r = Math.round(n * 100) / 100
  return r % 1 === 0 ? String(r) : r.toFixed(2)
}

function num(v: number | undefined): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : 0
}
function noun(s: string | undefined): string {
  return (s ?? '').replace(/^(a|an|any|the)\s+/i, '').trim()
}

// --- Day / time formatting (FULL.html fmtTime / fmtDays / windowLabel, ~L12073) --
//
// NB: the prototype indexes days Monday=0..Sunday=6 (DAYS_LONG). Our
// VoucherAvailabilityWindow.dayOfWeek is the JS convention Sunday=0..Saturday=6.
// These helpers take OUR convention and render/group Monday-first for parity with
// the prototype's "Monday to Friday" style summaries.
const DAY_LONG_BY_DOW: Record<number, string> = {
  0: 'Sunday', 1: 'Monday', 2: 'Tuesday', 3: 'Wednesday', 4: 'Thursday', 5: 'Friday', 6: 'Saturday',
}
// Monday-first ordering key (Mon=0 .. Sun=6) so runs group as the prototype does.
const MONDAY_FIRST_KEY: Record<number, number> = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4, 6: 5, 0: 6 }

export function fmtTime(hhmm: string): string {
  if (!hhmm) return ''
  const [hRaw, mRaw] = hhmm.split(':')
  const h = parseInt(hRaw, 10) || 0
  const m = parseInt(mRaw, 10) || 0
  const ap = h >= 12 ? 'pm' : 'am'
  let hh = h % 12
  if (hh === 0) hh = 12
  return m ? `${hh}:${String(m).padStart(2, '0')}${ap}` : `${hh}${ap}`
}

// Group a set of OUR day-of-week numbers into Monday-first runs, rendered long-form.
export function fmtDays(dows: number[]): string {
  const uniq = Array.from(new Set(dows))
  if (uniq.length === 0) return ''
  if (uniq.length === 7) return 'Every day'
  const sorted = uniq.sort((a, b) => MONDAY_FIRST_KEY[a] - MONDAY_FIRST_KEY[b])
  const runs: Array<[number, number]> = []
  let start = sorted[0]
  let prev = sorted[0]
  for (let i = 1; i < sorted.length; i++) {
    if (MONDAY_FIRST_KEY[sorted[i]] === MONDAY_FIRST_KEY[prev] + 1) {
      prev = sorted[i]
    } else {
      runs.push([start, prev])
      start = sorted[i]
      prev = sorted[i]
    }
  }
  runs.push([start, prev])
  return runs
    .map(([a, b]) =>
      a === b
        ? DAY_LONG_BY_DOW[a]
        : MONDAY_FIRST_KEY[b] === MONDAY_FIRST_KEY[a] + 1
          ? `${DAY_LONG_BY_DOW[a]} and ${DAY_LONG_BY_DOW[b]}`
          : `${DAY_LONG_BY_DOW[a]} to ${DAY_LONG_BY_DOW[b]}`,
    )
    .join(', ')
}

// A "grouped window": one open/close time shared across a run of days. Our storage is
// one row per (dayOfWeek, openTime, closeTime); we group rows that share the same
// open+close into a single labelled window for summaries + suffixes (FULL.html groups
// natively because its editor stores a days[] array per window).
export interface GroupedWindow {
  days: number[]
  openTime: string
  closeTime: string
}

export function groupWindows(windows: AvailabilityWindow[]): GroupedWindow[] {
  const byTime = new Map<string, GroupedWindow>()
  const order: string[] = []
  for (const w of windows) {
    const key = `${w.openTime}-${w.closeTime}`
    let g = byTime.get(key)
    if (!g) {
      g = { days: [], openTime: w.openTime, closeTime: w.closeTime }
      byTime.set(key, g)
      order.push(key)
    }
    if (!g.days.includes(w.dayOfWeek)) g.days.push(w.dayOfWeek)
  }
  return order.map((k) => byTime.get(k)!)
}

export function windowLabel(g: GroupedWindow): string {
  return `${fmtDays(g.days)}, ${fmtTime(g.openTime)} to ${fmtTime(g.closeTime)}`
}

// availabilitySummary: all grouped windows joined with "; " (A13). FULL.html ~L12083.
export function availabilitySummary(windows: AvailabilityWindow[]): string {
  return groupWindows(windows).map(windowLabel).join('; ')
}

function windowDurationHours(w: AvailabilityWindow): number {
  const [oh, om] = w.openTime.split(':').map((x) => parseInt(x, 10) || 0)
  const cRaw = w.closeTime === '24:00' ? '24:00' : w.closeTime
  const [ch, cm] = cRaw.split(':').map((x) => parseInt(x, 10) || 0)
  return (ch * 60 + cm - (oh * 60 + om)) / 60
}

// windowsValid / windowNarrow / windowsOk (FULL.html ~L12078-12082).
export interface WindowValidity {
  windowsValid: boolean
  windowNarrow: boolean
  windowsOk: boolean
}
export function windowValidity(windows: AvailabilityWindow[]): WindowValidity {
  const valid = windows.filter((w) => !!w.openTime && !!w.closeTime && windowDurationHours(w) > 0)
  const windowsValid = valid.length > 0
  const maxWinHours = valid.reduce((m, w) => Math.max(m, windowDurationHours(w)), 0)
  const windowNarrow = windowsValid && maxWinHours > 0 && maxWinHours < 2
  return { windowsValid, windowNarrow, windowsOk: windowsValid && !windowNarrow }
}

// --- Reusable interval text (FULL.html fmtInterval, ~L12358; floor 30 min) --------
// Our storage is cooldownSeconds; the prototype works in minutes.
export function fmtInterval(seconds: number): string {
  const min = Math.round(seconds / 60)
  if (min < 60) return `${min} minutes`
  if (min < 1440) {
    const h = min / 60
    return `${h % 1 === 0 ? h : h.toFixed(1)} hour${h === 1 ? '' : 's'}`
  }
  const d = min / 1440
  return `${d % 1 === 0 ? d : d.toFixed(1)} day${d === 1 ? '' : 's'}`
}

// --- Title / description wrapper suffixes -----------------------------------------
// TIME_LIMITED (FULL.html ~L12490): title gains ", {days} {from} to {to}" using
// Window 1 only (A13); description gains " Available {availabilitySummary}." across
// all windows.
export function scheduleTitleSuffix(windows: AvailabilityWindow[]): string {
  const groups = groupWindows(windows)
  if (groups.length === 0) return ''
  const w0 = groups[0]
  const daysTitle = w0.days.length === 1 ? `${DAY_LONG_BY_DOW[w0.days[0]]}s` : fmtDays(w0.days)
  return `, ${daysTitle} ${fmtTime(w0.openTime)} to ${fmtTime(w0.closeTime)}`
}
export function scheduleDescSuffix(windows: AvailabilityWindow[]): string {
  const summary = availabilitySummary(windows)
  return summary ? ` Available ${summary}.` : ''
}

// REUSABLE (FULL.html ~L12500): a 1-day interval reads "every day"; otherwise
// "every {interval}".
function cadenceText(seconds: number): string {
  const min = Math.round(seconds / 60)
  return min === 1440 ? 'every day' : `every ${fmtInterval(seconds)}`
}
export function reuseTitleSuffix(seconds: number): string {
  return `, available again ${cadenceText(seconds)}`
}
export function reuseDescSuffix(seconds: number): string {
  return ` Available again ${cadenceText(seconds)}, so you can come back and use it more than once.`
}

// --- Estimated-saving helper copy (FULL.html savingHint, ~L12106-12163) -----------
// The per-type "Estimated saving" field helper. Discount percent/fixed and the
// min-spend branch match A4.
export function savingHint(f: DraftFields): string {
  switch (f.type) {
    case 'spend': {
      const sa = num(f.spendAmount)
      const sv = num(f.spendSave)
      return sa > 0 && sv > 0
        ? `Customers save £${money(sv)} when they spend £${money(sa)}. This is also their estimated saving.`
        : 'This is what the customer saves once they reach the spend.'
    }
    case 'freebie': {
      const w = num(f.freeWorth)
      return w > 0
        ? `The free item is worth £${money(w)}. That is the saving the customer gets.`
        : 'Add what the free item is worth so we can show the saving.'
    }
    case 'package': {
      const price = num(f.packagePrice)
      const normal = num(f.packageNormal)
      const sv = Math.max(0, normal - price)
      return price > 0 && normal > price
        ? `Customers save £${money(sv)}, the £${money(normal)} normal total minus the £${money(price)} package price.`
        : 'Add the package price and the normal total so we can work out the saving.'
    }
    case 'discount': {
      if (f.discountKind === 'fixed') {
        const am = num(f.discAmount)
        return am > 0
          ? `Customers get £${money(am)} off. This is the estimated saving.`
          : 'Add an amount off so we can show the saving.'
      }
      const pct = num(f.discPercent)
      const min = num(f.discMin)
      const order = num(f.discTypicalOrder)
      if (min > 0) {
        const sv = Math.round((pct / 100) * min * 100) / 100
        return pct > 0 && min > 0
          ? `${pct}% of the £${money(min)} minimum spend is £${money(sv)}. Customers save at least this, and more when they spend more.`
          : 'Add a percentage and a minimum spend so we can show the saving.'
      }
      const sv = Math.round((pct / 100) * order * 100) / 100
      return pct > 0 && order > 0
        ? `${pct}% of a £${money(order)} order is about £${money(sv)}. This is the estimated saving customers see.`
        : 'Add a percentage and a typical order value so we can show the saving.'
    }
    case 'bogo': {
      const p = num(f.bogoFreePrice)
      return p > 0
        ? `Set automatically from the free item's full price (£${money(p)}). Edit if the real saving is different.`
        : 'Add the free item value so we can show the saving.'
    }
    default:
      return ''
  }
}

// BOGO saving-mismatch guard (A14 / FULL.html savingMismatch): the only manually
// editable saving. Returns a note when the entered saving diverges from the free
// item's full price.
export function bogoSavingMismatchNote(freeItemPrice: number, enteredSaving: number): string | null {
  if (freeItemPrice > 0 && Math.abs(enteredSaving - freeItemPrice) > 0.005) {
    return `This no longer matches the free item's full price of £${money(freeItemPrice)}.`
  }
  return null
}

// --- Customer-preview value + save lines (FULL.html ~L12525) ----------------------
export function previewTypeChipLabel(pickerId: string): string {
  switch (pickerId) {
    case 'reusable': return 'Reusable'
    case 'time': return 'Time limited'
    case 'spend': return 'Spend & save'
    case 'freebie': return 'Freebie'
    case 'package': return 'Package deal'
    case 'discount': return 'Discount'
    case 'bogo': return 'Buy one, get one free'
    default: return 'Voucher'
  }
}

// The green "Save ..." line under the preview headline. base = the base mechanic
// (for wrappers), fields = the structured bag, saving = effective saving.
export function previewSavingLine(base: DraftFields['type'], f: DraftFields, saving: number): string {
  if (saving <= 0) return 'Add a saving'
  switch (base) {
    case 'spend':
      return `Save £${money(saving)} when you spend £${money(num(f.spendAmount))}`
    case 'freebie':
      return `Free ${noun(f.freeItem) || 'item'}, worth £${money(saving)}`
    case 'package':
      return `Save £${money(saving)} on the bundle`
    case 'discount':
      return f.discountKind === 'fixed'
        ? `Save £${money(saving)}`
        : f.discMin
          ? `Save at least £${money(saving)}`
          : `Save about £${money(saving)}`
    default: // bogo
      return `Save £${money(saving)}`
  }
}

// The peach value chip (FULL.html previewMechanic, ~L12540).
export function previewMechanic(base: DraftFields['type'], f: DraftFields): string {
  switch (base) {
    case 'spend': {
      const sa = num(f.spendAmount)
      const sv = num(f.spendSave)
      return sa > 0 && sv > 0 ? `£${money(sv)} off when you spend £${money(sa)} or more` : ''
    }
    case 'freebie':
      return f.freeNeedsPurchase && (f.freeQualify ?? '').trim()
        ? `Free with ${(f.freeQualify ?? '').trim().charAt(0).toLowerCase()}${(f.freeQualify ?? '').trim().slice(1)}`
        : ''
    case 'package': {
      const price = num(f.packagePrice)
      const normal = num(f.packageNormal)
      return price > 0 && normal > price ? `£${money(normal)} of items for £${money(price)}` : ''
    }
    case 'discount': {
      if (f.discountKind === 'fixed') {
        const am = num(f.discAmount)
        return am > 0 ? `£${money(am)} off${f.discMin ? ` when you spend £${money(num(f.discMin))}` : ''}` : ''
      }
      const pct = num(f.discPercent)
      return pct > 0 ? `${pct}% off${f.discMin ? ` when you spend £${money(num(f.discMin))}` : ''}` : ''
    }
    default:
      return ''
  }
}
