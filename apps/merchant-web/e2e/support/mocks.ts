/**
 * PR-G1b mock boundary: controlled, WIRE-ACCURATE API/session mocks.
 *
 * Everything the browser would send to the backend (/api/v1/**, cross-origin
 * to the dead loopback port baked in at build time) or to the same-origin BFF
 * (/api/merchant-auth/**) is intercepted here BEFORE the network. Fixtures
 * reproduce the real wire shapes - most importantly Prisma Decimal fields
 * (branch latitude/longitude, redemption estimatedSaving) as JSON STRINGS,
 * the exact class of bug behind #327 that unit tests with typed mocks missed.
 *
 * Unmatched /api/v1/* requests get a 404 JSON body and are RECORDED on the
 * returned tracker so a spec can assert its surface hit only modelled routes.
 */
import type { BrowserContext, Page } from '@playwright/test'
import { expect } from '@playwright/test'

export const SESSION_COOKIE = 'redeemo_merchant_session'
export const BASE_URL = 'http://127.0.0.1:3103'

// ---------------------------------------------------------------------------
// Fixtures (wire shapes)
// ---------------------------------------------------------------------------

export type RoleFixture = 'OWNER' | 'BRANCH_MANAGER' | 'STAFF' | 'AUDITOR' | 'ABSENT'

export function profileFixture(role: RoleFixture = 'OWNER') {
  const caps =
    role === 'ABSENT'
      ? undefined
      : {
          canViewInsights: role === 'OWNER' || role === 'BRANCH_MANAGER',
          canManageVouchers: role === 'OWNER',
          role,
          displayName: 'Priya Shah',
        }
  return {
    id: 'm1',
    businessName: 'Roe Cafe',
    tradingName: null,
    companyNumber: null,
    vatNumber: null,
    websiteUrl: null,
    logoUrl: null,
    bannerUrl: null,
    description: 'A cafe.',
    status: 'ACTIVE',
    onboardingStep: 'LIVE',
    primaryCategoryId: 'cat1',
    primaryDescriptorTagId: null,
    contractStatus: 'SIGNED',
    ...(caps ? { viewerCapabilities: caps } : {}),
  }
}

// Branch rows: latitude/longitude are Prisma Decimal => JSON STRINGS on the
// wire (the #327 contract). redemptionPin ships as ciphertext; the client
// reads PRESENCE only.
export function branchFixture(id = 'b1', over: Record<string, unknown> = {}) {
  return {
    id,
    name: id === 'b1' ? 'Old Foundry' : 'Riverside',
    isMainBranch: id === 'b1',
    lifecycleStatus: 'LIVE',
    closeReason: null,
    addressLine1: '12 Foundry Street',
    addressLine2: null,
    city: id === 'b1' ? 'Huddersfield' : 'Leeds',
    postcode: 'HD1 1AA',
    phone: '01484 000000',
    email: null,
    websiteUrl: null,
    about: null,
    logoUrl: null,
    bannerUrl: null,
    locationConfidence: 'MANUALLY_CONFIRMED',
    isActive: true,
    redemptionAlertsEnabled: false,
    latitude: '53.645792', // STRING on the wire (Prisma Decimal)
    longitude: '-1.785035', // STRING on the wire (Prisma Decimal)
    redemptionPin: 'enc:v1:abcdef0123456789',
    openingHours: [],
    photos: [],
    amenities: [],
    pendingEdit: null,
    pendingHours: [],
    ...over,
  }
}

// Redemption rows: estimatedSaving is a Prisma Decimal => JSON STRING.
export function redemptionFixture(id = 'r1', over: Record<string, unknown> = {}) {
  return {
    id,
    redemptionCode: 'A7K2P9X4',
    voucher: { id: 'v1', title: 'Free coffee with breakfast', type: 'FREEBIE' },
    branch: { id: 'b1', name: 'Old Foundry' },
    customerName: 'Sarah K.',
    redeemedAt: '2026-06-21T10:00:00.000Z',
    status: 'VALIDATED',
    validatedAt: '2026-06-21T10:05:00.000Z',
    validationMethod: 'MANUAL',
    validatedByLabel: 'Validated in the portal',
    estimatedSaving: '4.50', // STRING on the wire (Prisma Decimal)
    ...over,
  }
}

export function memberFixture(role: string) {
  return {
    id: 'mm1',
    name: 'Priya Shah',
    email: 'owner@roe.test',
    role,
    status: 'ACTIVE',
    canManageVouchers: role === 'OWNER',
    allBranches: true,
    branchIds: [],
    claimed: true,
    lastLoginAt: '2026-07-01T09:00:00.000Z',
  }
}

// Notification rows: curated fields only (no recipient ids, no customer PII),
// matching the backend select mirrored by lib/api/notifications.ts.
export function notificationFixture(id = 'n1', over: Record<string, unknown> = {}) {
  return {
    id,
    type: 'VOUCHER_APPROVAL_UPDATE',
    title: 'Voucher approved',
    body: 'Your "Free coffee with breakfast" voucher was approved.',
    referenceId: 'v1',
    referenceType: 'VOUCHER',
    isRead: false,
    readAt: null,
    sentAt: '2026-07-01T09:00:00.000Z',
    ...over,
  }
}

// ---------------------------------------------------------------------------
// Route installation
// ---------------------------------------------------------------------------

export interface MockApiOptions {
  role?: RoleFixture
  branches?: Record<string, unknown>[]
  redemptions?: Record<string, unknown>[]
  redemptionsTotal?: number
  unreadCount?: number
  /** Owner-only staff surfaces (/staff AND /staff/app-users): STAFF/BM get 403. */
  staffListAllowed?: boolean
  /** Override the /staff members list (default: a single-member array from memberFixture). */
  members?: Record<string, unknown>[]
  /** Custom (RCV) vouchers list; default []. */
  customVouchers?: Record<string, unknown>[]
  /** Flagship (RMV) vouchers list; default []. */
  flagshipVouchers?: Record<string, unknown>[]
  /** Force a non-200 status for GET /merchant/vouchers/rmv (partial-source resilience case). */
  flagshipVouchersStatus?: number
  /** Force a non-200 status for GET /merchant/vouchers (partial-source resilience case). */
  customVouchersStatus?: number
  /** Notification rows for both the bell popover (recent) and the full list page. */
  notifications?: Record<string, unknown>[]
}

export interface MockApiTracker {
  /** /api/v1 paths that hit the fallback (no explicit model). */
  unmatched: string[]
}

function json(status: number, body: unknown) {
  return { status, contentType: 'application/json', body: JSON.stringify(body) }
}

export async function installMockApi(
  context: BrowserContext,
  opts: MockApiOptions = {},
): Promise<MockApiTracker> {
  const role = opts.role ?? 'OWNER'
  const branches = opts.branches ?? [branchFixture('b1'), branchFixture('b2')]
  const redemptions = opts.redemptions ?? [redemptionFixture()]
  const redemptionsTotal = opts.redemptionsTotal ?? redemptions.length
  const staffListAllowed = opts.staffListAllowed ?? role === 'OWNER'
  const members = opts.members ?? [memberFixture(role === 'ABSENT' ? 'OWNER' : role)]
  const customVouchers = opts.customVouchers ?? []
  const flagshipVouchers = opts.flagshipVouchers ?? []
  const notifications = opts.notifications ?? []
  const tracker: MockApiTracker = { unmatched: [] }

  // Same-origin BFF: refresh mints the access token from the httpOnly cookie.
  await context.route('**/api/merchant-auth/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.endsWith('/refresh')) {
      await route.fulfill(
        json(200, {
          accessToken: 'e2e-access-token',
          merchant: { id: 'm1', businessName: 'Roe Cafe', approvalStatus: 'ACTIVE' },
        }),
      )
      return
    }
    if (url.pathname.endsWith('/logout')) {
      await route.fulfill(json(200, { message: 'ok' }))
      return
    }
    tracker.unmatched.push(url.pathname)
    await route.fulfill(json(404, { error: 'E2E_UNMOCKED', path: url.pathname }))
  })

  // Backend API (cross-origin to the dead loopback port; intercepted pre-network).
  await context.route('**/api/v1/**', async (route) => {
    const url = new URL(route.request().url())
    const p = url.pathname
    const method = route.request().method()

    if (method === 'GET' && p === '/api/v1/merchant/profile') {
      await route.fulfill(json(200, profileFixture(role)))
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/branches') {
      await route.fulfill(json(200, branches))
      return
    }
    const branchMatch = p.match(/^\/api\/v1\/merchant\/branches\/([^/]+)$/)
    if (method === 'GET' && branchMatch) {
      const row = branches.find((b) => (b as { id?: string }).id === branchMatch[1])
      await route.fulfill(row ? json(200, row) : json(404, { error: 'BRANCH_NOT_FOUND' }))
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/redemptions') {
      // Wire-accurate paging: honour the requested offset/limit and SLICE the
      // fixture rows, exactly as the real endpoint pages (a mock that returns
      // the same rows for every offset would mask paging regressions).
      const offset = Number(url.searchParams.get('offset') ?? '0')
      const limit = Number(url.searchParams.get('limit') ?? '25')
      await route.fulfill(
        json(200, {
          items: redemptions.slice(offset, offset + limit),
          total: redemptionsTotal,
          limit,
          offset,
        }),
      )
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/staff/app-users') {
      // Mirrors the real route: ownerCtx (owner-only), same as /staff.
      await route.fulfill(
        staffListAllowed ? json(200, { branches: [] }) : json(403, { error: 'INSUFFICIENT_PERMISSIONS' }),
      )
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/staff') {
      await route.fulfill(
        staffListAllowed
          ? json(200, { members })
          : json(403, { error: 'INSUFFICIENT_PERMISSIONS' }),
      )
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/vouchers') {
      if (opts.customVouchersStatus && opts.customVouchersStatus !== 200) {
        await route.fulfill(json(opts.customVouchersStatus, { error: 'E2E_FORCED_FAILURE' }))
        return
      }
      await route.fulfill(json(200, customVouchers))
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/vouchers/rmv') {
      if (opts.flagshipVouchersStatus && opts.flagshipVouchersStatus !== 200) {
        await route.fulfill(json(opts.flagshipVouchersStatus, { error: 'E2E_FORCED_FAILURE' }))
        return
      }
      await route.fulfill(json(200, flagshipVouchers))
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/notifications/unread-count') {
      await route.fulfill(
        json(200, { count: opts.unreadCount ?? notifications.filter((n) => !(n as { isRead?: boolean }).isRead).length }),
      )
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/notifications') {
      // Wire-accurate paging: honour pageSize (the bell popover requests 5, the
      // full page requests 20) by slicing the fixture rows.
      const page = Number(url.searchParams.get('page') ?? '1')
      const pageSize = Number(url.searchParams.get('pageSize') ?? '20')
      const unreadOnly = url.searchParams.get('unreadOnly') === 'true'
      const source = unreadOnly
        ? notifications.filter((n) => !(n as { isRead?: boolean }).isRead)
        : notifications
      const start = (page - 1) * pageSize
      await route.fulfill(
        json(200, {
          notifications: source.slice(start, start + pageSize),
          page,
          pageSize,
          total: source.length,
        }),
      )
      return
    }
    if (method === 'POST' && /^\/api\/v1\/merchant\/notifications\/[^/]+\/read$/.test(p)) {
      await route.fulfill(json(200, { updated: 1 }))
      return
    }
    if (method === 'POST' && p === '/api/v1/merchant/notifications/read-all') {
      await route.fulfill(json(200, { updated: notifications.length }))
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/onboarding/taxonomy') {
      await route.fulfill(json(200, { categories: [] }))
      return
    }
    // The live/lifecycle home reads both of these on mount.
    if (method === 'GET' && p === '/api/v1/merchant/onboarding/checklist') {
      await route.fulfill(
        json(200, { branch_created: true, contract_signed: true, rmv_configured: true, all_complete: true }),
      )
      return
    }
    if (method === 'GET' && p === '/api/v1/merchant/onboarding/status') {
      await route.fulfill(json(200, { status: 'APPROVED', comment: null, actionedAt: '2026-06-20T10:00:00.000Z' }))
      return
    }

    tracker.unmatched.push(`${method} ${p}`)
    await route.fulfill(json(404, { error: 'E2E_UNMOCKED', path: p }))
  })

  return tracker
}

export async function signIn(context: BrowserContext): Promise<void> {
  // Middleware checks cookie PRESENCE only; the mocked BFF refresh mints the
  // in-memory access token once the client hydrates.
  await context.addCookies([
    { name: SESSION_COOKIE, value: 'e2e', url: BASE_URL },
  ])
}

// ---------------------------------------------------------------------------
// Error guards: every smoke journey asserts a clean browser console.
// ---------------------------------------------------------------------------

export interface ErrorGuards {
  pageErrors: string[]
  consoleErrors: string[]
  assertClean: () => void
}

export function attachErrorGuards(page: Page, expectedConsoleErrorSubstrings: string[] = []): ErrorGuards {
  const pageErrors: string[] = []
  const consoleErrors: string[] = []
  page.on('pageerror', (err) => pageErrors.push(String(err)))
  page.on('console', (msg) => {
    if (msg.type() !== 'error') return
    const text = msg.text()
    // Expected noise: normally none - Failed-resource lines only appear if a
    // request escaped the mock boundary (dead loopback port), which IS a
    // finding. The one documented exception is a spec that deliberately mocks
    // a 500 to pin Promise.allSettled resilience: Chromium logs a "Failed to
    // load resource" devtools line for ANY non-2xx fetch response, which is
    // expected browser behaviour for that forced failure, not an app bug. Such
    // a spec must opt in explicitly via expectedConsoleErrorSubstrings so the
    // guard stays strict everywhere else.
    if (expectedConsoleErrorSubstrings.some((s) => text.includes(s))) return
    consoleErrors.push(text)
  })
  return {
    pageErrors,
    consoleErrors,
    assertClean: () => {
      expect(pageErrors, 'uncaught page errors').toEqual([])
      expect(consoleErrors, 'browser console errors').toEqual([])
    },
  }
}
