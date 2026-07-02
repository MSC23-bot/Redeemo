import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Neon CU-burn worker-pool follow-up: proves BOTH worker Prisma entrypoints
// (normal boot AND --verify-keyring-and-exit) share ONE construction path with
// the explicit validated pool max, and that the implicit node-postgres default
// cannot silently return. Two layers:
//
//   1. BEHAVIOURAL — createWorkerPrisma is exercised with mocked PrismaPg /
//      PrismaClient constructors, asserting the EXACT adapter config
//      ({ connectionString, max }) and that the adapter instance is the one
//      handed to PrismaClient. Nothing connects (constructors are mocks).
//
//   2. STATIC SOURCE GUARDS on src/worker.ts (same style as the PR-D
//      maintenance contract guard): exactly ONE `new PrismaPg(` site (inside
//      the factory, carrying `max`), both entrypoints calling the factory with
//      the resolved value, no implicit-max shape, and the resolve-before-any-
//      resource ordering. Reverting either entrypoint to an inline
//      `new PrismaPg({ connectionString })` fails the exactly-one +
//      no-implicit-shape pins; dropping `max` from the factory fails the
//      factory-shape pin; moving the resolver after resource creation fails
//      the ordering pin.

vi.mock('@prisma/adapter-pg', () => ({
  PrismaPg: vi.fn(function (this: { config: unknown }, config: unknown) {
    this.config = config
  }),
}))
vi.mock('../../../generated/prisma/client', () => ({
  PrismaClient: vi.fn(function (this: { options: unknown }, options: unknown) {
    this.options = options
  }),
}))

import { createWorkerPrisma } from '../../../src/worker'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../../../generated/prisma/client'

const PrismaPgMock = vi.mocked(PrismaPg)
const PrismaClientMock = vi.mocked(PrismaClient)

describe('createWorkerPrisma — the single worker Prisma construction path (behavioural)', () => {
  beforeEach(() => {
    PrismaPgMock.mockClear()
    PrismaClientMock.mockClear()
  })

  it('constructs PrismaPg with EXACTLY { connectionString, max } — the explicit validated pool max', () => {
    createWorkerPrisma('postgresql://u@127.0.0.1:5432/db', 7)
    expect(PrismaPgMock).toHaveBeenCalledTimes(1)
    expect(PrismaPgMock).toHaveBeenCalledWith({
      connectionString: 'postgresql://u@127.0.0.1:5432/db',
      max: 7,
    })
    // the exact object shape: no extra keys, and max is the NUMBER passed in
    const config = PrismaPgMock.mock.calls[0][0] as Record<string, unknown>
    expect(Object.keys(config).sort()).toEqual(['connectionString', 'max'])
    expect(config.max).toBe(7)
  })

  it('hands the SAME adapter instance to PrismaClient and returns that client (no second construction path)', () => {
    const client = createWorkerPrisma('postgresql://u@127.0.0.1:5432/db', 3)
    expect(PrismaClientMock).toHaveBeenCalledTimes(1)
    const adapterInstance = PrismaPgMock.mock.instances[0]
    expect(PrismaClientMock).toHaveBeenCalledWith({ adapter: adapterInstance })
    expect(client).toBe(PrismaClientMock.mock.instances[0])
  })

  it('threads DIFFERENT pool maxes verbatim (no clamping, no substitution inside the factory)', () => {
    createWorkerPrisma('postgresql://a@127.0.0.1:5432/x', 1)
    createWorkerPrisma('postgresql://a@127.0.0.1:5432/x', 10)
    expect((PrismaPgMock.mock.calls[0][0] as { max: number }).max).toBe(1)
    expect((PrismaPgMock.mock.calls[1][0] as { max: number }).max).toBe(10)
  })
})

describe('worker.ts static wiring guards — both entrypoints on the shared factory, resolve-before-resources', () => {
  const workerSource = readFileSync(resolve(process.cwd(), 'src/worker.ts'), 'utf8')

  it('constructs PrismaPg EXACTLY ONCE — inside createWorkerPrisma, with the explicit max', () => {
    const sites = workerSource.match(/new PrismaPg\s*\(/g) ?? []
    expect(sites).toHaveLength(1)
    expect(workerSource).toMatch(/new PrismaPg\(\{ connectionString, max: poolMax \}\)/)
  })

  it('no implicit-max PrismaPg shape survives anywhere in worker.ts', () => {
    // the pre-change inline shape at either entrypoint:
    expect(workerSource).not.toMatch(/new PrismaPg\(\{\s*connectionString:\s*process\.env/)
    // and no max-less construction in general (the single site is pinned above)
    expect(workerSource).not.toMatch(/new PrismaPg\(\{\s*connectionString\s*\}\)/)
  })

  it('BOTH entrypoints route through createWorkerPrisma with the resolved workerDbPoolMax', () => {
    // --verify-keyring-and-exit path:
    expect(workerSource).toMatch(
      /makePrisma: \(\) => createWorkerPrisma\(process\.env\.DATABASE_URL!, workerDbPoolMax\)/,
    )
    // normal boot path:
    expect(workerSource).toMatch(
      /const prisma = createWorkerPrisma\(process\.env\.DATABASE_URL!, workerDbPoolMax\)/,
    )
    // definition + exactly the two call sites (a third construction path must
    // be classified here deliberately, not slip in silently)
    const mentions = workerSource.match(/createWorkerPrisma\(/g) ?? []
    expect(mentions).toHaveLength(3)
  })

  it('resolves the pool max AFTER validateRequiredEnv and BEFORE any resource: keyring early path, prisma creation, redis connections', () => {
    const iValidate = workerSource.indexOf('validateRequiredEnv()')
    const iResolvePool = workerSource.indexOf('resolveWorkerDatabasePoolMax(process.env)')
    const iKeyringBranch = workerSource.indexOf("process.argv.includes('--verify-keyring-and-exit')")
    const iPrismaBoot = workerSource.indexOf('const prisma = createWorkerPrisma(')
    const iRedis = workerSource.indexOf('makeQueueConnection()')
    for (const idx of [iValidate, iResolvePool, iKeyringBranch, iPrismaBoot, iRedis]) {
      expect(idx).toBeGreaterThan(-1)
    }
    expect(iResolvePool).toBeGreaterThan(iValidate)
    expect(iResolvePool).toBeLessThan(iKeyringBranch) // required in verify-keyring mode too
    expect(iResolvePool).toBeLessThan(iPrismaBoot)
    expect(iResolvePool).toBeLessThan(iRedis)
  })

  it('preserves the locked keyring/maintenance ordering: verify-keyring early path still runs BEFORE resolveMaintenanceConfig', () => {
    const iKeyringBranch = workerSource.indexOf("process.argv.includes('--verify-keyring-and-exit')")
    const iMaintenance = workerSource.indexOf('resolveMaintenanceConfig(process.env)')
    expect(iKeyringBranch).toBeGreaterThan(-1)
    expect(iMaintenance).toBeGreaterThan(-1)
    expect(iKeyringBranch).toBeLessThan(iMaintenance)
  })

  it('the API service Prisma plugin is untouched by this mechanism (worker-only scope)', () => {
    const apiPrismaSource = readFileSync(resolve(process.cwd(), 'src/api/plugins/prisma.ts'), 'utf8')
    expect(apiPrismaSource).not.toContain('WORKER_DATABASE_POOL_MAX')
    expect(apiPrismaSource).not.toContain('createWorkerPrisma')
    expect(apiPrismaSource).not.toContain('resolveWorkerDatabasePoolMax')
  })
})
