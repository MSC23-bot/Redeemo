/**
 * Phase 3C.1g Device-QA R1 Wave 6.3 (2026-05-30) — `navigateBackTo`
 * helper pins.
 *
 * Updated from Wave 6.2 (dismissAll + replace pair) which dispatched
 * an unsupported POP_TO_TOP action on the Tabs-root navigator and
 * surfaced a LogBox console error.  Wave 6.3 uses
 * `router.navigate(href)` — the expo-router 6 recommended programmatic
 * cross-tab API.  See the helper docstring for the full root-cause
 * history.
 *
 * Pins:
 *   §W6.3-1: `router.navigate(target)` is called exactly once with the
 *            verbatim target URL (preserves query params like
 *            `?from=favourites`, `?tab=vouchers`).
 *   §W6.3-2: NEITHER `dismissAll` nor `replace` is called — the
 *            helper relies on `navigate`'s smart algorithm alone so
 *            POP_TO_TOP can never fire from this path again.
 *   §W6.3-3: works for tab-style and stack-style targets uniformly
 *            (the helper has no special-casing — it's all one navigate
 *            call regardless of destination shape).
 */

import { describe, it, expect, jest } from '@jest/globals'
import { navigateBackTo } from '@/lib/routing/navigateBack'

function makeMockRouter() {
  return {
    navigate:   jest.fn(),
    // Included only to assert these are NOT called by navigateBackTo
    // — defending against a future regression that re-adds dismissAll
    // or replace and re-introduces the POP_TO_TOP warning.
    dismissAll: jest.fn(),
    replace:    jest.fn(),
  }
}

describe('navigateBackTo — §W6.3 router.navigate (POP_TO_TOP regression fix)', () => {
  it('§W6.3-1: calls router.navigate(target) exactly once with the verbatim target URL', () => {
    const router = makeMockRouter()
    navigateBackTo(router, '/(app)/favourites')
    expect(router.navigate).toHaveBeenCalledTimes(1)
    expect(router.navigate).toHaveBeenCalledWith('/(app)/favourites')
  })

  it('§W6.3-1: preserves query params (?tab=vouchers, ?from=…) on the target URL', () => {
    const router = makeMockRouter()
    navigateBackTo(router, '/(app)/favourites?tab=vouchers')
    expect(router.navigate).toHaveBeenCalledWith('/(app)/favourites?tab=vouchers')
  })

  it('§W6.3-2: does NOT call dismissAll (would dispatch POP_TO_TOP on Tabs root)', () => {
    const router = makeMockRouter()
    navigateBackTo(router, '/(app)/favourites')
    expect(router.dismissAll).not.toHaveBeenCalled()
  })

  it('§W6.3-2: does NOT call replace (avoids the Wave 6.2 dismissAll+replace pattern)', () => {
    const router = makeMockRouter()
    navigateBackTo(router, '/(app)/favourites')
    expect(router.replace).not.toHaveBeenCalled()
  })

  it('§W6.3-3: works for stack-style targets (merchant URL) — same single navigate call', () => {
    const router = makeMockRouter()
    navigateBackTo(router, '/(app)/merchant/m1?branch=b1&tab=vouchers&from=favourites')
    expect(router.navigate).toHaveBeenCalledTimes(1)
    expect(router.navigate).toHaveBeenCalledWith(
      '/(app)/merchant/m1?branch=b1&tab=vouchers&from=favourites',
    )
    expect(router.dismissAll).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })
})
