# Profile Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Profile tab of the customer app — a full-featured account management hub covering personal info, subscription management, notification prefs, app settings, community features (rate/share/request merchant), an in-app support ticket system, and a compliant 3-step delete account flow, backed by two new backend features (merchant requests + support tickets).

**Architecture:** Backend-first for the two new features (MerchantRequest model + SupportTicket model with Redis ticket-number generation), then frontend feature module under `apps/customer-app/src/features/profile/`. All sheets use the existing custom `BottomSheet` component. Haptics and reduce-motion preferences are persisted to AsyncStorage and restored on app bootstrap. Delete account includes an immediate Stripe cancellation fix that was missing from the existing route.

**Tech Stack:** Node.js/Fastify/Prisma 7 (backend), React Native/Expo SDK 54, expo-router v4, @tanstack/react-query v5, react-native-reanimated ~3.16.0, expo-image-picker ~17.0.10, expo-location ~18.0.0, expo-store-review (new), expo-web-browser (new), @react-native-community/datetimepicker (new), lucide-react-native

**All work targets:** `.worktrees/customer-app/` (branch: `feature/customer-app`)

**Spec:** `docs/superpowers/specs/2026-04-22-profile-tab-design.md`

---

## File Map

### Backend (relative to `.worktrees/customer-app/`)
| Action | File |
|--------|------|
| Modify | `src/api/auth/customer/routes.ts` |
| Modify | `prisma/schema.prisma` |
| Create | `src/api/customer/merchant-requests/service.ts` |
| Create | `src/api/customer/merchant-requests/routes.ts` |
| Create | `src/api/customer/support/service.ts` |
| Create | `src/api/customer/support/routes.ts` |
| Modify | `src/api/customer/plugin.ts` |
| Create | `tests/api/customer/merchant-requests.routes.test.ts` |
| Create | `tests/api/customer/support.routes.test.ts` |

### Frontend (relative to `.worktrees/customer-app/apps/customer-app/`)
| Action | File |
|--------|------|
| Modify | `src/stores/auth.ts` |
| Modify | `src/lib/api/auth.ts` |
| Modify | `src/lib/api/subscription.ts` |
| Create | `src/lib/api/merchant-requests.ts` |
| Create | `src/lib/api/support.ts` |
| Create | `src/lib/constants/supportTopics.ts` |
| Create | `src/lib/config/links.ts` |
| Create | `src/features/profile/hooks/useReduceMotion.ts` |
| Create | `src/features/profile/hooks/useCancelSubscription.ts` |
| Create | `src/features/profile/hooks/useMerchantRequest.ts` |
| Create | `src/features/profile/hooks/useSupportTickets.ts` |
| Create | `src/features/profile/hooks/useCreateTicket.ts` |
| Create | `src/features/profile/hooks/useDeleteAccount.ts` |
| Create | `src/features/profile/components/ProfileSectionCard.tsx` |
| Create | `src/features/profile/components/ProfileRow.tsx` |
| Create | `src/features/profile/components/ProfileHeader.tsx` |
| Create | `src/features/profile/components/PersonalInfoSheet.tsx` |
| Create | `src/features/profile/components/AddressSheet.tsx` |
| Create | `src/features/profile/components/InterestsSheet.tsx` |
| Create | `src/features/profile/components/ChangePasswordSheet.tsx` |
| Create | `src/features/profile/components/SubscriptionManagementSheet.tsx` |
| Create | `src/features/profile/components/NotificationsSection.tsx` |
| Create | `src/features/profile/components/AppSettingsSection.tsx` |
| Create | `src/features/profile/components/RedeemoSection.tsx` |
| Create | `src/features/profile/components/RequestMerchantSheet.tsx` |
| Create | `src/features/profile/components/GetHelpModal.tsx` |
| Create | `src/features/profile/components/SupportLegalSection.tsx` |
| Create | `src/features/profile/components/DeleteAccountFlow.tsx` |
| Create | `src/features/profile/screens/ProfileScreen.tsx` |
| Modify | `app/(app)/profile.tsx` |
| Create | `src/features/profile/__tests__/ProfileHeader.test.tsx` |
| Create | `src/features/profile/__tests__/AppSettingsSection.test.tsx` |
| Create | `src/features/profile/__tests__/NotificationsSection.test.tsx` |
| Create | `src/features/profile/__tests__/SubscriptionManagementSheet.test.tsx` |
| Create | `src/features/profile/__tests__/DeleteAccountFlow.test.tsx` |

---

## Task 1: Fix delete-account to cancel Stripe subscription immediately

**Files:**
- Modify: `src/api/auth/customer/routes.ts`
- Test: `tests/api/auth/customer.routes.test.ts` (or the existing auth test file)

The existing `POST /api/v1/customer/auth/delete-account` anonymises the user but never cancels the Stripe subscription. This means cancelled users continue to be billed. This task fixes that by cancelling Stripe immediately before anonymising.

- [ ] **Step 1: Write the failing test**

Find the existing auth routes test file. Add inside the describe block:

```ts
it('POST /delete-account calls stripe.subscriptions.cancel when subscription has stripeSubscriptionId', async () => {
  const stripeMock = { subscriptions: { cancel: vi.fn().mockResolvedValue({}) } }
  vi.doMock('../../../src/api/shared/stripe', () => ({ stripe: stripeMock }))

  // Simulate finding a subscription with a stripeId
  ;(app as any).prisma.subscription = {
    findUnique: vi.fn().mockResolvedValue({
      stripeSubscriptionId: 'sub_test123',
      status: 'ACTIVE',
    }),
    update: vi.fn().mockResolvedValue({}),
  }

  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/customer/auth/delete-account',
    headers: { authorization: `Bearer ${customerToken}` },
    payload: { actionToken: 'valid-token' },
  })
  // Route validates the redis token — this is an integration detail.
  // Core assertion: stripe.cancel was called
  expect(stripeMock.subscriptions.cancel).toHaveBeenCalledWith('sub_test123')
})
```

- [ ] **Step 2: Run the test — expect it to fail**

```bash
cd .worktrees/customer-app
npx vitest run tests/api/auth/ -t "cancel"
```

Expected: FAIL — `cancel` is never called because the route doesn't call it yet.

- [ ] **Step 3: Update the delete-account route**

In `src/api/auth/customer/routes.ts`, locate the `app.post('.../delete-account', ...)` handler. After the actionToken validation and before the `prisma.user.update()` call, add:

```typescript
// Cancel Stripe subscription immediately — required to make the warning copy truthful.
// If Stripe is unreachable, log but continue; the subscription will lapse on its own.
const userSub = await app.prisma.subscription.findUnique({
  where: { userId: req.user.sub },
  select: { stripeSubscriptionId: true, status: true },
})
if (
  userSub?.stripeSubscriptionId &&
  !['CANCELLED', 'EXPIRED'].includes(userSub.status)
) {
  const { stripe } = await import('../../shared/stripe')
  try {
    await stripe.subscriptions.cancel(userSub.stripeSubscriptionId)
    await app.prisma.subscription.update({
      where: { userId: req.user.sub },
      data: { status: 'CANCELLED', cancelledAt: new Date() },
    })
  } catch {
    // Cancellation best-effort — user anonymisation proceeds regardless
  }
}
```

- [ ] **Step 4: Run the test — expect it to pass**

```bash
npx vitest run tests/api/auth/
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/auth/customer/routes.ts tests/api/auth/
git commit -m "fix(auth): cancel Stripe subscription immediately on account deletion"
```

---

## Task 2: MerchantRequest Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add MerchantRequest model to schema**

In `prisma/schema.prisma`, add the model near the User-related models. Also add the relation to the `User` model:

```prisma
// Add to User model relations:
merchantRequests MerchantRequest[]

// New model:
model MerchantRequest {
  id           String   @id @default(cuid())
  userId       String
  user         User     @relation(fields: [userId], references: [id])
  businessName String
  location     String
  note         String?
  createdAt    DateTime @default(now())
}
```

- [ ] **Step 2: Run migration**

```bash
cd .worktrees/customer-app
npx prisma migrate dev --name add-merchant-request
```

Expected: Migration created and applied. Prisma client regenerated.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add MerchantRequest model"
```

---

## Task 3: MerchantRequest service + routes + tests

**Files:**
- Create: `src/api/customer/merchant-requests/service.ts`
- Create: `src/api/customer/merchant-requests/routes.ts`
- Create: `tests/api/customer/merchant-requests.routes.test.ts`

- [ ] **Step 1: Write the failing route test**

Create `tests/api/customer/merchant-requests.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/merchant-requests/service', () => ({
  createMerchantRequest: vi.fn(),
}))

import { createMerchantRequest } from '../../../src/api/customer/merchant-requests/service'

describe('customer merchant-requests routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {} as any)
    app.decorate('redis', {} as any)

    const { generateToken } = await import('../../../src/api/shared/jwt')
    customerToken = generateToken({ sub: 'user-1', role: 'customer', sessionId: 'sess-1' }, 'access')
  })

  afterEach(async () => { await app.close() })

  it('POST /api/v1/customer/merchant-requests returns 201 on success', async () => {
    const mockRequest = {
      id: 'req-1',
      userId: 'user-1',
      businessName: 'The Craft Coffee Co.',
      location: 'Manchester',
      note: null,
      createdAt: new Date(),
    }
    ;(createMerchantRequest as any).mockResolvedValue(mockRequest)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { businessName: 'The Craft Coffee Co.', location: 'Manchester' },
    })

    expect(res.statusCode).toBe(201)
    expect(createMerchantRequest).toHaveBeenCalledWith(
      expect.anything(),
      'user-1',
      { businessName: 'The Craft Coffee Co.', location: 'Manchester', note: undefined }
    )
  })

  it('POST returns 400 when businessName is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { location: 'Manchester' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 400 when location is missing', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { businessName: 'Acme Burgers' },
    })
    expect(res.statusCode).toBe(400)
  })

  it('POST returns 401 without auth token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/customer/merchant-requests',
      payload: { businessName: 'Test', location: 'London' },
    })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run test — expect it to fail**

```bash
npx vitest run tests/api/customer/merchant-requests.routes.test.ts
```

Expected: FAIL — route does not exist yet.

- [ ] **Step 3: Create the service**

Create `src/api/customer/merchant-requests/service.ts`:

```typescript
import { PrismaClient } from '../../../generated/prisma/client'

export async function createMerchantRequest(
  prisma: PrismaClient,
  userId: string,
  data: { businessName: string; location: string; note?: string }
) {
  return prisma.merchantRequest.create({
    data: {
      userId,
      businessName: data.businessName.trim(),
      location: data.location.trim(),
      note: data.note?.trim() || null,
    },
  })
}
```

- [ ] **Step 4: Create the routes**

Create `src/api/customer/merchant-requests/routes.ts`:

```typescript
import { z } from 'zod'
import { FastifyInstance } from 'fastify'
import { createMerchantRequest } from './service'

const prefix = '/api/v1/customer/merchant-requests'

const createSchema = z.object({
  businessName: z.string().min(1).max(100),
  location:     z.string().min(1).max(100),
  note:         z.string().max(500).optional(),
})

export async function merchantRequestRoutes(app: FastifyInstance) {
  app.post(prefix, async (req: any, reply) => {
    const data = createSchema.parse(req.body)
    const request = await createMerchantRequest(app.prisma, req.user.sub, data)
    return reply.status(201).send({ success: true, id: request.id })
  })
}
```

- [ ] **Step 5: Register in customer plugin**

In `src/api/customer/plugin.ts`, add to the authenticated scope:

```typescript
import { merchantRequestRoutes } from './merchant-requests/routes'

// Inside the authed register block:
authed.register(merchantRequestRoutes)
```

- [ ] **Step 6: Run tests — expect them to pass**

```bash
npx vitest run tests/api/customer/merchant-requests.routes.test.ts
```

Expected: PASS (4 tests)

- [ ] **Step 7: Commit**

```bash
git add src/api/customer/merchant-requests/ src/api/customer/plugin.ts tests/api/customer/merchant-requests.routes.test.ts
git commit -m "feat(api): add merchant-requests endpoint POST /api/v1/customer/merchant-requests"
```

---

## Task 4: SupportTicket Prisma model + migration

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add SupportTicketStatus enum and SupportTicket model**

In `prisma/schema.prisma`, add the enum with the other enums and the model. Also add the relation to `User`:

```prisma
// Add to User model relations:
supportTickets SupportTicket[]

// New enum (add with other enums):
enum SupportTicketStatus {
  OPEN
  IN_PROGRESS
  RESOLVED
}

// New model:
model SupportTicket {
  id             String              @id @default(cuid())
  ticketNumber   String              @unique
  userId         String
  user           User                @relation(fields: [userId], references: [id])
  subject        String
  message        String
  topic          String
  status         SupportTicketStatus @default(OPEN)
  attachmentUrls String[]
  adminNote      String?
  createdAt      DateTime            @default(now())
  updatedAt      DateTime            @updatedAt
}
```

- [ ] **Step 2: Run migration**

```bash
cd .worktrees/customer-app
npx prisma migrate dev --name add-support-ticket
```

Expected: Migration created and applied. Prisma client regenerated.

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add SupportTicket model and SupportTicketStatus enum"
```

---

## Task 5: Support ticket service

**Files:**
- Create: `src/api/customer/support/service.ts`

- [ ] **Step 1: Write unit tests for the service**

These test the service functions directly (mock Prisma + Redis). Create `tests/api/customer/support.service.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createSupportTicket, listSupportTickets, getSupportTicket } from '../../../src/api/customer/support/service'
import { AppError } from '../../../src/api/shared/errors'

const mockPrisma = {
  supportTicket: {
    create: vi.fn(),
    findMany: vi.fn(),
    count: vi.fn(),
    findUnique: vi.fn(),
  },
  auditLog: { create: vi.fn() },
} as any

const mockRedis = { incr: vi.fn(), expire: vi.fn() } as any

beforeEach(() => { vi.clearAllMocks() })

describe('createSupportTicket', () => {
  it('generates ticket number and creates ticket', async () => {
    mockRedis.incr.mockResolvedValue(42)
    mockRedis.expire.mockResolvedValue(1)
    mockPrisma.supportTicket.create.mockResolvedValue({
      id: 'ticket-1',
      ticketNumber: 'RDM-20260422-0042',
    })

    const result = await createSupportTicket(mockPrisma, mockRedis, 'user-1', {
      topic: 'General enquiry',
      subject: 'Test subject',
      message: 'A test message that is long enough',
    })

    expect(mockRedis.incr).toHaveBeenCalledWith(expect.stringMatching(/^ticket:seq:\d{8}$/))
    expect(mockPrisma.supportTicket.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        topic: 'General enquiry',
        subject: 'Test subject',
        attachmentUrls: [],
      }),
    })
    expect(result.ticketNumber).toBe('RDM-20260422-0042')
  })

  it('throws VALIDATION_ERROR for invalid topic', async () => {
    await expect(
      createSupportTicket(mockPrisma, mockRedis, 'user-1', {
        topic: 'Not a real topic',
        subject: 'Test',
        message: 'Test message content here',
      })
    ).rejects.toThrow(AppError)
  })

  it('throws SERVICE_UNAVAILABLE if Redis INCR fails', async () => {
    mockRedis.incr.mockRejectedValue(new Error('Redis connection refused'))
    await expect(
      createSupportTicket(mockPrisma, mockRedis, 'user-1', {
        topic: 'General enquiry',
        subject: 'Test',
        message: 'Test message content here',
      })
    ).rejects.toThrow(AppError)
  })
})

describe('listSupportTickets', () => {
  it('returns paginated results sorted by updatedAt', async () => {
    mockPrisma.supportTicket.findMany.mockResolvedValue([{ id: 't1' }])
    mockPrisma.supportTicket.count.mockResolvedValue(1)

    const result = await listSupportTickets(mockPrisma, 'user-1', { page: 1, limit: 20 })

    expect(result).toEqual({ items: [{ id: 't1' }], total: 1, page: 1, limit: 20 })
    expect(mockPrisma.supportTicket.findMany).toHaveBeenCalledWith({
      where: { userId: 'user-1' },
      orderBy: { updatedAt: 'desc' },
      skip: 0,
      take: 20,
    })
  })
})

describe('getSupportTicket', () => {
  it('returns the ticket when it belongs to the user', async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', userId: 'user-1' })
    const result = await getSupportTicket(mockPrisma, 'user-1', 't1')
    expect(result).toEqual({ id: 't1', userId: 'user-1' })
  })

  it('throws NOT_FOUND when ticket belongs to different user', async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue({ id: 't1', userId: 'user-2' })
    await expect(getSupportTicket(mockPrisma, 'user-1', 't1')).rejects.toThrow(AppError)
  })

  it('throws NOT_FOUND when ticket does not exist', async () => {
    mockPrisma.supportTicket.findUnique.mockResolvedValue(null)
    await expect(getSupportTicket(mockPrisma, 'user-1', 't1')).rejects.toThrow(AppError)
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npx vitest run tests/api/customer/support.service.test.ts
```

Expected: FAIL — service file doesn't exist.

- [ ] **Step 3: Create the service**

Create `src/api/customer/support/service.ts`:

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { AppError } from '../shared/errors'

const VALID_TOPICS = [
  'Account issue',
  'Subscription',
  'Technical problem',
  'Voucher dispute',
  'General enquiry',
  'Other',
] as const

function ticketDateKey(): string {
  const now = new Date()
  const y = now.getUTCFullYear()
  const m = String(now.getUTCMonth() + 1).padStart(2, '0')
  const d = String(now.getUTCDate()).padStart(2, '0')
  return `${y}${m}${d}`
}

async function generateTicketNumber(redis: Redis): Promise<string> {
  const dateKey = ticketDateKey()
  const redisKey = `ticket:seq:${dateKey}`
  let seq: number
  try {
    seq = await redis.incr(redisKey)
    // Expire after 2 days — provides buffer past midnight while keeping Redis clean
    await redis.expire(redisKey, 86400 * 2)
  } catch {
    throw new AppError('SERVICE_UNAVAILABLE')
  }
  return `RDM-${dateKey}-${String(seq).padStart(4, '0')}`
}

export async function createSupportTicket(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { topic: string; subject: string; message: string }
) {
  if (!(VALID_TOPICS as readonly string[]).includes(data.topic)) {
    throw new AppError('VALIDATION_ERROR')
  }

  const ticketNumber = await generateTicketNumber(redis)

  return prisma.supportTicket.create({
    data: {
      ticketNumber,
      userId,
      topic: data.topic,
      subject: data.subject,
      message: data.message,
      attachmentUrls: [],
    },
  })
}

export async function listSupportTickets(
  prisma: PrismaClient,
  userId: string,
  query: { page: number; limit: number }
) {
  const { page, limit } = query
  const skip = (page - 1) * limit
  const [items, total] = await Promise.all([
    prisma.supportTicket.findMany({
      where: { userId },
      orderBy: { updatedAt: 'desc' },
      skip,
      take: limit,
    }),
    prisma.supportTicket.count({ where: { userId } }),
  ])
  return { items, total, page, limit }
}

export async function getSupportTicket(
  prisma: PrismaClient,
  userId: string,
  ticketId: string
) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } })
  if (!ticket || ticket.userId !== userId) throw new AppError('NOT_FOUND')
  return ticket
}
```

- [ ] **Step 4: Run tests — expect them to pass**

```bash
npx vitest run tests/api/customer/support.service.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/support/service.ts tests/api/customer/support.service.test.ts
git commit -m "feat(api): add support ticket service with Redis ticket-number generation"
```

---

## Task 6: Support ticket routes + tests

**Files:**
- Create: `src/api/customer/support/routes.ts`
- Create: `tests/api/customer/support.routes.test.ts`

- [ ] **Step 1: Write the failing route tests**

Create `tests/api/customer/support.routes.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/customer/support/service', () => ({
  createSupportTicket: vi.fn(),
  listSupportTickets:  vi.fn(),
  getSupportTicket:    vi.fn(),
}))

import {
  createSupportTicket,
  listSupportTickets,
  getSupportTicket,
} from '../../../src/api/customer/support/service'

describe('customer support ticket routes', () => {
  let app: FastifyInstance
  let customerToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', { auditLog: { create: vi.fn() } } as any)
    app.decorate('redis', {} as any)
    const { generateToken } = await import('../../../src/api/shared/jwt')
    customerToken = generateToken({ sub: 'user-1', role: 'customer', sessionId: 'sess-1' }, 'access')
  })

  afterEach(async () => { await app.close() })

  const mockTicket = {
    id: 'ticket-1',
    ticketNumber: 'RDM-20260422-0001',
    userId: 'user-1',
    subject: 'I need help',
    message: 'This is a detailed message about my problem.',
    topic: 'General enquiry',
    status: 'OPEN',
    attachmentUrls: [],
    adminNote: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }

  describe('GET /api/v1/customer/support/tickets', () => {
    it('returns 200 with paginated ticket list', async () => {
      ;(listSupportTickets as any).mockResolvedValue({ items: [mockTicket], total: 1, page: 1, limit: 20 })
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
      })
      expect(res.statusCode).toBe(200)
      const body = JSON.parse(res.body)
      expect(body.items).toHaveLength(1)
      expect(body.total).toBe(1)
    })

    it('returns 401 without auth', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/customer/support/tickets' })
      expect(res.statusCode).toBe(401)
    })
  })

  describe('POST /api/v1/customer/support/tickets', () => {
    it('returns 201 with created ticket', async () => {
      ;(createSupportTicket as any).mockResolvedValue(mockTicket)
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { topic: 'General enquiry', subject: 'I need help', message: 'This is a detailed message about my problem.' },
      })
      expect(res.statusCode).toBe(201)
      expect(JSON.parse(res.body).ticketNumber).toBe('RDM-20260422-0001')
    })

    it('returns 400 when message is too short', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { topic: 'General enquiry', subject: 'Help', message: 'Short' },
      })
      expect(res.statusCode).toBe(400)
    })

    it('returns 400 when topic is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/customer/support/tickets',
        headers: { authorization: `Bearer ${customerToken}` },
        payload: { subject: 'Help', message: 'A detailed message here for the support team.' },
      })
      expect(res.statusCode).toBe(400)
    })
  })

  describe('GET /api/v1/customer/support/tickets/:id', () => {
    it('returns 200 with ticket detail', async () => {
      ;(getSupportTicket as any).mockResolvedValue(mockTicket)
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/support/tickets/ticket-1',
        headers: { authorization: `Bearer ${customerToken}` },
      })
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).id).toBe('ticket-1')
    })

    it('returns 404 when getSupportTicket throws NOT_FOUND', async () => {
      const { AppError } = await import('../../../src/api/shared/errors')
      ;(getSupportTicket as any).mockRejectedValue(new AppError('NOT_FOUND'))
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/customer/support/tickets/ticket-99',
        headers: { authorization: `Bearer ${customerToken}` },
      })
      expect(res.statusCode).toBe(404)
    })
  })
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
npx vitest run tests/api/customer/support.routes.test.ts
```

Expected: FAIL — routes don't exist.

- [ ] **Step 3: Create the routes**

Create `src/api/customer/support/routes.ts`:

```typescript
import { z } from 'zod'
import { FastifyInstance } from 'fastify'
import { createSupportTicket, listSupportTickets, getSupportTicket } from './service'
import { writeAuditLog } from '../shared/audit'

const prefix = '/api/v1/customer/support/tickets'

const pageSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

const createSchema = z.object({
  topic:   z.string().min(1),
  subject: z.string().min(1).max(100),
  message: z.string().min(20).max(2000),
})

export async function supportRoutes(app: FastifyInstance) {
  app.get(prefix, async (req: any, reply) => {
    const query = pageSchema.parse(req.query)
    const result = await listSupportTickets(app.prisma, req.user.sub, query)
    return reply.send(result)
  })

  app.post(prefix, async (req: any, reply) => {
    const data = createSchema.parse(req.body)
    const ticket = await createSupportTicket(app.prisma, app.redis, req.user.sub, data)
    writeAuditLog(app.prisma, {
      entityId: req.user.sub,
      entityType: 'customer',
      event: 'SUPPORT_TICKET_CREATED',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
      sessionId: req.user.sessionId,
      metadata: { ticketNumber: ticket.ticketNumber },
    })
    return reply.status(201).send(ticket)
  })

  app.get(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const ticket = await getSupportTicket(app.prisma, req.user.sub, id)
    return reply.send(ticket)
  })
}
```

- [ ] **Step 4: Register in customer plugin**

In `src/api/customer/plugin.ts`, add:

```typescript
import { supportRoutes } from './support/routes'

// Inside the authed register block:
authed.register(supportRoutes)
```

- [ ] **Step 5: Run tests — expect them to pass**

```bash
npx vitest run tests/api/customer/support.routes.test.ts
```

Expected: PASS (7 tests)

- [ ] **Step 6: Run the full backend test suite**

```bash
npx vitest run
```

Expected: All tests pass. Note the total count.

- [ ] **Step 7: Commit**

```bash
git add src/api/customer/support/ src/api/customer/plugin.ts tests/api/customer/support.routes.test.ts tests/api/customer/support.service.test.ts
git commit -m "feat(api): add support ticket system (GET/POST /support/tickets, GET /support/tickets/:id)"
```

---

## Task 7: Install missing frontend packages

**Files:**
- None created — package installation and dependency verification only

All commands run from `apps/customer-app/`.

- [ ] **Step 1: Install missing packages**

```bash
cd .worktrees/customer-app/apps/customer-app
npx expo install expo-store-review expo-web-browser @react-native-community/datetimepicker
```

Expected: packages added to `package.json` and installed.

- [ ] **Step 2: Verify TypeScript can import them**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Create support topics constant**

Create `src/lib/constants/supportTopics.ts`:

```typescript
export const SUPPORT_TOPICS = [
  'Account issue',
  'Subscription',
  'Technical problem',
  'Voucher dispute',
  'General enquiry',
  'Other',
] as const

export type SupportTopic = (typeof SUPPORT_TOPICS)[number]
```

- [ ] **Step 4: Create external links config**

Create `src/lib/config/links.ts`:

```typescript
export const LINKS = {
  merchantPortal:  'https://merchant.redeemo.com',
  about:           'https://redeemo.com/about',
  faq:             'https://redeemo.com/faq',
  terms:           'https://redeemo.com/terms',
  privacy:         'https://redeemo.com/privacy',
  appStoreIos:     'https://apps.apple.com/app/redeemo/id0000000000',
  appStoreAndroid: 'https://play.google.com/store/apps/details?id=com.redeemo',
} as const
```

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/package.json apps/customer-app/src/lib/constants/supportTopics.ts apps/customer-app/src/lib/config/links.ts
git commit -m "feat(profile): install packages and add supportTopics/links constants"
```

---

## Task 8: Bootstrap haptics + reduce motion preferences from AsyncStorage

**Files:**
- Modify: `apps/customer-app/src/stores/auth.ts`

Currently `bootstrap()` doesn't restore `hapticsEnabled` or `motionScale` from AsyncStorage after app restart. `setHaptics()` and `setMotionScale()` don't persist to AsyncStorage. Also, `signOut()` awaits the API call which blocks the UX. This task fixes all three and stores device name at login time.

- [ ] **Step 1: Write failing test**

In the existing auth store tests (find the test file), add:

```typescript
it('bootstrap restores hapticsEnabled from AsyncStorage', async () => {
  // Simulate saved haptics pref = false
  ;(AsyncStorage.getItem as any).mockImplementation((key: string) => {
    if (key === 'redeemo:haptics') return Promise.resolve(JSON.stringify(false))
    return Promise.resolve(null)
  })
  await useAuthStore.getState().bootstrap()
  expect(useAuthStore.getState().hapticsEnabled).toBe(false)
})

it('setHaptics persists to AsyncStorage', async () => {
  useAuthStore.getState().setHaptics(false)
  expect(AsyncStorage.setItem).toHaveBeenCalledWith('redeemo:haptics', 'false')
})
```

- [ ] **Step 2: Run tests — expect them to fail**

```bash
cd .worktrees/customer-app/apps/customer-app
# Run in a real terminal (not Claude Code Bash tool — jest-expo deadlock)
npm test -- --testPathPattern=auth
```

Expected: FAIL

- [ ] **Step 3: Update auth store**

In `src/stores/auth.ts`, make these changes:

**In `bootstrap()`** — add haptics/motion restoration before the auth check:

```typescript
async bootstrap() {
  const [access, refresh, hapticsRaw, reduceMotionRaw] = await Promise.all([
    secureStorage.get('accessToken'),
    secureStorage.get('refreshToken'),
    prefsStorage.get<boolean>('redeemo:haptics'),
    prefsStorage.get<boolean>('redeemo:reduceMotion'),
  ])

  // Restore persisted preferences; defaults: haptics=true, reduceMotion=false
  const hapticsEnabled = hapticsRaw ?? true
  setHapticsEnabled(hapticsEnabled)
  const motionScale: 0 | 1 = reduceMotionRaw === true ? 0 : 1
  set({ hapticsEnabled, motionScale })

  if (!access || !refresh) {
    set({ status: 'unauthenticated' })
    return
  }
  // ... rest of existing bootstrap unchanged
```

**In `setHaptics()`** — add AsyncStorage persistence:

```typescript
setHaptics(enabled) {
  setHapticsEnabled(enabled)
  set({ hapticsEnabled: enabled })
  void prefsStorage.set('redeemo:haptics', enabled)
},
```

**In `setMotionScale()`** — add AsyncStorage persistence:

```typescript
setMotionScale(scale) {
  set({ motionScale: scale })
  void prefsStorage.set('redeemo:reduceMotion', scale === 0)
},
```

**In `signOut()`** — make logout API fire-and-forget (local state clears unconditionally):

```typescript
async signOut() {
  const refresh = get().refreshToken
  // Fire-and-forget — do not await; local state clears regardless of network outcome
  if (refresh) authApi.logout({ refreshToken: refresh }).catch(() => {})
  await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
  apiSetTokens({ accessToken: null, refreshToken: null })
  set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING })
},
```

**Add `clearLocalAuth()` method** (used by delete account flow):

```typescript
async clearLocalAuth() {
  await Promise.all([secureStorage.remove('accessToken'), secureStorage.remove('refreshToken')])
  apiSetTokens({ accessToken: null, refreshToken: null })
  set({ status: 'unauthenticated', user: null, accessToken: null, refreshToken: null, onboarding: INITIAL_ONBOARDING })
},
```

**In `setTokens()`** — store device name:

```typescript
async setTokens({ accessToken, refreshToken, user }) {
  await secureStorage.set('accessToken', accessToken)
  await secureStorage.set('refreshToken', refreshToken)
  apiSetTokens({ accessToken, refreshToken })
  const onboarding = await loadOnboarding(user.id)
  // Store device name for "Active session" display in Profile
  try {
    const Device = await import('expo-device')
    if (Device.deviceName) {
      await prefsStorage.set('redeemo:deviceName', Device.deviceName)
    }
  } catch { /* ignore — Profile falls back to "Signed in on this device" */ }
  set({ status: 'authed', user, accessToken, refreshToken, onboarding })
},
```

Also add `clearLocalAuth` to the `State` type:

```typescript
clearLocalAuth: () => Promise<void>
```

- [ ] **Step 4: Run tests in a real terminal**

```bash
npm test -- --testPathPattern=auth
```

Expected: PASS

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/stores/auth.ts
git commit -m "feat(auth): persist haptics/motion prefs to AsyncStorage, fire-and-forget signOut, store device name"
```

---

## Task 9: Frontend API clients

**Files:**
- Modify: `apps/customer-app/src/lib/api/auth.ts`
- Modify: `apps/customer-app/src/lib/api/subscription.ts`
- Create: `apps/customer-app/src/lib/api/merchant-requests.ts`
- Create: `apps/customer-app/src/lib/api/support.ts`

- [ ] **Step 1: Add delete-account methods to authApi**

In `src/lib/api/auth.ts`, add to the `authApi` object:

```typescript
sendDeleteAccountOtp: () =>
  api.post<{ success: boolean }>('/api/v1/customer/auth/otp/send', { action: 'ACCOUNT_DELETION' }),

verifyDeleteAccountOtp: (code: string) =>
  api.post<{ verified: boolean; actionToken: string; action: string }>(
    '/api/v1/customer/auth/otp/verify',
    { code, action: 'ACCOUNT_DELETION' }
  ),

deleteAccount: (actionToken: string) =>
  api.post<{ message: string }>('/api/v1/customer/auth/delete-account', { actionToken }),
```

- [ ] **Step 2: Add cancel to subscriptionApi**

In `src/lib/api/subscription.ts`, add to the `subscriptionApi` object:

```typescript
cancel: () =>
  api.delete<{ success: boolean }>('/api/v1/subscription'),
```

- [ ] **Step 3: Create merchantRequestsApi**

Create `src/lib/api/merchant-requests.ts`:

```typescript
import { z } from 'zod'
import { api } from '../api'

const responseSchema = z.object({ success: z.boolean() })

export const merchantRequestsApi = {
  create: (data: { businessName: string; location: string; note?: string }) =>
    api.post<unknown>('/api/v1/customer/merchant-requests', data).then(responseSchema.parse),
}
```

- [ ] **Step 4: Create supportApi**

Create `src/lib/api/support.ts`:

```typescript
import { z } from 'zod'
import { api } from '../api'

export const ticketStatusSchema = z.enum(['OPEN', 'IN_PROGRESS', 'RESOLVED'])

export const ticketSchema = z.object({
  id:             z.string(),
  ticketNumber:   z.string(),
  userId:         z.string(),
  subject:        z.string(),
  message:        z.string(),
  topic:          z.string(),
  status:         ticketStatusSchema,
  attachmentUrls: z.array(z.string()),
  adminNote:      z.string().nullable(),
  createdAt:      z.string(),
  updatedAt:      z.string(),
})

const listSchema = z.object({
  items: z.array(ticketSchema),
  total: z.number(),
  page:  z.number(),
  limit: z.number(),
})

export type SupportTicket = z.infer<typeof ticketSchema>
export type TicketStatus  = z.infer<typeof ticketStatusSchema>

export const supportApi = {
  list: (params: { page?: number; limit?: number } = {}) =>
    api.get<unknown>(`/api/v1/customer/support/tickets?page=${params.page ?? 1}&limit=${params.limit ?? 20}`)
       .then(listSchema.parse),

  create: (data: { topic: string; subject: string; message: string }) =>
    api.post<unknown>('/api/v1/customer/support/tickets', data).then(ticketSchema.parse),

  get: (id: string) =>
    api.get<unknown>(`/api/v1/customer/support/tickets/${id}`).then(ticketSchema.parse),
}
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 6: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/lib/api/
git commit -m "feat(profile): add API clients for auth (delete account), subscription (cancel), merchant-requests, support"
```

---

## Task 10: Profile hooks

**Files:**
- Create: `apps/customer-app/src/features/profile/hooks/useReduceMotion.ts`
- Create: `apps/customer-app/src/features/profile/hooks/useCancelSubscription.ts`
- Create: `apps/customer-app/src/features/profile/hooks/useMerchantRequest.ts`
- Create: `apps/customer-app/src/features/profile/hooks/useSupportTickets.ts`
- Create: `apps/customer-app/src/features/profile/hooks/useCreateTicket.ts`
- Create: `apps/customer-app/src/features/profile/hooks/useDeleteAccount.ts`

- [ ] **Step 1: Create useReduceMotion hook**

Create `src/features/profile/hooks/useReduceMotion.ts`:

```typescript
import { useEffect, useState } from 'react'
import { AccessibilityInfo } from 'react-native'
import { useAuthStore } from '@/stores/auth'

/**
 * Returns true when reduce motion should be applied.
 * True when the user's in-app toggle is on, or the OS accessibility setting is on.
 * The OS setting takes priority and cannot be overridden.
 */
export function useReduceMotion(): boolean {
  const motionScale = useAuthStore(s => s.motionScale)
  const [osReduceMotion, setOsReduceMotion] = useState(false)

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setOsReduceMotion)
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setOsReduceMotion)
    return () => sub.remove()
  }, [])

  return motionScale === 0 || osReduceMotion
}
```

- [ ] **Step 2: Create useCancelSubscription hook**

Create `src/features/profile/hooks/useCancelSubscription.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { subscriptionApi } from '@/lib/api/subscription'

export function useCancelSubscription() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: () => subscriptionApi.cancel(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['subscription'] })
    },
  })
}
```

- [ ] **Step 3: Create useMerchantRequest hook**

Create `src/features/profile/hooks/useMerchantRequest.ts`:

```typescript
import { useMutation } from '@tanstack/react-query'
import { merchantRequestsApi } from '@/lib/api/merchant-requests'

export function useMerchantRequest() {
  return useMutation({
    mutationFn: merchantRequestsApi.create,
  })
}
```

- [ ] **Step 4: Create useSupportTickets and useCreateTicket hooks**

Create `src/features/profile/hooks/useSupportTickets.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { supportApi, type SupportTicket } from '@/lib/api/support'

export function useSupportTickets() {
  return useQuery({
    queryKey: ['support-tickets'],
    queryFn: () => supportApi.list(),
  })
}

export function useSupportTicketDetail(id: string | null) {
  return useQuery({
    queryKey: ['support-ticket', id],
    queryFn: () => supportApi.get(id!),
    enabled: !!id,
  })
}
```

Create `src/features/profile/hooks/useCreateTicket.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { supportApi } from '@/lib/api/support'

export function useCreateTicket() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: supportApi.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['support-tickets'] })
    },
  })
}
```

- [ ] **Step 5: Create useDeleteAccount hook**

Create `src/features/profile/hooks/useDeleteAccount.ts`:

```typescript
import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { authApi } from '@/lib/api/auth'
import { useAuthStore } from '@/stores/auth'

export type DeleteStage = 'warning' | 'otp' | 'done'

export function useDeleteAccount() {
  const [stage, setStage]           = useState<DeleteStage>('warning')
  const [actionToken, setActionToken] = useState<string | null>(null)
  const [error, setError]           = useState<string | null>(null)
  const [loading, setLoading]       = useState(false)
  const queryClient = useQueryClient()
  const clearLocalAuth = useAuthStore(s => s.clearLocalAuth)

  const sendOtp = async () => {
    setLoading(true)
    setError(null)
    try {
      await authApi.sendDeleteAccountOtp()
      setStage('otp')
    } catch (e: any) {
      setError(
        e?.message === 'PHONE_NOT_VERIFIED'
          ? 'You need a verified phone number to delete your account. Please add one via Get Help.'
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (code: string) => {
    setLoading(true)
    setError(null)
    try {
      const res = await authApi.verifyDeleteAccountOtp(code)
      setActionToken(res.actionToken)
      // Note: this doesn't advance stage — caller transitions to confirm step explicitly
    } catch (e: any) {
      const errCode = e?.message
      setError(
        errCode === 'OTP_INVALID'       ? 'That code is incorrect. Please try again.' :
        errCode === 'OTP_MAX_ATTEMPTS'  ? 'Too many attempts. Please start over.' :
        'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const confirmDelete = async () => {
    if (!actionToken) return
    setLoading(true)
    setError(null)
    try {
      await authApi.deleteAccount(actionToken)
      // Clear all local state immediately — account no longer exists
      await clearLocalAuth()
      queryClient.clear()
      setStage('done')
      // Navigate after brief delay so the done screen is visible
      setTimeout(() => router.replace('/(auth)/login'), 2500)
    } catch (e: any) {
      setError(
        e?.message === 'ACTION_TOKEN_INVALID'
          ? 'Your session expired. Please start over.'
          : 'Something went wrong. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return { stage, setStage, actionToken, error, loading, sendOtp, verifyOtp, confirmDelete }
}
```

- [ ] **Step 6: Verify TypeScript compiles**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/hooks/
git commit -m "feat(profile): add profile hooks (useReduceMotion, useCancelSubscription, useMerchantRequest, useSupportTickets, useDeleteAccount)"
```

---

## Task 11: Shared UI primitives — ProfileSectionCard and ProfileRow

**Files:**
- Create: `apps/customer-app/src/features/profile/components/ProfileSectionCard.tsx`
- Create: `apps/customer-app/src/features/profile/components/ProfileRow.tsx`

These are used by every section in the profile screen.

- [ ] **Step 1: Create ProfileSectionCard**

Create `src/features/profile/components/ProfileSectionCard.tsx`:

```typescript
import React from 'react'
import { View, Text, StyleSheet } from 'react-native'

interface Props {
  title: string
  children: React.ReactNode
  style?: object
}

export function ProfileSectionCard({ title, children, style }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper:      { marginBottom: 16 },
  sectionTitle: {
    fontSize: 11, fontWeight: '600', color: 'rgba(1,12,53,0.5)',
    letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6, paddingHorizontal: 4,
  },
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
})
```

- [ ] **Step 2: Create ProfileRow**

Create `src/features/profile/components/ProfileRow.tsx`:

```typescript
import React from 'react'
import { Pressable, View, Text, StyleSheet } from 'react-native'
import { ChevronRight } from 'lucide-react-native'
import { haptics } from '@/design-system/haptics'

interface Props {
  label:        string
  preview?:     string
  onPress?:     () => void
  leftIcon?:    React.ReactNode
  rightContent?: React.ReactNode
  destructive?: boolean
  disabled?:    boolean
  isFirst?:     boolean
}

export function ProfileRow({
  label, preview, onPress, leftIcon, rightContent, destructive, disabled, isFirst,
}: Props) {
  const rowContent = (
    <View style={[styles.row, !isFirst && styles.divider, disabled && styles.dimmed]}>
      {leftIcon && <View style={styles.leftIcon}>{leftIcon}</View>}
      <Text
        style={[styles.label, destructive && styles.destructive]}
        numberOfLines={1}
      >
        {label}
      </Text>
      <View style={styles.right}>
        {rightContent ?? (
          <>
            {preview && (
              <Text style={styles.preview} numberOfLines={1}>{preview}</Text>
            )}
            {onPress && !disabled && (
              <ChevronRight size={16} color="#9CA3AF" />
            )}
          </>
        )}
      </View>
    </View>
  )

  if (!onPress || disabled) return rowContent

  return (
    <Pressable
      onPress={() => { void haptics.touch.light(); onPress() }}
      style={({ pressed }) => pressed ? styles.pressed : undefined}
      accessibilityRole="button"
    >
      {rowContent}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, minHeight: 52, paddingVertical: 8,
  },
  divider:   { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: '#F3F4F6' },
  dimmed:    { opacity: 0.45 },
  pressed:   { opacity: 0.7 },
  leftIcon:  { marginRight: 10 },
  label:     { flex: 1, fontSize: 15, fontWeight: '500', color: '#010C35' },
  destructive: { color: '#DC2626' },
  right:     { flexDirection: 'row', alignItems: 'center', gap: 4 },
  preview:   { fontSize: 12, color: 'rgba(1,12,53,0.5)', maxWidth: 160 },
})
```

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/ProfileSectionCard.tsx apps/customer-app/src/features/profile/components/ProfileRow.tsx
git commit -m "feat(profile): add ProfileSectionCard and ProfileRow shared components"
```

---

## Task 12: ProfileHeader component

**Files:**
- Create: `apps/customer-app/src/features/profile/components/ProfileHeader.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/__tests__/ProfileHeader.test.tsx`:

```typescript
import React from 'react'
import { render, screen } from '@testing-library/react-native'
import { ProfileHeader } from '../components/ProfileHeader'

const baseProfile = {
  id: 'u1', firstName: 'Shebin', lastName: 'C', email: 'shebin@test.com',
  profileCompleteness: 72, profileImageUrl: null,
  dateOfBirth: null, gender: null, addressLine1: null, city: null,
  postcode: null, phone: null, interests: [], newsletterConsent: false,
  emailVerified: true, phoneVerified: true,
}
const noSub = undefined

describe('ProfileHeader', () => {
  it('shows initials when no profileImageUrl', () => {
    render(<ProfileHeader profile={baseProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.getByText('S')).toBeTruthy()
  })

  it('shows completeness percentage', () => {
    render(<ProfileHeader profile={baseProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.getByText(/72%/)).toBeTruthy()
  })

  it('shows ACTIVE badge when subscription is ACTIVE', () => {
    const sub = { status: 'ACTIVE', planName: 'Monthly', price: 6.99, renewsAt: '2026-05-12' }
    render(<ProfileHeader profile={baseProfile} subscription={sub as any} onAvatarPress={jest.fn()} />)
    expect(screen.getByText('ACTIVE')).toBeTruthy()
  })

  it('hides badge when no subscription', () => {
    render(<ProfileHeader profile={baseProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.queryByText('ACTIVE')).toBeNull()
    expect(screen.queryByText('CANCELLED')).toBeNull()
  })

  it('hides tip text when completeness is 100%', () => {
    const fullProfile = { ...baseProfile, profileCompleteness: 100 }
    render(<ProfileHeader profile={fullProfile} subscription={noSub} onAvatarPress={jest.fn()} />)
    expect(screen.queryByText(/unlock/i)).toBeNull()
    expect(screen.queryByText(/improve/i)).toBeNull()
    expect(screen.queryByText(/almost there/i)).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=ProfileHeader
```

Expected: FAIL — component doesn't exist.

- [ ] **Step 3: Create the component**

Create `src/features/profile/components/ProfileHeader.tsx`:

```typescript
import React, { useRef } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Image } from 'expo-image'
import { Camera } from 'lucide-react-native'
import type { CustomerProfile } from '@/lib/api/profile'
import type { MySubscription } from '@/lib/api/subscription'

interface Props {
  profile: CustomerProfile
  subscription: MySubscription | undefined
  onAvatarPress: () => void
  uploading?: boolean
}

function completenessToTip(pct: number): string | null {
  if (pct >= 100) return null
  if (pct >= 80) return 'Almost there — add your profile photo to complete your profile'
  if (pct >= 40) return 'Add your address and interests to improve your recommendations'
  return 'Add your date of birth, address, and interests to unlock more personalised deals'
}

function badgeText(status: string | undefined): { text: string; variant: 'active' | 'cancelled' | 'amber' } | null {
  if (!status) return null
  if (status === 'ACTIVE' || status === 'TRIALLING') return { text: 'ACTIVE', variant: 'active' }
  if (status === 'CANCELLED') return { text: 'CANCELLED', variant: 'cancelled' }
  if (status === 'PAST_DUE') return { text: 'PAST DUE', variant: 'amber' }
  if (status === 'EXPIRED') return { text: 'EXPIRED', variant: 'cancelled' }
  return null
}

function Initials({ name }: { name: string }) {
  const letter = name.trim()[0]?.toUpperCase() ?? '?'
  return (
    <LinearGradient colors={['#E20C04', '#E84A00']} style={styles.avatarGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
      <Text style={styles.initialsText}>{letter}</Text>
    </LinearGradient>
  )
}

export function ProfileHeader({ profile, subscription, onAvatarPress, uploading }: Props) {
  const tip = completenessToTip(profile.profileCompleteness)
  const badge = badgeText(subscription?.status)
  const progressWidth = useSharedValue(0)
  const progressStyle = useAnimatedStyle(() => ({ width: `${progressWidth.value}%` }))

  React.useEffect(() => {
    progressWidth.value = withTiming(profile.profileCompleteness, { duration: 600 })
  }, [profile.profileCompleteness])

  const badgeColors: Record<string, string[]> = {
    active:    ['#E20C04', '#E84A00'],
    cancelled: ['#6B7280', '#9CA3AF'],
    amber:     ['#D97706', '#F59E0B'],
  }

  return (
    <View style={styles.card}>
      {/* Avatar */}
      <Pressable onPress={onAvatarPress} style={({ pressed }) => [styles.avatarWrapper, pressed && { opacity: 0.8 }]}>
        {profile.profileImageUrl ? (
          <Image source={{ uri: profile.profileImageUrl }} style={styles.avatarImage} contentFit="cover" />
        ) : (
          <Initials name={profile.firstName} />
        )}
        <View style={styles.cameraOverlay}>
          {uploading
            ? <ActivityIndicator size={10} color="#010C35" />
            : <Camera size={10} color="#010C35" strokeWidth={2.5} />
          }
        </View>
      </Pressable>

      {/* Identity + completeness */}
      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={1}>{profile.firstName} {profile.lastName ?? ''}</Text>
        <Text style={styles.email} numberOfLines={1}>{profile.email}</Text>

        {/* Completeness bar */}
        <View style={styles.barRow}>
          <Text style={styles.barLabel}>PROFILE STRENGTH · {profile.profileCompleteness}%</Text>
        </View>
        <View style={styles.barTrack}>
          <Animated.View style={[styles.barFill, progressStyle]} />
        </View>

        {tip && <Text style={styles.tip} numberOfLines={2}>{tip}</Text>}
      </View>

      {/* Subscription badge */}
      {badge && (
        <LinearGradient
          colors={badgeColors[badge.variant] as [string, string]}
          style={styles.badge}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        >
          <Text style={styles.badgeText}>{badge.text}</Text>
        </LinearGradient>
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF', borderRadius: 14, padding: 16,
    flexDirection: 'row', alignItems: 'flex-start', gap: 12,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04, shadowRadius: 4, elevation: 1, marginBottom: 16,
  },
  avatarWrapper: { position: 'relative', flexShrink: 0 },
  avatarImage:   { width: 52, height: 52, borderRadius: 14 },
  avatarGradient: { width: 52, height: 52, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  initialsText:  { color: '#FFFFFF', fontSize: 20, fontWeight: '700' },
  cameraOverlay: {
    position: 'absolute', bottom: -4, right: -4,
    width: 20, height: 20, borderRadius: 10, backgroundColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2,
  },
  info:      { flex: 1, minWidth: 0 },
  name:      { fontSize: 15, fontWeight: '600', color: '#010C35', marginBottom: 2 },
  email:     { fontSize: 12, color: 'rgba(1,12,53,0.5)', marginBottom: 8 },
  barRow:    { marginBottom: 3 },
  barLabel:  { fontSize: 10, fontWeight: '600', color: 'rgba(1,12,53,0.4)', letterSpacing: 0.3 },
  barTrack:  { height: 5, backgroundColor: '#F3F4F6', borderRadius: 3, overflow: 'hidden', marginBottom: 4 },
  barFill:   { height: '100%', borderRadius: 3, backgroundColor: '#E20C04' },
  tip:       { fontSize: 11, color: 'rgba(1,12,53,0.4)', lineHeight: 16 },
  badge: {
    borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5,
    alignItems: 'center', justifyContent: 'center', flexShrink: 0,
  },
  badgeText: { color: '#FFFFFF', fontSize: 8, fontWeight: '700', letterSpacing: 0.5 },
})
```

- [ ] **Step 4: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=ProfileHeader
```

Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/ProfileHeader.tsx apps/customer-app/src/features/profile/__tests__/ProfileHeader.test.tsx
git commit -m "feat(profile): add ProfileHeader component with completeness bar, initials, subscription badge"
```

---

## Task 13: PersonalInfoSheet

**Files:**
- Create: `apps/customer-app/src/features/profile/components/PersonalInfoSheet.tsx`
- Test: `src/features/profile/__tests__/PersonalInfoSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/__tests__/PersonalInfoSheet.test.tsx`:

```typescript
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { PersonalInfoSheet } from '../components/PersonalInfoSheet'

const mockProfile = {
  firstName: 'Shebin', lastName: 'C', dateOfBirth: null, gender: null,
  email: 'shebin@test.com', phone: '+44 7700 900123',
}

jest.mock('@/features/profile/components/PersonalInfoSheet', () => ({
  PersonalInfoSheet: jest.requireActual('@/features/profile/components/PersonalInfoSheet').PersonalInfoSheet,
}))

describe('PersonalInfoSheet', () => {
  it('renders first name input pre-filled', () => {
    render(
      <PersonalInfoSheet
        visible={true} onDismiss={jest.fn()} profile={mockProfile as any}
        onGetHelp={jest.fn()}
      />
    )
    expect(screen.getByDisplayValue('Shebin')).toBeTruthy()
  })

  it('shows email as read-only', () => {
    render(
      <PersonalInfoSheet
        visible={true} onDismiss={jest.fn()} profile={mockProfile as any}
        onGetHelp={jest.fn()}
      />
    )
    expect(screen.getByText('shebin@test.com')).toBeTruthy()
  })

  it('calls onGetHelp when the help link is pressed', () => {
    const onGetHelp = jest.fn()
    render(
      <PersonalInfoSheet
        visible={true} onDismiss={jest.fn()} profile={mockProfile as any}
        onGetHelp={onGetHelp}
      />
    )
    fireEvent.press(screen.getByText(/get help with this/i))
    expect(onGetHelp).toHaveBeenCalledWith('Account issue', expect.any(String))
  })
})
```

- [ ] **Step 2: Run test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=PersonalInfoSheet
```

Expected: FAIL

- [ ] **Step 3: Create the component**

Create `src/features/profile/components/PersonalInfoSheet.tsx`:

```typescript
import React, { useState } from 'react'
import {
  View, Text, TextInput, Pressable, StyleSheet, ScrollView, Platform, ActivityIndicator
} from 'react-native'
import DateTimePicker from '@react-native-community/datetimepicker'
import { Lock } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useUpdateProfile } from '@/features/profile-completion/hooks/useUpdateProfile'
import type { CustomerProfile } from '@/lib/api/profile'

const GENDER_OPTIONS = ['Male', 'Female', 'Non-binary', 'Prefer not to say', 'Other'] as const

interface Props {
  visible:    boolean
  onDismiss:  () => void
  profile:    CustomerProfile
  onGetHelp:  (topic: string, message: string) => void
}

export function PersonalInfoSheet({ visible, onDismiss, profile, onGetHelp }: Props) {
  const [firstName, setFirstName] = useState(profile.firstName ?? '')
  const [dob, setDob]             = useState<Date | null>(
    profile.dateOfBirth ? new Date(profile.dateOfBirth) : null
  )
  const [gender, setGender]       = useState(profile.gender ?? '')
  const [showDatePicker, setShowDatePicker] = useState(false)
  const [error, setError]         = useState<string | null>(null)
  const { mutate, isPending }     = useUpdateProfile()

  const handleSave = () => {
    if (!firstName.trim()) { setError('First name is required'); return }
    setError(null)
    mutate(
      { firstName: firstName.trim(), dateOfBirth: dob?.toISOString() ?? undefined, gender: gender || undefined },
      { onSuccess: onDismiss, onError: () => setError('Failed to save. Please try again.') }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Personal information">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Personal info</Text>

        {/* First name */}
        <Text style={styles.fieldLabel}>First name</Text>
        <TextInput
          style={styles.input}
          value={firstName}
          onChangeText={setFirstName}
          autoCapitalize="words"
          returnKeyType="next"
        />

        {/* Last name — read-only */}
        <Text style={styles.fieldLabel}>Last name</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{profile.lastName ?? '—'}</Text>
          <Lock size={14} color="#9CA3AF" />
        </View>

        {/* Date of birth */}
        <Text style={styles.fieldLabel}>Date of birth</Text>
        <Pressable style={styles.input} onPress={() => setShowDatePicker(true)}>
          <Text style={dob ? styles.inputText : styles.placeholder}>
            {dob ? dob.toLocaleDateString('en-GB') : 'Select date'}
          </Text>
        </Pressable>
        {showDatePicker && (
          <DateTimePicker
            value={dob ?? new Date(2000, 0, 1)}
            mode="date"
            display={Platform.OS === 'ios' ? 'spinner' : 'default'}
            maximumDate={new Date()}
            onChange={(_, date) => { setShowDatePicker(false); if (date) setDob(date) }}
          />
        )}

        {/* Gender */}
        <Text style={styles.fieldLabel}>Gender</Text>
        <View style={styles.genderRow}>
          {GENDER_OPTIONS.map(opt => (
            <Pressable
              key={opt}
              style={[styles.genderChip, gender === opt && styles.genderChipSelected]}
              onPress={() => setGender(opt === gender ? '' : opt)}
            >
              <Text style={[styles.genderChipText, gender === opt && styles.genderChipTextSelected]}>
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Divider */}
        <View style={styles.divider} />

        {/* Email — read-only */}
        <Text style={styles.fieldLabel}>Email address</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText} numberOfLines={1}>{profile.email}</Text>
          <Lock size={14} color="#9CA3AF" />
        </View>

        {/* Phone — read-only */}
        <Text style={styles.fieldLabel}>Phone number</Text>
        <View style={[styles.input, styles.readOnly]}>
          <Text style={styles.readOnlyText}>{profile.phone ?? 'Not added'}</Text>
          <Lock size={14} color="#9CA3AF" />
        </View>

        <Text style={styles.lockNote}>
          For security, email and phone can only be changed by our team. Tap below to request a change.
        </Text>
        <Pressable onPress={() => onGetHelp('Account issue', "I'd like to change my contact details.")}>
          <Text style={styles.helpLink}>Get help with this →</Text>
        </Pressable>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save changes</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20, maxHeight: '90%' },
  title:            { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 20 },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  input:            { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  inputText:        { fontSize: 15, color: '#010C35' },
  placeholder:      { fontSize: 15, color: '#9CA3AF' },
  readOnly:         { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#F9FAFB' },
  readOnlyText:     { fontSize: 15, color: '#6B7280', flex: 1 },
  genderRow:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  genderChip:       { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  genderChipSelected: { backgroundColor: '#010C35', borderColor: '#010C35' },
  genderChipText:   { fontSize: 13, color: '#374151' },
  genderChipTextSelected: { color: '#FFFFFF' },
  divider:          { height: 1, backgroundColor: '#F3F4F6', marginVertical: 16 },
  lockNote:         { fontSize: 12, color: 'rgba(1,12,53,0.5)', marginTop: 8, lineHeight: 18 },
  helpLink:         { fontSize: 13, color: '#E20C04', fontWeight: '500', marginTop: 6 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  saveButton:       { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
```

- [ ] **Step 4: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=PersonalInfoSheet
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/PersonalInfoSheet.tsx apps/customer-app/src/features/profile/__tests__/PersonalInfoSheet.test.tsx
git commit -m "feat(profile): add PersonalInfoSheet with read-only email/phone and Get Help link"
```

---

## Task 14: AddressSheet + InterestsSheet + ChangePasswordSheet

**Files:**
- Create: `apps/customer-app/src/features/profile/components/AddressSheet.tsx`
- Create: `apps/customer-app/src/features/profile/components/InterestsSheet.tsx`
- Create: `apps/customer-app/src/features/profile/components/ChangePasswordSheet.tsx`

- [ ] **Step 1: Create AddressSheet**

Create `src/features/profile/components/AddressSheet.tsx`:

```typescript
import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useUpdateProfile } from '@/features/profile-completion/hooks/useUpdateProfile'
import type { CustomerProfile } from '@/lib/api/profile'

interface Props {
  visible:   boolean
  onDismiss: () => void
  profile:   CustomerProfile
}

export function AddressSheet({ visible, onDismiss, profile }: Props) {
  const [line1, setLine1]     = useState(profile.addressLine1 ?? '')
  const [line2, setLine2]     = useState(profile.addressLine2 ?? '')
  const [city, setCity]       = useState(profile.city ?? '')
  const [postcode, setPostcode] = useState(profile.postcode ?? '')
  const [error, setError]     = useState<string | null>(null)
  const { mutate, isPending } = useUpdateProfile()

  const handleSave = () => {
    if (!line1.trim() || !city.trim() || !postcode.trim()) {
      setError('Address line 1, city, and postcode are required')
      return
    }
    setError(null)
    mutate(
      { addressLine1: line1.trim(), addressLine2: line2.trim() || undefined, city: city.trim(), postcode: postcode.trim() },
      { onSuccess: onDismiss, onError: () => setError('Failed to save. Please try again.') }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Address">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Address</Text>

        {[
          { label: 'Address line 1', value: line1, onChange: setLine1, required: true },
          { label: 'Address line 2 (optional)', value: line2, onChange: setLine2, required: false },
          { label: 'City', value: city, onChange: setCity, required: true },
          { label: 'Postcode', value: postcode, onChange: setPostcode, required: true },
        ].map(({ label, value, onChange, required }) => (
          <View key={label}>
            <Text style={styles.fieldLabel}>{label}</Text>
            <TextInput
              style={styles.input}
              value={value}
              onChangeText={onChange}
              autoCapitalize="words"
              placeholder={required ? undefined : 'Optional'}
              placeholderTextColor="#9CA3AF"
            />
          </View>
        ))}

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save address</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20 },
  title:            { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 20 },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  input:            { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  saveButton:       { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
```

- [ ] **Step 2: Create InterestsSheet**

Create `src/features/profile/components/InterestsSheet.tsx`:

```typescript
import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useUpdateInterests } from '@/features/profile-completion/hooks/useUpdateInterests'
import { useAvailableInterests } from '@/features/profile-completion/hooks/useAvailableInterests'

interface Props {
  visible:        boolean
  onDismiss:      () => void
  selectedIds:    string[]
}

export function InterestsSheet({ visible, onDismiss, selectedIds }: Props) {
  const { data: available = [] } = useAvailableInterests()
  const [selected, setSelected] = useState<Set<string>>(new Set(selectedIds))
  const [error, setError]       = useState<string | null>(null)
  const { mutate, isPending }   = useUpdateInterests()

  const toggle = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const handleSave = () => {
    setError(null)
    mutate(
      Array.from(selected),
      { onSuccess: onDismiss, onError: () => setError('Failed to save. Please try again.') }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Interests">
      <ScrollView style={styles.content}>
        <Text style={styles.title}>Interests</Text>
        <Text style={styles.subtitle}>Choose topics you enjoy to improve your recommendations.</Text>

        <View style={styles.chipGrid}>
          {available.map(interest => {
            const isSelected = selected.has(interest.id)
            return (
              <Pressable
                key={interest.id}
                style={[styles.chip, isSelected && styles.chipSelected]}
                onPress={() => toggle(interest.id)}
              >
                <Text style={[styles.chipText, isSelected && styles.chipTextSelected]}>
                  {interest.name}
                </Text>
              </Pressable>
            )
          })}
        </View>

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, isPending && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Save interests</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:           { padding: 20 },
  title:             { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 6 },
  subtitle:          { fontSize: 13, color: 'rgba(1,12,53,0.5)', marginBottom: 16, lineHeight: 20 },
  chipGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  chip:              { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8 },
  chipSelected:      { backgroundColor: '#010C35', borderColor: '#010C35' },
  chipText:          { fontSize: 14, color: '#374151' },
  chipTextSelected:  { color: '#FFFFFF' },
  errorText:         { fontSize: 13, color: '#DC2626', marginBottom: 8 },
  saveButton:        { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:    { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
```

- [ ] **Step 3: Create ChangePasswordSheet**

Create `src/features/profile/components/ChangePasswordSheet.tsx`:

```typescript
import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { Eye, EyeOff } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { profileApi } from '@/lib/api/profile'

interface Props {
  visible:   boolean
  onDismiss: () => void
  onSuccess: () => void
}

export function ChangePasswordSheet({ visible, onDismiss, onSuccess }: Props) {
  const [current, setCurrent]   = useState('')
  const [next, setNext]         = useState('')
  const [confirm, setConfirm]   = useState('')
  const [showCurrent, setShowCurrent] = useState(false)
  const [showNext, setShowNext]       = useState(false)
  const [error, setError]       = useState<string | null>(null)
  const [loading, setLoading]   = useState(false)

  const handleSave = async () => {
    if (!current || !next || !confirm) { setError('All fields are required'); return }
    if (next.length < 8)              { setError('New password must be at least 8 characters'); return }
    if (next === current)             { setError('New password must be different from your current password'); return }
    if (next !== confirm)             { setError('Passwords do not match'); return }

    setError(null)
    setLoading(true)
    try {
      await profileApi.changePassword({ currentPassword: current, newPassword: next })
      onSuccess()
      onDismiss()
    } catch (e: any) {
      setError(
        e?.message === 'CURRENT_PASSWORD_INCORRECT'
          ? 'Your current password is incorrect.'
          : 'Failed to change password. Please try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  const PasswordInput = ({
    label, value, onChange, show, toggleShow,
  }: { label: string; value: string; onChange: (v: string) => void; show: boolean; toggleShow: () => void }) => (
    <View>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.passwordRow}>
        <TextInput
          style={styles.passwordInput}
          value={value}
          onChangeText={onChange}
          secureTextEntry={!show}
          autoCapitalize="none"
        />
        <Pressable onPress={toggleShow} style={styles.eyeButton}>
          {show ? <EyeOff size={18} color="#9CA3AF" /> : <Eye size={18} color="#9CA3AF" />}
        </Pressable>
      </View>
    </View>
  )

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Change password">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Change password</Text>

        <PasswordInput
          label="Current password" value={current} onChange={setCurrent}
          show={showCurrent} toggleShow={() => setShowCurrent(v => !v)}
        />
        <PasswordInput
          label="New password" value={next} onChange={setNext}
          show={showNext} toggleShow={() => setShowNext(v => !v)}
        />
        <PasswordInput
          label="Confirm new password" value={confirm} onChange={setConfirm}
          show={showNext} toggleShow={() => setShowNext(v => !v)}
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.saveButton, loading && styles.saveButtonDisabled]}
          onPress={handleSave}
          disabled={loading}
        >
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>Change password</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20 },
  title:            { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 20 },
  fieldLabel:       { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  passwordRow:      { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10 },
  passwordInput:    { flex: 1, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  eyeButton:        { padding: 12 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  saveButton:       { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  saveButtonDisabled: { opacity: 0.6 },
  saveButtonText:   { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
```

- [ ] **Step 4: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/AddressSheet.tsx apps/customer-app/src/features/profile/components/InterestsSheet.tsx apps/customer-app/src/features/profile/components/ChangePasswordSheet.tsx
git commit -m "feat(profile): add AddressSheet, InterestsSheet, ChangePasswordSheet"
```

---

## Task 15: SubscriptionManagementSheet

**Files:**
- Create: `apps/customer-app/src/features/profile/components/SubscriptionManagementSheet.tsx`
- Test: `src/features/profile/__tests__/SubscriptionManagementSheet.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/__tests__/SubscriptionManagementSheet.test.tsx`:

```typescript
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'
import { SubscriptionManagementSheet } from '../components/SubscriptionManagementSheet'

const mockSub = {
  status: 'ACTIVE',
  plan: { name: 'Monthly', intervalMonths: 1 },
  price: 6.99,
  renewsAt: '2026-05-12T00:00:00.000Z',
  cancelAtPeriodEnd: false,
}

describe('SubscriptionManagementSheet', () => {
  it('shows plan name and renewal date', () => {
    render(
      <SubscriptionManagementSheet
        visible={true} onDismiss={jest.fn()} subscription={mockSub as any}
      />
    )
    expect(screen.getByText(/Monthly/)).toBeTruthy()
    expect(screen.getByText(/12 May 2026/)).toBeTruthy()
  })

  it('shows cancel subscription button when not already cancelling', () => {
    render(
      <SubscriptionManagementSheet
        visible={true} onDismiss={jest.fn()} subscription={mockSub as any}
      />
    )
    expect(screen.getByText(/cancel subscription/i)).toBeTruthy()
  })

  it('shows "already cancelled" message when cancelAtPeriodEnd is true', () => {
    const cancelled = { ...mockSub, cancelAtPeriodEnd: true }
    render(
      <SubscriptionManagementSheet
        visible={true} onDismiss={jest.fn()} subscription={cancelled as any}
      />
    )
    expect(screen.getByText(/cancellation scheduled/i)).toBeTruthy()
  })

  it('shows subscribe CTA when there is no subscription', () => {
    render(
      <SubscriptionManagementSheet
        visible={true} onDismiss={jest.fn()} subscription={null}
      />
    )
    expect(screen.getByText(/no active plan/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=SubscriptionManagementSheet
```

Expected: FAIL

- [ ] **Step 3: Create the component**

Create `src/features/profile/components/SubscriptionManagementSheet.tsx`:

```typescript
import React, { useState } from 'react'
import { View, Text, Pressable, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useCancelSubscription } from '../hooks/useCancelSubscription'
import type { MySubscription } from '@/lib/api/subscription'

interface Props {
  visible:      boolean
  onDismiss:    () => void
  subscription: MySubscription | null | undefined
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })
}

export function SubscriptionManagementSheet({ visible, onDismiss, subscription }: Props) {
  const { mutate: cancel, isPending } = useCancelSubscription()
  const [cancelError, setCancelError] = useState<string | null>(null)

  const handleCancel = () => {
    Alert.alert(
      'Cancel subscription?',
      `Your access continues until ${subscription?.renewsAt ? formatDate(subscription.renewsAt) : 'the end of your billing period'}. You can resubscribe at any time.`,
      [
        { text: 'Keep my subscription', style: 'cancel' },
        {
          text: 'Cancel subscription',
          style: 'destructive',
          onPress: () => {
            setCancelError(null)
            cancel(undefined, {
              onSuccess: onDismiss,
              onError: () => setCancelError('Failed to cancel. Please try again.'),
            })
          },
        },
      ]
    )
  }

  if (!subscription) {
    return (
      <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Subscription">
        <View style={styles.content}>
          <Text style={styles.title}>Subscription</Text>
          <View style={styles.emptyCard}>
            <Text style={styles.emptyHeading}>No active plan</Text>
            <Text style={styles.emptyBody}>Subscribe to unlock voucher redemption.</Text>
          </View>
        </View>
      </BottomSheet>
    )
  }

  const isAlreadyCancelling = subscription.cancelAtPeriodEnd
  const renewDate = subscription.renewsAt ? formatDate(subscription.renewsAt) : null

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Subscription management">
      <View style={styles.content}>
        <Text style={styles.title}>Subscription</Text>

        {/* Plan card */}
        <View style={styles.planCard}>
          <Text style={styles.planName}>{subscription.plan?.name ?? 'Redeemo'} · £{subscription.price?.toFixed(2)}/mo</Text>
          {renewDate && (
            <Text style={styles.planDate}>
              {isAlreadyCancelling ? `Access until ${renewDate}` : `Renews ${renewDate}`}
            </Text>
          )}
        </View>

        {!isAlreadyCancelling && (
          <>
            {renewDate && (
              <View style={styles.callout}>
                <Text style={styles.calloutText}>
                  Your access continues until {renewDate} even after cancelling.
                </Text>
              </View>
            )}
            {cancelError && <Text style={styles.errorText}>{cancelError}</Text>}
            <Pressable
              style={[styles.cancelButton, isPending && styles.buttonDisabled]}
              onPress={handleCancel}
              disabled={isPending}
            >
              {isPending
                ? <ActivityIndicator color="#DC2626" />
                : <Text style={styles.cancelButtonText}>Cancel subscription</Text>
              }
            </Pressable>
          </>
        )}

        {isAlreadyCancelling && (
          <View style={styles.callout}>
            <Text style={styles.calloutText}>
              Cancellation scheduled. You have access until {renewDate}.
            </Text>
          </View>
        )}
      </View>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:           { padding: 20 },
  title:             { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 16 },
  planCard:          { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 16, marginBottom: 16 },
  planName:          { fontSize: 16, fontWeight: '600', color: '#010C35', marginBottom: 4 },
  planDate:          { fontSize: 13, color: 'rgba(1,12,53,0.5)' },
  callout:           { backgroundColor: '#FEF3C7', borderRadius: 10, padding: 12, marginBottom: 16 },
  calloutText:       { fontSize: 13, color: '#92400E', lineHeight: 20 },
  cancelButton:      { borderWidth: 1.5, borderColor: '#DC2626', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  buttonDisabled:    { opacity: 0.5 },
  cancelButtonText:  { color: '#DC2626', fontSize: 15, fontWeight: '600' },
  errorText:         { fontSize: 13, color: '#DC2626', marginBottom: 12 },
  emptyCard:         { backgroundColor: '#F9FAFB', borderRadius: 12, padding: 20, alignItems: 'center' },
  emptyHeading:      { fontSize: 16, fontWeight: '600', color: '#010C35', marginBottom: 6 },
  emptyBody:         { fontSize: 13, color: 'rgba(1,12,53,0.5)', textAlign: 'center' },
})
```

- [ ] **Step 4: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=SubscriptionManagementSheet
```

Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/SubscriptionManagementSheet.tsx apps/customer-app/src/features/profile/__tests__/SubscriptionManagementSheet.test.tsx
git commit -m "feat(profile): add SubscriptionManagementSheet with cancel flow"
```

---

## Task 16: NotificationsSection

**Files:**
- Create: `apps/customer-app/src/features/profile/components/NotificationsSection.tsx`
- Test: `src/features/profile/__tests__/NotificationsSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/__tests__/NotificationsSection.test.tsx`:

```typescript
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'
import { NotificationsSection } from '../components/NotificationsSection'

jest.mock('@/lib/api/profile', () => ({
  profileApi: { updateProfile: jest.fn().mockResolvedValue({}) },
}))

describe('NotificationsSection', () => {
  it('shows email toggle reflecting newsletterConsent', () => {
    render(<NotificationsSection newsletterConsent={true} userId="u1" />)
    // Toggle should be on — look for the accessible value
    expect(screen.getByRole('switch', { name: /email newsletter/i })).toBeTruthy()
  })

  it('push notifications row is not interactive (Coming soon)', () => {
    render(<NotificationsSection newsletterConsent={false} userId="u1" />)
    // The push row should not be pressable — it has no Pressable wrapper
    expect(screen.queryByRole('button', { name: /push notifications/i })).toBeNull()
    expect(screen.getByText('Coming soon')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=NotificationsSection
```

Expected: FAIL

- [ ] **Step 3: Create the component**

Create `src/features/profile/components/NotificationsSection.tsx`:

```typescript
import React, { useState } from 'react'
import { View, Text, Switch, StyleSheet } from 'react-native'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { profileApi } from '@/lib/api/profile'
import { useQueryClient } from '@tanstack/react-query'

interface Props {
  newsletterConsent: boolean
  userId: string
}

export function NotificationsSection({ newsletterConsent, userId }: Props) {
  const [consent, setConsent] = useState(newsletterConsent)
  const queryClient = useQueryClient()

  const handleNewsletterToggle = async (value: boolean) => {
    const prev = consent
    setConsent(value) // optimistic
    try {
      await profileApi.updateProfile({ newsletterConsent: value })
      queryClient.invalidateQueries({ queryKey: ['profile'] })
    } catch {
      setConsent(prev) // rollback
    }
  }

  return (
    <ProfileSectionCard title="Notifications">
      {/* Push notifications — stub, non-interactive */}
      <ProfileRow
        label="Push notifications"
        isFirst
        rightContent={
          <View style={styles.comingSoonPill}>
            <Text style={styles.comingSoonText}>Coming soon</Text>
          </View>
        }
        disabled
      />

      {/* Email newsletter — fully live toggle */}
      <ProfileRow
        label="Email newsletter"
        rightContent={
          <Switch
            value={consent}
            onValueChange={handleNewsletterToggle}
            trackColor={{ false: '#D1D5DB', true: '#E20C04' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Email newsletter"
            accessibilityRole="switch"
          />
        }
      />
    </ProfileSectionCard>
  )
}

const styles = StyleSheet.create({
  comingSoonPill: {
    backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3,
  },
  comingSoonText: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
})
```

- [ ] **Step 4: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=NotificationsSection
```

Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/NotificationsSection.tsx apps/customer-app/src/features/profile/__tests__/NotificationsSection.test.tsx
git commit -m "feat(profile): add NotificationsSection (live email toggle + push stub)"
```

---

## Task 17: AppSettingsSection with useReduceMotion

**Files:**
- Create: `apps/customer-app/src/features/profile/components/AppSettingsSection.tsx`
- Test: `src/features/profile/__tests__/AppSettingsSection.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/__tests__/AppSettingsSection.test.tsx`:

```typescript
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('@/stores/auth', () => ({
  useAuthStore: jest.fn((selector: any) => selector({
    hapticsEnabled: true,
    motionScale: 1,
    setHaptics: jest.fn(),
    setMotionScale: jest.fn(),
  })),
}))

jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'denied' }),
}))

jest.mock('@/features/profile/hooks/useReduceMotion', () => ({ useReduceMotion: jest.fn(() => false) }))

import { AppSettingsSection } from '../components/AppSettingsSection'

describe('AppSettingsSection', () => {
  it('shows haptic feedback toggle', () => {
    render(<AppSettingsSection />)
    expect(screen.getByRole('switch', { name: /haptic feedback/i })).toBeTruthy()
  })

  it('shows reduce motion toggle', () => {
    render(<AppSettingsSection />)
    expect(screen.getByRole('switch', { name: /reduce motion/i })).toBeTruthy()
  })

  it('shows location access row', () => {
    render(<AppSettingsSection />)
    expect(screen.getByText('Location access')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=AppSettingsSection
```

Expected: FAIL

- [ ] **Step 3: Create the component**

Create `src/features/profile/components/AppSettingsSection.tsx`:

```typescript
import React, { useEffect, useState } from 'react'
import { View, Text, Switch, StyleSheet, Linking } from 'react-native'
import * as Location from 'expo-location'
import { useFocusEffect } from 'expo-router'
import { MapPin } from 'lucide-react-native'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { useAuthStore } from '@/stores/auth'
import { useReduceMotion } from '../hooks/useReduceMotion'

function useLocationStatus() {
  const [status, setStatus] = useState<string>('UNDETERMINED')

  const refresh = async () => {
    try {
      const result = await Location.getForegroundPermissionsAsync()
      if (result.status === 'granted') {
        setStatus((result as any).ios?.scope === 'whenInUse' ? 'WHEN_IN_USE' : 'GRANTED')
      } else {
        setStatus(result.status.toUpperCase())
      }
    } catch {
      setStatus('UNDETERMINED')
    }
  }

  useFocusEffect(React.useCallback(() => { void refresh() }, []))

  return status
}

const locationLabel: Record<string, string> = {
  GRANTED:     'Allowed',
  WHEN_IN_USE: 'While using',
  DENIED:      'Denied',
  UNDETERMINED: 'Not set',
}

export function AppSettingsSection() {
  const hapticsEnabled = useAuthStore(s => s.hapticsEnabled)
  const motionScale    = useAuthStore(s => s.motionScale)
  const setHaptics     = useAuthStore(s => s.setHaptics)
  const setMotionScale = useAuthStore(s => s.setMotionScale)
  const osReduceMotion = useReduceMotion()
  const locationStatus = useLocationStatus()

  // When OS reduce motion is on, lock the toggle on
  const isReduceMotionLocked = osReduceMotion && motionScale === 0

  return (
    <ProfileSectionCard title="App Settings">
      {/* Haptic feedback */}
      <ProfileRow
        label="Haptic feedback"
        isFirst
        rightContent={
          <Switch
            value={hapticsEnabled}
            onValueChange={setHaptics}
            trackColor={{ false: '#D1D5DB', true: '#E20C04' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Haptic feedback"
            accessibilityRole="switch"
          />
        }
      />

      {/* Reduce motion */}
      <ProfileRow
        label="Reduce motion"
        disabled={isReduceMotionLocked}
        rightContent={
          <Switch
            value={motionScale === 0 || osReduceMotion}
            onValueChange={v => !isReduceMotionLocked && setMotionScale(v ? 0 : 1)}
            disabled={isReduceMotionLocked}
            trackColor={{ false: '#D1D5DB', true: '#E20C04' }}
            thumbColor="#FFFFFF"
            accessibilityLabel="Reduce motion"
            accessibilityRole="switch"
          />
        }
      />

      {/* Location access */}
      <ProfileRow
        label="Location access"
        preview={locationLabel[locationStatus] ?? 'Not set'}
        onPress={() => { void Linking.openSettings() }}
        leftIcon={<MapPin size={16} color="rgba(1,12,53,0.4)" />}
      />
    </ProfileSectionCard>
  )
}

const styles = StyleSheet.create({})
```

- [ ] **Step 4: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=AppSettingsSection
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/AppSettingsSection.tsx apps/customer-app/src/features/profile/__tests__/AppSettingsSection.test.tsx
git commit -m "feat(profile): add AppSettingsSection (haptics, reduce motion, location access)"
```

---

## Task 18: RedeemoSection + RequestMerchantSheet

**Files:**
- Create: `apps/customer-app/src/features/profile/components/RedeemoSection.tsx`
- Create: `apps/customer-app/src/features/profile/components/RequestMerchantSheet.tsx`

- [ ] **Step 1: Create RequestMerchantSheet**

Create `src/features/profile/components/RequestMerchantSheet.tsx`:

```typescript
import React, { useState } from 'react'
import { View, Text, TextInput, Pressable, StyleSheet, ScrollView, ActivityIndicator } from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useMerchantRequest } from '../hooks/useMerchantRequest'

interface Props {
  visible:   boolean
  onDismiss: () => void
  onSuccess: () => void
}

export function RequestMerchantSheet({ visible, onDismiss, onSuccess }: Props) {
  const [businessName, setBusinessName] = useState('')
  const [location, setLocation]         = useState('')
  const [note, setNote]                 = useState('')
  const [error, setError]               = useState<string | null>(null)
  const { mutate, isPending }           = useMerchantRequest()

  const handleSubmit = () => {
    if (!businessName.trim()) { setError('Business name is required'); return }
    if (!location.trim())     { setError('City / location is required'); return }
    setError(null)
    mutate(
      { businessName: businessName.trim(), location: location.trim(), note: note.trim() || undefined },
      {
        onSuccess: () => { onSuccess(); onDismiss() },
        onError:   () => setError('Failed to submit. Please try again.'),
      }
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Request a merchant">
      <ScrollView style={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.title}>Request a merchant</Text>
        <Text style={styles.subtitle}>Know a great local business that should be on Redeemo? Let us know.</Text>

        <Text style={styles.fieldLabel}>Business name *</Text>
        <TextInput style={styles.input} value={businessName} onChangeText={setBusinessName} maxLength={100} />

        <Text style={styles.fieldLabel}>City / location *</Text>
        <TextInput style={styles.input} value={location} onChangeText={setLocation} maxLength={100} />

        <Text style={styles.fieldLabel}>Anything specific to share? (optional)</Text>
        <TextInput
          style={[styles.input, styles.noteInput]}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={500}
          placeholder="Anything specific to share about this place?"
          placeholderTextColor="#9CA3AF"
        />

        {error && <Text style={styles.errorText}>{error}</Text>}

        <Pressable
          style={[styles.submitButton, isPending && styles.buttonDisabled]}
          onPress={handleSubmit}
          disabled={isPending}
        >
          {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Submit request</Text>}
        </Pressable>
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:       { padding: 20 },
  title:         { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 6 },
  subtitle:      { fontSize: 13, color: 'rgba(1,12,53,0.5)', marginBottom: 16, lineHeight: 20 },
  fieldLabel:    { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 4, marginTop: 12 },
  input:         { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  noteInput:     { minHeight: 100, textAlignVertical: 'top' },
  errorText:     { fontSize: 13, color: '#DC2626', marginTop: 12 },
  submitButton:  { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  buttonDisabled: { opacity: 0.6 },
  submitText:    { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
})
```

- [ ] **Step 2: Create RedeemoSection**

Create `src/features/profile/components/RedeemoSection.tsx`:

```typescript
import React, { useState } from 'react'
import { Linking, Share, Platform } from 'react-native'
import * as StoreReview from 'expo-store-review'
import * as WebBrowser from 'expo-web-browser'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { RequestMerchantSheet } from './RequestMerchantSheet'
import { LINKS } from '@/lib/config/links'
import { useToast } from '@/design-system/Toast'

export function RedeemoSection() {
  const [requestOpen, setRequestOpen] = useState(false)
  const { show: showToast } = useToast()

  const handleBecomeMerchant = () => {
    void Linking.openURL(LINKS.merchantPortal)
  }

  const handleRateApp = async () => {
    const available = await StoreReview.isAvailableAsync()
    if (available) {
      await StoreReview.requestReview()
    } else {
      const storeUrl = Platform.OS === 'ios' ? LINKS.appStoreIos : LINKS.appStoreAndroid
      void Linking.openURL(storeUrl)
    }
  }

  const handleShare = async () => {
    const storeUrl = Platform.OS === 'ios' ? LINKS.appStoreIos : LINKS.appStoreAndroid
    await Share.share({
      message: `I've been saving money with Redeemo — check it out! ${storeUrl}`,
    })
  }

  return (
    <>
      <ProfileSectionCard title="Redeemo">
        <ProfileRow
          label="Become a merchant"
          isFirst
          onPress={handleBecomeMerchant}
          rightContent={<></>}  // arrow-out icon handled inline
          preview="↗"
        />
        <ProfileRow
          label="Request a merchant"
          onPress={() => setRequestOpen(true)}
        />
        <ProfileRow
          label="Rate Redeemo ⭐"
          onPress={() => { void handleRateApp() }}
        />
        <ProfileRow
          label="Share Redeemo"
          onPress={() => { void handleShare() }}
        />
      </ProfileSectionCard>

      <RequestMerchantSheet
        visible={requestOpen}
        onDismiss={() => setRequestOpen(false)}
        onSuccess={() => showToast("Thanks! We'll look into adding them.")}
      />
    </>
  )
}
```

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/RedeemoSection.tsx apps/customer-app/src/features/profile/components/RequestMerchantSheet.tsx
git commit -m "feat(profile): add RedeemoSection (become merchant, request merchant, rate, share) + RequestMerchantSheet"
```

---

## Task 19: GetHelpModal — full in-app support system

**Files:**
- Create: `apps/customer-app/src/features/profile/components/GetHelpModal.tsx`

This is the full-screen support ticket system: ticket list, ticket detail, and new ticket form in a navigation stack. Since it's a full-screen modal (not a BottomSheet), it uses a `Modal` from React Native with a custom navigation state.

- [ ] **Step 1: Write the failing test**

Create `src/features/profile/__tests__/GetHelpModal.test.tsx`:

```typescript
import React from 'react'
import { render, screen, fireEvent } from '@testing-library/react-native'

jest.mock('@/features/profile/hooks/useSupportTickets', () => ({
  useSupportTickets: jest.fn().mockReturnValue({ data: { items: [], total: 0 }, isLoading: false }),
  useSupportTicketDetail: jest.fn().mockReturnValue({ data: null, isLoading: false }),
}))

jest.mock('@/features/profile/hooks/useCreateTicket', () => ({
  useCreateTicket: jest.fn().mockReturnValue({ mutate: jest.fn(), isPending: false }),
}))

import { GetHelpModal } from '../components/GetHelpModal'

describe('GetHelpModal', () => {
  it('shows empty state when no tickets', () => {
    render(<GetHelpModal visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/no open tickets/i)).toBeTruthy()
  })

  it('shows new ticket button', () => {
    render(<GetHelpModal visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/new ticket/i)).toBeTruthy()
  })

  it('navigates to new ticket form on button press', () => {
    render(<GetHelpModal visible={true} onDismiss={jest.fn()} />)
    fireEvent.press(screen.getByText(/new ticket/i))
    expect(screen.getByText(/topic/i)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=GetHelpModal
```

Expected: FAIL

- [ ] **Step 3: Create the component**

Create `src/features/profile/components/GetHelpModal.tsx`:

```typescript
import React, { useState, useCallback } from 'react'
import {
  Modal, View, Text, Pressable, FlatList, StyleSheet, SafeAreaView,
  ScrollView, TextInput, ActivityIndicator, RefreshControl,
} from 'react-native'
import { X, Plus, ChevronLeft, ChevronRight } from 'lucide-react-native'
import { useSupportTickets, useSupportTicketDetail } from '../hooks/useSupportTickets'
import { useCreateTicket } from '../hooks/useCreateTicket'
import { SUPPORT_TOPICS, type SupportTopic } from '@/lib/constants/supportTopics'
import type { SupportTicket, TicketStatus } from '@/lib/api/support'
import { useQueryClient } from '@tanstack/react-query'

type ModalView = 'list' | 'detail' | 'new-form' | 'success'

interface Props {
  visible:        boolean
  onDismiss:      () => void
  initialTopic?:  SupportTopic
  initialMessage?: string
}

function statusBadge(status: TicketStatus): { label: string; color: string; bg: string } {
  return status === 'OPEN'        ? { label: 'Open',        color: '#92400E', bg: '#FEF3C7' }
       : status === 'IN_PROGRESS' ? { label: 'In Progress', color: '#1E40AF', bg: '#EFF6FF' }
       :                            { label: 'Resolved',    color: '#065F46', bg: '#ECFDF5' }
}

function relativeDate(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const days = Math.floor(diff / 86400000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

// Ticket list view
function TicketListView({
  onNewTicket, onSelectTicket,
}: { onNewTicket: () => void; onSelectTicket: (id: string) => void }) {
  const { data, isLoading, refetch, isRefetching } = useSupportTickets()
  const tickets = data?.items ?? []

  if (isLoading) {
    return <ActivityIndicator style={{ marginTop: 40 }} color="#E20C04" />
  }

  if (tickets.length === 0) {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyEmoji}>💬</Text>
        <Text style={styles.emptyTitle}>No open tickets</Text>
        <Text style={styles.emptyBody}>We're here if you need us.</Text>
        <Pressable style={styles.emptyAction} onPress={onNewTicket}>
          <Text style={styles.emptyActionText}>Create a request</Text>
        </Pressable>
      </View>
    )
  }

  return (
    <FlatList
      data={tickets}
      keyExtractor={t => t.id}
      refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} />}
      renderItem={({ item }) => {
        const badge = statusBadge(item.status)
        return (
          <Pressable style={styles.ticketRow} onPress={() => onSelectTicket(item.id)}>
            <View style={styles.ticketMeta}>
              <Text style={styles.ticketNumber}>{item.ticketNumber}</Text>
              <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
                <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
              </View>
            </View>
            <Text style={styles.ticketSubject} numberOfLines={1}>{item.subject}</Text>
            <Text style={styles.ticketDate}>{relativeDate(item.updatedAt)}</Text>
            <View style={styles.rowChevron}>
              <ChevronRight size={14} color="#9CA3AF" />
            </View>
          </Pressable>
        )
      }}
    />
  )
}

// Ticket detail view
function TicketDetailView({ ticketId, onBack }: { ticketId: string; onBack: () => void }) {
  const { data: ticket, isLoading } = useSupportTicketDetail(ticketId)

  if (isLoading || !ticket) return <ActivityIndicator style={{ marginTop: 40 }} color="#E20C04" />

  const badge = statusBadge(ticket.status)

  return (
    <ScrollView style={styles.detailScroll}>
      <View style={styles.detailHeader}>
        <Text style={styles.detailNumber}>{ticket.ticketNumber}</Text>
        <View style={[styles.statusBadge, { backgroundColor: badge.bg }]}>
          <Text style={[styles.statusText, { color: badge.color }]}>{badge.label}</Text>
        </View>
      </View>
      <Text style={styles.detailSubject}>{ticket.subject}</Text>
      <Text style={styles.detailDate}>{new Date(ticket.createdAt).toLocaleDateString('en-GB', { dateStyle: 'medium' })}</Text>
      <Text style={styles.detailMessage}>{ticket.message}</Text>
      <View style={styles.divider} />
      {ticket.adminNote ? (
        <View style={styles.replyBubble}>
          <Text style={styles.replyLabel}>Redeemo Support</Text>
          <Text style={styles.replyText}>{ticket.adminNote}</Text>
        </View>
      ) : (
        <Text style={styles.pendingReply}>We'll get back to you soon.</Text>
      )}
    </ScrollView>
  )
}

// New ticket form
function NewTicketForm({
  onSuccess, initialTopic, initialMessage,
}: { onSuccess: (ticketNumber: string) => void; initialTopic?: SupportTopic; initialMessage?: string }) {
  const [topic, setTopic]     = useState<string>(initialTopic ?? '')
  const [subject, setSubject] = useState('')
  const [message, setMessage] = useState(initialMessage ?? '')
  const [error, setError]     = useState<string | null>(null)
  const { mutate, isPending } = useCreateTicket()

  const handleSubmit = () => {
    if (!topic)              { setError('Please select a topic'); return }
    if (!subject.trim())     { setError('Subject is required'); return }
    if (message.trim().length < 20) { setError('Message must be at least 20 characters'); return }
    setError(null)
    mutate(
      { topic, subject: subject.trim(), message: message.trim() },
      {
        onSuccess: (ticket) => onSuccess(ticket.ticketNumber),
        onError:   () => setError('Failed to submit. Please try again.'),
      }
    )
  }

  return (
    <ScrollView style={styles.formScroll} keyboardShouldPersistTaps="handled">
      <Text style={styles.formSectionLabel}>Topic</Text>
      <View style={styles.topicList}>
        {SUPPORT_TOPICS.map(t => (
          <Pressable
            key={t}
            style={[styles.topicChip, topic === t && styles.topicChipSelected]}
            onPress={() => setTopic(t)}
          >
            <Text style={[styles.topicChipText, topic === t && styles.topicChipTextSelected]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.formSectionLabel}>Subject</Text>
      <TextInput
        style={styles.input}
        value={subject}
        onChangeText={setSubject}
        maxLength={100}
        placeholder="One-line summary"
        placeholderTextColor="#9CA3AF"
      />

      <Text style={styles.formSectionLabel}>Message</Text>
      <TextInput
        style={[styles.input, styles.messageInput]}
        value={message}
        onChangeText={setMessage}
        multiline
        maxLength={2000}
        placeholder="Describe your issue in detail..."
        placeholderTextColor="#9CA3AF"
        textAlignVertical="top"
      />
      <Text style={styles.charCount}>{message.length}/2000</Text>

      {error && <Text style={styles.errorText}>{error}</Text>}

      <Pressable
        style={[styles.submitButton, isPending && styles.buttonDisabled]}
        onPress={handleSubmit}
        disabled={isPending}
      >
        {isPending ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Send request</Text>}
      </Pressable>
    </ScrollView>
  )
}

// Main modal
export function GetHelpModal({ visible, onDismiss, initialTopic, initialMessage }: Props) {
  const [view, setView]               = useState<ModalView>('list')
  const [selectedId, setSelectedId]   = useState<string | null>(null)
  const [ticketNumber, setTicketNumber] = useState<string | null>(null)

  const handleClose = () => {
    setView('list')
    setSelectedId(null)
    setTicketNumber(null)
    onDismiss()
  }

  const handleNewTicket = () => {
    setView('new-form')
  }

  const handleSuccess = (tNum: string) => {
    setTicketNumber(tNum)
    setView('success')
  }

  const titleFor: Record<ModalView, string> = {
    list:       'Get help',
    detail:     'Ticket detail',
    'new-form': 'New request',
    success:    '',
  }

  const backTargetFor: Partial<Record<ModalView, ModalView>> = {
    detail:     'list',
    'new-form': 'list',
  }

  const backView = backTargetFor[view]

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={handleClose}>
      <SafeAreaView style={styles.modalRoot}>
        {/* Header */}
        {view !== 'success' && (
          <View style={styles.modalHeader}>
            {backView ? (
              <Pressable onPress={() => setView(backView)} style={styles.headerBtn}>
                <ChevronLeft size={20} color="#010C35" />
              </Pressable>
            ) : (
              <Pressable onPress={handleClose} style={styles.headerBtn}>
                <X size={20} color="#010C35" />
              </Pressable>
            )}
            <Text style={styles.modalTitle}>{titleFor[view]}</Text>
            {view === 'list' ? (
              <Pressable onPress={handleNewTicket} style={styles.headerBtn}>
                <Plus size={20} color="#E20C04" />
                <Text style={styles.newTicketLabel}>New ticket</Text>
              </Pressable>
            ) : (
              <View style={styles.headerBtn} />
            )}
          </View>
        )}

        {/* Content */}
        {view === 'list' && (
          <TicketListView
            onNewTicket={handleNewTicket}
            onSelectTicket={(id) => { setSelectedId(id); setView('detail') }}
          />
        )}
        {view === 'detail' && selectedId && (
          <TicketDetailView ticketId={selectedId} onBack={() => setView('list')} />
        )}
        {view === 'new-form' && (
          <NewTicketForm
            onSuccess={handleSuccess}
            initialTopic={initialTopic}
            initialMessage={initialMessage}
          />
        )}
        {view === 'success' && ticketNumber && (
          <View style={styles.successView}>
            <Text style={styles.successEmoji}>✅</Text>
            <Text style={styles.successTitle}>Ticket logged</Text>
            <Text style={styles.successNumber}>{ticketNumber}</Text>
            <Text style={styles.successBody}>We'll get back to you as soon as possible.</Text>
            <Pressable style={styles.viewTicketsButton} onPress={() => setView('list')}>
              <Text style={styles.viewTicketsText}>View my tickets</Text>
            </Pressable>
          </View>
        )}
      </SafeAreaView>
    </Modal>
  )
}

const styles = StyleSheet.create({
  modalRoot:        { flex: 1, backgroundColor: '#FAF8F5' },
  modalHeader:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: '#E5E7EB', backgroundColor: '#FFFFFF' },
  headerBtn:        { flexDirection: 'row', alignItems: 'center', gap: 4, minWidth: 60 },
  modalTitle:       { fontSize: 17, fontWeight: '600', color: '#010C35' },
  newTicketLabel:   { fontSize: 14, color: '#E20C04', fontWeight: '600' },
  emptyState:       { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  emptyEmoji:       { fontSize: 40, marginBottom: 12 },
  emptyTitle:       { fontSize: 18, fontWeight: '700', color: '#010C35', marginBottom: 6 },
  emptyBody:        { fontSize: 14, color: 'rgba(1,12,53,0.5)', textAlign: 'center', marginBottom: 20 },
  emptyAction:      { backgroundColor: '#010C35', borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  emptyActionText:  { color: '#FFFFFF', fontWeight: '600' },
  ticketRow:        { backgroundColor: '#FFFFFF', marginHorizontal: 16, marginTop: 12, borderRadius: 12, padding: 16 },
  ticketMeta:       { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 },
  ticketNumber:     { fontSize: 12, color: 'rgba(1,12,53,0.5)', fontWeight: '600' },
  ticketSubject:    { fontSize: 15, fontWeight: '500', color: '#010C35', marginBottom: 4 },
  ticketDate:       { fontSize: 12, color: 'rgba(1,12,53,0.4)' },
  rowChevron:       { position: 'absolute', right: 16, top: '50%' },
  statusBadge:      { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:       { fontSize: 11, fontWeight: '600' },
  detailScroll:     { flex: 1, padding: 20 },
  detailHeader:     { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  detailNumber:     { fontSize: 13, fontWeight: '600', color: 'rgba(1,12,53,0.5)' },
  detailSubject:    { fontSize: 20, fontWeight: '700', color: '#010C35', marginBottom: 4 },
  detailDate:       { fontSize: 12, color: 'rgba(1,12,53,0.4)', marginBottom: 16 },
  detailMessage:    { fontSize: 15, color: '#374151', lineHeight: 24 },
  divider:          { height: 1, backgroundColor: '#E5E7EB', marginVertical: 20 },
  replyBubble:      { backgroundColor: '#F0F9FF', borderRadius: 12, padding: 16 },
  replyLabel:       { fontSize: 12, fontWeight: '700', color: '#0369A1', marginBottom: 6 },
  replyText:        { fontSize: 14, color: '#374151', lineHeight: 22 },
  pendingReply:     { fontSize: 14, color: 'rgba(1,12,53,0.4)', fontStyle: 'italic' },
  formScroll:       { flex: 1, padding: 20 },
  formSectionLabel: { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.5)', marginBottom: 8, marginTop: 16 },
  topicList:        { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  topicChip:        { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7 },
  topicChipSelected: { backgroundColor: '#010C35', borderColor: '#010C35' },
  topicChipText:    { fontSize: 13, color: '#374151' },
  topicChipTextSelected: { color: '#FFFFFF' },
  input:            { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  messageInput:     { minHeight: 140 },
  charCount:        { fontSize: 11, color: '#9CA3AF', textAlign: 'right', marginTop: 4 },
  errorText:        { fontSize: 13, color: '#DC2626', marginTop: 12 },
  submitButton:     { backgroundColor: '#E20C04', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 20, marginBottom: 8 },
  buttonDisabled:   { opacity: 0.6 },
  submitText:       { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  successView:      { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
  successEmoji:     { fontSize: 48, marginBottom: 16 },
  successTitle:     { fontSize: 22, fontWeight: '700', color: '#010C35', marginBottom: 8 },
  successNumber:    { fontSize: 16, fontWeight: '600', color: '#E20C04', marginBottom: 12 },
  successBody:      { fontSize: 14, color: 'rgba(1,12,53,0.5)', textAlign: 'center', lineHeight: 22, marginBottom: 24 },
  viewTicketsButton: { backgroundColor: '#010C35', borderRadius: 12, paddingHorizontal: 28, paddingVertical: 14 },
  viewTicketsText:  { color: '#FFFFFF', fontWeight: '600' },
})
```

- [ ] **Step 4: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=GetHelpModal
```

Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/GetHelpModal.tsx apps/customer-app/src/features/profile/__tests__/GetHelpModal.test.tsx
git commit -m "feat(profile): add GetHelpModal with ticket list, detail, new ticket form, and success screen"
```

---

## Task 20: SupportLegalSection + DeleteAccountFlow

**Files:**
- Create: `apps/customer-app/src/features/profile/components/SupportLegalSection.tsx`
- Create: `apps/customer-app/src/features/profile/components/DeleteAccountFlow.tsx`
- Test: `src/features/profile/__tests__/DeleteAccountFlow.test.tsx`

- [ ] **Step 1: Create SupportLegalSection**

Create `src/features/profile/components/SupportLegalSection.tsx`:

```typescript
import React from 'react'
import { Linking } from 'react-native'
import * as WebBrowser from 'expo-web-browser'
import { ProfileSectionCard } from './ProfileSectionCard'
import { ProfileRow } from './ProfileRow'
import { LINKS } from '@/lib/config/links'

interface Props {
  onGetHelp: () => void
}

export function SupportLegalSection({ onGetHelp }: Props) {
  const open = (url: string) => WebBrowser.openBrowserAsync(url)

  return (
    <ProfileSectionCard title="Support & Legal">
      <ProfileRow label="Get help" isFirst onPress={onGetHelp} />
      <ProfileRow label="About Redeemo"  onPress={() => { void open(LINKS.about) }}   preview="↗" />
      <ProfileRow label="FAQs"           onPress={() => { void open(LINKS.faq) }}     preview="↗" />
      <ProfileRow label="Terms of Use"   onPress={() => { void open(LINKS.terms) }}   preview="↗" />
      <ProfileRow label="Privacy Policy" onPress={() => { void open(LINKS.privacy) }} preview="↗" />
    </ProfileSectionCard>
  )
}
```

- [ ] **Step 2: Write the failing delete account test**

Create `src/features/profile/__tests__/DeleteAccountFlow.test.tsx`:

```typescript
import React from 'react'
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native'

jest.mock('@/features/profile/hooks/useDeleteAccount', () => ({
  useDeleteAccount: jest.fn(() => ({
    stage: 'warning',
    setStage: jest.fn(),
    error: null,
    loading: false,
    sendOtp: jest.fn(),
    verifyOtp: jest.fn(),
    confirmDelete: jest.fn(),
    actionToken: null,
  })),
}))

import { DeleteAccountFlow } from '../components/DeleteAccountFlow'

describe('DeleteAccountFlow', () => {
  it('shows warning with consequences list', () => {
    render(<DeleteAccountFlow visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/permanently anonymised/i)).toBeTruthy()
    expect(screen.getByText(/subscription will be cancelled immediately/i)).toBeTruthy()
    expect(screen.getByText(/favourites and redemption history will be removed/i)).toBeTruthy()
  })

  it('shows send OTP button in warning stage', () => {
    render(<DeleteAccountFlow visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/send verification code/i)).toBeTruthy()
  })

  it('shows keep my account button', () => {
    render(<DeleteAccountFlow visible={true} onDismiss={jest.fn()} />)
    expect(screen.getByText(/keep my account/i)).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test — expect it to fail**

(Run in a real terminal)
```bash
cd apps/customer-app && npm test -- --testPathPattern=DeleteAccountFlow
```

Expected: FAIL

- [ ] **Step 4: Create DeleteAccountFlow component**

Create `src/features/profile/components/DeleteAccountFlow.tsx`:

```typescript
import React, { useState } from 'react'
import {
  View, Text, Pressable, StyleSheet, ActivityIndicator, TextInput, ScrollView
} from 'react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { useDeleteAccount } from '../hooks/useDeleteAccount'

interface Props {
  visible:   boolean
  onDismiss: () => void
}

const CONSEQUENCES = [
  'Your account will be permanently anonymised',
  'Your subscription will be cancelled immediately',
  'Your saved favourites and redemption history will be removed',
  'You will be signed out on all devices',
]

const GDPR_NOTE =
  'Your redemption history is retained in anonymised form for fraud prevention. All personal data is deleted in line with our Privacy Policy and UK GDPR.'

function OtpInput({ onComplete }: { onComplete: (code: string) => void }) {
  const [value, setValue] = useState('')
  const handleChange = (text: string) => {
    const digits = text.replace(/\D/g, '').slice(0, 6)
    setValue(digits)
    if (digits.length === 6) onComplete(digits)
  }
  return (
    <TextInput
      style={styles.otpInput}
      value={value}
      onChangeText={handleChange}
      keyboardType="number-pad"
      maxLength={6}
      placeholder="• • • • • •"
      placeholderTextColor="#9CA3AF"
      textAlign="center"
      autoFocus
    />
  )
}

export function DeleteAccountFlow({ visible, onDismiss }: Props) {
  const { stage, setStage, error, loading, sendOtp, verifyOtp, confirmDelete, actionToken } =
    useDeleteAccount()
  const [otpSent, setOtpSent] = useState(false)

  const handleSendOtp = async () => {
    await sendOtp()
    setOtpSent(true)
  }

  const handleOtpComplete = async (code: string) => {
    await verifyOtp(code)
    // If verifyOtp succeeded, actionToken will be set — auto-confirm
    if (actionToken) await confirmDelete()
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Delete account">
      <ScrollView style={styles.content}>
        {stage === 'warning' && (
          <>
            <Text style={styles.title}>Delete account?</Text>

            {/* Consequences card */}
            <View style={styles.warningCard}>
              {CONSEQUENCES.map(line => (
                <View key={line} style={styles.consequenceLine}>
                  <Text style={styles.bulletDot}>•</Text>
                  <Text style={styles.consequenceText}>{line}</Text>
                </View>
              ))}
            </View>

            <Text style={styles.gdprNote}>{GDPR_NOTE}</Text>

            {error && <Text style={styles.errorText}>{error}</Text>}

            <Pressable
              style={[styles.primaryButton, loading && styles.buttonDisabled]}
              onPress={() => { void handleSendOtp() }}
              disabled={loading}
            >
              {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryButtonText}>Send verification code</Text>}
            </Pressable>
            <Pressable style={styles.secondaryButton} onPress={onDismiss}>
              <Text style={styles.secondaryButtonText}>Keep my account</Text>
            </Pressable>
          </>
        )}

        {stage === 'otp' && (
          <>
            <Text style={styles.stepLabel}>Step 2 of 2</Text>
            <Text style={styles.title}>Enter verification code</Text>
            <Text style={styles.otpSubtitle}>We sent a 6-digit code to your phone. Enter it below to confirm deletion.</Text>

            <OtpInput onComplete={handleOtpComplete} />

            {error && <Text style={styles.errorText}>{error}</Text>}

            {loading && <ActivityIndicator style={{ marginTop: 16 }} color="#E20C04" />}

            <Pressable onPress={() => setStage('warning')} style={styles.startOver}>
              <Text style={styles.startOverText}>← Start over</Text>
            </Pressable>
          </>
        )}
      </ScrollView>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  content:          { padding: 20 },
  stepLabel:        { fontSize: 12, fontWeight: '600', color: 'rgba(1,12,53,0.4)', marginBottom: 4 },
  title:            { fontSize: 20, fontWeight: '700', color: '#010C35', marginBottom: 16 },
  warningCard:      { backgroundColor: 'rgba(226,12,4,0.08)', borderRadius: 12, padding: 16, marginBottom: 12 },
  consequenceLine:  { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 8, gap: 8 },
  bulletDot:        { color: '#DC2626', fontWeight: '700', marginTop: 1 },
  consequenceText:  { flex: 1, fontSize: 14, color: '#374151', lineHeight: 22 },
  gdprNote:         { fontSize: 12, color: 'rgba(1,12,53,0.45)', lineHeight: 18, marginBottom: 20 },
  errorText:        { fontSize: 13, color: '#DC2626', marginBottom: 12 },
  primaryButton:    { backgroundColor: '#DC2626', borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginBottom: 12 },
  buttonDisabled:   { opacity: 0.6 },
  primaryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
  secondaryButton:  { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 16, alignItems: 'center' },
  secondaryButtonText: { color: '#374151', fontSize: 16, fontWeight: '500' },
  otpSubtitle:      { fontSize: 14, color: 'rgba(1,12,53,0.5)', marginBottom: 24, lineHeight: 22 },
  otpInput:         { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 12, paddingVertical: 18, fontSize: 28, letterSpacing: 8, color: '#010C35', fontWeight: '700' },
  startOver:        { alignSelf: 'center', marginTop: 20 },
  startOverText:    { fontSize: 14, color: 'rgba(1,12,53,0.5)', fontWeight: '500' },
})
```

- [ ] **Step 5: Run tests in a real terminal — expect them to pass**

```bash
cd apps/customer-app && npm test -- --testPathPattern=DeleteAccountFlow
```

Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/components/SupportLegalSection.tsx apps/customer-app/src/features/profile/components/DeleteAccountFlow.tsx apps/customer-app/src/features/profile/__tests__/DeleteAccountFlow.test.tsx
git commit -m "feat(profile): add SupportLegalSection + DeleteAccountFlow (3-stage OTP deletion)"
```

---

## Task 21: ProfileScreen — compose all sections

**Files:**
- Create: `apps/customer-app/src/features/profile/screens/ProfileScreen.tsx`
- Modify: `apps/customer-app/app/(app)/profile.tsx`

- [ ] **Step 1: Create ProfileScreen**

Create `src/features/profile/screens/ProfileScreen.tsx`:

```typescript
import React, { useState, useRef, useCallback } from 'react'
import {
  ScrollView, View, Text, Pressable, StyleSheet, Alert
} from 'react-native'
import * as ImagePicker from 'expo-image-picker'
import { useQueryClient } from '@tanstack/react-query'
import { router } from 'expo-router'
import { ProfileHeader } from '../components/ProfileHeader'
import { ProfileSectionCard } from '../components/ProfileSectionCard'
import { ProfileRow } from '../components/ProfileRow'
import { PersonalInfoSheet } from '../components/PersonalInfoSheet'
import { AddressSheet } from '../components/AddressSheet'
import { InterestsSheet } from '../components/InterestsSheet'
import { ChangePasswordSheet } from '../components/ChangePasswordSheet'
import { SubscriptionManagementSheet } from '../components/SubscriptionManagementSheet'
import { NotificationsSection } from '../components/NotificationsSection'
import { AppSettingsSection } from '../components/AppSettingsSection'
import { RedeemoSection } from '../components/RedeemoSection'
import { GetHelpModal } from '../components/GetHelpModal'
import { SupportLegalSection } from '../components/SupportLegalSection'
import { DeleteAccountFlow } from '../components/DeleteAccountFlow'
import { useMe } from '@/features/profile-completion/hooks/useMe'
import { useSubscription } from '@/features/subscription/hooks/useSubscription'
import { useUpdateAvatar } from '@/features/profile-completion/hooks/useUpdateAvatar'
import { useAuthStore } from '@/stores/auth'
import { prefsStorage } from '@/lib/storage'
import type { SupportTopic } from '@/lib/constants/supportTopics'

type SheetName =
  | 'personal-info' | 'address' | 'interests' | 'change-password'
  | 'subscription' | 'delete-account' | null

export function ProfileScreen() {
  const { data: profile, isLoading: profileLoading } = useMe()
  const { data: subscription } = useSubscription()
  const { mutate: updateAvatar, isPending: avatarUploading } = useUpdateAvatar()
  const queryClient = useQueryClient()
  const signOut     = useAuthStore(s => s.signOut)

  const [openSheet, setOpenSheet]   = useState<SheetName>(null)
  const [helpVisible, setHelpVisible] = useState(false)
  const [helpTopic, setHelpTopic]   = useState<SupportTopic | undefined>()
  const [helpMessage, setHelpMessage] = useState<string | undefined>()

  // Device name for active session display
  const [deviceName, setDeviceName] = React.useState<string | null>(null)
  React.useEffect(() => {
    prefsStorage.get<string>('redeemo:deviceName').then(setDeviceName)
  }, [])

  const handleAvatarPress = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync()
    if (status !== 'granted') return
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true, aspect: [1, 1], quality: 0.85, base64: true,
    })
    if (result.canceled || !result.assets[0]) return
    const asset = result.assets[0]
    if (!asset.base64) return
    // Enforce 3 MB limit
    const sizeBytes = (asset.base64.length * 3) / 4
    if (sizeBytes > 3 * 1024 * 1024) {
      Alert.alert('Image too large', 'Please choose an image under 3 MB.')
      return
    }
    const mimeType = asset.mimeType ?? 'image/jpeg'
    updateAvatar({ profileImageUrl: `data:${mimeType};base64,${asset.base64}` })
  }

  const openGetHelp = (topic?: SupportTopic, message?: string) => {
    setHelpTopic(topic)
    setHelpMessage(message)
    setHelpVisible(true)
  }

  const handleSignOut = async () => {
    queryClient.clear()
    await signOut()
    router.replace('/(auth)/login')
  }

  const sub = subscription?.data ?? null

  // Build interest preview
  const interestPreview = React.useMemo(() => {
    if (!profile?.interests?.length) return undefined
    const names = profile.interests.map((i: any) => i.name)
    if (names.length <= 2) return names.join(', ')
    return `${names[0]}, ${names[1]} +${names.length - 2}`
  }, [profile?.interests])

  if (profileLoading || !profile) return null

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {/* Header card */}
      <ProfileHeader
        profile={profile}
        subscription={sub as any}
        onAvatarPress={handleAvatarPress}
        uploading={avatarUploading}
      />

      {/* MY ACCOUNT */}
      <ProfileSectionCard title="My Account">
        <ProfileRow
          label="Personal info"
          isFirst
          preview={[profile.firstName, profile.gender].filter(Boolean).join(' · ') || undefined}
          onPress={() => setOpenSheet('personal-info')}
        />
        <ProfileRow
          label="Address"
          preview={[profile.city, profile.postcode].filter(Boolean).join(', ') || undefined}
          onPress={() => setOpenSheet('address')}
        />
        <ProfileRow
          label="Interests"
          preview={interestPreview}
          onPress={() => setOpenSheet('interests')}
        />
        <ProfileRow
          label="Change password"
          onPress={() => setOpenSheet('change-password')}
        />
        <ProfileRow
          label="Active session"
          preview={deviceName ? `Signed in on ${deviceName}` : 'Signed in on this device'}
          disabled
          isFirst={false}
        />
      </ProfileSectionCard>

      {/* SUBSCRIPTION */}
      <ProfileSectionCard title="Subscription">
        {sub ? (
          <>
            <ProfileRow
              label={`${sub.plan?.name ?? 'Redeemo'} · £${sub.price?.toFixed(2)}/mo`}
              isFirst
              preview={sub.cancelAtPeriodEnd
                ? `Access until ${new Date(sub.renewsAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                : `Renews ${new Date(sub.renewsAt!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
              }
              onPress={() => setOpenSheet('subscription')}
            />
          </>
        ) : (
          <ProfileRow
            label="No active plan"
            isFirst
            preview="Subscribe to redeem vouchers"
            onPress={() => router.push('/(app)/subscribe-prompt')}
          />
        )}
        <ProfileRow
          label="Payment method"
          rightContent={
            <View style={styles.comingSoonPill}>
              <Text style={styles.comingSoonText}>Coming soon</Text>
            </View>
          }
          disabled
        />
      </ProfileSectionCard>

      {/* NOTIFICATIONS */}
      <NotificationsSection
        newsletterConsent={profile.newsletterConsent ?? false}
        userId={profile.id}
      />

      {/* APP SETTINGS */}
      <AppSettingsSection />

      {/* REDEEMO */}
      <RedeemoSection />

      {/* SUPPORT & LEGAL */}
      <SupportLegalSection onGetHelp={() => openGetHelp()} />

      {/* Sign out / Delete */}
      <ProfileSectionCard title="">
        <ProfileRow
          label="Sign out"
          isFirst
          onPress={() => { void handleSignOut() }}
        />
        <ProfileRow
          label="Delete account"
          destructive
          onPress={() => setOpenSheet('delete-account')}
        />
      </ProfileSectionCard>

      {/* App version */}
      <Text style={styles.version}>Redeemo v1.0.0</Text>

      {/* Sheets */}
      <PersonalInfoSheet
        visible={openSheet === 'personal-info'}
        onDismiss={() => setOpenSheet(null)}
        profile={profile}
        onGetHelp={(topic, message) => { setOpenSheet(null); openGetHelp(topic as SupportTopic, message) }}
      />
      <AddressSheet
        visible={openSheet === 'address'}
        onDismiss={() => setOpenSheet(null)}
        profile={profile}
      />
      <InterestsSheet
        visible={openSheet === 'interests'}
        onDismiss={() => setOpenSheet(null)}
        selectedIds={(profile.interests ?? []).map((i: any) => i.id)}
      />
      <ChangePasswordSheet
        visible={openSheet === 'change-password'}
        onDismiss={() => setOpenSheet(null)}
        onSuccess={() => {}}
      />
      <SubscriptionManagementSheet
        visible={openSheet === 'subscription'}
        onDismiss={() => setOpenSheet(null)}
        subscription={sub as any}
      />
      <DeleteAccountFlow
        visible={openSheet === 'delete-account'}
        onDismiss={() => setOpenSheet(null)}
      />
      <GetHelpModal
        visible={helpVisible}
        onDismiss={() => { setHelpVisible(false); setHelpTopic(undefined); setHelpMessage(undefined) }}
        initialTopic={helpTopic}
        initialMessage={helpMessage}
      />
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  screen:         { flex: 1, backgroundColor: '#FAF8F5' },
  content:        { padding: 16, paddingBottom: 40 },
  comingSoonPill: { backgroundColor: '#F3F4F6', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 3 },
  comingSoonText: { fontSize: 10, color: '#9CA3AF', fontWeight: '500' },
  version:        { fontSize: 12, color: 'rgba(1,12,53,0.35)', textAlign: 'center', marginTop: 8, marginBottom: 16 },
})
```

- [ ] **Step 2: Wire into app route**

Replace the contents of `app/(app)/profile.tsx`:

```typescript
import { ProfileScreen } from '@/features/profile/screens/ProfileScreen'
export default ProfileScreen
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd apps/customer-app
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run the full frontend test suite in a real terminal**

```bash
cd apps/customer-app && npm test
```

Expected: All existing tests pass + new tests pass. Note the new count.

- [ ] **Step 5: Run the full backend test suite**

```bash
cd .worktrees/customer-app
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/profile/screens/ProfileScreen.tsx apps/customer-app/app/(app)/profile.tsx
git commit -m "feat(profile): compose ProfileScreen from all sections, wire into app tab"
```

---

## Task 22: Verify, clean up, final commit

- [ ] **Step 1: Run full backend test suite and confirm count**

```bash
cd .worktrees/customer-app
npx vitest run
```

Expected: All tests pass. Count should be higher than the pre-task baseline (264 backend tests before this phase).

- [ ] **Step 2: TypeScript clean**

```bash
cd .worktrees/customer-app
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Run frontend tests in a real terminal**

```bash
cd .worktrees/customer-app/apps/customer-app
npm test
```

Expected: All tests pass. Count higher than the 268 pre-task baseline.

- [ ] **Step 4: Manual smoke test — navigate to Profile tab in the app**

Start the dev server and open the app in Expo Go or simulator:

```bash
cd .worktrees/customer-app/apps/customer-app
npx expo start
```

Verify:
- Profile tab renders without crash
- Header shows name, completeness bar, ACTIVE badge (if subscribed)
- All section cards render
- MY ACCOUNT rows open correct sheets
- Email newsletter toggle responds
- Push notifications stub is non-interactive (no permission request)
- Haptics toggle persists after app restart
- Reduce motion toggle reflects OS setting
- Location access row shows correct status and opens Settings
- Become a merchant opens browser
- Request a merchant sheet submits successfully
- Get Help modal opens, shows ticket list
- New ticket form validates and submits
- Sign out clears state and navigates to login

- [ ] **Step 5: Final commit if any clean-up needed**

```bash
git add -p  # review any remaining changes
git commit -m "chore(profile): final clean-up after Profile tab implementation"
```

---

## Appendix: Hooks that must already exist

These are called in the components above. If any are missing, implement them as a short mutation wrapper following the `useUpdateProfile` pattern:

| Hook | Expected location |
|------|------------------|
| `useMe()` | `src/features/profile-completion/hooks/useMe.ts` |
| `useUpdateProfile()` | `src/features/profile-completion/hooks/useUpdateProfile.ts` |
| `useUpdateAvatar()` | `src/features/profile-completion/hooks/useUpdateAvatar.ts` |
| `useUpdateInterests()` | `src/features/profile-completion/hooks/useUpdateInterests.ts` |
| `useAvailableInterests()` | `src/features/profile-completion/hooks/useAvailableInterests.ts` |
| `useSubscription()` | `src/features/subscription/hooks/useSubscription.ts` |
| `useToast()` | `src/design-system/Toast.tsx` |

If any hook returns `.data` with a different shape than assumed here, adjust the destructuring in ProfileScreen accordingly.
