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
  // A stray test.only must never silently shrink the lane in CI.
  forbidOnly: !!process.env.CI,
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
    // Layer-1 enforcement: clean build, then assert-dead-port.mjs verifies the
    // CURRENT build's manifest-referenced chunks carry the dead-port sentinel
    // before next start (adjudicated: process env WINS over .env.local for this
    // invocation - the enforcement exists to close the stale-chunk hazard and to
    // stay safe if that precedence ever inverts across Next versions);
    // e2e/00-safety.spec.ts re-asserts the SERVED build from the runner.
    command: 'rm -rf .next && npx next build && node e2e/support/assert-dead-port.mjs && npx next start --port 3103',
    url: 'http://127.0.0.1:3103/sign-in',
    // NEVER attach to an unknown process already bound to 3103: the safety spec
    // inspects THIS worktree's .next, so reusing a foreign server would break the
    // served-build identity assumption. An occupied port fails the run loudly.
    reuseExistingServer: false,
    timeout: 240_000,
    env: {
      // Dead loopback port: the mock boundary is the ONLY way any /api/v1
      // request succeeds. See the safety note above.
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:9411',
    },
  },
})
