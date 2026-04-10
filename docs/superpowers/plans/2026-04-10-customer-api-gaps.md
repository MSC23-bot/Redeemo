# Customer-Facing API Gaps (Phase 3B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all customer-facing API routes missing before Phase 3C (mobile app) and 3D (website) can be implemented.

**Architecture:** Two scopes in a single `src/api/customer/` plugin: an open (unauthenticated) scope for discovery routes, and an authenticated scope for profile, favourites, and personalised data. Both scopes use the established Fastify + Prisma pattern: `plugin.ts` handles scope wiring, `routes.ts` handles HTTP parsing, `service.ts` contains business logic. Tests mock the service layer for route tests, matching existing patterns in `tests/api/`.

**Key product rules preserved:**
- Discovery (merchants, vouchers, search, categories, home feed) is open to guests — no auth required
- Redemption is mobile-only by product design — no redemption routes are added here
- `isRedeemedThisCycle` returns `false` for guests; only checked against DB for authenticated users

**Tech Stack:** Node.js 24, TypeScript, Fastify, Prisma 7 (`generated/prisma/client`), Vitest, Zod — identical to all existing API code.

---

## File Structure

**New files:**
- `src/api/customer/plugin.ts` — two-scope plugin (open + authenticated)
- `src/api/customer/discovery/routes.ts` — home feed, merchant profile, branch list, voucher detail, search, categories
- `src/api/customer/discovery/service.ts` — all discovery queries
- `src/api/customer/profile/routes.ts` — GET + PATCH profile, PUT interests, POST change-password
- `src/api/customer/profile/service.ts` — profile update, interests, password change
- `src/api/customer/favourites/routes.ts` — merchant + voucher favourite CRUD
- `src/api/customer/favourites/service.ts` — favourite toggle and list logic

**Modified files:**
- `src/api/app.ts` — register `customerPlugin`
- `src/api/shared/errors.ts` — add new error codes

**New test files:**
- `tests/api/customer/discovery.test.ts`
- `tests/api/customer/profile.test.ts`
- `tests/api/customer/favourites.test.ts`

---

## Task 1: Add new error codes

**Files:**
- Modify: `src/api/shared/errors.ts`

- [ ] **Step 1: Write the failing tests**

Add at the end of the existing `describe` block in `tests/api/shared/errors.test.ts`:

```typescript
it('USER_NOT_FOUND is defined', () => {
  expect(ERROR_DEFINITIONS.USER_NOT_FOUND.statusCode).toBe(404)
})
it('CURRENT_PASSWORD_INCORRECT is defined', () => {
  expect(ERROR_DEFINITIONS.CURRENT_PASSWORD_INCORRECT.statusCode).toBe(400)
})
it('MERCHANT_UNAVAILABLE is defined', () => {
  expect(ERROR_DEFINITIONS.MERCHANT_UNAVAILABLE.statusCode).toBe(404)
})
it('SEARCH_QUERY_REQUIRED is defined', () => {
  expect(ERROR_DEFINITIONS.SEARCH_QUERY_REQUIRED.statusCode).toBe(400)
})
it('ALREADY_FAVOURITED is defined', () => {
  expect(ERROR_DEFINITIONS.ALREADY_FAVOURITED.statusCode).toBe(409)
})
it('FAVOURITE_NOT_FOUND is defined', () => {
  expect(ERROR_DEFINITIONS.FAVOURITE_NOT_FOUND.statusCode).toBe(404)
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/api/shared/errors.test.ts
```

Expected: FAIL — properties do not exist on `ERROR_DEFINITIONS`

- [ ] **Step 3: Add error codes to `src/api/shared/errors.ts`**

Add these entries after the `BRANCH_ACCESS_DENIED` line:

```typescript
  USER_NOT_FOUND:               { statusCode: 404, message: 'User not found.' },
  CURRENT_PASSWORD_INCORRECT:   { statusCode: 400, message: 'Your current password is incorrect.' },
  MERCHANT_UNAVAILABLE:         { statusCode: 404, message: 'This merchant is no longer available.' },
  SEARCH_QUERY_REQUIRED:        { statusCode: 400, message: 'A search query or category is required.' },
  ALREADY_FAVOURITED:           { statusCode: 409, message: 'Already in your favourites.' },
  FAVOURITE_NOT_FOUND:          { statusCode: 404, message: 'This item is not in your favourites.' },
```

- [ ] **Step 4: Run to verify they pass**

```bash
npx vitest run tests/api/shared/errors.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing tests pass

- [ ] **Step 6: Commit**

```bash
git add src/api/shared/errors.ts tests/api/shared/errors.test.ts
git commit -m "feat: add customer API error codes"
```

---

## Task 2: Customer plugin — two-scope architecture

**Files:**
- Create: `src/api/customer/plugin.ts`
- Modify: `src/api/app.ts`

The plugin registers two scopes:
1. **Open scope** — no auth hook, wraps all discovery routes
2. **Auth scope** — `authenticateCustomer` hook, wraps profile and favourites routes

- [ ] **Step 1: Write a baseline test to confirm 401 on auth-required routes and 200 on open routes (once routes exist)**

Create `tests/api/customer/discovery.test.ts` with the auth boundary test:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed:              vi.fn(),
  getCustomerMerchant:      vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher:       vi.fn(),
  searchMerchants:          vi.fn(),
  listActiveCategories:     vi.fn(),
}))

import {
  getHomeFeed,
  getCustomerMerchant,
  getCustomerMerchantBranches,
  getCustomerVoucher,
  searchMerchants,
  listActiveCategories,
} from '../../../src/api/customer/discovery/service'

describe('customer discovery routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant:              { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      branch:                { findMany: vi.fn() },
      voucher:               { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn() },
      featuredMerchant:      { findMany: vi.fn() },
      category:              { findMany: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/customer/home returns 200 without auth token (guest access)', async () => {
    ;(getHomeFeed as any).mockResolvedValue({ featured: [], trending: [] })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/home' })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/merchants/:id returns 200 without auth token (guest access)', async () => {
    ;(getCustomerMerchant as any).mockResolvedValue({ id: 'merchant-1', businessName: 'Acme' })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/merchants/merchant-1' })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/search returns 400 without q or categoryId (guest access)', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search' })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify it fails (routes not registered yet)**

```bash
npx vitest run tests/api/customer/discovery.test.ts
```

Expected: FAIL — routes return 404

- [ ] **Step 3: Create `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

async function customerPlugin(app: FastifyInstance) {
  // Open scope — no auth required (discovery: home, merchants, vouchers, search, categories)
  app.register(async (open) => {
    // Discovery route sub-plugins registered here in Task 3
  })

  // Authenticated scope — customer JWT required
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    // Profile and favourites route sub-plugins registered here in Tasks 4 and 5
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 4: Register in `src/api/app.ts`**

Add import:

```typescript
import customerPlugin from './customer/plugin'
```

Add registration after `await app.register(redemptionPlugin)`:

```typescript
await app.register(customerPlugin)
```

- [ ] **Step 5: Run full suite — confirms plugin registers without error**

```bash
npx vitest run
```

Expected: all existing tests pass; discovery tests still fail on 404 (routes not yet added)

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/plugin.ts src/api/app.ts tests/api/customer/discovery.test.ts
git commit -m "feat: scaffold two-scope customer plugin"
```

---

## Task 3: Discovery routes — home feed, merchant, voucher, search, categories

**Files:**
- Create: `src/api/customer/discovery/service.ts`
- Create: `src/api/customer/discovery/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Modify: `tests/api/customer/discovery.test.ts`

**Routes (all open — no auth required):**
- `GET /api/v1/customer/home` — featured merchants (active, within date range)
- `GET /api/v1/customer/merchants/:id` — merchant profile (ACTIVE only) with branches, vouchers, amenities, review summary
- `GET /api/v1/customer/merchants/:id/branches` — active branches for branch selector
- `GET /api/v1/customer/vouchers/:id` — voucher detail; `isRedeemedThisCycle` derived from optional `userId` (via optional auth header)
- `GET /api/v1/customer/search` — merchant search by text and/or category
- `GET /api/v1/customer/categories` — active categories with at least one ACTIVE merchant

- [ ] **Step 1: Expand `tests/api/customer/discovery.test.ts` with full route tests**

Replace the file contents with:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/discovery/service', () => ({
  getHomeFeed:                 vi.fn(),
  getCustomerMerchant:         vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
  getCustomerVoucher:          vi.fn(),
  searchMerchants:             vi.fn(),
  listActiveCategories:        vi.fn(),
}))

import {
  getHomeFeed,
  getCustomerMerchant,
  getCustomerMerchantBranches,
  getCustomerVoucher,
  searchMerchants,
  listActiveCategories,
} from '../../../src/api/customer/discovery/service'

describe('customer discovery routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant:              { findUnique: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      branch:                { findMany: vi.fn() },
      voucher:               { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn() },
      featuredMerchant:      { findMany: vi.fn() },
      category:              { findMany: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // Home feed
  it('GET /api/v1/customer/home returns 200 without token (guest)', async () => {
    ;(getHomeFeed as any).mockResolvedValue({ featured: [], trending: [] })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/home' })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/home returns featured merchants', async () => {
    const feed = { featured: [{ id: 'merchant-1', businessName: 'Acme' }], trending: [] }
    ;(getHomeFeed as any).mockResolvedValue(feed)
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/home' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).featured).toHaveLength(1)
  })

  // Merchant profile
  it('GET /api/v1/customer/merchants/:id returns 200 without token (guest)', async () => {
    ;(getCustomerMerchant as any).mockResolvedValue({ id: 'merchant-1', businessName: 'Acme', vouchers: [], branches: [] })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/merchants/merchant-1' })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/merchants/:id returns 404 when MERCHANT_UNAVAILABLE', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(getCustomerMerchant as any).mockRejectedValue(new AppError('MERCHANT_UNAVAILABLE'))
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/merchants/merchant-1' })
    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_UNAVAILABLE')
  })

  // Branch list
  it('GET /api/v1/customer/merchants/:id/branches returns 200 without token (guest)', async () => {
    ;(getCustomerMerchantBranches as any).mockResolvedValue([{ id: 'b1', name: 'Main' }])
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/merchants/merchant-1/branches' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  // Voucher detail
  it('GET /api/v1/customer/vouchers/:id returns 200 without token, isRedeemedThisCycle=false', async () => {
    ;(getCustomerVoucher as any).mockResolvedValue({ id: 'v1', isRedeemedThisCycle: false })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/vouchers/v1' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).isRedeemedThisCycle).toBe(false)
  })

  it('GET /api/v1/customer/vouchers/:id returns isRedeemedThisCycle=true when authenticated and redeemed', async () => {
    ;(getCustomerVoucher as any).mockResolvedValue({ id: 'v1', isRedeemedThisCycle: true })
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).isRedeemedThisCycle).toBe(true)
  })

  // Search
  it('GET /api/v1/customer/search returns 200 with q param (guest)', async () => {
    ;(searchMerchants as any).mockResolvedValue({ merchants: [], total: 0 })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search?q=coffee' })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/search returns 200 with categoryId param (guest)', async () => {
    ;(searchMerchants as any).mockResolvedValue({ merchants: [], total: 0 })
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search?categoryId=cat-1' })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/search returns 400 without q or categoryId', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search' })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SEARCH_QUERY_REQUIRED')
  })

  // Categories
  it('GET /api/v1/customer/categories returns 200 without token (guest)', async () => {
    ;(listActiveCategories as any).mockResolvedValue([{ id: 'cat-1', name: 'Food & Drink' }])
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/categories' })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/api/customer/discovery.test.ts
```

Expected: FAIL — module `src/api/customer/discovery/service` not found

- [ ] **Step 3: Create `src/api/customer/discovery/service.ts`**

```typescript
import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

// ─── Home Feed ───────────────────────────────────────────────────────────────

export async function getHomeFeed(prisma: PrismaClient) {
  const now = new Date()

  const featured = await prisma.featuredMerchant.findMany({
    where: {
      isActive:  true,
      startDate: { lte: now },
      endDate:   { gte: now },
      merchant:  { status: MerchantStatus.ACTIVE },
    },
    select: {
      id:        true,
      radiusMiles: true,
      merchant: {
        select: {
          id:           true,
          businessName: true,
          tradingName:  true,
          logoUrl:      true,
          bannerUrl:    true,
          description:  true,
          primaryCategory: { select: { id: true, name: true } },
          vouchers: {
            where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
            select: { id: true, title: true, estimatedSaving: true, type: true },
            take: 2,
          },
        },
      },
    },
    orderBy: { startDate: 'asc' },
  })

  return { featured: featured.map(f => ({ ...f.merchant, featuredId: f.id, radiusMiles: f.radiusMiles })) }
}

// ─── Merchant Profile ─────────────────────────────────────────────────────────

export async function getCustomerMerchant(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: {
      id:           true,
      businessName: true,
      tradingName:  true,
      status:       true,
      logoUrl:      true,
      bannerUrl:    true,
      description:  true,
      websiteUrl:   true,
      primaryCategory: { select: { id: true, name: true } },
      categories: {
        select: { category: { select: { id: true, name: true } } },
      },
      vouchers: {
        where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
        select: {
          id: true, title: true, type: true, description: true,
          terms: true, imageUrl: true, estimatedSaving: true,
          expiryDate: true, code: true,
        },
        orderBy: { createdAt: 'desc' },
      },
      branches: {
        where: { isActive: true },
        select: {
          id: true, name: true, isMainBranch: true,
          addressLine1: true, addressLine2: true, city: true, postcode: true,
          phone: true, latitude: true, longitude: true,
          openingHours: {
            select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
            orderBy: { dayOfWeek: 'asc' },
          },
          amenities: {
            select: { amenity: { select: { id: true, name: true, iconUrl: true } } },
          },
          _count: { select: { reviews: { where: { isDeleted: false } } } },
        },
        orderBy: { isMainBranch: 'desc' },
      },
    },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  return merchant
}

// ─── Branch List (for branch selector in redemption flow) ────────────────────

export async function getCustomerMerchantBranches(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    select: { status: true },
  })
  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  return prisma.branch.findMany({
    where: { merchantId, isActive: true },
    select: {
      id: true, name: true, isMainBranch: true,
      addressLine1: true, addressLine2: true, city: true, postcode: true,
      phone: true, latitude: true, longitude: true,
      openingHours: {
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { isMainBranch: 'desc' },
  })
}

// ─── Voucher Detail ───────────────────────────────────────────────────────────

export async function getCustomerVoucher(
  prisma: PrismaClient,
  voucherId: string,
  userId: string | null   // null for guest — returns isRedeemedThisCycle: false
) {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    select: {
      id: true, title: true, type: true, description: true,
      terms: true, imageUrl: true, estimatedSaving: true,
      expiryDate: true, code: true, status: true, approvalStatus: true,
      merchant: {
        select: {
          id: true, businessName: true, tradingName: true, logoUrl: true, status: true,
        },
      },
    },
  })

  if (
    !voucher ||
    voucher.status         !== VoucherStatus.ACTIVE  ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  let isRedeemedThisCycle = false
  if (userId) {
    const cycleState = await prisma.userVoucherCycleState.findUnique({
      where: { userId_voucherId: { userId, voucherId } },
      select: { isRedeemedInCurrentCycle: true },
    })
    isRedeemedThisCycle = cycleState?.isRedeemedInCurrentCycle ?? false
  }

  return { ...voucher, isRedeemedThisCycle }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function searchMerchants(
  prisma: PrismaClient,
  params: { q?: string; categoryId?: string; limit: number; offset: number }
) {
  const { q, categoryId, limit, offset } = params

  const where: any = { status: MerchantStatus.ACTIVE }

  if (q) {
    where.OR = [
      { businessName: { contains: q, mode: 'insensitive' } },
      { tradingName:  { contains: q, mode: 'insensitive' } },
      { description:  { contains: q, mode: 'insensitive' } },
    ]
  }

  if (categoryId) {
    where.AND = [
      {
        OR: [
          { primaryCategoryId: categoryId },
          { categories: { some: { categoryId: categoryId } } },
        ],
      },
    ]
  }

  const [merchants, total] = await Promise.all([
    prisma.merchant.findMany({
      where,
      select: {
        id: true, businessName: true, tradingName: true,
        logoUrl: true, description: true,
        primaryCategory: { select: { id: true, name: true } },
        vouchers: {
          where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
          select: { id: true, title: true, estimatedSaving: true, type: true },
          take: 2,
        },
        branches: {
          where: { isActive: true },
          select: { id: true, city: true, latitude: true, longitude: true },
        },
      },
      orderBy: { businessName: 'asc' },
      take: limit,
      skip: offset,
    }),
    prisma.merchant.count({ where }),
  ])

  return { merchants, total }
}

// ─── Categories ───────────────────────────────────────────────────────────────

export async function listActiveCategories(prisma: PrismaClient) {
  return prisma.category.findMany({
    where: {
      isActive: true,
      merchants: { some: { merchant: { status: MerchantStatus.ACTIVE } } },
    },
    select: { id: true, name: true, iconUrl: true },
    orderBy: { sortOrder: 'asc' },
  })
}
```

- [ ] **Step 4: Create `src/api/customer/discovery/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import {
  getHomeFeed, getCustomerMerchant, getCustomerMerchantBranches,
  getCustomerVoucher, searchMerchants, listActiveCategories,
} from './service'

const idParam      = z.object({ id: z.string().min(1) })
const searchQuery  = z.object({
  q:          z.string().optional(),
  categoryId: z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
  offset:     z.coerce.number().int().min(0).default(0),
})

// Extract userId from bearer token without hard-failing if absent
function optionalUserId(req: FastifyRequest): string | null {
  try {
    const auth = req.headers.authorization
    if (!auth?.startsWith('Bearer ')) return null
    // jwt.decode is synchronous and does not verify — safe for optional context only
    const decoded = (req.server.jwt as any).customer.decode(auth.slice(7)) as any
    return decoded?.sub ?? null
  } catch {
    return null
  }
}

export async function customerDiscoveryRoutes(app: FastifyInstance) {
  // GET /api/v1/customer/home — featured merchants (no auth)
  app.get('/api/v1/customer/home', async (_req: FastifyRequest, reply) => {
    const feed = await getHomeFeed(app.prisma)
    return reply.send(feed)
  })

  // GET /api/v1/customer/merchants/:id — merchant profile (no auth)
  app.get('/api/v1/customer/merchants/:id', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const merchant = await getCustomerMerchant(app.prisma, id)
    return reply.send(merchant)
  })

  // GET /api/v1/customer/merchants/:id/branches — branch list for redemption selector (no auth)
  app.get('/api/v1/customer/merchants/:id/branches', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const branches = await getCustomerMerchantBranches(app.prisma, id)
    return reply.send(branches)
  })

  // GET /api/v1/customer/vouchers/:id — voucher detail; optional userId for redeemed state (no auth required)
  app.get('/api/v1/customer/vouchers/:id', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const userId = optionalUserId(req)
    const voucher = await getCustomerVoucher(app.prisma, id, userId)
    return reply.send(voucher)
  })

  // GET /api/v1/customer/search — merchant search (no auth)
  app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
    const params = searchQuery.parse(req.query)
    if (!params.q && !params.categoryId) throw new AppError('SEARCH_QUERY_REQUIRED')
    const results = await searchMerchants(app.prisma, params)
    return reply.send(results)
  })

  // GET /api/v1/customer/categories — active categories (no auth)
  app.get('/api/v1/customer/categories', async (_req: FastifyRequest, reply) => {
    const categories = await listActiveCategories(app.prisma)
    return reply.send(categories)
  })
}
```

- [ ] **Step 5: Register in `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerDiscoveryRoutes } from './discovery/routes'

async function customerPlugin(app: FastifyInstance) {
  // Open scope — no auth (discovery)
  app.register(async (open) => {
    await open.register(customerDiscoveryRoutes)
  })

  // Authenticated scope — customer JWT required
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    // Profile and favourites registered in Tasks 4 and 5
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 6: Run discovery tests**

```bash
npx vitest run tests/api/customer/discovery.test.ts
```

Expected: PASS — all tests pass

- [ ] **Step 7: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/discovery/ src/api/customer/plugin.ts tests/api/customer/discovery.test.ts
git commit -m "feat: customer discovery routes — home, merchant, voucher, search, categories"
```

---

## Task 4: Customer profile — read, update, interests, change password

**Files:**
- Create: `src/api/customer/profile/service.ts`
- Create: `src/api/customer/profile/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Create: `tests/api/customer/profile.test.ts`

**Routes (all require customer JWT):**
- `GET /api/v1/customer/profile` — full profile
- `PATCH /api/v1/customer/profile` — update editable fields (name, dob, gender, address, postcode, profileImageUrl, newsletterConsent)
- `GET /api/v1/customer/profile/interests` — list all available interests + which ones user has selected
- `PUT /api/v1/customer/profile/interests` — replace user's selected interests
- `POST /api/v1/customer/profile/change-password` — change password while authenticated (requires current password; enforces `passwordSchema`: 8+ chars, upper, lower, number, special character)

- [ ] **Step 1: Write the failing tests**

Create `tests/api/customer/profile.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/profile/service', () => ({
  getCustomerProfile:     vi.fn(),
  updateCustomerProfile:  vi.fn(),
  getCustomerInterests:   vi.fn(),
  setCustomerInterests:   vi.fn(),
  changeCustomerPassword: vi.fn(),
}))

import {
  getCustomerProfile,
  updateCustomerProfile,
  getCustomerInterests,
  setCustomerInterests,
  changeCustomerPassword,
} from '../../../src/api/customer/profile/service'

describe('customer profile routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      user:         { findUnique: vi.fn(), update: vi.fn() },
      interest:     { findMany: vi.fn() },
      userInterest: { findMany: vi.fn(), deleteMany: vi.fn(), createMany: vi.fn() },
      auditLog:     { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/customer/profile returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/profile' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/customer/profile returns 200 with profile', async () => {
    ;(getCustomerProfile as any).mockResolvedValue({ id: 'user-1', firstName: 'Jane', email: 'jane@example.com' })
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).firstName).toBe('Jane')
  })

  it('PATCH /api/v1/customer/profile returns 200 on valid update', async () => {
    ;(updateCustomerProfile as any).mockResolvedValue({ id: 'user-1', city: 'London' })
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { city: 'London' },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).city).toBe('London')
  })

  it('GET /api/v1/customer/profile/interests returns 200', async () => {
    ;(getCustomerInterests as any).mockResolvedValue({
      available: [{ id: 'i1', name: 'Food' }],
      selected:  ['i1'],
    })
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customer/profile/interests',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).selected).toContain('i1')
  })

  it('PUT /api/v1/customer/profile/interests returns 200', async () => {
    ;(setCustomerInterests as any).mockResolvedValue({ selected: ['i1', 'i2'] })
    const res = await app.inject({
      method: 'PUT', url: '/api/v1/customer/profile/interests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { interestIds: ['i1', 'i2'] },
    })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/customer/profile/change-password returns 200', async () => {
    ;(changeCustomerPassword as any).mockResolvedValue({ message: 'Password updated.' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/customer/profile/change-password returns 400 without newPassword', async () => {
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'OldPass1!' },
    })
    expect(res.statusCode).toBe(400)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/api/customer/profile.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/api/customer/profile/service.ts`**

```typescript
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { hashPassword, verifyPassword } from '../../shared/password'
import { writeAuditLog } from '../../shared/audit'

export async function getCustomerProfile(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true, firstName: true, lastName: true,
      email: true, phone: true, profileImageUrl: true,
      dateOfBirth: true, gender: true,
      addressLine1: true, addressLine2: true, city: true, postcode: true,
      newsletterConsent: true, emailVerified: true, phoneVerified: true,
      createdAt: true,
      interests: { select: { interest: { select: { id: true, name: true } } } },
    },
  })
  if (!user) throw new AppError('USER_NOT_FOUND')
  return {
    ...user,
    interests: user.interests.map(ui => ui.interest),
  }
}

export async function updateCustomerProfile(
  prisma: PrismaClient,
  userId: string,
  data: {
    firstName?: string
    lastName?: string
    dateOfBirth?: string
    gender?: string
    addressLine1?: string
    addressLine2?: string
    city?: string
    postcode?: string
    profileImageUrl?: string
    newsletterConsent?: boolean
  },
  ctx: { ipAddress: string; userAgent: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new AppError('USER_NOT_FOUND')

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.firstName        !== undefined ? { firstName:        data.firstName        } : {}),
      ...(data.lastName         !== undefined ? { lastName:         data.lastName         } : {}),
      ...(data.dateOfBirth      !== undefined ? { dateOfBirth:      new Date(data.dateOfBirth) } : {}),
      ...(data.gender           !== undefined ? { gender:           data.gender           } : {}),
      ...(data.addressLine1     !== undefined ? { addressLine1:     data.addressLine1     } : {}),
      ...(data.addressLine2     !== undefined ? { addressLine2:     data.addressLine2     } : {}),
      ...(data.city             !== undefined ? { city:             data.city             } : {}),
      ...(data.postcode         !== undefined ? { postcode:         data.postcode         } : {}),
      ...(data.profileImageUrl  !== undefined ? { profileImageUrl:  data.profileImageUrl  } : {}),
      ...(data.newsletterConsent !== undefined ? { newsletterConsent: data.newsletterConsent } : {}),
    },
    select: {
      id: true, firstName: true, lastName: true, email: true, phone: true,
      profileImageUrl: true, dateOfBirth: true, gender: true,
      addressLine1: true, addressLine2: true, city: true, postcode: true,
      newsletterConsent: true,
    },
  })

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'PROFILE_UPDATED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  })

  return updated
}

export async function getCustomerInterests(prisma: PrismaClient, userId: string) {
  const [available, userInterests] = await Promise.all([
    prisma.interest.findMany({
      where: { isActive: true },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    prisma.userInterest.findMany({
      where: { userId },
      select: { interestId: true },
    }),
  ])

  return {
    available,
    selected: userInterests.map(ui => ui.interestId),
  }
}

export async function setCustomerInterests(
  prisma: PrismaClient,
  userId: string,
  interestIds: string[]
) {
  // Full replace — delete existing then insert new
  await prisma.userInterest.deleteMany({ where: { userId } })

  if (interestIds.length > 0) {
    await prisma.userInterest.createMany({
      data: interestIds.map(interestId => ({ userId, interestId })),
      skipDuplicates: true,
    })
  }

  return { selected: interestIds }
}

export async function changeCustomerPassword(
  prisma: PrismaClient,
  userId: string,
  data: { currentPassword: string; newPassword: string },
  ctx: { ipAddress: string; userAgent: string }
) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, passwordHash: true },
  })
  if (!user || !user.passwordHash) throw new AppError('USER_NOT_FOUND')

  const currentValid = await verifyPassword(data.currentPassword, user.passwordHash)
  if (!currentValid) throw new AppError('CURRENT_PASSWORD_INCORRECT')

  const newHash = await hashPassword(data.newPassword)
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash: newHash },
  })

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'PASSWORD_CHANGED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  })

  return { message: 'Password updated.' }
}
```

- [ ] **Step 4: Create `src/api/customer/profile/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { passwordSchema } from '../../shared/schemas'
import {
  getCustomerProfile, updateCustomerProfile,
  getCustomerInterests, setCustomerInterests,
  changeCustomerPassword,
} from './service'

const updateProfileBody = z.object({
  firstName:         z.string().min(1).max(50).optional(),
  lastName:          z.string().min(1).max(50).optional(),
  dateOfBirth:       z.string().datetime({ offset: true }).optional(),
  gender:            z.string().max(30).optional(),
  addressLine1:      z.string().max(100).optional(),
  addressLine2:      z.string().max(100).optional(),
  city:              z.string().max(80).optional(),
  postcode:          z.string().max(10).optional(),
  profileImageUrl:   z.string().url().optional(),
  newsletterConsent: z.boolean().optional(),
})

const setInterestsBody = z.object({
  interestIds: z.array(z.string()).max(20),
})

const changePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword:     passwordSchema,
})

export async function customerProfileRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/profile'

  app.get(prefix, async (req: FastifyRequest, reply) => {
    const profile = await getCustomerProfile(app.prisma, req.user.sub)
    return reply.send(profile)
  })

  app.patch(prefix, async (req: FastifyRequest, reply) => {
    const body = updateProfileBody.parse(req.body)
    const updated = await updateCustomerProfile(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(updated)
  })

  app.get(`${prefix}/interests`, async (req: FastifyRequest, reply) => {
    const result = await getCustomerInterests(app.prisma, req.user.sub)
    return reply.send(result)
  })

  app.put(`${prefix}/interests`, async (req: FastifyRequest, reply) => {
    const { interestIds } = setInterestsBody.parse(req.body)
    const result = await setCustomerInterests(app.prisma, req.user.sub, interestIds)
    return reply.send(result)
  })

  app.post(`${prefix}/change-password`, async (req: FastifyRequest, reply) => {
    const body = changePasswordBody.parse(req.body)
    const result = await changeCustomerPassword(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
```

- [ ] **Step 5: Register in `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerDiscoveryRoutes } from './discovery/routes'
import { customerProfileRoutes }   from './profile/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (open) => {
    await open.register(customerDiscoveryRoutes)
  })

  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerProfileRoutes)
    // Favourites registered in Task 5
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 6: Run profile tests**

```bash
npx vitest run tests/api/customer/profile.test.ts
```

Expected: PASS — all 7 tests pass

- [ ] **Step 7: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/profile/ src/api/customer/plugin.ts tests/api/customer/profile.test.ts
git commit -m "feat: customer profile routes — read, update, interests, change-password"
```

---

## Task 5: Favourites — merchants and vouchers

**Files:**
- Create: `src/api/customer/favourites/service.ts`
- Create: `src/api/customer/favourites/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Create: `tests/api/customer/favourites.test.ts`

**Routes (all require customer JWT):**
- `POST /api/v1/customer/favourites/merchants/:id`
- `DELETE /api/v1/customer/favourites/merchants/:id`
- `GET /api/v1/customer/favourites/merchants`
- `POST /api/v1/customer/favourites/vouchers/:id`
- `DELETE /api/v1/customer/favourites/vouchers/:id`
- `GET /api/v1/customer/favourites/vouchers`

List routes silently exclude items whose merchant/voucher is no longer ACTIVE+APPROVED. The frontend receives a shorter list — no separate inactive-signal in this phase.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/customer/favourites.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/favourites/service', () => ({
  addFavouriteMerchant:    vi.fn(),
  removeFavouriteMerchant: vi.fn(),
  listFavouriteMerchants:  vi.fn(),
  addFavouriteVoucher:     vi.fn(),
  removeFavouriteVoucher:  vi.fn(),
  listFavouriteVouchers:   vi.fn(),
}))

import {
  addFavouriteMerchant,
  removeFavouriteMerchant,
  listFavouriteMerchants,
  addFavouriteVoucher,
  removeFavouriteVoucher,
  listFavouriteVouchers,
} from '../../../src/api/customer/favourites/service'

describe('customer favourites routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      favouriteMerchant: { create: vi.fn(), delete: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      favouriteVoucher:  { create: vi.fn(), delete: vi.fn(), findMany: vi.fn(), findUnique: vi.fn() },
      auditLog:          { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/customer/favourites/merchants returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/favourites/merchants' })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/customer/favourites/merchants/:id returns 201', async () => {
    ;(addFavouriteMerchant as any).mockResolvedValue({ id: 'fav-1' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(201)
  })

  it('POST /api/v1/customer/favourites/merchants/:id returns 409 when already favourited', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(addFavouriteMerchant as any).mockRejectedValue(new AppError('ALREADY_FAVOURITED'))
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_FAVOURITED')
  })

  it('DELETE /api/v1/customer/favourites/merchants/:id returns 200', async () => {
    ;(removeFavouriteMerchant as any).mockResolvedValue({ removed: true })
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/favourites/merchants returns 200 with list', async () => {
    ;(listFavouriteMerchants as any).mockResolvedValue([{ id: 'merchant-1', businessName: 'Acme' }])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customer/favourites/merchants',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/customer/favourites/vouchers/:id returns 201', async () => {
    ;(addFavouriteVoucher as any).mockResolvedValue({ id: 'fav-v-1' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/customer/favourites/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(201)
  })

  it('DELETE /api/v1/customer/favourites/vouchers/:id returns 200', async () => {
    ;(removeFavouriteVoucher as any).mockResolvedValue({ removed: true })
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/customer/favourites/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/favourites/vouchers returns 200 with list', async () => {
    ;(listFavouriteVouchers as any).mockResolvedValue([{ id: 'v1', title: 'Free coffee' }])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/customer/favourites/vouchers',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/api/customer/favourites.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/api/customer/favourites/service.ts`**

```typescript
import {
  PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

export async function addFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  const existing = await prisma.favouriteMerchant.findUnique({
    where: { userId_merchantId: { userId, merchantId } },
  })
  if (existing) throw new AppError('ALREADY_FAVOURITED')

  return prisma.favouriteMerchant.create({
    data: { userId, merchantId },
    select: { id: true, merchantId: true, createdAt: true },
  })
}

export async function removeFavouriteMerchant(prisma: PrismaClient, userId: string, merchantId: string) {
  const existing = await prisma.favouriteMerchant.findUnique({
    where: { userId_merchantId: { userId, merchantId } },
  })
  if (!existing) throw new AppError('FAVOURITE_NOT_FOUND')

  await prisma.favouriteMerchant.delete({ where: { userId_merchantId: { userId, merchantId } } })
  return { removed: true }
}

export async function listFavouriteMerchants(prisma: PrismaClient, userId: string) {
  const rows = await prisma.favouriteMerchant.findMany({
    where: { userId },
    select: {
      createdAt: true,
      merchant: {
        select: {
          id: true, businessName: true, tradingName: true, logoUrl: true, status: true,
          primaryCategory: { select: { id: true, name: true } },
          vouchers: {
            where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
            select: { id: true, title: true, estimatedSaving: true, type: true },
            take: 2,
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows
    .filter(r => r.merchant.status === MerchantStatus.ACTIVE)
    .map(r => ({ ...r.merchant, favouritedAt: r.createdAt }))
}

export async function addFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  const existing = await prisma.favouriteVoucher.findUnique({
    where: { userId_voucherId: { userId, voucherId } },
  })
  if (existing) throw new AppError('ALREADY_FAVOURITED')

  return prisma.favouriteVoucher.create({
    data: { userId, voucherId },
    select: { id: true, voucherId: true, createdAt: true },
  })
}

export async function removeFavouriteVoucher(prisma: PrismaClient, userId: string, voucherId: string) {
  const existing = await prisma.favouriteVoucher.findUnique({
    where: { userId_voucherId: { userId, voucherId } },
  })
  if (!existing) throw new AppError('FAVOURITE_NOT_FOUND')

  await prisma.favouriteVoucher.delete({ where: { userId_voucherId: { userId, voucherId } } })
  return { removed: true }
}

export async function listFavouriteVouchers(prisma: PrismaClient, userId: string) {
  const rows = await prisma.favouriteVoucher.findMany({
    where: { userId },
    select: {
      createdAt: true,
      voucher: {
        select: {
          id: true, title: true, type: true, estimatedSaving: true,
          imageUrl: true, status: true, approvalStatus: true,
          merchant: {
            select: { id: true, businessName: true, logoUrl: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return rows
    .filter(r =>
      r.voucher.status         === VoucherStatus.ACTIVE &&
      r.voucher.approvalStatus === ApprovalStatus.APPROVED &&
      r.voucher.merchant.status === MerchantStatus.ACTIVE
    )
    .map(r => ({ ...r.voucher, favouritedAt: r.createdAt }))
}
```

- [ ] **Step 4: Create `src/api/customer/favourites/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  addFavouriteMerchant, removeFavouriteMerchant, listFavouriteMerchants,
  addFavouriteVoucher,  removeFavouriteVoucher,  listFavouriteVouchers,
} from './service'

const idParam = z.object({ id: z.string().min(1) })

export async function customerFavouritesRoutes(app: FastifyInstance) {
  const base = '/api/v1/customer/favourites'

  app.post(`${base}/merchants/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await addFavouriteMerchant(app.prisma, req.user.sub, id)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/merchants/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await removeFavouriteMerchant(app.prisma, req.user.sub, id)
    return reply.send(result)
  })

  app.get(`${base}/merchants`, async (req: FastifyRequest, reply) => {
    const result = await listFavouriteMerchants(app.prisma, req.user.sub)
    return reply.send(result)
  })

  app.post(`${base}/vouchers/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await addFavouriteVoucher(app.prisma, req.user.sub, id)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/vouchers/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await removeFavouriteVoucher(app.prisma, req.user.sub, id)
    return reply.send(result)
  })

  app.get(`${base}/vouchers`, async (req: FastifyRequest, reply) => {
    const result = await listFavouriteVouchers(app.prisma, req.user.sub)
    return reply.send(result)
  })
}
```

- [ ] **Step 5: Register in `src/api/customer/plugin.ts` (final state)**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerDiscoveryRoutes }  from './discovery/routes'
import { customerProfileRoutes }    from './profile/routes'
import { customerFavouritesRoutes } from './favourites/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (open) => {
    await open.register(customerDiscoveryRoutes)
  })

  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerProfileRoutes)
    await scoped.register(customerFavouritesRoutes)
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 6: Run favourites tests**

```bash
npx vitest run tests/api/customer/favourites.test.ts
```

Expected: PASS — all 8 tests pass

- [ ] **Step 7: Run full suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/favourites/ src/api/customer/plugin.ts tests/api/customer/favourites.test.ts
git commit -m "feat: customer favourites routes — merchants and vouchers"
```

---

## Deferred (out of scope for Phase 3B)

- **Savings aggregation** — separate concern; Activity routes already implemented. To be planned when Savings screen (SV1) is built.
- **Featured/trending radius filtering** — `FeaturedMerchant.radiusMiles` deferred until frontend sends coordinates in Phase 3C.
- **Individual review listing / write** — deferred to Phase 3C when merchant profile screen is built.
- **Combined `/favourites` endpoint** — two list calls sufficient for Phase 3C.
- **Category hierarchy rendering** — flat list sufficient; hierarchy is a frontend concern.
- **Favourites inactive-item signal** — silent filter acceptable for Phase 3C.
- **Subscription status co-located on profile** — two API calls acceptable; optimisation for later.

---

## Self-Review

**Spec coverage (Phase 3A Section 6 gaps):**

| Gap | Task |
|-----|------|
| No customer merchant profile route | Task 3 — `GET /api/v1/customer/merchants/:id` |
| No branch selector route | Task 3 — `GET /api/v1/customer/merchants/:id/branches` |
| No customer voucher detail route | Task 3 — `GET /api/v1/customer/vouchers/:id` |
| No search / category routes | Task 3 — `GET /api/v1/customer/search`, `/categories` |
| No home feed route | Task 3 — `GET /api/v1/customer/home` |
| No customer profile update | Task 4 — `PATCH /api/v1/customer/profile` |
| No change-password (authenticated) | Task 4 — `POST /api/v1/customer/profile/change-password` |
| No interests API | Task 4 — `GET/PUT /api/v1/customer/profile/interests` |
| No favourites routes | Task 5 — full CRUD |

**Auth boundary — confirmed correct:**
- All discovery routes (Tasks 3) are in the open scope — no auth hook
- All profile and favourites routes (Tasks 4, 5) are in the authenticated scope
- Voucher detail accepts an optional bearer token to derive `isRedeemedThisCycle`

**Type consistency:** All function names consistent across service, routes, and test mocks. `hashPassword`/`verifyPassword` confirmed exported from `src/api/shared/password.ts`. `passwordSchema` enforces 8+ chars, uppercase, lowercase, number, special character — documented in Task 4 route header.
