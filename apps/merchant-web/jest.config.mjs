// JS (ESM) config so the jest config loader needs no ts-node. next/jest wires
// the SWC transform, CSS/asset mocks, and the `@/*` path alias from tsconfig, so
// component + lib tests run against the same module graph the app builds with.
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

/** @type {import('jest').Config} */
const config = {
  testEnvironment: 'jsdom',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.ts'],
  testMatch: ['<rootDir>/**/*.test.ts', '<rootDir>/**/*.test.tsx'],
  // Explicit `@/` -> app root mapping. next/jest derives this from tsconfig, but
  // declaring it keeps resolution stable for tests inside (route-group) folders.
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
  },
  clearMocks: true,
}

export default createJestConfig(config)
