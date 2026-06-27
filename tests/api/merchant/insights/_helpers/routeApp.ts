// Insights PR-A Task A7 route-test harness (loopback-guarded HTTP layer).
//
// The Insights aggregation runs against a REAL local Postgres (the loopback-
// guarded makeTestPrisma in testDb.ts), but the ROUTES need the HTTP layer too:
// the fresh authz chain (resolveMerchantContext -> assertMerchantActive ->
// assertInsightsAccess) + the @fastify/jwt merchant namespace + the
// authenticateMerchant preHandler (which calls redis.exists for the session-live
// check). buildApp() runs in NODE_ENV=test, which deliberately does NOT register
// the real prisma / redis plugins (app.ts:43-46), so we INJECT them:
//   - prisma: the loopback-validated PrismaClient from makeTestPrisma(). This is
//     THE safety boundary - makeTestPrisma() throws before opening a socket if
//     TEST_DATABASE_URL is not loopback, so the persistent DATABASE_URL / shared
//     Neon / Railway can never be reached by a route test. The injected client is
//     what every route reads as app.prisma, so no route ever touches the
//     persistent DATABASE_URL.
//   - redis: a tiny mock whose `exists` returns 1 (session live) so the
//     authenticateMerchant decorator passes. We never hit a real Redis.
//
// A loopback assertion runs (via makeTestPrisma) BEFORE any DB access, identical
// to the aggregation suites. The merchant JWT is signed exactly as the merchant
// auth service signs it (service.ts:263): { sub, role:'merchant', deviceId,
// sessionId }.

import { vi } from 'vitest'
import type { FastifyInstance } from 'fastify'
import { buildApp } from '../../../../../src/api/app'
import { makeTestPrisma } from './testDb'
import type { PrismaClient } from '../../../../../generated/prisma/client'

export type RouteApp = {
  app: FastifyInstance
  prisma: PrismaClient
  /** Sign a merchant access token for a merchant-admin id (becomes req.user.sub). */
  sign: (adminId: string, over?: Record<string, unknown>) => string
  /** Authorization header for a merchant-admin id. */
  authHeader: (adminId: string) => { authorization: string }
  /** Toggle the session-live signal the authenticateMerchant decorator reads. */
  setSessionLive: (live: boolean) => void
}

/**
 * Build the app with the loopback test PrismaClient injected + a mocked Redis,
 * ready to serve Insights routes. The caller owns the lifecycle: call
 * `app.close()` + `prisma.$disconnect()` in afterAll.
 */
export async function buildRouteApp(): Promise<RouteApp> {
  // makeTestPrisma() asserts loopback (127.0.0.1 / localhost) BEFORE constructing
  // the client. A non-loopback TEST_DATABASE_URL throws here, so no route test can
  // ever reach the persistent DATABASE_URL / shared Neon / Railway.
  const prisma = makeTestPrisma()

  const app = await buildApp()
  app.decorate('prisma', prisma as any)

  let sessionLive = 1
  app.decorate('redis', {
    get: vi.fn().mockResolvedValue(null),
    set: vi.fn().mockResolvedValue('OK'),
    del: vi.fn().mockResolvedValue(1),
    keys: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockImplementation(async () => sessionLive),
  } as any)

  await app.ready()

  const sign = (adminId: string, over: Record<string, unknown> = {}) =>
    (app.jwt as any).merchant.sign(
      { sub: adminId, role: 'merchant', deviceId: 'test-device', sessionId: 'test-session', ...over },
      { expiresIn: '1h' },
    )

  return {
    app,
    prisma,
    sign,
    authHeader: (adminId: string) => ({ authorization: `Bearer ${sign(adminId)}` }),
    setSessionLive: (live: boolean) => {
      sessionLive = live ? 1 : 0
    },
  }
}

/** The six Insights endpoints + the export path, for matrix iteration. */
export const INSIGHTS_ENDPOINTS = [
  '/overview',
  '/trend',
  '/vouchers',
  '/branches',
  '/validation',
  '/busy-times',
  '/customers',
] as const

export const EXPORT_ENDPOINT = '/export.csv'

export const INSIGHTS_PREFIX = '/api/v1/merchant/insights'
