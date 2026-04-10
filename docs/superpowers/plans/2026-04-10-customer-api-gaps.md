# Customer-Facing API Gaps (Phase 3B) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build all customer-facing API routes that are missing before Phase 3C (customer app) and 3D (customer website) can be implemented.

**Architecture:** New routes follow the established Fastify + Prisma pattern: a `plugin.ts` scopes auth middleware, `routes.ts` handles HTTP parsing and response, `service.ts` contains business logic. All new routes sit under a new `src/api/customer/` directory to keep customer-facing APIs separate from merchant/admin routes. Tests mock the service layer for routes tests and use direct function calls for service tests, matching existing patterns in `tests/api/`.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Prisma 7 (`generated/prisma/client`), Vitest, Zod — identical to all existing API code.

---

## File Structure

**New files:**
- `src/api/customer/plugin.ts` — scopes `authenticateCustomer` to all customer routes
- `src/api/customer/merchant/routes.ts` — GET merchant profile + active branch list
- `src/api/customer/merchant/service.ts` — merchant + branch queries
- `src/api/customer/voucher/routes.ts` — GET voucher detail + redeemed state
- `src/api/customer/voucher/service.ts` — voucher + cycle state queries
- `src/api/customer/search/routes.ts` — GET search (merchants + vouchers) + category browse
- `src/api/customer/search/service.ts` — search query logic
- `src/api/customer/profile/routes.ts` — GET + PATCH profile, POST change-password
- `src/api/customer/profile/service.ts` — profile update + password change logic
- `src/api/customer/favourites/routes.ts` — POST/DELETE merchant + voucher favourites, GET lists
- `src/api/customer/favourites/service.ts` — favourite toggle and list logic

**Modified files:**
- `src/api/app.ts` — register `customerPlugin`
- `src/api/shared/errors.ts` — add new error codes: `USER_NOT_FOUND`, `CURRENT_PASSWORD_INCORRECT`, `MERCHANT_UNAVAILABLE`, `SEARCH_QUERY_REQUIRED`, `ALREADY_FAVOURITED`, `FAVOURITE_NOT_FOUND`

**New test files:**
- `tests/api/customer/merchant.test.ts`
- `tests/api/customer/voucher.test.ts`
- `tests/api/customer/search.test.ts`
- `tests/api/customer/profile.test.ts`
- `tests/api/customer/favourites.test.ts`

---

## Task 1: Add new error codes

**Files:**
- Modify: `src/api/shared/errors.ts`

- [ ] **Step 1: Write the failing test**

Open `tests/api/shared/errors.test.ts` and add at the end of the existing describe block:

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

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/shared/errors.test.ts
```

Expected: FAIL — property does not exist on `ERROR_DEFINITIONS`

- [ ] **Step 3: Add error codes to `src/api/shared/errors.ts`**

Add these entries to `ERROR_DEFINITIONS` after the `BRANCH_ACCESS_DENIED` line:

```typescript
  USER_NOT_FOUND:               { statusCode: 404, message: 'User not found.' },
  CURRENT_PASSWORD_INCORRECT:   { statusCode: 400, message: 'Your current password is incorrect.' },
  MERCHANT_UNAVAILABLE:         { statusCode: 404, message: 'This merchant is no longer available.' },
  SEARCH_QUERY_REQUIRED:        { statusCode: 400, message: 'A search query or category is required.' },
  ALREADY_FAVOURITED:           { statusCode: 409, message: 'Already in your favourites.' },
  FAVOURITE_NOT_FOUND:          { statusCode: 404, message: 'This item is not in your favourites.' },
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/api/shared/errors.test.ts
```

Expected: PASS

- [ ] **Step 5: Run full test suite to confirm no regressions**

```bash
npx vitest run
```

Expected: all existing tests still pass

- [ ] **Step 6: Commit**

```bash
git add src/api/shared/errors.ts tests/api/shared/errors.test.ts
git commit -m "feat: add customer API error codes"
```

---

## Task 2: Customer plugin and app registration

**Files:**
- Create: `src/api/customer/plugin.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/customer/merchant.test.ts` with a minimal test that will fail until the plugin is registered:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('customer merchant routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn() },
      branch: { findMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
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

  it('GET /api/v1/customer/merchants/:id returns 404 on unknown route before plugin registered', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails as expected**

```bash
npx vitest run tests/api/customer/merchant.test.ts
```

Expected: PASS (404 is the expected output — route does not exist yet; test confirms the baseline)

- [ ] **Step 3: Create `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    // Route sub-plugins registered here as they are built
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 4: Register the plugin in `src/api/app.ts`**

Add import near the other plugin imports:

```typescript
import customerPlugin from './customer/plugin'
```

Add registration after `await app.register(redemptionPlugin)`:

```typescript
await app.register(customerPlugin)
```

- [ ] **Step 5: Run test to confirm still passing**

```bash
npx vitest run tests/api/customer/merchant.test.ts
```

Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/plugin.ts src/api/app.ts tests/api/customer/merchant.test.ts
git commit -m "feat: scaffold customer plugin and register in app"
```

---

## Task 3: Merchant profile + branch list (customer-facing)

**Files:**
- Create: `src/api/customer/merchant/service.ts`
- Create: `src/api/customer/merchant/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Modify: `tests/api/customer/merchant.test.ts`

**Routes:**
- `GET /api/v1/customer/merchants/:id` — public merchant profile (ACTIVE only)
- `GET /api/v1/customer/merchants/:id/branches` — active branches for redemption branch selector

- [ ] **Step 1: Write the failing service tests**

Replace the contents of `tests/api/customer/merchant.test.ts` with:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/merchant/service', () => ({
  getCustomerMerchant:        vi.fn(),
  getCustomerMerchantBranches: vi.fn(),
}))

import {
  getCustomerMerchant,
  getCustomerMerchantBranches,
} from '../../../src/api/customer/merchant/service'

describe('customer merchant routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn() },
      branch:   { findMany:   vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
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

  it('GET /api/v1/customer/merchants/:id returns 200 with merchant', async () => {
    const merchant = {
      id: 'merchant-1', businessName: 'Acme', status: 'ACTIVE',
      logoUrl: null, bannerUrl: null, description: 'Great place',
      vouchers: [{ id: 'v1', title: 'Free coffee', estimatedSaving: '3.00' }],
    }
    ;(getCustomerMerchant as any).mockResolvedValue(merchant)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).businessName).toBe('Acme')
  })

  it('GET /api/v1/customer/merchants/:id returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/merchants/merchant-1' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/customer/merchants/:id returns 404 when service throws MERCHANT_UNAVAILABLE', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(getCustomerMerchant as any).mockRejectedValue(new AppError('MERCHANT_UNAVAILABLE'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('MERCHANT_UNAVAILABLE')
  })

  it('GET /api/v1/customer/merchants/:id/branches returns 200 with active branches', async () => {
    const branches = [
      { id: 'b1', name: 'Main Branch', addressLine1: '1 High St', city: 'London', postcode: 'SW1A 1AA' },
    ]
    ;(getCustomerMerchantBranches as any).mockResolvedValue(branches)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/merchants/merchant-1/branches',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/customer/merchant.test.ts
```

Expected: FAIL — module `src/api/customer/merchant/service` not found

- [ ] **Step 3: Create `src/api/customer/merchant/service.ts`**

```typescript
import { PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

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
      vouchers: {
        where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
        select: {
          id:               true,
          title:            true,
          type:             true,
          description:      true,
          terms:            true,
          imageUrl:         true,
          estimatedSaving:  true,
          expiryDate:       true,
          code:             true,
        },
        orderBy: { createdAt: 'desc' },
      },
      categories: {
        select: { category: { select: { id: true, name: true } } },
      },
      branches: {
        where: { isActive: true },
        select: { id: true, name: true, city: true, postcode: true, latitude: true, longitude: true },
        orderBy: { isMainBranch: 'desc' },
      },
    },
  })

  if (!merchant || merchant.status !== MerchantStatus.ACTIVE) {
    throw new AppError('MERCHANT_UNAVAILABLE')
  }

  return merchant
}

export async function getCustomerMerchantBranches(prisma: PrismaClient, merchantId: string) {
  // Verify merchant is ACTIVE first
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
      id:          true,
      name:        true,
      addressLine1: true,
      addressLine2: true,
      city:        true,
      postcode:    true,
      phone:       true,
      latitude:    true,
      longitude:   true,
      openingHours: {
        select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
        orderBy: { dayOfWeek: 'asc' },
      },
    },
    orderBy: { isMainBranch: 'desc' },
  })
}
```

- [ ] **Step 4: Create `src/api/customer/merchant/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getCustomerMerchant, getCustomerMerchantBranches } from './service'

const idParam = z.object({ id: z.string().min(1) })

export async function customerMerchantRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/merchants'

  // GET /api/v1/customer/merchants/:id — merchant profile (ACTIVE only)
  app.get(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const merchant = await getCustomerMerchant(app.prisma, id)
    return reply.send(merchant)
  })

  // GET /api/v1/customer/merchants/:id/branches — active branches (for branch selector)
  app.get(`${prefix}/:id/branches`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const branches = await getCustomerMerchantBranches(app.prisma, id)
    return reply.send(branches)
  })
}
```

- [ ] **Step 5: Register routes in `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerMerchantRoutes } from './merchant/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerMerchantRoutes)
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/api/customer/merchant.test.ts
```

Expected: PASS — all 4 tests pass

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/merchant/ src/api/customer/plugin.ts tests/api/customer/merchant.test.ts
git commit -m "feat: customer merchant profile and branch list routes"
```

---

## Task 4: Voucher detail with per-user redeemed state

**Files:**
- Create: `src/api/customer/voucher/service.ts`
- Create: `src/api/customer/voucher/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Create: `tests/api/customer/voucher.test.ts`

**Route:** `GET /api/v1/customer/vouchers/:id` — voucher detail + whether user has redeemed it this cycle

- [ ] **Step 1: Write the failing tests**

Create `tests/api/customer/voucher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/voucher/service', () => ({
  getCustomerVoucher: vi.fn(),
}))

import { getCustomerVoucher } from '../../../src/api/customer/voucher/service'

describe('customer voucher routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      voucher:               { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn() },
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

  it('GET /api/v1/customer/vouchers/:id returns 200 with redeemed=false', async () => {
    const voucher = {
      id: 'v1', title: 'Free coffee', estimatedSaving: '3.00',
      merchant: { id: 'merchant-1', businessName: 'Acme', status: 'ACTIVE' },
      isRedeemedThisCycle: false,
    }
    ;(getCustomerVoucher as any).mockResolvedValue(voucher)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).isRedeemedThisCycle).toBe(false)
  })

  it('GET /api/v1/customer/vouchers/:id returns 200 with redeemed=true when already redeemed', async () => {
    const voucher = {
      id: 'v1', title: 'Free coffee', estimatedSaving: '3.00',
      merchant: { id: 'merchant-1', businessName: 'Acme', status: 'ACTIVE' },
      isRedeemedThisCycle: true,
    }
    ;(getCustomerVoucher as any).mockResolvedValue(voucher)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).isRedeemedThisCycle).toBe(true)
  })

  it('GET /api/v1/customer/vouchers/:id returns 404 when service throws VOUCHER_NOT_FOUND', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(getCustomerVoucher as any).mockRejectedValue(new AppError('VOUCHER_NOT_FOUND'))

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(404)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_FOUND')
  })

  it('GET /api/v1/customer/vouchers/:id returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/vouchers/v1' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/api/customer/voucher.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/api/customer/voucher/service.ts`**

```typescript
import { PrismaClient, VoucherStatus, ApprovalStatus, MerchantStatus } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'

export async function getCustomerVoucher(
  prisma: PrismaClient,
  userId: string,
  voucherId: string
) {
  const voucher = await prisma.voucher.findUnique({
    where: { id: voucherId },
    select: {
      id:              true,
      title:           true,
      type:            true,
      description:     true,
      terms:           true,
      imageUrl:        true,
      estimatedSaving: true,
      expiryDate:      true,
      code:            true,
      status:          true,
      approvalStatus:  true,
      merchant: {
        select: {
          id:           true,
          businessName: true,
          tradingName:  true,
          logoUrl:      true,
          status:       true,
        },
      },
    },
  })

  if (
    !voucher ||
    voucher.status !== VoucherStatus.ACTIVE ||
    voucher.approvalStatus !== ApprovalStatus.APPROVED ||
    voucher.merchant.status !== MerchantStatus.ACTIVE
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // Check if user has already redeemed this voucher in the current cycle
  const cycleState = await prisma.userVoucherCycleState.findUnique({
    where: { userId_voucherId: { userId, voucherId } },
    select: { isRedeemedInCurrentCycle: true },
  })

  return {
    ...voucher,
    isRedeemedThisCycle: cycleState?.isRedeemedInCurrentCycle ?? false,
  }
}
```

- [ ] **Step 4: Create `src/api/customer/voucher/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getCustomerVoucher } from './service'

const idParam = z.object({ id: z.string().min(1) })

export async function customerVoucherRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/vouchers'

  // GET /api/v1/customer/vouchers/:id — voucher detail + per-user redeemed state
  app.get(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const voucher = await getCustomerVoucher(app.prisma, req.user.sub, id)
    return reply.send(voucher)
  })
}
```

- [ ] **Step 5: Register in `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerMerchantRoutes } from './merchant/routes'
import { customerVoucherRoutes } from './voucher/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerMerchantRoutes)
    await scoped.register(customerVoucherRoutes)
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 6: Run voucher tests**

```bash
npx vitest run tests/api/customer/voucher.test.ts
```

Expected: PASS — all 4 tests pass

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/voucher/ src/api/customer/plugin.ts tests/api/customer/voucher.test.ts
git commit -m "feat: customer voucher detail route with per-user redeemed state"
```

---

## Task 5: Search and category browse

**Files:**
- Create: `src/api/customer/search/service.ts`
- Create: `src/api/customer/search/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Create: `tests/api/customer/search.test.ts`

**Routes:**
- `GET /api/v1/customer/search?q=&categoryId=&limit=&offset=` — search merchants and vouchers
- `GET /api/v1/customer/categories` — list categories that have at least one ACTIVE merchant

- [ ] **Step 1: Write the failing tests**

Create `tests/api/customer/search.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/search/service', () => ({
  searchMerchants:      vi.fn(),
  listActiveCategories: vi.fn(),
}))

import { searchMerchants, listActiveCategories } from '../../../src/api/customer/search/service'

describe('customer search routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant:  { findMany: vi.fn(), count: vi.fn() },
      category:  { findMany: vi.fn() },
      auditLog:  { create: vi.fn().mockResolvedValue({}) },
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

  it('GET /api/v1/customer/search returns 200 with results', async () => {
    const results = { merchants: [{ id: 'merchant-1', businessName: 'Acme' }], total: 1 }
    ;(searchMerchants as any).mockResolvedValue(results)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search?q=coffee',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).total).toBe(1)
  })

  it('GET /api/v1/customer/search returns 400 without q or categoryId', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/search',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('SEARCH_QUERY_REQUIRED')
  })

  it('GET /api/v1/customer/categories returns 200 with categories', async () => {
    const categories = [{ id: 'cat-1', name: 'Food & Drink' }]
    ;(listActiveCategories as any).mockResolvedValue(categories)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/categories',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('GET /api/v1/customer/search returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/search?q=coffee' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/api/customer/search.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/api/customer/search/service.ts`**

```typescript
import { PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus } from '../../../../generated/prisma/client'

const ACTIVE_MERCHANT_FILTER = { status: MerchantStatus.ACTIVE } as const

export async function searchMerchants(
  prisma: PrismaClient,
  params: { q?: string; categoryId?: string; limit: number; offset: number }
) {
  const { q, categoryId, limit, offset } = params

  const where: any = {
    ...ACTIVE_MERCHANT_FILTER,
    ...(q ? {
      OR: [
        { businessName: { contains: q, mode: 'insensitive' } },
        { tradingName:  { contains: q, mode: 'insensitive' } },
        { description:  { contains: q, mode: 'insensitive' } },
      ],
    } : {}),
    ...(categoryId ? {
      OR: [
        { primaryCategoryId: categoryId },
        { categories: { some: { categoryId } } },
      ],
    } : {}),
  }

  const [merchants, total] = await Promise.all([
    prisma.merchant.findMany({
      where,
      select: {
        id:           true,
        businessName: true,
        tradingName:  true,
        logoUrl:      true,
        description:  true,
        primaryCategory: { select: { id: true, name: true } },
        vouchers: {
          where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
          select: { id: true, title: true, estimatedSaving: true, type: true },
          take: 2, // preview only
        },
      },
      orderBy: { businessName: 'asc' },
      take:    limit,
      skip:    offset,
    }),
    prisma.merchant.count({ where }),
  ])

  return { merchants, total }
}

export async function listActiveCategories(prisma: PrismaClient) {
  // Return categories that have at least one ACTIVE merchant
  return prisma.category.findMany({
    where: {
      merchants: { some: { merchant: { status: MerchantStatus.ACTIVE } } },
    },
    select: { id: true, name: true, iconUrl: true },
    orderBy: { name: 'asc' },
  })
}
```

- [ ] **Step 4: Create `src/api/customer/search/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import { searchMerchants, listActiveCategories } from './service'

const searchQuery = z.object({
  q:          z.string().optional(),
  categoryId: z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
  offset:     z.coerce.number().int().min(0).default(0),
})

export async function customerSearchRoutes(app: FastifyInstance) {
  // GET /api/v1/customer/search — merchant search
  app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
    const params = searchQuery.parse(req.query)
    if (!params.q && !params.categoryId) throw new AppError('SEARCH_QUERY_REQUIRED')
    const results = await searchMerchants(app.prisma, params)
    return reply.send(results)
  })

  // GET /api/v1/customer/categories — active categories
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
import { customerMerchantRoutes } from './merchant/routes'
import { customerVoucherRoutes } from './voucher/routes'
import { customerSearchRoutes } from './search/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerMerchantRoutes)
    await scoped.register(customerVoucherRoutes)
    await scoped.register(customerSearchRoutes)
  })
}

export default fp(customerPlugin, {
  name: 'customer',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 6: Run search tests**

```bash
npx vitest run tests/api/customer/search.test.ts
```

Expected: PASS — all 4 tests pass

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/search/ src/api/customer/plugin.ts tests/api/customer/search.test.ts
git commit -m "feat: customer search and category browse routes"
```

---

## Task 6: Customer profile — read and update

**Files:**
- Create: `src/api/customer/profile/service.ts`
- Create: `src/api/customer/profile/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Create: `tests/api/customer/profile.test.ts`

**Routes:**
- `GET /api/v1/customer/profile` — get own profile
- `PATCH /api/v1/customer/profile` — update name, phone (non-sensitive)
- `POST /api/v1/customer/profile/change-password` — change password while authenticated (requires current password)

- [ ] **Step 1: Write the failing tests**

Create `tests/api/customer/profile.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/profile/service', () => ({
  getCustomerProfile:   vi.fn(),
  updateCustomerProfile: vi.fn(),
  changeCustomerPassword: vi.fn(),
}))

import {
  getCustomerProfile,
  updateCustomerProfile,
  changeCustomerPassword,
} from '../../../src/api/customer/profile/service'

describe('customer profile routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      user:     { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
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

  it('GET /api/v1/customer/profile returns 200', async () => {
    const profile = { id: 'user-1', firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com' }
    ;(getCustomerProfile as any).mockResolvedValue(profile)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).firstName).toBe('Jane')
  })

  it('PATCH /api/v1/customer/profile returns 200 on valid update', async () => {
    const updated = { id: 'user-1', firstName: 'Jane', lastName: 'Smith' }
    ;(updateCustomerProfile as any).mockResolvedValue(updated)

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/customer/profile',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { lastName: 'Smith' },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).lastName).toBe('Smith')
  })

  it('POST /api/v1/customer/profile/change-password returns 200 on success', async () => {
    ;(changeCustomerPassword as any).mockResolvedValue({ message: 'Password updated.' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'OldPass1!', newPassword: 'NewPass1!' },
    })

    expect(res.statusCode).toBe(200)
  })

  it('POST /api/v1/customer/profile/change-password returns 400 without required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/profile/change-password',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { currentPassword: 'OldPass1!' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('GET /api/v1/customer/profile returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/profile' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/api/customer/profile.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/api/customer/profile/service.ts`**

```typescript
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'
import { hashPassword, verifyPassword } from '../../shared/password'
import { passwordSchema } from '../../shared/schemas'

export async function getCustomerProfile(prisma: PrismaClient, userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id:             true,
      firstName:      true,
      lastName:       true,
      email:          true,
      phone:          true,
      profileImageUrl: true,
      emailVerified:  true,
      phoneVerified:  true,
      createdAt:      true,
    },
  })
  if (!user) throw new AppError('USER_NOT_FOUND')
  return user
}

export async function updateCustomerProfile(
  prisma: PrismaClient,
  userId: string,
  data: { firstName?: string; lastName?: string },
  ctx: { ipAddress: string; userAgent: string }
) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
  if (!user) throw new AppError('USER_NOT_FOUND')

  const updated = await prisma.user.update({
    where: { id: userId },
    data: {
      ...(data.firstName !== undefined ? { firstName: data.firstName } : {}),
      ...(data.lastName  !== undefined ? { lastName:  data.lastName  } : {}),
    },
    select: {
      id:        true,
      firstName: true,
      lastName:  true,
      email:     true,
      phone:     true,
    },
  })

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'PROFILE_UPDATED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
  })

  return updated
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
import { getCustomerProfile, updateCustomerProfile, changeCustomerPassword } from './service'

const updateProfileBody = z.object({
  firstName: z.string().min(1).max(50).optional(),
  lastName:  z.string().min(1).max(50).optional(),
})

const changePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword:     passwordSchema,
})

export async function customerProfileRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/profile'

  // GET /api/v1/customer/profile — get own profile
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const profile = await getCustomerProfile(app.prisma, req.user.sub)
    return reply.send(profile)
  })

  // PATCH /api/v1/customer/profile — update name fields
  app.patch(prefix, async (req: FastifyRequest, reply) => {
    const body = updateProfileBody.parse(req.body)
    const updated = await updateCustomerProfile(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(updated)
  })

  // POST /api/v1/customer/profile/change-password
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
import { customerMerchantRoutes } from './merchant/routes'
import { customerVoucherRoutes } from './voucher/routes'
import { customerSearchRoutes } from './search/routes'
import { customerProfileRoutes } from './profile/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerMerchantRoutes)
    await scoped.register(customerVoucherRoutes)
    await scoped.register(customerSearchRoutes)
    await scoped.register(customerProfileRoutes)
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

Expected: PASS — all 5 tests pass

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: all tests pass

- [ ] **Step 8: Commit**

```bash
git add src/api/customer/profile/ src/api/customer/plugin.ts tests/api/customer/profile.test.ts
git commit -m "feat: customer profile read, update, and change-password routes"
```

---

## Task 7: Favourites — merchants and vouchers

**Files:**
- Create: `src/api/customer/favourites/service.ts`
- Create: `src/api/customer/favourites/routes.ts`
- Modify: `src/api/customer/plugin.ts`
- Create: `tests/api/customer/favourites.test.ts`

**Routes:**
- `POST /api/v1/customer/favourites/merchants/:merchantId` — add merchant to favourites
- `DELETE /api/v1/customer/favourites/merchants/:merchantId` — remove merchant from favourites
- `GET /api/v1/customer/favourites/merchants` — list favourite merchants
- `POST /api/v1/customer/favourites/vouchers/:voucherId` — add voucher to favourites
- `DELETE /api/v1/customer/favourites/vouchers/:voucherId` — remove voucher from favourites
- `GET /api/v1/customer/favourites/vouchers` — list favourite vouchers

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

  it('POST /api/v1/customer/favourites/merchants/:id returns 201', async () => {
    ;(addFavouriteMerchant as any).mockResolvedValue({ id: 'fav-1' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(201)
  })

  it('POST /api/v1/customer/favourites/merchants/:id returns 409 when already favourited', async () => {
    const { AppError } = await import('../../../src/api/shared/errors')
    ;(addFavouriteMerchant as any).mockRejectedValue(new AppError('ALREADY_FAVOURITED'))

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ALREADY_FAVOURITED')
  })

  it('DELETE /api/v1/customer/favourites/merchants/:id returns 200', async () => {
    ;(removeFavouriteMerchant as any).mockResolvedValue({})

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/customer/favourites/merchants/merchant-1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/customer/favourites/merchants returns 200 with list', async () => {
    ;(listFavouriteMerchants as any).mockResolvedValue([{ id: 'merchant-1', businessName: 'Acme' }])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/favourites/merchants',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/customer/favourites/vouchers/:id returns 201', async () => {
    ;(addFavouriteVoucher as any).mockResolvedValue({ id: 'fav-v-1' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/favourites/vouchers/v1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(201)
  })

  it('GET /api/v1/customer/favourites/vouchers returns 200 with list', async () => {
    ;(listFavouriteVouchers as any).mockResolvedValue([{ id: 'v1', title: 'Free coffee' }])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/favourites/vouchers',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('GET /api/v1/customer/favourites/merchants returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/customer/favourites/merchants' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run to verify tests fail**

```bash
npx vitest run tests/api/customer/favourites.test.ts
```

Expected: FAIL — module not found

- [ ] **Step 3: Create `src/api/customer/favourites/service.ts`**

```typescript
import { PrismaClient, MerchantStatus, VoucherStatus, ApprovalStatus } from '../../../../generated/prisma/client'
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

  await prisma.favouriteMerchant.delete({
    where: { userId_merchantId: { userId, merchantId } },
  })

  return { removed: true }
}

export async function listFavouriteMerchants(prisma: PrismaClient, userId: string) {
  const favourites = await prisma.favouriteMerchant.findMany({
    where: { userId },
    select: {
      createdAt: true,
      merchant: {
        select: {
          id:           true,
          businessName: true,
          tradingName:  true,
          logoUrl:      true,
          status:       true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Filter out merchants that are no longer ACTIVE (soft exclusion — keep the record, just don't surface inactive)
  return favourites
    .filter(f => f.merchant.status === MerchantStatus.ACTIVE)
    .map(f => ({ ...f.merchant, favouritedAt: f.createdAt }))
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

  await prisma.favouriteVoucher.delete({
    where: { userId_voucherId: { userId, voucherId } },
  })

  return { removed: true }
}

export async function listFavouriteVouchers(prisma: PrismaClient, userId: string) {
  const favourites = await prisma.favouriteVoucher.findMany({
    where: { userId },
    select: {
      createdAt: true,
      voucher: {
        select: {
          id:              true,
          title:           true,
          type:            true,
          estimatedSaving: true,
          imageUrl:        true,
          status:          true,
          approvalStatus:  true,
          merchant: {
            select: { id: true, businessName: true, logoUrl: true, status: true },
          },
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  // Filter out vouchers that are no longer ACTIVE+APPROVED or whose merchant is no longer ACTIVE
  return favourites
    .filter(f =>
      f.voucher.status         === VoucherStatus.ACTIVE &&
      f.voucher.approvalStatus === ApprovalStatus.APPROVED &&
      f.voucher.merchant.status === MerchantStatus.ACTIVE
    )
    .map(f => ({ ...f.voucher, favouritedAt: f.createdAt }))
}
```

- [ ] **Step 4: Create `src/api/customer/favourites/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  addFavouriteMerchant, removeFavouriteMerchant, listFavouriteMerchants,
  addFavouriteVoucher, removeFavouriteVoucher, listFavouriteVouchers,
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

- [ ] **Step 5: Register in `src/api/customer/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { customerMerchantRoutes }   from './merchant/routes'
import { customerVoucherRoutes }    from './voucher/routes'
import { customerSearchRoutes }     from './search/routes'
import { customerProfileRoutes }    from './profile/routes'
import { customerFavouritesRoutes } from './favourites/routes'

async function customerPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(customerMerchantRoutes)
    await scoped.register(customerVoucherRoutes)
    await scoped.register(customerSearchRoutes)
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

Expected: PASS — all 7 tests pass

- [ ] **Step 7: Run full test suite**

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

## Self-Review

**Spec coverage check against Phase 3A spec (Section 6: Backend Dependencies):**

| Gap identified in spec | Task covering it |
|------------------------|-----------------|
| No customer-facing merchant profile route | Task 3 — `GET /api/v1/customer/merchants/:id` |
| No customer-facing branch list route (branch selector) | Task 3 — `GET /api/v1/customer/merchants/:id/branches` |
| No customer-facing voucher detail route | Task 4 — `GET /api/v1/customer/vouchers/:id` |
| No search / category browse routes | Task 5 — `GET /api/v1/customer/search`, `GET /api/v1/customer/categories` |
| No customer profile update route | Task 6 — `PATCH /api/v1/customer/profile` |
| No change-password (authenticated) route | Task 6 — `POST /api/v1/customer/profile/change-password` |
| No favourites API routes | Task 7 — full CRUD for merchants + vouchers |
| Savings aggregation not implemented | **Not in this plan** — deferred. The Activity routes (`GET /api/v1/redemption/my`, `GET /api/v1/redemption/my/:id`) are already implemented. Savings aggregation is a separate concern and will be planned when the Savings screen is built. |
| Featured/trending merchant list routes | **Not in this plan** — requires product decisions on radius and sorting algorithm. Deferred to Phase 3C/3D planning. |

**Placeholder scan:** No TBDs, no "implement later", no vague steps. All code blocks are complete.

**Type consistency:** `getCustomerMerchant`, `getCustomerMerchantBranches`, `getCustomerVoucher`, `searchMerchants`, `listActiveCategories`, `getCustomerProfile`, `updateCustomerProfile`, `changeCustomerPassword`, `addFavouriteMerchant`, `removeFavouriteMerchant`, `listFavouriteMerchants`, `addFavouriteVoucher`, `removeFavouriteVoucher`, `listFavouriteVouchers` — all names consistent between service files, route files, and test mocks.
