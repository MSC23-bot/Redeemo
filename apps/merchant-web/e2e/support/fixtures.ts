/**
 * PR-G1b shared smoke fixtures (CodeRabbit #365 refactor): every journey gets
 * the mock boundary, the session cookie, and the error guards AUTOMATICALLY,
 * and the teardown asserts cleanliness - so "every journey is guarded" is
 * structural, not per-spec discipline.
 *
 * - `mockOptions` (option): per-test/per-describe MockApiOptions via test.use.
 * - `authenticated` (option, default true): set false for logged-out journeys.
 * - `expectedConsoleErrorSubstrings` (option, default []): substrings of
 *   console-error text a spec deliberately expects (e.g. a forced 500 mock
 *   pinning Promise.allSettled resilience). Every existing journey keeps the
 *   strict empty-array guard unless it opts in.
 * - `tracker` (auto): installs the mock boundary + cookie BEFORE the test, and
 *   AFTER it asserts no unmocked /api call escaped to the 404 fallback.
 * - `guards` (auto): collects pageerror/console-error during the test and
 *   asserts both empty afterwards.
 * Specs import { test, expect } from './support/fixtures'.
 */
import { test as base, expect } from '@playwright/test'
import {
  installMockApi,
  signIn,
  attachErrorGuards,
  type MockApiOptions,
  type MockApiTracker,
  type ErrorGuards,
} from './mocks'

interface SmokeFixtures {
  mockOptions: MockApiOptions
  authenticated: boolean
  expectedConsoleErrorSubstrings: string[]
  tracker: MockApiTracker
  guards: ErrorGuards
}

export const test = base.extend<SmokeFixtures>({
  mockOptions: [{}, { option: true }],
  authenticated: [true, { option: true }],
  expectedConsoleErrorSubstrings: [[], { option: true }],
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
    async ({ page, expectedConsoleErrorSubstrings }, use) => {
      const guards = attachErrorGuards(page, expectedConsoleErrorSubstrings)
      await use(guards)
      guards.assertClean()
    },
    { auto: true },
  ],
})

export { expect }
