/**
 * Phase 3C.1g Device-QA R1 Wave 6.2 (2026-05-30) — `navigateBackTo`
 * helper pins.
 *
 * The helper is load-bearing on the owner-reported "lands on
 * Favourites for ~5s then auto-redirects to Home" symptom.  See the
 * helper's docstring for the full root-cause analysis.
 *
 * Pins:
 *   §W6.2-1: dismissAll() fires BEFORE replace(target).  Reversing
 *            the order would leave the spurious tab-on-stack entry
 *            for expo-router to reconcile after replace — same bug
 *            as the pre-Wave-6.2 single-call paths.
 *   §W6.2-2: target URL is passed verbatim to replace() (no
 *            mangling — preserves query params like ?from=…).
 */

import { describe, it, expect, jest } from '@jest/globals'
import { navigateBackTo } from '@/lib/routing/navigateBack'

function makeMockRouter() {
  const order: string[] = []
  return {
    order,
    router: {
      dismissAll: jest.fn(() => { order.push('dismissAll') }),
      replace:    jest.fn((_href: never) => { order.push('replace') }),
    },
  }
}

describe('navigateBackTo — §W6.2 dismiss+replace pair', () => {
  it('§W6.2-1: calls dismissAll() BEFORE replace(target)', () => {
    const { router, order } = makeMockRouter()
    navigateBackTo(router, '/(app)/favourites')
    expect(order).toEqual(['dismissAll', 'replace'])
    expect(router.dismissAll).toHaveBeenCalledTimes(1)
    expect(router.replace).toHaveBeenCalledTimes(1)
  })

  it('§W6.2-2: passes target verbatim to replace (preserves ?from=… etc)', () => {
    const { router } = makeMockRouter()
    navigateBackTo(router, '/(app)/favourites?tab=vouchers')
    expect(router.replace).toHaveBeenCalledWith('/(app)/favourites?tab=vouchers')
  })

  it('§W6.2-3: works for non-tab targets (merchant URL) — same dismiss+replace pair', () => {
    const { router, order } = makeMockRouter()
    navigateBackTo(router, '/(app)/merchant/m1?branch=b1&tab=vouchers&from=favourites')
    expect(order).toEqual(['dismissAll', 'replace'])
    expect(router.replace).toHaveBeenCalledWith(
      '/(app)/merchant/m1?branch=b1&tab=vouchers&from=favourites',
    )
  })
})
