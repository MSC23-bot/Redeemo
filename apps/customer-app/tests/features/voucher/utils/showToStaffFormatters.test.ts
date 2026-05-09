import {
  formatShowToStaffLive,
  formatShowToStaffRedeemed,
  formatShowToStaffRedeemedDate,
  formatShowToStaffRedeemedTime,
} from '@/features/voucher/utils/showToStaffFormatters'

// Hermes-robust pure-function tests — locked 2026-05-09 from
// deferred-followups §AG2 (post-PR-#49 pre-public-launch hardening).
//
// Mirrors the `formatExpiryLine` test pattern: pass an explicit
// `timeZone` argument so scenarios are deterministic regardless of
// the host runtime's TZ. Production calls omit the arg (defaults to
// Europe/London).
//
// Display contracts pinned (preserve byte-for-byte parity with the
// pre-§AG2 implementation that used `Intl.DateTimeFormat('en-GB', ...)
// .format()` + `.split(', ')`):
//   • `formatShowToStaffLive(d)`     → "08 May 2026 · 14:24:38"
//   • `formatShowToStaffRedeemed(d)` → "08 May 2026, 14:24"

describe('formatShowToStaffLive — date+time with seconds', () => {
  it('renders "DD Mmm YYYY · HH:mm:ss" in Europe/London (BST in May)', () => {
    // 13:24:38 UTC + BST (UTC+1) = 14:24:38 London on 8 May 2026.
    const d = new Date('2026-05-08T13:24:38Z')
    expect(formatShowToStaffLive(d, 'Europe/London')).toBe('08 May 2026 · 14:24:38')
  })

  it('uses default Europe/London timezone when none passed (production call shape)', () => {
    const d = new Date('2026-05-08T13:24:38Z')
    // BST in May means default (Europe/London) MUST give the same
    // result as explicit Europe/London.
    expect(formatShowToStaffLive(d)).toBe(formatShowToStaffLive(d, 'Europe/London'))
  })

  it('zero-pads day, hour, minute, second', () => {
    // 9 May, 03:04:05 BST → "09 May 2026 · 03:04:05".
    const d = new Date('2026-05-09T02:04:05Z')
    expect(formatShowToStaffLive(d, 'Europe/London')).toBe('09 May 2026 · 03:04:05')
  })

  it('handles midnight (V8 "24" hour quirk normalised)', () => {
    // 23:00:00 UTC = 00:00:00 BST next day (BST = UTC+1; this rolls
    // forward into 9 May at 00:00:00). The hour-24 → 00 normalisation
    // pin: any future engine that returns "24" for the hour at the
    // day boundary must collapse to "00".
    const d = new Date('2026-05-08T23:00:00Z')
    expect(formatShowToStaffLive(d, 'Europe/London')).toBe('09 May 2026 · 00:00:00')
  })

  it('renders all month names correctly (Jan through Dec)', () => {
    // Hardcoded English month-name array is the load-bearing fix
    // for the Hermes/CLDR fragility — pin every month so a future
    // refactor that accidentally truncates the array fails loudly.
    const expected = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    for (let m = 0; m < 12; m++) {
      // Use UTC mid-month to avoid TZ rollover issues.
      const d = new Date(Date.UTC(2026, m, 15, 12, 0, 0))
      const out = formatShowToStaffLive(d, 'UTC')
      expect(out).toContain(`15 ${expected[m]} 2026 · 12:00:00`)
    }
  })
})

describe('formatShowToStaffRedeemed — date+time WITHOUT seconds', () => {
  it('renders "DD Mmm YYYY, HH:mm" — comma separator, no seconds', () => {
    const d = new Date('2026-05-08T13:24:38Z')
    expect(formatShowToStaffRedeemed(d, 'Europe/London')).toBe('08 May 2026, 14:24')
  })

  it('drops seconds entirely (regression pin against accidental seconds re-introduction)', () => {
    const d = new Date('2026-05-08T13:24:59Z')  // 59 seconds — would be visible if the helper printed seconds
    const out = formatShowToStaffRedeemed(d, 'Europe/London')
    expect(out).toBe('08 May 2026, 14:24')
    expect(out).not.toMatch(/:\d\d:\d\d/)  // no second pair
  })

  it('uses default Europe/London timezone when none passed', () => {
    const d = new Date('2026-05-08T13:24:00Z')
    expect(formatShowToStaffRedeemed(d)).toBe(formatShowToStaffRedeemed(d, 'Europe/London'))
  })
})

describe('London / BST scenario', () => {
  // BST is UTC+1 from late March to late October. May is firmly in
  // BST. These pins are the canonical "PR #49 device-QA Qatar device"
  // shape — same absolute UTC moment, formatted in a UK timezone.
  const BST_INSTANT_UTC = '2026-05-08T19:55:00Z'  // 20:55 BST 8 May

  it('live: BST renders as 20:55:00 (UTC+1 offset applied)', () => {
    expect(formatShowToStaffLive(new Date(BST_INSTANT_UTC), 'Europe/London'))
      .toBe('08 May 2026 · 20:55:00')
  })

  it('redeemed: same instant, no seconds → "08 May 2026, 20:55"', () => {
    expect(formatShowToStaffRedeemed(new Date(BST_INSTANT_UTC), 'Europe/London'))
      .toBe('08 May 2026, 20:55')
  })

  it('GMT-not-BST scenario (January) — UTC+0 offset, no DST', () => {
    // 1 January 2026 14:32:10 UTC = 14:32:10 GMT (winter, no BST).
    const d = new Date('2026-01-01T14:32:10Z')
    expect(formatShowToStaffLive(d, 'Europe/London')).toBe('01 Jan 2026 · 14:32:10')
  })
})

describe('absolute-math invariance — same UTC instant across timezones', () => {
  // Sanity check: changing the display TZ shifts the visible clock
  // but the underlying Date instant is identical. Same shape as the
  // `formatExpiryLine` tests (PR #49 device-QA Qatar reproduction).
  const REDEEMED = '2026-05-08T19:55:00Z'

  it('Asia/Qatar (UTC+3) → 22:55 same day', () => {
    expect(formatShowToStaffLive(new Date(REDEEMED), 'Asia/Qatar'))
      .toBe('08 May 2026 · 22:55:00')
  })

  it('Europe/London (BST, UTC+1) → 20:55 same day', () => {
    expect(formatShowToStaffLive(new Date(REDEEMED), 'Europe/London'))
      .toBe('08 May 2026 · 20:55:00')
  })

  it('UTC → 19:55 same day (baseline)', () => {
    expect(formatShowToStaffLive(new Date(REDEEMED), 'UTC'))
      .toBe('08 May 2026 · 19:55:00')
  })
})

describe('formatShowToStaffRedeemedDate — date-only half (PR-B T8g split)', () => {
  it('renders "DD Mmm YYYY" — no time part', () => {
    const d = new Date('2026-05-08T13:24:38Z')
    expect(formatShowToStaffRedeemedDate(d, 'Europe/London')).toBe('08 May 2026')
  })

  it('uses default Europe/London timezone when none passed', () => {
    const d = new Date('2026-05-08T13:24:38Z')
    expect(formatShowToStaffRedeemedDate(d)).toBe(formatShowToStaffRedeemedDate(d, 'Europe/London'))
  })

  it('returns "" on malformed input (graceful degradation)', () => {
    expect(formatShowToStaffRedeemedDate(new Date('not-a-date'))).toBe('')
  })

  it('honours TZ rollover at midnight (BST instant rolls into the next day)', () => {
    // 23:00 UTC on 8 May = 00:00 BST on 9 May.
    const d = new Date('2026-05-08T23:00:00Z')
    expect(formatShowToStaffRedeemedDate(d, 'Europe/London')).toBe('09 May 2026')
  })
})

describe('formatShowToStaffRedeemedTime — time-only half WITH seconds (PR-B T8g split)', () => {
  it('renders "HH:MM:SS" — seconds preserved (staff trust signal)', () => {
    const d = new Date('2026-05-08T13:24:38Z')
    expect(formatShowToStaffRedeemedTime(d, 'Europe/London')).toBe('14:24:38')
  })

  it('zero-pads single-digit hour, minute, second', () => {
    const d = new Date('2026-05-09T02:04:05Z')  // 03:04:05 BST
    expect(formatShowToStaffRedeemedTime(d, 'Europe/London')).toBe('03:04:05')
  })

  it('uses default Europe/London timezone when none passed', () => {
    const d = new Date('2026-05-08T13:24:38Z')
    expect(formatShowToStaffRedeemedTime(d)).toBe(formatShowToStaffRedeemedTime(d, 'Europe/London'))
  })

  it('returns "" on malformed input (graceful degradation)', () => {
    expect(formatShowToStaffRedeemedTime(new Date('not-a-date'))).toBe('')
  })

  it('handles midnight (V8 "24" hour quirk normalised → "00")', () => {
    const d = new Date('2026-05-08T23:00:00Z')  // 00:00 BST 9 May
    expect(formatShowToStaffRedeemedTime(d, 'Europe/London')).toBe('00:00:00')
  })
})

describe('malformed input — graceful degradation, no "Invalid Date"', () => {
  it('formatShowToStaffLive returns "" on Invalid Date', () => {
    expect(formatShowToStaffLive(new Date('not-a-date'))).toBe('')
  })

  it('formatShowToStaffRedeemed returns "" on Invalid Date', () => {
    expect(formatShowToStaffRedeemed(new Date('not-a-date'))).toBe('')
  })

  it('never includes the literal string "Invalid Date" in the output', () => {
    // Defensive pin against a regression where `.format()` /
    // `.formatToParts()` could silently emit "Invalid Date" tokens
    // that bleed into the visible UI. Both helpers MUST return
    // "" not "Invalid Date" on bad input.
    expect(formatShowToStaffLive(new Date(NaN))).not.toMatch(/Invalid/)
    expect(formatShowToStaffRedeemed(new Date(NaN))).not.toMatch(/Invalid/)
  })
})
