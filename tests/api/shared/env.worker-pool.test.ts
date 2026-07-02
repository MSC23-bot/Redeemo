import { describe, it, expect } from 'vitest'
import {
  resolveWorkerDatabasePoolMax,
  WORKER_DATABASE_POOL_MAX_CEILING,
} from '../../../src/api/shared/env'

// Neon CU-burn worker-pool follow-up: the fail-closed resolver for the
// worker's explicit Prisma pool max. Mirrors the resolveMaintenanceConfig
// contract tests: pure resolver, full accept/reject matrix, no silent default,
// no NODE_ENV- or MAINTENANCE_MODE-dependent behaviour.

function env(value?: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...(value === undefined ? {} : { WORKER_DATABASE_POOL_MAX: value }),
    ...extra,
  } as NodeJS.ProcessEnv
}

describe('resolveWorkerDatabasePoolMax — fail-closed validation matrix', () => {
  it('locks the safety ceiling to 10 (the previously-inherited pg default maximum)', () => {
    expect(WORKER_DATABASE_POOL_MAX_CEILING).toBe(10)
  })

  it('rejects a MISSING variable (required whenever the worker starts)', () => {
    expect(() => resolveWorkerDatabasePoolMax(env())).toThrow(/WORKER_DATABASE_POOL_MAX is not set/)
  })

  it('rejects a BLANK variable', () => {
    expect(() => resolveWorkerDatabasePoolMax(env(''))).toThrow(/is not set/)
    expect(() => resolveWorkerDatabasePoolMax(env('   '))).toThrow(/is not set/)
  })

  it('rejects a NON-NUMERIC value', () => {
    expect(() => resolveWorkerDatabasePoolMax(env('abc'))).toThrow(/must be an integer, got "abc"/)
    expect(() => resolveWorkerDatabasePoolMax(env('five'))).toThrow(/must be an integer/)
  })

  it('rejects a FLOAT', () => {
    expect(() => resolveWorkerDatabasePoolMax(env('5.5'))).toThrow(/must be an integer, got "5.5"/)
    expect(() => resolveWorkerDatabasePoolMax(env('1.0000001'))).toThrow(/must be an integer/)
  })

  it('rejects ZERO', () => {
    expect(() => resolveWorkerDatabasePoolMax(env('0'))).toThrow(/between 1 and 10 inclusive, got 0/)
  })

  it('rejects NEGATIVE values', () => {
    expect(() => resolveWorkerDatabasePoolMax(env('-3'))).toThrow(/between 1 and 10 inclusive, got -3/)
    expect(() => resolveWorkerDatabasePoolMax(env('-1'))).toThrow(/between 1 and 10/)
  })

  it('rejects values ABOVE the ceiling (10 is a hard cap, not a suggestion)', () => {
    expect(() => resolveWorkerDatabasePoolMax(env('11'))).toThrow(/between 1 and 10 inclusive, got 11/)
    expect(() => resolveWorkerDatabasePoolMax(env('100'))).toThrow(/between 1 and 10/)
    expect(() => resolveWorkerDatabasePoolMax(env('10000'))).toThrow(/between 1 and 10/)
  })

  it('accepts the LOWER boundary 1', () => {
    expect(resolveWorkerDatabasePoolMax(env('1'))).toBe(1)
  })

  it('accepts the UPPER boundary 10', () => {
    expect(resolveWorkerDatabasePoolMax(env('10'))).toBe(10)
  })

  it('accepts the staging-candidate 5 and returns the validated integer', () => {
    expect(resolveWorkerDatabasePoolMax(env('5'))).toBe(5)
  })

  it('has NO NODE_ENV-dependent silent default — missing still throws in every NODE_ENV', () => {
    for (const nodeEnv of ['production', 'development', 'test']) {
      expect(() => resolveWorkerDatabasePoolMax(env(undefined, { NODE_ENV: nodeEnv }))).toThrow(
        /WORKER_DATABASE_POOL_MAX is not set/,
      )
    }
  })

  it('is required even when MAINTENANCE_MODE=disabled (maintenance-off is not a pool-max off-path)', () => {
    expect(() =>
      resolveWorkerDatabasePoolMax(env(undefined, { MAINTENANCE_MODE: 'disabled' })),
    ).toThrow(/WORKER_DATABASE_POOL_MAX is not set/)
    // and a valid value still resolves normally alongside disabled maintenance
    expect(resolveWorkerDatabasePoolMax(env('3', { MAINTENANCE_MODE: 'disabled' }))).toBe(3)
  })

  it('formats the error consistently with the existing fail-closed validation and names all three start modes', () => {
    try {
      resolveWorkerDatabasePoolMax(env())
      expect.unreachable('should have thrown')
    } catch (err) {
      const message = (err as Error).message
      expect(message).toMatch(/^\[env\] Refusing to start worker/)
      expect(message).toContain('normal boot')
      expect(message).toContain('MAINTENANCE_MODE=disabled')
      expect(message).toContain('--verify-keyring-and-exit')
      expect(message).toContain('no silent default pool size')
      expect(message).toContain(`between 1 and ${WORKER_DATABASE_POOL_MAX_CEILING} inclusive`)
    }
  })
})
