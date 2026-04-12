const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'
import { getAccessToken } from '@/lib/auth'

export class ApiError extends Error {
  constructor(public status: number, public body: unknown) {
    super(`API error ${status}`)
  }
}

async function apiFetch<T>(
  path: string,
  options: RequestInit & { auth?: boolean } = {}
): Promise<T> {
  const { auth = false, ...init } = options
  const headers = new Headers(init.headers)

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }

  if (auth && typeof window !== 'undefined') {
    const token = getAccessToken()
    if (token) headers.set('Authorization', `Bearer ${token}`)
  }

  const res = await fetch(`${BASE}${path}`, { ...init, headers })

  if (!res.ok) {
    const body = await res.json().catch(() => null)
    throw new ApiError(res.status, body)
  }

  // 204 No Content
  if (res.status === 204) return undefined as T

  return res.json() as Promise<T>
}

// ── Auth ──────────────────────────────────────────────────────────────────────

export type LoginResponse = {
  accessToken: string
  refreshToken: string
  user: { id: string; name: string; email: string }
}

export const authApi = {
  login: (email: string, password: string) =>
    apiFetch<LoginResponse>('/api/v1/customer/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),

  register: (name: string, email: string, password: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password }),
    }),

  logout: () =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/logout', {
      method: 'POST',
      auth: true,
    }),

  refresh: (refreshToken: string) =>
    apiFetch<{ accessToken: string; refreshToken: string }>(
      '/api/v1/customer/auth/refresh',
      { method: 'POST', body: JSON.stringify({ refreshToken }) }
    ),

  forgotPassword: (email: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),
}

// ── Discovery ─────────────────────────────────────────────────────────────────
// Paths verified against src/api/customer/discovery/routes.ts

// MerchantTileData is the canonical type for merchant cards throughout the app.
export type MerchantTileData = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  primaryCategory: { id: string; name: string; pinColour: string | null } | null
  subcategory: { id: string; name: string } | null
  avgRating: number | null
  reviewCount: number
  voucherCount: number
  maxEstimatedSaving: number | null
  isFavourited: boolean
  distance: number | null
  nearestBranchId: string | null
}

export type VoucherData = {
  id: string
  title: string
  description: string
  type: string
  estimatedSaving: number
  merchant: { id: string; name: string; logoUrl: string | null }
}

export const discoveryApi = {
  // GET /api/v1/customer/home
  homeFeed: (params?: { lat?: number; lng?: number }) => {
    const sp = new URLSearchParams()
    if (params?.lat !== undefined) sp.set('lat', String(params.lat))
    if (params?.lng !== undefined) sp.set('lng', String(params.lng))
    const qs = sp.toString() ? `?${sp.toString()}` : ''
    return apiFetch<{
      locationContext: { city: string | null; source: 'coordinates' | 'profile' | 'none' }
      featured: MerchantTileData[]
      trending: MerchantTileData[]
      campaigns: { id: string; name: string; description: string | null; bannerImageUrl: string | null }[]
      nearbyByCategory: { category: { id: string; name: string }; merchants: MerchantTileData[] }[]
    }>(`/api/v1/customer/home${qs}`)
  },

  // GET /api/v1/customer/search
  search: (q: string, params?: { categoryId?: string; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams({ q })
    if (params?.categoryId) sp.set('categoryId', params.categoryId)
    sp.set('limit', String(params?.limit ?? 20))
    sp.set('offset', String(params?.offset ?? 0))
    return apiFetch<{ merchants: MerchantTileData[]; total: number }>(
      `/api/v1/customer/search?${sp}`
    )
  },

  // GET /api/v1/customer/categories
  categories: () =>
    apiFetch<{ categories: { id: string; name: string; iconUrl: string | null }[] }>(
      '/api/v1/customer/categories'
    ),

  // GET /api/v1/customer/campaigns
  campaigns: () =>
    apiFetch<{ id: string; name: string; description: string | null; bannerImageUrl: string | null }[]>(
      '/api/v1/customer/campaigns'
    ),

  // GET /api/v1/customer/campaigns/:id/merchants
  campaignMerchants: (id: string, params?: { categoryId?: string; lat?: number; lng?: number; limit?: number; offset?: number }) => {
    const sp = new URLSearchParams()
    if (params?.categoryId) sp.set('categoryId', params.categoryId)
    if (params?.lat !== undefined) sp.set('lat', String(params.lat))
    if (params?.lng !== undefined) sp.set('lng', String(params.lng))
    sp.set('limit', String(params?.limit ?? 20))
    sp.set('offset', String(params?.offset ?? 0))
    return apiFetch<{ merchants: MerchantTileData[]; total: number }>(
      `/api/v1/customer/campaigns/${id}/merchants?${sp}`
    )
  },

  // GET /api/v1/customer/merchants/:id
  getMerchant: (id: string, opts?: { lat?: number; lng?: number }) => {
    const sp = new URLSearchParams()
    if (opts?.lat !== undefined) sp.set('lat', String(opts.lat))
    if (opts?.lng !== undefined) sp.set('lng', String(opts.lng))
    const qs = sp.toString() ? `?${sp.toString()}` : ''
    return apiFetch<{
      id: string
      name: string
      description: string | null
      logoUrl: string | null
      coverImageUrl: string | null
      bannerUrl: string | null
      websiteUrl: string | null
      primaryCategory: { id: string; name: string }
      branches: { id: string; name: string; address: string; distance: number | null }[]
      vouchers: VoucherData[]
      avgRating: number | null
      reviewCount: number
      amenities: string[]
      openingHours: Record<string, string> | null
      status: string
    }>(`/api/v1/customer/merchants/${id}${qs}`)
  },

  // GET /api/v1/customer/merchants/:id/branches
  getMerchantBranches: (id: string) =>
    apiFetch<{ id: string; name: string; address: string }[]>(
      `/api/v1/customer/merchants/${id}/branches`
    ),

  // GET /api/v1/customer/vouchers/:id
  voucher: (id: string) =>
    apiFetch<VoucherData & { merchant: { id: string; name: string } }>(
      `/api/v1/customer/vouchers/${id}`
    ),
}

// ── Profile ───────────────────────────────────────────────────────────────────

export type ProfileData = {
  id: string
  firstName: string
  lastName: string
  name: string
  email: string
  phoneNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  city: string | null
  postcode: string | null
  profileImageUrl: string | null
  newsletterConsent: boolean
  emailVerified: boolean
  phoneVerified: boolean
  interests: { id: string; name: string }[]
  profileCompleteness: number
}

export const profileApi = {
  get: () => apiFetch<ProfileData>('/api/v1/customer/profile/me', { auth: true }),
  update: (data: Partial<ProfileData>) =>
    apiFetch<ProfileData>('/api/v1/customer/profile/me', {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(data),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/profile/change-password', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ currentPassword, newPassword }),
    }),
}

// ── Subscription ──────────────────────────────────────────────────────────────

export const subscriptionApi = {
  plans: () =>
    apiFetch<{ id: string; name: string; price: number; interval: string }[]>(
      '/api/v1/subscription/plans'
    ),
  setupIntent: () =>
    apiFetch<{ clientSecret: string }>('/api/v1/subscription/setup-intent', {
      method: 'POST',
      auth: true,
    }),
  create: (planId: string, paymentMethodId: string) =>
    apiFetch<{ status: string }>('/api/v1/subscription', {
      method: 'POST',
      auth: true,
      body: JSON.stringify({ planId, paymentMethodId }),
    }),
  get: () =>
    apiFetch<{
      status: string
      planName: string
      currentPeriodEnd: string
      cancelAtPeriodEnd: boolean
    }>('/api/v1/subscription/me', { auth: true }),
  cancel: () =>
    apiFetch<{ message: string }>('/api/v1/subscription', {
      method: 'DELETE',
      auth: true,
    }),
}

// ── Savings ───────────────────────────────────────────────────────────────────
// Field names verified against src/api/customer/savings/service.ts

export type SavingsSummary = {
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
  monthlyBreakdown: { month: string; saving: number; count: number }[]
  // Note: byMerchant uses `businessName` (from merchant.businessName in DB)
  byMerchant: { merchantId: string; businessName: string; logoUrl: string | null; saving: number; count: number }[]
  byCategory: { categoryId: string; name: string; saving: number }[]
}

export const savingsApi = {
  summary: () =>
    apiFetch<SavingsSummary>('/api/v1/customer/savings/summary', { auth: true }),
  redemptions: (params?: { limit?: number; offset?: number }) => {
    const sp = new URLSearchParams({
      limit: String(params?.limit ?? 20),
      offset: String(params?.offset ?? 0),
    })
    // merchant.name verified from service.ts (r.voucher.merchant.name)
    // voucherType field verified from service.ts (r.voucher.voucherType)
    return apiFetch<{
      redemptions: {
        id: string
        redeemedAt: string
        estimatedSaving: number
        isValidated: boolean
        merchant: { id: string; name: string; logoUrl: string | null }
        voucher: { id: string; title: string; voucherType: string }
        branch: { id: string; name: string }
      }[]
      total: number
    }>(`/api/v1/customer/savings/redemptions?${sp}`, { auth: true })
  },
}

// ── Favourites ────────────────────────────────────────────────────────────────
// Paths verified against src/api/customer/favourites/routes.ts
// Note: add endpoints use path params, not request body

export const favouritesApi = {
  listMerchants: () =>
    apiFetch<{ merchants: MerchantTileData[] }>(
      '/api/v1/customer/favourites/merchants',
      { auth: true }
    ),
  // POST /api/v1/customer/favourites/merchants/:merchantId (path param, no body)
  addMerchant: (merchantId: string) =>
    apiFetch<{ message: string }>(
      `/api/v1/customer/favourites/merchants/${merchantId}`,
      { method: 'POST', auth: true }
    ),
  // DELETE /api/v1/customer/favourites/merchants/:merchantId
  removeMerchant: (merchantId: string) =>
    apiFetch<void>(`/api/v1/customer/favourites/merchants/${merchantId}`, {
      method: 'DELETE',
      auth: true,
    }),
  listVouchers: () =>
    apiFetch<{
      vouchers: {
        id: string
        title: string
        type: string
        estimatedSaving: number | null
        imageUrl: string | null
        status: string
        approvalStatus: string
        merchant: { id: string; businessName: string; logoUrl: string | null }
        favouritedAt: string
      }[]
    }>('/api/v1/customer/favourites/vouchers', { auth: true }),
  // POST /api/v1/customer/favourites/vouchers/:voucherId (path param, no body)
  addVoucher: (voucherId: string) =>
    apiFetch<{ message: string }>(
      `/api/v1/customer/favourites/vouchers/${voucherId}`,
      { method: 'POST', auth: true }
    ),
  // DELETE /api/v1/customer/favourites/vouchers/:voucherId
  removeVoucher: (voucherId: string) =>
    apiFetch<void>(`/api/v1/customer/favourites/vouchers/${voucherId}`, {
      method: 'DELETE',
      auth: true,
    }),
}
