# Subscription Layer Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the subscription layer with two targeted fixes: Stripe customer reuse (preventing orphaned customers on repeat setup-intent calls) and webhook idempotency (preventing double-processing on Stripe retries).

**Architecture:** Task 1 adds `stripeCustomerId String?` to `User` and migrates the DB. Task 2 adds a `StripeWebhookEvent` deduplication table and migrates the DB. Both tasks are independent — they touch different files and can be reviewed separately. The webhook deduplication check sits at the top of the handler before any business logic runs.

**Tech Stack:** Prisma 7, Fastify 5, TypeScript, Vitest. No new npm packages required.

---

## Rollout and ordering notes

- **Task 1 must be deployed before real users subscribe.** Once a user calls setup-intent and subscribes in production, they will have a Stripe customer ID that should be reused. Deploying Task 1 after production sign-ups start means early users still accumulate orphans — the field only helps for new setups after deployment.
- **Task 2 can be deployed at any time** — the `StripeWebhookEvent` table starts empty and the deduplication check is a no-op until the first duplicate event arrives.
- **Migration order:** Run Task 1 migration first (schema change to `User`), then Task 2 migration (`StripeWebhookEvent`). They are independent but sequential to keep migrations clean.
- **No downtime concern:** Both migrations are additive (nullable column + new table). No existing rows are affected and no locks on hot tables.

---

## File Map

| File | Action | Responsibility |
|---|---|---|
| `prisma/schema.prisma` | Modify (twice) | Add `stripeCustomerId String?` to `User`; add `StripeWebhookEvent` model |
| `prisma/migrations/` | Create (twice) | One migration per task |
| `src/api/subscription/service.ts` | Modify | `createSetupIntent` — reuse existing customer ID, persist new one to `User` |
| `src/api/subscription/webhook.ts` | Modify | Add idempotency guard at top of handler |
| `tests/api/subscription/service.test.ts` | Modify | Update `createSetupIntent` test; add reuse test |
| `tests/api/subscription/webhook.test.ts` | Modify | Add duplicate-event test |

---

## Task 1: Stripe customer reuse — schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `stripeCustomerId String?` to the `User` model in `prisma/schema.prisma`**

Find the `User` model (line ~100). Add the field after `marketingConsentAt`:

```prisma
model User {
  id                   String     @id @default(uuid())
  email                String     @unique
  phone                String?    @unique
  phoneCountryCode     String?
  passwordHash         String?
  firstName            String?
  lastName             String?
  dateOfBirth          DateTime?
  gender               String?
  addressLine1         String?
  addressLine2         String?
  city                 String?
  postcode             String?
  profileImageUrl      String?
  status               UserStatus @default(ACTIVE)
  newsletterConsent    Boolean    @default(false)
  tcConsentVersion     String?
  tcConsentAt          DateTime?
  tutorialSeen         Boolean    @default(false)
  createdAt            DateTime   @default(now())
  updatedAt            DateTime   @updatedAt
  deletedAt            DateTime?
  emailVerified        Boolean    @default(false)
  phoneVerified        Boolean    @default(false)
  marketingConsentAt   DateTime?
  stripeCustomerId     String?    @unique  // set on first setup-intent, reused on subsequent calls

  ssoProviders         UserSsoProvider[]
  interests            UserInterest[]
  redemptions          VoucherRedemption[]
  voucherCycleStates   UserVoucherCycleState[]
  subscription         Subscription?
  reviews              Review[]
  favouriteMerchants   FavouriteMerchant[]
  favouriteVouchers    FavouriteVoucher[]
  notifications        Notification[]
  communications       CommunicationLog[]

  @@index([email])
  @@index([phone])
  @@index([status])
}
```

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-user-stripe-customer-id
```

Expected: Migration created and applied. `prisma generate` runs automatically.

- [ ] **Step 3: Verify generated types**

```bash
grep -n "stripeCustomerId" generated/prisma/models/User.ts | head -5
```

Expected: `stripeCustomerId` appears as `string | null`.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add stripeCustomerId to User for Stripe customer reuse"
```

---

## Task 2: Stripe webhook idempotency — schema + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add `StripeWebhookEvent` model to `prisma/schema.prisma`**

Add this model after the `Subscription` model (around line 829):

```prisma
// ─────────────────────────────────────────
// STRIPE WEBHOOK DEDUPLICATION
// ─────────────────────────────────────────

model StripeWebhookEvent {
  id            String   @id @default(uuid())
  stripeEventId String   @unique
  processedAt   DateTime @default(now())

  @@index([processedAt])
}
```

The `@@index([processedAt])` supports a future cleanup job that prunes records older than 30 days.

- [ ] **Step 2: Run migration**

```bash
npx prisma migrate dev --name add-stripe-webhook-event
```

Expected: Migration created and applied.

- [ ] **Step 3: Verify generated types**

```bash
grep -n "StripeWebhookEvent\|stripeWebhookEvent" generated/prisma/client/index.d.ts | head -5
```

Expected: Model and client accessor appear in generated types.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add StripeWebhookEvent table for webhook idempotency"
```

---

## Task 3: Implement Stripe customer reuse in `createSetupIntent`

**Files:**
- Modify: `src/api/subscription/service.ts`
- Modify: `tests/api/subscription/service.test.ts`

**Logic:** On each `createSetupIntent` call, read `stripeCustomerId` from `User`. If it exists, skip `stripe.customers.create` and use the existing ID. If it does not exist, create a new customer and immediately write the ID back to `User` before storing in Redis. This makes the function idempotent for repeat callers.

- [ ] **Step 1: Write the failing tests**

Replace the existing `createSetupIntent` describe block in `tests/api/subscription/service.test.ts` with:

```typescript
describe('createSetupIntent', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('creates new Stripe customer when user has none, persists to User, stores in Redis, returns only clientSecret', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    // User has no stripeCustomerId yet
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
      stripeCustomerId: null,
    })
    prisma.user.update = vi.fn().mockResolvedValue({})
    ;(stripe.customers.create as any).mockResolvedValue({ id: 'cus_abc' })
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const result = await createSetupIntent(prisma, redis, 'user-1')

    // Must create a new Stripe customer
    expect(stripe.customers.create).toHaveBeenCalledWith({
      email: 'test@example.com',
      name: 'Test User',
      metadata: { userId: 'user-1' },
    })
    // Must persist to User immediately
    expect(prisma.user.update).toHaveBeenCalledWith({
      where: { id: 'user-1' },
      data: { stripeCustomerId: 'cus_abc' },
    })
    // Must store in Redis for the two-step flow
    expect(redis.set).toHaveBeenCalledWith('sub:setup:user-1', 'cus_abc', 'EX', 3600)
    // stripeCustomerId must NOT be in the returned object
    expect(result).toEqual({ clientSecret: 'seti_xyz_secret_abc' })
    expect((result as any).stripeCustomerId).toBeUndefined()
  })

  it('reuses existing Stripe customer — skips customers.create, still stores in Redis', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    // User already has a stripeCustomerId from a previous setup-intent
    prisma.user.findUnique.mockResolvedValue({
      id: 'user-1', email: 'test@example.com', firstName: 'Test', lastName: 'User',
      stripeCustomerId: 'cus_existing',
    })
    prisma.user.update = vi.fn()
    ;(stripe.setupIntents.create as any).mockResolvedValue({
      id: 'seti_xyz',
      client_secret: 'seti_xyz_secret_abc',
    })

    const result = await createSetupIntent(prisma, redis, 'user-1')

    // Must NOT create a new customer
    expect(stripe.customers.create).not.toHaveBeenCalled()
    // Must NOT update User (ID already persisted)
    expect(prisma.user.update).not.toHaveBeenCalled()
    // Must still store existing ID in Redis
    expect(redis.set).toHaveBeenCalledWith('sub:setup:user-1', 'cus_existing', 'EX', 3600)
    expect(result).toEqual({ clientSecret: 'seti_xyz_secret_abc' })
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/subscription/service.test.ts
```

Expected: Both new tests FAIL — `createSetupIntent` does not yet read `stripeCustomerId` from `User`.

- [ ] **Step 3: Update `createSetupIntent` in `src/api/subscription/service.ts`**

Replace the entire `createSetupIntent` function:

```typescript
export async function createSetupIntent(
  prisma: PrismaClient,
  redis: Redis,
  userId: string
): Promise<{ clientSecret: string }> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true, firstName: true, lastName: true, stripeCustomerId: true },
  })
  if (!user) throw new AppError('INVALID_CREDENTIALS')

  let stripeCustomerId: string

  if (user.stripeCustomerId) {
    // Reuse existing Stripe customer — avoids creating orphaned duplicate customers
    stripeCustomerId = user.stripeCustomerId
  } else {
    // First time: create customer and persist immediately so future calls reuse it
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

    await prisma.user.update({
      where: { id: userId },
      data: { stripeCustomerId },
    })
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/subscription/service.test.ts
```

Expected: All tests PASS including both new `createSetupIntent` tests.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: All tests pass. TypeScript compiles cleanly:

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/api/subscription/service.ts tests/api/subscription/service.test.ts
git commit -m "feat: reuse existing Stripe customer on setup-intent to prevent orphaned customers"
```

---

## Task 4: Implement webhook idempotency guard

**Files:**
- Modify: `src/api/subscription/webhook.ts`
- Modify: `tests/api/subscription/webhook.test.ts`

**Logic:** At the top of the webhook handler (after signature verification, before the event switch), check whether `event.id` exists in `StripeWebhookEvent`. If it does, return `{ received: true }` immediately — this is a safe, idempotent acknowledgement. If it does not, insert it and proceed. The unique constraint on `stripeEventId` acts as a safety net against a narrow race condition.

The `prisma` mock in the webhook test currently does not include `stripeWebhookEvent`. It needs to be added.

- [ ] **Step 1: Write the failing test**

Add this test to `tests/api/subscription/webhook.test.ts`, inside the existing `describe` block, after the last `it(...)`:

```typescript
it('returns 200 immediately without processing if event was already handled', async () => {
  const { stripe } = await import('../../../src/api/shared/stripe')
  ;(stripe.webhooks.constructEvent as any).mockReturnValue({
    id: 'evt_already_seen',
    type: 'invoice.payment_failed',
    data: { object: { id: 'in_fail', subscription: 'sub_xyz' } },
  })

  // Simulate: event already in the deduplication table
  app.prisma.stripeWebhookEvent = {
    findUnique: vi.fn().mockResolvedValue({ id: 'row-1', stripeEventId: 'evt_already_seen' }),
    create: vi.fn(),
  } as any

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/stripe/webhook',
    headers: { 'content-type': 'application/json', 'stripe-signature': 'valid-sig' },
    payload: JSON.stringify({}),
  })

  expect(res.statusCode).toBe(200)
  expect(JSON.parse(res.body)).toEqual({ received: true })
  // Must not have attempted to process the event
  expect(app.prisma.subscription.update).not.toHaveBeenCalled()
  expect(app.prisma.stripeWebhookEvent.create).not.toHaveBeenCalled()
})
```

Also add `stripeWebhookEvent` to the `app.decorate('prisma', ...)` call in `beforeEach` so the existing tests don't error:

```typescript
app.decorate('prisma', {
  subscription: {
    findUnique: vi.fn(),
    update: vi.fn(),
  },
  userVoucherCycleState: {
    updateMany: vi.fn().mockResolvedValue({ count: 0 }),
  },
  auditLog: {
    create: vi.fn().mockResolvedValue({}),
  },
  stripeWebhookEvent: {
    findUnique: vi.fn().mockResolvedValue(null),  // default: event not yet seen
    create: vi.fn().mockResolvedValue({}),
  },
} as any)
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/subscription/webhook.test.ts
```

Expected: The new test FAILS — the handler has no idempotency check yet.

- [ ] **Step 3: Add idempotency guard to `src/api/subscription/webhook.ts`**

Insert the idempotency check inside the route handler, immediately after the `constructEvent` block and before the `switch`. The full updated handler (replace from `app.post(...)` to the closing `}` of the route):

```typescript
  app.post('/api/v1/stripe/webhook', async (req, reply) => {
    const sig = req.headers['stripe-signature'] as string | undefined
    const secret = process.env.STRIPE_WEBHOOK_SECRET ?? 'whsec_placeholder'

    let event: ReturnType<typeof stripe.webhooks.constructEvent>
    try {
      event = stripe.webhooks.constructEvent(req.body as Buffer, sig ?? '', secret)
    } catch {
      throw new AppError('WEBHOOK_SIGNATURE_INVALID')
    }

    // Idempotency guard — Stripe retries for up to 72h on non-2xx responses.
    // Check event ID before any processing. The @unique constraint on stripeEventId
    // is the hard guard; this check avoids the exception path on normal retries.
    // In the unlikely race where two concurrent deliveries both pass the findUnique
    // check, the second stripeWebhookEvent.create will throw a unique-constraint
    // error (Prisma P2002). Fastify returns 500; Stripe retries; the retry hits
    // the alreadyProcessed guard and returns 200. This is correct and expected.
    const alreadyProcessed = await app.prisma.stripeWebhookEvent.findUnique({
      where: { stripeEventId: event.id },
    })
    if (alreadyProcessed) return reply.send({ received: true })

    await app.prisma.stripeWebhookEvent.create({
      data: { stripeEventId: event.id },
    })

    switch (event.type) {
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const stripeObj = event.data.object as unknown as {
          id: string
          status: string
          current_period_start: number
          current_period_end: number
        }

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: stripeObj.id },
        })
        if (!sub) break

        const status = event.type === 'customer.subscription.deleted'
          ? SubscriptionStatus.CANCELLED
          : mapStripeStatus(stripeObj.status)

        await app.prisma.subscription.update({
          where: { id: sub.id },
          data: {
            status,
            currentPeriodStart: new Date(stripeObj.current_period_start * 1000),
            currentPeriodEnd: new Date(stripeObj.current_period_end * 1000),
          },
        })

        if (event.type === 'customer.subscription.deleted') {
          writeAuditLog(app.prisma as any, {
            entityId: sub.userId,
            entityType: 'customer',
            event: 'SUBSCRIPTION_CANCELLED',
            ipAddress: 'webhook',
            userAgent: 'stripe',
          })
        } else {
          writeAuditLog(app.prisma as any, {
            entityId: sub.userId,
            entityType: 'customer',
            event: 'SUBSCRIPTION_RENEWED',
            ipAddress: 'webhook',
            userAgent: 'stripe',
          })
        }
        break
      }

      case 'invoice.payment_succeeded': {
        const invoice = event.data.object as unknown as {
          id: string
          billing_reason: string
          subscription: string
        }

        if (invoice.billing_reason !== 'subscription_cycle') break

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: invoice.subscription },
        })
        if (!sub) break

        await resetVoucherCycleForUser(app.prisma as any, sub.userId)

        writeAuditLog(app.prisma as any, {
          entityId: sub.userId,
          entityType: 'customer',
          event: 'VOUCHER_CYCLE_RESET',
          ipAddress: 'webhook',
          userAgent: 'stripe',
        })

        writeAuditLog(app.prisma as any, {
          entityId: sub.userId,
          entityType: 'customer',
          event: 'SUBSCRIPTION_RENEWED',
          ipAddress: 'webhook',
          userAgent: 'stripe',
          metadata: { invoiceId: invoice.id },
        })
        break
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object as unknown as {
          id: string
          subscription: string
        }

        const sub = await app.prisma.subscription.findUnique({
          where: { stripeSubscriptionId: invoice.subscription },
        })
        if (!sub) break

        await app.prisma.subscription.update({
          where: { id: sub.id },
          data: { status: SubscriptionStatus.PAST_DUE },
        })

        writeAuditLog(app.prisma as any, {
          entityId: sub.userId,
          entityType: 'customer',
          event: 'SUBSCRIPTION_PAYMENT_FAILED',
          ipAddress: 'webhook',
          userAgent: 'stripe',
          metadata: { invoiceId: invoice.id },
        })
        break
      }

      default:
        break
    }

    return reply.send({ received: true })
  })
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/subscription/webhook.test.ts
```

Expected: All 6 tests PASS.

- [ ] **Step 5: Run full suite**

```bash
npx vitest run
```

Expected: All tests pass.

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 6: Commit**

```bash
git add src/api/subscription/webhook.ts tests/api/subscription/webhook.test.ts
git commit -m "feat: webhook idempotency guard using StripeWebhookEvent deduplication table"
```

---

## Task 5: Final push

- [ ] **Step 1: Run full suite one final time**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 2: Push to GitHub**

```bash
git push
```

- [ ] **Step 3: Update CLAUDE.md**

In `CLAUDE.md`, find the `### ✅ Phase 2D — Subscription System (COMPLETE)` block and append:

```markdown
### ✅ Phase 2D Hardening (COMPLETE)
- Stripe customer reuse: stripeCustomerId persisted on User, reused on repeat setup-intent calls
- Webhook idempotency: StripeWebhookEvent table deduplicates Stripe retries by event ID
```

- [ ] **Step 4: Commit and push**

```bash
git add CLAUDE.md
git commit -m "chore: mark Phase 2D hardening as complete"
git push
```

---

## Self-Review

**Spec coverage:**
- Stripe customer reuse: Task 1 (schema) + Task 3 (service logic + tests) ✓
- Webhook idempotency: Task 2 (schema) + Task 4 (guard + tests) ✓
- Migration ordering documented in rollout notes ✓
- No downtime risk documented ✓

**Placeholder scan:** None found. All code blocks are complete and specific.

**Type consistency:**
- `user.stripeCustomerId` read in Task 3 matches the `stripeCustomerId String? @unique` field added in Task 1 ✓
- `app.prisma.stripeWebhookEvent.findUnique` / `.create` in Task 4 match the `StripeWebhookEvent` model added in Task 2 ✓
- `stripeWebhookEvent` added to the test mock's `prisma` decorate in Task 4 — existing tests won't break because the default mock returns `null` (event not yet seen) ✓
