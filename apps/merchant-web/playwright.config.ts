import { defineConfig, devices } from '@playwright/test'

/**
 * PR-G1b: the deterministic LOCAL browser-smoke lane (roadmap §8).
 *
 * Safety boundary (hard): the app under test is BUILT with
 * NEXT_PUBLIC_API_URL pointing at a dead loopback port (127.0.0.1:9411 -
 * nothing ever listens there), and every spec installs Playwright route
 * mocks for /api/v1/** and /api/merchant-auth/** BEFORE navigation. An
 * unmocked request therefore fails fast on loopback and can never reach
 * Railway, Neon, provider Redis, shared staging or production.
 *
 * Determinism rules (roadmap §8 retry rule): retries: 0 - an assertion or
 * app failure is never auto-retried. The webServer does a full production
 * build + start (dev-server webpack flakiness is excluded by design).
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  retries: 0,
  // One worker: the suite shares a single next start instance and asserts
  // console/pageerror cleanliness; parallel contexts would interleave logs.
  workers: 1,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:3103',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    // assert-dead-port.mjs fails the lane BEFORE start when a .env.local has
    // overridden NEXT_PUBLIC_API_URL at build (Next gives .env.local precedence
    // over process env); e2e/00-safety.spec.ts re-checks the served build for
    // the reuseExistingServer path.
    command: 'rm -rf .next && npx next build && node e2e/support/assert-dead-port.mjs && npx next start --port 3103',
    url: 'http://127.0.0.1:3103/sign-in',
    reuseExistingServer: !process.env.CI,
    timeout: 240_000,
    env: {
      // Dead loopback port: the mock boundary is the ONLY way any /api/v1
      // request succeeds. See the safety note above.
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:9411',
    },
  },
})
