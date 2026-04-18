import { describe, it, expect, vi } from 'vitest'
import { getCurrentCycleWindow, toMidnightUTC, resetVoucherCycleForUser } from '../../../src/api/subscription/cycle'

// ─────────────────────────────────────────────────────────────────────────────
// getCurrentCycleWindow
// ─────────────────────────────────────────────────────────────────────────────

describe('getCurrentCycleWindow', () => {
  it('monthly subscriber: mid-cycle returns correct window', () => {
    // Anchor: 10 April — on 23 July, cycle is 10 Jul → 10 Aug
    const anchor = new Date(Date.UTC(2026, 3, 10)) // Apr 10
    const now    = new Date(Date.UTC(2026, 6, 23)) // Jul 23

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 6, 10))) // Jul 10
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 7, 10)))   // Aug 10
  })

  it('monthly subscriber: before anchor day in month, uses previous month', () => {
    // Anchor: 10 April — on 5 July, cycle is 10 Jun → 10 Jul
    const anchor = new Date(Date.UTC(2026, 3, 10))
    const now    = new Date(Date.UTC(2026, 6, 5))

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 5, 10))) // Jun 10
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 6, 10)))   // Jul 10
  })

  it('monthly subscriber: on exact anchor day, treats as current cycle start', () => {
    // Anchor: 10 April — on 10 July 00:00 UTC, cycle is 10 Jul → 10 Aug
    const anchor = new Date(Date.UTC(2026, 3, 10))
    const now    = new Date(Date.UTC(2026, 6, 10))

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 6, 10))) // Jul 10
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 7, 10)))   // Aug 10
  })

  it('annual subscriber: uses same monthly cycle logic from cycleAnchorDate', () => {
    // Annual subscriber anchored to 15 Jan — on 20 March, cycle is 15 Mar → 15 Apr
    // Billing interval is irrelevant; monthly voucher cycles are date-anchored.
    const anchor = new Date(Date.UTC(2026, 0, 15)) // Jan 15
    const now    = new Date(Date.UTC(2026, 2, 20)) // Mar 20

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 2, 15))) // Mar 15
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 3, 15)))   // Apr 15
  })

  // ── Short-month / day clamping ────────────────────────────────────────────

  it('anchor day 31: clamps to 28 in February (non-leap year)', () => {
    const anchor = new Date(Date.UTC(2026, 0, 31)) // Jan 31
    const now    = new Date(Date.UTC(2026, 1, 15)) // Feb 15 (2026 is not a leap year)

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 0, 31))) // Jan 31
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 1, 28)))   // Feb 28
  })

  it('anchor day 31: clamps to 30 in April', () => {
    const anchor = new Date(Date.UTC(2026, 0, 31)) // Jan 31
    const now    = new Date(Date.UTC(2026, 4, 5))  // May 5

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    // May 5 is before May 31, so cycle is Apr 30 → May 31
    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 3, 30))) // Apr 30 (clamped from 31)
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 4, 31)))   // May 31
  })

  it('anchor day 31: March has 31 days, no clamping needed', () => {
    const anchor = new Date(Date.UTC(2026, 0, 31)) // Jan 31
    const now    = new Date(Date.UTC(2026, 2, 31)) // Mar 31

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 2, 31))) // Mar 31
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 3, 30)))   // Apr 30 (clamped)
  })

  it('anchor day 30: clamps to 28 in February (non-leap year)', () => {
    const anchor = new Date(Date.UTC(2026, 0, 30)) // Jan 30
    const now    = new Date(Date.UTC(2026, 1, 15)) // Feb 15

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 0, 30))) // Jan 30
    expect(cycleEnd).toEqual(new Date(Date.UTC(2026, 1, 28)))   // Feb 28
  })

  it('anchor day 30: clamps to 29 in February (leap year)', () => {
    const anchor = new Date(Date.UTC(2028, 0, 30)) // Jan 30, 2028 (leap year)
    const now    = new Date(Date.UTC(2028, 1, 15)) // Feb 15, 2028

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2028, 0, 30))) // Jan 30
    expect(cycleEnd).toEqual(new Date(Date.UTC(2028, 1, 29)))   // Feb 29
  })

  // ── Leap year handling ────────────────────────────────────────────────────

  it('anchor day 29: clamps to 28 in February (non-leap year)', () => {
    const anchor = new Date(Date.UTC(2026, 0, 29)) // Jan 29
    const now    = new Date(Date.UTC(2027, 1, 15)) // Feb 15, 2027 (non-leap)

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2027, 0, 29))) // Jan 29
    expect(cycleEnd).toEqual(new Date(Date.UTC(2027, 1, 28)))   // Feb 28
  })

  it('anchor day 29: uses 29 in February (leap year)', () => {
    const anchor = new Date(Date.UTC(2028, 0, 29)) // Jan 29
    const now    = new Date(Date.UTC(2028, 1, 29)) // Feb 29, 2028 (leap year)

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2028, 1, 29))) // Feb 29
    expect(cycleEnd).toEqual(new Date(Date.UTC(2028, 2, 29)))   // Mar 29
  })

  // ── Year boundary ────────────────────────────────────────────────────────

  it('crosses year boundary: anchor in December, now in January', () => {
    const anchor = new Date(Date.UTC(2026, 0, 15)) // Jan 15
    const now    = new Date(Date.UTC(2027, 0, 5))  // Jan 5, 2027

    const { cycleStart, cycleEnd } = getCurrentCycleWindow(anchor, now)

    expect(cycleStart).toEqual(new Date(Date.UTC(2026, 11, 15))) // Dec 15, 2026
    expect(cycleEnd).toEqual(new Date(Date.UTC(2027, 0, 15)))    // Jan 15, 2027
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// toMidnightUTC
// ─────────────────────────────────────────────────────────────────────────────

describe('toMidnightUTC', () => {
  it('truncates a timestamp to midnight UTC', () => {
    const input = new Date(Date.UTC(2026, 3, 10, 14, 32, 55, 123))
    expect(toMidnightUTC(input)).toEqual(new Date(Date.UTC(2026, 3, 10)))
  })

  it('midnight input returns the same date', () => {
    const input = new Date(Date.UTC(2026, 11, 25))
    expect(toMidnightUTC(input)).toEqual(new Date(Date.UTC(2026, 11, 25)))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// resetVoucherCycleForUser (supplementary — kept for backward compatibility)
// ─────────────────────────────────────────────────────────────────────────────

describe('resetVoucherCycleForUser', () => {
  it('resets isRedeemedInCurrentCycle for all redeemed cycle states of the user', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 })
    const prisma = { userVoucherCycleState: { updateMany } } as any

    await resetVoucherCycleForUser(prisma, 'user-1')

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isRedeemedInCurrentCycle: true,
      },
      data: {
        isRedeemedInCurrentCycle: false,
        cycleStartDate: expect.any(Date),
      },
    })
  })

  it('does nothing harmful if user has no redeemed cycle states', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const prisma = { userVoucherCycleState: { updateMany } } as any

    await resetVoucherCycleForUser(prisma, 'user-2')

    expect(updateMany).toHaveBeenCalledOnce()
  })
})
