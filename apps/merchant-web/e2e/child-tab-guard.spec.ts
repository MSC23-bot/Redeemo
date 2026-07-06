/**
 * Mutation-test coverage for the shared child-tab (popup / target="_blank" /
 * window.open) console + pageerror guard added to
 * ./support/mocks.ts `attachErrorGuards`.
 *
 * KNOWN GAP THIS CLOSES: attachErrorGuards used to wire `page.on('pageerror'
 * | 'console')` onto ONLY the single `page` it was handed. A page opened in a
 * child tab - e.g. the Insights "Print or save report" link (target="_blank",
 * see insights.spec.ts + components/insights/ReportsCard.tsx) or the M3
 * Validate-a-code / redemptions detail flows if they ever grow one - was
 * never guarded: an uncaught error or console.error firing there would pass
 * silently, with no spec assertion able to catch it. attachErrorGuards now
 * also registers `context.on('page', wire)`, so EVERY page a BrowserContext
 * ever opens - the initial one and any future popup - shares the same
 * tracked pageErrors/consoleErrors arrays and the same count-bounded
 * expectedConsoleErrors allowance. See ./support/mocks.ts for the mechanism.
 *
 * SECOND GAP THIS CLOSES (page/source binding): an `expectedConsoleErrors`
 * allowance used to match on text+URL alone, with no notion of WHICH page
 * logged it. That means an allowance meant for the main page could silently
 * be "spent" by an unrelated same-text error on a popup, and vice-versa -
 * masking a real regression on one page behind an allowance intended for the
 * other. `ExpectedConsoleError.page` (optional) now lets a spec bind an
 * allowance to an exact Page instance; unbound entries keep the pre-existing
 * any-page-matches behaviour. See cases (d) + (e) below.
 *
 * THIRD GAP THIS CLOSES (failure-path cleanup): fixtures.ts used to run
 * `guards.assertClean(); guards.dispose()` as two bare statements. If
 * assertClean() threw (an uncaught pageerror, an unexpected console error, or
 * an expectedConsoleErrors count mismatch - i.e. every normal "this test
 * caught a real bug" case), dispose() never ran, permanently leaking the
 * guard's page/context listeners for the rest of the worker's lifetime.
 * `teardownGuards()` (exported from ./support/mocks) now wraps the two calls
 * in try/finally; fixtures.ts's `guards` auto fixture calls it instead of the
 * two bare calls. See case (g) below for a browser-free unit pin of that
 * exact contract.
 *
 * Case layout:
 *   (a) + (b) spin up a throwaway BrowserContext via the raw `browser`
 *       fixture and call attachErrorGuards directly, then trigger a pageerror
 *       / console.error on a manually-opened CHILD page (about:blank) and
 *       assert the returned guard object recorded it. This is deliberately
 *       isolated from the real per-test `guards` auto-fixture: pageErrors has
 *       NO allowance mechanism (by design - see ErrorGuards docs), so
 *       injecting one through the shared auto-guard would fail this file's
 *       OWN teardown for the wrong reason. An isolated context lets each case
 *       assert directly on the guard's internal state without that collision.
 *       Both cases wrap the manually-created context (and, inside it, the
 *       guard) in try/finally so a mid-test assertion failure can never leak
 *       the BrowserContext or its page listeners.
 *   (c) reuses the REAL smoke fixtures end to end (mocked Insights API +
 *       the actual "Print or save report" target="_blank" link), because the
 *       count-bounded expectedConsoleErrors allowance IS the mechanism under
 *       test, and letting the real auto `guards` fixture's teardown assert
 *       it naturally is the strongest, least-synthetic pin available.
 *   (d) + (e) prove the page-binding is a real isolation boundary, not a
 *       cosmetic field: an allowance bound to the MAIN page is not satisfied
 *       by an identical-text error on a CHILD page (d), and an allowance
 *       bound to a CHILD page is not satisfied by an identical-text error on
 *       the MAIN page (e). Both read `guards.consoleErrors` directly (the
 *       error surfaces as UNEXPECTED, proving the allowance was not
 *       consumed) and additionally assert `assertClean()` throws.
 *   (f) directly asserts on Node EventEmitter listener counts
 *       (`page.listenerCount(...)`) before and after dispose() on BOTH the
 *       main page and a child tab, proving dispose() detaches from every
 *       page it wired, not just stops wiring future ones.
 *   (g) is a browser-free unit test of `teardownGuards()`: a fake ErrorGuards
 *       whose `assertClean` throws proves `dispose` still runs, with no
 *       Playwright browser/context/page involved at all.
 *
 * MUTATION VERIFICATION (see the task report for the exact commands + output):
 *
 *   1) Child-tab wiring (a)/(b)/(c): temporarily removing the
 *      `context.on('page', wire)` line in ./support/mocks.ts and re-running
 *      this file fails all three cases - (a)/(b) because `guards.pageErrors`
 *      / `guards.consoleErrors` stay empty (the child page is never wired),
 *      (c) because the allowance's match count stays 0 against a required
 *      count of 1, so the real auto-teardown's assertClean() throws.
 *      Reverting the removal turns all three green again.
 *
 *   2) Page binding (d)/(e): temporarily removing the
 *      `(e.page === undefined || e.page === target)` clause from the
 *      matchIndex predicate in ./support/mocks.ts (so any-page-matches again)
 *      makes (d) and (e) fail - the page-bound allowance now WOULD be
 *      consumed by the wrong page's error, so `guards.consoleErrors` stays
 *      empty and `assertClean()` no longer throws, failing both `expect(...)`
 *      assertions. Restoring the clause turns both green again.
 *
 *   2b) Listener detach (f): temporarily reverting `dispose()` in
 *      ./support/mocks.ts back to the old `() => context.off('page', wire)`
 *      (dropping the per-page `wired` detach loop) makes (f) fail - both the
 *      main page's AND the child page's `listenerCount('pageerror'|'console')`
 *      stay at 1 after dispose() instead of dropping to 0. Restoring the
 *      per-page detach loop turns it green again.
 *
 *   3) Failure-path cleanup (g): temporarily changing `teardownGuards` in
 *      ./support/mocks.ts from `try { assertClean() } finally { dispose() }`
 *      to the old sequential `assertClean(); dispose();` makes (g) fail -
 *      `disposeCalled` stays `false` because the thrown error from the fake
 *      `assertClean` propagates out before `dispose()` is ever reached.
 *      Restoring the try/finally turns it green again.
 */
import { test as rawTest, expect } from '@playwright/test'
import type { Page } from '@playwright/test'
import { attachErrorGuards, teardownGuards, type ErrorGuards } from './support/mocks'
import { test } from './support/fixtures'

// Playwright's public `Page` type doesn't declare `EventEmitter.listenerCount`
// even though the concrete runtime object is one (it's how `.on`/`.off` work
// at all) - this narrow cast reaches it for case (f)'s direct leak-detection
// assertions, without loosening any other type in this file.
function listenerCount(target: Page, event: 'pageerror' | 'console'): number {
  return (target as unknown as { listenerCount(event: string): number }).listenerCount(event)
}

rawTest.describe('shared child-tab guard: direct unit coverage (isolated context)', () => {
  rawTest('(a) a child-tab pageerror is captured by the guard', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const mainPage = await context.newPage()
      const guards = attachErrorGuards(context, mainPage)
      try {
        const childPage = await context.newPage()
        await childPage.goto('about:blank')

        // Registered BEFORE the injected throw, mirroring how a spec would
        // await its own child-page assertions - proves the guard's own
        // listener (wired via context.on('page', ...) at attachErrorGuards
        // call time, before this childPage even existed) is what populates
        // guards.pageErrors, not this local listener.
        const seen = childPage.waitForEvent('pageerror')
        await childPage.evaluate(() => {
          setTimeout(() => {
            throw new Error('mutation-test-child-pageerror')
          }, 0)
        })
        await seen

        expect(
          guards.pageErrors.some((e) => e.includes('mutation-test-child-pageerror')),
          'attachErrorGuards should record an uncaught error thrown on a CHILD page, not just the main page',
        ).toBe(true)
      } finally {
        // dispose() detaches from every wired page (main + child), not just
        // stops wiring FUTURE ones - see the mocks.ts dispose() implementation.
        guards.dispose()
      }
    } finally {
      // A manually-created BrowserContext must always close, even if an
      // assertion above throws - otherwise it leaks for the rest of the
      // worker's lifetime.
      await context.close()
    }
  })

  rawTest('(b) a child-tab console.error is captured by the guard', async ({ browser }) => {
    const context = await browser.newContext()
    try {
      const mainPage = await context.newPage()
      const guards = attachErrorGuards(context, mainPage)
      try {
        const childPage = await context.newPage()
        await childPage.goto('about:blank')

        const seen = childPage.waitForEvent('console', (msg) => msg.type() === 'error')
        await childPage.evaluate(() => console.error('mutation-test-child-console-error'))
        await seen

        expect(
          guards.consoleErrors.some((e) => e.includes('mutation-test-child-console-error')),
          'attachErrorGuards should record a console.error logged on a CHILD page, not just the main page',
        ).toBe(true)
      } finally {
        guards.dispose()
      }
    } finally {
      await context.close()
    }
  })

  rawTest(
    '(d) an allowance bound to the MAIN page is NOT satisfied by an identical-text error on a CHILD page',
    async ({ browser }) => {
      const context = await browser.newContext()
      try {
        const mainPage = await context.newPage()
        const guards = attachErrorGuards(context, mainPage, [
          {
            urlSubstring: '',
            textSubstring: 'mutation-test-page-bound',
            count: 1,
            page: mainPage, // bound to MAIN page only
          },
        ])
        try {
          const childPage = await context.newPage()
          await childPage.goto('about:blank')

          const seen = childPage.waitForEvent('console', (msg) => msg.type() === 'error')
          await childPage.evaluate(() => console.error('mutation-test-page-bound'))
          await seen

          // The allowance is bound to mainPage, so the CHILD page's identical
          // text must NOT consume it - it surfaces as an UNEXPECTED console
          // error instead, and assertClean() must throw.
          expect(
            guards.consoleErrors.some((e) => e.includes('mutation-test-page-bound')),
            'a main-page-bound allowance must not be satisfied by a child-tab error, so it should land in consoleErrors as unexpected',
          ).toBe(true)
          expect(
            () => guards.assertClean(),
            'assertClean() must throw: the main-page-bound allowance was never consumed (match count stayed 0)',
          ).toThrow()
        } finally {
          guards.dispose()
        }
      } finally {
        await context.close()
      }
    },
  )

  rawTest(
    '(e) an allowance bound to a CHILD page is NOT satisfied by an identical-text error on the MAIN page',
    async ({ browser }) => {
      const context = await browser.newContext()
      try {
        const mainPage = await context.newPage()
        const childPage = await context.newPage()
        await childPage.goto('about:blank')

        const guards = attachErrorGuards(context, mainPage, [
          {
            urlSubstring: '',
            textSubstring: 'mutation-test-child-bound',
            count: 1,
            page: childPage, // bound to CHILD page only
          },
        ])
        try {
          const seen = mainPage.waitForEvent('console', (msg) => msg.type() === 'error')
          await mainPage.evaluate(() => console.error('mutation-test-child-bound'))
          await seen

          // The allowance is bound to childPage, so the MAIN page's identical
          // text must NOT consume it - vice-versa of case (d).
          expect(
            guards.consoleErrors.some((e) => e.includes('mutation-test-child-bound')),
            'a child-page-bound allowance must not be satisfied by a main-page error, so it should land in consoleErrors as unexpected',
          ).toBe(true)
          expect(
            () => guards.assertClean(),
            'assertClean() must throw: the child-page-bound allowance was never consumed (match count stayed 0)',
          ).toThrow()
        } finally {
          guards.dispose()
        }
      } finally {
        await context.close()
      }
    },
  )

  rawTest(
    '(f) dispose() detaches listeners from EVERY page it wired - main AND every child tab',
    async ({ browser }) => {
      const context = await browser.newContext()
      try {
        const mainPage = await context.newPage()
        const guards = attachErrorGuards(context, mainPage)

        const childPage = await context.newPage()
        await childPage.goto('about:blank')

        // Both pages are wired: one 'pageerror' + one 'console' listener each.
        expect(
          listenerCount(mainPage, 'pageerror'),
          'main page should have exactly one pageerror listener wired',
        ).toBe(1)
        expect(listenerCount(mainPage, 'console'), 'main page should have exactly one console listener wired').toBe(
          1,
        )
        expect(
          listenerCount(childPage, 'pageerror'),
          'child page should have exactly one pageerror listener wired',
        ).toBe(1)
        expect(
          listenerCount(childPage, 'console'),
          'child page should have exactly one console listener wired',
        ).toBe(1)

        guards.dispose()

        // dispose() must detach from EVERY page it ever wired, not just stop
        // wiring FUTURE ones - a plain `context.off('page', wire)` (the
        // pre-fix behaviour) leaves both of these non-zero.
        expect(listenerCount(mainPage, 'pageerror'), 'dispose() must detach the main page pageerror listener').toBe(
          0,
        )
        expect(listenerCount(mainPage, 'console'), 'dispose() must detach the main page console listener').toBe(0)
        expect(
          listenerCount(childPage, 'pageerror'),
          'dispose() must detach the CHILD page pageerror listener too, not just the main page',
        ).toBe(0)
        expect(
          listenerCount(childPage, 'console'),
          'dispose() must detach the CHILD page console listener too, not just the main page',
        ).toBe(0)
      } finally {
        await context.close()
      }
    },
  )

  rawTest(
    '(g) teardownGuards() runs dispose() even when assertClean() throws (no browser needed)',
    () => {
      let disposeCalled = false
      const fakeGuards: ErrorGuards = {
        pageErrors: [],
        consoleErrors: [],
        assertClean: () => {
          throw new Error('mutation-test-assertClean-throws')
        },
        dispose: () => {
          disposeCalled = true
        },
      }

      expect(() => teardownGuards(fakeGuards), 'teardownGuards must propagate the assertClean() failure').toThrow(
        'mutation-test-assertClean-throws',
      )
      expect(
        disposeCalled,
        'dispose() must still run even though assertClean() threw - this is the try/finally contract fixtures.ts relies on',
      ).toBe(true)
    },
  )
})

test.describe('shared child-tab guard: allowance applies to child-tab errors too (real fixtures)', () => {
  // The count-bounded allowance mechanism (expectedConsoleErrors) is exactly
  // what's under test here: it must apply no matter which page in the context
  // logged the matching error, and must still require EXACTLY 1 match - not
  // "any number", so this stays a real pin, not a rubber stamp.
  test.use({
    expectedConsoleErrors: [
      { urlSubstring: '', textSubstring: 'mutation-test-allowed-child-console-error', count: 1 },
    ],
  })

  test('(c) an ALLOWED child-tab console.error does not fail the test', async ({ page, context }) => {
    await page.goto('/insights')
    await expect(page.getByTestId('insights-reports')).toBeVisible()

    // The SAME real child-tab-opening journey as
    // insights.spec.ts's "printable report page journey" case - a genuine
    // target="_blank" anchor click (components/insights/ReportsCard.tsx),
    // not a synthetic window.open(), so this exercises the exact production
    // pattern the guard must cover.
    const [reportPage] = await Promise.all([
      context.waitForEvent('page'),
      page.getByRole('link', { name: /print or save report/i }).click(),
    ])
    await reportPage.waitForURL(/\/insights\/report/)

    const seen = reportPage.waitForEvent('console', (msg) => msg.type() === 'error')
    await reportPage.evaluate(() => console.error('mutation-test-allowed-child-console-error'))
    await seen

    await reportPage.close()

    // No local assertion needed beyond reaching this point: the auto `guards`
    // fixture's teardown (./support/fixtures.ts) calls teardownGuards(guards),
    // which requires the allowance's match count to be EXACTLY 1. If the
    // child-tab wiring in attachErrorGuards were removed, that console.error
    // would never be observed by ANY listener - the match count would stay 0,
    // and assertClean() would throw "expected ... to match exactly 1
    // time(s)", failing this test. With the wiring present (as shipped here),
    // the count lands on exactly 1 and the test passes end to end.
  })
})
