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
 *   (c) reuses the REAL smoke fixtures end to end (mocked Insights API +
 *       the actual "Print or save report" target="_blank" link), because the
 *       count-bounded expectedConsoleErrors allowance IS the mechanism under
 *       test, and letting the real auto `guards` fixture's teardown assert
 *       it naturally is the strongest, least-synthetic pin available.
 *
 * MUTATION VERIFICATION (see the task report for the exact command + output):
 * temporarily removing the `context.on('page', wire)` line in
 * ./support/mocks.ts and re-running this file fails all three cases -
 * (a)/(b) because `guards.pageErrors` / `guards.consoleErrors` stay empty (the
 * child page is never wired), (c) because the allowance's match count stays 0
 * against a required count of 1, so the real auto-teardown's assertClean()
 * throws. Reverting the removal turns all three green again.
 */
import { test as rawTest, expect } from '@playwright/test'
import { attachErrorGuards } from './support/mocks'
import { test } from './support/fixtures'

rawTest.describe('shared child-tab guard: direct unit coverage (isolated context)', () => {
  rawTest('(a) a child-tab pageerror is captured by the guard', async ({ browser }) => {
    const context = await browser.newContext()
    const mainPage = await context.newPage()
    const guards = attachErrorGuards(context, mainPage)

    const childPage = await context.newPage()
    await childPage.goto('about:blank')

    // Registered BEFORE the injected throw, mirroring how a spec would await
    // its own child-page assertions - proves the guard's own listener (wired
    // via context.on('page', ...) at attachErrorGuards call time, before this
    // childPage even existed) is what populates guards.pageErrors, not this
    // local listener.
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

    guards.dispose()
    await context.close()
  })

  rawTest('(b) a child-tab console.error is captured by the guard', async ({ browser }) => {
    const context = await browser.newContext()
    const mainPage = await context.newPage()
    const guards = attachErrorGuards(context, mainPage)

    const childPage = await context.newPage()
    await childPage.goto('about:blank')

    const seen = childPage.waitForEvent('console', (msg) => msg.type() === 'error')
    await childPage.evaluate(() => console.error('mutation-test-child-console-error'))
    await seen

    expect(
      guards.consoleErrors.some((e) => e.includes('mutation-test-child-console-error')),
      'attachErrorGuards should record a console.error logged on a CHILD page, not just the main page',
    ).toBe(true)

    guards.dispose()
    await context.close()
  })
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
    // fixture's teardown (./support/fixtures.ts) calls assertClean(), which
    // requires the allowance's match count to be EXACTLY 1. If the child-tab
    // wiring in attachErrorGuards were removed, that console.error would
    // never be observed by ANY listener - the match count would stay 0, and
    // assertClean() would throw "expected ... to match exactly 1 time(s)",
    // failing this test. With the wiring present (as shipped here), the
    // count lands on exactly 1 and the test passes end to end.
  })
})
