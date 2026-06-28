/**
 * PR-B Task B4: pure Insights display/format helpers.
 */
import {
  formatGbp,
  formatCount,
  formatRatePercentValue,
  formatRateAsPercent,
  comparisonChip,
} from '../format'
import type { Comparison } from '@/lib/api/insights'

describe('formatGbp', () => {
  it('formats a GBP amount en-GB', () => {
    expect(formatGbp(609)).toBe('£609.00')
    expect(formatGbp(450.25)).toBe('£450.25')
    expect(formatGbp(0)).toBe('£0.00')
  })

  it('defends against non-finite input', () => {
    expect(formatGbp(NaN)).toBe('£0.00')
  })
})

describe('formatCount', () => {
  it('formats an integer with en-GB grouping', () => {
    expect(formatCount(61)).toBe('61')
    expect(formatCount(1234)).toBe('1,234')
  })
})

describe('formatRatePercentValue (already-a-percentage value)', () => {
  it('appends a percent unit to the wire value (a percentage, not a fraction)', () => {
    expect(formatRatePercentValue(42.5)).toBe('42.5%')
    expect(formatRatePercentValue(60)).toBe('60%')
  })

  it('trims a trailing .0', () => {
    expect(formatRatePercentValue(42.0)).toBe('42%')
  })
})

describe('formatRateAsPercent (0..1 fraction -> whole percent)', () => {
  it('formats a fraction as a whole-number percent', () => {
    expect(formatRateAsPercent(0.84)).toBe('84%')
    expect(formatRateAsPercent(1)).toBe('100%')
    expect(formatRateAsPercent(0)).toBe('0%')
  })
})

describe('comparisonChip', () => {
  const base: NonNullable<Comparison> = {
    cur: 61,
    prev: 54,
    pct: 13,
    label: 'last_month',
  }

  // The phrase names the BASELINE window, NOT the viewed period: viewing "last month"
  // compares against the month before it, so the chip reads "...on the previous month".
  it('reads up with magnitude + the baseline phrase (the previous month)', () => {
    const chip = comparisonChip(base)
    expect(chip.direction).toBe('up')
    expect(chip.magnitude).toBe(13)
    expect(chip.text).toBe('13% up on the previous month')
  })

  it('reads down when cur < prev', () => {
    const chip = comparisonChip({ cur: 40, prev: 54, pct: 26, label: 'last_month' })
    expect(chip.direction).toBe('down')
    expect(chip.text).toBe('26% down on the previous month')
  })

  it('reads flat (no change) when cur === prev', () => {
    const chip = comparisonChip({ cur: 54, prev: 54, pct: 0, label: 'last_month' })
    expect(chip.direction).toBe('flat')
    expect(chip.text).toBe('No change on the previous month')
  })

  it('describes direction without a percentage when pct is null (prev was 0)', () => {
    const chip = comparisonChip({ cur: 5, prev: 0, pct: null, label: 'last_3m' })
    expect(chip.direction).toBe('up')
    expect(chip.magnitude).toBeNull()
    expect(chip.text).toBe('Up on the previous 3 months')
  })

  it('uses the baseline phrase for the longer presets and all/custom', () => {
    expect(comparisonChip({ cur: 10, prev: 8, pct: 25, label: 'last_6m' }).text).toBe(
      '25% up on the previous 6 months',
    )
    expect(comparisonChip({ cur: 10, prev: 8, pct: 25, label: 'custom' }).text).toBe(
      '25% up on the previous period',
    )
    expect(comparisonChip({ cur: 10, prev: 8, pct: 25, label: 'all' }).text).toBe(
      '25% up on the previous period',
    )
  })
})
