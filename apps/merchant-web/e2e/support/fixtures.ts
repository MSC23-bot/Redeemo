/**
 * PR-G1b shared smoke fixtures (CodeRabbit #365 refactor): every journey gets
 * the mock boundary, the session cookie, and the error guards AUTOMATICALLY,
 * and the teardown asserts cleanliness - so "every journey is guarded" is
 * structural, not per-spec discipline.
 *
 * - `mockOptions` (option): per-test/per-describe MockApiOptions via test.use.
 * - `authenticated` (option, default true): set false for logged-out journeys.
 * - `expectedConsoleErrors` (option, default []): count-bounded expectations a
 *   spec deliberately opts into (e.g. a forced 500 mock pinning
 *   Promise.allSettled resilience). Each entry requires BOTH the failing
 *   request's URL (`urlSubstring`) and the console text (`textSubstring`) to
 *   match, and requires EXACTLY `count` matches - an open-ended substring
 *   match on text alone would silently swallow an unrelated broken asset or
 *   extra failed request during the same test. Every existing journey keeps
 *   the strict empty-array guard unless it opts in.
 * - `tracker` (auto): installs the mock boundary + cookie BEFORE the test, and
 *   AFTER it asserts no unmocked /api call escaped to the 404 fallback.
 * - `guards` (auto): collects pageerror/console-error during the test and
 *   asserts both empty (plus each expected-error count) afterwards. Covers
 *   the WHOLE BrowserContext - the main `page` AND any child tab opened via
 *   a popup / `target="_blank"` link / `window.open` during the test (see
 *   attachErrorGuards in ./mocks for the per-page wiring + teardown, and
 *   teardownGuards for the try/finally that keeps dispose() - listener
 *   detach on every page - running even when assertClean() throws).
 * Specs import { test, expect } from './support/fixtures'.
 */
import { test as base, expect } from '@playwright/test'
import {
  installMockApi,
  signIn,
  attachErrorGuards,
  teardownGuards,
  type MockApiOptions,
  type MockApiTracker,
  type ErrorGuards,
  type ExpectedConsoleError,
} from './mocks'

interface SmokeFixtures {
  mockOptions: MockApiOptions
  authenticated: boolean
  expectedConsoleErrors: ExpectedConsoleError[]
  tracker: MockApiTracker
  guards: ErrorGuards
}

export const test = base.extend<SmokeFixtures>({
  mockOptions: [{}, { option: true }],
  authenticated: [true, { option: true }],
  expectedConsoleErrors: [[], { option: true }],
  tracker: [
    async ({ context, mockOptions, authenticated }, use) => {
      const tracker = await installMockApi(context, mockOptions)
      if (authenticated) await signIn(context)
      await use(tracker)
      expect(tracker.unmatched, 'unmocked API calls escaped the model').toEqual([])
    },
    { auto: true },
  ],
  guards: [
    async ({ context, page, expectedConsoleErrors }, use) => {
      const guards = attachErrorGuards(context, page, expectedConsoleErrors)
      await use(guards)
      // teardownGuards runs assertClean() then dispose() in a try/finally -
      // dispose() (listener detach on every page + context) still runs even
      // when assertClean() throws (an uncaught pageerror, an unexpected
      // console error, or an expectedConsoleErrors count mismatch).
      teardownGuards(guards)
    },
    { auto: true },
  ],
})

export { expect }
