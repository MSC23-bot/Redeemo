import { defineConfig, configDefaults } from 'vitest/config'

// Two projects so real-DB suites can't flake the deterministic core
// (test-isolation PR1 — see docs/superpowers/plans/2026-06-12-backend-test-isolation-ci.md):
//  - `unit`        : mock / no-DB suites — run in PARALLEL (fast, no services).
//  - `integration` : `*.integration.test.ts` real-DB suites — run SERIALLY
//                    (fileParallelism: false) so concurrent suites can't contend
//                    on one shared DB (removes the concurrency-flake class).
// PR2 will move `integration` onto a dedicated fresh-seeded local Postgres and
// add it to CI; PR1 keeps it local + serial.
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    // Supplies deterministic TEST secrets for vars that previously had
    // source-visible fallbacks (removed in the Security Stabilisation Gate).
    setupFiles: ['./tests/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          include: ['tests/**/*.test.ts'],
          // Everything except the real-DB suites (which carry the .integration suffix).
          exclude: [...configDefaults.exclude, 'tests/**/*.integration.test.ts'],
          // Mock / no-DB suites — safe to parallelise.
          maxWorkers: 4,
        },
      },
      {
        extends: true,
        test: {
          name: 'integration',
          include: ['tests/**/*.integration.test.ts'],
          // Serial — one real-DB suite at a time → no cross-suite contention on
          // the shared DB. PR2 points these at a dedicated local Postgres.
          fileParallelism: false,
        },
      },
    ],
  },
})
