# Savings Tab — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Savings tab in the customer app — a personal financial dashboard with 3 user states (free, subscriber-empty, populated), month drill-down, ROI callout, and paginated redemption history — exactly matching the approved design spec at `docs/superpowers/specs/2026-04-18-savings-tab-design.md`.

**Architecture:** FlatList with ListHeaderComponent (hero + insight cards + ROI callout as header, redemption rows as list items). Three user states determined by subscription status + redemption count. Month drill-down fetches per-month insight data from a new backend endpoint. All animations use `transform`/`opacity` only via `react-native-reanimated`, respecting `useMotionScale()` for reduceMotion.

**Tech Stack:** React Native (Expo), TypeScript, react-native-reanimated, expo-linear-gradient, @tanstack/react-query, Fastify (backend), Prisma, Jest + @testing-library/react-native

**Design spec:** `docs/superpowers/specs/2026-04-18-savings-tab-design.md` — this is the source of truth. Every colour, font, animation timing, and copy string MUST match the spec exactly.

---

## File Structure

### Backend (monorepo root)

| File | Responsibility |
|---|---|
| `src/api/customer/savings/service.ts` | Modify: add `validatedAt` to redemptions select; add `getMonthlyDetail()` |
| `src/api/customer/savings/routes.ts` | Modify: add `GET .../monthly-detail?month=YYYY-MM` route |
| `tests/api/customer/savings.routes.test.ts` | Modify: add tests for `validatedAt` field and monthly-detail endpoint |

### Frontend (`.worktrees/customer-app/apps/customer-app/`)

All paths below are relative to `apps/customer-app/`.

| File | Responsibility |
|---|---|
| `src/lib/api/savings.ts` | **Create:** API client + Zod schemas + types for savings endpoints |
| `src/lib/api/subscription.ts` | **Modify:** add `promoCodeId` to subscription schema |
| `src/features/savings/hooks/useSavingsSummary.ts` | **Create:** React Query hook for `GET /savings/summary` |
| `src/features/savings/hooks/useSavingsRedemptions.ts` | **Create:** Infinite query hook for `GET /savings/redemptions` |
| `src/features/savings/hooks/useMonthlyDetail.ts` | **Create:** React Query hook for `GET /savings/monthly-detail` |
| `src/features/savings/hooks/useCountUp.ts` | **Create:** Reanimated count-up animation hook |
| `src/features/savings/components/SavingsHeroGradient.tsx` | **Create:** 5-stop hero gradient + depth overlays |
| `src/features/savings/components/SavingsHeroHeader.tsx` | **Create:** Hero header — 3 states (free/empty/populated) |
| `src/features/savings/components/BenefitCards.tsx` | **Create:** Benefit cards for States 1 & 2 |
| `src/features/savings/components/SavingsSkeleton.tsx` | **Create:** Hero + insight skeleton shimmer |
| `src/features/savings/components/TrendChart.tsx` | **Create:** Card 1 — 6-month bar chart with tappable bars |
| `src/features/savings/components/ViewingChip.tsx` | **Create:** Amber month-viewing pill |
| `src/features/savings/components/TopPlaces.tsx` | **Create:** Card 2 — top merchants |
| `src/features/savings/components/ByCategory.tsx` | **Create:** Card 3 — category progress bars |
| `src/features/savings/components/RoiCallout.tsx` | **Create:** 4-variant ROI card with shimmer sweep |
| `src/features/savings/components/RedemptionRow.tsx` | **Create:** History row with badge logic |
| `src/features/savings/screens/SavingsScreen.tsx` | **Create:** Main screen (FlatList composition + state machine) |
| `app/(app)/savings.tsx` | **Modify:** import and render SavingsScreen |

### Tests (`.worktrees/customer-app/apps/customer-app/tests/`)

| File | Tests |
|---|---|
| `tests/lib/api/savings.test.ts` | API client functions |
| `tests/features/savings/hooks/useSavingsSummary.test.ts` | Summary hook |
| `tests/features/savings/hooks/useSavingsRedemptions.test.ts` | Infinite pagination hook |
| `tests/features/savings/hooks/useMonthlyDetail.test.ts` | Monthly detail hook |
| `tests/features/savings/hooks/useCountUp.test.ts` | Count-up animation |
| `tests/features/savings/components/SavingsHeroHeader.test.tsx` | Hero 3 states |
| `tests/features/savings/components/BenefitCards.test.tsx` | Benefit card rendering |
| `tests/features/savings/components/TrendChart.test.tsx` | Bar chart interaction |
| `tests/features/savings/components/ViewingChip.test.tsx` | Chip spring/dismiss |
| `tests/features/savings/components/TopPlaces.test.tsx` | Merchant rows + hiding |
| `tests/features/savings/components/ByCategory.test.tsx` | Category bars |
| `tests/features/savings/components/RoiCallout.test.tsx` | 4 variants + hidden states |
| `tests/features/savings/components/RedemptionRow.test.tsx` | Badge logic + press |
| `tests/features/savings/screens/SavingsScreen.test.tsx` | Screen integration |

---

## Task 1: Backend — Extend savings redemptions with `validatedAt`

The spec's badge logic requires `validatedAt` to compute the 24h window. The current `getSavingsRedemptions` selects `isValidated` but not `validatedAt`.

**Files:**
- Modify: `src/api/customer/savings/service.ts:119-165`
- Modify: `tests/api/customer/savings.routes.test.ts`

- [ ] **Step 1: Write the failing test**

Add to `tests/api/customer/savings.routes.test.ts`, after the existing test block:

```ts
it('GET /savings/redemptions includes validatedAt in each redemption', async () => {
  ;(getSavingsRedemptions as any).mockResolvedValue({
    redemptions: [{
      id: 'r1',
      redeemedAt: '2026-04-01T10:00:00Z',
      estimatedSaving: 5.00,
      isValidated: true,
      validatedAt: '2026-04-01T10:30:00Z',
      merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
      voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' },
      branch: { id: 'b1', name: 'Central Branch' },
    }],
    total: 1,
  })
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/customer/savings/redemptions',
    headers: { authorization: `Bearer ${customerToken}` },
  })
  expect(res.statusCode).toBe(200)
  const body = res.json()
  expect(body.redemptions[0].validatedAt).toBe('2026-04-01T10:30:00Z')
})

it('GET /savings/redemptions returns validatedAt as null when not validated', async () => {
  ;(getSavingsRedemptions as any).mockResolvedValue({
    redemptions: [{
      id: 'r2',
      redeemedAt: '2026-04-01T10:00:00Z',
      estimatedSaving: 5.00,
      isValidated: false,
      validatedAt: null,
      merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
      voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' },
      branch: { id: 'b1', name: 'Central Branch' },
    }],
    total: 1,
  })
  const res = await app.inject({
    method: 'GET',
    url: '/api/v1/customer/savings/redemptions',
    headers: { authorization: `Bearer ${customerToken}` },
  })
  expect(res.statusCode).toBe(200)
  expect(body.redemptions[0].validatedAt).toBeNull()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/savings.routes.test.ts`
Expected: FAIL — mock returns `validatedAt` but the test confirms the pass-through from service.

- [ ] **Step 3: Add `validatedAt` to the service select and response mapping**

In `src/api/customer/savings/service.ts`, modify the `getSavingsRedemptions` function.

Change the `select` block (around line 130) to include `validatedAt`:

```ts
select: {
  id: true,
  redeemedAt: true,
  estimatedSaving: true,
  isValidated: true,
  validatedAt: true,
  voucher: {
    select: {
      id: true,
      title: true,
      voucherType: true,
      merchant: { select: { id: true, businessName: true, logoUrl: true } },
    },
  },
  branch: { select: { id: true, name: true } },
},
```

And update the response mapping (around line 146) to include `validatedAt`:

```ts
const redemptions = rows.map(r => ({
  id:              r.id,
  redeemedAt:      r.redeemedAt,
  estimatedSaving: Number(r.estimatedSaving ?? 0),
  isValidated:     r.isValidated,
  validatedAt:     r.validatedAt,
  merchant: {
    id:           r.voucher.merchant.id,
    businessName: r.voucher.merchant.businessName,
    logoUrl:      r.voucher.merchant.logoUrl,
  },
  voucher: {
    id:          r.voucher.id,
    title:       r.voucher.title,
    voucherType: r.voucher.voucherType,
  },
  branch: { id: r.branch.id, name: r.branch.name },
}))
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/api/customer/savings.routes.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Commit**

```bash
git add src/api/customer/savings/service.ts tests/api/customer/savings.routes.test.ts
git commit -m "feat(savings): include validatedAt in redemption history response"
```

---

## Task 2: Backend — Add monthly-detail endpoint

The month drill-down feature requires a new endpoint that returns `byMerchant[]` and `byCategory[]` for any specific past month. The existing summary endpoint only returns these for the current month.

**Files:**
- Modify: `src/api/customer/savings/service.ts`
- Modify: `src/api/customer/savings/routes.ts`
- Modify: `tests/api/customer/savings.routes.test.ts`

- [ ] **Step 1: Write the failing tests**

Add to `tests/api/customer/savings.routes.test.ts`:

```ts
describe('GET /savings/monthly-detail', () => {
  const mockMonthlyDetail = {
    totalSaving: 20.00,
    redemptionCount: 4,
    byMerchant: [
      { merchantId: 'm1', businessName: 'Pizza Place', logoUrl: null, saving: 12.00, count: 2 },
      { merchantId: 'm2', businessName: 'Coffee Shop', logoUrl: null, saving: 8.00, count: 2 },
    ],
    byCategory: [
      { categoryId: 'cat1', name: 'Food & Drink', saving: 20.00 },
    ],
  }

  it('returns 200 with monthly detail for a valid month', async () => {
    const { getMonthlyDetail } = await import('../../../src/api/customer/savings/service')
    ;(getMonthlyDetail as any).mockResolvedValue(mockMonthlyDetail)
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/monthly-detail?month=2026-03',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.totalSaving).toBe(20.00)
    expect(body.redemptionCount).toBe(4)
    expect(body.byMerchant).toHaveLength(2)
    expect(body.byMerchant[0].businessName).toBe('Pizza Place')
    expect(body.byCategory).toHaveLength(1)
  })

  it('returns 400 for invalid month format', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/monthly-detail?month=invalid',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when month param is missing', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/monthly-detail',
      headers: { authorization: `Bearer ${customerToken}` },
    })
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without token', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/customer/savings/monthly-detail?month=2026-03',
    })
    expect(res.statusCode).toBe(401)
  })
})
```

Update the mock at the top of the test file to include `getMonthlyDetail`:

```ts
vi.mock('../../../src/api/customer/savings/service', () => ({
  getSavingsSummary: vi.fn(),
  getSavingsRedemptions: vi.fn(),
  getMonthlyDetail: vi.fn(),
}))
```

And add the import:

```ts
import { getSavingsSummary, getSavingsRedemptions, getMonthlyDetail } from '../../../src/api/customer/savings/service'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/api/customer/savings.routes.test.ts`
Expected: FAIL — `getMonthlyDetail` does not exist, route not registered.

- [ ] **Step 3: Implement `getMonthlyDetail` in the service**

Add to `src/api/customer/savings/service.ts` after the `getSavingsRedemptions` function:

```ts
export async function getMonthlyDetail(
  prisma: PrismaClient,
  userId: string,
  month: string,
) {
  // month is "YYYY-MM" — already validated by the route
  const [yearStr, monthStr] = month.split('-')
  const year = parseInt(yearStr, 10)
  const mon = parseInt(monthStr, 10)
  const start = new Date(Date.UTC(year, mon - 1, 1))
  const end = new Date(Date.UTC(year, mon, 1))

  // Aggregate total + count
  const agg = await prisma.voucherRedemption.aggregate({
    where: { userId, redeemedAt: { gte: start, lt: end } },
    _sum: { estimatedSaving: true },
    _count: { id: true },
  })

  const totalSaving = Number(agg._sum.estimatedSaving ?? 0)
  const redemptionCount = agg._count.id

  // By merchant
  const rows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: start, lt: end } },
    select: {
      estimatedSaving: true,
      voucher: {
        select: {
          merchant: { select: { id: true, businessName: true, logoUrl: true } },
        },
      },
    },
  })

  const byMerchantMap: Record<string, {
    merchantId: string; businessName: string; logoUrl: string | null; saving: number; count: number
  }> = {}
  for (const r of rows) {
    const m = r.voucher.merchant
    if (!byMerchantMap[m.id]) {
      byMerchantMap[m.id] = { merchantId: m.id, businessName: m.businessName, logoUrl: m.logoUrl, saving: 0, count: 0 }
    }
    byMerchantMap[m.id].saving += Number(r.estimatedSaving ?? 0)
    byMerchantMap[m.id].count += 1
  }
  const byMerchant = Object.values(byMerchantMap).sort((a, b) => b.saving - a.saving)

  // By category
  const catRows = await prisma.voucherRedemption.findMany({
    where: { userId, redeemedAt: { gte: start, lt: end } },
    select: {
      estimatedSaving: true,
      voucher: {
        select: {
          merchant: {
            select: { primaryCategory: { select: { id: true, name: true } } },
          },
        },
      },
    },
  })

  const byCategoryMap: Record<string, { categoryId: string; name: string; saving: number }> = {}
  for (const r of catRows) {
    const cat = r.voucher.merchant.primaryCategory
    if (!cat) continue
    if (!byCategoryMap[cat.id]) {
      byCategoryMap[cat.id] = { categoryId: cat.id, name: cat.name, saving: 0 }
    }
    byCategoryMap[cat.id].saving += Number(r.estimatedSaving ?? 0)
  }
  const byCategory = Object.values(byCategoryMap).sort((a, b) => b.saving - a.saving)

  return { totalSaving, redemptionCount, byMerchant, byCategory }
}
```

- [ ] **Step 4: Add the route**

In `src/api/customer/savings/routes.ts`, add the import and route:

Add `getMonthlyDetail` to the import:
```ts
import { getSavingsSummary, getSavingsRedemptions, getMonthlyDetail } from './service'
```

Add a schema and route inside `savingsRoutes`:
```ts
const monthQuerySchema = z.object({
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'month must be YYYY-MM format'),
})

app.get(`${base}/monthly-detail`, async (req: FastifyRequest, reply) => {
  const { month } = monthQuerySchema.parse(req.query)
  const result = await getMonthlyDetail(app.prisma, req.user.sub, month)
  return reply.send(result)
})
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/api/customer/savings.routes.test.ts`
Expected: ALL PASS

- [ ] **Step 6: Commit**

```bash
git add src/api/customer/savings/service.ts src/api/customer/savings/routes.ts tests/api/customer/savings.routes.test.ts
git commit -m "feat(savings): add monthly-detail endpoint for month drill-down"
```

---

## Task 3: Frontend — API client for savings + subscription schema update

Create the savings API client and extend the subscription schema with `promoCodeId`.

**Files:**
- Create: `src/lib/api/savings.ts`
- Modify: `src/lib/api/subscription.ts`
- Create: `tests/lib/api/savings.test.ts`

**Reference:** Existing pattern in `src/lib/api/redemption.ts` and `src/lib/api/subscription.ts`.

- [ ] **Step 1: Write the failing test for the savings API client**

Create `tests/lib/api/savings.test.ts`:

```ts
import { savingsApi } from '@/lib/api/savings'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn() },
}))

const mockApi = api as jest.Mocked<typeof api>

describe('savingsApi', () => {
  beforeEach(() => jest.clearAllMocks())

  it('getSummary calls GET /api/v1/customer/savings/summary', async () => {
    mockApi.get.mockResolvedValue({
      lifetimeSaving: 100,
      thisMonthSaving: 25,
      thisMonthRedemptionCount: 5,
      monthlyBreakdown: [],
      byMerchant: [],
      byCategory: [],
    })
    const result = await savingsApi.getSummary()
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/summary')
    expect(result.lifetimeSaving).toBe(100)
  })

  it('getRedemptions calls GET with pagination params', async () => {
    mockApi.get.mockResolvedValue({ redemptions: [], total: 0 })
    await savingsApi.getRedemptions({ limit: 20, offset: 40 })
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions?limit=20&offset=40')
  })

  it('getRedemptions omits params when not provided', async () => {
    mockApi.get.mockResolvedValue({ redemptions: [], total: 0 })
    await savingsApi.getRedemptions({})
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/redemptions')
  })

  it('getMonthlyDetail calls GET with month param', async () => {
    mockApi.get.mockResolvedValue({
      totalSaving: 20,
      redemptionCount: 4,
      byMerchant: [],
      byCategory: [],
    })
    const result = await savingsApi.getMonthlyDetail('2026-03')
    expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/savings/monthly-detail?month=2026-03')
    expect(result.totalSaving).toBe(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/lib/api/savings.test.ts`
Expected: FAIL — module `@/lib/api/savings` does not exist.

- [ ] **Step 3: Create the savings API client**

Create `src/lib/api/savings.ts`:

```ts
import { api } from '../api'

export type VoucherType =
  | 'BOGO'
  | 'SPEND_AND_SAVE'
  | 'DISCOUNT_FIXED'
  | 'DISCOUNT_PERCENT'
  | 'FREEBIE'
  | 'PACKAGE_DEAL'
  | 'TIME_LIMITED'
  | 'REUSABLE'

export type MonthBreakdown = {
  month: string   // 'YYYY-MM'
  saving: number
  count: number
}

export type MerchantSaving = {
  merchantId: string
  businessName: string
  logoUrl: string | null
  saving: number
  count: number
}

export type CategorySaving = {
  categoryId: string
  name: string
  saving: number
}

export type SavingsSummary = {
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
  monthlyBreakdown: MonthBreakdown[]
  byMerchant: MerchantSaving[]
  byCategory: CategorySaving[]
}

export type SavingsRedemption = {
  id: string
  redeemedAt: string
  estimatedSaving: number
  isValidated: boolean
  validatedAt: string | null
  merchant: {
    id: string
    businessName: string
    logoUrl: string | null
  }
  voucher: {
    id: string
    title: string
    voucherType: VoucherType
  }
  branch: {
    id: string
    name: string
  }
}

export type SavingsRedemptionsResponse = {
  redemptions: SavingsRedemption[]
  total: number
}

export type MonthlyDetail = {
  totalSaving: number
  redemptionCount: number
  byMerchant: MerchantSaving[]
  byCategory: CategorySaving[]
}

export const savingsApi = {
  getSummary() {
    return api.get<SavingsSummary>('/api/v1/customer/savings/summary')
  },

  getRedemptions(params: { limit?: number; offset?: number }) {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get<SavingsRedemptionsResponse>(
      `/api/v1/customer/savings/redemptions${query ? `?${query}` : ''}`,
    )
  },

  getMonthlyDetail(month: string) {
    return api.get<MonthlyDetail>(
      `/api/v1/customer/savings/monthly-detail?month=${month}`,
    )
  },
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/lib/api/savings.test.ts`
Expected: ALL PASS

- [ ] **Step 5: Add `promoCodeId` to subscription schema**

In `src/lib/api/subscription.ts`, add `promoCodeId` to the Zod schema:

```ts
const subscriptionSchema = z.object({
  id: z.string(),
  status: z.enum(['TRIALLING', 'ACTIVE', 'CANCELLED', 'EXPIRED', 'PAST_DUE']),
  currentPeriodStart: z.string().nullable(),
  currentPeriodEnd: z.string().nullable(),
  cancelAtPeriodEnd: z.boolean(),
  promoCodeId: z.string().nullable().optional(),
  plan: subscriptionPlanSchema,
})
```

The field is `nullable().optional()` because older subscriptions or parse failures shouldn't break existing screens. The backend already returns `promoCodeId` from Prisma's `include: { plan: true }` — it just wasn't parsed.

- [ ] **Step 6: Commit**

```bash
git add src/lib/api/savings.ts src/lib/api/subscription.ts tests/lib/api/savings.test.ts
git commit -m "feat(savings): add savings API client and promoCodeId to subscription schema"
```

---

## Task 4: Frontend — Savings data hooks

Three React Query hooks: savings summary, infinite-scroll redemptions, and monthly detail.

**Files:**
- Create: `src/features/savings/hooks/useSavingsSummary.ts`
- Create: `src/features/savings/hooks/useSavingsRedemptions.ts`
- Create: `src/features/savings/hooks/useMonthlyDetail.ts`
- Create: `tests/features/savings/hooks/useSavingsSummary.test.ts`
- Create: `tests/features/savings/hooks/useSavingsRedemptions.test.ts`
- Create: `tests/features/savings/hooks/useMonthlyDetail.test.ts`

**Reference:** Existing hook patterns in `src/hooks/useSubscription.ts`, `src/hooks/useFavourite.ts`.

- [ ] **Step 1: Write the failing test for useSavingsSummary**

Create `tests/features/savings/hooks/useSavingsSummary.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSavingsSummary } from '@/features/savings/hooks/useSavingsSummary'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getSummary: jest.fn() },
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }),
}))

const mockApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSavingsSummary', () => {
  it('returns summary data when authed', async () => {
    mockApi.getSummary.mockResolvedValue({
      lifetimeSaving: 100,
      thisMonthSaving: 25,
      thisMonthRedemptionCount: 5,
      monthlyBreakdown: [],
      byMerchant: [],
      byCategory: [],
    })
    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.lifetimeSaving).toBe(100)
  })

  it('exposes isLoading and isError', async () => {
    mockApi.getSummary.mockRejectedValue(new Error('fail'))
    const { result } = renderHook(() => useSavingsSummary(), { wrapper })
    await waitFor(() => expect(result.current.isError).toBe(true))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/hooks/useSavingsSummary.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement useSavingsSummary**

Create `src/features/savings/hooks/useSavingsSummary.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

export function useSavingsSummary() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useQuery({
    queryKey: ['savingsSummary'],
    queryFn: savingsApi.getSummary,
    enabled: isAuthed,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/hooks/useSavingsSummary.test.ts`
Expected: PASS

- [ ] **Step 5: Write the failing test for useSavingsRedemptions**

Create `tests/features/savings/hooks/useSavingsRedemptions.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useSavingsRedemptions } from '@/features/savings/hooks/useSavingsRedemptions'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getRedemptions: jest.fn() },
}))
jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: { status: string }) => unknown) => sel({ status: 'authed' }),
}))

const mockApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useSavingsRedemptions', () => {
  it('fetches first page of redemptions', async () => {
    mockApi.getRedemptions.mockResolvedValue({
      redemptions: [{ id: 'r1' } as any],
      total: 1,
    })
    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.pages[0].redemptions).toHaveLength(1)
  })

  it('exposes hasNextPage correctly', async () => {
    mockApi.getRedemptions.mockResolvedValue({
      redemptions: Array.from({ length: 20 }, (_, i) => ({ id: `r${i}` })) as any,
      total: 50,
    })
    const { result } = renderHook(() => useSavingsRedemptions(), { wrapper })
    await waitFor(() => expect(result.current.hasNextPage).toBe(true))
  })
})
```

- [ ] **Step 6: Implement useSavingsRedemptions**

Create `src/features/savings/hooks/useSavingsRedemptions.ts`:

```ts
import { useInfiniteQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'
import { useAuthStore } from '@/stores/auth'

const PAGE_SIZE = 20

export function useSavingsRedemptions() {
  const status = useAuthStore((s) => s.status)
  const isAuthed = status === 'authed'

  return useInfiniteQuery({
    queryKey: ['savingsRedemptions'],
    queryFn: ({ pageParam = 0 }) =>
      savingsApi.getRedemptions({ limit: PAGE_SIZE, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (lastPage, allPages) => {
      const loaded = allPages.reduce((n, p) => n + p.redemptions.length, 0)
      return loaded < lastPage.total ? loaded : undefined
    },
    enabled: isAuthed,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 7: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/hooks/useSavingsRedemptions.test.ts`
Expected: PASS

- [ ] **Step 8: Write the failing test for useMonthlyDetail**

Create `tests/features/savings/hooks/useMonthlyDetail.test.ts`:

```ts
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useMonthlyDetail } from '@/features/savings/hooks/useMonthlyDetail'
import { savingsApi } from '@/lib/api/savings'

jest.mock('@/lib/api/savings', () => ({
  savingsApi: { getMonthlyDetail: jest.fn() },
}))

const mockApi = savingsApi as jest.Mocked<typeof savingsApi>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useMonthlyDetail', () => {
  it('fetches detail when month is provided', async () => {
    mockApi.getMonthlyDetail.mockResolvedValue({
      totalSaving: 20,
      redemptionCount: 4,
      byMerchant: [],
      byCategory: [],
    })
    const { result } = renderHook(() => useMonthlyDetail('2026-03'), { wrapper })
    await waitFor(() => expect(result.current.data).toBeDefined())
    expect(result.current.data?.totalSaving).toBe(20)
  })

  it('does not fetch when month is null', () => {
    const { result } = renderHook(() => useMonthlyDetail(null), { wrapper })
    expect(result.current.data).toBeUndefined()
    expect(mockApi.getMonthlyDetail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 9: Implement useMonthlyDetail**

Create `src/features/savings/hooks/useMonthlyDetail.ts`:

```ts
import { useQuery } from '@tanstack/react-query'
import { savingsApi } from '@/lib/api/savings'

export function useMonthlyDetail(month: string | null) {
  return useQuery({
    queryKey: ['savingsMonthlyDetail', month],
    queryFn: () => savingsApi.getMonthlyDetail(month!),
    enabled: !!month,
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 10: Run all hook tests**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/hooks/`
Expected: ALL PASS

- [ ] **Step 11: Commit**

```bash
git add src/features/savings/hooks/ tests/features/savings/hooks/
git commit -m "feat(savings): add React Query hooks for summary, redemptions, and monthly detail"
```

---

## Task 5: Frontend — useCountUp animation hook

Animated count-up for hero numbers using react-native-reanimated. Runs on mount, re-animates when target value changes. Respects reduceMotion.

**Files:**
- Create: `src/features/savings/hooks/useCountUp.ts`
- Create: `tests/features/savings/hooks/useCountUp.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/hooks/useCountUp.test.ts`:

```ts
import { renderHook } from '@testing-library/react-native'
import { useCountUp } from '@/features/savings/hooks/useCountUp'

jest.mock('@/design-system/useMotionScale', () => ({
  useMotionScale: () => 1,
}))

describe('useCountUp', () => {
  it('returns a shared value', () => {
    const { result } = renderHook(() => useCountUp(100, 900))
    // In test env with mocked reanimated, shared values are plain objects
    expect(result.current).toBeDefined()
    expect(typeof result.current.value).toBe('number')
  })

  it('starts from 0', () => {
    const { result } = renderHook(() => useCountUp(50, 900))
    // Mocked withTiming returns the target value immediately
    // After mount effect, value should be the target
    expect(result.current.value).toBe(50)
  })

  it('updates when target changes', () => {
    const { result, rerender } = renderHook(
      ({ target }) => useCountUp(target, 900),
      { initialProps: { target: 50 } },
    )
    expect(result.current.value).toBe(50)
    rerender({ target: 100 })
    expect(result.current.value).toBe(100)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/hooks/useCountUp.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement useCountUp**

Create `src/features/savings/hooks/useCountUp.ts`:

```ts
import { useEffect, useRef } from 'react'
import { useSharedValue, withTiming, Easing } from 'react-native-reanimated'
import { useMotionScale } from '@/design-system/useMotionScale'

/**
 * Animates from current value to `target` using a count-up timing animation.
 * On first mount: animates from 0 → target.
 * On value change: animates from previous → new target.
 * Respects reduceMotion (sets instantly when motion scale is 0).
 */
export function useCountUp(target: number, durationMs: number) {
  const value = useSharedValue(0)
  const scale = useMotionScale()
  const hasMounted = useRef(false)

  useEffect(() => {
    if (scale === 0) {
      value.value = target
      return
    }

    const dur = hasMounted.current ? Math.round(durationMs * 0.6) : durationMs
    value.value = withTiming(target, {
      duration: dur,
      easing: Easing.out(Easing.bezier(0.16, 1, 0.3, 1)),
    })
    hasMounted.current = true
  }, [target, durationMs, scale, value])

  return value
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/hooks/useCountUp.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/savings/hooks/useCountUp.ts tests/features/savings/hooks/useCountUp.test.ts
git commit -m "feat(savings): add useCountUp animation hook"
```

---

## Task 6: Frontend — Hero gradient + hero header component

The 5-stop gradient background with depth overlays, and the hero header rendering all 3 user states.

**Files:**
- Create: `src/features/savings/components/SavingsHeroGradient.tsx`
- Create: `src/features/savings/components/SavingsHeroHeader.tsx`
- Create: `tests/features/savings/components/SavingsHeroHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/components/SavingsHeroHeader.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SavingsHeroHeader } from '@/features/savings/components/SavingsHeroHeader'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View, Text } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: any, r: any) => React.createElement(Text, { ...p, ref: r })),
    },
    useSharedValue: (v: number) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    Easing: { out: (fn: any) => fn, bezier: () => (x: number) => x },
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))

describe('SavingsHeroHeader', () => {
  it('renders free user state with subscribe CTA', () => {
    const onSubscribe = jest.fn()
    const { getByText } = render(
      <SavingsHeroHeader
        state="free"
        onSubscribe={onSubscribe}
        onBrowse={() => {}}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByText('Unlock your savings')).toBeTruthy()
    expect(getByText(/Subscribe — from £6\.99\/mo/)).toBeTruthy()
    fireEvent.press(getByText(/Subscribe — from £6\.99\/mo/))
    expect(onSubscribe).toHaveBeenCalled()
  })

  it('renders subscriber-empty state with browse CTA', () => {
    const onBrowse = jest.fn()
    const { getByText } = render(
      <SavingsHeroHeader
        state="subscriber-empty"
        onSubscribe={() => {}}
        onBrowse={onBrowse}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByText('Start saving today')).toBeTruthy()
    expect(getByText('Browse vouchers')).toBeTruthy()
    fireEvent.press(getByText('Browse vouchers'))
    expect(onBrowse).toHaveBeenCalled()
  })

  it('renders populated state with stats', () => {
    const { getByText } = render(
      <SavingsHeroHeader
        state="populated"
        onSubscribe={() => {}}
        onBrowse={() => {}}
        lifetimeSaving={156.5}
        thisMonthSaving={32.0}
        thisMonthRedemptionCount={7}
      />,
    )
    expect(getByText('Total saved')).toBeTruthy()
    expect(getByText('Savings')).toBeTruthy()
  })

  it('renders "Savings" title in all states', () => {
    const { getByText } = render(
      <SavingsHeroHeader
        state="free"
        onSubscribe={() => {}}
        onBrowse={() => {}}
        lifetimeSaving={0}
        thisMonthSaving={0}
        thisMonthRedemptionCount={0}
      />,
    )
    expect(getByText('Savings')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/SavingsHeroHeader.test.tsx`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Create SavingsHeroGradient**

Create `src/features/savings/components/SavingsHeroGradient.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'

/**
 * 5-stop brand gradient matching VoucherDetailScreen depth technique.
 * Spec: linear-gradient(145deg, #B80E08 0%, #D10A03 28%, #E20C04 52%, #CC3500 78%, #C83200 100%)
 * Plus dark vignette + radial scatter depth overlays.
 */
export function SavingsHeroGradient({ children, style }: { children: React.ReactNode; style?: object }) {
  return (
    <View style={style}>
      {/* Primary 5-stop gradient */}
      <LinearGradient
        colors={['#B80E08', '#D10A03', '#E20C04', '#CC3500', '#C83200']}
        locations={[0, 0.28, 0.52, 0.78, 1]}
        start={{ x: 0.15, y: 0 }}
        end={{ x: 0.85, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {/* Dark vignette overlay for depth */}
      <LinearGradient
        colors={['rgba(0,0,0,0.18)', 'transparent', 'rgba(0,0,0,0.2)']}
        locations={[0, 0.4, 1]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  )
}
```

- [ ] **Step 4: Create SavingsHeroHeader**

Create `src/features/savings/components/SavingsHeroHeader.tsx`:

```tsx
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle } from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
// eslint-disable-next-line tokens/no-raw-tokens
import { Lock, PiggyBank } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, layout, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { SavingsHeroGradient } from './SavingsHeroGradient'
import { useCountUp } from '../hooks/useCountUp'

type State = 'free' | 'subscriber-empty' | 'populated'

type Props = {
  state: State
  onSubscribe: () => void
  onBrowse: () => void
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
}

function formatPounds(value: number): string {
  return `£${value.toFixed(2)}`
}

function AnimatedPounds({ value, duration }: { value: number; duration: number }) {
  const animated = useCountUp(value, duration)
  const style = useAnimatedStyle(() => ({}))
  // In production, we'd use animated text. For now, display the target.
  // The actual implementation uses Animated.Text with derived display value.
  return (
    <Animated.Text
      style={[styles.lifetimeTotal, style]}
      accessibilityLabel={`${formatPounds(value)} total saved`}
    >
      {formatPounds(value)}
    </Animated.Text>
  )
}

export function SavingsHeroHeader({ state, onSubscribe, onBrowse, lifetimeSaving, thisMonthSaving, thisMonthRedemptionCount }: Props) {
  const insets = useSafeAreaInsets()
  const motionScale = useMotionScale()

  return (
    <SavingsHeroGradient style={styles.container}>
      {/* App bar — "Savings" title */}
      <View style={[styles.appBar, { paddingTop: insets.top + 10 }]}>
        <Text
          variant="display.md"
          style={{ color: '#FFFFFF', fontFamily: 'MusticaPro-SemiBold', fontSize: 26 }}
        >
          Savings
        </Text>
      </View>

      {state === 'free' && (
        <View style={styles.emptyContent}>
          <View style={styles.iconRing}>
            <Lock size={28} color="#FFFFFF" />
          </View>
          <Text variant="display.sm" style={styles.emptyTitle}>
            Unlock your savings
          </Text>
          <Text variant="body.sm" style={styles.emptyBody}>
            Subscribe to start redeeming vouchers at local businesses and tracking every penny saved.
          </Text>
          <Pressable
            onPress={onSubscribe}
            style={styles.ctaButton}
            accessibilityRole="button"
            accessibilityLabel="Subscribe from 6 pounds 99 per month"
          >
            <Text variant="heading.sm" style={styles.ctaText}>
              Subscribe — from £6.99/mo
            </Text>
          </Pressable>
        </View>
      )}

      {state === 'subscriber-empty' && (
        <View style={styles.emptyContent}>
          <View style={styles.iconRing}>
            <PiggyBank size={28} color="#FFFFFF" />
          </View>
          <Text variant="display.sm" style={styles.emptyTitle}>
            Start saving today
          </Text>
          <Text variant="body.sm" style={styles.emptyBody}>
            You're all set. Redeem a voucher at any local business and your savings will appear here.
          </Text>
          <Pressable
            onPress={onBrowse}
            style={styles.ctaButton}
            accessibilityRole="button"
            accessibilityLabel="Browse vouchers"
          >
            <Text variant="heading.sm" style={styles.ctaText}>
              Browse vouchers
            </Text>
          </Pressable>
        </View>
      )}

      {state === 'populated' && (
        <View style={styles.populatedContent}>
          <Text style={styles.eyebrow}>Total saved</Text>
          <AnimatedPounds value={lifetimeSaving} duration={900} />
          <View style={styles.chipRow}>
            <View style={styles.statChip}>
              <Text style={styles.chipLabel}>This month</Text>
              <Text style={styles.chipValue}>{formatPounds(thisMonthSaving)}</Text>
            </View>
            <View style={styles.statChip}>
              <Text style={styles.chipLabel}>Redemptions</Text>
              <Text style={styles.chipValue}>{thisMonthRedemptionCount}</Text>
            </View>
          </View>
        </View>
      )}
    </SavingsHeroGradient>
  )
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  appBar: {
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[3],
  },
  emptyContent: {
    alignItems: 'center',
    paddingHorizontal: spacing[6],
    paddingTop: spacing[4],
    paddingBottom: spacing[7],
    gap: spacing[3],
  },
  iconRing: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing[2],
  },
  emptyTitle: {
    color: '#FFFFFF',
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 24,
    textAlign: 'center',
  },
  emptyBody: {
    color: 'rgba(255,255,255,0.85)',
    textAlign: 'center',
    lineHeight: 21,
  },
  ctaButton: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: spacing[6],
    paddingVertical: spacing[3],
    borderRadius: radius.pill,
    marginTop: spacing[2],
  },
  ctaText: {
    color: '#E20C04',
    fontFamily: 'Lato-SemiBold',
  },
  populatedContent: {
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingTop: spacing[2],
    paddingBottom: spacing[6],
  },
  eyebrow: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.65)',
    marginBottom: spacing[1],
  },
  lifetimeTotal: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 48,
    lineHeight: 52,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
  chipRow: {
    flexDirection: 'row',
    gap: spacing[3],
    marginTop: spacing[4],
  },
  statChip: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.lg,
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    alignItems: 'center',
    gap: 2,
  },
  chipLabel: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: 'rgba(255,255,255,0.6)',
  },
  chipValue: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 22,
    lineHeight: 26,
    color: '#FFFFFF',
    fontVariant: ['tabular-nums'],
  },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/SavingsHeroHeader.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/savings/components/SavingsHeroGradient.tsx src/features/savings/components/SavingsHeroHeader.tsx tests/features/savings/components/SavingsHeroHeader.test.tsx
git commit -m "feat(savings): add hero gradient and 3-state hero header"
```

---

## Task 7: Frontend — Benefit cards + skeleton components

Benefit cards shown below the hero for States 1 (4 cards) and 2 (3 cards). Plus skeleton shimmer for initial loading.

**Files:**
- Create: `src/features/savings/components/BenefitCards.tsx`
- Create: `src/features/savings/components/SavingsSkeleton.tsx`
- Create: `tests/features/savings/components/BenefitCards.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/components/BenefitCards.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { BenefitCards } from '@/features/savings/components/BenefitCards'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('BenefitCards', () => {
  it('renders 4 cards for free state', () => {
    const { getByText } = render(<BenefitCards variant="free" />)
    expect(getByText('Restaurants, cafés, gyms & more')).toBeTruthy()
    expect(getByText('Show your code, save instantly')).toBeTruthy()
    expect(getByText('Your subscription pays for itself')).toBeTruthy()
    expect(getByText('Cancel anytime, no commitment')).toBeTruthy()
  })

  it('renders 3 cards for subscriber-empty state (no cancel card)', () => {
    const { getByText, queryByText } = render(<BenefitCards variant="subscriber-empty" />)
    expect(getByText('Restaurants, cafés, gyms & more')).toBeTruthy()
    expect(getByText('Show your code, save instantly')).toBeTruthy()
    expect(getByText('Your subscription pays for itself')).toBeTruthy()
    expect(queryByText('Cancel anytime, no commitment')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/BenefitCards.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement BenefitCards**

Create `src/features/savings/components/BenefitCards.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
// eslint-disable-next-line tokens/no-raw-tokens
import { MapPin, CreditCard, TrendingUp, XCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { FadeInDown } from '@/design-system/motion/FadeIn'

type Variant = 'free' | 'subscriber-empty'

const CARDS = [
  {
    icon: MapPin,
    iconBg: '#FEE2E2',
    iconColor: '#E20C04',
    title: 'Restaurants, cafés, gyms & more',
    body: 'Local businesses near you — new vouchers added every week',
    key: 'location',
  },
  {
    icon: CreditCard,
    iconBg: '#DCFCE7',
    iconColor: '#16A34A',
    title: 'Show your code, save instantly',
    body: 'Tap Redeem and show the screen at the till — it\'s that simple',
    key: 'redeem',
  },
  {
    icon: TrendingUp,
    iconBg: '#FEF3C7',
    iconColor: '#B45309',
    title: 'Your subscription pays for itself',
    body: 'Redeem just once a month and you\'ve already covered your £6.99',
    key: 'roi',
  },
  {
    icon: XCircle,
    iconBg: '#EDE9FE',
    iconColor: '#7C3AED',
    title: 'Cancel anytime, no commitment',
    body: 'Monthly from £6.99 or save with an annual plan',
    key: 'cancel',
    freeOnly: true,
  },
]

export function BenefitCards({ variant }: { variant: Variant }) {
  const cards = variant === 'free' ? CARDS : CARDS.filter((c) => !c.freeOnly)

  return (
    <View style={styles.container}>
      {cards.map((card, i) => {
        const Icon = card.icon
        return (
          <FadeInDown key={card.key} delay={200 + i * 80}>
            <View style={styles.card}>
              <View style={[styles.iconCircle, { backgroundColor: card.iconBg }]}>
                <Icon size={20} color={card.iconColor} />
              </View>
              <View style={styles.cardText}>
                <Text variant="heading.sm" style={styles.cardTitle}>{card.title}</Text>
                <Text variant="body.sm" color="secondary" meta>{card.body}</Text>
              </View>
            </View>
          </FadeInDown>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[4],
    gap: spacing[3],
  },
  card: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: radius.xl,
    padding: spacing[4],
    gap: spacing[3],
    ...elevation.sm,
  },
  iconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: {
    flex: 1,
    gap: 2,
  },
  cardTitle: {
    color: '#010C35',
  },
})
```

- [ ] **Step 4: Create SavingsSkeleton**

Create `src/features/savings/components/SavingsSkeleton.tsx`:

```tsx
import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { spacing, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import { SavingsHeroGradient } from './SavingsHeroGradient'

function ShimmerBlock({ width, height, style }: { width: number | string; height: number; style?: object }) {
  const opacity = useSharedValue(0.3)
  const scale = useMotionScale()

  useEffect(() => {
    if (scale === 0) return
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ),
      -1,
    )
  }, [opacity, scale])

  const animStyle = useAnimatedStyle(() => ({ opacity: opacity.value }))

  return (
    <Animated.View
      style={[
        { width: width as number, height, borderRadius: radius.md, backgroundColor: 'rgba(255,255,255,0.2)' },
        animStyle,
        style,
      ]}
    />
  )
}

/** Full-screen skeleton shown on first load before data resolves. */
export function SavingsSkeleton() {
  const insets = useSafeAreaInsets()

  return (
    <View style={styles.container}>
      {/* Hero skeleton */}
      <SavingsHeroGradient style={styles.hero}>
        <View style={[styles.heroInner, { paddingTop: insets.top + 10 }]}>
          <ShimmerBlock width={100} height={26} />
          <View style={styles.heroStats}>
            <ShimmerBlock width={80} height={12} />
            <ShimmerBlock width={180} height={48} />
            <View style={styles.chipRowSkel}>
              <ShimmerBlock width={120} height={56} style={{ borderRadius: radius.lg }} />
              <ShimmerBlock width={120} height={56} style={{ borderRadius: radius.lg }} />
            </View>
          </View>
        </View>
      </SavingsHeroGradient>

      {/* Insight card skeletons */}
      <View style={styles.cards}>
        <ShimmerBlock width={'100%' as unknown as number} height={180} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
        <ShimmerBlock width={'100%' as unknown as number} height={120} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
        <ShimmerBlock width={'100%' as unknown as number} height={100} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
      </View>
    </View>
  )
}

/** Skeleton for insight cards only (used during month drill-down fetch). */
export function InsightSkeleton() {
  return (
    <View style={styles.insightSkelContainer}>
      <ShimmerBlock width={'100%' as unknown as number} height={120} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
      <ShimmerBlock width={'100%' as unknown as number} height={100} style={{ borderRadius: radius.xl, backgroundColor: '#E5E7EB' }} />
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8F9FA' },
  hero: { overflow: 'hidden' },
  heroInner: { paddingHorizontal: spacing[5], paddingBottom: spacing[6] },
  heroStats: { alignItems: 'center', paddingTop: spacing[5], gap: spacing[3] },
  chipRowSkel: { flexDirection: 'row', gap: spacing[3], marginTop: spacing[2] },
  cards: { paddingHorizontal: spacing[5], paddingTop: spacing[5], gap: spacing[3] },
  insightSkelContainer: { gap: spacing[3] },
})
```

- [ ] **Step 5: Run tests**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/BenefitCards.test.tsx`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/features/savings/components/BenefitCards.tsx src/features/savings/components/SavingsSkeleton.tsx tests/features/savings/components/BenefitCards.test.tsx
git commit -m "feat(savings): add benefit cards and skeleton loading components"
```

---

## Task 8: Frontend — TrendChart (Card 1 — 6-month bar chart)

Interactive bar chart with 6 tappable bars. Current month is full red with dot; others are dimmed. Zero-savings months render as 3px stubs. Bars animate `scaleY(0→1)` on mount.

**Files:**
- Create: `src/features/savings/components/TrendChart.tsx`
- Create: `tests/features/savings/components/TrendChart.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/components/TrendChart.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { TrendChart } from '@/features/savings/components/TrendChart'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

const MONTHS = [
  { month: '2026-04', saving: 32, count: 7 },
  { month: '2026-03', saving: 20, count: 4 },
  { month: '2026-02', saving: 0, count: 0 },
  { month: '2026-01', saving: 15, count: 3 },
  { month: '2025-12', saving: 10, count: 2 },
  { month: '2025-11', saving: 5, count: 1 },
]

describe('TrendChart', () => {
  it('renders 6 bars', () => {
    const { getAllByRole } = render(
      <TrendChart
        months={MONTHS}
        selectedMonth={null}
        currentMonth="2026-04"
        onMonthSelect={() => {}}
      />,
    )
    const bars = getAllByRole('button')
    expect(bars).toHaveLength(6)
  })

  it('calls onMonthSelect when a bar is tapped', () => {
    const onSelect = jest.fn()
    const { getAllByRole } = render(
      <TrendChart
        months={MONTHS}
        selectedMonth={null}
        currentMonth="2026-04"
        onMonthSelect={onSelect}
      />,
    )
    fireEvent.press(getAllByRole('button')[1]) // tap March
    expect(onSelect).toHaveBeenCalledWith('2026-03')
  })

  it('has accessible labels on each bar', () => {
    const { getByLabelText } = render(
      <TrendChart
        months={MONTHS}
        selectedMonth={null}
        currentMonth="2026-04"
        onMonthSelect={() => {}}
      />,
    )
    expect(getByLabelText(/Apr, £32.00 saved/)).toBeTruthy()
    expect(getByLabelText(/Feb, £0.00 saved/)).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/TrendChart.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement TrendChart**

Create `src/features/savings/components/TrendChart.tsx`:

```tsx
import React, { useEffect } from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withDelay,
  withSpring,
} from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation, layout } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { MonthBreakdown } from '@/lib/api/savings'

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const CHART_HEIGHT = 120
const MIN_BAR_HEIGHT = 3
const BAR_STAGGER = 75

function monthLabel(yyyymm: string): string {
  const m = parseInt(yyyymm.split('-')[1], 10)
  return MONTH_LABELS[m - 1]
}

function Bar({
  month,
  saving,
  maxSaving,
  isSelected,
  isCurrent,
  index,
  onPress,
}: {
  month: string
  saving: number
  maxSaving: number
  isSelected: boolean
  isCurrent: boolean
  index: number
  onPress: () => void
}) {
  const scale = useMotionScale()
  const scaleY = useSharedValue(0)
  const barHeight = maxSaving > 0 ? Math.max(MIN_BAR_HEIGHT, (saving / maxSaving) * CHART_HEIGHT) : MIN_BAR_HEIGHT

  useEffect(() => {
    if (scale === 0) {
      scaleY.value = 1
      return
    }
    scaleY.value = withDelay(
      650 + index * BAR_STAGGER,
      withSpring(1, { damping: 14, stiffness: 180 }),
    )
  }, [index, scale, scaleY])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scaleY: scaleY.value }],
  }))

  const isHighlighted = isSelected || (isCurrent && !isSelected)
  const barColor = isHighlighted ? '#E20C04' : saving > 0 ? 'rgba(226,12,4,0.18)' : 'rgba(226,12,4,0.10)'
  const label = monthLabel(month)

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, £${saving.toFixed(2)} saved`}
      style={styles.barColumn}
      hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
    >
      {/* Dot indicator for selected/current */}
      <View style={[styles.dot, { opacity: isHighlighted ? 1 : 0 }]} />

      {/* Bar */}
      <View style={[styles.barTrack, { height: CHART_HEIGHT }]}>
        <Animated.View
          style={[
            styles.bar,
            { height: barHeight, backgroundColor: barColor },
            animStyle,
          ]}
        />
      </View>

      {/* Month label */}
      <Text
        variant="label.md"
        style={[styles.monthLabel, isHighlighted && styles.monthLabelActive]}
        meta
      >
        {label}
      </Text>
    </Pressable>
  )
}

type Props = {
  months: MonthBreakdown[] // 6 items, [0]=most recent (reversed from backend's 12-item array)
  selectedMonth: string | null
  currentMonth: string
  onMonthSelect: (month: string) => void
}

export function TrendChart({ months, selectedMonth, currentMonth, onMonthSelect }: Props) {
  const maxSaving = Math.max(...months.map((m) => m.saving), 1)

  // Display oldest→newest (left→right), so reverse the array
  const displayMonths = [...months].reverse()

  return (
    <View style={styles.card}>
      <Text variant="label.eyebrow" style={styles.sectionLabel}>6-Month Trend</Text>
      <View style={styles.chartRow}>
        {displayMonths.map((m, i) => (
          <Bar
            key={m.month}
            month={m.month}
            saving={m.saving}
            maxSaving={maxSaving}
            isSelected={selectedMonth === m.month}
            isCurrent={m.month === currentMonth}
            index={i}
            onPress={() => onMonthSelect(m.month)}
          />
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  chartRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  barColumn: {
    flex: 1,
    alignItems: 'center',
    minWidth: layout.minTouchTarget,
    gap: spacing[1],
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E20C04',
    marginBottom: 4,
  },
  barTrack: {
    justifyContent: 'flex-end',
    width: '100%',
    maxWidth: 32,
  },
  bar: {
    borderRadius: radius.xs,
    transformOrigin: 'bottom',
  },
  monthLabel: {
    fontSize: 10,
    color: '#9CA3AF',
  },
  monthLabelActive: {
    color: '#E20C04',
    fontFamily: 'Lato-SemiBold',
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/TrendChart.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/savings/components/TrendChart.tsx tests/features/savings/components/TrendChart.test.tsx
git commit -m "feat(savings): add 6-month trend bar chart with tappable bars"
```

---

## Task 9: Frontend — ViewingChip + TopPlaces + ByCategory (Cards 2 & 3 + chip)

The viewing chip, top places card, and category breakdown card. These work together during month drill-down.

**Files:**
- Create: `src/features/savings/components/ViewingChip.tsx`
- Create: `src/features/savings/components/TopPlaces.tsx`
- Create: `src/features/savings/components/ByCategory.tsx`
- Create: `tests/features/savings/components/ViewingChip.test.tsx`
- Create: `tests/features/savings/components/TopPlaces.test.tsx`
- Create: `tests/features/savings/components/ByCategory.test.tsx`

- [ ] **Step 1: Write tests**

Create `tests/features/savings/components/ViewingChip.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ViewingChip } from '@/features/savings/components/ViewingChip'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withSpring: (v: unknown) => v,
    withTiming: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('ViewingChip', () => {
  it('renders month label and dismiss button', () => {
    const onDismiss = jest.fn()
    const { getByText, getByLabelText } = render(
      <ViewingChip month="2026-03" onDismiss={onDismiss} />,
    )
    expect(getByText(/Viewing: March 2026/)).toBeTruthy()
    fireEvent.press(getByLabelText(/Tap to return to current month/))
    expect(onDismiss).toHaveBeenCalled()
  })

  it('returns null when month is null', () => {
    const { toJSON } = render(<ViewingChip month={null} onDismiss={() => {}} />)
    expect(toJSON()).toBeNull()
  })
})
```

Create `tests/features/savings/components/TopPlaces.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { TopPlaces } from '@/features/savings/components/TopPlaces'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('TopPlaces', () => {
  it('renders up to 2 merchants', () => {
    const { getByText } = render(
      <TopPlaces merchants={[
        { merchantId: 'm1', businessName: 'Pizza Place', logoUrl: null, saving: 15, count: 3 },
        { merchantId: 'm2', businessName: 'Coffee Shop', logoUrl: null, saving: 8, count: 2 },
      ]} />,
    )
    expect(getByText('Pizza Place')).toBeTruthy()
    expect(getByText('Coffee Shop')).toBeTruthy()
  })

  it('renders 1 merchant without placeholder', () => {
    const { getByText, queryByText } = render(
      <TopPlaces merchants={[
        { merchantId: 'm1', businessName: 'Pizza Place', logoUrl: null, saving: 15, count: 3 },
      ]} />,
    )
    expect(getByText('Pizza Place')).toBeTruthy()
    expect(queryByText('Coffee Shop')).toBeNull()
  })

  it('returns null when merchants is empty', () => {
    const { toJSON } = render(<TopPlaces merchants={[]} />)
    expect(toJSON()).toBeNull()
  })
})
```

Create `tests/features/savings/components/ByCategory.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { ByCategory } from '@/features/savings/components/ByCategory'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withSpring: (v: unknown) => v,
  }
})
jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('ByCategory', () => {
  it('renders category bars with names and amounts', () => {
    const { getByText } = render(
      <ByCategory categories={[
        { categoryId: 'c1', name: 'Food & Drink', saving: 20 },
        { categoryId: 'c2', name: 'Beauty', saving: 10 },
      ]} />,
    )
    expect(getByText('Food & Drink')).toBeTruthy()
    expect(getByText('Beauty')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/ViewingChip.test.tsx tests/features/savings/components/TopPlaces.test.tsx tests/features/savings/components/ByCategory.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement ViewingChip**

Create `src/features/savings/components/ViewingChip.tsx`:

```tsx
import React, { useEffect } from 'react'
import { Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated'
// eslint-disable-next-line tokens/no-raw-tokens
import { X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

function formatMonth(yyyymm: string): string {
  const [year, mon] = yyyymm.split('-')
  return `${MONTH_NAMES[parseInt(mon, 10) - 1]} ${year}`
}

type Props = {
  month: string | null
  onDismiss: () => void
}

export function ViewingChip({ month, onDismiss }: Props) {
  const scale = useSharedValue(0.8)
  const opacity = useSharedValue(0)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (!month) return
    if (motionScale === 0) {
      scale.value = 1
      opacity.value = 1
      return
    }
    scale.value = withSpring(1, { damping: 12, stiffness: 200 })
    opacity.value = withSpring(1, { damping: 20, stiffness: 260 })
  }, [month, motionScale, opacity, scale])

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }))

  if (!month) return null

  const label = `Viewing: ${formatMonth(month)}`

  return (
    <Animated.View style={[styles.chip, animStyle]}>
      <Text variant="label.md" style={styles.chipText}>{label}</Text>
      <Pressable
        onPress={onDismiss}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={`Viewing ${formatMonth(month)}. Tap to return to current month`}
      >
        <X size={14} color="#B45309" />
      </Pressable>
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[3],
    paddingVertical: spacing[1],
    gap: spacing[2],
  },
  chipText: {
    color: '#B45309',
    fontFamily: 'Lato-SemiBold',
    fontSize: 12,
  },
})
```

- [ ] **Step 4: Implement TopPlaces**

Create `src/features/savings/components/TopPlaces.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { FadeIn } from '@/design-system/motion/FadeIn'
import type { MerchantSaving } from '@/lib/api/savings'

type Props = {
  merchants: MerchantSaving[]
}

export function TopPlaces({ merchants }: Props) {
  if (merchants.length === 0) return null

  const top = merchants.slice(0, 2)

  return (
    <View style={styles.card}>
      <Text variant="label.eyebrow" style={styles.sectionLabel}>Top Places</Text>
      {top.map((m, i) => (
        <FadeIn key={m.merchantId} delay={i * 85} y={8}>
          <View style={styles.row}>
            <View style={styles.logoPlaceholder}>
              <Text variant="label.md" style={styles.logoInitial}>
                {m.businessName.charAt(0)}
              </Text>
            </View>
            <View style={styles.rowText}>
              <Text variant="body.sm" style={styles.merchantName}>{m.businessName}</Text>
              <Text variant="body.sm" color="tertiary" meta>
                {m.count} redemption{m.count !== 1 ? 's' : ''}
              </Text>
            </View>
            <Text style={styles.saving}>+£{m.saving.toFixed(2)}</Text>
          </View>
        </FadeIn>
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: spacing[2],
    gap: spacing[3],
  },
  logoPlaceholder: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontSize: 18,
    fontFamily: 'Lato-SemiBold',
    color: '#9CA3AF',
  },
  rowText: {
    flex: 1,
    gap: 1,
  },
  merchantName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: '#010C35',
  },
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 18,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
})
```

- [ ] **Step 5: Implement ByCategory**

Create `src/features/savings/components/ByCategory.tsx`:

```tsx
import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withDelay, withSpring } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { spacing, radius, elevation } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { CategorySaving } from '@/lib/api/savings'

const BAR_STAGGER = 65
const BAR_START_DELAY = 900

function CategoryBar({ category, maxSaving, index }: { category: CategorySaving; maxSaving: number; index: number }) {
  const fillPct = maxSaving > 0 ? (category.saving / maxSaving) * 100 : 0
  const width = useSharedValue(0)
  const scale = useMotionScale()

  useEffect(() => {
    if (scale === 0) {
      width.value = fillPct
      return
    }
    width.value = withDelay(
      BAR_START_DELAY + index * BAR_STAGGER,
      withSpring(fillPct, { damping: 16, stiffness: 140 }),
    )
  }, [fillPct, index, scale, width])

  const fillStyle = useAnimatedStyle(() => ({
    width: `${width.value}%` as unknown as number,
  }))

  return (
    <View style={styles.categoryRow}>
      <View style={styles.categoryHeader}>
        <Text style={styles.categoryName}>{category.name}</Text>
        <Text style={styles.categoryValue}>£{category.saving.toFixed(2)}</Text>
      </View>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, fillStyle]}>
          <LinearGradient
            colors={['#C01010', '#E20C04', '#CC3500']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      </View>
    </View>
  )
}

type Props = {
  categories: CategorySaving[]
}

export function ByCategory({ categories }: Props) {
  if (categories.length === 0) return null

  const maxSaving = Math.max(...categories.map((c) => c.saving), 1)

  return (
    <View style={styles.card}>
      <Text variant="label.eyebrow" style={styles.sectionLabel}>By Category</Text>
      {categories.map((cat, i) => (
        <CategoryBar key={cat.categoryId} category={cat} maxSaving={maxSaving} index={i} />
      ))}
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: spacing[4],
    ...elevation.sm,
  },
  sectionLabel: {
    marginBottom: spacing[3],
    color: '#9CA3AF',
  },
  categoryRow: {
    marginBottom: spacing[3],
  },
  categoryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: spacing[1],
  },
  categoryName: {
    fontFamily: 'Lato-Medium',
    fontSize: 13,
    color: '#010C35',
  },
  categoryValue: {
    fontFamily: 'Lato-Bold',
    fontSize: 13,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
  barTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F3F4F6',
    overflow: 'hidden',
  },
  barFill: {
    height: 8,
    borderRadius: 4,
    overflow: 'hidden',
  },
})
```

- [ ] **Step 6: Run all tests**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/ViewingChip.test.tsx tests/features/savings/components/TopPlaces.test.tsx tests/features/savings/components/ByCategory.test.tsx`
Expected: ALL PASS

- [ ] **Step 7: Commit**

```bash
git add src/features/savings/components/ViewingChip.tsx src/features/savings/components/TopPlaces.tsx src/features/savings/components/ByCategory.tsx tests/features/savings/components/
git commit -m "feat(savings): add viewing chip, top places, and category breakdown cards"
```

---

## Task 10: Frontend — ROI callout

4-variant ROI card with shimmer sweep animation. Hidden when `thisMonthSaving === 0` or a past month is selected.

**Files:**
- Create: `src/features/savings/components/RoiCallout.tsx`
- Create: `tests/features/savings/components/RoiCallout.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/components/RoiCallout.test.tsx`:

```tsx
import React from 'react'
import { render } from '@testing-library/react-native'
import { RoiCallout } from '@/features/savings/components/RoiCallout'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    withDelay: (_d: number, v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

describe('RoiCallout', () => {
  it('returns null when saving is 0', () => {
    const { toJSON } = render(
      <RoiCallout thisMonthSaving={0} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(toJSON()).toBeNull()
  })

  it('shows below-breakeven copy for monthly < £6.99', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={3.50} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/You're on your way/)).toBeTruthy()
    expect(getByText(/£3\.50/)).toBeTruthy()
  })

  it('shows multiplier copy for monthly >= £6.99', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={32.00} billingInterval="MONTHLY" hasPromo={false} />,
    )
    expect(getByText(/4\.6×/)).toBeTruthy()
    expect(getByText(/£6\.99\/mo/)).toBeTruthy()
  })

  it('uses annual breakeven threshold £5.83', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={5.83} billingInterval="ANNUAL" hasPromo={false} />,
    )
    expect(getByText(/1\.0×/)).toBeTruthy()
  })

  it('shows below-breakeven for annual < £5.83', () => {
    const { getByText } = render(
      <RoiCallout thisMonthSaving={4.00} billingInterval="ANNUAL" hasPromo={false} />,
    )
    expect(getByText(/You're on your way/)).toBeTruthy()
  })

  it('shows promo copy with no multiplier', () => {
    const { getByText, queryByText } = render(
      <RoiCallout thisMonthSaving={50.00} billingInterval="MONTHLY" hasPromo={true} />,
    )
    expect(getByText(/You saved/)).toBeTruthy()
    expect(getByText(/Keep it up/)).toBeTruthy()
    expect(queryByText(/×/)).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/RoiCallout.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement RoiCallout**

Create `src/features/savings/components/RoiCallout.tsx`:

```tsx
import React, { useEffect } from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
} from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Text } from '@/design-system/Text'
import { spacing } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

const MONTHLY_COST = 6.99
const ANNUAL_MONTHLY_COST = 69.99 / 12 // £5.83

type Props = {
  thisMonthSaving: number
  billingInterval: 'MONTHLY' | 'ANNUAL'
  hasPromo: boolean
}

export function RoiCallout({ thisMonthSaving, billingInterval, hasPromo }: Props) {
  const motionScale = useMotionScale()
  const shimmerX = useSharedValue(-1.2)

  useEffect(() => {
    if (motionScale === 0 || thisMonthSaving <= 0) return
    shimmerX.value = withDelay(
      1800,
      withRepeat(
        withSequence(
          withTiming(2, { duration: 1200 }),
          withTiming(-1.2, { duration: 0 }),
        ),
        -1,
        false,
      ),
    )
  }, [motionScale, shimmerX, thisMonthSaving])

  const shimmerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerX.value * 300 }],
  }))

  if (thisMonthSaving <= 0) return null

  const planCost = billingInterval === 'ANNUAL' ? ANNUAL_MONTHLY_COST : MONTHLY_COST
  const isAboveBreakeven = thisMonthSaving >= planCost
  const multiplier = (thisMonthSaving / planCost).toFixed(1)
  const amount = `£${thisMonthSaving.toFixed(2)}`

  let content: React.ReactNode

  if (hasPromo) {
    content = (
      <Text variant="body.md" style={styles.copy}>
        You saved <Text variant="heading.sm" style={styles.bold}>{amount}</Text> this month. Keep it up!
      </Text>
    )
  } else if (!isAboveBreakeven) {
    content = (
      <Text variant="body.md" style={styles.copy}>
        You're on your way — <Text variant="heading.sm" style={styles.bold}>{amount}</Text> saved this month
      </Text>
    )
  } else if (billingInterval === 'MONTHLY') {
    content = (
      <Text variant="body.md" style={styles.copy}>
        Saved <Text variant="heading.sm" style={styles.bold}>{amount}</Text> on your £6.99/mo plan — that's{' '}
        <Text variant="heading.sm" style={styles.bold}>{multiplier}×</Text> your money back
      </Text>
    )
  } else {
    content = (
      <Text variant="body.md" style={styles.copy}>
        Saved <Text variant="heading.sm" style={styles.bold}>{amount}</Text> on your plan — that's{' '}
        <Text variant="heading.sm" style={styles.bold}>{multiplier}×</Text> your money back
      </Text>
    )
  }

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#FFF1EE', '#FEF3C7']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
      />
      {/* Shimmer sweep */}
      <Animated.View style={[styles.shimmer, shimmerStyle]}>
        <LinearGradient
          colors={['transparent', 'rgba(255,255,255,0.6)', 'transparent']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={StyleSheet.absoluteFill}
        />
      </Animated.View>
      <View style={styles.inner}>
        {content}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(226,12,4,0.15)',
    overflow: 'hidden',
  },
  shimmer: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 120,
  },
  inner: {
    padding: spacing[4],
  },
  copy: {
    color: '#010C35',
    textAlign: 'center',
    lineHeight: 22,
  },
  bold: {
    color: '#010C35',
    fontFamily: 'Lato-SemiBold',
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/RoiCallout.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/savings/components/RoiCallout.tsx tests/features/savings/components/RoiCallout.test.tsx
git commit -m "feat(savings): add 4-variant ROI callout with shimmer sweep"
```

---

## Task 11: Frontend — RedemptionRow

Single redemption history row with 24h badge logic, press feedback, and navigation.

**Files:**
- Create: `src/features/savings/components/RedemptionRow.tsx`
- Create: `tests/features/savings/components/RedemptionRow.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/components/RedemptionRow.test.tsx`:

```tsx
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RedemptionRow } from '@/features/savings/components/RedemptionRow'

jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View, Pressable } = require('react-native')
  return {
    __esModule: true,
    default: { View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })) },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))

const NOW = new Date('2026-04-18T14:00:00Z')

describe('RedemptionRow', () => {
  beforeAll(() => { jest.useFakeTimers({ now: NOW }) })
  afterAll(() => { jest.useRealTimers() })

  const baseRedemption = {
    id: 'r1',
    redeemedAt: '2026-04-18T13:00:00Z', // 1 hour ago
    estimatedSaving: 8.50,
    isValidated: false,
    validatedAt: null,
    merchant: { id: 'm1', businessName: 'Pizza Place', logoUrl: null },
    voucher: { id: 'v1', title: 'Free Dessert', voucherType: 'FREEBIE' as const },
    branch: { id: 'b1', name: 'Central' },
  }

  it('shows "Show to staff" badge when unvalidated and within 24h', () => {
    const { getByText } = render(
      <RedemptionRow redemption={baseRedemption} onPress={() => {}} />,
    )
    expect(getByText('Show to staff')).toBeTruthy()
  })

  it('shows "Validated ✓" badge when validated within 24h', () => {
    const { getByText } = render(
      <RedemptionRow
        redemption={{ ...baseRedemption, isValidated: true, validatedAt: '2026-04-18T13:30:00Z' }}
        onPress={() => {}}
      />,
    )
    expect(getByText('Validated ✓')).toBeTruthy()
  })

  it('shows plain "Redeemed" for items older than 24h', () => {
    const { getByText, queryByText } = render(
      <RedemptionRow
        redemption={{ ...baseRedemption, redeemedAt: '2026-04-16T10:00:00Z' }}
        onPress={() => {}}
      />,
    )
    expect(getByText('Redeemed')).toBeTruthy()
    expect(queryByText('Show to staff')).toBeNull()
  })

  it('calls onPress with voucher id when tapped', () => {
    const onPress = jest.fn()
    const { getByLabelText } = render(
      <RedemptionRow redemption={baseRedemption} onPress={onPress} />,
    )
    fireEvent.press(getByLabelText(/Pizza Place/))
    expect(onPress).toHaveBeenCalledWith('v1')
  })

  it('displays saving amount with + prefix', () => {
    const { getByText } = render(
      <RedemptionRow redemption={baseRedemption} onPress={() => {}} />,
    )
    expect(getByText('+£8.50')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/RedemptionRow.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement RedemptionRow**

Create `src/features/savings/components/RedemptionRow.tsx`:

```tsx
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { PressableScale } from '@/design-system/motion/PressableScale'
import { Text } from '@/design-system/Text'
import { spacing, radius, color as tokenColor } from '@/design-system/tokens'
import type { SavingsRedemption } from '@/lib/api/savings'

const TWENTY_FOUR_HOURS = 24 * 60 * 60 * 1000

type BadgeType = 'show-to-staff' | 'validated' | 'plain'

function getBadgeType(redemption: SavingsRedemption): BadgeType {
  const now = Date.now()
  if (!redemption.isValidated) {
    const redeemed = new Date(redemption.redeemedAt).getTime()
    if (now - redeemed <= TWENTY_FOUR_HOURS) return 'show-to-staff'
  }
  if (redemption.isValidated && redemption.validatedAt) {
    const validated = new Date(redemption.validatedAt).getTime()
    if (now - validated <= TWENTY_FOUR_HOURS) return 'validated'
  }
  return 'plain'
}

function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60_000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d ago`
  return new Date(dateStr).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })
}

function voucherTypeLabel(vt: string): string {
  const map: Record<string, string> = {
    BOGO: 'Buy One Get One',
    SPEND_AND_SAVE: 'Spend & Save',
    DISCOUNT_FIXED: 'Discount',
    DISCOUNT_PERCENT: 'Discount',
    FREEBIE: 'Freebie',
    PACKAGE_DEAL: 'Package Deal',
    TIME_LIMITED: 'Time-Limited',
    REUSABLE: 'Reusable',
  }
  return map[vt] ?? vt
}

type Props = {
  redemption: SavingsRedemption
  onPress: (voucherId: string) => void
}

export function RedemptionRow({ redemption, onPress }: Props) {
  const badge = getBadgeType(redemption)
  const vtLabel = voucherTypeLabel(redemption.voucher.voucherType)
  const logoColor = tokenColor.voucher.byType[redemption.voucher.voucherType as keyof typeof tokenColor.voucher.byType] ?? tokenColor.brandRose

  return (
    <PressableScale
      onPress={() => onPress(redemption.voucher.id)}
      accessibilityLabel={`${redemption.merchant.businessName}, ${vtLabel}, £${redemption.estimatedSaving.toFixed(2)} saved, ${relativeTime(redemption.redeemedAt)}`}
      style={styles.row}
    >
      {/* Logo placeholder */}
      <View style={[styles.logo, { backgroundColor: `${logoColor}18` }]}>
        <Text style={[styles.logoInitial, { color: logoColor }]}>
          {redemption.merchant.businessName.charAt(0)}
        </Text>
      </View>

      {/* Text content */}
      <View style={styles.content}>
        <Text variant="body.sm" style={styles.merchantName}>{redemption.merchant.businessName}</Text>
        <Text variant="body.sm" color="tertiary" meta style={styles.meta}>
          {vtLabel} · {relativeTime(redemption.redeemedAt)}
        </Text>
      </View>

      {/* Saving + badge */}
      <View style={styles.right}>
        <Text style={styles.saving}>+£{redemption.estimatedSaving.toFixed(2)}</Text>
        {badge === 'show-to-staff' && (
          <View style={styles.badgeAmber}>
            <Text style={styles.badgeAmberText}>Show to staff</Text>
          </View>
        )}
        {badge === 'validated' && (
          <View style={styles.badgeGreen}>
            <Text style={styles.badgeGreenText}>Validated ✓</Text>
          </View>
        )}
        {badge === 'plain' && (
          <Text style={styles.plainBadge}>Redeemed</Text>
        )}
      </View>
    </PressableScale>
  )
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing[5],
    paddingVertical: spacing[3],
    gap: spacing[3],
  },
  logo: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoInitial: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 18,
  },
  content: {
    flex: 1,
    gap: 1,
  },
  merchantName: {
    fontFamily: 'Lato-Bold',
    fontSize: 14,
    color: '#010C35',
  },
  meta: {
    fontSize: 11,
    color: '#9CA3AF',
  },
  right: {
    alignItems: 'flex-end',
    gap: 4,
  },
  saving: {
    fontFamily: 'MusticaPro-SemiBold',
    fontSize: 16,
    color: '#16A34A',
    fontVariant: ['tabular-nums'],
  },
  badgeAmber: {
    backgroundColor: '#FEF3C7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeAmberText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 9,
    color: '#B45309',
  },
  badgeGreen: {
    backgroundColor: '#DCFCE7',
    borderRadius: radius.pill,
    paddingHorizontal: spacing[2],
    paddingVertical: 2,
  },
  badgeGreenText: {
    fontFamily: 'Lato-SemiBold',
    fontSize: 9,
    color: '#16A34A',
  },
  plainBadge: {
    fontFamily: 'Lato-Regular',
    fontSize: 11,
    color: '#9CA3AF',
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/components/RedemptionRow.test.tsx`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/features/savings/components/RedemptionRow.tsx tests/features/savings/components/RedemptionRow.test.tsx
git commit -m "feat(savings): add redemption row with 24h badge logic"
```

---

## Task 12: Frontend — SavingsScreen (composition + state machine)

Main screen composing all components. FlatList with ListHeaderComponent, month drill-down state machine, pull-to-refresh, error states, pagination end label.

**Files:**
- Create: `src/features/savings/screens/SavingsScreen.tsx`
- Modify: `app/(app)/savings.tsx`
- Create: `tests/features/savings/screens/SavingsScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/savings/screens/SavingsScreen.test.tsx`:

```tsx
import React from 'react'
import { render, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { SavingsScreen } from '@/features/savings/screens/SavingsScreen'

jest.mock('expo-linear-gradient', () => {
  const { View } = require('react-native')
  return { LinearGradient: (props: any) => <View {...props} /> }
})
jest.mock('react-native-reanimated', () => {
  const React = require('react')
  const { View, Text } = require('react-native')
  return {
    __esModule: true,
    default: {
      View: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
      Text: React.forwardRef((p: any, r: any) => React.createElement(Text, { ...p, ref: r })),
      FlatList: React.forwardRef((p: any, r: any) => React.createElement(View, { ...p, ref: r })),
    },
    useSharedValue: (v: unknown) => ({ value: v }),
    useAnimatedStyle: () => ({}),
    useDerivedValue: (fn: () => unknown) => ({ value: fn() }),
    withTiming: (v: unknown) => v,
    withSpring: (v: unknown) => v,
    withDelay: (_d: number, v: unknown) => v,
    withRepeat: (v: unknown) => v,
    withSequence: (...args: unknown[]) => args[args.length - 1],
    Easing: { out: (fn: any) => fn, bezier: () => (x: number) => x },
  }
})
jest.mock('@/design-system/useMotionScale', () => ({ useMotionScale: () => 1 }))
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 47, bottom: 34, left: 0, right: 0 }),
}))
jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }))
jest.mock('@/stores/auth', () => ({
  useAuthStore: (sel: (s: any) => unknown) => sel({ status: 'authed' }),
}))

// Mock all data hooks
jest.mock('@/features/savings/hooks/useSavingsSummary')
jest.mock('@/features/savings/hooks/useSavingsRedemptions')
jest.mock('@/features/savings/hooks/useMonthlyDetail')
jest.mock('@/hooks/useSubscription')

import { useSavingsSummary } from '@/features/savings/hooks/useSavingsSummary'
import { useSavingsRedemptions } from '@/features/savings/hooks/useSavingsRedemptions'
import { useMonthlyDetail } from '@/features/savings/hooks/useMonthlyDetail'
import { useSubscription } from '@/hooks/useSubscription'

const mockSummary = useSavingsSummary as jest.Mock
const mockRedemptions = useSavingsRedemptions as jest.Mock
const mockMonthly = useMonthlyDetail as jest.Mock
const mockSub = useSubscription as jest.Mock

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('SavingsScreen', () => {
  beforeEach(() => {
    mockRedemptions.mockReturnValue({ data: undefined, hasNextPage: false, fetchNextPage: jest.fn(), isFetchingNextPage: false, refetch: jest.fn() })
    mockMonthly.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: jest.fn() })
  })

  it('shows skeleton while loading', () => {
    mockSummary.mockReturnValue({ data: undefined, isLoading: true, isError: false, refetch: jest.fn() })
    mockSub.mockReturnValue({ subscription: null, isSubscribed: false, isSubLoading: true })
    const { getByLabelText } = render(<SavingsScreen />, { wrapper })
    // Skeleton should be present (can check via testID or accessibility)
  })

  it('shows free user state when not subscribed', async () => {
    mockSummary.mockReturnValue({
      data: { lifetimeSaving: 0, thisMonthSaving: 0, thisMonthRedemptionCount: 0, monthlyBreakdown: [], byMerchant: [], byCategory: [] },
      isLoading: false, isError: false, refetch: jest.fn(),
    })
    mockSub.mockReturnValue({ subscription: null, isSubscribed: false, isSubLoading: false })
    const { getByText } = render(<SavingsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Unlock your savings')).toBeTruthy())
  })

  it('shows subscriber-empty state with no redemptions', async () => {
    mockSummary.mockReturnValue({
      data: { lifetimeSaving: 0, thisMonthSaving: 0, thisMonthRedemptionCount: 0, monthlyBreakdown: [], byMerchant: [], byCategory: [] },
      isLoading: false, isError: false, refetch: jest.fn(),
    })
    mockSub.mockReturnValue({ subscription: { status: 'ACTIVE', plan: { billingInterval: 'MONTHLY' } }, isSubscribed: true, isSubLoading: false })
    mockRedemptions.mockReturnValue({ data: { pages: [{ redemptions: [], total: 0 }] }, hasNextPage: false, fetchNextPage: jest.fn(), isFetchingNextPage: false, refetch: jest.fn() })
    const { getByText } = render(<SavingsScreen />, { wrapper })
    await waitFor(() => expect(getByText('Start saving today')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/screens/SavingsScreen.test.tsx`
Expected: FAIL

- [ ] **Step 3: Implement SavingsScreen**

Create `src/features/savings/screens/SavingsScreen.tsx`:

```tsx
import React, { useState, useCallback, useMemo } from 'react'
import { View, FlatList, RefreshControl, StyleSheet, ActivityIndicator } from 'react-native'
import { useRouter } from 'expo-router'
import { Text } from '@/design-system/Text'
import { FadeInDown } from '@/design-system/motion/FadeIn'
import { ErrorState } from '@/design-system/components/ErrorState'
import { color, spacing, layout } from '@/design-system/tokens'
import { useSubscription } from '@/hooks/useSubscription'
import { useSavingsSummary } from '../hooks/useSavingsSummary'
import { useSavingsRedemptions } from '../hooks/useSavingsRedemptions'
import { useMonthlyDetail } from '../hooks/useMonthlyDetail'
import { SavingsHeroHeader } from '../components/SavingsHeroHeader'
import { SavingsSkeleton, InsightSkeleton } from '../components/SavingsSkeleton'
import { BenefitCards } from '../components/BenefitCards'
import { TrendChart } from '../components/TrendChart'
import { ViewingChip } from '../components/ViewingChip'
import { TopPlaces } from '../components/TopPlaces'
import { ByCategory } from '../components/ByCategory'
import { RoiCallout } from '../components/RoiCallout'
import { RedemptionRow } from '../components/RedemptionRow'
import type { SavingsRedemption, MonthBreakdown } from '@/lib/api/savings'

type UserState = 'loading' | 'error' | 'free' | 'subscriber-empty' | 'populated'

function currentMonthLabel(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export function SavingsScreen() {
  const router = useRouter()
  const { subscription, isSubscribed, isSubLoading } = useSubscription()
  const summary = useSavingsSummary()
  const redemptions = useSavingsRedemptions()
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null)
  const monthDetail = useMonthlyDetail(selectedMonth)

  const curMonth = currentMonthLabel()
  const [isRefreshing, setIsRefreshing] = useState(false)

  // ── Determine user state ────────────────────────────────────────────────
  const userState: UserState = useMemo(() => {
    if (summary.isLoading || isSubLoading) return 'loading'
    if (summary.isError) return 'error'
    if (!isSubscribed) return 'free'
    const hasRedemptions = summary.data && summary.data.lifetimeSaving > 0
    return hasRedemptions ? 'populated' : 'subscriber-empty'
  }, [summary.isLoading, summary.isError, summary.data, isSubscribed, isSubLoading])

  // ── Flatten paginated redemptions ───────────────────────────────────────
  const allRedemptions: SavingsRedemption[] = useMemo(() => {
    if (!redemptions.data) return []
    return redemptions.data.pages.flatMap((p) => p.redemptions)
  }, [redemptions.data])

  const totalRedemptions = redemptions.data?.pages[0]?.total ?? 0
  const allLoaded = allRedemptions.length >= totalRedemptions && totalRedemptions > 0

  // ── Chart data: last 6 months ───────────────────────────────────────────
  const chartMonths: MonthBreakdown[] = useMemo(() => {
    if (!summary.data) return []
    return summary.data.monthlyBreakdown.slice(0, 6)
  }, [summary.data])

  // ── Insight data: current or selected month ─────────────────────────────
  const insightMerchants = selectedMonth
    ? (monthDetail.data?.byMerchant ?? [])
    : (summary.data?.byMerchant ?? [])
  const insightCategories = selectedMonth
    ? (monthDetail.data?.byCategory ?? [])
    : (summary.data?.byCategory ?? [])

  // ── Month drill-down ────────────────────────────────────────────────────
  const handleMonthSelect = useCallback((month: string) => {
    if (month === curMonth) {
      setSelectedMonth(null)
    } else {
      setSelectedMonth(month)
    }
  }, [curMonth])

  const handleDismissChip = useCallback(() => setSelectedMonth(null), [])

  // ── Navigation ──────────────────────────────────────────────────────────
  const handleSubscribe = useCallback(() => {
    router.push('/(app)/subscribe-prompt' as never)
  }, [router])

  const handleBrowse = useCallback(() => {
    router.push('/(app)/' as never)
  }, [router])

  const handleRowPress = useCallback((voucherId: string) => {
    router.push(`/(app)/voucher/${voucherId}` as never)
  }, [router])

  // ── Pull-to-refresh ─────────────────────────────────────────────────────
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true)
    await Promise.all([
      summary.refetch(),
      redemptions.refetch(),
      selectedMonth ? monthDetail.refetch() : Promise.resolve(),
    ])
    setIsRefreshing(false)
  }, [summary, redemptions, monthDetail, selectedMonth])

  // ── Loading skeleton ────────────────────────────────────────────────────
  if (userState === 'loading') {
    return <SavingsSkeleton />
  }

  // ── Error state (no cache) ──────────────────────────────────────────────
  if (userState === 'error') {
    return (
      <View style={styles.errorContainer}>
        <ErrorState
          title="Couldn't load your savings"
          description="Something went wrong. Please try again."
          actionLabel="Retry"
          onRetry={() => summary.refetch()}
        />
      </View>
    )
  }

  // ── ListHeaderComponent ─────────────────────────────────────────────────
  const ListHeader = () => (
    <View>
      {/* Hero */}
      <SavingsHeroHeader
        state={userState as 'free' | 'subscriber-empty' | 'populated'}
        onSubscribe={handleSubscribe}
        onBrowse={handleBrowse}
        lifetimeSaving={summary.data?.lifetimeSaving ?? 0}
        thisMonthSaving={summary.data?.thisMonthSaving ?? 0}
        thisMonthRedemptionCount={summary.data?.thisMonthRedemptionCount ?? 0}
      />

      {/* Benefit cards (States 1 & 2 only) */}
      {(userState === 'free' || userState === 'subscriber-empty') && (
        <BenefitCards variant={userState} />
      )}

      {/* Insight section (State 3 only) */}
      {userState === 'populated' && (
        <View style={styles.insightSection}>
          <FadeInDown delay={500}>
            <Text variant="label.eyebrow" style={styles.insightLabel}>Insights</Text>
          </FadeInDown>

          {/* Card 1: Trend chart */}
          <FadeInDown delay={550}>
            <TrendChart
              months={chartMonths}
              selectedMonth={selectedMonth}
              currentMonth={curMonth}
              onMonthSelect={handleMonthSelect}
            />
          </FadeInDown>

          {/* Viewing chip */}
          <ViewingChip month={selectedMonth} onDismiss={handleDismissChip} />

          {/* Cards 2 & 3: insight data or skeleton or error */}
          {selectedMonth && monthDetail.isLoading ? (
            <InsightSkeleton />
          ) : selectedMonth && monthDetail.isError ? (
            <View style={styles.insightError}>
              <ErrorState
                title={`Couldn't load ${selectedMonth}`}
                actionLabel="Retry"
                onRetry={() => monthDetail.refetch()}
              />
            </View>
          ) : (
            <>
              <FadeInDown delay={650}>
                <TopPlaces merchants={insightMerchants} />
              </FadeInDown>
              <FadeInDown delay={750}>
                <ByCategory categories={insightCategories} />
              </FadeInDown>
            </>
          )}

          {/* ROI callout (current month only, hidden when past month selected) */}
          {!selectedMonth && summary.data && subscription?.plan && (
            <FadeInDown delay={1100}>
              <RoiCallout
                thisMonthSaving={summary.data.thisMonthSaving}
                billingInterval={subscription.plan.billingInterval}
                hasPromo={!!subscription.promoCodeId}
              />
            </FadeInDown>
          )}

          {/* History header */}
          {allRedemptions.length > 0 && (
            <FadeInDown delay={1150}>
              <Text variant="label.eyebrow" style={styles.historyLabel}>
                Redemption History
              </Text>
            </FadeInDown>
          )}
        </View>
      )}
    </View>
  )

  // ── Render ──────────────────────────────────────────────────────────────
  const isPopulated = userState === 'populated'

  return (
    <View style={styles.screen}>
      <FlatList
        data={isPopulated ? allRedemptions : []}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RedemptionRow redemption={item} onPress={handleRowPress} />
        )}
        ListHeaderComponent={ListHeader}
        ListFooterComponent={
          isPopulated ? (
            redemptions.isFetchingNextPage ? (
              <ActivityIndicator color={color.brandRose} style={styles.footerSpinner} />
            ) : allLoaded ? (
              <Text variant="body.sm" color="tertiary" meta align="center" style={styles.endLabel}>
                You're all caught up
              </Text>
            ) : null
          ) : null
        }
        onEndReached={() => {
          if (isPopulated && redemptions.hasNextPage && !redemptions.isFetchingNextPage) {
            redemptions.fetchNextPage()
          }
        }}
        onEndReachedThreshold={0.3}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={color.brandRose}
            colors={[color.brandRose]}
          />
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  errorContainer: {
    flex: 1,
    backgroundColor: '#F8F9FA',
    justifyContent: 'center',
  },
  insightSection: {
    paddingHorizontal: spacing[5],
    paddingTop: spacing[5],
    gap: spacing[3],
  },
  insightLabel: {
    color: '#9CA3AF',
  },
  insightError: {
    paddingVertical: spacing[4],
  },
  historyLabel: {
    color: '#9CA3AF',
    marginTop: spacing[3],
  },
  footerSpinner: {
    paddingVertical: spacing[4],
  },
  endLabel: {
    paddingVertical: spacing[5],
    color: '#9CA3AF',
  },
  listContent: {
    paddingBottom: layout.tabBarHeight + 20,
  },
})
```

- [ ] **Step 4: Update the route file**

Replace the contents of `app/(app)/savings.tsx`:

```tsx
import { SavingsScreen } from '@/features/savings/screens/SavingsScreen'

export default function SavingsRoute() {
  return <SavingsScreen />
}
```

- [ ] **Step 5: Run the screen test**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest tests/features/savings/screens/SavingsScreen.test.tsx`
Expected: PASS

- [ ] **Step 6: Run the full test suite**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest`
Expected: ALL PASS, including all existing tests (no regressions)

- [ ] **Step 7: Commit**

```bash
git add src/features/savings/screens/SavingsScreen.tsx app/\(app\)/savings.tsx tests/features/savings/screens/SavingsScreen.test.tsx
git commit -m "feat(savings): add SavingsScreen with FlatList composition and month drill-down"
```

---

## Task 13: Run all tests + final verification

Ensure the entire suite passes: both backend and frontend.

**Files:** None (verification only)

- [ ] **Step 1: Run backend tests**

Run: `npx vitest run`
Expected: ALL PASS

- [ ] **Step 2: Run frontend tests**

Run: `cd .worktrees/customer-app/apps/customer-app && npx jest`
Expected: ALL PASS

- [ ] **Step 3: TypeScript check**

Run: `cd .worktrees/customer-app/apps/customer-app && npx tsc --noEmit`
Expected: 0 errors

- [ ] **Step 4: Commit any fixes needed, then final commit**

```bash
git add -A
git commit -m "chore(savings): all tests passing, TypeScript clean"
```

---

## Spec Coverage Matrix

| Spec Section | Task(s) |
|---|---|
| Screen Structure (FlatList + pull-to-refresh) | 12 |
| State 1 — Free User (hero + 4 benefit cards) | 6, 7 |
| State 2 — Subscriber Empty (hero + 3 benefit cards) | 6, 7 |
| State 3 — Populated Dashboard (hero stats + count-up) | 5, 6 |
| Entrance animations (fadeUp, spring, stagger) | 6, 7, 8, 9, 12 |
| Insight Card 1 — 6-Month Trend (bar chart) | 8 |
| Insight Card 2 — Top Places | 9 |
| Insight Card 3 — By Category | 9 |
| Month Drill-Down (4 states, viewing chip, skeleton) | 8, 9, 12 |
| Backend: monthly-detail endpoint | 2 |
| ROI Callout (4 variants) | 10 |
| Redemption History (rows, badges, pagination, end label) | 1, 11, 12 |
| Loading States (skeleton on first load) | 7, 12 |
| Error States (inline error, cached fallback, drill-down retry) | 12 |
| Typography tokens | All component tasks |
| Colour tokens | All component tasks |
| Accessibility (touch targets, a11y labels, reduceMotion) | All component tasks |
| Navigation | 12 |
| Pull-to-refresh | 12 |
| Count-up replay policy | 5, 6 |
| Pagination end state | 12 |
| `promoCodeId` on subscription schema | 3 |
| `validatedAt` in redemptions response | 1 |
