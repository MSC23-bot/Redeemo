import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Supplies deterministic TEST secrets for vars that previously had
    // source-visible fallbacks (removed in the Security Stabilisation Gate).
    setupFiles: ['./tests/setup.ts'],
    // cap workers to avoid hammering Neon with parallel cold connections
    maxWorkers: 4,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
    },
  },
})
