// PR #112 device-QA fix (2026-05-19) — formatter contract pins for
// the shared display helpers used across Discovery / Search / Map /
// Home / Category surfaces.  Locked in PR-2; Phase 2.x surfaces
// reuse the same formatters without redefining the rules.

import {
  formatDistance,
  formatGbp,
  formatVoucherCount,
} from '@/design-system/utils/formatters'

describe('formatGbp', () => {
  it('renders a half-pound value with two decimals: 8.5 → £8.50', () => {
    expect(formatGbp(8.5)).toBe('£8.50')
  })

  it('renders a whole-pound value with two decimals: 8 → £8.00', () => {
    expect(formatGbp(8)).toBe('£8.00')
  })

  it('renders two-decimal values unchanged: 8.55 → £8.55', () => {
    expect(formatGbp(8.55)).toBe('£8.55')
  })

  it('rounds three-decimal input via toFixed: 8.555 → £8.56 (banker)', () => {
    // Note: Number.prototype.toFixed uses round-half-to-even in some JS
    // engines and round-half-up in others. We assert the prefix only.
    const result = formatGbp(8.555)
    expect(result).toMatch(/^£8\.5[56]$/)
  })

  it('renders zero correctly: 0 → £0.00', () => {
    expect(formatGbp(0)).toBe('£0.00')
  })

  it('returns null for null', () => {
    expect(formatGbp(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(formatGbp(undefined)).toBeNull()
  })
})

describe('formatVoucherCount', () => {
  it('returns null at 0 vouchers (caller hides the pill)', () => {
    expect(formatVoucherCount(0)).toBeNull()
  })

  it('uses singular at 1: "1 offer"', () => {
    expect(formatVoucherCount(1)).toBe('1 offer')
  })

  it('uses plural at 2: "2 offers"', () => {
    expect(formatVoucherCount(2)).toBe('2 offers')
  })

  it('uses plural at 10: "10 offers"', () => {
    expect(formatVoucherCount(10)).toBe('10 offers')
  })

  it('treats negative as null (defensive)', () => {
    expect(formatVoucherCount(-1)).toBeNull()
  })

  it('returns null for null / undefined', () => {
    expect(formatVoucherCount(null)).toBeNull()
    expect(formatVoucherCount(undefined)).toBeNull()
  })
})

describe('formatDistance', () => {
  // PR #112 fixup-6 (2026-05-20) — owner-locked: miles-only display.
  // Mixed-unit display ("276 metres away" vs "5.1 miles away") confused
  // readers; single-unit miles is the trust fix.  Sub-1-mile values
  // render as "0.X miles away" rather than switching to metres.

  it('returns null for null', () => {
    expect(formatDistance(null)).toBeNull()
  })

  it('returns null for undefined', () => {
    expect(formatDistance(undefined)).toBeNull()
  })

  it('formats 0 metres as "0.0 miles away" (miles-only contract)', () => {
    expect(formatDistance(0)).toBe('0.0 miles away')
  })

  it('formats 100 metres as "0.1 miles away" (sub-1-mile renders in miles)', () => {
    expect(formatDistance(100)).toBe('0.1 miles away')
  })

  it('formats 276 metres as "0.2 miles away" (owner screenshot case — now miles)', () => {
    expect(formatDistance(276)).toBe('0.2 miles away')
  })

  it('formats 499 metres as "0.3 miles away"', () => {
    expect(formatDistance(499)).toBe('0.3 miles away')
  })

  it('formats 500 metres as "0.3 miles away" (continues miles-only)', () => {
    expect(formatDistance(500)).toBe('0.3 miles away')
  })

  it('formats 1000 metres as "0.6 miles away"', () => {
    expect(formatDistance(1000)).toBe('0.6 miles away')
  })

  it('formats 1609 metres as "1.0 miles away" (1 mile mark)', () => {
    expect(formatDistance(1609)).toBe('1.0 miles away')
  })

  it('formats 8200 metres as "5.1 miles away" (multi-mile)', () => {
    expect(formatDistance(8200)).toBe('5.1 miles away')
  })

  it('negative pin — "metres away" wording must NOT appear under any positive distance', () => {
    expect(formatDistance(0)).not.toMatch(/metres/)
    expect(formatDistance(50)).not.toMatch(/metres/)
    expect(formatDistance(276)).not.toMatch(/metres/)
    expect(formatDistance(499)).not.toMatch(/metres/)
  })
})
