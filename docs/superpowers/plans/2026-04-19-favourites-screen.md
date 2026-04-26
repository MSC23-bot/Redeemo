# Favourites Screen Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Favourites tab in the customer app — two-tab screen (Merchants / Vouchers) with swipe-to-remove, undo toast, and smart sorting, backed by enriched favourites API endpoints.

**Architecture:** Backend-first: enrich the existing `listFavouriteMerchants` and `listFavouriteVouchers` service functions to return all fields the cards need (ratings, isOpen, voucherCount, isRedeemedInCurrentCycle, etc.), include unavailable items with a status flag, and add pagination. Frontend: React Native feature module under `apps/customer-app/src/features/favourites/`, using React Query infinite queries, `react-native-gesture-handler` Swipeable for swipe-to-remove, Reanimated for entrance animations, and the design-system Toast for undo feedback.

**Tech Stack:** Node.js/Fastify/Prisma 7 (backend), React Native/Expo SDK 54, expo-router v4, @tanstack/react-query, react-native-gesture-handler ~2.28.0, react-native-reanimated ~3.16.0, expo-linear-gradient, lucide-react-native

**All work targets:** `.worktrees/customer-app/` (branch: `feature/customer-app`)

---

## File Map

### Backend (relative to `.worktrees/customer-app/`)
| Action | File |
|--------|------|
| Modify | `src/api/customer/favourites/service.ts` |
| Modify | `src/api/customer/favourites/routes.ts` |
| Modify | `tests/api/customer/favourites.routes.test.ts` |

### Frontend (relative to `.worktrees/customer-app/apps/customer-app/`)
| Action | File |
|--------|------|
| Create | `src/lib/api/favourites.ts` |
| Create | `src/features/favourites/hooks/useFavouriteMerchants.ts` |
| Create | `src/features/favourites/hooks/useFavouriteVouchers.ts` |
| Create | `src/features/favourites/hooks/useRemoveFavourite.ts` |
| Create | `src/features/favourites/components/FavouritesHeader.tsx` |
| Create | `src/features/favourites/components/FavouritesTabSwitcher.tsx` |
| Create | `src/features/favourites/components/MerchantFavCard.tsx` |
| Create | `src/features/favourites/components/VoucherFavCard.tsx` |
| Create | `src/features/favourites/components/SwipeToRemove.tsx` |
| Create | `src/features/favourites/components/NudgeBanner.tsx` |
| Create | `src/features/favourites/components/FavouritesEmptyState.tsx` |
| Create | `src/features/favourites/components/FavouritesSkeleton.tsx` |
| Create | `src/features/favourites/screens/FavouritesScreen.tsx` |
| Modify | `app/(app)/favourite.tsx` |

---

## Task 1: Enrich `listFavouriteMerchants`

**Files:**
- Modify: `src/api/customer/favourites/service.ts`

This task replaces the minimal merchant list with a fully-enriched response: banner, branches (for isOpen + location label), ratings, voucher count, max saving, and pagination. Unavailable (suspended) merchants are included with their status.

- [ ] **Step 1: Write the failing test first**

Add to `tests/api/customer/favourites.routes.test.ts`, inside the existing `describe` block:

```ts
it('GET /api/v1/customer/favourites/merchants returns enriched paginated response', async () => {
  const enrichedMerchant = {
    id: 'merchant-1',
    businessName: 'Pizza Palace',
    tradingName: null,
    logoUrl: 'https://cdn.example.com/logo.jpg',
    bannerUrl: 'https://cdn.example.com/banner.jpg',
    status: 'ACTIVE',
    primaryCategory: { id: 'cat-1', name: 'Food & Drink' },
    voucherCount: 3,
    maxEstimatedSaving: 15.00,
    avgRating: 4.5,
    reviewCount: 22,
    isOpen: true,
    branch: { id: 'b1', name: 'Central', addressLine1: '1 High St', latitude: 51.5, longitude: -0.1 },
    favouritedAt: '2026-04-01T10:00:00.000Z',
  }
  ;(listFavouriteMerchants as any).mockResolvedValue({ items: [enrichedMerchant], total: 1, page: 1, limit: 20 })
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/customer/favourites/merchants?page=1&limit=20',
    headers: { authorization: `Bearer ${customerToken}` },
  })
  expect(res.statusCode).toBe(200)
  const body = JSON.parse(res.body)
  expect(body.items).toHaveLength(1)
  expect(body.total).toBe(1)
  expect(body.items[0].bannerUrl).toBe('https://cdn.example.com/banner.jpg')
  expect(body.items[0].isOpen).toBe(true)
  expect(body.items[0].voucherCount).toBe(3)
})

it('GET /api/v1/customer/favourites/merchants uses default page=1 limit=20', async () => {
  ;(listFavouriteMerchants as any).mockResolvedValue({ items: [], total: 0, page: 1, limit: 20 })
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/customer/favourites/merchants',
    headers: { authorization: `Bearer ${customerToken}` },
  })
  expect(res.statusCode).toBe(200)
  const body = JSON.parse(res.body)
  expect(body.page).toBe(1)
  expect(body.limit).toBe(20)
})
```

Also update the existing `GET /merchants returns 200 with list` test to match new shape:
```ts
// Change this line:
;(listFavouriteMerchants as any).mockResolvedValue([{ id: 'merchant-1', businessName: 'Acme' }])
// To:
;(listFavouriteMerchants as any).mockResolvedValue({ items: [{ id: 'merchant-1', businessName: 'Acme' }], total: 1, page: 1, limit: 20 })
// Change assertion:
expect(JSON.parse(res.body)).toHaveLength(1)
// To:
expect(JSON.parse(res.body).items).toHaveLength(1)
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd .worktrees/customer-app
npx vitest run tests/api/customer/favourites.routes.test.ts 2>&1 | tail -20
```

Expected: tests fail because `listFavouriteMerchants` still returns an array (not `{ items, total, page, limit }`).

- [ ] **Step 3: Update the route to accept page/limit params**

Replace `src/api/customer/favourites/routes.ts` `GET /merchants` handler:

```ts
import { z } from 'zod'
// Add at top of file, near other schemas:
const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})
```

Replace the GET merchants route handler:
```ts
app.get(`${base}/merchants`, async (req: FastifyRequest, reply) => {
  const { page, limit } = paginationSchema.parse(req.query)
  const result = await listFavouriteMerchants(app.prisma, req.user.sub, { page, limit })
  return reply.send(result)
})
```

Replace the GET vouchers route handler similarly:
```ts
app.get(`${base}/vouchers`, async (req: FastifyRequest, reply) => {
  const { page, limit } = paginationSchema.parse(req.query)
  const result = await listFavouriteVouchers(app.prisma, req.user.sub, { page, limit })
  return reply.send(result)
})
```

The full updated `routes.ts`:

```ts
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  addFavouriteMerchant, removeFavouriteMerchant, listFavouriteMerchants,
  addFavouriteVoucher,  removeFavouriteVoucher,  listFavouriteVouchers,
} from './service'

const merchantIdParam = z.object({ merchantId: z.string().min(1) })
const voucherIdParam  = z.object({ voucherId: z.string().min(1) })
const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export async function favouritesRoutes(app: FastifyInstance) {
  const base = '/api/v1/customer/favourites'

  app.post(`${base}/merchants/:merchantId`, async (req: FastifyRequest, reply) => {
    const { merchantId } = merchantIdParam.parse(req.params)
    const result = await addFavouriteMerchant(app.prisma, req.user.sub, merchantId)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/merchants/:merchantId`, async (req: FastifyRequest, reply) => {
    const { merchantId } = merchantIdParam.parse(req.params)
    const result = await removeFavouriteMerchant(app.prisma, req.user.sub, merchantId)
    return reply.send(result)
  })

  app.get(`${base}/merchants`, async (req: FastifyRequest, reply) => {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await listFavouriteMerchants(app.prisma, req.user.sub, { page, limit })
    return reply.send(result)
  })

  app.post(`${base}/vouchers/:voucherId`, async (req: FastifyRequest, reply) => {
    const { voucherId } = voucherIdParam.parse(req.params)
    const result = await addFavouriteVoucher(app.prisma, req.user.sub, voucherId)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/vouchers/:voucherId`, async (req: FastifyRequest, reply) => {
    const { voucherId } = voucherIdParam.parse(req.params)
    const result = await removeFavouriteVoucher(app.prisma, req.user.sub, voucherId)
    return reply.send(result)
  })

  app.get(`${base}/vouchers`, async (req: FastifyRequest, reply) => {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await listFavouriteVouchers(app.prisma, req.user.sub, { page, limit })
    return reply.send(result)
  })
}
```

- [ ] **Step 4: Rewrite `listFavouriteMerchants` in service.ts**

Replace the function with the enriched version. Key changes vs current:
- No `merchant: { status: MerchantStatus.ACTIVE }` where-filter → includes suspended merchants
- Fetch branches with `openingHours` → compute `isOpen` per merchant
- Fetch all active+approved vouchers → compute `voucherCount` and `maxEstimatedSaving`
- Compute `avgRating` / `reviewCount` via branch `groupBy` on `Review` (same pattern as discovery service)
- Return `{ items, total, page, limit }` with pagination
- Sort: open first, suspended last, within each group by `favouritedAt` desc

```ts
import {
  PrismaClient, Prisma, MerchantStatus, VoucherStatus, ApprovalStatus,
} from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { isOpenNow } from '../../shared/isOpenNow'
import { getCurrentCycleWindow } from '../../subscription/cycle'

export async function listFavouriteMerchants(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit

  const [rows, total] = await Promise.all([
    prisma.favouriteMerchant.findMany({
      where: { userId },
      select: {
        createdAt: true,
        merchant: {
          select: {
            id: true, businessName: true, tradingName: true,
            logoUrl: true, bannerUrl: true, status: true,
            primaryCategory: { select: { id: true, name: true } },
            vouchers: {
              where: { status: VoucherStatus.ACTIVE, approvalStatus: ApprovalStatus.APPROVED },
              select: { estimatedSaving: true },
            },
            branches: {
              where: { isActive: true },
              orderBy: { isMainBranch: 'desc' },
              take: 1,
              select: {
                id: true, name: true, addressLine1: true,
                latitude: true, longitude: true, isMainBranch: true,
                openingHours: {
                  select: { dayOfWeek: true, openTime: true, closeTime: true, isClosed: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.favouriteMerchant.count({ where: { userId } }),
  ])

  // Compute ratings via branch groupBy (same pattern as discovery service)
  const branchIds = rows.flatMap(r => r.merchant.branches.map(b => b.id))
  const ratingGroups = branchIds.length > 0
    ? await prisma.review.groupBy({
        by: ['branchId'],
        where: { branchId: { in: branchIds }, isHidden: false },
        _avg: { rating: true },
        _count: { id: true },
      })
    : []
  const ratingByBranch = Object.fromEntries(
    ratingGroups.map((g: any) => [g.branchId, { avg: g._avg.rating ?? 0, count: g._count.id }]),
  )

  const enriched = rows.map(r => {
    const m = r.merchant
    const branch = m.branches[0] ?? null
    const isOpen = branch ? isOpenNow(branch.openingHours as any) : false
    const activeVouchers = m.vouchers
    const voucherCount = activeVouchers.length
    const maxEstimatedSaving = activeVouchers.length > 0
      ? Math.max(...activeVouchers.map(v => Number(v.estimatedSaving)))
      : 0

    // Aggregate rating across the nearest/main branch
    let totalRating = 0; let totalCount = 0
    for (const b of m.branches) {
      const r = ratingByBranch[b.id]
      if (r) { totalRating += r.avg * r.count; totalCount += r.count }
    }
    const avgRating   = totalCount > 0 ? Math.round((totalRating / totalCount) * 10) / 10 : null
    const reviewCount = totalCount

    const isUnavailable = m.status !== MerchantStatus.ACTIVE
    return {
      id: m.id,
      businessName: m.businessName,
      tradingName:  m.tradingName,
      logoUrl:      m.logoUrl,
      bannerUrl:    m.bannerUrl,
      status:       m.status,
      primaryCategory: m.primaryCategory,
      voucherCount,
      maxEstimatedSaving,
      avgRating,
      reviewCount,
      isOpen: isUnavailable ? false : isOpen,
      branch: branch ? {
        id:          branch.id,
        name:        branch.name,
        addressLine1: branch.addressLine1,
        latitude:    branch.latitude ? Number(branch.latitude) : null,
        longitude:   branch.longitude ? Number(branch.longitude) : null,
      } : null,
      favouritedAt: r.createdAt,
      isUnavailable,
    }
  })

  // Sort: open first, closed second, unavailable last; within group by favouritedAt desc
  const sorted = enriched.sort((a, b) => {
    if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1
    if (a.isOpen !== b.isOpen) return a.isOpen ? -1 : 1
    return 0 // already ordered by favouritedAt desc from DB query
  })

  const items = sorted.slice(skip, skip + limit)

  return { items, total, page, limit }
}
```

- [ ] **Step 5: Run tests and confirm they pass**

```bash
cd .worktrees/customer-app
npx vitest run tests/api/customer/favourites.routes.test.ts 2>&1 | tail -20
```

Expected: all tests in the file pass.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/customer-app
git add src/api/customer/favourites/service.ts src/api/customer/favourites/routes.ts tests/api/customer/favourites.routes.test.ts
git commit -m "feat(favourites): enrich listFavouriteMerchants with ratings, isOpen, pagination"
```

---

## Task 2: Enrich `listFavouriteVouchers`

**Files:**
- Modify: `src/api/customer/favourites/service.ts`
- Modify: `tests/api/customer/favourites.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/api/customer/favourites.routes.test.ts`:

```ts
it('GET /api/v1/customer/favourites/vouchers returns enriched paginated response', async () => {
  const enrichedVoucher = {
    id: 'v1',
    title: 'Buy 1 Get 1 Free Pizza',
    type: 'BOGO',
    description: 'Valid on any pizza over 10 inches',
    estimatedSaving: 12.00,
    status: 'ACTIVE',
    approvalStatus: 'APPROVED',
    expiresAt: null,
    isRedeemedInCurrentCycle: false,
    merchant: { id: 'm1', businessName: 'Pizza Palace', logoUrl: null, status: 'ACTIVE' },
    favouritedAt: '2026-04-01T10:00:00.000Z',
    isUnavailable: false,
  }
  ;(listFavouriteVouchers as any).mockResolvedValue({ items: [enrichedVoucher], total: 1, page: 1, limit: 20 })
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/customer/favourites/vouchers?page=1&limit=20',
    headers: { authorization: `Bearer ${customerToken}` },
  })
  expect(res.statusCode).toBe(200)
  const body = JSON.parse(res.body)
  expect(body.items).toHaveLength(1)
  expect(body.items[0].isRedeemedInCurrentCycle).toBe(false)
  expect(body.items[0].description).toBe('Valid on any pizza over 10 inches')
  expect(body.total).toBe(1)
})
```

Also update the existing `GET /vouchers returns 200` test to match new shape:
```ts
// Change:
;(listFavouriteVouchers as any).mockResolvedValue([{ id: 'v1', title: 'Free coffee' }])
// To:
;(listFavouriteVouchers as any).mockResolvedValue({ items: [{ id: 'v1', title: 'Free coffee' }], total: 1, page: 1, limit: 20 })
// Change assertion:
expect(JSON.parse(res.body)).toHaveLength(1)
// To:
expect(JSON.parse(res.body).items).toHaveLength(1)
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd .worktrees/customer-app
npx vitest run tests/api/customer/favourites.routes.test.ts 2>&1 | tail -20
```

Expected: the new test fails (function still returns old shape).

- [ ] **Step 3: Rewrite `listFavouriteVouchers` in service.ts**

Replace the function. Key changes vs current:
- Remove the `status: VoucherStatus.ACTIVE` and `approvalStatus: ApprovalStatus.APPROVED` and `merchant: { status: MerchantStatus.ACTIVE }` where-filters → includes inactive/suspended items
- Add `description`, `expiryDate` to select
- Add `isRedeemedInCurrentCycle` computed from `UserVoucherCycleState` (requires user's subscription cycleAnchorDate)
- Return `{ items, total, page, limit }` with pagination
- Sort: available first, unavailable last; within each group by favouritedAt desc

```ts
export async function listFavouriteVouchers(
  prisma: PrismaClient,
  userId: string,
  opts: { page: number; limit: number },
) {
  const { page, limit } = opts
  const skip = (page - 1) * limit

  // Fetch subscription to compute current cycle window for isRedeemedInCurrentCycle
  const subscription = await prisma.subscription.findUnique({
    where: { userId },
    select: { cycleAnchorDate: true },
  })
  let cycleStart: Date | null = null
  if (subscription?.cycleAnchorDate) {
    const window = getCurrentCycleWindow(subscription.cycleAnchorDate)
    cycleStart = window.cycleStart
  }

  const [rows, total] = await Promise.all([
    prisma.favouriteVoucher.findMany({
      where: { userId },
      select: {
        createdAt: true,
        voucher: {
          select: {
            id: true, title: true, type: true, estimatedSaving: true,
            description: true, expiryDate: true,
            status: true, approvalStatus: true,
            merchant: {
              select: { id: true, businessName: true, logoUrl: true, status: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.favouriteVoucher.count({ where: { userId } }),
  ])

  // Batch-fetch cycle states for all voucher IDs in this user's current cycle
  const voucherIds = rows.map(r => r.voucher.id)
  const cycleStates = cycleStart && voucherIds.length > 0
    ? await prisma.userVoucherCycleState.findMany({
        where: {
          userId,
          voucherId: { in: voucherIds },
          cycleStartDate: cycleStart,
          isRedeemedInCurrentCycle: true,
        },
        select: { voucherId: true },
      })
    : []
  const redeemedSet = new Set(cycleStates.map(s => s.voucherId))

  const enriched = rows.map(r => {
    const v = r.voucher
    const voucherActive   = v.status === VoucherStatus.ACTIVE && v.approvalStatus === ApprovalStatus.APPROVED
    const merchantActive  = v.merchant.status === MerchantStatus.ACTIVE
    const isUnavailable   = !voucherActive || !merchantActive
    return {
      id:               v.id,
      title:            v.title,
      type:             v.type,
      estimatedSaving:  Number(v.estimatedSaving),
      description:      v.description ?? null,
      expiresAt:        v.expiryDate ?? null,
      status:           v.status,
      approvalStatus:   v.approvalStatus,
      isRedeemedInCurrentCycle: redeemedSet.has(v.id),
      merchant:         v.merchant,
      favouritedAt:     r.createdAt,
      isUnavailable,
    }
  })

  // Sort: available first, unavailable last; within group by favouritedAt desc (already ordered)
  const sorted = enriched.sort((a, b) => {
    if (a.isUnavailable !== b.isUnavailable) return a.isUnavailable ? 1 : -1
    return 0
  })

  const items = sorted.slice(skip, skip + limit)

  return { items, total, page, limit }
}
```

- [ ] **Step 4: Run full test suite**

```bash
cd .worktrees/customer-app
npx vitest run tests/api/customer/favourites.routes.test.ts 2>&1 | tail -20
```

Expected: all tests pass.

- [ ] **Step 5: Run full backend test suite to check for regressions**

```bash
cd .worktrees/customer-app
npm test 2>&1 | tail -10
```

Expected: ≥261 tests passing, 0 failing.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/customer-app
git add src/api/customer/favourites/service.ts tests/api/customer/favourites.routes.test.ts
git commit -m "feat(favourites): enrich listFavouriteVouchers with description, expiresAt, isRedeemedInCurrentCycle, pagination"
```

---

## Task 3: Frontend API Client

**Files:**
- Create: `apps/customer-app/src/lib/api/favourites.ts`

- [ ] **Step 1: Create the typed API client**

```ts
// apps/customer-app/src/lib/api/favourites.ts
import { api } from '../api'
import type { VoucherType } from './savings'

export type FavouriteMerchantItem = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  status: string
  primaryCategory: { id: string; name: string } | null
  voucherCount: number
  maxEstimatedSaving: number
  avgRating: number | null
  reviewCount: number
  isOpen: boolean
  branch: {
    id: string
    name: string
    addressLine1: string
    latitude: number | null
    longitude: number | null
  } | null
  favouritedAt: string
  isUnavailable: boolean
}

export type FavouriteVoucherItem = {
  id: string
  title: string
  type: VoucherType
  estimatedSaving: number
  description: string | null
  expiresAt: string | null
  status: string
  approvalStatus: string
  isRedeemedInCurrentCycle: boolean
  merchant: {
    id: string
    businessName: string
    logoUrl: string | null
    status: string
  }
  favouritedAt: string
  isUnavailable: boolean
}

export type FavouriteMerchantsResponse = {
  items: FavouriteMerchantItem[]
  total: number
  page: number
  limit: number
}

export type FavouriteVouchersResponse = {
  items: FavouriteVoucherItem[]
  total: number
  page: number
  limit: number
}

export const favouritesApi = {
  getMerchants(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.page)  qs.set('page',  String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return api.get<FavouriteMerchantsResponse>(
      `/api/v1/customer/favourites/merchants${query ? `?${query}` : ''}`,
    )
  },

  getVouchers(params: { page?: number; limit?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.page)  qs.set('page',  String(params.page))
    if (params.limit) qs.set('limit', String(params.limit))
    const query = qs.toString()
    return api.get<FavouriteVouchersResponse>(
      `/api/v1/customer/favourites/vouchers${query ? `?${query}` : ''}`,
    )
  },

  addMerchant(merchantId: string) {
    return api.post(`/api/v1/customer/favourites/merchants/${merchantId}`, undefined)
  },

  removeMerchant(merchantId: string) {
    return api.del(`/api/v1/customer/favourites/merchants/${merchantId}`)
  },

  addVoucher(voucherId: string) {
    return api.post(`/api/v1/customer/favourites/vouchers/${voucherId}`, undefined)
  },

  removeVoucher(voucherId: string) {
    return api.del(`/api/v1/customer/favourites/vouchers/${voucherId}`)
  },
}
```

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/lib/api/favourites.ts
git commit -m "feat(favourites): add typed API client for favourites endpoints"
```

---

## Task 4: Data Hooks

**Files:**
- Create: `apps/customer-app/src/features/favourites/hooks/useFavouriteMerchants.ts`
- Create: `apps/customer-app/src/features/favourites/hooks/useFavouriteVouchers.ts`

- [ ] **Step 1: Create `useFavouriteMerchants`**

```ts
// apps/customer-app/src/features/favourites/hooks/useFavouriteMerchants.ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useAuthStore } from '@/stores/auth'

const LIMIT = 20

export function useFavouriteMerchants() {
  const status = useAuthStore((s) => s.status)
  return useInfiniteQuery({
    queryKey: ['favouriteMerchants'],
    queryFn: ({ pageParam = 1 }) =>
      favouritesApi.getMerchants({ page: pageParam as number, limit: LIMIT }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const fetched = (lastPage.page - 1) * lastPage.limit + lastPage.items.length
      return fetched < lastPage.total ? lastPage.page + 1 : undefined
    },
    enabled: status === 'authed',
    staleTime: 30_000,
  })
}
```

- [ ] **Step 2: Create `useFavouriteVouchers`**

```ts
// apps/customer-app/src/features/favourites/hooks/useFavouriteVouchers.ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useAuthStore } from '@/stores/auth'

const LIMIT = 20

export function useFavouriteVouchers() {
  const status = useAuthStore((s) => s.status)
  return useInfiniteQuery({
    queryKey: ['favouriteVouchers'],
    queryFn: ({ pageParam = 1 }) =>
      favouritesApi.getVouchers({ page: pageParam as number, limit: LIMIT }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      const fetched = (lastPage.page - 1) * lastPage.limit + lastPage.items.length
      return fetched < lastPage.total ? lastPage.page + 1 : undefined
    },
    enabled: status === 'authed',
    staleTime: 30_000,
  })
}
```

- [ ] **Step 3: Verify TypeScript compiles clean**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/favourites/hooks/useFavouriteMerchants.ts apps/customer-app/src/features/favourites/hooks/useFavouriteVouchers.ts
git commit -m "feat(favourites): add useFavouriteMerchants and useFavouriteVouchers infinite query hooks"
```

---

## Task 5: Remove Favourite Hook (Optimistic + Undo)

**Files:**
- Create: `apps/customer-app/src/features/favourites/hooks/useRemoveFavourite.ts`

This hook handles optimistic removal from the React Query cache, fires the API immediately, shows an undo toast for 4 seconds, and re-adds via API if undo is tapped. On API failure (no undo): shows error toast.

- [ ] **Step 1: Create the hook**

```ts
// apps/customer-app/src/features/favourites/hooks/useRemoveFavourite.ts
import { useCallback, useRef } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { favouritesApi } from '@/lib/api/favourites'
import { useToast } from '@/design-system/motion/Toast'
import { lightHaptic } from '@/design-system/haptics'
import type { FavouriteMerchantItem, FavouriteVoucherItem, FavouriteMerchantsResponse, FavouriteVouchersResponse } from '@/lib/api/favourites'

type RemoveType = 'merchant' | 'voucher'

export function useRemoveFavourite(type: RemoveType) {
  const queryClient = useQueryClient()
  const { show } = useToast()
  const undoCalledRef = useRef(false)

  const remove = useCallback(async (id: string) => {
    const queryKey = type === 'merchant' ? ['favouriteMerchants'] : ['favouriteVouchers']
    undoCalledRef.current = false

    // Snapshot current cache for rollback
    const previous = queryClient.getQueryData(queryKey)

    // Optimistic removal
    queryClient.setQueryData(queryKey, (old: any) => {
      if (!old) return old
      return {
        ...old,
        pages: old.pages.map((page: any) => ({
          ...page,
          items: page.items.filter((item: any) => item.id !== id),
          total: Math.max(0, page.total - 1),
        })),
      }
    })

    lightHaptic()

    // Fire API immediately
    const apiCall = type === 'merchant'
      ? favouritesApi.removeMerchant(id)
      : favouritesApi.removeVoucher(id)

    // Show undo toast — 4 second window
    show(`Removed from favourites — Undo`, 'neutral')

    // Set up undo handler (stored on a ref so the toast button can call it)
    const undo = async () => {
      undoCalledRef.current = true
      // Re-add via POST
      try {
        if (type === 'merchant') {
          await favouritesApi.addMerchant(id)
        } else {
          await favouritesApi.addVoucher(id)
        }
        // Invalidate to refetch fresh data (card reappears)
        queryClient.invalidateQueries({ queryKey })
      } catch {
        show('Couldn\'t undo — please try again', 'danger')
      }
    }

    try {
      await apiCall
    } catch {
      // Only show error if user didn't undo
      if (!undoCalledRef.current) {
        // Rollback
        queryClient.setQueryData(queryKey, previous)
        show('Couldn\'t remove — try again', 'danger')
      }
    }

    return { undo }
  }, [type, queryClient, show])

  return { remove }
}
```

**Note on undo UX:** The `undo` function is returned from `remove()`. The calling component (FavouritesScreen) holds a ref to the latest `undo` and passes it to the UndoToast button. The Toast in the design system auto-dismisses after 3.5 seconds; for the 4-second window the screen renders its own undo-capable toast overlay (see Task 10).

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/favourites/hooks/useRemoveFavourite.ts
git commit -m "feat(favourites): add useRemoveFavourite hook with optimistic update and undo support"
```

---

## Task 6: FavouritesHeader + FavouritesTabSwitcher

**Files:**
- Create: `apps/customer-app/src/features/favourites/components/FavouritesHeader.tsx`
- Create: `apps/customer-app/src/features/favourites/components/FavouritesTabSwitcher.tsx`

- [ ] **Step 1: Create `FavouritesHeader`**

The header is a brand gradient background with a vignette overlay, safe area padding, title, and the tab switcher below it.

```tsx
// apps/customer-app/src/features/favourites/components/FavouritesHeader.tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { FavouritesTabSwitcher } from './FavouritesTabSwitcher'

export type TabId = 'merchants' | 'vouchers'

type Props = {
  activeTab: TabId
  onTabPress: (tab: TabId) => void
  merchantCount: number
  voucherCount: number
}

export function FavouritesHeader({ activeTab, onTabPress, merchantCount, voucherCount }: Props) {
  const insets = useSafeAreaInsets()
  const topPad = Math.max(insets.top, 44)

  return (
    <View>
      <LinearGradient
        colors={['#B80E08', '#D10A03', '#E20C04', '#CC3500', '#C83200']}
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.gradient, { paddingTop: topPad }]}
      >
        {/* Top vignette */}
        <LinearGradient
          colors={['rgba(0,0,0,0.15)', 'transparent']}
          style={styles.vignetteTop}
          pointerEvents="none"
        />
        {/* Bottom vignette */}
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.18)']}
          style={styles.vignetteBottom}
          pointerEvents="none"
        />

        <Text style={styles.title}>Favourites</Text>
      </LinearGradient>

      <FavouritesTabSwitcher
        activeTab={activeTab}
        onTabPress={onTabPress}
        merchantCount={merchantCount}
        voucherCount={voucherCount}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  gradient: {
    paddingBottom: 0,
    paddingHorizontal: 16,
    position: 'relative',
  },
  vignetteTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: '15%',
  },
  vignetteBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '18%',
  },
  title: {
    fontSize: 20,
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    marginTop: 8,
    marginBottom: 16,
  },
})
```

- [ ] **Step 2: Create `FavouritesTabSwitcher`**

Two-tab bar embedded at the bottom of the header. Uses white-on-red colours since header is brand gradient (unlike merchant profile TabBar which uses dark-on-white).

```tsx
// apps/customer-app/src/features/favourites/components/FavouritesTabSwitcher.tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { lightHaptic } from '@/design-system/haptics'
import type { TabId } from './FavouritesHeader'

type Props = {
  activeTab: TabId
  onTabPress: (tab: TabId) => void
  merchantCount: number
  voucherCount: number
}

const TABS: { id: TabId; label: string }[] = [
  { id: 'merchants', label: 'Merchants' },
  { id: 'vouchers',  label: 'Vouchers'  },
]

export function FavouritesTabSwitcher({ activeTab, onTabPress, merchantCount, voucherCount }: Props) {
  const counts: Record<TabId, number> = { merchants: merchantCount, vouchers: voucherCount }
  const activeIndex = TABS.findIndex(t => t.id === activeTab)
  const indicatorX = useSharedValue(activeIndex)

  const handlePress = (tab: TabId) => {
    lightHaptic()
    const idx = TABS.findIndex(t => t.id === tab)
    indicatorX.value = withSpring(idx, { damping: 20, stiffness: 200 })
    onTabPress(tab)
  }

  const indicatorStyle = useAnimatedStyle(() => ({
    // Each tab takes 50% width; indicator is 56% wide within the tab (22% margins per side)
    left: `${indicatorX.value * 50 + 50 * 0.22}%`,
  }))

  return (
    <View style={styles.container}>
      {TABS.map(tab => {
        const isActive = tab.id === activeTab
        const count = counts[tab.id]
        return (
          <Pressable
            key={tab.id}
            onPress={() => handlePress(tab.id)}
            style={styles.tab}
            accessibilityRole="tab"
            accessibilityState={{ selected: isActive }}
            accessibilityLabel={`${tab.label}, ${count} items`}
          >
            <View style={styles.labelRow}>
              <Text style={[styles.label, isActive ? styles.labelActive : styles.labelInactive]}>
                {tab.label}
              </Text>
              <View style={[styles.countBadge, isActive ? styles.countBadgeActive : styles.countBadgeInactive]}>
                <Text style={[styles.countText, { color: isActive ? '#FFFFFF' : 'rgba(255,255,255,0.4)' }]}>
                  {count}
                </Text>
              </View>
            </View>
          </Pressable>
        )
      })}
      {/* Sliding indicator bar */}
      <Animated.View style={[styles.indicator, indicatorStyle]} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
    position: 'relative',
    backgroundColor: 'transparent',
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 12,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  label: {
    fontSize: 12,
    letterSpacing: -0.1,
  },
  labelActive: {
    fontFamily: 'Lato-Bold',
    color: '#FFFFFF',
    fontWeight: '700',
  },
  labelInactive: {
    fontFamily: 'Lato-SemiBold',
    color: 'rgba(255,255,255,0.45)',
    fontWeight: '600',
  },
  countBadge: {
    minWidth: 16,
    height: 15,
    borderRadius: 8,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countBadgeActive: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  countBadgeInactive: {
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  countText: {
    fontSize: 9,
    fontFamily: 'Lato-Bold',
    fontWeight: '800',
  },
  indicator: {
    position: 'absolute',
    bottom: -1,
    width: '56%',
    height: 3,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/favourites/components/FavouritesHeader.tsx apps/customer-app/src/features/favourites/components/FavouritesTabSwitcher.tsx
git commit -m "feat(favourites): add FavouritesHeader and FavouritesTabSwitcher components"
```

---

## Task 7: MerchantFavCard

**Files:**
- Create: `apps/customer-app/src/features/favourites/components/MerchantFavCard.tsx`

Card displays a favourite merchant. Deactivated merchants dim to 0.45 opacity with grey banner fallback and "Unavailable" info line.

- [ ] **Step 1: Create the component**

```tsx
// apps/customer-app/src/features/favourites/components/MerchantFavCard.tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { elevation, radius, color } from '@/design-system/tokens'
import { StarRating } from '@/features/shared/StarRating'
import { VoucherCountPill } from '@/features/shared/VoucherCountPill'
import { SavePill } from '@/features/shared/SavePill'
import { OpenStatusBadge } from '@/features/shared/OpenStatusBadge'
import type { FavouriteMerchantItem } from '@/lib/api/favourites'

type Props = {
  merchant: FavouriteMerchantItem
  onPress: (id: string) => void
  onRemove: (id: string) => void
}

export function MerchantFavCard({ merchant, onPress, onRemove }: Props) {
  const isUnavailable = merchant.isUnavailable

  const infoText = isUnavailable
    ? 'Unavailable'
    : [
        merchant.primaryCategory?.name,
        merchant.branch?.addressLine1 ?? undefined,
      ].filter(Boolean).join(' · ')

  return (
    <PressableScale
      onPress={() => onPress(merchant.id)}
      style={[styles.card, isUnavailable && styles.cardDimmed]}
      accessibilityLabel={
        isUnavailable
          ? `${merchant.businessName}, unavailable`
          : `${merchant.businessName}, ${merchant.primaryCategory?.name ?? ''}, ${merchant.isOpen ? 'open' : 'closed'}`
      }
    >
      {/* Banner */}
      <View style={styles.banner}>
        {!isUnavailable && merchant.bannerUrl ? (
          <View style={[styles.bannerImage, { backgroundColor: '#E5E7EB' }]} />
        ) : (
          <LinearGradient
            colors={isUnavailable ? ['#94A3B8', '#CBD5E1'] : ['#667EEA', '#764BA2']}
            start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
            style={styles.bannerImage}
          />
        )}

        {/* Heart — always red, triggers removal */}
        <Pressable
          onPress={() => onRemove(merchant.id)}
          accessibilityLabel={`Remove ${merchant.businessName} from favourites`}
          accessibilityRole="button"
          style={styles.heartButton}
          hitSlop={8}
        >
          <Heart size={14} color="#E20C04" fill="#E20C04" />
        </Pressable>

        {/* Logo */}
        <View style={styles.logoWrapper}>
          {merchant.logoUrl ? (
            <View style={[styles.logo, { backgroundColor: '#D1D5DB' }]} />
          ) : (
            <View style={[styles.logo, { backgroundColor: color.navy }]}>
              <Text style={styles.logoInitial}>{merchant.businessName.charAt(0)}</Text>
            </View>
          )}
        </View>
      </View>

      {/* Content */}
      <View style={styles.content}>
        <View style={styles.nameRow}>
          <Text style={styles.name} numberOfLines={1}>{merchant.businessName}</Text>
          {!isUnavailable && (
            <StarRating rating={merchant.avgRating} count={merchant.reviewCount} />
          )}
        </View>
        <Text
          style={[styles.info, isUnavailable && styles.infoUnavailable]}
          numberOfLines={1}
        >
          {infoText}
        </Text>
        {!isUnavailable && (
          <View style={styles.pillRow}>
            <VoucherCountPill count={merchant.voucherCount} />
            <SavePill amount={merchant.maxEstimatedSaving} />
            <OpenStatusBadge isOpen={merchant.isOpen} />
          </View>
        )}
        {isUnavailable && (
          <VoucherCountPill count={0} />
        )}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    overflow: 'hidden',
    ...elevation.sm,
  },
  cardDimmed: { opacity: 0.45 },
  banner: { height: 64, position: 'relative' },
  bannerImage: { width: '100%', height: '100%' },
  heartButton: {
    position: 'absolute',
    top: 8, right: 8,
    width: 26, height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  logoWrapper: { position: 'absolute', bottom: -14, left: 12 },
  logo: {
    width: 28, height: 28,
    borderRadius: 8,
    borderWidth: 2, borderColor: '#FFFFFF',
    alignItems: 'center', justifyContent: 'center',
  },
  logoInitial: { fontSize: 12, color: '#FFF', fontFamily: 'Lato-Bold' },
  content: { paddingTop: 18, paddingHorizontal: 12, paddingBottom: 12, gap: 4 },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  name: {
    fontSize: 13, fontFamily: 'Lato-Bold', color: '#010C35',
    flex: 1, marginRight: 4,
  },
  info: { fontSize: 10, color: '#9CA3AF' },
  infoUnavailable: { fontStyle: 'italic' },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 8, flexWrap: 'wrap' },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/favourites/components/MerchantFavCard.tsx
git commit -m "feat(favourites): add MerchantFavCard component with unavailable state treatment"
```

---

## Task 8: VoucherFavCard

**Files:**
- Create: `apps/customer-app/src/features/favourites/components/VoucherFavCard.tsx`

Pastel gradient by voucher type. Unavailable uses neutral grey treatment — no opacity reduction, text stays fully readable.

- [ ] **Step 1: Create the component**

```tsx
// apps/customer-app/src/features/favourites/components/VoucherFavCard.tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { elevation } from '@/design-system/tokens'
import type { FavouriteVoucherItem } from '@/lib/api/favourites'
import type { VoucherType } from '@/lib/api/savings'

type TypeStyle = {
  gradient: readonly [string, string]
  stripe: string
  badgeColor: string
  badgeBg: string
}

const TYPE_STYLES: Record<VoucherType, TypeStyle> = {
  BOGO:            { gradient: ['#F5F3FF', '#EDE9FE'], stripe: '#7C3AED', badgeColor: '#7C3AED', badgeBg: 'rgba(124,58,237,0.08)' },
  DISCOUNT_FIXED:  { gradient: ['#FEF2F2', '#FEE2E2'], stripe: '#E20C04', badgeColor: '#E20C04', badgeBg: 'rgba(226,12,4,0.08)'  },
  DISCOUNT_PERCENT:{ gradient: ['#FEF2F2', '#FEE2E2'], stripe: '#E20C04', badgeColor: '#E20C04', badgeBg: 'rgba(226,12,4,0.08)'  },
  FREEBIE:         { gradient: ['#F0FDF4', '#DCFCE7'], stripe: '#16A34A', badgeColor: '#16A34A', badgeBg: 'rgba(22,163,74,0.08)'  },
  SPEND_AND_SAVE:  { gradient: ['#FFF7ED', '#FFEDD5'], stripe: '#E84A00', badgeColor: '#E84A00', badgeBg: 'rgba(232,74,0,0.08)'   },
  PACKAGE_DEAL:    { gradient: ['#EFF6FF', '#DBEAFE'], stripe: '#2563EB', badgeColor: '#2563EB', badgeBg: 'rgba(37,99,235,0.08)'  },
  TIME_LIMITED:    { gradient: ['#FFFBEB', '#FEF3C7'], stripe: '#D97706', badgeColor: '#D97706', badgeBg: 'rgba(217,119,6,0.08)'  },
  REUSABLE:        { gradient: ['#F0FDFA', '#CCFBF1'], stripe: '#0D9488', badgeColor: '#0D9488', badgeBg: 'rgba(13,148,136,0.08)' },
}

const UNAVAILABLE_STYLE: TypeStyle = {
  gradient: ['#F9FAFB', '#F3F4F6'],
  stripe: '#D1D5DB',
  badgeColor: '#9CA3AF',
  badgeBg: 'transparent',
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BOGO', DISCOUNT_FIXED: 'DISCOUNT', DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE', SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE', TIME_LIMITED: 'TIME LIMITED', REUSABLE: 'REUSABLE',
}

function isWithin30Days(expiresAt: string): boolean {
  const diff = new Date(expiresAt).getTime() - Date.now()
  return diff > 0 && diff < 30 * 24 * 60 * 60 * 1000
}

function formatExpiry(expiresAt: string): string {
  return new Date(expiresAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

type Props = {
  voucher: FavouriteVoucherItem
  onPress: (id: string) => void
  onRemove: (id: string) => void
}

export function VoucherFavCard({ voucher, onPress, onRemove }: Props) {
  const isUnavailable = voucher.isUnavailable
  const ts = isUnavailable ? UNAVAILABLE_STYLE : (TYPE_STYLES[voucher.type] ?? TYPE_STYLES.FREEBIE)
  const showExpiry = !isUnavailable && voucher.expiresAt && isWithin30Days(voucher.expiresAt)

  return (
    <PressableScale
      onPress={() => onPress(voucher.id)}
      style={styles.cardWrapper}
      accessibilityLabel={
        isUnavailable
          ? `${voucher.title} at ${voucher.merchant.businessName}, unavailable`
          : `${voucher.title} at ${voucher.merchant.businessName}, save £${voucher.estimatedSaving}`
      }
    >
      {/* Left stripe */}
      <View style={[styles.stripe, { backgroundColor: ts.stripe }]} />

      <LinearGradient
        colors={ts.gradient as [string, string]}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={styles.card}
      >
        {/* Merchant row */}
        <View style={styles.merchantRow}>
          <View style={[styles.merchantLogo, { backgroundColor: '#D1D5DB' }]} />
          <Text style={styles.merchantName} numberOfLines={1}>
            {voucher.merchant.businessName}
          </Text>
          {/* Heart */}
          <Pressable
            onPress={() => onRemove(voucher.id)}
            accessibilityLabel={`Remove ${voucher.title} from favourites`}
            accessibilityRole="button"
            hitSlop={8}
            style={[styles.heartButton, { backgroundColor: ts.badgeBg || 'rgba(0,0,0,0.04)' }]}
          >
            <Heart size={12} color="#E20C04" fill="#E20C04" />
          </Pressable>
        </View>

        {/* Title */}
        <Text style={styles.title} numberOfLines={1}>{voucher.title}</Text>

        {/* Description */}
        {voucher.description && (
          <Text style={styles.description} numberOfLines={1}>{voucher.description}</Text>
        )}

        {/* Footer */}
        <View style={styles.footer}>
          <View style={styles.footerLeft}>
            {/* Type badge */}
            <View style={[styles.typeBadge, { borderColor: ts.badgeColor }]}>
              <Text style={[styles.typeText, { color: ts.badgeColor }]}>
                {TYPE_LABELS[voucher.type] ?? voucher.type}
              </Text>
            </View>

            {/* Save pill — hidden when unavailable */}
            {!isUnavailable && (
              <View style={[styles.savePill, { backgroundColor: ts.stripe }]}>
                <Text style={styles.saveText}>Save £{voucher.estimatedSaving.toFixed(0)}</Text>
              </View>
            )}
          </View>

          <View style={styles.footerRight}>
            {isUnavailable ? (
              <Text style={styles.unavailableLabel}>Unavailable</Text>
            ) : voucher.isRedeemedInCurrentCycle ? (
              <Text style={styles.redeemedLabel}>Redeemed</Text>
            ) : (
              <View style={styles.redeemRow}>
                {showExpiry && (
                  <Text style={[styles.expiryLabel, { color: '#D97706' }]}>
                    Exp {formatExpiry(voucher.expiresAt!)}
                  </Text>
                )}
                <View style={styles.redeemCta}>
                  <Text style={styles.redeemText}>Redeem</Text>
                  <ChevronRight size={10} color="#E20C04" />
                </View>
              </View>
            )}
          </View>
        </View>
      </LinearGradient>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  cardWrapper: {
    flexDirection: 'row',
    borderRadius: 14,
    overflow: 'hidden',
    ...elevation.sm,
  },
  stripe: { width: 4 },
  card: { flex: 1, padding: 12, gap: 4 },
  merchantRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  merchantLogo: { width: 18, height: 18, borderRadius: 5 },
  merchantName: { flex: 1, fontSize: 10, fontWeight: '600', color: '#6B7280' },
  heartButton: {
    width: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
  },
  title: { fontSize: 13, fontFamily: 'Lato-Bold', color: '#010C35', letterSpacing: -0.2, lineHeight: 17 },
  description: { fontSize: 10, color: '#9CA3AF', lineHeight: 14 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  footerLeft: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  footerRight: { alignItems: 'flex-end' },
  typeBadge: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  typeText: { fontSize: 8, fontWeight: '800', letterSpacing: 0.3, textTransform: 'uppercase' },
  savePill: { borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 },
  saveText: { fontSize: 9, fontWeight: '800', color: '#FFFFFF' },
  redeemRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  redeemCta: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  redeemText: { fontSize: 10, fontWeight: '700', color: '#E20C04' },
  redeemedLabel: { fontSize: 10, fontWeight: '600', color: '#9CA3AF' },
  unavailableLabel: { fontSize: 12, fontStyle: 'italic', color: '#9CA3AF' },
  expiryLabel: { fontSize: 9, fontWeight: '600' },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/favourites/components/VoucherFavCard.tsx
git commit -m "feat(favourites): add VoucherFavCard with type-specific pastel gradients and unavailable treatment"
```

---

## Task 9: SwipeToRemove, NudgeBanner, EmptyState, Skeleton

**Files:**
- Create: `apps/customer-app/src/features/favourites/components/SwipeToRemove.tsx`
- Create: `apps/customer-app/src/features/favourites/components/NudgeBanner.tsx`
- Create: `apps/customer-app/src/features/favourites/components/FavouritesEmptyState.tsx`
- Create: `apps/customer-app/src/features/favourites/components/FavouritesSkeleton.tsx`

- [ ] **Step 1: Create `SwipeToRemove`**

Uses `react-native-gesture-handler` `Swipeable` to reveal a red delete zone on swipe left.

```tsx
// apps/customer-app/src/features/favourites/components/SwipeToRemove.tsx
import React, { useRef } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Swipeable } from 'react-native-gesture-handler'
import { Trash2 } from 'lucide-react-native'
import Animated, {
  useAnimatedStyle, useSharedValue, withTiming, runOnJS,
} from 'react-native-reanimated'

type Props = {
  children: React.ReactNode
  onRemove: () => void
}

export function SwipeToRemove({ children, onRemove }: Props) {
  const swipeRef = useRef<Swipeable>(null)

  const renderRightActions = () => (
    <Pressable
      onPress={() => { swipeRef.current?.close(); onRemove() }}
      style={styles.deleteZone}
      accessibilityLabel="Delete"
      accessibilityRole="button"
    >
      <Trash2 size={18} color="#FFFFFF" />
    </Pressable>
  )

  return (
    <Swipeable
      ref={swipeRef}
      renderRightActions={renderRightActions}
      rightThreshold={80}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') {
          // Swiped open to right — that's a left swipe gesture
          onRemove()
        }
      }}
      friction={2}
      overshootRight={false}
    >
      {children}
    </Swipeable>
  )
}

const styles = StyleSheet.create({
  deleteZone: {
    backgroundColor: '#EF4444',
    width: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopRightRadius: 14,
    borderBottomRightRadius: 14,
  },
})
```

- [ ] **Step 2: Create `NudgeBanner`**

Shown above the first card for free users. Dismissible per session.

```tsx
// apps/customer-app/src/features/favourites/components/NudgeBanner.tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Crown, X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'

type Props = {
  onSubscribe: () => void
  onDismiss: () => void
}

export function NudgeBanner({ onSubscribe, onDismiss }: Props) {
  return (
    <Pressable onPress={onSubscribe} style={styles.wrapper} accessibilityRole="button">
      <LinearGradient
        colors={['rgba(226,12,4,0.06)', 'rgba(232,74,0,0.04)']}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
        style={styles.container}
      >
        <LinearGradient
          colors={['#E20C04', '#E84A00']}
          style={styles.crownCircle}
        >
          <Crown size={14} color="#FFFFFF" />
        </LinearGradient>

        <Text style={styles.text}>
          <Text style={styles.bold}>Subscribe to redeem</Text>
          {' — Unlock all your favourite vouchers from £6.99/mo'}
        </Text>

        <Pressable
          onPress={(e) => { e.stopPropagation(); onDismiss() }}
          hitSlop={12}
          accessibilityLabel="Dismiss"
          style={styles.dismiss}
        >
          <X size={14} color="rgba(156,163,175,0.6)" />
        </Pressable>
      </LinearGradient>
    </Pressable>
  )
}

const styles = StyleSheet.create({
  wrapper: { marginHorizontal: 12, marginTop: 10 },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.10)',
  },
  crownCircle: {
    width: 30, height: 30, borderRadius: 15,
    alignItems: 'center', justifyContent: 'center',
  },
  text: { flex: 1, fontSize: 10.5, color: '#4B5563', lineHeight: 15 },
  bold: { fontFamily: 'Lato-Bold', color: '#010C35' },
  dismiss: { padding: 4 },
})
```

- [ ] **Step 3: Create `FavouritesEmptyState`**

```tsx
// apps/customer-app/src/features/favourites/components/FavouritesEmptyState.tsx
import React, { useEffect } from 'react'
import { View, StyleSheet, Pressable } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Heart } from 'lucide-react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withSequence, withTiming,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'

type Props = { onDiscover: () => void }

export function FavouritesEmptyState({ onDiscover }: Props) {
  const ty = useSharedValue(0)

  useEffect(() => {
    ty.value = withRepeat(
      withSequence(
        withTiming(-5, { duration: 1500 }),
        withTiming(0, { duration: 1500 }),
      ),
      -1,
      true,
    )
  }, [ty])

  const floatStyle = useAnimatedStyle(() => ({ transform: [{ translateY: ty.value }] }))

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.iconCircle, floatStyle]}>
        <Heart size={28} color="#E20C04" strokeWidth={1.5} />
      </Animated.View>
      <Text style={styles.title}>No favourites yet</Text>
      <Text style={styles.body}>
        Tap the heart on any merchant or voucher to save it here for quick access.
      </Text>
      <Pressable onPress={onDiscover} style={styles.ctaWrapper}>
        <LinearGradient
          colors={['#E20C04', '#E84A00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }}
          style={styles.cta}
        >
          <Text style={styles.ctaText}>Discover merchants</Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 300, paddingHorizontal: 32 },
  iconCircle: {
    width: 56, height: 56, borderRadius: 28,
    backgroundColor: 'rgba(226,12,4,0.06)',
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  title: { fontSize: 15, fontFamily: 'Lato-Bold', color: '#010C35', marginBottom: 8 },
  body: { fontSize: 12, color: '#9CA3AF', lineHeight: 18, textAlign: 'center', maxWidth: 220, marginBottom: 24 },
  ctaWrapper: { borderRadius: 100, overflow: 'hidden' },
  cta: {
    paddingHorizontal: 20, paddingVertical: 10,
    shadowColor: '#E20C04', shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 14,
  },
  ctaText: { fontSize: 12, fontFamily: 'Lato-Bold', color: '#FFFFFF' },
})
```

- [ ] **Step 4: Create `FavouritesSkeleton`**

Three shimmer cards to show during initial load.

```tsx
// apps/customer-app/src/features/favourites/components/FavouritesSkeleton.tsx
import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, interpolateColor,
} from 'react-native-reanimated'

function SkeletonBox({ style }: { style?: object }) {
  const progress = useSharedValue(0)
  useEffect(() => {
    progress.value = withRepeat(withTiming(1, { duration: 900 }), -1, true)
  }, [progress])
  const animStyle = useAnimatedStyle(() => ({
    backgroundColor: interpolateColor(progress.value, [0, 1], ['#E5E7EB', '#F3F4F6']),
  }))
  return <Animated.View style={[animStyle, style]} />
}

function SkeletonCard() {
  return (
    <View style={styles.card}>
      <SkeletonBox style={styles.banner} />
      <View style={styles.content}>
        <SkeletonBox style={styles.lineWide} />
        <SkeletonBox style={styles.lineNarrow} />
        <View style={styles.pillRow}>
          <SkeletonBox style={styles.pill} />
          <SkeletonBox style={styles.pill} />
        </View>
      </View>
    </View>
  )
}

export function FavouritesSkeleton() {
  return (
    <View style={styles.container}>
      <SkeletonCard />
      <SkeletonCard />
      <SkeletonCard />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { gap: 12, paddingHorizontal: 12, paddingTop: 14 },
  card: { backgroundColor: '#FFFFFF', borderRadius: 14, overflow: 'hidden' },
  banner: { height: 64, borderRadius: 0 },
  content: { padding: 12, gap: 8 },
  lineWide: { height: 12, borderRadius: 6, width: '60%' },
  lineNarrow: { height: 10, borderRadius: 5, width: '40%' },
  pillRow: { flexDirection: 'row', gap: 6, marginTop: 4 },
  pill: { height: 18, borderRadius: 9, width: 60 },
})
```

- [ ] **Step 5: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 6: Commit**

```bash
cd .worktrees/customer-app
git add \
  apps/customer-app/src/features/favourites/components/SwipeToRemove.tsx \
  apps/customer-app/src/features/favourites/components/NudgeBanner.tsx \
  apps/customer-app/src/features/favourites/components/FavouritesEmptyState.tsx \
  apps/customer-app/src/features/favourites/components/FavouritesSkeleton.tsx
git commit -m "feat(favourites): add SwipeToRemove, NudgeBanner, EmptyState, Skeleton components"
```

---

## Task 10: FavouritesScreen Assembly

**Files:**
- Create: `apps/customer-app/src/features/favourites/screens/FavouritesScreen.tsx`

This is the main screen — FlatList with header, tab switching, undo toast management, and all five user states (loading / error / empty / free / populated).

- [ ] **Step 1: Create the screen**

```tsx
// apps/customer-app/src/features/favourites/screens/FavouritesScreen.tsx
import React, { useState, useMemo, useRef, useCallback } from 'react'
import {
  View, FlatList, RefreshControl, StyleSheet, ActivityIndicator,
  Pressable, Text as RNText,
} from 'react-native'
import { useRouter } from 'expo-router'
import { GestureHandlerRootView } from 'react-native-gesture-handler'
import Animated, {
  useSharedValue, useAnimatedStyle, withTiming, FadeIn, FadeOut,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, spacing } from '@/design-system/tokens'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { useSubscription } from '@/hooks/useSubscription'
import { useFavouriteMerchants } from '../hooks/useFavouriteMerchants'
import { useFavouriteVouchers } from '../hooks/useFavouriteVouchers'
import { useRemoveFavourite } from '../hooks/useRemoveFavourite'
import { FavouritesHeader } from '../components/FavouritesHeader'
import { FavouritesTabSwitcher } from '../components/FavouritesTabSwitcher'
import { MerchantFavCard } from '../components/MerchantFavCard'
import { VoucherFavCard } from '../components/VoucherFavCard'
import { SwipeToRemove } from '../components/SwipeToRemove'
import { NudgeBanner } from '../components/NudgeBanner'
import { FavouritesEmptyState } from '../components/FavouritesEmptyState'
import { FavouritesSkeleton } from '../components/FavouritesSkeleton'
import type { TabId } from '../components/FavouritesHeader'
import type { FavouriteMerchantItem, FavouriteVoucherItem } from '@/lib/api/favourites'

export function FavouritesScreen() {
  const router = useRouter()
  const { isSubscribed, isSubLoading } = useSubscription()
  const [activeTab, setActiveTab] = useState<TabId>('merchants')
  const [nudgeDismissed, setNudgeDismissed] = useState(false)
  const [isRefreshing, setIsRefreshing] = useState(false)

  // Undo toast state
  const [undoVisible, setUndoVisible] = useState(false)
  const [undoMessage, setUndoMessage] = useState('')
  const undoFnRef = useRef<(() => Promise<void>) | null>(null)
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const merchants = useFavouriteMerchants()
  const vouchers  = useFavouriteVouchers()
  const merchantRemove = useRemoveFavourite('merchant')
  const voucherRemove  = useRemoveFavourite('voucher')

  const allMerchants: FavouriteMerchantItem[] = useMemo(
    () => merchants.data?.pages.flatMap(p => p.items) ?? [],
    [merchants.data],
  )
  const allVouchers: FavouriteVoucherItem[] = useMemo(
    () => vouchers.data?.pages.flatMap(p => p.items) ?? [],
    [vouchers.data],
  )

  const merchantTotal = merchants.data?.pages[0]?.total ?? 0
  const voucherTotal  = vouchers.data?.pages[0]?.total ?? 0

  const isLoading = merchants.isLoading || vouchers.isLoading || isSubLoading
  const isError   = merchants.isError || vouchers.isError

  const showUndoToast = useCallback((message: string, undoFn: () => Promise<void>) => {
    if (undoTimer.current) clearTimeout(undoTimer.current)
    setUndoMessage(message)
    setUndoVisible(true)
    undoFnRef.current = undoFn
    undoTimer.current = setTimeout(() => {
      setUndoVisible(false)
      undoFnRef.current = null
    }, 4000)
  }, [])

  const handleRemoveMerchant = useCallback(async (id: string) => {
    const { undo } = await merchantRemove.remove(id)
    showUndoToast('Removed from favourites', undo)
  }, [merchantRemove, showUndoToast])

  const handleRemoveVoucher = useCallback(async (id: string) => {
    const { undo } = await voucherRemove.remove(id)
    showUndoToast('Removed from favourites', undo)
  }, [voucherRemove, showUndoToast])

  const handleUndo = useCallback(async () => {
    setUndoVisible(false)
    if (undoTimer.current) clearTimeout(undoTimer.current)
    if (undoFnRef.current) await undoFnRef.current()
    undoFnRef.current = null
  }, [])

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([merchants.refetch(), vouchers.refetch()])
    setIsRefreshing(false)
  }, [merchants, vouchers])

  const handleLoadMoreMerchants = useCallback(() => {
    if (merchants.hasNextPage && !merchants.isFetchingNextPage) {
      merchants.fetchNextPage()
    }
  }, [merchants])

  const handleLoadMoreVouchers = useCallback(() => {
    if (vouchers.hasNextPage && !vouchers.isFetchingNextPage) {
      vouchers.fetchNextPage()
    }
  }, [vouchers])

  const isMerchantTab = activeTab === 'merchants'
  const items = isMerchantTab ? allMerchants : allVouchers
  const isEmpty = items.length === 0 && !isLoading
  const allLoaded = isMerchantTab
    ? allMerchants.length >= merchantTotal && merchantTotal > 0
    : allVouchers.length >= voucherTotal && voucherTotal > 0

  const ListHeader = (
    <View>
      <FavouritesHeader
        activeTab={activeTab}
        onTabPress={setActiveTab}
        merchantCount={merchantTotal}
        voucherCount={voucherTotal}
      />
      {!isSubscribed && !nudgeDismissed && !isEmpty && (
        <NudgeBanner
          onSubscribe={() => router.push('/(app)/subscribe-prompt')}
          onDismiss={() => setNudgeDismissed(true)}
        />
      )}
    </View>
  )

  if (isLoading) {
    return (
      <GestureHandlerRootView style={styles.root}>
        {ListHeader}
        <FavouritesSkeleton />
      </GestureHandlerRootView>
    )
  }

  if (isError) {
    return (
      <GestureHandlerRootView style={styles.root}>
        {ListHeader}
        <ErrorState
          title="Couldn't load your favourites"
          description="Something went wrong. Please try again."
          onRetry={() => { merchants.refetch(); vouchers.refetch() }}
        />
      </GestureHandlerRootView>
    )
  }

  const renderMerchant = ({ item, index }: { item: FavouriteMerchantItem; index: number }) => (
    <FadeInDown delay={index * 40}>
      <SwipeToRemove onRemove={() => handleRemoveMerchant(item.id)}>
        <MerchantFavCard
          merchant={item}
          onPress={(id) => router.push(`/(app)/merchant/${id}` as any)}
          onRemove={handleRemoveMerchant}
        />
      </SwipeToRemove>
    </FadeInDown>
  )

  const renderVoucher = ({ item, index }: { item: FavouriteVoucherItem; index: number }) => (
    <FadeInDown delay={index * 40}>
      <SwipeToRemove onRemove={() => handleRemoveVoucher(item.id)}>
        <VoucherFavCard
          voucher={item}
          onPress={(id) => router.push(`/(app)/voucher/${id}` as any)}
          onRemove={handleRemoveVoucher}
        />
      </SwipeToRemove>
    </FadeInDown>
  )

  const ListFooter = (
    <View style={styles.footer}>
      {isMerchantTab && merchants.isFetchingNextPage && (
        <ActivityIndicator color={color.brandRose} />
      )}
      {!isMerchantTab && vouchers.isFetchingNextPage && (
        <ActivityIndicator color={color.brandRose} />
      )}
      {allLoaded && (
        <Text style={styles.endLabel}>You're all caught up</Text>
      )}
    </View>
  )

  return (
    <GestureHandlerRootView style={styles.root}>
      <FlatList
        data={items as any[]}
        keyExtractor={(item: any) => item.id}
        renderItem={isMerchantTab ? renderMerchant as any : renderVoucher as any}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={isEmpty ? undefined : ListFooter}
        ListEmptyComponent={
          <FavouritesEmptyState
            onDiscover={() => router.push('/(app)/' as any)}
          />
        }
        contentContainerStyle={styles.listContent}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        onEndReached={isMerchantTab ? handleLoadMoreMerchants : handleLoadMoreVouchers}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={color.brandRose}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Undo Toast */}
      {undoVisible && (
        <Animated.View
          entering={FadeIn.duration(180)}
          exiting={FadeOut.duration(180)}
          style={styles.undoToast}
        >
          <RNText style={styles.undoText}>{undoMessage}</RNText>
          <Pressable onPress={handleUndo} hitSlop={8}>
            <RNText style={styles.undoAction}>Undo</RNText>
          </Pressable>
        </Animated.View>
      )}
    </GestureHandlerRootView>
  )
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#FAFAFA' },
  listContent: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 100 },
  footer: { alignItems: 'center', paddingVertical: 16 },
  endLabel: { fontSize: 12, color: '#9CA3AF' },
  undoToast: {
    position: 'absolute',
    left: spacing[4],
    right: spacing[4],
    bottom: spacing[6],
    backgroundColor: '#010C35',
    borderRadius: 12,
    paddingHorizontal: spacing[4],
    paddingVertical: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 100,
  },
  undoText: { color: '#FFFFFF', fontSize: 14, fontFamily: 'Lato-Regular', flex: 1 },
  undoAction: { color: '#E20C04', fontSize: 14, fontFamily: 'Lato-Bold', marginLeft: 12 },
})
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/src/features/favourites/screens/FavouritesScreen.tsx
git commit -m "feat(favourites): add FavouritesScreen with tab switching, swipe-to-remove, undo toast, all user states"
```

---

## Task 11: Wire Up `favourite.tsx` and Verify

**Files:**
- Modify: `apps/customer-app/app/(app)/favourite.tsx`

Replace the stub with the real screen.

- [ ] **Step 1: Replace stub**

```tsx
// apps/customer-app/app/(app)/favourite.tsx
import React from 'react'
import { FavouritesScreen } from '@/features/favourites/screens/FavouritesScreen'

export default function FavouriteTab() {
  return <FavouritesScreen />
}
```

- [ ] **Step 2: Verify TypeScript compiles clean**

```bash
cd .worktrees/customer-app/apps/customer-app
npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors.

- [ ] **Step 3: Run full backend test suite to confirm no regressions**

```bash
cd .worktrees/customer-app
npm test 2>&1 | tail -10
```

Expected: ≥261 tests passing, 0 failing.

- [ ] **Step 4: Start the API and Expo dev server and verify the Favourites tab manually**

Tab 1 — API:
```bash
cd .worktrees/customer-app
npm run dev
```

Tab 2 — Expo:
```bash
cd .worktrees/customer-app/apps/customer-app
npx expo start
```

Open on iOS/Android simulator. Log in as `customer@redeemo.com` / `Customer1234!`.

Manual checks:
- [ ] Favourites tab is visible and tappable in the bottom tab bar
- [ ] Merchants tab loads and shows merchant cards with banners, logos, ratings, open status
- [ ] Vouchers tab loads and shows voucher cards with correct pastel gradients per type
- [ ] Swipe left on a card reveals red delete zone with trash icon
- [ ] Completing the swipe removes the card and shows undo toast
- [ ] Tapping Undo re-adds the card
- [ ] Tab count badge decrements on removal and re-increments on undo
- [ ] Empty state shows floating heart icon and "Discover merchants" button when no favourites
- [ ] Pull-to-refresh works on both tabs

- [ ] **Step 5: Commit**

```bash
cd .worktrees/customer-app
git add apps/customer-app/app/(app)/favourite.tsx
git commit -m "feat(favourites): wire FavouritesScreen into favourite tab route"
```

---

## Self-Review Notes

Spec coverage verified:
- Section 1 (structure/navigation): ✅ FavouritesHeader + FavouritesTabSwitcher + tab persistence in state
- Section 2 (merchant cards): ✅ MerchantFavCard with all fields, deactivated treatment at 0.45 opacity
- Section 3 (voucher cards): ✅ VoucherFavCard with pastel gradients per type, unavailable neutral treatment
- Section 4 (edge states): ✅ Loading (skeleton), Error (ErrorState), Empty (FavouritesEmptyState), Free user (NudgeBanner)
- Section 5 (interactions): ✅ SwipeToRemove, heart tap removal, undo toast, pull-to-refresh, infinite scroll, tab indicator spring animation
- Section 6 (accessibility): ✅ accessibilityRole, accessibilityLabel, accessibilityState on all interactive elements
- Section 7 (backend dependency): ✅ Tasks 1–2 fully implement the required enrichment and remove active-only filter
- Section 8 (component architecture): ✅ matches spec structure exactly
- Section 9 (design tokens): ✅ tokens used throughout

Spec items handled in backend (not frontend-only):
- isOpen computed server-side from branch openingHours via `isOpenNow()` utility ✅
- avgRating/reviewCount computed via `review.groupBy` same pattern as discovery service ✅
- isRedeemedInCurrentCycle computed from UserVoucherCycleState using getCurrentCycleWindow() ✅
- Unavailable items included in response (ACTIVE filter removed) ✅
- Sorting: open first, suspended last (merchants); available first, unavailable last (vouchers) ✅

Swipe-hint animation (spec Section 5.2 item 8): the first-card swipe hint animation and "Swipe left to remove" text label are low-priority polish items. They are not implemented in this plan to keep scope focused. Add as a follow-up if needed before merge.

Long-press context menu (spec Section 6.2): not implemented in this plan — the SwipeToRemove provides swipe access, heart tap provides a tap-based remove. Add long-press context menu as a follow-up if needed for accessibility hardening.
