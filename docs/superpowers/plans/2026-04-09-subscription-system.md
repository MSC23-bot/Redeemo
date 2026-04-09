# Subscription System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full customer subscription lifecycle — plan browsing, SetupIntent-based payment collection, subscription creation, webhook-driven state management, and cycle state reset on renewal.

**Architecture:** Four layers: (1) a `POST /subscription/setup-intent` endpoint that creates a Stripe customer, stores `stripeCustomerId` server-side in Redis (TTL 1h), and returns only `clientSecret` to the frontend; (2) a `POST /subscription` endpoint that reads `stripeCustomerId` from Redis using the authenticated `userId` — never from the request body; (3) a Stripe webhook handler that drives all subscription state transitions; (4) a cycle-reset function that resets `UserVoucherCycleState.isRedeemedInCurrentCycle` on renewal.

**Tech Stack:** `stripe` npm package (v17), Fastify 5, Prisma 7, Zod v4, Vitest, ioredis.

**Schema changes required:** Add `stripeCouponId String?` to `PromoCode` model so Stripe coupon IDs are stored explicitly and never guessed from promo code strings.

---

## Payment Flow (frontend → backend)

```
1. Frontend: GET /api/v1/subscription/plans         → display plans to user
2. Frontend: POST /api/v1/subscription/setup-intent → backend creates Stripe customer,
                                                       stores stripeCustomerId in Redis
                                                       (key: sub:setup:{userId}, TTL: 3600s),
                                                       returns { clientSecret } only
3. Frontend: Stripe SDK collects card details using clientSecret (Payment Element)
4. Stripe confirms payment method → returns paymentMethodId to frontend
5. Frontend: POST /api/v1/subscription { planId, paymentMethodId, promoCode? }
             NOTE: stripeCustomerId is NOT sent by the client
6. Backend: reads stripeCustomerId from Redis[sub:setup:{userId}] (throws
            PAYMENT_METHOD_REQUIRED if missing/expired), attaches paymentMethodId
            to that customer, creates subscription, deletes Redis key
7. Stripe webhook: confirms subscription active → backend records status
8. On renewal: webhook resets UserVoucherCycleState for the user
```

**Security:** `stripeCustomerId` never leaves the server. The client sends only `paymentMethodId`
(a single-use Stripe token). The backend resolves the customer from Redis using the JWT `sub`
as the key — an attacker cannot inject an arbitrary customer ID.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify | Add `stripeCouponId String?` to `PromoCode` |
| `src/api/subscription/service.ts` | Create | Business logic: get plans, setup intent, create/cancel subscription, promo codes |
| `src/api/subscription/routes.ts` | Create | Customer-facing REST endpoints (auth-gated) |
| `src/api/subscription/plugin.ts` | Create | Fastify plugin registering routes under `authenticateCustomer` |
| `src/api/subscription/webhook.ts` | Create | Raw-body Stripe webhook handler (no auth, signature verified) |
| `src/api/subscription/cycle.ts` | Create | `resetVoucherCycleForUser(prisma, userId)` — resets cycle state on renewal |
| `src/api/shared/stripe.ts` | Create | Singleton Stripe client |
| `src/api/shared/errors.ts` | Modify | Add subscription-related error codes |
| `src/api/shared/audit.ts` | Modify | Add subscription audit events |
| `src/api/app.ts` | Modify | Register subscription plugin + webhook route |
| `tests/api/subscription/service.test.ts` | Create | Unit tests for service functions |
| `tests/api/subscription/routes.test.ts` | Create | Integration tests for REST endpoints |
| `tests/api/subscription/webhook.test.ts` | Create | Integration tests for webhook handler |
| `tests/api/subscription/cycle.test.ts` | Create | Unit tests for cycle reset logic |

---

## Task 1: Schema migration — add stripeCouponId to PromoCode

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `stripeCouponId` field to `PromoCode` in `prisma/schema.prisma`**

Find the `PromoCode` model and add the field after `isActive`:

```prisma
model PromoCode {
  id             String       @id @default(uuid())
  code           String       @unique
  discountType   DiscountType
  discountValue  Decimal      @db.Decimal(10, 2)
  maxUses        Int?
  usesCount      Int          @default(0)
  expiresAt      DateTime?
  isActive       Boolean      @default(true)
  stripeCouponId String?
  createdAt      DateTime     @default(now())

  subscriptions  Subscription[]

  @@index([code])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-promo-code-stripe-coupon-id
```

Expected: Migration created and applied. `prisma generate` runs automatically.

- [ ] **Step 3: Verify generated client has the field**

```bash
grep -n "stripeCouponId" generated/prisma/client/index.d.ts | head -5
```

Expected: Field appears in the generated types.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add stripeCouponId to PromoCode for explicit Stripe coupon mapping"
```

---

## Task 2: Install Stripe and add error codes + audit events

**Files:**
- Modify: `src/api/shared/errors.ts`
- Modify: `src/api/shared/audit.ts`

- [ ] **Step 1: Install Stripe SDK**

```bash
npm install stripe
```

Expected output: `added 1 package` (stripe v17.x)

- [ ] **Step 2: Add subscription error codes to `src/api/shared/errors.ts`**

Add the following entries inside `ERROR_DEFINITIONS` after `SENSITIVE_FIELDS_REQUIRE_EDIT_REQUEST`:

```typescript
  PLAN_NOT_FOUND:                  { statusCode: 404, message: 'Subscription plan not found.' },
  SUBSCRIPTION_ALREADY_ACTIVE:     { statusCode: 409, message: 'You already have an active subscription.' },
  SUBSCRIPTION_NOT_FOUND:          { statusCode: 404, message: 'No active subscription found.' },
  PROMO_CODE_INVALID:              { statusCode: 400, message: 'This promo code is invalid or has expired.' },
  PROMO_CODE_EXHAUSTED:            { statusCode: 400, message: 'This promo code has reached its usage limit.' },
  STRIPE_ERROR:                    { statusCode: 502, message: 'Payment provider error. Please try again.' },
  WEBHOOK_SIGNATURE_INVALID:       { statusCode: 400, message: 'Webhook signature verification failed.' },
  SUBSCRIPTION_NOT_CANCELLABLE:    { statusCode: 409, message: 'This subscription cannot be cancelled in its current state.' },
  PAYMENT_METHOD_REQUIRED:         { statusCode: 400, message: 'No payment session found. Please restart the payment flow.' },
```

- [ ] **Step 3: Add subscription audit events to `src/api/shared/audit.ts`**

Add the following to the `AuditEvent` union type after `'CATEGORY_CHANGED'`:

```typescript
  | 'SUBSCRIPTION_CREATED'
  | 'SUBSCRIPTION_CANCELLED'
  | 'SUBSCRIPTION_RENEWED'
  | 'SUBSCRIPTION_EXPIRED'
  | 'SUBSCRIPTION_PAYMENT_FAILED'
  | 'SUBSCRIPTION_PROMO_APPLIED'
  | 'VOUCHER_CYCLE_RESET'
```

- [ ] **Step 4: Commit**

```bash
git add src/api/shared/errors.ts src/api/shared/audit.ts package.json package-lock.json
git commit -m "feat: install stripe, add subscription error codes and audit events"
```

---

## Task 3: Stripe singleton client

**Files:**
- Create: `src/api/shared/stripe.ts`
- Create: `tests/api/subscription/stripe-client.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/api/subscription/stripe-client.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'

describe('stripe client', () => {
  it('exports a stripe instance', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_fake'
    const { stripe } = await import('../../../src/api/shared/stripe')
    expect(stripe).toBeDefined()
    expect(typeof stripe.subscriptions.retrieve).toBe('function')
    expect(typeof stripe.setupIntents.create).toBe('function')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/subscription/stripe-client.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/api/shared/stripe'`

- [ ] **Step 3: Create `src/api/shared/stripe.ts`**

```typescript
import Stripe from 'stripe'

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? 'sk_test_placeholder', {
  apiVersion: '2025-03-31.basil',
})
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/api/subscription/stripe-client.test.ts
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/shared/stripe.ts tests/api/subscription/stripe-client.test.ts
git commit -m "feat: add stripe singleton client"
```

---

## Task 4: Cycle reset logic

**Files:**
- Create: `src/api/subscription/cycle.ts`
- Create: `tests/api/subscription/cycle.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/api/subscription/cycle.test.ts`:

```typescript
import { describe, it, expect, vi } from 'vitest'
import { resetVoucherCycleForUser } from '../../../src/api/subscription/cycle'

describe('resetVoucherCycleForUser', () => {
  it('resets isRedeemedInCurrentCycle for all redeemed cycle states of the user', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 3 })
    const prisma = { userVoucherCycleState: { updateMany } } as any

    await resetVoucherCycleForUser(prisma, 'user-1')

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        userId: 'user-1',
        isRedeemedInCurrentCycle: true,
      },
      data: {
        isRedeemedInCurrentCycle: false,
        cycleStartDate: expect.any(Date),
      },
    })
  })

  it('does nothing harmful if user has no redeemed cycle states', async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 })
    const prisma = { userVoucherCycleState: { updateMany } } as any

    await resetVoucherCycleForUser(prisma, 'user-2')

    expect(updateMany).toHaveBeenCalledOnce()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/subscription/cycle.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/api/subscription/cycle'`

- [ ] **Step 3: Create `src/api/subscription/cycle.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'

/**
 * Resets the voucher redemption cycle for a user after their subscription renews.
 * Called from the Stripe `invoice.payment_succeeded` webhook when billing_reason
 * is 'subscription_cycle'. Only resets rows where the user has redeemed in the
 * current cycle — unaffected rows are left untouched.
 */
export async function resetVoucherCycleForUser(
  prisma: PrismaClient,
  userId: string
): Promise<void> {
  await prisma.userVoucherCycleState.updateMany({
    where: {
      userId,
      isRedeemedInCurrentCycle: true,
    },
    data: {
      isRedeemedInCurrentCycle: false,
      cycleStartDate: new Date(),
    },
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/api/subscription/cycle.test.ts
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/subscription/cycle.ts tests/api/subscription/cycle.test.ts
git commit -m "feat: voucher cycle reset logic for subscription renewal"
```

---

## Task 5: Subscription service

**Files:**
- Create: `src/api/subscription/service.ts`
- Create: `tests/api/subscription/service.test.ts`

The service implements the full payment flow:
- `createSetupIntent(prisma, redis, userId)` — creates a Stripe customer, stores `stripeCustomerId` in Redis under key `sub:setup:{userId}` (TTL 3600s), returns only `{ clientSecret }`. The customer ID never leaves the server.
- `createSubscription(prisma, redis, userId, data)` — reads `stripeCustomerId` from Redis (throws `PAYMENT_METHOD_REQUIRED` if missing/expired), attaches the confirmed `paymentMethodId` to that customer, creates the subscription, then deletes the Redis key.
- `cancelSubscription` — sets `cancel_at_period_end: true` on Stripe; `cancelledAt` records when requested, access continues until `currentPeriodEnd`.

- [ ] **Step 1: Write the failing tests**

Create `tests/api/subscription/service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    customers: { create: vi.fn() },
    paymentMethods: { attach: vi.fn() },
    setupIntents: { create: vi.fn() },
    subscriptions: { create: vi.fn(), update: vi.fn() },
  },
}))

import { stripe } from '../../../src/api/shared/stripe'
import {
  getActivePlans,
  getMySubscription,
  createSetupIntent,
  createSubscription,
  cancelSubscription,
} from '../../../src/api/subscription/service'

const mockPrisma = () => ({
  subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
  subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn() },
  promoCode: { findUnique: vi.fn(), update: vi.fn() },
  auditLog: { create: vi.fn().mockResolvedValue({}) },
} as any)

const mockRedis = () => ({
  set: vi.fn().mockResolvedValue('OK'),
  get: vi.fn(),
  del: vi.fn().mockResolvedValue(1),
} as any)

describe('getActivePlans', () => {
  it('returns active plans ordered by sortOrder', async () => {
    const prisma = mockPrisma()
    const plans = [
      { id: 'p1', name: 'Monthly', priceGbp: 6.99, billingInterval: 'MONTHLY', isActive: true, sortOrder: 1 },
      { id: 'p2', name: 'Annual', priceGbp: 69.99, billingInterval: 'ANNUAL', isActive: true, sortOrder: 2 },
    ]
    prisma.subscriptionPlan.findMany.mockResolvedValue(plans)

    const result = await getActivePlans(prisma)

    expect(prisma.subscriptionPlan.findMany).toHaveBeenCalledWith({
      where: { isActive: true },
      orderBy: { sortOrder: 'asc' },
    })
    expect(result).toEqual(plans)
  })
})

describe('getMySubscription', () => {
  it('returns null when user has no subscription', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)

    const result = await getMySubscription(prisma, 'user-1')

    expect(result).toBeNull()
  })

  it('returns the subscription with plan details', async () => {
    const prisma = mockPrisma()
    const sub = { id: 's1', status: 'ACTIVE', plan: { name: 'Monthly' } }
    prisma.subscription.findUnique.mockResolvedValue(sub)

    const result = await getMySubscription(prisma, 'user-1')

    expect(result).toEqual(sub)
  })
})

describe('createSetupIntent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates Stripe customer, stores customerId in Redis, returns only clientSecret', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
    })
    ;(stripe.customers.create as any).mockResolvedValue({ id: 'cus_abc' })
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const result = await createSetupIntent(prisma, redis, 'user-1')

    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      name: 'Test User',
      metadata: { userId: 'user-1' },
    })
    expect(redis.set).toHaveBeenCalledWith('sub:setup:user-1', 'cus_abc', 'EX', 3600)
    // stripeCustomerId must NOT be in the returned object
    expect(result).toEqual({ clientSecret: 'seti_xyz_secret_abc' })
    expect((result as any).stripeCustomerId).toBeUndefined()
  })
})

describe('createSubscription', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws PAYMENT_METHOD_REQUIRED if Redis has no customer ID for user', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null) // no setup session

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'p1', paymentMethodId: 'pm_abc' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('PAYMENT_METHOD_REQUIRED')
  })

  it('throws SUBSCRIPTION_ALREADY_ACTIVE if user already has active subscription', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue({ id: 's1', status: 'ACTIVE' })

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'p1', paymentMethodId: 'pm_abc' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('SUBSCRIPTION_ALREADY_ACTIVE')
  })

  it('throws PLAN_NOT_FOUND if plan does not exist', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue(null)

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'bad-plan', paymentMethodId: 'pm_abc' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('PLAN_NOT_FOUND')
  })

  it('throws PROMO_CODE_INVALID if promo code not found', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue({ id: 'p1', isActive: true, stripePriceId: 'price_123' })
    prisma.promoCode.findUnique.mockResolvedValue(null)

    await expect(
      createSubscription(
        prisma, redis, 'user-1',
        { planId: 'p1', paymentMethodId: 'pm_abc', promoCode: 'BADCODE' },
        { ipAddress: '127.0.0.1', userAgent: 'test' }
      )
    ).rejects.toThrow('PROMO_CODE_INVALID')
  })

  it('reads customerId from Redis, attaches payment method, creates subscription, deletes Redis key', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc') // resolved from Redis, NOT from client
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'p1', isActive: true, stripePriceId: 'price_monthly',
    })
    ;(stripe.paymentMethods.attach as any).mockResolvedValue({})
    ;(stripe.subscriptions.create as any).mockResolvedValue({
      id: 'sub_xyz', status: 'active',
      current_period_start: 1700000000,
      current_period_end: 1702592000,
    })
    prisma.subscription.create.mockResolvedValue({ id: 'db-sub-1', status: 'ACTIVE' })

    const result = await createSubscription(
      prisma, redis, 'user-1',
      { planId: 'p1', paymentMethodId: 'pm_abc' },
      { ipAddress: '127.0.0.1', userAgent: 'test' }
    )

    expect(redis.get).toHaveBeenCalledWith('sub:setup:user-1')
    expect(stripe.paymentMethods.attach).toHaveBeenCalledWith('pm_abc', { customer: 'cus_abc' })
    expect(stripe.subscriptions.create).toHaveBeenCalledWith({
      customer: 'cus_abc',
      items: [{ price: 'price_monthly' }],
      default_payment_method: 'pm_abc',
      expand: ['latest_invoice.payment_intent'],
    })
    expect(redis.del).toHaveBeenCalledWith('sub:setup:user-1')
    expect(prisma.subscription.create).toHaveBeenCalled()
    expect(result).toEqual({ id: 'db-sub-1', status: 'ACTIVE' })
  })

  it('applies promo via stripeCouponId when provided', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue('cus_abc')
    prisma.subscription.findUnique.mockResolvedValue(null)
    prisma.subscriptionPlan.findUnique.mockResolvedValue({
      id: 'p1', isActive: true, stripePriceId: 'price_monthly',
    })
    prisma.promoCode.findUnique.mockResolvedValue({
      id: 'promo-1', isActive: true, expiresAt: null,
      maxUses: null, usesCount: 0,
      stripeCouponId: 'cpn_summer20',
    })
    ;(stripe.paymentMethods.attach as any).mockResolvedValue({})
    ;(stripe.subscriptions.create as any).mockResolvedValue({
      id: 'sub_xyz', status: 'active',
      current_period_start: 1700000000,
      current_period_end: 1702592000,
    })
    prisma.subscription.create.mockResolvedValue({ id: 'db-sub-1', status: 'ACTIVE' })
    prisma.promoCode.update.mockResolvedValue({})

    await createSubscription(
      prisma, redis, 'user-1',
      { planId: 'p1', paymentMethodId: 'pm_abc', promoCode: 'SUMMER20' },
      { ipAddress: '127.0.0.1', userAgent: 'test' }
    )

    expect(stripe.subscriptions.create).toHaveBeenCalledWith(
      expect.objectContaining({
        discounts: [{ coupon: 'cpn_summer20' }],
      })
    )
  })
})

describe('cancelSubscription', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws SUBSCRIPTION_NOT_FOUND if no subscription', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue(null)

    await expect(
      cancelSubscription(prisma, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'test' })
    ).rejects.toThrow('SUBSCRIPTION_NOT_FOUND')
  })

  it('throws SUBSCRIPTION_NOT_CANCELLABLE if already cancelled', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      id: 's1', status: 'CANCELLED', stripeSubscriptionId: 'sub_xyz',
    })

    await expect(
      cancelSubscription(prisma, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'test' })
    ).rejects.toThrow('SUBSCRIPTION_NOT_CANCELLABLE')
  })

  it('sets cancelAtPeriodEnd on Stripe and updates DB', async () => {
    const prisma = mockPrisma()
    prisma.subscription.findUnique.mockResolvedValue({
      id: 's1', status: 'ACTIVE', stripeSubscriptionId: 'sub_xyz',
    })
    ;(stripe.subscriptions.update as any).mockResolvedValue({ id: 'sub_xyz' })
    prisma.subscription.update.mockResolvedValue({ id: 's1', status: 'ACTIVE', cancelAtPeriodEnd: true })

    const result = await cancelSubscription(prisma, 'user-1', { ipAddress: '127.0.0.1', userAgent: 'test' })

    expect(stripe.subscriptions.update).toHaveBeenCalledWith('sub_xyz', { cancel_at_period_end: true })
    expect(prisma.subscription.update).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      data: { cancelAtPeriodEnd: true, cancelledAt: expect.any(Date) },
    })
    expect(result.cancelAtPeriodEnd).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/subscription/service.test.ts
```

Expected: FAIL — `Cannot find module '../../../src/api/subscription/service'`

- [ ] **Step 3: Create `src/api/subscription/service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { stripe } from '../shared/stripe'
import { AppError } from '../shared/errors'
import { writeAuditLog } from '../shared/audit'

interface RequestCtx {
  ipAddress: string
  userAgent: string
}

const ACTIVE_STATUSES = ['ACTIVE', 'TRIALLING', 'PAST_DUE'] as const
const SETUP_KEY = (userId: string) => `sub:setup:${userId}`
const SETUP_TTL = 3600 // 1 hour

export async function getActivePlans(prisma: PrismaClient) {
  return prisma.subscriptionPlan.findMany({
    where: { isActive: true },
    orderBy: { sortOrder: 'asc' },
  })
}

export async function getMySubscription(prisma: PrismaClient, userId: string) {
  return prisma.subscription.findUnique({
    where: { userId },
    include: { plan: true },
  })
}

/**
 * Step 1 of the payment flow.
 * Creates a Stripe customer, stores stripeCustomerId in Redis (TTL 1h),
 * and returns only clientSecret to the frontend.
 * stripeCustomerId never leaves the server.
 */
export async function createSetupIntent(
  prisma: PrismaClient,
  redis: Redis,
  userId: string
): Promise<{ clientSecret: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true },
  })
  if (!user) throw new AppError('INVALID_CREDENTIALS')

  let stripeCustomerId: string
  try {
    const customer = await stripe.customers.create({
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(' ') || undefined,
      metadata: { userId },
    })
    stripeCustomerId = customer.id
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // Store server-side — client never sees this
  await redis.set(SETUP_KEY(userId), stripeCustomerId, 'EX', SETUP_TTL)

  let clientSecret: string
  try {
    const intent = await stripe.setupIntents.create({
      customer: stripeCustomerId,
      usage: 'off_session',
    })
    clientSecret = intent.client_secret!
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  return { clientSecret }
}

/**
 * Step 2 of the payment flow.
 * Reads stripeCustomerId from Redis using the authenticated userId as key —
 * never from the request body. Throws PAYMENT_METHOD_REQUIRED if the setup
 * session has expired or never existed.
 */
export async function createSubscription(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { planId: string; paymentMethodId: string; promoCode?: string },
  ctx: RequestCtx
) {
  // Resolve Stripe customer ID server-side from Redis
  const stripeCustomerId = await redis.get(SETUP_KEY(userId))
  if (!stripeCustomerId) throw new AppError('PAYMENT_METHOD_REQUIRED')

  // Guard: no existing active subscription
  const existing = await prisma.subscription.findUnique({ where: { userId } })
  if (existing && (ACTIVE_STATUSES as readonly string[]).includes(existing.status)) {
    throw new AppError('SUBSCRIPTION_ALREADY_ACTIVE')
  }

  // Validate plan
  const plan = await prisma.subscriptionPlan.findUnique({ where: { id: data.planId } })
  if (!plan || !plan.isActive) throw new AppError('PLAN_NOT_FOUND')

  // Validate promo code — use stripeCouponId for Stripe API call, not the human code
  let promoCodeId: string | undefined
  let stripeCouponId: string | undefined
  if (data.promoCode) {
    const promo = await prisma.promoCode.findUnique({ where: { code: data.promoCode } })
    if (!promo || !promo.isActive || (promo.expiresAt && promo.expiresAt < new Date())) {
      throw new AppError('PROMO_CODE_INVALID')
    }
    if (promo.maxUses !== null && promo.usesCount >= promo.maxUses) {
      throw new AppError('PROMO_CODE_EXHAUSTED')
    }
    promoCodeId = promo.id
    stripeCouponId = promo.stripeCouponId ?? undefined
  }

  // Attach the confirmed payment method to the Stripe customer
  try {
    await stripe.paymentMethods.attach(data.paymentMethodId, { customer: stripeCustomerId })
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // Create Stripe subscription
  let stripeSub: Awaited<ReturnType<typeof stripe.subscriptions.create>>
  try {
    stripeSub = await stripe.subscriptions.create({
      customer: stripeCustomerId,
      items: [{ price: plan.stripePriceId }],
      default_payment_method: data.paymentMethodId,
      ...(stripeCouponId ? { discounts: [{ coupon: stripeCouponId }] } : {}),
      expand: ['latest_invoice.payment_intent'],
    })
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // Persist to DB
  const sub = await prisma.subscription.create({
    data: {
      userId,
      planId: plan.id,
      stripeSubscriptionId: stripeSub.id,
      stripeCustomerId,
      status: stripeStatusToLocal(stripeSub.status),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:   new Date(stripeSub.current_period_end * 1000),
      ...(promoCodeId ? { promoCodeId } : {}),
    },
  })

  // Clean up setup session — one-time use
  await redis.del(SETUP_KEY(userId))

  // Increment promo uses
  if (promoCodeId) {
    await prisma.promoCode.update({
      where: { id: promoCodeId },
      data: { usesCount: { increment: 1 } },
    })
    writeAuditLog(prisma, {
      entityId: userId, entityType: 'customer',
      event: 'SUBSCRIPTION_PROMO_APPLIED',
      ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
      metadata: { promoCodeId },
    })
  }

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'SUBSCRIPTION_CREATED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { planId: plan.id, stripeSubscriptionId: stripeSub.id },
  })

  return sub
}

export async function cancelSubscription(
  prisma: PrismaClient,
  userId: string,
  ctx: RequestCtx
) {
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub) throw new AppError('SUBSCRIPTION_NOT_FOUND')
  if (sub.status === 'CANCELLED' || sub.status === 'EXPIRED') {
    throw new AppError('SUBSCRIPTION_NOT_CANCELLABLE')
  }

  try {
    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    })
  } catch {
    throw new AppError('STRIPE_ERROR')
  }

  // cancelledAt = when the user requested cancellation (not when access ends)
  // Access continues until currentPeriodEnd; cancelAtPeriodEnd tells Stripe to terminate then
  const updated = await prisma.subscription.update({
    where: { userId },
    data: { cancelAtPeriodEnd: true, cancelledAt: new Date() },
  })

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'SUBSCRIPTION_CANCELLED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { stripeSubscriptionId: sub.stripeSubscriptionId },
  })

  return updated
}

function stripeStatusToLocal(
  status: string
): 'TRIALLING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE' {
  switch (status) {
    case 'trialing':    return 'TRIALLING'
    case 'active':      return 'ACTIVE'
    case 'canceled':    return 'CANCELLED'
    case 'past_due':    return 'PAST_DUE'
    case 'unpaid':      return 'PAST_DUE'
    case 'incomplete':  return 'PAST_DUE'
    default:            return 'EXPIRED'
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/api/subscription/service.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: Run full suite to check nothing regressed**

```bash
npx vitest run
```

Expected: All previously passing tests still pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/subscription/service.ts tests/api/subscription/service.test.ts
git commit -m "feat: subscription service — setup intent, subscribe with server-resolved customer, cancel"
```

---

## Task 6: Subscription REST routes and plugin

**Files:**
- Create: `src/api/subscription/routes.ts`
- Create: `src/api/subscription/plugin.ts`
- Create: `tests/api/subscription/routes.test.ts`

Routes:
- `GET /api/v1/subscription/plans` — browse plans
- `GET /api/v1/subscription/me` — current subscription status
- `POST /api/v1/subscription/setup-intent` — Step 1: get clientSecret for card collection
- `POST /api/v1/subscription` — Step 2: subscribe with `{ planId, paymentMethodId, promoCode? }` — no `stripeCustomerId` from client
- `DELETE /api/v1/subscription` — cancel at period end

- [ ] **Step 1: Write the failing tests**

Create `tests/api/subscription/routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    customers: { create: vi.fn() },
    paymentMethods: { attach: vi.fn() },
    setupIntents: { create: vi.fn() },
    subscriptions: { create: vi.fn(), update: vi.fn() },
  },
}))

describe('subscription routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      subscriptionPlan: { findMany: vi.fn(), findUnique: vi.fn() },
      subscription: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      user: { findUnique: vi.fn() },
      promoCode: { findUnique: vi.fn(), update: vi.fn() },
      userVoucherCycleState: { updateMany: vi.fn() },
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

  it('GET /api/v1/subscription/plans returns 200 with active plans', async () => {
    const plans = [
      { id: 'p1', name: 'Monthly', priceGbp: '6.99', billingInterval: 'MONTHLY' },
      { id: 'p2', name: 'Annual', priceGbp: '69.99', billingInterval: 'ANNUAL' },
    ]
    app.prisma.subscriptionPlan.findMany = vi.fn().mockResolvedValue(plans)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/plans',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual(plans)
  })

  it('GET /api/v1/subscription/plans returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/subscription/plans' })
    expect(res.statusCode).toBe(401)
  })

  it('GET /api/v1/subscription/me returns 200 with null when no subscription', async () => {
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue(null)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/subscription/me',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toBeNull()
  })

  it('POST /api/v1/subscription/setup-intent returns 200 with clientSecret only (no customerId)', async () => {
    app.prisma.user.findUnique = vi.fn().mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
    })
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.customers.create as any).mockResolvedValue({ id: 'cus_abc' })
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription/setup-intent',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.clientSecret).toBe('seti_xyz_secret_abc')
    // stripeCustomerId must not be exposed to the client
    expect(body.stripeCustomerId).toBeUndefined()
  })

  it('POST /api/v1/subscription returns 201 on successful subscribe', async () => {
    // Redis returns the customer ID server-side
    app.redis.get = vi.fn().mockResolvedValue('cus_abc')
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue(null)
    app.prisma.subscriptionPlan.findUnique = vi.fn().mockResolvedValue({
      id: 'p1', isActive: true, stripePriceId: 'price_monthly',
    })
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.paymentMethods.attach as any).mockResolvedValue({})
    ;(stripe.subscriptions.create as any).mockResolvedValue({
      id: 'sub_xyz', status: 'active',
      current_period_start: 1700000000,
      current_period_end: 1702592000,
    })
    app.prisma.subscription.create = vi.fn().mockResolvedValue({
      id: 'db-sub-1', status: 'ACTIVE', planId: 'p1',
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      // Note: no stripeCustomerId in payload — that comes from Redis server-side
      payload: { planId: 'p1', paymentMethodId: 'pm_abc' },
    })

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).status).toBe('ACTIVE')
  })

  it('POST /api/v1/subscription returns 400 without paymentMethodId', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { planId: 'p1' },
    })

    expect(res.statusCode).toBe(400)
  })

  it('POST /api/v1/subscription returns 400 if no setup session in Redis', async () => {
    app.redis.get = vi.fn().mockResolvedValue(null) // no setup session

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { planId: 'p1', paymentMethodId: 'pm_abc' },
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('PAYMENT_METHOD_REQUIRED')
  })

  it('POST /api/v1/subscription returns 409 if already subscribed', async () => {
    app.redis.get = vi.fn().mockResolvedValue('cus_abc')
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({ id: 's1', status: 'ACTIVE' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { planId: 'p1', paymentMethodId: 'pm_abc' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('SUBSCRIPTION_ALREADY_ACTIVE')
  })

  it('DELETE /api/v1/subscription returns 200 on successful cancel', async () => {
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      id: 's1', status: 'ACTIVE', stripeSubscriptionId: 'sub_xyz',
    })
    const { stripe } = await import('../../../src/api/shared/stripe')
    ;(stripe.subscriptions.update as any).mockResolvedValue({ id: 'sub_xyz' })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({
      id: 's1', status: 'ACTIVE', cancelAtPeriodEnd: true,
    })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/subscription',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).cancelAtPeriodEnd).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/subscription/routes.test.ts
```

Expected: FAIL — routes not registered

- [ ] **Step 3: Create `src/api/subscription/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { getActivePlans, getMySubscription, createSetupIntent, createSubscription, cancelSubscription } from './service'

export async function subscriptionRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/subscription'

  app.get(`${prefix}/plans`, async (req: FastifyRequest, reply) => {
    const plans = await getActivePlans(app.prisma)
    return reply.send(plans)
  })

  app.get(`${prefix}/me`, async (req: FastifyRequest, reply) => {
    const sub = await getMySubscription(app.prisma, req.user.sub)
    return reply.send(sub)
  })

  // Step 1: create Stripe customer + SetupIntent; returns clientSecret only
  app.post(`${prefix}/setup-intent`, async (req: FastifyRequest, reply) => {
    const result = await createSetupIntent(app.prisma, app.redis, req.user.sub)
    return reply.send(result)
  })

  // Step 2: subscribe using confirmed paymentMethodId from Stripe SDK
  // stripeCustomerId is resolved server-side from Redis — not accepted from client
  app.post(prefix, async (req: FastifyRequest, reply) => {
    const body = z.object({
      planId:          z.string().min(1),
      paymentMethodId: z.string().min(1),
      promoCode:       z.string().optional(),
    }).parse(req.body)

    const sub = await createSubscription(app.prisma, app.redis, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(sub)
  })

  app.delete(prefix, async (req: FastifyRequest, reply) => {
    const result = await cancelSubscription(app.prisma, req.user.sub, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
```

- [ ] **Step 4: Create `src/api/subscription/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { subscriptionRoutes } from './routes'

async function subscriptionPlugin(app: FastifyInstance) {
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(subscriptionRoutes)
  })
}

export default fp(subscriptionPlugin, {
  name: 'subscription',
  dependencies: ['customer-auth'],
})
```

- [ ] **Step 5: Register the plugin in `src/api/app.ts`**

Add to the imports at the top:

```typescript
import subscriptionPlugin from './subscription/plugin'
```

Add after `await app.register(merchantManagementPlugin)`:

```typescript
await app.register(subscriptionPlugin)
```

- [ ] **Step 6: Run test to verify it passes**

```bash
npx vitest run tests/api/subscription/routes.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 7: Run full suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/api/subscription/routes.ts src/api/subscription/plugin.ts src/api/app.ts tests/api/subscription/routes.test.ts
git commit -m "feat: subscription REST routes — plans, setup-intent, subscribe, cancel"
```

---

## Task 7: Stripe webhook handler

**Files:**
- Create: `src/api/subscription/webhook.ts`
- Create: `tests/api/subscription/webhook.test.ts`
- Modify: `src/api/app.ts`

The webhook handler uses a **raw body** — Fastify's JSON parser is bypassed for this plugin only so Stripe's signature verification works. This `addContentTypeParser` call is scoped to the `webhookRoutes` plugin instance and does not affect any other route.

Webhook events handled:
- `customer.subscription.updated` — sync status and period dates
- `customer.subscription.deleted` — set status to CANCELLED
- `invoice.payment_succeeded` — on renewal (`billing_reason: subscription_cycle`), reset voucher cycle
- `invoice.payment_failed` — set status to PAST_DUE

- [ ] **Step 1: Write the failing tests**

Create `tests/api/subscription/webhook.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/shared/stripe', () => ({
  stripe: {
    webhooks: {
      constructEvent: vi.fn(),
    },
  },
}))

import { stripe } from '../../../src/api/shared/stripe'

describe('Stripe webhook handler', () => {
  let app: FastifyInstance

  beforeEach(async () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test'
    app = await buildApp()
    app.decorate('prisma', {
      subscription: { findUnique: vi.fn(), update: vi.fn() },
      userVoucherCycleState: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    await app.ready()
  })

  afterEach(async () => { await app.close() })

  it('returns 400 if signature is invalid', async () => {
    ;(stripe.webhooks.constructEvent as any).mockImplementation(() => {
      throw new Error('Signature mismatch')
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: { 'stripe-signature': 'bad-sig', 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('WEBHOOK_SIGNATURE_INVALID')
  })

  it('returns 200 and ignores unknown event types', async () => {
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'some.unknown.event',
      data: { object: {} },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: { 'stripe-signature': 'valid-sig', 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.statusCode).toBe(200)
  })

  it('handles customer.subscription.deleted — sets status to CANCELLED', async () => {
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'customer.subscription.deleted',
      data: {
        object: {
          id: 'sub_xyz',
          status: 'canceled',
          current_period_start: 1700000000,
          current_period_end: 1702592000,
        },
      },
    })
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({ id: 's1', userId: 'user-1' })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: { 'stripe-signature': 'valid-sig', 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { stripeSubscriptionId: 'sub_xyz' },
        data: expect.objectContaining({ status: 'CANCELLED' }),
      })
    )
  })

  it('handles invoice.payment_succeeded for renewal — resets voucher cycle', async () => {
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'invoice.payment_succeeded',
      data: {
        object: {
          subscription: 'sub_xyz',
          billing_reason: 'subscription_cycle',
        },
      },
    })
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({
      id: 's1', userId: 'user-1',
    })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})
    app.prisma.userVoucherCycleState.updateMany = vi.fn().mockResolvedValue({ count: 2 })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: { 'stripe-signature': 'valid-sig', 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.userVoucherCycleState.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'user-1', isRedeemedInCurrentCycle: true } })
    )
  })

  it('handles invoice.payment_failed — sets status to PAST_DUE', async () => {
    ;(stripe.webhooks.constructEvent as any).mockReturnValue({
      type: 'invoice.payment_failed',
      data: {
        object: { subscription: 'sub_xyz' },
      },
    })
    app.prisma.subscription.findUnique = vi.fn().mockResolvedValue({ id: 's1', userId: 'user-1' })
    app.prisma.subscription.update = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/stripe/webhook',
      headers: { 'stripe-signature': 'valid-sig', 'content-type': 'application/json' },
      body: '{}',
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.subscription.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'PAST_DUE' }),
      })
    )
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/subscription/webhook.test.ts
```

Expected: FAIL — webhook route not found (404)

- [ ] **Step 3: Create `src/api/subscription/webhook.ts`**

```typescript
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify'
import { stripe } from '../shared/stripe'
import { AppError } from '../shared/errors'
import { writeAuditLog } from '../shared/audit'
import { resetVoucherCycleForUser } from './cycle'
import type { PrismaClient } from '../../../generated/prisma/client'

function stripeStatusToLocal(
  status: string
): 'TRIALLING' | 'ACTIVE' | 'CANCELLED' | 'EXPIRED' | 'PAST_DUE' {
  switch (status) {
    case 'trialing':    return 'TRIALLING'
    case 'active':      return 'ACTIVE'
    case 'canceled':    return 'CANCELLED'
    case 'past_due':    return 'PAST_DUE'
    case 'unpaid':      return 'PAST_DUE'
    case 'incomplete':  return 'PAST_DUE'
    default:            return 'EXPIRED'
  }
}

async function handleSubscriptionUpdated(prisma: PrismaClient, stripeSub: any) {
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: stripeSub.id },
  })
  if (!sub) return

  await prisma.subscription.update({
    where: { stripeSubscriptionId: stripeSub.id },
    data: {
      status:             stripeStatusToLocal(stripeSub.status),
      currentPeriodStart: new Date(stripeSub.current_period_start * 1000),
      currentPeriodEnd:   new Date(stripeSub.current_period_end * 1000),
    },
  })
}

async function handleSubscriptionDeleted(prisma: PrismaClient, stripeSub: any) {
  await prisma.subscription.update({
    where: { stripeSubscriptionId: stripeSub.id },
    data: { status: 'CANCELLED' },
  })
}

async function handlePaymentSucceeded(prisma: PrismaClient, invoice: any) {
  // Only reset cycle on renewal — not on first payment
  if (invoice.billing_reason !== 'subscription_cycle') return

  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
  })
  if (!sub) return

  writeAuditLog(prisma, {
    entityId: sub.userId, entityType: 'customer',
    event: 'SUBSCRIPTION_RENEWED',
    ipAddress: 'stripe-webhook', userAgent: 'stripe',
    metadata: { stripeSubscriptionId: invoice.subscription },
  })

  await resetVoucherCycleForUser(prisma, sub.userId)

  writeAuditLog(prisma, {
    entityId: sub.userId, entityType: 'customer',
    event: 'VOUCHER_CYCLE_RESET',
    ipAddress: 'stripe-webhook', userAgent: 'stripe',
  })
}

async function handlePaymentFailed(prisma: PrismaClient, invoice: any) {
  const sub = await prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription },
  })
  if (!sub) return

  await prisma.subscription.update({
    where: { stripeSubscriptionId: invoice.subscription },
    data: { status: 'PAST_DUE' },
  })

  writeAuditLog(prisma, {
    entityId: sub.userId, entityType: 'customer',
    event: 'SUBSCRIPTION_PAYMENT_FAILED',
    ipAddress: 'stripe-webhook', userAgent: 'stripe',
    metadata: { stripeSubscriptionId: invoice.subscription },
  })
}

export async function webhookRoutes(app: FastifyInstance) {
  // Parse body as raw Buffer for this plugin only — required for Stripe signature verification.
  // Scoped to this plugin instance; does not affect JSON parsing on other routes.
  app.addContentTypeParser(
    'application/json',
    { parseAs: 'buffer' },
    (_req, body, done) => done(null, body)
  )

  app.post('/api/v1/stripe/webhook', async (req: FastifyRequest, reply: FastifyReply) => {
    const sig = req.headers['stripe-signature'] as string
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

    let event: ReturnType<typeof stripe.webhooks.constructEvent>
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig, secret)
    } catch {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID')
    }

    const obj = (event.data as any).object

    switch (event.type) {
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(app.prisma, obj)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(app.prisma, obj)
        break
      case 'invoice.payment_succeeded':
        await handlePaymentSucceeded(app.prisma, obj)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(app.prisma, obj)
        break
      default:
        break
    }

    return reply.send({ received: true })
  })
}
```

- [ ] **Step 4: Register webhook route in `src/api/app.ts`**

Add import:

```typescript
import { webhookRoutes } from './subscription/webhook'
```

Add after `await app.register(subscriptionPlugin)`:

```typescript
// Webhook registered outside subscription plugin — no JWT auth, Stripe signature is the auth
await app.register(webhookRoutes)
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/api/subscription/webhook.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 6: Run full suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/subscription/webhook.ts src/api/app.ts tests/api/subscription/webhook.test.ts
git commit -m "feat: Stripe webhook handler — subscription lifecycle and voucher cycle reset"
```

---

## Task 8: Final verification and push

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass (previous 68 + new subscription tests).

- [ ] **Step 2: Check TypeScript compiles cleanly**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 3: Push to GitHub**

```bash
git push
```

- [ ] **Step 4: Update CLAUDE.md build progress**

In `CLAUDE.md`, change the Phase 2D line from `🔲` to `✅`:

```markdown
### ✅ Phase 2D — Subscription System (COMPLETE)
- Stripe SetupIntent-based payment flow (card collection via Stripe SDK)
- stripeCustomerId stored server-side in Redis — never exposed to client
- Subscription creation with confirmed payment method
- Cancel at period end (access continues until currentPeriodEnd)
- Webhook handler: renewal, cancellation, payment failure, voucher cycle reset
- stripeCouponId on PromoCode for explicit Stripe coupon mapping
```

- [ ] **Step 5: Commit CLAUDE.md**

```bash
git add CLAUDE.md
git commit -m "chore: mark Phase 2D subscription system as complete"
git push
```

---

## Environment Variables Required

Add to `.env` (local) and `.env.example` (committed):

```
STRIPE_SECRET_KEY=sk_test_...         # from Stripe Dashboard → Developers → API keys
STRIPE_WEBHOOK_SECRET=whsec_...       # from Stripe Dashboard → Webhooks → endpoint secret
```

## Stripe Dashboard Configuration

Register the webhook endpoint in Stripe Dashboard → Developers → Webhooks:
- **URL:** `https://your-api-domain/api/v1/stripe/webhook`
- **Events:** `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`

For local testing use Stripe CLI:
```bash
stripe listen --forward-to localhost:3000/api/v1/stripe/webhook
```
