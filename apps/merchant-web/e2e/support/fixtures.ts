/**
 * PR-G1b shared smoke fixtures (CodeRabbit #365 refactor): every journey gets
 * the mock boundary, the session cookie, and the error guards AUTOMATICALLY,
 * and the teardown asserts cleanliness - so "every journey is guarded" is
 * structural, not per-spec discipline.
 *
 * - `mockOptions` (option): per-test/per-describe MockApiOptions via test.use.
 * - `authenticated` (option, default true): set false for logged-out journeys.
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
  tracker: MockApiTracker
  guards: ErrorGuards
}

export const test = base.extend<SmokeFixtures>({
  mockOptions: [{}, { option: true }],
  authenticated: [true, { option: true }],
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
    async ({ page }, use) => {
      const guards = attachErrorGuards(page)
      await use(guards)
      guards.assertClean()
    },
    { auto: true },
  ],
})

export { expect }
