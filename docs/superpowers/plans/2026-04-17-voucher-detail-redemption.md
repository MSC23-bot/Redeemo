# Voucher Detail + Redemption Flow — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete Voucher Detail screen (12 states) and PIN-based Redemption flow for the Redeemo customer app (React Native / Expo).

**Architecture:** Feature module at `src/features/voucher/` with screens, components, and hooks. Coupon-style visual design with type-coloured headers, circular cutouts, dashed perforation lines. PIN entry via bottom sheet with native numeric keypad. Post-redemption success popup + full-screen Show to Staff anti-fraud screen. All visual specs come from the design spec at `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md` — no deviations.

**Tech Stack:** React Native (Expo SDK 54), expo-router v4, react-native-reanimated, moti, @tanstack/react-query, zustand, lucide-react-native, expo-haptics

**Design Spec:** `docs/superpowers/specs/2026-04-17-voucher-detail-redemption-design.md`

---

## File Structure

```
apps/customer-app/
├── app/(app)/
│   └── voucher/
│       └── [id].tsx                          # Route: voucher detail screen
├── src/
│   ├── design-system/
│   │   └── tokens.ts                         # Modify: add voucher type colours
│   ├── features/
│   │   └── voucher/
│   │       ├── screens/
│   │       │   └── VoucherDetailScreen.tsx    # Main screen orchestrator
│   │       ├── components/
│   │       │   ├── CouponHeader.tsx           # Type-coloured header with nav + save badge
│   │       │   ├── PerforationLine.tsx        # Coupon tear line with circular cutouts
│   │       │   ├── CouponCardTop.tsx          # Banner image + voucher details pills
│   │       │   ├── CouponBody.tsx             # Terms & conditions + fair use policy
│   │       │   ├── MerchantRow.tsx            # Merchant card below coupon
│   │       │   ├── HowItWorks.tsx             # 4-step timeline
│   │       │   ├── RedeemCTA.tsx              # Sticky bottom CTA (all states)
│   │       │   ├── TimeLimitedBanner.tsx       # Countdown / expired / availability banners
│   │       │   ├── RedeemedBadge.tsx          # Green/red badge positioned outside header
│   │       │   ├── PinEntrySheet.tsx          # Bottom sheet: PIN input, error, lockout
│   │       │   ├── PinBox.tsx                 # Individual PIN digit box
│   │       │   ├── SuccessPopup.tsx           # Screen 7: compact floating modal
│   │       │   ├── ShowToStaff.tsx            # Screen 7b: full-screen anti-fraud
│   │       │   └── RedemptionDetailsCard.tsx  # Screen 8: code + QR + branch info
│   │       └── hooks/
│   │           ├── useVoucherDetail.ts        # Query: GET /api/v1/customer/vouchers/:id
│   │           ├── useRedeem.ts               # Mutation: POST /api/v1/redemption
│   │           ├── useRedemptionDetail.ts     # Query: GET /api/v1/redemption/my/:id
│   │           └── useTimeLimited.ts          # Timer logic: countdown, availability window
│   ├── lib/
│   │   └── api/
│   │       └── redemption.ts                 # API client: redemption endpoints
│   └── hooks/
│       └── useFavourite.ts                   # Mutation: add/remove favourites (shared)
├── tests/
│   └── features/
│       └── voucher/
│           ├── screens/
│           │   └── VoucherDetailScreen.test.tsx
│           ├── components/
│           │   ├── CouponHeader.test.tsx
│           │   ├── PinEntrySheet.test.tsx
│           │   ├── SuccessPopup.test.tsx
│           │   ├── ShowToStaff.test.tsx
│           │   ├── TimeLimitedBanner.test.tsx
│           │   └── RedeemCTA.test.tsx
│           └── hooks/
│               ├── useVoucherDetail.test.ts
│               ├── useRedeem.test.ts
│               └── useTimeLimited.test.ts
```

---

## Task 1: Design Tokens — Voucher Type Colours

**Files:**
- Modify: `apps/customer-app/src/design-system/tokens.ts`
- Test: `tests/design-system/tokens.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/design-system/voucher-type-colours.test.ts`:

```typescript
import { color } from '@/design-system/tokens'

describe('voucher type colours', () => {
  it('exposes all 7 voucher type colours', () => {
    expect(color.voucher.bogo).toBe('#7C3AED')
    expect(color.voucher.discount).toBe('#E20C04')
    expect(color.voucher.freebie).toBe('#16A34A')
    expect(color.voucher.spendSave).toBe('#E84A00')
    expect(color.voucher.package).toBe('#2563EB')
    expect(color.voucher.timeLimited).toBe('#D97706')
    expect(color.voucher.reusable).toBe('#0D9488')
  })

  it('maps VoucherType enum strings to colours', () => {
    expect(color.voucher.byType.BOGO).toBe('#7C3AED')
    expect(color.voucher.byType.DISCOUNT_FIXED).toBe('#E20C04')
    expect(color.voucher.byType.DISCOUNT_PERCENT).toBe('#E20C04')
    expect(color.voucher.byType.FREEBIE).toBe('#16A34A')
    expect(color.voucher.byType.SPEND_AND_SAVE).toBe('#E84A00')
    expect(color.voucher.byType.PACKAGE_DEAL).toBe('#2563EB')
    expect(color.voucher.byType.TIME_LIMITED).toBe('#D97706')
    expect(color.voucher.byType.REUSABLE).toBe('#0D9488')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/design-system/voucher-type-colours.test.ts --no-coverage`
Expected: FAIL — `color.voucher` is undefined

- [ ] **Step 3: Add voucher type colours to tokens**

In `src/design-system/tokens.ts`, add inside the `color` object (after the `pin` block):

```typescript
voucher: {
  bogo: '#7C3AED',
  discount: '#E20C04',
  freebie: '#16A34A',
  spendSave: '#E84A00',
  package: '#2563EB',
  timeLimited: '#D97706',
  reusable: '#0D9488',
  byType: {
    BOGO: '#7C3AED',
    DISCOUNT_FIXED: '#E20C04',
    DISCOUNT_PERCENT: '#E20C04',
    FREEBIE: '#16A34A',
    SPEND_AND_SAVE: '#E84A00',
    PACKAGE_DEAL: '#2563EB',
    TIME_LIMITED: '#D97706',
    REUSABLE: '#0D9488',
  },
} as const,
```

Also add the `savingsGreen` token referenced in the spec:

```typescript
savingsGreen: '#16A34A',
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/design-system/voucher-type-colours.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/design-system/tokens.ts tests/design-system/voucher-type-colours.test.ts
git commit -m "feat(tokens): add voucher type colour palette and byType lookup map"
```

---

## Task 2: API Client — Redemption Endpoints

**Files:**
- Create: `apps/customer-app/src/lib/api/redemption.ts`
- Test: `apps/customer-app/tests/lib/api/redemption.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/lib/api/redemption.test.ts`:

```typescript
import { redemptionApi, type VoucherDetail, type RedemptionResponse, type RedemptionDetail } from '@/lib/api/redemption'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: {
    get: jest.fn(),
    post: jest.fn(),
    del: jest.fn(),
  },
}))

const mockApi = api as jest.Mocked<typeof api>

describe('redemptionApi', () => {
  beforeEach(() => jest.clearAllMocks())

  describe('getVoucherDetail', () => {
    it('calls GET /api/v1/customer/vouchers/:id', async () => {
      const voucher: VoucherDetail = {
        id: 'v1',
        title: 'Buy One Get One Free',
        type: 'BOGO',
        description: 'Get a free pizza',
        terms: 'Valid Mon–Fri',
        imageUrl: null,
        estimatedSaving: 12.99,
        expiryDate: null,
        code: 'RMV-001',
        status: 'ACTIVE',
        approvalStatus: 'APPROVED',
        isRedeemedThisCycle: false,
        isFavourited: false,
        merchant: {
          id: 'm1',
          businessName: 'Pizza Palace',
          tradingName: null,
          logoUrl: null,
          status: 'ACTIVE',
        },
      }
      mockApi.get.mockResolvedValue(voucher)

      const result = await redemptionApi.getVoucherDetail('v1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/v1/customer/vouchers/v1')
      expect(result).toEqual(voucher)
    })
  })

  describe('redeem', () => {
    it('calls POST /api/v1/redemption with voucherId, branchId, pin', async () => {
      const response: RedemptionResponse = {
        id: 'r1',
        userId: 'u1',
        voucherId: 'v1',
        branchId: 'b1',
        redemptionCode: 'ABC1234567',
        estimatedSaving: 12.99,
        isValidated: false,
        redeemedAt: '2026-04-17T10:00:00Z',
      }
      mockApi.post.mockResolvedValue(response)

      const result = await redemptionApi.redeem({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
      expect(mockApi.post).toHaveBeenCalledWith('/api/v1/redemption', { voucherId: 'v1', branchId: 'b1', pin: '1234' })
      expect(result).toEqual(response)
    })
  })

  describe('getMyRedemption', () => {
    it('calls GET /api/v1/redemption/my/:id', async () => {
      const detail: RedemptionDetail = {
        id: 'r1',
        userId: 'u1',
        voucherId: 'v1',
        branchId: 'b1',
        redemptionCode: 'ABC1234567',
        isValidated: true,
        validatedAt: '2026-04-17T10:05:00Z',
        validationMethod: 'QR_SCAN',
        estimatedSaving: 12.99,
        redeemedAt: '2026-04-17T10:00:00Z',
        validatedById: 'staff1',
        voucher: { id: 'v1', title: 'BOGO Pizza', terms: 'Valid Mon-Fri', merchant: { businessName: 'Pizza Palace' } },
        branch: { id: 'b1', name: 'High Street', addressLine1: '123 High St', city: 'London', postcode: 'SW1A 1AA' },
      }
      mockApi.get.mockResolvedValue(detail)

      const result = await redemptionApi.getMyRedemption('r1')
      expect(mockApi.get).toHaveBeenCalledWith('/api/v1/redemption/my/r1')
      expect(result).toEqual(detail)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/lib/api/redemption.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the API client**

Create `src/lib/api/redemption.ts`:

```typescript
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

export type VoucherDetail = {
  id: string
  title: string
  type: VoucherType
  description: string | null
  terms: string | null
  imageUrl: string | null
  estimatedSaving: number
  expiryDate: string | null
  code: string
  status: string
  approvalStatus: string
  isRedeemedThisCycle: boolean
  isFavourited: boolean
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    status: string
  }
}

export type RedemptionResponse = {
  id: string
  userId: string
  voucherId: string
  branchId: string
  redemptionCode: string
  estimatedSaving: number
  isValidated: boolean
  redeemedAt: string
}

export type RedemptionDetail = {
  id: string
  userId: string
  voucherId: string
  branchId: string
  redemptionCode: string
  isValidated: boolean
  validatedAt: string | null
  validationMethod: 'QR_SCAN' | 'MANUAL' | null
  estimatedSaving: number
  redeemedAt: string
  validatedById: string | null
  voucher: {
    id: string
    title: string
    terms: string | null
    merchant: { businessName: string }
  }
  branch: {
    id: string
    name: string
    addressLine1: string
    city: string
    postcode: string
  }
}

export type RedeemParams = {
  voucherId: string
  branchId: string
  pin: string
}

export const redemptionApi = {
  getVoucherDetail(id: string) {
    return api.get<VoucherDetail>(`/api/v1/customer/vouchers/${id}`)
  },

  redeem(params: RedeemParams) {
    return api.post<RedemptionResponse>('/api/v1/redemption', params)
  },

  getMyRedemption(id: string) {
    return api.get<RedemptionDetail>(`/api/v1/redemption/my/${id}`)
  },

  getMyRedemptions(params: { limit?: number; offset?: number } = {}) {
    const qs = new URLSearchParams()
    if (params.limit) qs.set('limit', String(params.limit))
    if (params.offset) qs.set('offset', String(params.offset))
    const query = qs.toString()
    return api.get<RedemptionDetail[]>(`/api/v1/redemption/my${query ? `?${query}` : ''}`)
  },
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/lib/api/redemption.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/redemption.ts apps/customer-app/tests/lib/api/redemption.test.ts
git commit -m "feat(api): add redemption API client with types for voucher detail and redemption"
```

---

## Task 3: Hooks — useVoucherDetail + useRedeem

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useVoucherDetail.ts`
- Create: `apps/customer-app/src/features/voucher/hooks/useRedeem.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useVoucherDetail.test.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useRedeem.test.ts`

- [ ] **Step 1: Write the failing test for useVoucherDetail**

Create `tests/features/voucher/hooks/useVoucherDetail.test.ts`:

```typescript
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useVoucherDetail } from '@/features/voucher/hooks/useVoucherDetail'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getVoucherDetail: jest.fn() },
}))

const mockGetVoucherDetail = redemptionApi.getVoucherDetail as jest.MockedFunction<typeof redemptionApi.getVoucherDetail>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useVoucherDetail', () => {
  it('fetches voucher detail by id', async () => {
    const voucher = {
      id: 'v1', title: 'BOGO Pizza', type: 'BOGO' as const,
      description: null, terms: null, imageUrl: null,
      estimatedSaving: 10, expiryDate: null, code: 'RMV-001',
      status: 'ACTIVE', approvalStatus: 'APPROVED',
      isRedeemedThisCycle: false, isFavourited: false,
      merchant: { id: 'm1', businessName: 'Pizza Palace', tradingName: null, logoUrl: null, status: 'ACTIVE' },
    }
    mockGetVoucherDetail.mockResolvedValue(voucher)

    const { result } = renderHook(() => useVoucherDetail('v1'), { wrapper })
    await waitFor(() => expect(result.current.data).toEqual(voucher))
    expect(mockGetVoucherDetail).toHaveBeenCalledWith('v1')
  })

  it('does not fetch when id is undefined', () => {
    renderHook(() => useVoucherDetail(undefined), { wrapper })
    expect(mockGetVoucherDetail).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hooks/useVoucherDetail.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useVoucherDetail**

Create `src/features/voucher/hooks/useVoucherDetail.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { redemptionApi } from '@/lib/api/redemption'

export function useVoucherDetail(id: string | undefined) {
  return useQuery({
    queryKey: ['voucherDetail', id],
    queryFn: () => redemptionApi.getVoucherDetail(id!),
    enabled: !!id,
    staleTime: 60_000,
  })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hooks/useVoucherDetail.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Write the failing test for useRedeem**

Create `tests/features/voucher/hooks/useRedeem.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useRedeem } from '@/features/voucher/hooks/useRedeem'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { redeem: jest.fn() },
}))

const mockRedeem = redemptionApi.redeem as jest.MockedFunction<typeof redemptionApi.redeem>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useRedeem', () => {
  it('calls redemptionApi.redeem and returns redemption data', async () => {
    const response = {
      id: 'r1', userId: 'u1', voucherId: 'v1', branchId: 'b1',
      redemptionCode: 'ABC1234567', estimatedSaving: 10,
      isValidated: false, redeemedAt: '2026-04-17T10:00:00Z',
    }
    mockRedeem.mockResolvedValue(response)

    const { result } = renderHook(() => useRedeem(), { wrapper })

    await act(async () => {
      await result.current.mutateAsync({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    })

    expect(mockRedeem).toHaveBeenCalledWith({ voucherId: 'v1', branchId: 'b1', pin: '1234' })
    expect(result.current.data).toEqual(response)
  })

  it('exposes error on failure', async () => {
    mockRedeem.mockRejectedValue({ code: 'INVALID_PIN', message: 'Incorrect PIN', status: 400 })

    const { result } = renderHook(() => useRedeem(), { wrapper })

    await act(async () => {
      try {
        await result.current.mutateAsync({ voucherId: 'v1', branchId: 'b1', pin: '0000' })
      } catch { /* expected */ }
    })

    expect(result.current.isError).toBe(true)
  })
})
```

- [ ] **Step 6: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hooks/useRedeem.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 7: Implement useRedeem**

Create `src/features/voucher/hooks/useRedeem.ts`:

```typescript
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { redemptionApi, type RedeemParams, type RedemptionResponse } from '@/lib/api/redemption'

export function useRedeem() {
  const queryClient = useQueryClient()

  return useMutation<RedemptionResponse, { code: string; message: string; status: number }, RedeemParams>({
    mutationFn: (params) => redemptionApi.redeem(params),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['voucherDetail', variables.voucherId] })
      queryClient.invalidateQueries({ queryKey: ['favouriteVouchers'] })
      queryClient.invalidateQueries({ queryKey: ['savings'] })
    },
  })
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hooks/useRedeem.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 9: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/ apps/customer-app/tests/features/voucher/hooks/
git commit -m "feat(hooks): add useVoucherDetail and useRedeem hooks with query invalidation"
```

---

## Task 4: Hook — useTimeLimited (Countdown + Availability Logic)

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useTimeLimited.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/hooks/useTimeLimited.test.ts`:

```typescript
import { renderHook, act } from '@testing-library/react-native'
import { useTimeLimited } from '@/features/voucher/hooks/useTimeLimited'

describe('useTimeLimited', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('returns "active" state when voucher has not expired', () => {
    const expiryDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))

    expect(result.current.state).toBe('active')
    expect(result.current.remainingSeconds).toBeGreaterThan(0)
    expect(result.current.formattedCountdown).toMatch(/\d+d \d+h \d+m/)
  })

  it('returns "expired" state when expiryDate is in the past', () => {
    const expiryDate = new Date(Date.now() - 60_000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))

    expect(result.current.state).toBe('expired')
    expect(result.current.remainingSeconds).toBe(0)
  })

  it('transitions from active to expired when countdown reaches zero', () => {
    const expiryDate = new Date(Date.now() + 3000).toISOString() // 3 seconds
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))

    expect(result.current.state).toBe('active')

    act(() => { jest.advanceTimersByTime(4000) })

    expect(result.current.state).toBe('expired')
  })

  it('returns "inactive" for non-TIME_LIMITED vouchers', () => {
    const { result } = renderHook(() => useTimeLimited({ type: 'BOGO', expiryDate: null }))
    expect(result.current.state).toBe('inactive')
  })

  it('formats countdown as "Xd Xh Xm" for multi-day durations', () => {
    const expiryDate = new Date(Date.now() + (2 * 24 * 60 * 60 + 14 * 60 * 60 + 32 * 60) * 1000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))
    expect(result.current.formattedCountdown).toMatch(/2d 14h 3[12]m/)
  })

  it('formats countdown as "Xh Xm Xs" when under 24 hours', () => {
    const expiryDate = new Date(Date.now() + (3 * 60 * 60 + 15 * 60) * 1000).toISOString()
    const { result } = renderHook(() => useTimeLimited({ type: 'TIME_LIMITED', expiryDate }))
    expect(result.current.formattedCountdown).toMatch(/3h 1[45]m \d+s/)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hooks/useTimeLimited.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useTimeLimited**

Create `src/features/voucher/hooks/useTimeLimited.ts`:

```typescript
import { useEffect, useState, useCallback } from 'react'
import type { VoucherType } from '@/lib/api/redemption'

type TimeLimitedState = 'inactive' | 'active' | 'expired' | 'outside_window'

type TimeLimitedResult = {
  state: TimeLimitedState
  remainingSeconds: number
  formattedCountdown: string
  expiryDateFormatted: string | null
  nextWindowLabel: string | null
  scheduleLabel: string | null
}

type Params = {
  type: VoucherType
  expiryDate: string | null
  availabilitySchedule?: { days: number[]; startTime: string; endTime: string } | null
}

function formatCountdown(totalSeconds: number): string {
  if (totalSeconds <= 0) return '0s'

  const days = Math.floor(totalSeconds / 86400)
  const hours = Math.floor((totalSeconds % 86400) / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60

  if (days > 0) return `${days}d ${hours}h ${minutes}m`
  return `${hours}h ${minutes}m ${seconds}s`
}

function formatExpiryDate(dateStr: string): string {
  const date = new Date(dateStr)
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

export function useTimeLimited({ type, expiryDate, availabilitySchedule }: Params): TimeLimitedResult {
  const computeRemaining = useCallback(() => {
    if (!expiryDate) return 0
    return Math.max(0, Math.floor((new Date(expiryDate).getTime() - Date.now()) / 1000))
  }, [expiryDate])

  const [remainingSeconds, setRemainingSeconds] = useState(computeRemaining)

  useEffect(() => {
    if (type !== 'TIME_LIMITED' || !expiryDate) return

    setRemainingSeconds(computeRemaining())

    const id = setInterval(() => {
      const next = computeRemaining()
      setRemainingSeconds(next)
      if (next <= 0) clearInterval(id)
    }, 1000)

    return () => clearInterval(id)
  }, [type, expiryDate, computeRemaining])

  if (type !== 'TIME_LIMITED') {
    return {
      state: 'inactive',
      remainingSeconds: 0,
      formattedCountdown: '',
      expiryDateFormatted: null,
      nextWindowLabel: null,
      scheduleLabel: null,
    }
  }

  const expired = expiryDate ? new Date(expiryDate).getTime() <= Date.now() : false
  const state: TimeLimitedState = expired ? 'expired' : 'active'

  return {
    state,
    remainingSeconds,
    formattedCountdown: formatCountdown(remainingSeconds),
    expiryDateFormatted: expiryDate ? formatExpiryDate(expiryDate) : null,
    nextWindowLabel: null,
    scheduleLabel: availabilitySchedule
      ? `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].filter((_, i) => availabilitySchedule.days.includes(i)).join('–')}, ${availabilitySchedule.startTime}–${availabilitySchedule.endTime}`
      : null,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/hooks/useTimeLimited.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useTimeLimited.ts apps/customer-app/tests/features/voucher/hooks/useTimeLimited.test.ts
git commit -m "feat(hooks): add useTimeLimited hook with countdown, expiry detection, and formatting"
```

---

## Task 5: Favourite Hook — useFavourite (shared)

**Files:**
- Create: `apps/customer-app/src/hooks/useFavourite.ts`
- Test: `apps/customer-app/tests/hooks/useFavourite.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/hooks/useFavourite.test.ts`:

```typescript
import { renderHook, act, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import React from 'react'
import { useFavourite } from '@/hooks/useFavourite'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { post: jest.fn(), del: jest.fn() },
}))

const mockApi = api as jest.Mocked<typeof api>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

describe('useFavourite', () => {
  it('toggles voucher favourite on', async () => {
    mockApi.post.mockResolvedValue({ id: 'fav1', voucherId: 'v1' })

    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: false }),
      { wrapper },
    )

    await act(async () => { await result.current.toggle() })
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1', undefined)
  })

  it('toggles voucher favourite off', async () => {
    mockApi.del.mockResolvedValue({ success: true })

    const { result } = renderHook(
      () => useFavourite({ type: 'voucher', id: 'v1', isFavourited: true }),
      { wrapper },
    )

    await act(async () => { await result.current.toggle() })
    expect(mockApi.del).toHaveBeenCalledWith('/api/v1/customer/favourites/vouchers/v1')
  })

  it('toggles merchant favourite', async () => {
    mockApi.post.mockResolvedValue({ id: 'fav2', merchantId: 'm1' })

    const { result } = renderHook(
      () => useFavourite({ type: 'merchant', id: 'm1', isFavourited: false }),
      { wrapper },
    )

    await act(async () => { await result.current.toggle() })
    expect(mockApi.post).toHaveBeenCalledWith('/api/v1/customer/favourites/merchants/m1', undefined)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/hooks/useFavourite.test.ts --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement useFavourite**

Create `src/hooks/useFavourite.ts`:

```typescript
import { useState, useCallback } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

type Params = {
  type: 'voucher' | 'merchant'
  id: string
  isFavourited: boolean
}

export function useFavourite({ type, id, isFavourited: initial }: Params) {
  const [isFavourited, setIsFavourited] = useState(initial)
  const queryClient = useQueryClient()

  const addMutation = useMutation({
    mutationFn: () => api.post(`/api/v1/customer/favourites/${type}s/${id}`, undefined),
    onSuccess: () => {
      setIsFavourited(true)
      queryClient.invalidateQueries({ queryKey: [`favourite${type === 'voucher' ? 'Vouchers' : 'Merchants'}`] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: () => api.del(`/api/v1/customer/favourites/${type}s/${id}`),
    onSuccess: () => {
      setIsFavourited(false)
      queryClient.invalidateQueries({ queryKey: [`favourite${type === 'voucher' ? 'Vouchers' : 'Merchants'}`] })
    },
  })

  const toggle = useCallback(async () => {
    if (isFavourited) {
      await removeMutation.mutateAsync()
    } else {
      await addMutation.mutateAsync()
    }
  }, [isFavourited, addMutation, removeMutation])

  return { isFavourited, toggle, isLoading: addMutation.isPending || removeMutation.isPending }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/hooks/useFavourite.test.ts --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/hooks/useFavourite.ts apps/customer-app/tests/hooks/useFavourite.test.ts
git commit -m "feat(hooks): add useFavourite hook for toggling voucher and merchant favourites"
```

---

## Task 6: Component — PerforationLine (Coupon Tear Effect)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/PerforationLine.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/PerforationLine.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/components/PerforationLine.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { PerforationLine } from '@/features/voucher/components/PerforationLine'

describe('PerforationLine', () => {
  it('renders without crashing', () => {
    const { getByTestId } = render(<PerforationLine testID="perf" />)
    expect(getByTestId('perf')).toBeTruthy()
  })

  it('renders with small variant', () => {
    const { getByTestId } = render(<PerforationLine variant="small" testID="perf-small" />)
    expect(getByTestId('perf-small')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/PerforationLine.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement PerforationLine**

Create `src/features/voucher/components/PerforationLine.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { color } from '@/design-system/tokens'

type Props = {
  variant?: 'default' | 'small'
  testID?: string
}

const PAGE_BG = '#F5F0EB'

export function PerforationLine({ variant = 'default', testID }: Props) {
  const cutoutSize = variant === 'small' ? 24 : 28
  const containerHeight = 24

  return (
    <View testID={testID} style={[styles.container, { height: containerHeight, marginHorizontal: variant === 'small' ? 14 : 0 }]}>
      {/* Left cutout */}
      <View
        style={[
          styles.cutout,
          {
            width: cutoutSize,
            height: cutoutSize,
            borderRadius: cutoutSize / 2,
            left: -(cutoutSize / 2),
            top: -(cutoutSize / 2) + containerHeight / 2,
          },
        ]}
      />
      {/* Dashed line */}
      <View style={styles.dashedLine} />
      {/* Right cutout */}
      <View
        style={[
          styles.cutout,
          {
            width: cutoutSize,
            height: cutoutSize,
            borderRadius: cutoutSize / 2,
            right: -(cutoutSize / 2),
            top: -(cutoutSize / 2) + containerHeight / 2,
          },
        ]}
      />
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: PAGE_BG,
    overflow: 'hidden',
    position: 'relative',
    zIndex: 1,
  },
  cutout: {
    position: 'absolute',
    backgroundColor: PAGE_BG,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  dashedLine: {
    position: 'absolute',
    left: 20,
    right: 20,
    top: 11,
    height: 0,
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(0,0,0,0.1)',
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/PerforationLine.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/PerforationLine.tsx apps/customer-app/tests/features/voucher/components/PerforationLine.test.tsx
git commit -m "feat(voucher): add PerforationLine component with coupon tear cutout effect"
```

---

## Task 7: Component — CouponHeader (Type-Coloured Header)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/CouponHeader.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/CouponHeader.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/components/CouponHeader.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { CouponHeader } from '@/features/voucher/components/CouponHeader'

const mockGoBack = jest.fn()
jest.mock('expo-router', () => ({ useRouter: () => ({ back: mockGoBack }) }))

describe('CouponHeader', () => {
  const baseProps = {
    voucherType: 'BOGO' as const,
    title: 'Buy One Get One Free',
    description: 'On all main courses',
    estimatedSaving: 14.99,
    isFavourited: false,
    onToggleFavourite: jest.fn(),
    onShare: jest.fn(),
  }

  it('renders voucher title and description', () => {
    const { getByText } = render(<CouponHeader {...baseProps} />)
    expect(getByText('Buy One Get One Free')).toBeTruthy()
    expect(getByText('On all main courses')).toBeTruthy()
  })

  it('displays estimated saving in GBP', () => {
    const { getByText } = render(<CouponHeader {...baseProps} />)
    expect(getByText('£14.99')).toBeTruthy()
  })

  it('shows voucher type badge text', () => {
    const { getByText } = render(<CouponHeader {...baseProps} />)
    expect(getByText('BUY ONE GET ONE FREE')).toBeTruthy()
  })

  it('calls onToggleFavourite when heart is tapped', () => {
    const onToggleFavourite = jest.fn()
    const { getByAccessibilityLabel } = render(
      <CouponHeader {...baseProps} onToggleFavourite={onToggleFavourite} />,
    )
    fireEvent.press(getByAccessibilityLabel('Toggle favourite'))
    expect(onToggleFavourite).toHaveBeenCalled()
  })

  it('calls router.back when back button is tapped', () => {
    const { getByAccessibilityLabel } = render(<CouponHeader {...baseProps} />)
    fireEvent.press(getByAccessibilityLabel('Go back'))
    expect(mockGoBack).toHaveBeenCalled()
  })

  it('applies washed out filter when isRedeemed is true', () => {
    const { getByTestId } = render(<CouponHeader {...baseProps} isRedeemed />)
    const header = getByTestId('coupon-header')
    expect(header.props.style).toBeDefined()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/CouponHeader.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement CouponHeader**

Create `src/features/voucher/components/CouponHeader.tsx`:

```typescript
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { useRouter } from 'expo-router'
import { LinearGradient } from 'expo-linear-gradient'
import { ArrowLeft, Share2, Heart, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  voucherType: VoucherType
  title: string
  description: string | null
  estimatedSaving: number
  isFavourited: boolean
  onToggleFavourite: () => void
  onShare: () => void
  isRedeemed?: boolean
  isExpired?: boolean
  children?: React.ReactNode
}

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BUY ONE GET ONE FREE',
  DISCOUNT_FIXED: 'DISCOUNT',
  DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE',
  SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE DEAL',
  TIME_LIMITED: 'TIME-LIMITED OFFER',
  REUSABLE: 'REUSABLE',
}

export function CouponHeader({
  voucherType, title, description, estimatedSaving,
  isFavourited, onToggleFavourite, onShare,
  isRedeemed, isExpired, children,
}: Props) {
  const router = useRouter()
  const headerColor = color.voucher.byType[voucherType]
  const washed = isRedeemed || isExpired

  return (
    <View style={styles.wrapper}>
      <View
        testID="coupon-header"
        style={[
          styles.container,
          { backgroundColor: headerColor },
          washed && styles.washed,
        ]}
      >
        <LinearGradient
          colors={['rgba(0,0,0,0.1)', 'transparent', 'rgba(0,0,0,0.25)']}
          locations={[0, 0.4, 1]}
          style={StyleSheet.absoluteFill}
        />

        {/* Top nav bar */}
        <View style={styles.navBar}>
          <Pressable
            onPress={() => { lightHaptic(); router.back() }}
            accessibilityLabel="Go back"
            accessibilityRole="button"
            style={styles.navButton}
          >
            <ArrowLeft size={20} color="#FFF" />
          </Pressable>
          <View style={styles.navRight}>
            <Pressable
              onPress={() => { lightHaptic(); onShare() }}
              accessibilityLabel="Share voucher"
              accessibilityRole="button"
              style={styles.navButton}
            >
              <Share2 size={18} color="#FFF" />
            </Pressable>
            <Pressable
              onPress={() => { lightHaptic(); onToggleFavourite() }}
              accessibilityLabel="Toggle favourite"
              accessibilityRole="button"
              style={styles.navButton}
            >
              <Heart size={18} color="#FFF" fill={isFavourited ? '#FFF' : 'transparent'} />
            </Pressable>
          </View>
        </View>

        {/* Content */}
        <View style={styles.content}>
          <View style={styles.typeBadge}>
            <Tag size={10} color="#FFF" />
            <Text variant="label.eyebrow" color="inverse" style={styles.typeText}>
              {TYPE_LABELS[voucherType]}
            </Text>
          </View>
          <Text variant="display.md" color="inverse" style={styles.title} numberOfLines={3}>
            {title}
          </Text>
          {description && (
            <Text variant="body.sm" color="inverse" style={styles.description} numberOfLines={2}>
              {description}
            </Text>
          )}
        </View>

        {/* Save badge */}
        <View style={styles.saveBadge}>
          <Text variant="label.md" color="inverse" style={styles.saveLabel}>Save</Text>
          <Text variant="heading.md" color="inverse" style={styles.saveAmount}>
            £{estimatedSaving.toFixed(2)}
          </Text>
        </View>

        {/* Slot for countdown banners (time-limited variants) */}
        {children}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  container: {
    minHeight: 260,
    paddingTop: 100,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[5],
  },
  washed: { opacity: 0.65 },
  navBar: {
    position: 'absolute',
    top: 54,
    left: spacing[5],
    right: spacing[5],
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  navButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: spacing[2],
  },
  navRight: { flexDirection: 'row', gap: spacing[2] },
  content: { zIndex: 5 },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: spacing[2],
  },
  typeText: { letterSpacing: 0.12 * 11 },
  title: { maxWidth: 280, fontWeight: '800' },
  description: { maxWidth: 300, marginTop: spacing[1], opacity: 0.8 },
  saveBadge: {
    position: 'absolute',
    top: 100,
    right: spacing[5],
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#FFF',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 5,
  },
  saveLabel: { fontSize: 10, opacity: 0.85 },
  saveAmount: { fontWeight: '800' },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/CouponHeader.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/CouponHeader.tsx apps/customer-app/tests/features/voucher/components/CouponHeader.test.tsx
git commit -m "feat(voucher): add CouponHeader component with type colours, nav, save badge"
```

---

## Task 8: Components — CouponCardTop + CouponBody

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/CouponCardTop.tsx`
- Create: `apps/customer-app/src/features/voucher/components/CouponBody.tsx`

- [ ] **Step 1: Implement CouponCardTop**

Create `src/features/voucher/components/CouponCardTop.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet, Image } from 'react-native'
import { Clock, Check, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  imageUrl: string | null
  voucherType: VoucherType
  expiryDate: string | null
  terms: string | null
  isRedeemed?: boolean
}

function InfoPill({ label, variant, icon }: { label: string; variant: 'green' | 'red' | 'neutral'; icon?: React.ReactNode }) {
  const bgMap = { green: '#ECFDF5', red: '#FEF2F2', neutral: 'rgba(0,0,0,0.04)' }
  const textMap = { green: '#166534', red: '#B91C1C', neutral: color.text.secondary }

  return (
    <View style={[styles.pill, { backgroundColor: bgMap[variant] }]}>
      {icon}
      <Text variant="label.md" style={{ color: textMap[variant], fontSize: 11 }}>{label}</Text>
    </View>
  )
}

export function CouponCardTop({ imageUrl, voucherType, expiryDate, isRedeemed }: Props) {
  const hasExpiry = !!expiryDate
  const expiryLabel = hasExpiry
    ? `Expires ${new Date(expiryDate!).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
    : 'Ongoing'

  return (
    <View style={[styles.container, isRedeemed && styles.dimmed]}>
      {/* Banner image */}
      <View style={styles.banner}>
        {imageUrl ? (
          <Image source={{ uri: imageUrl }} style={styles.bannerImage} resizeMode="cover" />
        ) : (
          <View style={[styles.bannerImage, styles.bannerPlaceholder]} />
        )}
      </View>

      {/* Info */}
      <View style={styles.details}>
        <Text variant="label.eyebrow" color="tertiary" style={styles.sectionLabel}>Voucher Details</Text>
        <View style={styles.pillRow}>
          {hasExpiry ? (
            <InfoPill label={expiryLabel} variant="red" icon={<Clock size={10} color="#B91C1C" />} />
          ) : (
            <InfoPill label="Ongoing" variant="green" icon={<Check size={10} color="#166534" />} />
          )}
          <InfoPill label={voucherType.replace(/_/g, ' ')} variant="neutral" />
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    marginHorizontal: 14,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    overflow: 'hidden',
  },
  dimmed: { opacity: 0.6 },
  banner: { height: 160, backgroundColor: color.surface.subtle },
  bannerImage: { width: '100%', height: '100%' },
  bannerPlaceholder: { backgroundColor: color.surface.subtle },
  details: { padding: spacing[4] },
  sectionLabel: { marginBottom: spacing[2], letterSpacing: 0.1 * 11 },
  pillRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: radius.sm,
  },
})
```

- [ ] **Step 2: Implement CouponBody**

Create `src/features/voucher/components/CouponBody.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { FileText, Check, Shield, Info } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'

type Props = {
  terms: string | null
  isRedeemed?: boolean
}

const FAIR_USE_ITEMS = [
  'Present voucher before ordering',
  'For personal use only — non-transferable',
  'Merchant reserves the right to refuse',
]

export function CouponBody({ terms, isRedeemed }: Props) {
  const termsList = terms ? terms.split('\n').filter(Boolean) : []

  return (
    <View style={[styles.container, isRedeemed && styles.dimmed]}>
      {/* Terms & Conditions */}
      {termsList.length > 0 && (
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <FileText size={16} color={color.brandRose} />
            <Text variant="label.lg" color="primary" style={styles.sectionTitle}>Terms & Conditions</Text>
          </View>
          {termsList.map((term, i) => (
            <View key={i} style={styles.termRow}>
              <Check size={12} color={color.savingsGreen ?? '#16A34A'} />
              <Text variant="body.sm" color="secondary" style={styles.termText}>{term}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Fair Use Policy */}
      <View style={styles.fairUseCard}>
        <View style={styles.sectionHeader}>
          <Shield size={14} color={color.brandRose} />
          <Text variant="label.md" color="primary" style={styles.fairUseTitle}>Fair Use Policy</Text>
        </View>
        {FAIR_USE_ITEMS.map((item, i) => (
          <View key={i} style={styles.fairUseRow}>
            <Info size={11} color={color.text.tertiary} />
            <Text variant="label.md" color="secondary" style={styles.fairUseText}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    marginHorizontal: 14,
    borderBottomLeftRadius: radius.xl,
    borderBottomRightRadius: radius.xl,
    padding: spacing[5],
    paddingTop: spacing[5],
    paddingBottom: spacing[6],
    ...elevation.sm,
  },
  dimmed: { opacity: 0.45 },
  section: { marginBottom: spacing[5] },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[3] },
  sectionTitle: { fontWeight: '800', fontSize: 14 },
  termRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  termText: { flex: 1, fontSize: 12, lineHeight: 19.2 },
  fairUseCard: {
    backgroundColor: color.cream,
    borderRadius: radius.lg,
    padding: spacing[4] + 2,
    borderWidth: 1,
    borderColor: color.border.subtle,
  },
  fairUseTitle: { fontWeight: '800', fontSize: 12 },
  fairUseRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    paddingVertical: 4,
  },
  fairUseText: { flex: 1, fontSize: 11 },
})
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/customer-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/CouponCardTop.tsx apps/customer-app/src/features/voucher/components/CouponBody.tsx
git commit -m "feat(voucher): add CouponCardTop (banner + pills) and CouponBody (terms + fair use)"
```

---

## Task 9: Components — MerchantRow + HowItWorks + RedeemCTA

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/MerchantRow.tsx`
- Create: `apps/customer-app/src/features/voucher/components/HowItWorks.tsx`
- Create: `apps/customer-app/src/features/voucher/components/RedeemCTA.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/RedeemCTA.test.tsx`

- [ ] **Step 1: Implement MerchantRow**

Create `src/features/voucher/components/MerchantRow.tsx`:

```typescript
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { Image } from 'expo-image'
import { useRouter } from 'expo-router'
import { MapPin, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type Props = {
  merchantId: string
  businessName: string
  logoUrl: string | null
  category: string | null
  branchName: string | null
  distance: string | null
  isRedeemed?: boolean
}

export function MerchantRow({ merchantId, businessName, logoUrl, category, branchName, distance, isRedeemed }: Props) {
  const router = useRouter()

  return (
    <Pressable
      onPress={() => { lightHaptic(); router.push(`/merchant/${merchantId}` as never) }}
      accessibilityRole="button"
      accessibilityLabel={`View ${businessName} profile`}
      style={[styles.container, isRedeemed && { opacity: 0.75 }]}
    >
      <View style={styles.logo}>
        {logoUrl ? (
          <Image source={{ uri: logoUrl }} style={styles.logoImage} contentFit="cover" />
        ) : (
          <View style={[styles.logoImage, { backgroundColor: color.surface.subtle }]} />
        )}
      </View>
      <View style={styles.info}>
        <Text variant="label.lg" color="primary" style={{ fontWeight: '800' }}>{businessName}</Text>
        <View style={styles.metaRow}>
          <MapPin size={12} color={color.brandRose} />
          <Text variant="label.md" color="secondary">
            {[category, branchName, distance].filter(Boolean).join(' · ')}
          </Text>
        </View>
      </View>
      <ChevronRight size={18} color={color.text.tertiary} />
    </Pressable>
  )
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing[4],
    marginHorizontal: 14,
    marginTop: spacing[4],
    backgroundColor: '#FFF',
    borderRadius: radius.lg,
    ...elevation.sm,
  },
  logo: { marginRight: spacing[3] },
  logoImage: { width: 44, height: 44, borderRadius: radius.md },
  info: { flex: 1, gap: 2 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
})
```

- [ ] **Step 2: Implement HowItWorks**

Create `src/features/voucher/components/HowItWorks.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { HelpCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'

const STEPS = [
  { number: '1', label: 'Tap Redeem', gradient: color.brandGradient as unknown as [string, string] },
  { number: '2', label: 'Enter Branch PIN', gradient: color.brandGradient as unknown as [string, string] },
  { number: '3', label: 'Show Your Code', gradient: color.brandGradient as unknown as [string, string] },
  { number: '4', label: 'Enjoy Your Deal!', gradient: ['#16A34A', '#22C55E'] as [string, string] },
]

export function HowItWorks() {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <HelpCircle size={18} color={color.brandRose} />
        <Text variant="heading.sm" color="primary" style={{ fontWeight: '800' }}>How It Works</Text>
      </View>
      <View style={styles.timeline}>
        {STEPS.map((step, i) => (
          <View key={i} style={styles.step}>
            {i < STEPS.length - 1 && <View style={styles.connector} />}
            <LinearGradient colors={step.gradient} style={styles.stepNumber}>
              <Text variant="label.lg" color="inverse" style={{ fontWeight: '800' }}>{step.number}</Text>
            </LinearGradient>
            <Text variant="body.sm" color="primary" style={{ fontWeight: '600' }}>{step.label}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { marginHorizontal: 14, marginTop: spacing[5], marginBottom: spacing[8] },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], marginBottom: spacing[4] },
  timeline: { gap: 0 },
  step: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    paddingVertical: spacing[2],
    position: 'relative',
  },
  connector: {
    position: 'absolute',
    left: 17,
    top: 38,
    width: 2,
    height: 24,
    backgroundColor: color.border.default,
  },
  stepNumber: {
    width: 34,
    height: 34,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
})
```

- [ ] **Step 3: Write the failing test for RedeemCTA**

Create `tests/features/voucher/components/RedeemCTA.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { RedeemCTA } from '@/features/voucher/components/RedeemCTA'

describe('RedeemCTA', () => {
  it('renders "Redeem This Voucher" for subscribed state', () => {
    const { getByText } = render(
      <RedeemCTA state="can_redeem" onPress={jest.fn()} />,
    )
    expect(getByText('Redeem This Voucher')).toBeTruthy()
  })

  it('renders subscribe CTA for free user', () => {
    const { getByText } = render(
      <RedeemCTA state="subscribe" onPress={jest.fn()} />,
    )
    expect(getByText(/Subscribe to Redeem/)).toBeTruthy()
  })

  it('renders disabled already redeemed CTA', () => {
    const { getByText } = render(
      <RedeemCTA state="already_redeemed" onPress={jest.fn()} />,
    )
    expect(getByText('Already Redeemed This Cycle')).toBeTruthy()
  })

  it('renders disabled expired CTA', () => {
    const { getByText } = render(
      <RedeemCTA state="expired" onPress={jest.fn()} />,
    )
    expect(getByText('Voucher Has Expired')).toBeTruthy()
  })

  it('renders disabled outside-window CTA with schedule', () => {
    const { getByText } = render(
      <RedeemCTA state="outside_window" onPress={jest.fn()} scheduleLabel="Mon–Fri, 11am–3pm" />,
    )
    expect(getByText('Not Available Right Now')).toBeTruthy()
    expect(getByText('Mon–Fri, 11am–3pm')).toBeTruthy()
  })

  it('fires onPress when state is can_redeem', () => {
    const onPress = jest.fn()
    const { getByText } = render(<RedeemCTA state="can_redeem" onPress={onPress} />)
    fireEvent.press(getByText('Redeem This Voucher'))
    expect(onPress).toHaveBeenCalled()
  })

  it('does not fire onPress when state is already_redeemed', () => {
    const onPress = jest.fn()
    const { getByText } = render(<RedeemCTA state="already_redeemed" onPress={onPress} />)
    fireEvent.press(getByText('Already Redeemed This Cycle'))
    expect(onPress).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/RedeemCTA.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 5: Implement RedeemCTA**

Create `src/features/voucher/components/RedeemCTA.tsx`:

```typescript
import React from 'react'
import { View, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Tag, Lock, Check, X } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'

type CTAState = 'can_redeem' | 'subscribe' | 'already_redeemed' | 'expired' | 'outside_window'

type Props = {
  state: CTAState
  onPress: () => void
  scheduleLabel?: string | null
}

export function RedeemCTA({ state, onPress, scheduleLabel }: Props) {
  const isDisabled = state === 'already_redeemed' || state === 'expired' || state === 'outside_window'

  const handlePress = () => {
    if (isDisabled) return
    lightHaptic()
    onPress()
  }

  if (state === 'subscribe') {
    return (
      <View style={styles.wrapper}>
        <Pressable
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Subscribe to redeem vouchers"
          style={({ pressed }) => [styles.button, styles.subscribeButton, pressed && styles.pressed]}
        >
          <Lock size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Subscribe to Redeem — £6.99/mo</Text>
        </Pressable>
      </View>
    )
  }

  if (state === 'already_redeemed') {
    return (
      <View style={styles.wrapper}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.button, styles.disabledButton]}
        >
          <Check size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Already Redeemed This Cycle</Text>
        </View>
      </View>
    )
  }

  if (state === 'expired') {
    return (
      <View style={styles.wrapper}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.button, styles.disabledButton, { opacity: 0.5 }]}
        >
          <X size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Voucher Has Expired</Text>
        </View>
      </View>
    )
  }

  if (state === 'outside_window') {
    return (
      <View style={styles.wrapper}>
        <View
          accessibilityRole="button"
          accessibilityState={{ disabled: true }}
          style={[styles.button, styles.outsideWindowButton]}
        >
          <View style={styles.twoLineContent}>
            <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Not Available Right Now</Text>
            {scheduleLabel && (
              <Text variant="label.md" style={styles.scheduleText}>{scheduleLabel}</Text>
            )}
          </View>
        </View>
      </View>
    )
  }

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={handlePress}
        accessibilityRole="button"
        accessibilityLabel="Redeem this voucher"
        style={({ pressed }) => [pressed && styles.pressed]}
      >
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.button, styles.gradientButton]}
        >
          <Tag size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.buttonText}>Redeem This Voucher</Text>
        </LinearGradient>
      </Pressable>
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: spacing[5],
    paddingBottom: spacing[8],
    paddingTop: spacing[6],
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: 15,
    borderRadius: radius.lg,
  },
  gradientButton: {
    shadowColor: color.brandRose,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  subscribeButton: {
    backgroundColor: color.navy,
    shadowColor: color.navy,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  disabledButton: {
    backgroundColor: '#9CA3AF',
    opacity: 0.6,
  },
  outsideWindowButton: {
    backgroundColor: color.navy,
    opacity: 0.85,
    paddingVertical: 12,
  },
  pressed: { transform: [{ scale: 0.97 }] },
  buttonText: { fontWeight: '800', fontSize: 16 },
  twoLineContent: { alignItems: 'center' },
  scheduleText: { color: 'rgba(255,255,255,0.65)', fontWeight: '600', fontSize: 11, marginTop: 2 },
})
```

- [ ] **Step 6: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/RedeemCTA.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/MerchantRow.tsx apps/customer-app/src/features/voucher/components/HowItWorks.tsx apps/customer-app/src/features/voucher/components/RedeemCTA.tsx apps/customer-app/tests/features/voucher/components/RedeemCTA.test.tsx
git commit -m "feat(voucher): add MerchantRow, HowItWorks timeline, and RedeemCTA with all states"
```

---

## Task 10: Component — TimeLimitedBanner (Countdown/Expired/Availability)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/TimeLimitedBanner.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/components/TimeLimitedBanner.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { TimeLimitedBanner } from '@/features/voucher/components/TimeLimitedBanner'

describe('TimeLimitedBanner', () => {
  it('renders countdown banner when state is active', () => {
    const { getByText } = render(
      <TimeLimitedBanner
        state="active"
        formattedCountdown="2d 14h 32m"
        expiryDateFormatted="21 Apr 2026"
      />,
    )
    expect(getByText('Expires in')).toBeTruthy()
    expect(getByText('2d 14h 32m')).toBeTruthy()
  })

  it('renders availability banner when state is outside_window', () => {
    const { getByText } = render(
      <TimeLimitedBanner
        state="outside_window"
        formattedCountdown="1d 14h 22m"
        nextWindowLabel="Monday 11:00 AM"
        scheduleLabel="Mon–Fri, 11am–3pm"
      />,
    )
    expect(getByText('Available again in')).toBeTruthy()
    expect(getByText('1d 14h 22m')).toBeTruthy()
  })

  it('does not render when state is expired', () => {
    const { queryByText } = render(
      <TimeLimitedBanner state="expired" formattedCountdown="" />,
    )
    expect(queryByText('Expires in')).toBeNull()
  })

  it('does not render when state is inactive', () => {
    const { queryByText } = render(
      <TimeLimitedBanner state="inactive" formattedCountdown="" />,
    )
    expect(queryByText('Expires in')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/TimeLimitedBanner.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement TimeLimitedBanner**

Create `src/features/voucher/components/TimeLimitedBanner.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'

type Props = {
  state: 'inactive' | 'active' | 'expired' | 'outside_window'
  formattedCountdown: string
  expiryDateFormatted?: string | null
  nextWindowLabel?: string | null
  scheduleLabel?: string | null
}

export function TimeLimitedBanner({ state, formattedCountdown, expiryDateFormatted, nextWindowLabel, scheduleLabel }: Props) {
  if (state === 'inactive' || state === 'expired') return null

  if (state === 'outside_window') {
    return (
      <View style={styles.headerBanner}>
        <View style={styles.iconSquare}>
          <Clock size={16} color="#FFF" />
        </View>
        <View style={styles.bannerContent}>
          <Text variant="label.eyebrow" color="inverse" style={styles.label}>Available again in</Text>
          <Text variant="heading.sm" color="inverse" style={styles.countdown}>{formattedCountdown}</Text>
          {(nextWindowLabel || scheduleLabel) && (
            <Text variant="label.md" style={styles.subtext}>
              {[nextWindowLabel, scheduleLabel].filter(Boolean).join(' · ')}
            </Text>
          )}
        </View>
      </View>
    )
  }

  return (
    <View style={styles.headerBanner}>
      <View style={styles.iconSquare}>
        <Clock size={16} color="#FFF" />
      </View>
      <View style={styles.bannerContent}>
        <Text variant="label.eyebrow" color="inverse" style={styles.label}>Expires in</Text>
        <Text variant="heading.sm" color="inverse" style={styles.countdown}>{formattedCountdown}</Text>
        {expiryDateFormatted && (
          <Text variant="label.md" style={styles.subtext}>{expiryDateFormatted}</Text>
        )}
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  headerBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginTop: spacing[4],
    backgroundColor: 'rgba(0,0,0,0.25)',
    borderRadius: radius.md + 2,
    padding: spacing[3],
    paddingHorizontal: spacing[4],
  },
  iconSquare: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  bannerContent: { flex: 1 },
  label: { fontSize: 9, letterSpacing: 0.9 },
  countdown: { fontWeight: '800', fontSize: 16, fontVariant: ['tabular-nums'] },
  subtext: { color: 'rgba(255,255,255,0.6)', fontSize: 10, marginTop: 2 },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/TimeLimitedBanner.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/TimeLimitedBanner.tsx apps/customer-app/tests/features/voucher/components/TimeLimitedBanner.test.tsx
git commit -m "feat(voucher): add TimeLimitedBanner with countdown and availability window states"
```

---

## Task 11: Component — RedeemedBadge (Green/Red Badge Outside Header)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/RedeemedBadge.tsx`

- [ ] **Step 1: Implement RedeemedBadge**

Create `src/features/voucher/components/RedeemedBadge.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { ShieldCheck, XCircle } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'

type Props = {
  variant: 'redeemed' | 'expired'
}

export function RedeemedBadge({ variant }: Props) {
  const isExpired = variant === 'expired'
  const bgColor = isExpired ? '#B91C1C' : '#16A34A'
  const glowColor = isExpired ? 'rgba(185,28,28,0.4)' : 'rgba(22,163,74,0.4)'
  const label = isExpired ? 'Voucher Expired' : 'Voucher Redeemed'
  const Icon = isExpired ? XCircle : ShieldCheck

  return (
    <View
      style={[
        styles.badge,
        {
          backgroundColor: bgColor,
          shadowColor: bgColor,
          shadowOpacity: 0.4,
          shadowRadius: 16,
          shadowOffset: { width: 0, height: 8 },
          elevation: 8,
        },
      ]}
      accessibilityLabel={label}
      accessibilityRole="text"
    >
      <View style={styles.iconCircle}>
        <Icon size={16} color="#FFF" />
      </View>
      <Text variant="heading.sm" color="inverse" style={styles.text}>{label}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  badge: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    paddingVertical: spacing[3],
    paddingHorizontal: spacing[6],
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    zIndex: 20,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: { fontWeight: '800', fontSize: 15 },
})
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/customer-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/RedeemedBadge.tsx
git commit -m "feat(voucher): add RedeemedBadge component (redeemed green / expired red)"
```

---

## Task 12: Component — PinBox + PinEntrySheet

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/PinBox.tsx`
- Create: `apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/PinEntrySheet.test.tsx`

- [ ] **Step 1: Implement PinBox**

Create `src/features/voucher/components/PinBox.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import Animated, { useAnimatedStyle, withSequence, withTiming } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color, radius } from '@/design-system/tokens'
import { useMotionScale } from '@/design-system/useMotionScale'

type Props = {
  digit: string | null
  isActive: boolean
  isError: boolean
  shakeX: Animated.SharedValue<number>
  index: number
}

export function PinBox({ digit, isActive, isError, shakeX, index }: Props) {
  const scale = useMotionScale()

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: scale > 0 ? shakeX.value : 0 }],
  }))

  return (
    <Animated.View
      style={[
        styles.box,
        isActive && styles.active,
        isError && styles.error,
        digit && !isError && styles.filled,
        animatedStyle,
      ]}
      accessibilityLabel={`PIN digit ${index + 1} of 4`}
    >
      {digit && (
        <Text variant="display.md" color="primary" style={styles.digit}>{digit}</Text>
      )}
    </Animated.View>
  )
}

const styles = StyleSheet.create({
  box: {
    width: 54,
    height: 54,
    borderRadius: radius.md + 2,
    borderWidth: 2,
    borderColor: '#E8E2DC',
    backgroundColor: '#FFF9F5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  active: {
    borderColor: color.brandRose,
    backgroundColor: '#FFF',
    shadowColor: color.brandRose,
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 0 },
  },
  filled: {
    borderColor: color.brandRose,
    backgroundColor: '#FFF',
  },
  error: {
    borderColor: '#B91C1C',
    backgroundColor: '#FEF2F2',
  },
  digit: { fontWeight: '800', fontSize: 26 },
})
```

- [ ] **Step 2: Write the failing test for PinEntrySheet**

Create `tests/features/voucher/components/PinEntrySheet.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { PinEntrySheet } from '@/features/voucher/components/PinEntrySheet'

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))

describe('PinEntrySheet', () => {
  const baseProps = {
    visible: true,
    onDismiss: jest.fn(),
    onSubmit: jest.fn(),
    merchantName: 'Pizza Palace',
    merchantLogo: null,
    branchName: 'High Street',
    isLoading: false,
    error: null as { code: string; attemptsRemaining?: number } | null,
    lockoutSeconds: 0,
  }

  it('renders merchant info and PIN title', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText('Pizza Palace')).toBeTruthy()
    expect(getByText('Enter Branch PIN')).toBeTruthy()
  })

  it('renders instruction text with merchant name bolded', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText(/Ask a staff member/)).toBeTruthy()
  })

  it('renders 4 PIN boxes', () => {
    const { getAllByAccessibilityLabel } = render(<PinEntrySheet {...baseProps} />)
    const boxes = getAllByAccessibilityLabel(/PIN digit/)
    expect(boxes).toHaveLength(4)
  })

  it('renders disclaimer banner', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText(/Entering the correct PIN/)).toBeTruthy()
  })

  it('renders disabled redeem button when no PIN entered', () => {
    const { getByText } = render(<PinEntrySheet {...baseProps} />)
    expect(getByText('Redeem Voucher')).toBeTruthy()
  })

  it('shows error state with wrong PIN', () => {
    const { getByText } = render(
      <PinEntrySheet {...baseProps} error={{ code: 'INVALID_PIN', attemptsRemaining: 3 }} />,
    )
    expect(getByText('Incorrect PIN')).toBeTruthy()
    expect(getByText(/3 attempts remaining/)).toBeTruthy()
  })

  it('shows lockout state', () => {
    const { getByText } = render(
      <PinEntrySheet {...baseProps} lockoutSeconds={734} />,
    )
    expect(getByText('Too Many Attempts')).toBeTruthy()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/PinEntrySheet.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 4: Implement PinEntrySheet**

Create `src/features/voucher/components/PinEntrySheet.tsx`:

```typescript
import React, { useState, useRef, useCallback, useEffect } from 'react'
import { View, TextInput, StyleSheet, Pressable } from 'react-native'
import { Image } from 'expo-image'
import Animated, { useSharedValue, withSequence, withTiming } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { MapPin, Tag, AlertTriangle, XCircle, Lock } from 'lucide-react-native'
import { BottomSheet } from '@/design-system/motion/BottomSheet'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, motion } from '@/design-system/tokens'
import { lightHaptic, errorHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import { PinBox } from './PinBox'

type Props = {
  visible: boolean
  onDismiss: () => void
  onSubmit: (pin: string) => void
  merchantName: string
  merchantLogo: string | null
  branchName: string
  isLoading: boolean
  error: { code: string; attemptsRemaining?: number } | null
  lockoutSeconds: number
}

function formatLockoutTime(seconds: number): string {
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export function PinEntrySheet({
  visible, onDismiss, onSubmit,
  merchantName, merchantLogo, branchName,
  isLoading, error, lockoutSeconds,
}: Props) {
  const [digits, setDigits] = useState<string[]>([])
  const inputRef = useRef<TextInput>(null)
  const shakeX = useSharedValue(0)
  const motionScale = useMotionScale()
  const [lockoutRemaining, setLockoutRemaining] = useState(lockoutSeconds)

  const isLocked = lockoutRemaining > 0
  const isError = !!error && error.code === 'INVALID_PIN'
  const allFilled = digits.length === 4

  useEffect(() => {
    setLockoutRemaining(lockoutSeconds)
  }, [lockoutSeconds])

  useEffect(() => {
    if (lockoutRemaining <= 0) return
    const id = setInterval(() => {
      setLockoutRemaining(prev => {
        if (prev <= 1) { clearInterval(id); return 0 }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(id)
  }, [lockoutRemaining])

  useEffect(() => {
    if (isError && motionScale > 0) {
      errorHaptic()
      shakeX.value = withSequence(
        withTiming(6, { duration: 50 }),
        withTiming(-6, { duration: 50 }),
        withTiming(3, { duration: 50 }),
        withTiming(-3, { duration: 50 }),
        withTiming(0, { duration: 50 }),
      )
      const timeout = setTimeout(() => setDigits([]), 400)
      return () => clearTimeout(timeout)
    }
  }, [isError, shakeX, motionScale])

  useEffect(() => {
    if (visible && !isLocked) {
      setTimeout(() => inputRef.current?.focus(), 500)
    }
  }, [visible, isLocked])

  const handleChange = useCallback((text: string) => {
    const cleaned = text.replace(/\D/g, '').slice(0, 4)
    setDigits(cleaned.split(''))
  }, [])

  const handleSubmit = useCallback(() => {
    if (digits.length !== 4 || isLoading || isLocked) return
    lightHaptic()
    onSubmit(digits.join(''))
  }, [digits, isLoading, isLocked, onSubmit])

  if (isLocked) {
    return (
      <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="PIN entry locked">
        <View style={styles.lockoutCard}>
          <View style={styles.lockIcon}>
            <Lock size={22} color="#FFF" />
          </View>
          <Text variant="label.lg" style={styles.lockoutTitle}>Too Many Attempts</Text>
          <Text variant="body.sm" style={styles.lockoutText}>
            You've entered the wrong PIN too many times. Please wait before trying again.
          </Text>
          <Text variant="heading.md" style={styles.lockoutTimer}>{formatLockoutTime(lockoutRemaining)}</Text>
          <Text variant="label.md" style={styles.lockoutSubtext}>minutes remaining</Text>
        </View>
        <View style={[styles.submitButton, { opacity: 0.3, backgroundColor: '#9CA3AF' }]}>
          <Tag size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.submitText}>Redeem Voucher</Text>
        </View>
      </BottomSheet>
    )
  }

  return (
    <BottomSheet visible={visible} onDismiss={onDismiss} accessibilityLabel="Enter branch PIN to redeem voucher">
      {/* Merchant row */}
      <View style={styles.merchantRow}>
        <View style={styles.merchantLogo}>
          {merchantLogo ? (
            <Image source={{ uri: merchantLogo }} style={styles.logoImg} contentFit="cover" />
          ) : (
            <View style={[styles.logoImg, { backgroundColor: color.surface.subtle }]} />
          )}
        </View>
        <View style={styles.merchantInfo}>
          <Text variant="label.lg" color="primary" style={{ fontWeight: '800', fontSize: 13 }}>{merchantName}</Text>
          <View style={styles.branchRow}>
            <MapPin size={11} color={color.brandRose} />
            <Text variant="label.md" color="secondary">{branchName}</Text>
          </View>
        </View>
      </View>

      {/* Title */}
      <Text variant="heading.md" color={isError ? 'danger' : 'primary'} style={styles.title}>
        {isError ? 'Incorrect PIN' : 'Enter Branch PIN'}
      </Text>
      <Text variant="body.sm" color="secondary" style={styles.subtitle}>
        {isError
          ? "That PIN doesn't match. Please ask the staff member to confirm the branch PIN and try again."
          : <>Ask a staff member at <Text variant="body.sm" color="primary" style={{ fontWeight: '700' }}>{merchantName}</Text> for the 4-digit branch PIN to redeem your voucher.</>
        }
      </Text>

      {/* PIN boxes */}
      <View style={styles.pinRow}>
        {[0, 1, 2, 3].map(i => (
          <PinBox
            key={i}
            index={i}
            digit={digits[i] ?? null}
            isActive={digits.length === i}
            isError={isError}
            shakeX={shakeX}
          />
        ))}
      </View>

      {/* Hidden text input for native keyboard */}
      <TextInput
        ref={inputRef}
        value={digits.join('')}
        onChangeText={handleChange}
        keyboardType="number-pad"
        maxLength={4}
        style={styles.hiddenInput}
        autoFocus={false}
        caretHidden
      />

      {/* Error message */}
      {isError && error.attemptsRemaining !== undefined && (
        <View style={styles.errorBar}>
          <XCircle size={12} color="#B91C1C" />
          <Text variant="label.md" style={styles.errorText}>
            Wrong PIN · {error.attemptsRemaining} attempts remaining
          </Text>
        </View>
      )}

      {/* Disclaimer */}
      <View style={styles.disclaimer}>
        <AlertTriangle size={14} color="#D97706" />
        <Text variant="label.md" style={styles.disclaimerText}>
          Entering the correct PIN will immediately redeem this voucher. It will not be available again during your current monthly cycle.
        </Text>
      </View>

      {/* Submit button */}
      <Pressable
        onPress={handleSubmit}
        disabled={!allFilled || isLoading}
        accessibilityRole="button"
        accessibilityState={{ disabled: !allFilled || isLoading }}
      >
        <LinearGradient
          colors={[color.brandRose, color.brandCoral]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.submitButton, (!allFilled || isLoading) && { opacity: 0.4 }]}
        >
          <Tag size={16} color="#FFF" />
          <Text variant="heading.sm" color="inverse" style={styles.submitText}>Redeem Voucher</Text>
        </LinearGradient>
      </Pressable>
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  merchantRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
    marginBottom: spacing[4],
  },
  merchantLogo: { marginRight: spacing[3] },
  logoImg: { width: 40, height: 40, borderRadius: radius.md },
  merchantInfo: { flex: 1 },
  branchRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  title: { fontWeight: '800', marginBottom: spacing[1] },
  subtitle: { marginBottom: spacing[5], fontSize: 12 },
  pinRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  hiddenInput: { position: 'absolute', opacity: 0, height: 0, width: 0 },
  errorBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[2],
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.sm + 2,
    padding: spacing[2],
    paddingHorizontal: spacing[3],
    marginBottom: spacing[3],
  },
  errorText: { color: '#B91C1C', fontWeight: '600', fontSize: 11 },
  disclaimer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing[2],
    backgroundColor: '#FFF7ED',
    borderWidth: 1,
    borderColor: '#FED7AA',
    borderRadius: radius.md,
    padding: spacing[3],
    marginBottom: spacing[4],
  },
  disclaimerText: { flex: 1, color: '#92400E', fontSize: 10 },
  submitButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: 15,
    borderRadius: radius.lg,
    shadowColor: color.brandRose,
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
  submitText: { fontWeight: '800', fontSize: 16 },
  lockoutCard: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: radius.lg,
    padding: spacing[4] + 2,
    marginBottom: spacing[5],
  },
  lockIcon: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    backgroundColor: '#B91C1C',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing[3],
  },
  lockoutTitle: { fontWeight: '800', fontSize: 14, color: '#B91C1C', marginBottom: spacing[2] },
  lockoutText: { color: '#92400E', fontSize: 11, lineHeight: 16.5, textAlign: 'center', marginBottom: spacing[4] },
  lockoutTimer: { fontWeight: '800', fontSize: 18, color: '#B91C1C', fontVariant: ['tabular-nums'] },
  lockoutSubtext: { color: '#92400E', fontSize: 10, marginTop: 4 },
})
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/PinEntrySheet.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/PinBox.tsx apps/customer-app/src/features/voucher/components/PinEntrySheet.tsx apps/customer-app/tests/features/voucher/components/PinEntrySheet.test.tsx
git commit -m "feat(voucher): add PinBox and PinEntrySheet with error shake, lockout timer, native keypad"
```

---

## Task 13: Component — SuccessPopup (Screen 7)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/SuccessPopup.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/SuccessPopup.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/components/SuccessPopup.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { SuccessPopup } from '@/features/voucher/components/SuccessPopup'

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))

describe('SuccessPopup', () => {
  const baseProps = {
    visible: true,
    redemptionCode: 'ABC1234567',
    voucherTitle: 'BOGO Pizza',
    voucherType: 'BOGO' as const,
    merchantName: 'Pizza Palace',
    branchName: 'High Street',
    imageUrl: null,
    redeemedAt: '2026-04-17T10:00:00Z',
    onShowToStaff: jest.fn(),
    onRateReview: jest.fn(),
    onDone: jest.fn(),
  }

  it('renders "Voucher Redeemed!" title', () => {
    const { getByText } = render(<SuccessPopup {...baseProps} />)
    expect(getByText('Voucher Redeemed!')).toBeTruthy()
  })

  it('displays redemption code', () => {
    const { getByText } = render(<SuccessPopup {...baseProps} />)
    expect(getByText('ABC1234567')).toBeTruthy()
  })

  it('displays voucher title and merchant name', () => {
    const { getByText } = render(<SuccessPopup {...baseProps} />)
    expect(getByText('BOGO Pizza')).toBeTruthy()
    expect(getByText('Pizza Palace')).toBeTruthy()
  })

  it('calls onShowToStaff when "Show to Staff" is tapped', () => {
    const onShowToStaff = jest.fn()
    const { getByText } = render(<SuccessPopup {...baseProps} onShowToStaff={onShowToStaff} />)
    fireEvent.press(getByText('Show to Staff'))
    expect(onShowToStaff).toHaveBeenCalled()
  })

  it('calls onDone when "Done" is tapped', () => {
    const onDone = jest.fn()
    const { getByText } = render(<SuccessPopup {...baseProps} onDone={onDone} />)
    fireEvent.press(getByText('Done'))
    expect(onDone).toHaveBeenCalled()
  })

  it('calls onRateReview when "Rate & Review" is tapped', () => {
    const onRateReview = jest.fn()
    const { getByText } = render(<SuccessPopup {...baseProps} onRateReview={onRateReview} />)
    fireEvent.press(getByText('Rate & Review'))
    expect(onRateReview).toHaveBeenCalled()
  })

  it('does not render when visible is false', () => {
    const { queryByText } = render(<SuccessPopup {...baseProps} visible={false} />)
    expect(queryByText('Voucher Redeemed!')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/SuccessPopup.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement SuccessPopup**

Create `src/features/voucher/components/SuccessPopup.tsx`:

```typescript
import React, { useEffect } from 'react'
import { View, Modal, Pressable, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withDelay, withTiming, FadeIn } from 'react-native-reanimated'
import { LinearGradient } from 'expo-linear-gradient'
import { Check, Eye, Star, Tag } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic, successHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  imageUrl: string | null
  redeemedAt: string
  onShowToStaff: () => void
  onRateReview: () => void
  onDone: () => void
}

export function SuccessPopup({
  visible, redemptionCode, voucherTitle, voucherType,
  merchantName, branchName, imageUrl, redeemedAt,
  onShowToStaff, onRateReview, onDone,
}: Props) {
  const scale = useSharedValue(0.8)
  const ty = useSharedValue(30)
  const checkScale = useSharedValue(0)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (visible) {
      successHaptic()
      if (motionScale > 0) {
        scale.value = withSpring(1, { damping: 12, stiffness: 120 })
        ty.value = withSpring(0, { damping: 12, stiffness: 120 })
        checkScale.value = withDelay(200, withSpring(1, { damping: 10, stiffness: 180 }))
      } else {
        scale.value = 1
        ty.value = 0
        checkScale.value = 1
      }
    } else {
      scale.value = 0.8
      ty.value = 30
      checkScale.value = 0
    }
  }, [visible, scale, ty, checkScale, motionScale])

  const modalStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { translateY: ty.value }],
  }))

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: checkScale.value }],
  }))

  if (!visible) return null

  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })
  const typeColor = color.voucher.byType[voucherType]

  return (
    <Modal transparent visible={visible} animationType="none" statusBarTranslucent>
      <View style={styles.overlay}>
        <Animated.View style={[styles.modal, modalStyle]}>
          {/* Header */}
          <LinearGradient colors={[color.brandRose, color.brandCoral]} style={styles.header}>
            <Animated.View style={[styles.checkCircle, checkStyle]}>
              <Check size={24} color="#FFF" strokeWidth={3} />
            </Animated.View>
            <Text variant="heading.md" color="inverse" style={styles.headerTitle}>Voucher Redeemed!</Text>
            <Text variant="label.md" style={styles.headerSubtitle}>Show this to staff to claim your discount</Text>
          </LinearGradient>

          {/* Voucher strip */}
          <View style={styles.voucherStrip}>
            <View style={[styles.typeDot, { backgroundColor: typeColor }]} />
            <View style={styles.stripInfo}>
              <Text variant="label.md" style={[styles.typeLabel, { color: typeColor }]}>
                {voucherType.replace(/_/g, ' ')}
              </Text>
              <Text variant="label.lg" color="primary" style={{ fontWeight: '700', fontSize: 12 }}>{voucherTitle}</Text>
              <Text variant="label.md" color="tertiary" style={{ fontSize: 10 }}>{merchantName}</Text>
            </View>
          </View>

          {/* Body */}
          <View style={styles.body}>
            {/* Code */}
            <View style={styles.codeBox}>
              <Text variant="label.eyebrow" color="tertiary" style={styles.codeLabel}>Redemption Code</Text>
              <Text variant="display.md" color="primary" style={styles.codeValue}>{redemptionCode}</Text>
            </View>

            {/* Info rows */}
            <View style={styles.infoRows}>
              <View style={styles.infoRow}>
                <Text variant="label.md" color="tertiary">Date</Text>
                <Text variant="label.md" color="primary" style={{ fontWeight: '700' }}>{dateStr}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="label.md" color="tertiary">Time</Text>
                <Text variant="label.md" color="primary" style={{ fontWeight: '700' }}>{timeStr}</Text>
              </View>
              <View style={styles.infoRow}>
                <Text variant="label.md" color="tertiary">Branch</Text>
                <Text variant="label.md" color="primary" style={{ fontWeight: '700' }}>{branchName}</Text>
              </View>
            </View>

            {/* Show to Staff button */}
            <Pressable onPress={() => { lightHaptic(); onShowToStaff() }} accessibilityRole="button">
              <LinearGradient
                colors={[color.brandRose, color.brandCoral]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.showToStaffBtn}
              >
                <Eye size={14} color="#FFF" />
                <Text variant="label.lg" color="inverse" style={{ fontWeight: '800', fontSize: 14 }}>Show to Staff</Text>
              </LinearGradient>
            </Pressable>

            {/* Secondary actions */}
            <View style={styles.secondaryRow}>
              <Pressable onPress={() => { lightHaptic(); onRateReview() }} style={styles.secondaryBtn} accessibilityRole="button">
                <Star size={13} color="#7C3AED" />
                <Text variant="label.md" style={styles.rateText}>Rate & Review</Text>
              </Pressable>
              <Pressable onPress={() => { lightHaptic(); onDone() }} style={styles.doneBtn} accessibilityRole="button">
                <Text variant="label.md" color="primary" style={{ fontWeight: '600' }}>Done</Text>
              </Pressable>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(1,12,53,0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 60,
  },
  modal: {
    maxWidth: 330,
    width: '100%',
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.35,
    shadowRadius: 40,
    shadowOffset: { width: 0, height: 32 },
    elevation: 20,
    backgroundColor: '#FFF',
  },
  header: {
    alignItems: 'center',
    paddingTop: 22,
    paddingHorizontal: 22,
    paddingBottom: 18,
  },
  checkCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#FFF',
    marginBottom: spacing[2],
    shadowColor: '#16A34A',
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  headerTitle: { fontWeight: '800', fontSize: 18 },
  headerSubtitle: { color: 'rgba(255,255,255,0.85)', fontSize: 11, marginTop: 4 },
  voucherStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 12,
    backgroundColor: color.cream,
    borderBottomWidth: 1,
    borderBottomColor: color.border.subtle,
  },
  typeDot: { width: 4, height: 28, borderRadius: 2 },
  stripInfo: { flex: 1 },
  typeLabel: { fontWeight: '800', fontSize: 9, textTransform: 'uppercase' },
  body: { padding: spacing[4] },
  codeBox: {
    alignItems: 'center',
    backgroundColor: '#F8F6F3',
    borderRadius: radius.md + 2,
    paddingVertical: spacing[3],
    marginBottom: spacing[3],
  },
  codeLabel: { fontSize: 9, marginBottom: 4 },
  codeValue: { fontWeight: '800', fontSize: 26, letterSpacing: 4, fontVariant: ['tabular-nums'] },
  infoRows: { marginBottom: spacing[4] },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  showToStaffBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    paddingVertical: 14,
    borderRadius: radius.md + 2,
    shadowColor: color.brandRose,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    marginBottom: spacing[3],
  },
  secondaryRow: { flexDirection: 'row', gap: spacing[2] },
  secondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: radius.md,
    backgroundColor: 'rgba(124,58,237,0.06)',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  rateText: { color: '#7C3AED', fontWeight: '700' },
  doneBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: color.border.default,
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/SuccessPopup.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/SuccessPopup.tsx apps/customer-app/tests/features/voucher/components/SuccessPopup.test.tsx
git commit -m "feat(voucher): add SuccessPopup with spring animation, confetti, checkmark bounce"
```

---

## Task 14: Component — ShowToStaff (Screen 7b — Anti-Fraud Full Screen)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/ShowToStaff.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/components/ShowToStaff.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent } from '@testing-library/react-native'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'

jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))

describe('ShowToStaff', () => {
  const baseProps = {
    visible: true,
    redemptionCode: 'ABC1234567',
    voucherTitle: 'BOGO Pizza',
    voucherType: 'BOGO' as const,
    merchantName: 'Pizza Palace',
    branchName: 'High Street',
    customerName: 'Shebin C.',
    redeemedAt: '2026-04-17T10:00:00Z',
    onDone: jest.fn(),
  }

  it('renders voucher type badge', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('BUY ONE GET ONE FREE')).toBeTruthy()
  })

  it('renders redemption code prominently', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('ABC1234567')).toBeTruthy()
  })

  it('renders LIVE badge', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('LIVE')).toBeTruthy()
  })

  it('displays live date and time', () => {
    const { getByTestId } = render(<ShowToStaff {...baseProps} />)
    expect(getByTestId('live-clock')).toBeTruthy()
  })

  it('renders customer name in info card', () => {
    const { getByText } = render(<ShowToStaff {...baseProps} />)
    expect(getByText('Shebin C.')).toBeTruthy()
  })

  it('calls onDone when Done is tapped', () => {
    const onDone = jest.fn()
    const { getByText } = render(<ShowToStaff {...baseProps} onDone={onDone} />)
    fireEvent.press(getByText('Done'))
    expect(onDone).toHaveBeenCalled()
  })

  it('does not render when visible is false', () => {
    const { queryByText } = render(<ShowToStaff {...baseProps} visible={false} />)
    expect(queryByText('ABC1234567')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/ShowToStaff.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement ShowToStaff**

Create `src/features/voucher/components/ShowToStaff.tsx`:

```typescript
import React, { useState, useEffect } from 'react'
import { View, Modal, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import Animated, { useAnimatedStyle, withRepeat, withTiming, useSharedValue, Easing } from 'react-native-reanimated'
import { Tag, Clock } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import type { VoucherType } from '@/lib/api/redemption'

const TYPE_LABELS: Record<VoucherType, string> = {
  BOGO: 'BUY ONE GET ONE FREE',
  DISCOUNT_FIXED: 'DISCOUNT',
  DISCOUNT_PERCENT: 'DISCOUNT',
  FREEBIE: 'FREEBIE',
  SPEND_AND_SAVE: 'SPEND & SAVE',
  PACKAGE_DEAL: 'PACKAGE DEAL',
  TIME_LIMITED: 'TIME-LIMITED OFFER',
  REUSABLE: 'REUSABLE',
}

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  customerName: string
  redeemedAt: string
  onDone: () => void
}

function LiveClock() {
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  const formatted = now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    + ' · '
    + now.toLocaleTimeString('en-GB', { hour: 'numeric', minute: '2-digit', second: '2-digit', hour12: true })

  return (
    <View testID="live-clock" style={styles.clockRow}>
      <Clock size={18} color={color.brandRose} />
      <Text variant="heading.md" color="primary" style={styles.clockText}>{formatted}</Text>
    </View>
  )
}

export function ShowToStaff({
  visible, redemptionCode, voucherTitle, voucherType,
  merchantName, branchName, customerName, redeemedAt,
  onDone,
}: Props) {
  const pulseScale = useSharedValue(1)
  const pulseOpacity = useSharedValue(1)
  const motionScale = useMotionScale()

  useEffect(() => {
    if (visible && motionScale > 0) {
      pulseScale.value = withRepeat(
        withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1, true,
      )
      pulseOpacity.value = withRepeat(
        withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        -1, true,
      )
    }
  }, [visible, pulseScale, pulseOpacity, motionScale])

  const pulseStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }))

  if (!visible) return null

  const typeColor = color.voucher.byType[voucherType]
  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <LinearGradient
        colors={['#E20C04', '#C50A03', '#B80902', '#E84A00']}
        locations={[0, 0.3, 0.5, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.container}
      >
        {/* Type badge */}
        <View style={[styles.typeBadge, { backgroundColor: typeColor }]}>
          <Tag size={12} color="#FFF" />
          <Text variant="label.eyebrow" color="inverse" style={styles.typeText}>
            {TYPE_LABELS[voucherType]}
          </Text>
        </View>

        {/* Voucher info */}
        <Text variant="heading.lg" color="inverse" style={styles.voucherTitle}>{voucherTitle}</Text>
        <Text variant="body.sm" style={styles.voucherMeta}>{merchantName} · {branchName}</Text>

        {/* Animated code card */}
        <View style={styles.codeCardOuter}>
          <View style={styles.codeCard}>
            {/* LIVE badge */}
            <View style={styles.liveBadge}>
              <Animated.View style={[styles.liveDot, pulseStyle]} />
              <Text variant="label.eyebrow" style={styles.liveText}>LIVE</Text>
            </View>

            {/* Code */}
            <Text variant="display.lg" color="primary" style={styles.code}>{redemptionCode}</Text>

            {/* QR placeholder */}
            <View style={styles.qrBox}>
              <View style={styles.qrPattern} />
              <View style={styles.qrLogo}>
                <LinearGradient colors={[color.brandRose, color.brandCoral]} style={styles.qrLogoInner}>
                  <Text variant="label.lg" color="inverse" style={{ fontWeight: '800' }}>R</Text>
                </LinearGradient>
              </View>
            </View>

            {/* Live clock */}
            <View style={styles.clockDivider} />
            <LiveClock />
          </View>
        </View>

        {/* Info card */}
        <View style={styles.infoCard}>
          <InfoRow label="Customer" value={customerName} />
          <InfoRow label="Voucher Type" value={voucherType.replace(/_/g, ' ')} />
          <InfoRow label="Redeemed" value={`${dateStr} at ${timeStr}`} />
        </View>

        {/* Done button */}
        <Pressable
          onPress={() => { lightHaptic(); onDone() }}
          accessibilityRole="button"
          style={styles.doneButton}
        >
          <Text variant="heading.sm" color="inverse" style={{ fontWeight: '700', fontSize: 15 }}>Done</Text>
        </Pressable>
      </LinearGradient>
    </Modal>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text variant="body.sm" style={styles.infoLabel}>{label}</Text>
      <Text variant="body.sm" color="inverse" style={styles.infoValue}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 54, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },
  typeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: radius.md,
    marginBottom: spacing[3],
  },
  typeText: { letterSpacing: 0.12 * 12, fontSize: 12 },
  voucherTitle: { fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  voucherMeta: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontSize: 13, marginBottom: spacing[6] },
  codeCardOuter: {
    width: '100%',
    padding: 3,
    borderRadius: radius.xl,
    overflow: 'hidden',
    marginBottom: spacing[5],
  },
  codeCard: {
    backgroundColor: '#FFF',
    borderRadius: radius.xl - 2,
    paddingVertical: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  liveBadge: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing[3] },
  liveDot: { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.brandRose },
  liveText: { color: color.brandRose, fontWeight: '800', fontSize: 10 },
  code: { fontWeight: '800', fontSize: 38, letterSpacing: 6, fontVariant: ['tabular-nums'], marginBottom: spacing[5] },
  qrBox: {
    width: 160,
    height: 160,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: color.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  qrPattern: { width: 120, height: 120, backgroundColor: color.surface.subtle, borderRadius: 4 },
  qrLogo: { position: 'absolute', width: 28, height: 28 },
  qrLogoInner: { flex: 1, borderRadius: 6, justifyContent: 'center', alignItems: 'center' },
  clockDivider: {
    width: '100%',
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.border.subtle,
    marginTop: spacing[4],
    marginBottom: spacing[4],
  },
  clockRow: { flexDirection: 'row', alignItems: 'center', gap: spacing[2] },
  clockText: { fontWeight: '800', fontVariant: ['tabular-nums'] },
  infoCard: {
    width: '100%',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: radius.lg,
    padding: spacing[4],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
    marginBottom: spacing[5],
  },
  infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6 },
  infoLabel: { color: 'rgba(255,255,255,0.6)', fontWeight: '500', fontSize: 13 },
  infoValue: { fontWeight: '700', fontSize: 13 },
  doneButton: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 15,
    borderRadius: radius.lg,
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
})
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/components/ShowToStaff.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/ShowToStaff.tsx apps/customer-app/tests/features/voucher/components/ShowToStaff.test.tsx
git commit -m "feat(voucher): add ShowToStaff full-screen with LIVE badge, animated clock, QR, anti-fraud"
```

---

## Task 15: Component — RedemptionDetailsCard (Screen 8)

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`

- [ ] **Step 1: Implement RedemptionDetailsCard**

Create `src/features/voucher/components/RedemptionDetailsCard.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'

type Props = {
  redemptionCode: string
  branchName: string
  redeemedAt: string
}

export function RedemptionDetailsCard({ redemptionCode, branchName, redeemedAt }: Props) {
  const date = new Date(redeemedAt)
  const dateStr = date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  return (
    <View style={styles.card}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerIcon}>
          <Check size={14} color="#FFF" />
        </View>
        <View>
          <Text variant="heading.sm" color="primary" style={{ fontWeight: '800', fontSize: 15 }}>Redemption Details</Text>
          <Text variant="label.md" color="tertiary" style={{ fontSize: 11 }}>{dateStr} at {timeStr}</Text>
        </View>
      </View>

      {/* Info rows */}
      <View style={styles.infoRows}>
        <InfoRow label="Code" value={redemptionCode} mono />
        <InfoRow label="Branch" value={branchName} />
        <InfoRow label="Date" value={dateStr} />
        <InfoRow label="Time" value={timeStr} />
      </View>

      {/* QR Code */}
      <View style={styles.qrSection}>
        <Text variant="label.eyebrow" color="tertiary" style={styles.qrLabel}>Redemption QR Code</Text>
        <View style={styles.qrBox}>
          <View style={styles.qrPattern} />
          <View style={styles.qrLogo}>
            <LinearGradient colors={[color.brandRose, color.brandCoral]} style={styles.qrLogoInner}>
              <Text variant="label.lg" color="inverse" style={{ fontWeight: '800' }}>R</Text>
            </LinearGradient>
          </View>
        </View>
      </View>
    </View>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="label.md" color="tertiary" style={{ fontSize: 12 }}>{label}</Text>
      <Text
        variant={mono ? 'label.lg' : 'label.lg'}
        color="primary"
        style={[{ fontWeight: '700', fontSize: 12 }, mono && styles.monoValue]}
      >
        {value}
      </Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: {
    marginHorizontal: 14,
    marginTop: spacing[4],
    backgroundColor: '#FFF',
    borderRadius: radius.xl,
    padding: spacing[5],
    ...elevation.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing[3],
    marginBottom: spacing[4],
  },
  headerIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#16A34A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoRows: { gap: 8, marginBottom: spacing[4] },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  monoValue: { fontWeight: '800', fontSize: 16, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  qrSection: {
    borderTopWidth: 2,
    borderStyle: 'dashed',
    borderColor: color.border.subtle,
    paddingTop: spacing[4],
    alignItems: 'center',
  },
  qrLabel: { marginBottom: spacing[3], fontSize: 10 },
  qrBox: {
    width: 100,
    height: 100,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: color.border.subtle,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
  },
  qrPattern: { width: 80, height: 80, backgroundColor: color.surface.subtle, borderRadius: 2 },
  qrLogo: { position: 'absolute', width: 20, height: 20 },
  qrLogoInner: { flex: 1, borderRadius: 4, justifyContent: 'center', alignItems: 'center' },
})
```

- [ ] **Step 2: Run typecheck**

Run: `cd apps/customer-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 3: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx
git commit -m "feat(voucher): add RedemptionDetailsCard with code, QR, branch info"
```

---

## Task 16: Screen — VoucherDetailScreen (Main Orchestrator)

**Files:**
- Create: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- Create: `apps/customer-app/app/(app)/voucher/[id].tsx`
- Test: `apps/customer-app/tests/features/voucher/screens/VoucherDetailScreen.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `tests/features/voucher/screens/VoucherDetailScreen.test.tsx`:

```typescript
import React from 'react'
import { render, waitFor, fireEvent } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'
import { useVoucherDetail } from '@/features/voucher/hooks/useVoucherDetail'
import { useAuthStore } from '@/stores/auth'

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => ({ id: 'v1' }),
  useRouter: () => ({ back: jest.fn(), push: jest.fn() }),
}))
jest.mock('@/features/voucher/hooks/useVoucherDetail')
jest.mock('@/stores/auth')
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'))

const mockUseVoucherDetail = useVoucherDetail as jest.MockedFunction<typeof useVoucherDetail>
const mockUseAuthStore = useAuthStore as unknown as jest.MockedFunction<() => ReturnType<typeof useAuthStore>>

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return React.createElement(QueryClientProvider, { client: qc }, children)
}

const voucher = {
  id: 'v1',
  title: 'BOGO Pizza',
  type: 'BOGO' as const,
  description: 'Get a free pizza',
  terms: 'Valid Mon–Fri\nMust order main course',
  imageUrl: null,
  estimatedSaving: 14.99,
  expiryDate: null,
  code: 'RMV-001',
  status: 'ACTIVE',
  approvalStatus: 'APPROVED',
  isRedeemedThisCycle: false,
  isFavourited: false,
  merchant: { id: 'm1', businessName: 'Pizza Palace', tradingName: null, logoUrl: null, status: 'ACTIVE' },
}

describe('VoucherDetailScreen', () => {
  beforeEach(() => {
    mockUseAuthStore.mockReturnValue({
      status: 'authed',
      user: { id: 'u1', email: 'test@test.com', firstName: 'Shebin', phone: '07123', emailVerified: true, phoneVerified: true },
    } as any)
  })

  it('renders voucher title when data loads', async () => {
    mockUseVoucherDetail.mockReturnValue({ data: voucher, isLoading: false, error: null } as any)
    const { getByText } = render(<VoucherDetailScreen />, { wrapper })
    await waitFor(() => expect(getByText('BOGO Pizza')).toBeTruthy())
  })

  it('shows loading state initially', () => {
    mockUseVoucherDetail.mockReturnValue({ data: undefined, isLoading: true, error: null } as any)
    const { getByAccessibilityLabel } = render(<VoucherDetailScreen />, { wrapper })
    expect(getByAccessibilityLabel('Loading voucher details')).toBeTruthy()
  })

  it('shows subscribe CTA for unauthenticated users', async () => {
    mockUseAuthStore.mockReturnValue({ status: 'unauthenticated', user: null } as any)
    mockUseVoucherDetail.mockReturnValue({ data: voucher, isLoading: false, error: null } as any)
    const { getByText } = render(<VoucherDetailScreen />, { wrapper })
    await waitFor(() => expect(getByText(/Subscribe to Redeem/)).toBeTruthy())
  })

  it('shows already redeemed state', async () => {
    mockUseVoucherDetail.mockReturnValue({
      data: { ...voucher, isRedeemedThisCycle: true },
      isLoading: false,
      error: null,
    } as any)
    const { getByText } = render(<VoucherDetailScreen />, { wrapper })
    await waitFor(() => expect(getByText('Already Redeemed This Cycle')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/customer-app && npx jest tests/features/voucher/screens/VoucherDetailScreen.test.tsx --no-coverage`
Expected: FAIL — module not found

- [ ] **Step 3: Implement VoucherDetailScreen**

Create `src/features/voucher/screens/VoucherDetailScreen.tsx`:

```typescript
import React, { useState, useCallback, useMemo } from 'react'
import { View, ScrollView, StyleSheet, ActivityIndicator, Share } from 'react-native'
import { useLocalSearchParams, useRouter } from 'expo-router'
import { Star } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, layout } from '@/design-system/tokens'
import { useAuthStore } from '@/stores/auth'
import { useVoucherDetail } from '../hooks/useVoucherDetail'
import { useRedeem } from '../hooks/useRedeem'
import { useTimeLimited } from '../hooks/useTimeLimited'
import { useFavourite } from '@/hooks/useFavourite'
import { CouponHeader } from '../components/CouponHeader'
import { PerforationLine } from '../components/PerforationLine'
import { CouponCardTop } from '../components/CouponCardTop'
import { CouponBody } from '../components/CouponBody'
import { MerchantRow } from '../components/MerchantRow'
import { HowItWorks } from '../components/HowItWorks'
import { RedeemCTA } from '../components/RedeemCTA'
import { TimeLimitedBanner } from '../components/TimeLimitedBanner'
import { RedeemedBadge } from '../components/RedeemedBadge'
import { PinEntrySheet } from '../components/PinEntrySheet'
import { SuccessPopup } from '../components/SuccessPopup'
import { ShowToStaff } from '../components/ShowToStaff'
import { RedemptionDetailsCard } from '../components/RedemptionDetailsCard'
import type { ApiClientError } from '@/lib/errors'

const PAGE_BG = '#F5F0EB'

export function VoucherDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>()
  const router = useRouter()
  const { status, user } = useAuthStore()
  const { data: voucher, isLoading } = useVoucherDetail(id)
  const redeemMutation = useRedeem()

  const isAuthed = status === 'authed'
  const isRedeemed = voucher?.isRedeemedThisCycle ?? false

  const timeLimited = useTimeLimited({
    type: voucher?.type ?? 'BOGO',
    expiryDate: voucher?.expiryDate ?? null,
  })

  const favourite = useFavourite({
    type: 'voucher',
    id: voucher?.id ?? '',
    isFavourited: voucher?.isFavourited ?? false,
  })

  const [showPinSheet, setShowPinSheet] = useState(false)
  const [showSuccessPopup, setShowSuccessPopup] = useState(false)
  const [showStaffScreen, setShowStaffScreen] = useState(false)
  const [pinError, setPinError] = useState<{ code: string; attemptsRemaining?: number } | null>(null)
  const [lockoutSeconds, setLockoutSeconds] = useState(0)

  const ctaState = useMemo(() => {
    if (!isAuthed) return 'subscribe' as const
    if (isRedeemed) return 'already_redeemed' as const
    if (timeLimited.state === 'expired') return 'expired' as const
    if (timeLimited.state === 'outside_window') return 'outside_window' as const
    return 'can_redeem' as const
  }, [isAuthed, isRedeemed, timeLimited.state])

  const handleCTAPress = useCallback(() => {
    if (ctaState === 'subscribe') {
      router.push('/(auth)/subscribe-prompt' as never)
      return
    }
    if (ctaState === 'can_redeem') {
      setPinError(null)
      setShowPinSheet(true)
    }
  }, [ctaState, router])

  const handlePinSubmit = useCallback(async (pin: string) => {
    if (!voucher) return
    try {
      await redeemMutation.mutateAsync({
        voucherId: voucher.id,
        branchId: voucher.merchant.id,
        pin,
      })
      setPinError(null)
      setShowPinSheet(false)
      setShowSuccessPopup(true)
    } catch (err: unknown) {
      const error = err as { code: string; message: string; status: number }
      if (error.code === 'INVALID_PIN') {
        const match = error.message.match(/(\d+) attempts remaining/)
        setPinError({
          code: 'INVALID_PIN',
          attemptsRemaining: match ? parseInt(match[1], 10) : undefined,
        })
      } else if (error.code === 'PIN_RATE_LIMIT_EXCEEDED') {
        setLockoutSeconds(15 * 60)
        setPinError(null)
      } else if (error.code === 'ALREADY_REDEEMED') {
        setShowPinSheet(false)
      } else if (error.code === 'SUBSCRIPTION_REQUIRED') {
        setShowPinSheet(false)
        router.push('/(auth)/subscribe-prompt' as never)
      }
    }
  }, [voucher, redeemMutation, router])

  const handleShare = useCallback(async () => {
    if (!voucher) return
    await Share.share({
      message: `Check out "${voucher.title}" at ${voucher.merchant.businessName} on Redeemo!`,
    })
  }, [voucher])

  if (isLoading || !voucher) {
    return (
      <View style={styles.loadingContainer} accessibilityLabel="Loading voucher details">
        <ActivityIndicator size="large" color={color.brandRose} />
      </View>
    )
  }

  const isExpired = timeLimited.state === 'expired'

  return (
    <View style={styles.container}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Coupon Header */}
        <View style={{ position: 'relative' }}>
          <CouponHeader
            voucherType={voucher.type}
            title={voucher.title}
            description={voucher.description}
            estimatedSaving={voucher.estimatedSaving}
            isFavourited={favourite.isFavourited}
            onToggleFavourite={favourite.toggle}
            onShare={handleShare}
            isRedeemed={isRedeemed}
            isExpired={isExpired}
          >
            {timeLimited.state !== 'inactive' && (
              <TimeLimitedBanner
                state={timeLimited.state}
                formattedCountdown={timeLimited.formattedCountdown}
                expiryDateFormatted={timeLimited.expiryDateFormatted}
                nextWindowLabel={timeLimited.nextWindowLabel}
                scheduleLabel={timeLimited.scheduleLabel}
              />
            )}
          </CouponHeader>

          {/* Badge positioned OUTSIDE header (sibling, not child) */}
          {isRedeemed && <RedeemedBadge variant="redeemed" />}
          {isExpired && !isRedeemed && <RedeemedBadge variant="expired" />}
        </View>

        {/* Perforation line */}
        <PerforationLine />

        {/* Coupon card top */}
        <CouponCardTop
          imageUrl={voucher.imageUrl}
          voucherType={voucher.type}
          expiryDate={voucher.expiryDate}
          terms={voucher.terms}
          isRedeemed={isRedeemed}
        />

        {/* Mid perforation */}
        <PerforationLine variant="small" />

        {/* Coupon body */}
        <CouponBody terms={voucher.terms} isRedeemed={isRedeemed} />

        {/* Merchant card */}
        <MerchantRow
          merchantId={voucher.merchant.id}
          businessName={voucher.merchant.businessName}
          logoUrl={voucher.merchant.logoUrl}
          category={null}
          branchName={null}
          distance={null}
          isRedeemed={isRedeemed}
        />

        {/* Redemption details (Screen 8) */}
        {isRedeemed && redeemMutation.data && (
          <RedemptionDetailsCard
            redemptionCode={redeemMutation.data.redemptionCode}
            branchName="Branch"
            redeemedAt={redeemMutation.data.redeemedAt}
          />
        )}

        {/* Rate & Review CTA (Screen 8) */}
        {isRedeemed && (
          <View style={styles.reviewCTA}>
            <Star size={14} color="#7C3AED" />
            <Text variant="label.lg" style={styles.reviewText}>Rate & Review {voucher.merchant.businessName}</Text>
          </View>
        )}

        {/* How It Works (Screen 1 only) */}
        {isAuthed && !isRedeemed && !isExpired && <HowItWorks />}

        {/* Bottom spacing for sticky CTA */}
        <View style={{ height: 120 }} />
      </ScrollView>

      {/* Sticky CTA */}
      <RedeemCTA
        state={ctaState}
        onPress={handleCTAPress}
        scheduleLabel={timeLimited.scheduleLabel}
      />

      {/* PIN Entry Sheet */}
      <PinEntrySheet
        visible={showPinSheet}
        onDismiss={() => setShowPinSheet(false)}
        onSubmit={handlePinSubmit}
        merchantName={voucher.merchant.businessName}
        merchantLogo={voucher.merchant.logoUrl}
        branchName="Branch"
        isLoading={redeemMutation.isPending}
        error={pinError}
        lockoutSeconds={lockoutSeconds}
      />

      {/* Success Popup (Screen 7) */}
      {redeemMutation.data && (
        <SuccessPopup
          visible={showSuccessPopup}
          redemptionCode={redeemMutation.data.redemptionCode}
          voucherTitle={voucher.title}
          voucherType={voucher.type}
          merchantName={voucher.merchant.businessName}
          branchName="Branch"
          imageUrl={voucher.imageUrl}
          redeemedAt={redeemMutation.data.redeemedAt}
          onShowToStaff={() => { setShowSuccessPopup(false); setShowStaffScreen(true) }}
          onRateReview={() => { /* navigate to review */ }}
          onDone={() => setShowSuccessPopup(false)}
        />
      )}

      {/* Show to Staff (Screen 7b) */}
      {redeemMutation.data && (
        <ShowToStaff
          visible={showStaffScreen}
          redemptionCode={redeemMutation.data.redemptionCode}
          voucherTitle={voucher.title}
          voucherType={voucher.type}
          merchantName={voucher.merchant.businessName}
          branchName="Branch"
          customerName={user ? `${user.firstName} ${user.email.charAt(0).toUpperCase()}.` : 'Customer'}
          redeemedAt={redeemMutation.data.redeemedAt}
          onDone={() => setShowStaffScreen(false)}
        />
      )}
    </View>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: PAGE_BG },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: PAGE_BG },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 0 },
  reviewCTA: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing[2],
    marginHorizontal: 14,
    marginTop: spacing[4],
    paddingVertical: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(124,58,237,0.06)',
    borderWidth: 1.5,
    borderColor: '#7C3AED',
  },
  reviewText: { color: '#7C3AED', fontWeight: '700', fontSize: 14 },
})
```

- [ ] **Step 4: Create the route file**

Create `app/(app)/voucher/[id].tsx`:

```typescript
import { VoucherDetailScreen } from '@/features/voucher/screens/VoucherDetailScreen'

export default function VoucherDetailRoute() {
  return <VoucherDetailScreen />
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/customer-app && npx jest tests/features/voucher/screens/VoucherDetailScreen.test.tsx --no-coverage`
Expected: PASS

- [ ] **Step 6: Run full typecheck**

Run: `cd apps/customer-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 7: Commit**

```bash
git add apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx apps/customer-app/app/\(app\)/voucher/\[id\].tsx apps/customer-app/tests/features/voucher/screens/VoucherDetailScreen.test.tsx
git commit -m "feat(voucher): add VoucherDetailScreen orchestrator with all 12 states and route"
```

---

## Task 17: Urgency + Availability Banners (Below Coupon)

**Files:**
- Modify: `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`

These banners appear below the coupon card for time-limited vouchers (Screens 1a, 1b, 1c from the spec).

- [ ] **Step 1: Create UrgencyBanner component**

Create `src/features/voucher/components/UrgencyBanner.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { AlertTriangle, Clock, ChevronRight } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { spacing, radius } from '@/design-system/tokens'

type Props = {
  state: 'active' | 'expired' | 'outside_window' | 'inactive'
  expiryDateFormatted: string | null
  nextWindowLabel: string | null
  scheduleLabel: string | null
}

export function UrgencyBanner({ state, expiryDateFormatted, nextWindowLabel, scheduleLabel }: Props) {
  if (state === 'inactive') return null

  if (state === 'active') {
    return (
      <View style={[styles.banner, styles.amberBanner]}>
        <View style={[styles.iconBox, { backgroundColor: '#D97706' }]}>
          <AlertTriangle size={18} color="#FFF" />
        </View>
        <View style={styles.bannerContent}>
          <Text variant="label.md" style={[styles.title, { color: '#B45309' }]}>Limited Time Remaining</Text>
          <Text variant="label.md" style={[styles.text, { color: '#92400E' }]}>
            This voucher expires on {expiryDateFormatted}. Redeem before it's gone!
          </Text>
        </View>
      </View>
    )
  }

  if (state === 'outside_window') {
    return (
      <View style={[styles.banner, styles.blueBanner]}>
        <View style={[styles.iconBox, { backgroundColor: '#2563EB' }]}>
          <Clock size={18} color="#FFF" />
        </View>
        <View style={styles.bannerContent}>
          <Text variant="label.md" style={[styles.title, { color: '#1D4ED8' }]}>Not Currently Available</Text>
          <Text variant="label.md" style={[styles.text, { color: '#1E40AF' }]}>
            This voucher can only be redeemed {scheduleLabel ?? 'during limited hours'}.
          </Text>
          {nextWindowLabel && (
            <View style={styles.nextChip}>
              <Text variant="label.md" style={styles.nextText}>Next available: {nextWindowLabel}</Text>
              <ChevronRight size={12} color="#1D4ED8" />
            </View>
          )}
        </View>
      </View>
    )
  }

  return null
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    gap: spacing[3],
    marginHorizontal: 14,
    marginTop: spacing[4],
    padding: spacing[4],
    borderRadius: radius.md + 2,
    borderWidth: 1,
  },
  amberBanner: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  blueBanner: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  iconBox: { width: 36, height: 36, borderRadius: 10, justifyContent: 'center', alignItems: 'center' },
  bannerContent: { flex: 1 },
  title: { fontWeight: '800', fontSize: 12, marginBottom: 4 },
  text: { fontSize: 11, lineHeight: 16 },
  nextChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: spacing[2],
    backgroundColor: 'rgba(37,99,235,0.1)',
    alignSelf: 'flex-start',
    paddingVertical: 4,
    paddingHorizontal: spacing[2],
    borderRadius: radius.sm,
  },
  nextText: { color: '#1D4ED8', fontWeight: '700', fontSize: 11 },
})
```

- [ ] **Step 2: Integrate UrgencyBanner into VoucherDetailScreen**

Add the import and render the banner between `CouponBody` and `MerchantRow` in `VoucherDetailScreen.tsx`:

```typescript
// Add import
import { UrgencyBanner } from '../components/UrgencyBanner'

// Add after CouponBody, before MerchantRow:
{timeLimited.state !== 'inactive' && (
  <UrgencyBanner
    state={timeLimited.state}
    expiryDateFormatted={timeLimited.expiryDateFormatted}
    nextWindowLabel={timeLimited.nextWindowLabel}
    scheduleLabel={timeLimited.scheduleLabel}
  />
)}
```

- [ ] **Step 3: Run typecheck**

Run: `cd apps/customer-app && npx tsc --noEmit`
Expected: No errors

- [ ] **Step 4: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/UrgencyBanner.tsx apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx
git commit -m "feat(voucher): add urgency and availability banners for time-limited vouchers"
```

---

## Task 18: Full Test Suite + TypeCheck

**Files:**
- All test files

- [ ] **Step 1: Run the complete test suite**

Run: `cd apps/customer-app && npx jest --no-coverage`
Expected: All tests pass

- [ ] **Step 2: Run typecheck**

Run: `cd apps/customer-app && npx tsc --noEmit`
Expected: No type errors

- [ ] **Step 3: Run lint**

Run: `cd apps/customer-app && npx eslint src/features/voucher/ --ext .ts,.tsx`
Expected: No errors (warnings acceptable)

- [ ] **Step 4: Fix any issues found**

Address any test failures, type errors, or lint issues. Commit fixes individually.

- [ ] **Step 5: Final commit**

```bash
git commit -m "chore(voucher): ensure all tests, types, and lint pass for voucher detail feature"
```

---

## Self-Review Checklist

### Spec Coverage

| Spec Section | Task(s) | Covered |
|-------------|---------|---------|
| 1. Design System tokens | Task 1 | ✅ |
| 2. Screen Inventory (12 screens) | Tasks 7–17 | ✅ |
| 3. Screen 1 — Subscribed User | Tasks 7, 8, 9, 16 | ✅ |
| 4. Screen 2 — Free User | Task 9 (RedeemCTA subscribe state), Task 16 | ✅ |
| 4b. Screens 1a/1b/1c — Time-Limited | Tasks 4, 10, 11, 17 | ✅ |
| 5. Screens 3–6 — PIN Entry | Task 12 | ✅ |
| 6. Screen 7 — Success Popup | Task 13 | ✅ |
| 7. Screen 7b — Show to Staff | Task 14 | ✅ |
| 8. Screen 8 — Already Redeemed | Tasks 11, 15, 16 | ✅ |
| 9. Post-Redemption Automations | Backend (Phase 6) | ⏳ Deferred |
| 10. Backend Interactions | Tasks 2, 3 | ✅ |
| 11. Edge Cases & Guards | Task 16 (orchestrator) | ✅ |
| 12. Accessibility | All component tasks | ✅ |

### Post-Redemption Automations (Section 9)

Section 9 covers server-side jobs (merchant email, customer email, push notification review reminder). These depend on:
- Resend integration (Phase 6)
- FCM + BullMQ (Phase 6)
- Notification preferences (Account section — separate spec)

These are **intentionally deferred** — the frontend simply triggers the redemption API; automations happen server-side.

### Type Consistency Check

- `VoucherType` — defined in `redemption.ts`, used consistently across all components
- `VoucherDetail` — API response type, consumed by `useVoucherDetail`
- `RedemptionResponse` — API response from `POST /api/v1/redemption`, consumed by `useRedeem`
- `color.voucher.byType[voucherType]` — lookup pattern used in `CouponHeader`, `SuccessPopup`, `ShowToStaff`
- `TimeLimitedState` — `'inactive' | 'active' | 'expired' | 'outside_window'` — consistent across `useTimeLimited`, `TimeLimitedBanner`, `UrgencyBanner`, `RedeemCTA`, `VoucherDetailScreen`
