# Customer Website (Phase 3C-C) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the Redeemo customer-facing website (`apps/customer-web/`) — a Next.js 16 App Router application covering discovery, merchant browsing, subscription purchase, account management, and a marketing landing page that converts both consumers and merchants.

**Architecture:** Monorepo addition — new `apps/customer-web/` workspace within the existing Node.js repo. The website consumes the existing Fastify API (at `NEXT_PUBLIC_API_URL`) via a typed fetch client. No server-side API routes are added (Next.js is purely a frontend consumer). Auth state is managed client-side: the backend returns `{ accessToken, refreshToken, user }` as JSON on login. The website stores tokens in `localStorage` and sends `Authorization: Bearer <accessToken>` on all authenticated requests. Next.js middleware reads a `redeemo_auth` flag cookie (set by the client after login) to redirect unauthenticated users away from protected routes — the cookie carries no token data, only a boolean presence signal.

**Tech Stack:** Next.js 16 (App Router, TypeScript), Tailwind CSS v4, Framer Motion 12, `next/font/google` (Calistoga + DM Sans + DM Mono), 21st.dev Magic (component generation), Stripe.js (frontend Stripe SDK for payment element). No separate state management library — React Context + SWR for server-state caching.

---

## Brand Tokens (reference for all tasks)

```
Colors:
  --red:        #E2000C
  --orange-red: #E84A00
  --orange:     #EE6904
  --navy:       #010C35
  --deep-navy:  #00041E
  --coral:      #E04403

Typography:
  Display:  Calistoga (Google Fonts)
  Body:     DM Sans (Google Fonts)
  Labels:   DM Mono (Google Fonts)

Logo SVG paths (copy as-is into components):
  Horizontal wordmark: Branding /Redeemo Branding Package/Logo Files/SVG/Horizontal Version 1.svg
  Icon mark (R):       Branding /Redeemo Branding Package/Logo Files/SVG/Iconic Version 1.svg
  Favicon ICO:         Branding /Redeemo Branding Package/Logo Files/favicon_io/favicon.ico
  Favicon PNG 32:      Branding /Redeemo Branding Package/Logo Files/favicon_io/favicon-32x32.png
  Favicon PNG 16:      Branding /Redeemo Branding Package/Logo Files/favicon_io/favicon-16x16.png
  Apple touch:         Branding /Redeemo Branding Package/Logo Files/favicon_io/apple-touch-icon.png
```

---

## File Structure

```
apps/customer-web/
├── app/
│   ├── layout.tsx                    # Root layout — fonts, nav, footer
│   ├── page.tsx                      # Landing page /
│   ├── merchants/
│   │   └── page.tsx                  # Merchant pitch page /merchants
│   ├── discover/
│   │   └── page.tsx                  # Discovery/home feed /discover
│   ├── search/
│   │   └── page.tsx                  # Search results /search
│   ├── merchants/
│   │   └── [id]/
│   │       └── page.tsx              # Merchant profile /merchants/[id]
│   ├── subscribe/
│   │   └── page.tsx                  # Plans + Stripe payment /subscribe
│   ├── login/
│   │   └── page.tsx                  # Login /login
│   ├── register/
│   │   └── page.tsx                  # Register /register
│   ├── forgot-password/
│   │   └── page.tsx                  # Forgot password /forgot-password
│   ├── reset-password/
│   │   └── page.tsx                  # Reset password /reset-password?token=
│   ├── account/
│   │   ├── page.tsx                  # Account hub /account
│   │   ├── profile/
│   │   │   └── page.tsx              # Edit profile /account/profile
│   │   ├── savings/
│   │   │   └── page.tsx              # Savings summary /account/savings
│   │   ├── favourites/
│   │   │   └── page.tsx              # Favourites list /account/favourites
│   │   └── delete/
│   │       └── page.tsx              # Delete account /account/delete
│   └── globals.css                   # Tailwind base + CSS custom properties
├── components/
│   ├── ui/                           # 21st.dev Magic generated primitives
│   │   ├── MerchantTile.tsx
│   │   ├── VoucherCard.tsx
│   │   ├── SavingsBadge.tsx
│   │   ├── FilterDrawer.tsx
│   │   ├── PricingCard.tsx
│   │   ├── CategoryChip.tsx
│   │   └── AppMockupFrame.tsx
│   ├── layout/
│   │   ├── Navbar.tsx
│   │   └── Footer.tsx
│   ├── landing/
│   │   ├── HeroSection.tsx
│   │   ├── HowItWorksSection.tsx
│   │   ├── FeaturedMerchantsSection.tsx
│   │   ├── CategorySection.tsx
│   │   ├── SavingsStatsSection.tsx
│   │   ├── AppMockupSection.tsx
│   │   ├── TestimonialsSection.tsx
│   │   ├── MerchantCtaSection.tsx
│   │   ├── PricingSection.tsx
│   │   └── FinalCtaSection.tsx
│   ├── merchant-pitch/
│   │   ├── MerchantHero.tsx
│   │   ├── BenefitsGrid.tsx
│   │   ├── HowMerchantsWork.tsx
│   │   ├── MerchantPricingSection.tsx
│   │   └── MerchantSignupCta.tsx
│   ├── auth/
│   │   ├── LoginForm.tsx
│   │   └── RegisterForm.tsx
│   └── account/
│       ├── SavingsChart.tsx
│       └── FavouritesList.tsx
├── lib/
│   ├── api.ts                        # Typed fetch client for the Fastify API
│   ├── auth.ts                       # Auth helpers (read cookie, decode JWT)
│   └── stripe.ts                     # Stripe.js initialisation
├── middleware.ts                     # Next.js middleware — route protection
├── next.config.ts
├── tailwind.config.ts
├── tsconfig.json
└── package.json
```

---

## Task 1: Project Scaffold

**Files:**
- Create: `apps/customer-web/package.json`
- Create: `apps/customer-web/next.config.ts`
- Create: `apps/customer-web/tsconfig.json`
- Create: `apps/customer-web/postcss.config.mjs`
- Create: `apps/customer-web/app/globals.css`
- Create: `apps/customer-web/app/layout.tsx`
- Modify: root `package.json` (add workspaces field)

- [ ] **Step 1: Add workspaces field to root package.json**

Open the root `package.json`. Add `"workspaces": ["apps/*"]` at the top level alongside the existing fields. Do not remove or modify any existing field.

- [ ] **Step 2: Create apps/customer-web/package.json**

Use `^` ranges — do not pin exact patch versions. The dev server install step will resolve actual installed versions.

```json
{
  "name": "@redeemo/customer-web",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev --port 3001",
    "build": "next build",
    "start": "next start --port 3001",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "next": "^16.0.0",
    "react": "^19.0.0",
    "react-dom": "^19.0.0",
    "framer-motion": "^12.0.0",
    "swr": "^2.3.0",
    "@stripe/stripe-js": "^4.0.0",
    "@stripe/react-stripe-js": "^2.8.0",
    "clsx": "^2.1.1",
    "tailwind-merge": "^2.5.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^19.0.0",
    "@types/react-dom": "^19.0.0",
    "typescript": "^5.7.0",
    "tailwindcss": "^4.0.0",
    "@tailwindcss/postcss": "^4.0.0",
    "postcss": "^8.0.0"
  }
}
```

**Note:** After running `npm install`, check the installed Next.js and React versions match the peer dependency matrix (`next` requires React 18 or 19). If version conflicts appear, resolve by aligning React to what the installed Next.js version specifies.

- [ ] **Step 3: Create apps/customer-web/tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create apps/customer-web/next.config.ts**

```typescript
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '**.r2.cloudflarestorage.com',
      },
      {
        protocol: 'https',
        hostname: '**.amazonaws.com',
      },
    ],
  },
}

export default nextConfig
```

- [ ] **Step 5: Create apps/customer-web/postcss.config.mjs**

Tailwind v4 uses `@tailwindcss/postcss` as its PostCSS plugin — not `tailwindcss` directly. This is the correct v4 setup:

```js
/** @type {import('postcss-load-config').Config} */
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

No `tailwind.config.ts` is needed for Tailwind v4 — configuration is done in CSS via `@theme`. Do not create a `tailwind.config.ts` file.

- [ ] **Step 6: Create apps/customer-web/app/globals.css**

Tailwind v4 uses `@import "tailwindcss"` (not `@tailwind base/components/utilities`). Brand tokens and custom theme values are defined inside `@theme {}`. Fonts are loaded via `next/font/google` in `layout.tsx` (not `@import url(...)` here).

```css
@import "tailwindcss";

@theme {
  /* Brand colours */
  --color-red: #E2000C;
  --color-orange-red: #E84A00;
  --color-orange: #EE6904;
  --color-navy: #010C35;
  --color-deep-navy: #00041E;
  --color-coral: #E04403;
  --color-surface: #FFFFFF;
  --color-surface-muted: #F8F7F5;

  /* These make bg-navy, text-red, etc. available as Tailwind utilities */
}

/* Semantic CSS custom properties (not Tailwind utilities — used by components via var()) */
:root {
  --color-primary: #E2000C;
  --color-anchor: #010C35;
  --gradient-brand: linear-gradient(135deg, #E2000C 0%, #E84A00 50%, #EE6904 100%);
}

* {
  box-sizing: border-box;
}

html {
  color: #010C35;
  background: #FFFFFF;
  -webkit-font-smoothing: antialiased;
}

/* Gradient text utility — used in hero headings */
.gradient-brand-text {
  background: linear-gradient(135deg, #E2000C 0%, #EE6904 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
}
```

- [ ] **Step 7: Create apps/customer-web/app/layout.tsx**

Fonts are loaded via `next/font/google` — this handles font optimisation, subsetting, and no-flash loading automatically. CSS variable names are passed as `variable` and applied on `<html>`.

```typescript
import type { Metadata } from 'next'
import { Calistoga, DM_Sans, DM_Mono } from 'next/font/google'
import './globals.css'
import { Navbar } from '@/components/layout/Navbar'
import { Footer } from '@/components/layout/Footer'

const calistoga = Calistoga({
  weight: '400',
  subsets: ['latin'],
  variable: '--font-display',
})

const dmSans = DM_Sans({
  subsets: ['latin'],
  variable: '--font-body',
})

const dmMono = DM_Mono({
  weight: ['400', '500'],
  subsets: ['latin'],
  variable: '--font-mono',
})

export const metadata: Metadata = {
  title: {
    default: 'Redeemo — Exclusive Local Vouchers',
    template: '%s | Redeemo',
  },
  description: 'Discover exclusive vouchers from local businesses near you. Subscribe and save every month.',
  icons: {
    icon: [
      { url: '/favicon.ico' },
      { url: '/favicon-16x16.png', sizes: '16x16', type: 'image/png' },
      { url: '/favicon-32x32.png', sizes: '32x32', type: 'image/png' },
    ],
    apple: '/apple-touch-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html
      lang="en"
      className={`${calistoga.variable} ${dmSans.variable} ${dmMono.variable}`}
    >
      <body style={{ fontFamily: 'var(--font-body), DM Sans, sans-serif' }}>
        <Navbar />
        <main>{children}</main>
        <Footer />
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Copy favicon files into public/**

Run from the repo root:

```bash
mkdir -p apps/customer-web/public
cp "Branding /Redeemo Branding Package/Logo Files/favicon_io/favicon.ico" apps/customer-web/public/favicon.ico
cp "Branding /Redeemo Branding Package/Logo Files/favicon_io/favicon-16x16.png" apps/customer-web/public/favicon-16x16.png
cp "Branding /Redeemo Branding Package/Logo Files/favicon_io/favicon-32x32.png" apps/customer-web/public/favicon-32x32.png
cp "Branding /Redeemo Branding Package/Logo Files/favicon_io/apple-touch-icon.png" apps/customer-web/public/apple-touch-icon.png
```

- [ ] **Step 9: Create stub Navbar and Footer**

These exist only so `layout.tsx` compiles. They will be replaced in a later task.

`apps/customer-web/components/layout/Navbar.tsx`:
```typescript
export function Navbar() {
  return <nav aria-label="Main navigation" style={{ height: 64, background: '#010C35' }} />
}
```

`apps/customer-web/components/layout/Footer.tsx`:
```typescript
export function Footer() {
  return <footer style={{ minHeight: 80, background: '#010C35' }} />
}
```

- [ ] **Step 10: Create stub home page**

`apps/customer-web/app/page.tsx`:
```typescript
export default function HomePage() {
  return <div style={{ padding: 40 }}>Redeemo — coming soon</div>
}
```

- [ ] **Step 11: Install dependencies**

Run from the repo root (workspaces mode installs all packages):

```bash
npm install
```

If peer dependency conflicts appear between Next.js and React versions, resolve by checking `npm info next@<installed-version> peerDependencies` and aligning the React version in `apps/customer-web/package.json` accordingly.

- [ ] **Step 12: Verify dev server starts**

```bash
cd apps/customer-web && npm run dev
```

Expected: Next.js dev server starts on `http://localhost:3001`. Browser shows "Redeemo — coming soon". No compilation errors in the terminal.

- [ ] **Step 13: Run typecheck — must pass with zero errors**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 14: Commit**

Run from the repo root:

```bash
git add apps/customer-web/ package.json
git commit -m "feat: scaffold Next.js 16 customer website at apps/customer-web"
```

---

## Task 2: Auth Context + API Client + Middleware

**Files:**
- Create: `apps/customer-web/lib/api.ts`
- Create: `apps/customer-web/lib/auth.ts`
- Create: `apps/customer-web/contexts/AuthContext.tsx`
- Create: `apps/customer-web/middleware.ts`
- Modify: `apps/customer-web/app/layout.tsx` (wrap with AuthProvider)

This task wires the auth model described in the Architecture section: tokens in `localStorage`, Bearer header on API calls, flag cookie for middleware route protection.

- [ ] **Step 1: Create apps/customer-web/lib/api.ts**

Typed fetch wrapper. All API calls go through `apiFetch`. Authenticated calls automatically attach the Bearer token from `localStorage`.

```typescript
const BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000'

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
    const token = localStorage.getItem('redeemo_access_token')
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
//
// ⚠️  EXECUTOR NOTE — verify before writing:
// The URL paths and response shapes below are inferred from the Phase 3B plan spec.
// Before implementing this section, read the actual merged route files:
//   src/api/customer/discovery/routes.ts
// Confirm each URL path and each response field name exactly matches.
// Adjust the types and paths here to match reality — do not trust the plan blindly.

// MerchantTile is the canonical type for merchant cards throughout the app.
// Defined here in lib/api.ts to avoid circular imports (components import from lib/api, not vice versa).
// components/ui/MerchantTile.tsx imports this type from here.
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
    }>(`/api/v1/customer/discovery/home${qs}`)
  },

  search: (q: string, params?: { categoryId?: string; page?: number }) => {
    const sp = new URLSearchParams({ q, ...(params?.categoryId ? { categoryId: params.categoryId } : {}), page: String(params?.page ?? 1) })
    return apiFetch<{ merchants: MerchantTileData[]; total: number }>(
      `/api/v1/customer/discovery/search?${sp}`
    )
  },

  categories: () =>
    apiFetch<{ categories: { id: string; name: string; iconUrl: string | null }[] }>(
      '/api/v1/customer/discovery/categories'
    ),

  getMerchant: (id: string, opts?: { lat?: number; lng?: number }) => {
    const sp = new URLSearchParams()
    if (opts?.lat !== undefined) sp.set('lat', String(opts.lat))
    if (opts?.lng !== undefined) sp.set('lng', String(opts.lng))
    const qs = sp.toString() ? `?${sp.toString()}` : ''
    return apiFetch<{
      id: string; name: string; description: string | null
      logoUrl: string | null; coverImageUrl: string | null
      bannerUrl: string | null; websiteUrl: string | null
      primaryCategory: { id: string; name: string }
      branches: { id: string; name: string; address: string; distance: number | null }[]
      vouchers: VoucherData[]
      avgRating: number | null; reviewCount: number
      amenities: string[]; openingHours: Record<string, string> | null
      status: string
    }>(`/api/v1/customer/discovery/merchants/${id}${qs}`)
  },

  voucher: (id: string) =>
    apiFetch<VoucherData & { merchant: { id: string; name: string } }>(
      `/api/v1/customer/discovery/vouchers/${id}`
    ),
}

// ── Profile ───────────────────────────────────────────────────────────────────

export type ProfileData = {
  id: string
  firstName: string; lastName: string
  name: string          // display alias for firstName — used in PATCH body
  email: string
  phoneNumber: string | null
  dateOfBirth: string | null
  gender: string | null
  city: string | null; postcode: string | null
  profileImageUrl: string | null
  newsletterConsent: boolean
  emailVerified: boolean; phoneVerified: boolean
  interests: { id: string; name: string }[]
  profileCompleteness: number  // 0–100, computed server-side
}

export const profileApi = {
  get: () => apiFetch<ProfileData>('/api/v1/customer/profile/me', { auth: true }),
  update: (data: Partial<ProfileData>) =>
    apiFetch<ProfileData>('/api/v1/customer/profile/me', {
      method: 'PATCH', auth: true, body: JSON.stringify(data),
    }),
  changePassword: (currentPassword: string, newPassword: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/profile/change-password', {
      method: 'POST', auth: true,
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
      method: 'POST', auth: true,
    }),
  create: (planId: string, paymentMethodId: string) =>
    apiFetch<{ status: string }>('/api/v1/subscription', {
      method: 'POST', auth: true,
      body: JSON.stringify({ planId, paymentMethodId }),
    }),
  get: () =>
    apiFetch<{
      status: string; planName: string
      currentPeriodEnd: string; cancelAtPeriodEnd: boolean
    }>('/api/v1/subscription/me', { auth: true }),
  cancel: () =>
    apiFetch<{ message: string }>('/api/v1/subscription', {
      method: 'DELETE', auth: true,
    }),
}

// ── Savings ───────────────────────────────────────────────────────────────────

export type SavingsSummary = {
  lifetimeSaving: number
  thisMonthSaving: number
  thisMonthRedemptionCount: number
  monthlyBreakdown: { month: string; saving: number; count: number }[]  // month = "YYYY-MM", [0] = current
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
    return apiFetch<{
      data: { id: string; merchantName: string; voucherTitle: string; redeemedAt: string; isValidated: boolean }[]
      total: number
    }>(`/api/v1/customer/savings/redemptions?${sp}`, { auth: true })
  },
}

// ── Favourites ────────────────────────────────────────────────────────────────
//
// ⚠️  EXECUTOR NOTE — verify before writing:
// The URL paths and response shapes below are inferred from the Phase 3B plan spec.
// Before implementing this section, read the actual merged route files:
//   src/api/customer/favourites/routes.ts
// Confirm each URL path (especially the DELETE path shape) and each response field name.
// Adjust to match reality — do not trust the plan blindly.

export const favouritesApi = {
  listMerchants: () =>
    apiFetch<{ merchants: MerchantTileData[] }>(
      '/api/v1/customer/favourites/merchants', { auth: true }
    ),
  addMerchant: (merchantId: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/favourites/merchants', {
      method: 'POST', auth: true, body: JSON.stringify({ merchantId }),
    }),
  removeMerchant: (merchantId: string) =>
    apiFetch<void>(`/api/v1/customer/favourites/merchants/${merchantId}`, {
      method: 'DELETE', auth: true,
    }),
  listVouchers: () =>
    apiFetch<{ vouchers: {
      id: string; title: string; type: string; estimatedSaving: number | null
      imageUrl: string | null; status: string; approvalStatus: string
      merchant: { id: string; businessName: string; logoUrl: string | null }
      favouritedAt: string
    }[] }>('/api/v1/customer/favourites/vouchers', { auth: true }),
  removeVoucher: (voucherId: string) =>
    apiFetch<void>(`/api/v1/customer/favourites/vouchers/${voucherId}`, {
      method: 'DELETE', auth: true,
    }),
}
```

- [ ] **Step 2: Create apps/customer-web/lib/auth.ts**

Token persistence helpers. All token access is gated behind `typeof window !== 'undefined'` so they are safe to import in Server Components (they simply return null server-side).

```typescript
const ACCESS_KEY = 'redeemo_access_token'
const REFRESH_KEY = 'redeemo_refresh_token'
const FLAG_COOKIE = 'redeemo_auth'

export function saveTokens(accessToken: string, refreshToken: string) {
  if (typeof window === 'undefined') return
  localStorage.setItem(ACCESS_KEY, accessToken)
  localStorage.setItem(REFRESH_KEY, refreshToken)
  // Set a presence-flag cookie so Next.js middleware can detect auth state.
  // Max-age matches a reasonable session window (7 days). No sensitive data.
  document.cookie = `${FLAG_COOKIE}=1; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`
}

export function clearTokens() {
  if (typeof window === 'undefined') return
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  document.cookie = `${FLAG_COOKIE}=; path=/; max-age=0`
}

export function getAccessToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(ACCESS_KEY)
}

export function getRefreshToken(): string | null {
  if (typeof window === 'undefined') return null
  return localStorage.getItem(REFRESH_KEY)
}
```

- [ ] **Step 3: Create apps/customer-web/contexts/AuthContext.tsx**

```typescript
'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { authApi, type LoginResponse } from '@/lib/api'
import { saveTokens, clearTokens, getAccessToken } from '@/lib/auth'

type User = LoginResponse['user']

type AuthContextValue = {
  user: User | null
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // Rehydrate user from localStorage on mount (client only)
  useEffect(() => {
    const token = getAccessToken()
    if (token) {
      // Decode user from stored key (we stored it alongside tokens)
      const stored = localStorage.getItem('redeemo_user')
      if (stored) {
        try { setUser(JSON.parse(stored)) } catch { /* ignore */ }
      }
    }
    setIsLoading(false)
  }, [])

  const login = useCallback(async (email: string, password: string) => {
    const result = await authApi.login(email, password)
    saveTokens(result.accessToken, result.refreshToken)
    localStorage.setItem('redeemo_user', JSON.stringify(result.user))
    setUser(result.user)
  }, [])

  const logout = useCallback(async () => {
    try { await authApi.logout() } catch { /* ignore network error on logout */ }
    clearTokens()
    localStorage.removeItem('redeemo_user')
    setUser(null)
  }, [])

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider')
  return ctx
}
```

- [ ] **Step 4: Create apps/customer-web/middleware.ts**

Protects `/account` and `/account/**` routes. Reads the presence-flag cookie — if missing, redirects to `/login`. No token decoding happens here.

```typescript
import { type NextRequest, NextResponse } from 'next/server'

const PROTECTED = ['/account']

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const isProtected = PROTECTED.some(p => pathname === p || pathname.startsWith(`${p}/`))

  if (isProtected) {
    const authCookie = request.cookies.get('redeemo_auth')
    if (!authCookie) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('next', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/account/:path*'],
}
```

- [ ] **Step 5: Wrap layout with AuthProvider**

Edit `apps/customer-web/app/layout.tsx` — add `AuthProvider` import and wrap `{children}`:

```typescript
// Add to imports:
import { AuthProvider } from '@/contexts/AuthContext'

// In the return, wrap children:
<body style={{ fontFamily: 'var(--font-body), DM Sans, sans-serif' }}>
  <AuthProvider>
    <Navbar />
    <main>{children}</main>
    <Footer />
  </AuthProvider>
</body>
```

- [ ] **Step 6: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 7: Commit**

```bash
git add apps/customer-web/lib/ apps/customer-web/contexts/ apps/customer-web/middleware.ts apps/customer-web/app/layout.tsx
git commit -m "feat: add API client, auth context, and route middleware"
```

---

## Task 3: Navbar + Footer

**Files:**
- Modify: `apps/customer-web/components/layout/Navbar.tsx` (replace stub)
- Modify: `apps/customer-web/components/layout/Footer.tsx` (replace stub)

The Navbar uses the actual Redeemo logo SVG inline. It has two states: guest (shows Login + Subscribe CTAs) and authenticated (shows account link + logout). Footer is editorial — navy background, brand gradient logo mark, links, legal.

- [ ] **Step 1: Copy real logo SVG into public/**

Run from the repo root. This copies the actual brand asset — do not recreate or simplify the SVG:

```bash
cp "Branding /Redeemo Branding Package/Logo Files/SVG/Horizontal Version 1.svg" apps/customer-web/public/logo-horizontal.svg
cp "Branding /Redeemo Branding Package/Logo Files/SVG/Iconic Version 1.svg" apps/customer-web/public/logo-icon.svg
```

- [ ] **Step 2: Replace Navbar stub**

`apps/customer-web/components/layout/Navbar.tsx`:

```typescript
'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'

export function Navbar() {
  const { user, isLoading, logout } = useAuth()
  const pathname = usePathname()

  const navLinks = [
    { href: '/discover', label: 'Discover' },
    { href: '/merchants', label: 'For Merchants' },
  ]

  return (
    <header
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 50,
        background: 'rgba(1, 12, 53, 0.97)',
        backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.06)',
      }}
    >
      <nav
        style={{
          maxWidth: 1280,
          margin: '0 auto',
          padding: '0 24px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          gap: 32,
        }}
      >
        <Link href="/" style={{ textDecoration: 'none', flexShrink: 0 }}>
          <Image
            src="/logo-horizontal.svg"
            alt="Redeemo"
            width={140}
            height={36}
            priority
          />
        </Link>

        <div style={{ display: 'flex', gap: 4, flex: 1 }}>
          {navLinks.map(link => (
            <Link
              key={link.href}
              href={link.href}
              style={{
                padding: '6px 14px',
                borderRadius: 8,
                fontSize: 14,
                fontWeight: 500,
                color: pathname === link.href ? 'white' : 'rgba(255,255,255,0.65)',
                textDecoration: 'none',
                transition: 'color 0.15s',
              }}
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {!isLoading && (
            <>
              {user ? (
                <>
                  <Link
                    href="/account"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.8)',
                      textDecoration: 'none',
                    }}
                  >
                    Account
                  </Link>
                  <button
                    onClick={() => logout()}
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.5)',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '6px 0',
                    }}
                  >
                    Sign out
                  </button>
                </>
              ) : (
                <>
                  <Link
                    href="/login"
                    style={{
                      fontSize: 14,
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.8)',
                      textDecoration: 'none',
                    }}
                  >
                    Log in
                  </Link>
                  <Link
                    href="/subscribe"
                    style={{
                      fontSize: 14,
                      fontWeight: 600,
                      color: 'white',
                      background: 'linear-gradient(135deg, #E2000C 0%, #E84A00 100%)',
                      padding: '8px 20px',
                      borderRadius: 8,
                      textDecoration: 'none',
                    }}
                  >
                    Subscribe
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </nav>
    </header>
  )
}
```

- [ ] **Step 3: Replace Footer stub**

`apps/customer-web/components/layout/Footer.tsx`:

```typescript
import Link from 'next/link'

export function Footer() {
  const year = new Date().getFullYear()

  const links = {
    Discover: [
      { href: '/discover', label: 'Browse Merchants' },
      { href: '/search', label: 'Search' },
      { href: '/subscribe', label: 'Pricing' },
    ],
    Business: [
      { href: '/merchants', label: 'For Merchants' },
      { href: '/merchants#how-it-works', label: 'How It Works' },
      { href: '/merchants#pricing', label: 'Merchant Pricing' },
    ],
    Account: [
      { href: '/login', label: 'Log In' },
      { href: '/register', label: 'Sign Up' },
      { href: '/account', label: 'My Account' },
    ],
  }

  return (
    <footer style={{ background: '#00041E', color: 'rgba(255,255,255,0.7)', paddingTop: 64, paddingBottom: 40 }}>
      <div style={{ maxWidth: 1280, margin: '0 auto', padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 48, marginBottom: 64 }}>
          {/* Brand column */}
          <div>
            <div style={{ marginBottom: 16 }}>
              <span style={{
                fontFamily: 'var(--font-display)',
                fontSize: 28,
                fontWeight: 400,
                background: 'linear-gradient(135deg, #E2000C 0%, #EE6904 100%)',
                WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
                backgroundClip: 'text',
              }}>
                Redeemo
              </span>
            </div>
            <p style={{ fontSize: 14, lineHeight: 1.7, color: 'rgba(255,255,255,0.5)', maxWidth: 220 }}>
              Exclusive vouchers from local businesses. Subscribe and save every month.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(links).map(([section, items]) => (
            <div key={section}>
              <p style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.35)', marginBottom: 16 }}>
                {section}
              </p>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {items.map(item => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)', textDecoration: 'none' }}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 32, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)' }}>
            © {year} Redeemo Ltd. All rights reserved. UK registered company.
          </p>
          {/* /privacy, /terms, /cookies are structural placeholders — pages are out of scope
              for this phase and will return 404 until built in a future phase. Links are
              included for structural completeness; do not create those page files here. */}
          <div style={{ display: 'flex', gap: 24 }}>
            {[{ href: '/privacy', label: 'Privacy' }, { href: '/terms', label: 'Terms' }, { href: '/cookies', label: 'Cookies' }].map(l => (
              <Link key={l.href} href={l.href} style={{ fontSize: 13, color: 'rgba(255,255,255,0.35)', textDecoration: 'none' }}>
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </div>
    </footer>
  )
}
```

- [ ] **Step 4: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 5: Start dev server and visually verify**

```bash
cd apps/customer-web && npm run dev
```

Open `http://localhost:3001`. Verify:
- Sticky navy navbar visible with actual brand logo (`/logo-horizontal.svg`), nav links, Login + Subscribe buttons
- Footer renders at page bottom with four columns and legal line
- `/privacy`, `/terms`, `/cookies` links are present but expected to 404 — this is correct
- No console errors

- [ ] **Step 6: Commit**

```bash
git add apps/customer-web/components/ apps/customer-web/public/logo-horizontal.svg apps/customer-web/public/logo-icon.svg
git commit -m "feat: add Navbar and Footer with brand identity and auth state"
```

---

## Task 4: Landing Page (`/`)

**Files:**
- Create: `apps/customer-web/app/page.tsx` (replace stub)
- Create: `apps/customer-web/components/ui/AppMockupFrame.tsx`
- Create: `apps/customer-web/components/landing/HeroSection.tsx`
- Create: `apps/customer-web/components/landing/HowItWorksSection.tsx`
- Create: `apps/customer-web/components/landing/FeaturedMerchantsSection.tsx`
- Create: `apps/customer-web/components/landing/CategorySection.tsx`
- Create: `apps/customer-web/components/landing/SavingsStatsSection.tsx`
- Create: `apps/customer-web/components/landing/AppMockupSection.tsx`
- Create: `apps/customer-web/components/landing/TestimonialsSection.tsx`
- Create: `apps/customer-web/components/landing/MerchantCtaSection.tsx`
- Create: `apps/customer-web/components/landing/PricingSection.tsx`
- Create: `apps/customer-web/components/landing/FinalCtaSection.tsx`

The landing page is a Server Component (`app/page.tsx`). Each section is its own file. Sections that need client interactivity are marked `'use client'` inside their own file only — `page.tsx` stays a Server Component.

**Data strategy:** Most sections are static — `HowItWorksSection`, `CategorySection`, `SavingsStatsSection`, `AppMockupSection`, `TestimonialsSection`, `MerchantCtaSection`, `PricingSection`, `FinalCtaSection` all use hardcoded copy. This is correct — they are marketing content, not live data. Two exceptions:
- `FeaturedMerchantsSection` **must fetch real data** from the backend (`GET /api/v1/customer/discovery/home`) at render time as a Server Component. It renders real featured merchant tiles when available. If the API call fails or returns empty, it falls back to placeholder tiles silently — never an error page.
- `SavingsStatsSection` must **not display invented statistics**. Use qualitative claims only (see Step 5 below). Real aggregate numbers require a confirmed backend endpoint and owner-approved copy before they go live.

**Implementation style — REQUIRED:** All visual styling must use **Tailwind utility classes**, not inline `style={{}}` props. The code examples in this task use inline styles for planning clarity only — do not copy them literally. Translate every colour, spacing, typography, and layout value to the equivalent Tailwind class using the brand tokens registered in `globals.css` (`bg-navy`, `text-red`, `font-display`, `rounded-2xl`, etc.). Inline `style={{}}` is permitted only for dynamic values (e.g., `transform: translateY(${offset}px)`) or CSS properties with no Tailwind equivalent.

**Responsive layout — REQUIRED:** Every multi-column grid must collapse to a single column on mobile. Use Tailwind responsive prefixes throughout: `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`. The two-column hero layout must stack vertically on mobile (`grid-cols-1 lg:grid-cols-2`). Test at 375px, 768px, and 1280px widths before committing.

**Visual direction:** Editorial warmth, navy as premium anchor, red-to-orange gradient as energy and action. Sections alternate between white/warm-grey and deep-navy backgrounds for rhythm. Calistoga for display headings only. DM Sans for all body text.

- [ ] **Step 1: Create apps/customer-web/components/ui/AppMockupFrame.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine this component visually before committing. The phone bezel proportions and screen inset are fiddly to get right in code alone; visual iteration pays off here.
> Prompt hint: `"iPhone 15 Pro frame component, 9:19.5 aspect ratio, rounded bezel with screen inset, accepts optional src image prop, placeholder state when no image, two size variants sm and md, dark bezel, Tailwind CSS"`

Shared component used wherever a phone frame appears (HeroSection, AppMockupSection, and any future screen). Accepts an optional `src` prop — renders a placeholder when absent, a real screenshot when present. Two size variants: `md` (default, 280×560) and `sm` (220×440). Aspect ratio is fixed at ≈9:19.5 (iPhone 15 Pro). When real screenshots are available, add `src` to existing usages — no layout rework needed.

```typescript
import Image from 'next/image'

type AppMockupFrameProps = {
  src?: string
  alt?: string
  size?: 'sm' | 'md'
  className?: string
}

const SIZES = {
  sm: { width: 220, height: 440, radius: 28 },
  md: { width: 280, height: 560, radius: 36 },
}

export function AppMockupFrame({ src, alt = 'App screenshot', size = 'md', className }: AppMockupFrameProps) {
  const { width, height, radius } = SIZES[size]

  return (
    <div
      className={className}
      style={{
        width,
        height,
        borderRadius: radius,
        overflow: 'hidden',
        border: '1.5px solid rgba(255,255,255,0.1)',
        boxShadow: '0 32px 80px rgba(0,0,0,0.35)',
        flexShrink: 0,
        position: 'relative',
        background: 'rgba(255,255,255,0.04)',
      }}
    >
      {src ? (
        <Image src={src} alt={alt} fill style={{ objectFit: 'cover' }} />
      ) : (
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'rgba(255,255,255,0.2)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
            }}
          >
            App screen
          </span>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Create apps/customer-web/components/landing/HeroSection.tsx**

Full-viewport hero. Key design decisions to implement:

**Layout:** Asymmetric 55:45 grid (`grid-cols-[55fr_45fr]` on desktop, stacked on mobile). The copy column is wider — the phone frame column is deliberately narrower and taller to create tension.

**Phone frame:** Positioned so it overflows the section's bottom edge by ~80px using `absolute` or `mb-[-80px]` on the frame wrapper. This breaks the grid boundary and creates visual continuity into the next section. The frame should also be slightly rotated (`rotate-[2deg]`) to imply motion and avoid the static "placed here" look.

**Background:** Navy gradient base PLUS a subtle grain/noise overlay (SVG data URI or CSS `noise` filter at low opacity) PLUS a large soft diagonal red-to-transparent gradient shard in the upper right — not a centred radial glow. The atmosphere should feel rich and directional, not like a dark-mode SaaS template.

**CTA hierarchy:** Primary button is visually dominant — larger font (`18px`), more padding (`18px 40px`), full gradient. Secondary link is plain text with a right arrow — no border, no button treatment. The size differential must be immediately obvious at a glance.

**Motion (Framer Motion — `'use client'`):**
- Headline words animate in with staggered `y: 20 → 0, opacity: 0 → 1`, 80ms delay per word
- Subtext fades in after headline completes
- CTAs slide up after subtext
- Phone frame drifts: `translateY(-8px) → (0px) → (-8px)` on a 4s infinite loop (CSS animation, no JS needed)

```typescript
'use client'

import Link from 'next/link'
import { motion } from 'framer-motion'
import { AppMockupFrame } from '@/components/ui/AppMockupFrame'

const HEADLINE_WORDS = ['Save', 'every', 'month', 'at']
const HEADLINE_ACCENT = 'local businesses'
const HEADLINE_END = 'near you'

export function HeroSection() {
  return (
    <section className="relative min-h-[92vh] flex items-center overflow-hidden bg-deep-navy">

      {/* Layered background: grain texture + diagonal light shard */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        {/* Grain overlay — SVG noise filter at low opacity */}
        <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <filter id="grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#grain)" />
        </svg>
        {/* Diagonal red shard — upper right, not centred */}
        <div className="absolute -top-40 right-0 w-[600px] h-[700px] opacity-[0.07]"
          style={{ background: 'linear-gradient(135deg, #E2000C 0%, transparent 65%)', transform: 'rotate(-15deg) translateX(20%)' }} />
      </div>

      {/* Asymmetric 55:45 grid */}
      <div className="relative z-10 max-w-screen-xl mx-auto w-full px-6 grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-16 lg:gap-20 items-center py-20">

        {/* Left: copy */}
        <div>
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-orange-red mb-5"
          >
            UK's local voucher marketplace
          </motion.p>

          {/* Staggered headline words */}
          <h1 className="font-display text-[clamp(44px,5.5vw,76px)] leading-[1.05] text-white mb-7">
            {HEADLINE_WORDS.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.1 + i * 0.08 }}
                className="inline-block mr-[0.25em]"
              >
                {word}
              </motion.span>
            ))}
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + HEADLINE_WORDS.length * 0.08 }}
              className="inline-block gradient-brand-text mr-[0.25em]"
            >
              {HEADLINE_ACCENT}
            </motion.span>
            <motion.span
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.1 + (HEADLINE_WORDS.length + 1) * 0.08 }}
              className="inline-block"
            >
              {HEADLINE_END}
            </motion.span>
          </h1>

          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.6, delay: 0.7 }}
            className="text-lg leading-[1.75] text-white/60 max-w-[460px] mb-10"
          >
            One subscription unlocks exclusive vouchers from restaurants,
            cafés, gyms, salons, and more — all within your neighbourhood.
          </motion.p>

          {/* CTAs: primary dominates, secondary is plain text */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.9 }}
            className="flex flex-wrap items-center gap-5 mb-12"
          >
            <Link
              href="/subscribe"
              className="inline-block gradient-brand text-white font-semibold text-lg px-10 py-[18px] rounded-xl no-underline shadow-lg"
              style={{ boxShadow: '0 8px 32px rgba(226,0,12,0.35)' }}
            >
              Start saving — from £6.99/mo
            </Link>
            <Link
              href="/discover"
              className="text-white/60 font-medium text-base no-underline hover:text-white/90 transition-colors"
            >
              Browse for free →
            </Link>
          </motion.div>

          {/* App store badge placeholders */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 1.1 }}
            className="flex items-center gap-3"
          >
            {['App Store', 'Google Play'].map(label => (
              <div key={label} className="h-10 w-32 rounded-lg bg-white/[0.06] border border-white/10 flex items-center justify-center">
                <span className="font-mono text-[11px] text-white/30 tracking-wide">{label}</span>
              </div>
            ))}
            <span className="text-sm text-white/25">Coming soon</span>
          </motion.div>
        </div>

        {/* Right: phone frame — overflows section bottom, Framer Motion drives both entry and float loop */}
        <motion.div
          initial={{ opacity: 0, y: 30, rotate: 2 }}
          animate={{ opacity: 1, y: [0, -10, 0], rotate: 2 }}
          transition={{
            opacity: { duration: 0.7, delay: 0.4 },
            y: { duration: 4, repeat: Infinity, ease: 'easeInOut', delay: 0.4 },
            rotate: { duration: 0 },
          }}
          className="flex justify-center lg:justify-end mb-[-80px]"
        >
          <AppMockupFrame size="md" />
        </motion.div>
      </div>
    </section>
  )
}
```

**Motion summary for this component:**
- Eyebrow: fades in at 0.4s
- Each headline word: staggers in from y:20, 80ms apart, starting at 0.1s
- Subtext: fades in at 0.7s
- CTAs: slide up at 0.9s
- App badges: fade in at 1.1s
- Phone frame: Framer Motion drives both the entry (opacity/y from 0.4s) and the infinite float loop (`y: [0, -10, 0]`, 4s, repeat Infinity) in a single `animate` prop — no CSS keyframes needed, no class swapping.

- [ ] **Step 2: Create apps/customer-web/components/landing/HowItWorksSection.tsx**

**Not three equal cards.** Horizontal timeline layout. Each step has an oversized Calistoga step number (`~160–200px`) as a low-opacity background texture — creating depth and drama. Steps flow left-to-right as a journey with a thin connector line between them on desktop. No card borders, no boxes.

**Motion:** Each step animates in from below (`y: 30 → 0`) as it enters viewport. Use `whileInView` with `once: true`.

```typescript
'use client'

import { motion } from 'framer-motion'

const steps = [
  {
    number: '01',
    title: 'Subscribe',
    body: 'Choose monthly or annual. Cancel any time — no lock-in, no hidden fees.',
  },
  {
    number: '02',
    title: 'Discover',
    body: 'Browse exclusive offers from local restaurants, gyms, salons, and more near you.',
  },
  {
    number: '03',
    title: 'Redeem in-store',
    body: 'Show your code. The merchant validates it in seconds. Saving done.',
  },
]

export function HowItWorksSection() {
  return (
    <section className="bg-surface-muted py-24 px-6 overflow-hidden">
      <div className="max-w-screen-xl mx-auto">

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-20"
        >
          <p className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-red mb-4">
            How it works
          </p>
          <h2 className="font-display text-[clamp(32px,4vw,52px)] text-navy leading-[1.1]">
            Three steps to local savings
          </h2>
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-0 relative">
          {/* Connector line — desktop only */}
          <div aria-hidden className="hidden lg:block absolute top-[72px] left-[16.5%] right-[16.5%] h-px bg-navy/10" />

          {steps.map((step, i) => (
            <motion.div
              key={step.number}
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              className="relative pb-12 lg:pb-0 px-0 lg:px-10 first:pl-0 last:pr-0"
            >
              {/* Oversized background step number — atmosphere, not foreground */}
              <div
                aria-hidden
                className="absolute top-0 left-0 font-display leading-none select-none pointer-events-none text-navy"
                style={{ fontSize: 'clamp(120px, 14vw, 200px)', opacity: 0.04, lineHeight: 1 }}
              >
                {step.number}
              </div>

              <div className="relative pt-12 lg:pt-16">
                {/* Dot on connector line */}
                <div className="w-4 h-4 rounded-full gradient-brand mb-8 relative z-10" />
                <h3 className="font-display text-3xl text-navy mb-4 leading-tight">{step.title}</h3>
                <p className="text-base leading-relaxed text-navy/55 max-w-[260px]">{step.body}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/components/landing/FeaturedMerchantsSection.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine the **merchant tile card** (`MerchantTile.tsx`) visually before wiring it into this section. The card layout (image, merchant name, category badge, voucher count, distance) needs to look right at a glance.
> Prompt hint: `"Local merchant discovery card, square-ish image top, merchant name in display font, category badge pill, voucher count label, distance chip bottom-right, subtle hover lift, Tailwind CSS, navy and red brand colors"`

This is a **Server Component** that fetches real featured merchants from the backend. If the API call fails or returns no results, it falls back to placeholder tiles — never an error state.

⚠️ **Executor note:** Before implementing, read `src/api/customer/discovery/routes.ts` to confirm the home feed URL and the exact shape of the featured merchant response. The URL below (`/api/v1/customer/discovery/home`) and field names (`featured`, `id`, `name`, `logoUrl`, `primaryCategory`) are from the spec and must be verified against the real route.

```typescript
import Link from 'next/link'
import Image from 'next/image'
import type { MerchantTileData } from '@/lib/api'

// Server Component — no 'use client'

async function getFeaturedMerchants(): Promise<MerchantTileData[]> {
  try {
    const res = await fetch(
      `${process.env.NEXT_PUBLIC_API_URL}/api/v1/customer/discovery/home`,
      { next: { revalidate: 300 } } // cache for 5 minutes
    )
    if (!res.ok) return []
    const data = await res.json()
    return (data.featured ?? []).slice(0, 3)
  } catch {
    return []
  }
}

function PlaceholderTile({ index }: { index: number }) {
  return (
    <div className="rounded-2xl overflow-hidden border border-navy/[0.08] bg-white animate-pulse">
      <div className="h-40" style={{ background: `hsl(${200 + index * 30}, 15%, 92%)` }} />
      <div className="p-5">
        <div className="w-12 h-12 rounded-xl mb-3" style={{ background: `hsl(${200 + index * 30}, 20%, 85%)` }} />
        <div className="h-4 w-3/5 bg-navy/[0.08] rounded mb-2" />
        <div className="h-3 w-2/5 bg-navy/[0.05] rounded" />
      </div>
    </div>
  )
}

function MerchantTile({ merchant }: { merchant: MerchantTileData }) {
  return (
    <Link href={`/merchants/${merchant.id}`} className="block rounded-2xl overflow-hidden border border-navy/[0.08] bg-white hover:shadow-md transition-shadow no-underline">
      <div className="h-40 bg-surface-muted relative">
        {merchant.coverImageUrl && (
          <Image src={merchant.coverImageUrl} alt="" fill className="object-cover" />
        )}
      </div>
      <div className="p-5">
        <div className="w-12 h-12 rounded-xl bg-surface-muted relative mb-3 overflow-hidden">
          {merchant.logoUrl && (
            <Image src={merchant.logoUrl} alt={merchant.name} fill className="object-cover" />
          )}
        </div>
        <p className="font-semibold text-navy text-sm mb-1">{merchant.name}</p>
        <p className="text-xs text-navy/40 font-mono">{merchant.primaryCategory.name}</p>
      </div>
    </Link>
  )
}

export async function FeaturedMerchantsSection() {
  const merchants = await getFeaturedMerchants()
  const showPlaceholders = merchants.length === 0

  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        <div className="flex justify-between items-end mb-12">
          <div>
            <p className="font-mono text-xs font-medium tracking-widest uppercase text-red mb-3">
              Featured this week
            </p>
            <h2 className="font-display text-3xl lg:text-5xl text-navy leading-tight">
              Businesses near you
            </h2>
          </div>
          <Link href="/discover" className="text-sm font-semibold text-red no-underline">
            See all →
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {showPlaceholders
            ? [0, 1, 2].map(i => <PlaceholderTile key={i} index={i} />)
            : merchants.map(m => <MerchantTile key={m.id} merchant={m} />)
          }
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create apps/customer-web/components/landing/CategorySection.tsx**

Category pill row. Static list — no API call. Left-aligned heading (matches all other landing sections). Pills stagger in on viewport entry. No emoji — use a small coloured dot per pill to anchor each item without cross-platform rendering issues.

```typescript
'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'

const CATEGORIES = [
  { label: 'Restaurants',     dot: '#E2000C' },
  { label: 'Cafés',           dot: '#E84A00' },
  { label: 'Gyms & Fitness',  dot: '#EE6904' },
  { label: 'Salons & Beauty', dot: '#E2000C' },
  { label: 'Retail',          dot: '#E84A00' },
  { label: 'Entertainment',   dot: '#EE6904' },
  { label: 'Wellness',        dot: '#E2000C' },
  { label: 'Food & Drink',    dot: '#E84A00' },
]

export function CategorySection() {
  return (
    <section className="bg-[#FAF8F5] py-20 px-6">
      <div className="max-w-screen-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="mb-10"
        >
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-red mb-3">
            What's on offer
          </p>
          <h2 className="font-display text-[clamp(26px,3vw,38px)] text-navy leading-tight">
            Browse by category
          </h2>
        </motion.div>

        <div className="flex flex-wrap gap-3">
          {CATEGORIES.map((cat, i) => (
            <motion.div
              key={cat.label}
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
            >
              <Link
                href={`/search?q=${encodeURIComponent(cat.label)}`}
                className="inline-flex items-center gap-2.5 px-5 py-2.5 rounded-full bg-white border border-navy/[0.1] text-[14px] font-medium text-navy hover:border-navy/25 hover:shadow-sm transition-all no-underline"
              >
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ background: cat.dot }}
                  aria-hidden
                />
                {cat.label}
              </Link>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Create apps/customer-web/components/landing/SavingsStatsSection.tsx**

**Not three centred equal columns.** Each claim takes its own full-width horizontal row — left-aligned, editorial, like a manifesto. Giant Calistoga headline (`text-7xl` or larger) on the left, short supporting body text on the right of each row. Navy background. The sheer scale of the type is what makes this section memorable.

**Do not use invented statistics.** Qualitative claims only until the owner confirms real numbers.

⚠️ **Owner action required before launch:** Replace claims with real confirmed data once available.

**Motion:** Each row slides in from the left on scroll-enter, staggered.

```typescript
'use client'

import { motion } from 'framer-motion'

const claims = [
  {
    headline: 'Save every month',
    body: 'Exclusive vouchers from local businesses, refreshed every cycle.',
  },
  {
    headline: 'Local, not generic',
    body: 'Independent restaurants, gyms, salons — not the same chains everywhere.',
  },
  {
    headline: 'Redeem in seconds',
    body: 'Show your code. Validated instantly. No printing, no fuss.',
  },
]

export function SavingsStatsSection() {
  return (
    <section className="bg-deep-navy py-24 px-6 overflow-hidden">
      <div className="max-w-screen-xl mx-auto divide-y divide-white/[0.06]">
        {claims.map((claim, i) => (
          <motion.div
            key={claim.headline}
            initial={{ opacity: 0, x: -40 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6, delay: i * 0.1 }}
            className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-4 lg:gap-16 items-baseline py-10 lg:py-14"
          >
            {/* Giant left-aligned display text — the hero element of this section */}
            <h2
              className="font-display gradient-brand-text leading-none"
              style={{ fontSize: 'clamp(52px, 7vw, 96px)' }}
            >
              {claim.headline}
            </h2>
            {/* Supporting body — right column, baseline-aligned with headline */}
            <p className="text-base text-white/45 leading-relaxed max-w-xs">
              {claim.body}
            </p>
          </motion.div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Create apps/customer-web/components/landing/AppMockupSection.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to refine the two-phone stacked layout. Getting overlapping frames with correct shadows and slight rotation to look intentional (not accidental) benefits from visual iteration.
> Prompt hint: `"App showcase section, two overlapping iPhone mockup frames slightly offset and rotated, left text block with headline and app store download badges, navy background, editorial layout"`

Side-by-side: left copy block animates in from left, right two stacked phone frames animate in from right. White background. Uses `AppMockupFrame` — no raw placeholder divs.

```typescript
'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'
import { AppMockupFrame } from '@/components/ui/AppMockupFrame'

const FEATURES = [
  'Browse offers by category or map',
  'Instant in-store redemption',
  'Track your monthly savings',
  'Favourites for quick access',
]

export function AppMockupSection() {
  return (
    <section className="bg-white py-24 px-6 overflow-hidden">
      <div className="max-w-screen-xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-20 items-center">

        {/* Left: copy — slides in from left */}
        <motion.div
          initial={{ opacity: 0, x: -32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-red mb-4">
            Mobile app
          </p>
          <h2 className="font-display text-[clamp(32px,4vw,52px)] text-navy leading-[1.1] mb-6">
            Redeem anywhere,{' '}
            <span className="gradient-brand-text">in seconds</span>
          </h2>
          <p className="text-[16px] leading-[1.75] text-navy/60 mb-8 max-w-[440px]">
            The Redeemo app puts your vouchers at your fingertips. Tap to redeem in-store — no printing, no fuss. Your savings history is always there when you need it.
          </p>

          <ul className="flex flex-col gap-3.5 mb-10">
            {FEATURES.map(item => (
              <li key={item} className="flex items-center gap-3 text-[15px] text-navy/75">
                <span className="w-1.5 h-1.5 rounded-full bg-red flex-shrink-0" aria-hidden />
                {item}
              </li>
            ))}
          </ul>

          <Link
            href="/subscribe"
            className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-semibold text-[15px] px-7 py-3.5 rounded-xl no-underline hover:opacity-90 transition-opacity"
          >
            Get started
          </Link>
        </motion.div>

        {/* Right: two offset phone frames — slide in from right */}
        <motion.div
          initial={{ opacity: 0, x: 32 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.15 }}
          className="flex justify-center items-center gap-5"
        >
          <div className="-translate-y-8">
            <AppMockupFrame size="sm" />
          </div>
          <div className="translate-y-8">
            <AppMockupFrame size="sm" />
          </div>
        </motion.div>

      </div>
    </section>
  )
}
```

- [ ] **Step 7: Create apps/customer-web/components/landing/TestimonialsSection.tsx**

**Not three equal cards.** Editorial asymmetric layout: one dominant "hero" quote spans the left 2/3, two compact supporting quotes stack in the right 1/3. The hero quote is large — `text-2xl` or `text-3xl` — not body text size. No card borders on the hero quote. White background.

This feels like a magazine spread, not a Bootstrap template.

**Motion:** Hero quote fades in from left; the two right quotes fade in from right with staggered delay.

```typescript
'use client'

import { motion } from 'framer-motion'

const HERO_QUOTE = {
  quote: "I saved over £200 in my first two months. The local restaurant vouchers alone are worth the subscription.",
  name: 'Sarah M.',
  location: 'Manchester',
}

const SUPPORTING_QUOTES = [
  {
    quote: "Finally a voucher app that has places I actually want to go. Not the same chains everywhere.",
    name: 'James T.',
    location: 'Leeds',
  },
  {
    quote: "Showed my code, validated in seconds. No awkward paper coupons.",
    name: 'Priya K.',
    location: 'Birmingham',
  },
]

export function TestimonialsSection() {
  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="font-mono text-xs font-medium tracking-[0.12em] uppercase text-red mb-16"
        >
          What subscribers say
        </motion.p>

        <div className="grid grid-cols-1 lg:grid-cols-[2fr_1fr] gap-12 lg:gap-16 items-start">

          {/* Hero quote — large, editorial, no card border */}
          <motion.div
            initial={{ opacity: 0, x: -24 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.6 }}
          >
            {/* Large opening quote mark as decorative element */}
            <div
              className="font-display text-navy/[0.06] leading-none select-none mb-[-20px]"
              style={{ fontSize: 'clamp(80px, 10vw, 140px)' }}
              aria-hidden
            >
              "
            </div>
            <blockquote className="font-display text-[clamp(22px,2.5vw,32px)] text-navy leading-[1.35] mb-10 not-italic">
              {HERO_QUOTE.quote}
            </blockquote>
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full gradient-brand flex-shrink-0" />
              <div>
                <p className="font-semibold text-navy text-sm">{HERO_QUOTE.name}</p>
                <p className="font-mono text-xs text-navy/40">{HERO_QUOTE.location}</p>
              </div>
            </div>
          </motion.div>

          {/* Two compact supporting quotes */}
          <div className="flex flex-col gap-8">
            {SUPPORTING_QUOTES.map((t, i) => (
              <motion.div
                key={t.name}
                initial={{ opacity: 0, x: 24 }}
                whileInView={{ opacity: 1, x: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.55, delay: i * 0.1 }}
                className="bg-surface-muted rounded-2xl p-7 border border-navy/[0.05]"
              >
                <p className="text-sm leading-relaxed text-navy/65 mb-5 italic">"{t.quote}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-7 h-7 rounded-full gradient-brand flex-shrink-0" />
                  <div>
                    <p className="font-semibold text-navy text-xs">{t.name}</p>
                    <p className="font-mono text-[10px] text-navy/40">{t.location}</p>
                  </div>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 8: Create apps/customer-web/components/landing/MerchantCtaSection.tsx**

Mid-page merchant recruitment nudge. Navy background. Compact — not the full merchant pitch (that is `/merchants`). Links to `/merchants`.

```typescript
'use client'
import Link from 'next/link'
import { motion } from 'framer-motion'

export function MerchantCtaSection() {
  return (
    <section className="bg-navy py-20 px-6 overflow-hidden">
      <div className="max-w-screen-lg mx-auto flex flex-col sm:flex-row justify-between items-start sm:items-center gap-10">

        <motion.div
          initial={{ opacity: 0, x: -20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55 }}
        >
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-orange-red mb-3">
            For businesses
          </p>
          <h2 className="font-display text-[clamp(28px,3vw,40px)] text-white leading-[1.2] max-w-[480px]">
            Attract new local customers — free to list
          </h2>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, x: 20 }}
          whileInView={{ opacity: 1, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="flex-shrink-0"
        >
          <Link
            href="/merchants"
            className="inline-block bg-white text-navy font-bold text-[15px] px-8 py-3.5 rounded-xl no-underline hover:bg-white/90 transition-colors"
          >
            Learn more →
          </Link>
        </motion.div>

      </div>
    </section>
  )
}
```

- [ ] **Step 9: Create apps/customer-web/components/landing/PricingSection.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate the pricing card component (`PricingCard.tsx`) visually. Pricing cards have many typographic details (price size, billing cadence, feature list, CTA button, highlighted tier) that are faster to nail with visual iteration than pure Tailwind.
> Prompt hint: `"Subscription pricing card, large price display in Calistoga font, billing period in mono font, feature checklist, CTA button, 'Best value' badge on annual tier, navy and gradient red-orange brand colors, Tailwind CSS"`

Two pricing cards: Monthly (£6.99) and Annual (£69.99). White background. Annual has "Best value" badge. Both link to `/subscribe`.

```typescript
import Link from 'next/link'

export function PricingSection() {
  const plans = [
    {
      name: 'Monthly',
      price: '£6.99',
      period: 'per month',
      badge: null,
      features: [
        'Unlimited voucher browsing',
        'One redemption per voucher per cycle',
        'All local categories',
        'Cancel any time',
      ],
      cta: 'Subscribe monthly',
      highlight: false,
    },
    {
      name: 'Annual',
      price: '£69.99',
      period: 'per year',
      badge: 'Best value — 2 months free',
      features: [
        'Everything in Monthly',
        'Save ~£14 vs monthly billing',
        'Priority access to new merchants',
        'Cancel any time',
      ],
      cta: 'Subscribe annually',
      highlight: true,
    },
  ]

  return (
    <section style={{ background: 'white', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2000C', marginBottom: 16 }}>
            Pricing
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(32px, 4vw, 52px)',
              fontWeight: 400,
              color: '#010C35',
              lineHeight: 1.15,
              marginBottom: 16,
            }}
          >
            One subscription, unlimited local savings
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(1,12,53,0.55)', maxWidth: 480, margin: '0 auto' }}>
            Free to browse. Subscribe to unlock redemptions.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, maxWidth: 800, margin: '0 auto' }}>
          {plans.map(plan => (
            <div
              key={plan.name}
              style={{
                borderRadius: 20,
                padding: '40px 36px',
                background: plan.highlight ? '#010C35' : 'white',
                border: plan.highlight ? 'none' : '1px solid rgba(1,12,53,0.1)',
                position: 'relative',
              }}
            >
              {plan.badge && (
                <div
                  style={{
                    position: 'absolute',
                    top: -14,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: 'linear-gradient(135deg, #E2000C, #EE6904)',
                    color: 'white',
                    fontSize: 12,
                    fontWeight: 600,
                    padding: '4px 16px',
                    borderRadius: 100,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {plan.badge}
                </div>
              )}

              <p style={{ fontSize: 14, fontWeight: 600, color: plan.highlight ? 'rgba(255,255,255,0.5)' : 'rgba(1,12,53,0.5)', marginBottom: 12, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {plan.name}
              </p>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 6, marginBottom: 6 }}>
                <span style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 400, color: plan.highlight ? 'white' : '#010C35', lineHeight: 1 }}>
                  {plan.price}
                </span>
              </div>
              <p style={{ fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.4)' : 'rgba(1,12,53,0.4)', marginBottom: 32, fontFamily: 'var(--font-mono)' }}>
                {plan.period}
              </p>

              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 36 }}>
                {plan.features.map(f => (
                  <li key={f} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, fontSize: 14, color: plan.highlight ? 'rgba(255,255,255,0.75)' : 'rgba(1,12,53,0.7)', lineHeight: 1.5 }}>
                    <span style={{ color: '#E2000C', flexShrink: 0, marginTop: 1 }}>✓</span>
                    {f}
                  </li>
                ))}
              </ul>

              <Link
                href="/subscribe"
                style={{
                  display: 'block',
                  textAlign: 'center',
                  background: plan.highlight ? 'linear-gradient(135deg, #E2000C, #E84A00)' : '#010C35',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 15,
                  padding: '14px 0',
                  borderRadius: 10,
                  textDecoration: 'none',
                }}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>

        <p style={{ textAlign: 'center', marginTop: 24, fontSize: 13, color: 'rgba(1,12,53,0.4)' }}>
          Free plan available — browse all merchants and vouchers without subscribing.
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 10: Create apps/customer-web/components/landing/FinalCtaSection.tsx**

Bottom of page conversion section. Deep navy. Large Calistoga headline, single primary CTA.

```typescript
import Link from 'next/link'

export function FinalCtaSection() {
  return (
    <section
      style={{
        background: 'linear-gradient(160deg, #010C35 0%, #00041E 100%)',
        padding: '112px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <h2
          style={{
            fontFamily: 'var(--font-display)',
            fontSize: 'clamp(36px, 5vw, 64px)',
            fontWeight: 400,
            color: 'white',
            lineHeight: 1.1,
            marginBottom: 24,
          }}
        >
          Start saving at your favourite{' '}
          <span
            style={{
              background: 'linear-gradient(135deg, #E2000C 0%, #EE6904 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            local spots
          </span>
        </h2>
        <p style={{ fontSize: 18, color: 'rgba(255,255,255,0.55)', marginBottom: 48, lineHeight: 1.65 }}>
          Join thousands of subscribers saving money every month across the UK.
        </p>
        <Link
          href="/subscribe"
          style={{
            display: 'inline-block',
            background: 'linear-gradient(135deg, #E2000C 0%, #E84A00 100%)',
            color: 'white',
            fontWeight: 700,
            fontSize: 17,
            padding: '16px 40px',
            borderRadius: 12,
            textDecoration: 'none',
          }}
        >
          Get started — from £6.99/mo
        </Link>
        <p style={{ marginTop: 20, fontSize: 13, color: 'rgba(255,255,255,0.3)' }}>
          No commitment. Cancel any time.
        </p>
      </div>
    </section>
  )
}
```

- [ ] **Step 11: Assemble page.tsx**

Replace the stub `apps/customer-web/app/page.tsx`:

```typescript
import { HeroSection } from '@/components/landing/HeroSection'
import { HowItWorksSection } from '@/components/landing/HowItWorksSection'
import { FeaturedMerchantsSection } from '@/components/landing/FeaturedMerchantsSection'
import { CategorySection } from '@/components/landing/CategorySection'
import { SavingsStatsSection } from '@/components/landing/SavingsStatsSection'
import { AppMockupSection } from '@/components/landing/AppMockupSection'
import { TestimonialsSection } from '@/components/landing/TestimonialsSection'
import { MerchantCtaSection } from '@/components/landing/MerchantCtaSection'
import { PricingSection } from '@/components/landing/PricingSection'
import { FinalCtaSection } from '@/components/landing/FinalCtaSection'

// Section order is deliberate — conversion-optimised:
// 1. Hero establishes desire and price anchor (£6.99/mo in CTA)
// 2. How It Works immediately answers "how does this work?"
// 3. Pricing follows while desire is highest — user knows how, now sees cost
// 4. Featured Merchants proves the product exists with real content
// 5. Category browsing shows breadth
// 6. App Mockup shows the product in context
// 7. SavingsStats reinforces value with qualitative claims
// 8. Testimonials provide social proof at the consideration stage
// 9. Final CTA closes the consumer journey
// 10. Merchant CTA appears AFTER the consumer section — it should not
//     interrupt the consumer conversion flow mid-page
export default function HomePage() {
  return (
    <>
      <HeroSection />
      <HowItWorksSection />
      <PricingSection />
      <FeaturedMerchantsSection />
      <CategorySection />
      <AppMockupSection />
      <SavingsStatsSection />
      <TestimonialsSection />
      <FinalCtaSection />
      <MerchantCtaSection />
    </>
  )
}
```

- [ ] **Step 12: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 13: Visually verify in browser**

```bash
cd apps/customer-web && npm run dev
```

Open `http://localhost:3001`. Scroll through and verify:
- Section order: Hero → How It Works → Pricing → Featured Merchants → Categories → App Mockup → Claims → Testimonials → Final CTA → Merchant CTA
- Hero: asymmetric 55:45 grid, phone frame overlaps section bottom edge, noise texture visible on navy background
- HowItWorks: horizontal timeline with oversized low-opacity step numbers — NOT three equal cards
- Pricing: appears immediately after How It Works, both cards visible, Annual badge present
- Testimonials: editorial asymmetry — one dominant quote large left, two compact right
- SavingsStats: giant left-aligned Calistoga claims — NOT centred equal columns
- Merchant CTA at the very bottom, after FinalCtaSection
- Framer Motion: hero headline words stagger in on load; sections fade up on scroll-enter
- Gradient text renders (not invisible / clipped)
- All CTAs link to correct routes (`/subscribe`, `/discover`, `/merchants`)
- No console errors

- [ ] **Step 14: Commit**

```bash
git add apps/customer-web/app/page.tsx apps/customer-web/components/landing/
git commit -m "feat: add landing page with all 10 sections"
```

---

## Task 5: Merchant Pitch Page (`/merchants`)

**Files:**
- Create: `apps/customer-web/app/merchants/page.tsx`
- Create: `apps/customer-web/components/merchant-pitch/MerchantHero.tsx`
- Create: `apps/customer-web/components/merchant-pitch/BenefitsGrid.tsx`
- Create: `apps/customer-web/components/merchant-pitch/HowMerchantsWork.tsx`
- Create: `apps/customer-web/components/merchant-pitch/MerchantPricingSection.tsx`
- Create: `apps/customer-web/components/merchant-pitch/MerchantSignupCta.tsx`

This page is detailed and commercial — its job is to convert local business owners into registered merchants. It should answer every question a sceptical business owner would ask: what do I get, what does it cost, how does it work, what's the commitment. All content is static. No API calls.

**Note on routing conflict:** The file structure has both `app/merchants/page.tsx` (this pitch page) and `app/merchants/[id]/page.tsx` (individual merchant profile). Next.js App Router handles this correctly — `page.tsx` at `merchants/` serves the static route, `[id]/page.tsx` serves dynamic routes. No conflict.

**Implementation style — REQUIRED:** Use Tailwind utility classes throughout. Inline `style={{}}` is used in this plan for illustration only — translate to Tailwind before writing real code.

**Responsive layout — REQUIRED:** All multi-column grids must collapse to single-column on mobile. Use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` for benefit cards. The alternating step layout in `HowMerchantsWork` must use Tailwind `order-*` classes (not `direction: rtl`) as shown in the revised code. Test at 375px, 768px, and 1280px before committing.

- [ ] **Step 1: Create apps/customer-web/components/merchant-pitch/MerchantHero.tsx**

Asymmetric split — editorial left column with headline + CTA, right column with a large rotated stat block. Dark navy background. No centred radial glow — use a left-anchored diagonal red shard (matching the landing page language). Body copy ≤20 words.

```typescript
'use client'
import { motion } from 'framer-motion'
import Link from 'next/link'

export function MerchantHero() {
  return (
    <section className="relative bg-deep-navy overflow-hidden">
      {/* Diagonal red shard — mirrored from landing HeroSection for visual language coherence */}
      <div
        aria-hidden
        className="absolute top-0 right-0 w-[55%] h-full pointer-events-none"
        style={{
          background: 'linear-gradient(135deg, transparent 40%, rgba(226,0,12,0.06) 100%)',
        }}
      />
      {/* Grain noise texture */}
      <svg aria-hidden className="absolute inset-0 w-full h-full opacity-[0.025] pointer-events-none">
        <filter id="merchant-grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
          <feColorMatrix type="saturate" values="0" />
        </filter>
        <rect width="100%" height="100%" filter="url(#merchant-grain)" />
      </svg>

      <div className="relative max-w-screen-xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-[55fr_45fr] gap-16 lg:gap-0 min-h-[80vh] items-center py-28 lg:py-36">
        {/* Left: headline + CTA */}
        <div className="lg:pr-16">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="font-mono text-xs tracking-[0.12em] uppercase text-orange-red mb-6"
          >
            For local businesses
          </motion.p>

          <h1 className="font-display text-[clamp(40px,5.5vw,72px)] font-normal text-white leading-[1.08] mb-8">
            {['Reach local buyers.', 'Free to list,'].map((word, i) => (
              <motion.span
                key={word}
                className="block"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.55, delay: i * 0.1 }}
              >
                {word}
              </motion.span>
            ))}
            <motion.span
              className="block gradient-brand-text"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.55, delay: 0.2 }}
            >
              always.
            </motion.span>
          </h1>

          {/* ≤20 words — detail lives in BenefitsGrid below */}
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.3 }}
            className="text-lg leading-relaxed text-white/60 mb-10 max-w-md"
          >
            List your business free. Pay only when you want extra reach.
          </motion.p>

          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.4 }}
            className="flex flex-wrap gap-4 items-center"
          >
            <Link
              href="mailto:merchants@redeemo.com"
              className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-bold text-base px-10 py-[18px] rounded-xl no-underline shadow-[0_0_32px_rgba(226,0,12,0.35)] hover:shadow-[0_0_48px_rgba(226,0,12,0.5)] transition-shadow"
            >
              Apply to join — it's free
            </Link>
            <a
              href="#how-it-works"
              className="text-white/60 font-medium text-base hover:text-white/90 transition-colors flex items-center gap-2"
            >
              See how it works
              <span aria-hidden>↓</span>
            </a>
          </motion.div>
        </div>

        {/* Right: large editorial stat block */}
        <motion.div
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
          className="hidden lg:flex flex-col items-start justify-center gap-6 lg:pl-12 border-l border-white/[0.06]"
        >
          {/* Three oversized callout lines — qualitative, no invented numbers */}
          {[
            { label: 'Listing fee', value: '£0' },
            { label: 'Commission per redemption', value: '0%' },
            { label: 'Commitment', value: '12 months' },
          ].map(({ label, value }, i) => (
            <motion.div
              key={label}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.35 + i * 0.1 }}
              className="flex flex-col gap-1"
            >
              <span className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/35">
                {label}
              </span>
              <span className="font-display text-[clamp(40px,4.5vw,64px)] leading-none text-white">
                {value}
              </span>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  )
}
```

**Tailwind tokens used** (must be defined in `@theme {}` in `globals.css`):
- `bg-deep-navy` → `#00041E`
- `text-orange-red` → `#E84A00`
- `from-red` → `#E2000C`
- `to-orange-red` → `#E84A00`
- `gradient-brand-text` → utility class (see Task 1 globals.css)
- `font-display` → Calistoga CSS variable
- `font-mono` → DM Mono CSS variable

- [ ] **Step 2: Create apps/customer-web/components/merchant-pitch/BenefitsGrid.tsx**

Six benefits with clear visual hierarchy: the first two are **hero cards** — wider, taller, navy background, larger type. The remaining four form a compact 2-column (tablet) / 4-column (desktop) sub-grid below. White section background.

```typescript
'use client'
import { motion } from 'framer-motion'

const HERO_BENEFITS = [
  {
    icon: '🎯',
    title: 'Reach motivated local buyers',
    body: 'Redeemo subscribers pay for access to local offers. They are actively looking to spend — not passively browsing social media.',
  },
  {
    icon: '£0',
    title: 'Free to list, always',
    body: 'No listing fee. No commission on redemptions. Create your profile, add your vouchers, get approved. Your only optional cost is featured placement.',
  },
]

const SUB_BENEFITS = [
  {
    icon: '📊',
    title: 'Redemption analytics',
    body: 'See which vouchers drive footfall, tracked per branch and time period.',
  },
  {
    icon: '📍',
    title: 'Location-targeted exposure',
    body: 'Your business appears to subscribers within your area — people who can actually visit.',
  },
  {
    icon: '⚡',
    title: 'In-store validation in seconds',
    body: 'Staff scan a QR code or enter a code in the merchant app. No hardware needed.',
  },
  {
    icon: '🚀',
    title: 'Featured campaigns',
    body: 'Purchase featured placement to appear at the top of local discovery feeds when you want a boost.',
  },
]

export function BenefitsGrid() {
  return (
    <section className="bg-white py-24 px-6">
      <div className="max-w-screen-xl mx-auto">
        {/* Section label + heading */}
        <div className="mb-14">
          <p className="font-mono text-xs tracking-[0.12em] uppercase text-red mb-4">
            Why Redeemo
          </p>
          <h2 className="font-display text-[clamp(30px,3.5vw,48px)] font-normal text-navy leading-[1.12] max-w-2xl">
            Everything your business needs to grow locally
          </h2>
        </div>

        {/* Hero benefit cards — first two, side by side, navy background */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {HERO_BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: i * 0.1 }}
              className="bg-navy rounded-2xl p-10 flex flex-col gap-6 min-h-[260px]"
            >
              <span className="text-4xl" aria-hidden>{b.icon}</span>
              <div>
                <h3 className="font-display text-[26px] font-normal text-white leading-[1.2] mb-3">
                  {b.title}
                </h3>
                <p className="text-[15px] leading-relaxed text-white/60">
                  {b.body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Sub-benefit cards — remaining four, lighter surface */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {SUB_BENEFITS.map((b, i) => (
            <motion.div
              key={b.title}
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.45, delay: i * 0.08 }}
              className="bg-surface-muted rounded-xl p-7 border border-navy/[0.05] flex flex-col gap-4"
            >
              <span className="text-2xl" aria-hidden>{b.icon}</span>
              <div>
                <h3 className="font-display text-[18px] font-normal text-navy leading-snug mb-2">
                  {b.title}
                </h3>
                <p className="text-[13px] leading-relaxed text-navy/55">
                  {b.body}
                </p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

**Tailwind tokens used:**
- `bg-navy` → `#010C35`
- `text-navy` → `#010C35`
- `text-red` → `#E2000C`
- `bg-surface-muted` → `#F8F7F5` (define in `@theme {}` if not present)
- `font-display`, `font-mono` → CSS variable fonts from Task 1

- [ ] **Step 3: Create apps/customer-web/components/merchant-pitch/HowMerchantsWork.tsx**

Step-by-step onboarding flow. Alternating left-right layout. Warm-grey background. Anchor id="how-it-works".

```typescript
export function HowMerchantsWork() {
  const steps = [
    {
      number: '01',
      title: 'Create your merchant profile',
      body: 'Register online. Fill in your business details, upload photos, and add your branch locations. The web portal guides you through every step.',
      detail: 'Takes around 15 minutes. You control your profile — update it any time.',
    },
    {
      number: '02',
      title: 'Add your two mandatory vouchers',
      body: 'Every merchant on Redeemo offers two standard vouchers as part of the marketplace agreement. These are the baseline offers that subscribers can redeem once per cycle.',
      detail: 'You choose the offer type: BOGO, discount, freebie, package deal, and more. Your vouchers, your terms.',
    },
    {
      number: '03',
      title: 'Get approved by the Redeemo team',
      body: 'Our team reviews your profile for completeness and quality. You\'ll be notified by email once approved.',
      // ⚠️ Owner action required: confirm and add an approval SLA (e.g. "within 2 business days") before launch.
      detail: 'We approve businesses that meet our quality standards and offer genuine local value.',
    },
    {
      number: '04',
      title: 'Go live and start welcoming subscribers',
      body: 'Once approved, your business appears in local discovery feeds. Subscribers can find your vouchers, save them to favourites, and redeem in-store.',
      detail: 'Your branch staff validate redemptions in seconds using the Redeemo merchant app.',
    },
  ]

  return (
    <section id="how-it-works" style={{ background: '#F8F7F5', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 72 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E2000C', marginBottom: 16 }}>
            Onboarding
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(30px, 3.5vw, 48px)',
              fontWeight: 400,
              color: '#010C35',
              lineHeight: 1.15,
            }}
          >
            From sign-up to live in days
          </h2>
        </div>

        {/* Alternating layout: odd steps show copy left / visual right; even steps reverse.
            Use Tailwind `order-*` to reverse on desktop without breaking mobile stacking.
            Do NOT use `direction: 'rtl'` — that is a text-direction property and produces
            broken layouts. Use explicit grid column ordering instead. */}
        <div className="flex flex-col gap-12">
          {steps.map((step, i) => (
            <div
              key={step.number}
              className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-20 items-center"
            >
              {/* Copy block — on even steps it appears first (left); on odd steps push it right via order */}
              <div className={i % 2 === 0 ? 'lg:order-1' : 'lg:order-2'}>
                <div className="flex items-center gap-4 mb-5">
                  <span className="font-mono text-sm font-medium text-white w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 gradient-brand">
                    {step.number}
                  </span>
                  <h3 className="font-display text-2xl text-navy leading-snug">
                    {step.title}
                  </h3>
                </div>
                <p className="text-base leading-relaxed text-navy/65 mb-4">
                  {step.body}
                </p>
                <p className="text-sm leading-relaxed text-navy/45 border-l-2 border-red pl-4">
                  {step.detail}
                </p>
              </div>

              {/* Visual placeholder — opposite order to copy block */}
              <div className={`h-64 lg:h-72 rounded-2xl bg-white border border-navy/[0.08] flex items-center justify-center shadow-sm ${i % 2 === 0 ? 'lg:order-2' : 'lg:order-1'}`}>
                <span className="font-mono text-xs text-navy/20 tracking-widest uppercase">
                  Step {step.number} illustration
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create apps/customer-web/components/merchant-pitch/MerchantPricingSection.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate the pricing card pair visually. The Free vs Featured comparison needs clear typographic hierarchy and a well-balanced two-column layout that communicates value quickly.
> Prompt hint: `"Two-column merchant pricing comparison, left card 'Standard listing Free always', right card 'Featured placement Custom per campaign' with gradient highlight, feature checklists with checkmarks, navy dark background, red-orange accent, Tailwind CSS"`

Two columns: Free listing vs Featured. Anchor id="pricing". Navy background.

```typescript
export function MerchantPricingSection() {
  return (
    <section id="pricing" style={{ background: '#010C35', padding: '96px 24px' }}>
      <div style={{ maxWidth: 1280, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 64 }}>
          <p style={{ fontFamily: 'var(--font-mono)', fontSize: 12, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#E84A00', marginBottom: 16 }}>
            Merchant pricing
          </p>
          <h2
            style={{
              fontFamily: 'var(--font-display)',
              fontSize: 'clamp(30px, 3.5vw, 48px)',
              fontWeight: 400,
              color: 'white',
              lineHeight: 1.15,
              marginBottom: 16,
            }}
          >
            Simple, transparent pricing
          </h2>
          <p style={{ fontSize: 16, color: 'rgba(255,255,255,0.5)', maxWidth: 480, margin: '0 auto' }}>
            No commission. No per-redemption fees. Pay only for the reach you want.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 24, maxWidth: 860, margin: '0 auto' }}>
          {/* Free listing */}
          <div style={{ borderRadius: 20, padding: '40px 36px', border: '1px solid rgba(255,255,255,0.1)' }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              Standard listing
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 400, color: 'white', lineHeight: 1, marginBottom: 6 }}>
              Free
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', marginBottom: 32 }}>
              Always free to list
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {[
                'Full merchant profile',
                'Two mandatory vouchers',
                'Branch management',
                'Redemption tracking',
                'Customer analytics dashboard',
                'No commission on redemptions',
              ].map(f => (
                <li key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  <span style={{ color: '#EE6904', flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
          </div>

          {/* Featured */}
          <div
            style={{
              borderRadius: 20,
              padding: '40px 36px',
              background: 'rgba(238,105,4,0.08)',
              border: '1px solid rgba(238,105,4,0.25)',
            }}
          >
            <p style={{ fontSize: 13, fontWeight: 600, color: '#E84A00', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 12 }}>
              Featured placement
            </p>
            <p style={{ fontFamily: 'var(--font-display)', fontSize: 52, fontWeight: 400, color: 'white', lineHeight: 1, marginBottom: 6 }}>
              Custom
            </p>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.35)', fontFamily: 'var(--font-mono)', marginBottom: 32 }}>
              Priced per campaign
            </p>
            <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 32 }}>
              {[
                'Everything in Standard',
                'Top placement in local discovery feed',
                'Home page featured section',
                'Configurable radius targeting',
                'Campaign duration you set',
                'Dedicated account support',
              ].map(f => (
                <li key={f} style={{ display: 'flex', gap: 10, fontSize: 14, color: 'rgba(255,255,255,0.65)', lineHeight: 1.5 }}>
                  <span style={{ color: '#EE6904', flexShrink: 0 }}>✓</span>
                  {f}
                </li>
              ))}
            </ul>
            <a
              href="mailto:merchants@redeemo.com"
              style={{
                display: 'block',
                textAlign: 'center',
                background: 'linear-gradient(135deg, #E2000C, #EE6904)',
                color: 'white',
                fontWeight: 600,
                fontSize: 15,
                padding: '14px 0',
                borderRadius: 10,
                textDecoration: 'none',
              }}
            >
              Enquire about featured
            </a>
          </div>
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Create apps/customer-web/components/merchant-pitch/MerchantSignupCta.tsx**

Two-part structure: FAQ accordion above, then a **full-width** dark navy closing block that spans the entire viewport width (not a rounded card inset). The closing block is the page climax — it should feel unmissable. Button at `text-[20px] px-14 py-5`. The Step 3 approval copy must frame approval as **quality curation**, not as waiting.

```typescript
'use client'
import { motion } from 'framer-motion'
import { useState } from 'react'

const FAQS = [
  {
    q: 'What is the 12-month contract?',
    a: 'Merchants sign a 12-month listing agreement, accepted digitally during onboarding. This ensures our subscriber base sees stable, committed local businesses — and gives you consistent exposure for a full year.',
  },
  {
    q: 'Can I change my vouchers after approval?',
    a: 'Your two mandatory vouchers are fixed once approved — they are the core of your Redeemo listing. You can add custom vouchers (RCV) at any time, subject to a quick admin review.',
  },
  {
    q: 'What happens if I want to suspend or leave?',
    a: 'You can request suspension or offboarding via the merchant portal. Your redemption history is preserved. Your vouchers are immediately hidden from subscribers once suspended.',
  },
  {
    q: 'Is there a commission on redemptions?',
    a: 'None. Redeemo charges no commission on voucher redemptions. Your only optional cost is featured placement when you want extra reach.',
  },
]

function FaqItem({ faq, index }: { faq: typeof FAQS[0]; index: number }) {
  const [open, setOpen] = useState(false)
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className="border-b border-navy/[0.08]"
    >
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full text-left py-7 flex items-center justify-between gap-6 group"
        aria-expanded={open}
      >
        <span className="text-[17px] font-semibold text-navy group-hover:text-red transition-colors">
          {faq.q}
        </span>
        <span
          className="text-navy/30 text-xl flex-shrink-0 transition-transform duration-300"
          style={{ transform: open ? 'rotate(45deg)' : 'rotate(0deg)' }}
          aria-hidden
        >
          +
        </span>
      </button>
      {open && (
        <p className="pb-7 text-[15px] leading-[1.75] text-navy/60 max-w-2xl">
          {faq.a}
        </p>
      )}
    </motion.div>
  )
}

export function MerchantSignupCta() {
  return (
    <>
      {/* FAQ section — white background, generous padding */}
      <section className="bg-white py-24 px-6">
        <div className="max-w-screen-lg mx-auto">
          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="font-display text-[clamp(28px,3.5vw,44px)] font-normal text-navy mb-14"
          >
            Common questions
          </motion.h2>
          <div>
            {FAQS.map((faq, i) => (
              <FaqItem key={faq.q} faq={faq} index={i} />
            ))}
          </div>
        </div>
      </section>

      {/* Full-width closing CTA — page climax, no rounded-card inset */}
      <section className="relative bg-deep-navy overflow-hidden py-32 px-6">
        {/* Atmospheric diagonal shard — consistent with MerchantHero */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(145deg, rgba(226,0,12,0.08) 0%, transparent 55%)',
          }}
        />
        {/* Oversized background text — decorative */}
        <span
          aria-hidden
          className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 font-display text-[clamp(100px,16vw,200px)] text-white/[0.03] leading-none whitespace-nowrap select-none pointer-events-none"
        >
          Join Redeemo
        </span>

        <div className="relative max-w-screen-md mx-auto text-center">
          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4 }}
            className="font-mono text-xs tracking-[0.12em] uppercase text-orange-red mb-6"
          >
            Ready to grow?
          </motion.p>

          <motion.h2
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.55, delay: 0.08 }}
            className="font-display text-[clamp(36px,5vw,68px)] font-normal text-white leading-[1.08] mb-6"
          >
            Your customers are already here.
          </motion.h2>

          <motion.p
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.16 }}
            className="text-[17px] leading-relaxed text-white/55 mb-12 max-w-lg mx-auto"
          >
            Apply free. We review every merchant to maintain the quality our subscribers expect — so your listing is in good company from day one.
            {/* ⚠️ Owner action required: add turnaround indication once confirmed (e.g. "We aim to review within X business days") */}
          </motion.p>

          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5, delay: 0.24 }}
            className="flex flex-col sm:flex-row items-center justify-center gap-4"
          >
            <a
              href="mailto:merchants@redeemo.com"
              className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-bold text-[20px] px-14 py-5 rounded-xl no-underline shadow-[0_0_48px_rgba(226,0,12,0.4)] hover:shadow-[0_0_64px_rgba(226,0,12,0.6)] transition-shadow"
            >
              Apply to join — it's free
            </a>
          </motion.div>

          <motion.p
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: 0.35 }}
            className="mt-6 text-[13px] text-white/25 font-mono"
          >
            merchants@redeemo.com
          </motion.p>
        </div>
      </section>
    </>
  )
}
```

**Design notes:**
- The closing block is a full-width `<section>` — NOT a rounded card nested inside a white section. It should sit flush edge-to-edge, matching the footer's dark tone.
- The approval framing says "We review every merchant to maintain the quality our subscribers expect" — positions curation as a feature, not a gatekeeping delay.
- Oversized decorative "Join Redeemo" background text at `opacity-[0.03]` adds depth without distraction.
- Button at `text-[20px] px-14 py-5` — the largest CTA on the page, intentionally heavier than hero CTAs elsewhere.

- [ ] **Step 6: Assemble apps/customer-web/app/merchants/page.tsx**

```typescript
import type { Metadata } from 'next'
import { MerchantHero } from '@/components/merchant-pitch/MerchantHero'
import { BenefitsGrid } from '@/components/merchant-pitch/BenefitsGrid'
import { HowMerchantsWork } from '@/components/merchant-pitch/HowMerchantsWork'
import { MerchantPricingSection } from '@/components/merchant-pitch/MerchantPricingSection'
import { MerchantSignupCta } from '@/components/merchant-pitch/MerchantSignupCta'

export const metadata: Metadata = {
  title: 'For Merchants',
  description: 'List your local business on Redeemo for free. Reach thousands of local subscribers actively looking for deals near them.',
}

export default function MerchantsPage() {
  return (
    <>
      <MerchantHero />
      <BenefitsGrid />
      <HowMerchantsWork />
      <MerchantPricingSection />
      <MerchantSignupCta />
    </>
  )
}
```

- [ ] **Step 7: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 8: Visually verify in browser**

Open `http://localhost:3001/merchants`. Verify:
- Hero section loads with gradient headline and two CTAs
- Benefits grid: 6 cards in 3×2 layout
- How It Works: 4 steps with alternating layout, anchor `#how-it-works` works from navbar
- Pricing section: Free and Featured columns visible; anchor `#pricing` works
- FAQ + final CTA block at the bottom
- No blank sections, no console errors

- [ ] **Step 9: Commit**

```bash
git add apps/customer-web/app/merchants/page.tsx apps/customer-web/components/merchant-pitch/
git commit -m "feat: add merchant pitch page with benefits, onboarding steps, pricing, and FAQ"
```

---

## Task 6: Discover Feed + Search Pages (`/discover`, `/search`)

**Files:**
- Create: `apps/customer-web/app/discover/page.tsx`
- Create: `apps/customer-web/app/search/page.tsx`
- Create: `apps/customer-web/components/discover/DiscoverHero.tsx`
- Create: `apps/customer-web/components/discover/CampaignBanner.tsx`
- Create: `apps/customer-web/components/discover/MerchantRow.tsx`
- Create: `apps/customer-web/components/discover/CategoryFilterBar.tsx`
- Create: `apps/customer-web/components/ui/MerchantTile.tsx`
- Create: `apps/customer-web/components/ui/VoucherCard.tsx`
- Create: `apps/customer-web/components/ui/FilterDrawer.tsx`
- Create: `apps/customer-web/components/search/SearchBar.tsx`
- Create: `apps/customer-web/components/search/SearchResults.tsx`

**Design direction — REQUIRED before writing any code:**

`/discover` is not a search results page — it is a **curated feed**. Think editorial magazine meets local directory. The visual language:

- `DiscoverHero`: warm-cream (`#FAF8F5`) background, left-aligned large Calistoga headline ("What's near you"), location context shown as a DM Mono chip. Not a hero banner with a background image — it is a typography-first heading block.
- `CampaignBanner`: full-width horizontal scroll strip of campaign cards. Each card: banner image as background, campaign name in white Calistoga, gradient overlay. Snap scroll. Framer Motion fade-in on mount.
- `MerchantRow`: horizontal scroll rows grouped by category — "Trending this month", "Near you: Restaurants", etc. Each row has a section label (Calistoga + DM Mono row count) then a horizontal scrollable rail of `MerchantTile` cards. No chevron arrows — scroll is touch/trackpad native.
- `MerchantTile`: the primary card component. Used on discover, search results, and the landing `FeaturedMerchantsSection`. Must be visually rich.
- `FilterDrawer`: slides in from the right on mobile / appears as a sidebar on desktop. Contains category filter, voucher type filter, sort selector.
- `/search` reuses `MerchantTile` in a 2–3 column grid with `FilterDrawer` toggled by a filter button in `SearchBar`.

**Aesthetic constraints:**
- Background: `#FAF8F5` warm cream (not white, not grey) — gives an editorial warmth
- Section headings: Calistoga, left-aligned, never centred on discover/search
- MerchantTile: image fills the top half, info fills the bottom. No floating chips over the image — badges go below the image in the info area.
- Framer Motion: `MerchantTile` stagger on row entry (`whileInView`, `once: true`), `FilterDrawer` slides in with `x: 300 → 0`
- No skeleton loaders specified — show `null` / empty state gracefully; real data loads server-side on discover

**Responsive layout — REQUIRED:**
- Discover horizontal rails: `overflow-x-auto`, `scroll-snap-type-x mandatory`, `snap-start` on each tile
- Search grid: `grid-cols-1 sm:grid-cols-2 lg:grid-cols-3`
- FilterDrawer: `fixed right-0 top-0 h-full w-80` on mobile/tablet; `sticky top-24 w-72` sidebar on `lg:`

**Backend routes (verified):**
- `GET /api/v1/customer/home?lat=&lng=` → `{ locationContext, featured[], trending[], campaigns[], nearbyByCategory[] }`
- `GET /api/v1/customer/search?q=&categoryId=&sortBy=&limit=&offset=` → `{ results[], total, hasMore }`
- `GET /api/v1/customer/categories` → `{ categories[] }`
- Favourite toggle: `POST/DELETE /api/v1/customer/favourites/merchants/:merchantId` (auth required)

**MerchantTile data shape (from `enrichMerchantTile` in service.ts):**
```typescript
type MerchantTile = {
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
  distance: number | null        // metres, null if no location context
  nearestBranchId: string | null
}
```

**HomeFeed data shape (from `getHomeFeed` in service.ts):**
```typescript
type HomeFeed = {
  locationContext: { city: string | null; source: 'coordinates' | 'profile' | 'none' }
  featured: MerchantTile[]
  trending: MerchantTile[]
  campaigns: { id: string; name: string; description: string | null; bannerImageUrl: string | null }[]
  nearbyByCategory: { category: { id: string; name: string }; merchants: MerchantTile[] }[]
}
```

---

- [ ] **Step 1: Create apps/customer-web/components/ui/MerchantTile.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine this card visually. MerchantTile is used everywhere (discover feed, search, landing). Getting the image-to-info proportion, badge placement, and hover state right visually before committing saves rework later.
> Prompt hint: `"Local merchant discovery card, banner image fills top 55% with object-cover, merchant logo small circle bottom-left of image area, info area below: merchant name in display font, category pill badge, voucher count label with ticket icon, max saving chip, star rating with count, distance chip if available, heart favourite toggle top-right of image, subtle hover lift shadow, warm cream background #FAF8F5, navy text #010C35, Tailwind CSS"`

The tile is a pure presentational component — it receives `merchant: MerchantTile` and `onFavouriteToggle?: (id: string) => void`. It does not call the API itself.

```typescript
'use client'
import Image from 'next/image'
import Link from 'next/link'
import { motion } from 'framer-motion'
import type { MerchantTileData } from '@/lib/api'

// Re-export the canonical type under the short name for local use.
export type MerchantTile = MerchantTileData

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}mi`
}

type Props = {
  merchant: MerchantTile
  onFavouriteToggle?: (id: string) => void
  // stagger index passed by parent MerchantRow for animation delay
  index?: number
}

export function MerchantTile({ merchant, onFavouriteToggle, index = 0 }: Props) {
  const displayName = merchant.tradingName ?? merchant.businessName
  const dist = formatDistance(merchant.distance)

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.07 }}
      className="group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-navy/[0.06] shadow-sm hover:shadow-md transition-shadow flex-shrink-0 w-[220px] sm:w-[240px]"
    >
      {/* Banner image area */}
      <Link href={`/merchants/${merchant.id}`} className="relative block h-[130px] bg-navy/10 flex-shrink-0">
        {merchant.bannerUrl ? (
          <Image
            src={merchant.bannerUrl}
            alt={displayName}
            fill
            className="object-cover"
            sizes="240px"
          />
        ) : (
          /* Placeholder gradient when no banner */
          <div className="absolute inset-0 bg-gradient-to-br from-navy/20 to-navy/5" />
        )}

        {/* Logo circle — overlaps bottom-left of banner */}
        {merchant.logoUrl && (
          <div className="absolute bottom-0 left-3 translate-y-1/2 w-10 h-10 rounded-full border-2 border-white shadow overflow-hidden bg-white">
            <Image src={merchant.logoUrl} alt="" fill className="object-cover" sizes="40px" />
          </div>
        )}
      </Link>

      {/* Favourite heart — top right of image, always visible */}
      {onFavouriteToggle && (
        <button
          onClick={e => { e.preventDefault(); onFavouriteToggle(merchant.id) }}
          className="absolute top-2 right-2 w-8 h-8 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-sm hover:bg-white transition-colors"
          aria-label={merchant.isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          <span className="text-[15px]" aria-hidden>
            {merchant.isFavourited ? '❤️' : '🤍'}
          </span>
        </button>
      )}

      {/* Info area */}
      <Link href={`/merchants/${merchant.id}`} className="flex flex-col gap-2 p-4 pt-6 flex-1 no-underline">
        {/* Category badge */}
        {merchant.primaryCategory && (
          <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-orange-red">
            {merchant.primaryCategory.name}
          </span>
        )}

        {/* Merchant name */}
        <h3 className="font-display text-[17px] text-navy leading-snug line-clamp-2">
          {displayName}
        </h3>

        {/* Vouchers + saving row */}
        <div className="flex items-center gap-2 flex-wrap">
          {merchant.voucherCount > 0 && (
            <span className="text-[12px] text-navy/55 font-mono">
              {merchant.voucherCount} {merchant.voucherCount === 1 ? 'voucher' : 'vouchers'}
            </span>
          )}
          {merchant.maxEstimatedSaving !== null && (
            <span className="text-[11px] font-semibold text-red bg-red/[0.08] px-2 py-0.5 rounded-full">
              Save up to £{merchant.maxEstimatedSaving.toFixed(0)}
            </span>
          )}
        </div>

        {/* Rating + distance row */}
        <div className="flex items-center justify-between mt-auto pt-2 border-t border-navy/[0.06]">
          {merchant.avgRating !== null ? (
            <span className="text-[12px] text-navy/60">
              ★ {merchant.avgRating.toFixed(1)}
              <span className="text-navy/35 ml-1">({merchant.reviewCount})</span>
            </span>
          ) : (
            <span className="text-[11px] text-navy/30 font-mono">New</span>
          )}
          {dist && (
            <span className="text-[11px] text-navy/40 font-mono">{dist}</span>
          )}
        </div>
      </Link>
    </motion.div>
  )
}
```

- [ ] **Step 2: Create apps/customer-web/components/discover/CampaignBanner.tsx**

Full-width horizontal snap-scroll strip of campaign cards. Each card is a gradient-overlaid banner image. Framer Motion `opacity: 0 → 1` on mount. This is a Client Component (scroll interaction).

```typescript
'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'
import Link from 'next/link'

type Campaign = {
  id: string
  name: string
  description: string | null
  bannerImageUrl: string | null
}

export function CampaignBanner({ campaigns }: { campaigns: Campaign[] }) {
  if (campaigns.length === 0) return null

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.6 }}
      className="w-full overflow-x-auto scrollbar-none"
      style={{ scrollSnapType: 'x mandatory' }}
    >
      <div className="flex gap-4 px-6 pb-2" style={{ width: 'max-content' }}>
        {campaigns.map((campaign, i) => (
          <motion.div
            key={campaign.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            className="relative flex-shrink-0 rounded-2xl overflow-hidden cursor-pointer"
            style={{ width: 'clamp(280px, 55vw, 480px)', height: 160, scrollSnapAlign: 'start' }}
          >
            <Link href={`/discover?campaign=${campaign.id}`} className="block w-full h-full">
              {campaign.bannerImageUrl ? (
                <Image
                  src={campaign.bannerImageUrl}
                  alt={campaign.name}
                  fill
                  className="object-cover"
                  sizes="480px"
                />
              ) : (
                <div className="absolute inset-0 bg-gradient-to-br from-navy to-deep-navy" />
              )}
              {/* Gradient overlay for text legibility */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
              <div className="absolute bottom-0 left-0 right-0 p-5">
                <p className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/60 mb-1">
                  Campaign
                </p>
                <h3 className="font-display text-[20px] text-white leading-snug line-clamp-2">
                  {campaign.name}
                </h3>
              </div>
            </Link>
          </motion.div>
        ))}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/components/discover/MerchantRow.tsx**

Horizontal scrollable rail of `MerchantTile` cards with a section heading. Used for "Trending", "Featured", and each category row on `/discover`.

```typescript
'use client'
import { motion } from 'framer-motion'
import { MerchantTile, type MerchantTile as MerchantTileType } from '@/components/ui/MerchantTile'
import { useState, useCallback } from 'react'
import { apiFetch } from '@/lib/api'

type Props = {
  title: string
  subtitle?: string          // e.g. "12 merchants"
  merchants: MerchantTileType[]
  initialFavourites?: Set<string>
}

export function MerchantRow({ title, subtitle, merchants, initialFavourites }: Props) {
  const [favourites, setFavourites] = useState<Set<string>>(initialFavourites ?? new Set())

  const handleFavouriteToggle = useCallback(async (merchantId: string) => {
    const isFav = favourites.has(merchantId)
    // Optimistic update
    setFavourites(prev => {
      const next = new Set(prev)
      isFav ? next.delete(merchantId) : next.add(merchantId)
      return next
    })
    try {
      await apiFetch(
        `/api/v1/customer/favourites/merchants/${merchantId}`,
        { method: isFav ? 'DELETE' : 'POST', auth: true },
      )
    } catch {
      // Revert on failure
      setFavourites(prev => {
        const next = new Set(prev)
        isFav ? next.add(merchantId) : next.delete(merchantId)
        return next
      })
    }
  }, [favourites])

  if (merchants.length === 0) return null

  return (
    <section className="py-2">
      {/* Row heading */}
      <div className="flex items-baseline gap-3 px-6 mb-4">
        <h2 className="font-display text-[22px] text-navy leading-none">
          {title}
        </h2>
        {subtitle && (
          <span className="font-mono text-[11px] text-navy/35 tracking-wide">
            {subtitle}
          </span>
        )}
      </div>

      {/* Horizontal scroll rail */}
      <div
        className="overflow-x-auto scrollbar-none px-6"
        style={{ scrollSnapType: 'x mandatory' }}
      >
        <div className="flex gap-4" style={{ width: 'max-content', paddingRight: 24 }}>
          {merchants.map((m, i) => (
            <div key={m.id} style={{ scrollSnapAlign: 'start' }}>
              <MerchantTile
                merchant={{ ...m, isFavourited: favourites.has(m.id) }}
                onFavouriteToggle={handleFavouriteToggle}
                index={i}
              />
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
```

- [ ] **Step 4: Create apps/customer-web/components/discover/DiscoverHero.tsx**

Typography-first heading block. Warm cream background. Location context chip. No background image.

```typescript
import { motion } from 'framer-motion'

type LocationContext = {
  city: string | null
  source: 'coordinates' | 'profile' | 'none'
}

// Note: this is used inside a Server Component page — keep as a Server Component (no 'use client').
// The parent page fetches data server-side; this component receives the resolved location.
export function DiscoverHero({ locationContext }: { locationContext: LocationContext }) {
  const locationLabel =
    locationContext.source === 'coordinates' ? 'Near your location' :
    locationContext.city ? `Near ${locationContext.city}` :
    null

  return (
    <div className="bg-[#FAF8F5] px-6 pt-14 pb-10">
      <div className="max-w-screen-xl mx-auto">
        {/* Eyebrow chip */}
        {locationLabel && (
          <div className="inline-flex items-center gap-2 bg-white border border-navy/[0.08] rounded-full px-4 py-1.5 mb-5 shadow-sm">
            <span className="text-[10px]" aria-hidden>📍</span>
            <span className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy/55">
              {locationLabel}
            </span>
          </div>
        )}

        <h1 className="font-display text-[clamp(32px,4.5vw,56px)] text-navy leading-[1.08] max-w-2xl">
          {locationContext.source === 'none'
            ? 'Discover local businesses'
            : 'What\'s near you'}
        </h1>

        <p className="mt-3 text-[16px] leading-relaxed text-navy/55 max-w-lg">
          Exclusive vouchers from local businesses — redeemable in-store with your Redeemo subscription.
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create apps/customer-web/components/discover/CategoryFilterBar.tsx**

Horizontally scrollable pill row of category filters. Clicking a category navigates to `/search?categoryId=`. Client Component.

```typescript
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'

type Category = { id: string; name: string }

export function CategoryFilterBar({ categories }: { categories: Category[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const active = searchParams.get('categoryId')

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.15 }}
      className="overflow-x-auto scrollbar-none bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10"
    >
      <div className="flex gap-2 px-6 py-3" style={{ width: 'max-content' }}>
        {/* "All" pill */}
        <button
          onClick={() => router.push('/discover')}
          className={`font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full border transition-colors flex-shrink-0 ${
            !active
              ? 'bg-navy text-white border-navy'
              : 'bg-white text-navy/55 border-navy/[0.12] hover:border-navy/30'
          }`}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat.id}
            onClick={() => router.push(`/discover?categoryId=${cat.id}`)}
            className={`font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full border transition-colors flex-shrink-0 ${
              active === cat.id
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-navy/55 border-navy/[0.12] hover:border-navy/30'
            }`}
          >
            {cat.name}
          </button>
        ))}
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 6: Create apps/customer-web/components/ui/FilterDrawer.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine this component. Filter drawers have many interactive states (open/close, active filters, clear button) that are faster to nail visually.
> Prompt hint: `"Filter drawer panel, slides in from right on mobile, sticky sidebar on desktop lg:, contains: sort dropdown (relevance/nearest/top_rated/highest_saving), voucher type multi-select checkboxes (BOGO/Discount/Freebie/Package/TimeLimited/Reusable), clear all filters button, apply button, close X button top-right, white background, navy text, red accent, Tailwind CSS"`

The drawer accepts current filter state and emits `onFiltersChange`. It is a pure UI component — the parent page owns filter state and updates the URL search params.

```typescript
'use client'
import { motion, AnimatePresence } from 'framer-motion'
import { useEffect } from 'react'

export type FilterState = {
  sortBy: 'relevance' | 'nearest' | 'top_rated' | 'highest_saving'
  voucherTypes: string[]
  openNow: boolean
}

type Props = {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onFiltersChange: (filters: FilterState) => void
}

const SORT_OPTIONS: { value: FilterState['sortBy']; label: string }[] = [
  { value: 'relevance',      label: 'Best match' },
  { value: 'nearest',        label: 'Nearest first' },
  { value: 'top_rated',      label: 'Top rated' },
  { value: 'highest_saving', label: 'Highest saving' },
]

const VOUCHER_TYPES = ['BOGO', 'DISCOUNT', 'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE']
const VOUCHER_TYPE_LABELS: Record<string, string> = {
  BOGO: 'Buy one get one', DISCOUNT: 'Discount', FREEBIE: 'Freebie',
  PACKAGE_DEAL: 'Package deal', TIME_LIMITED: 'Time limited', REUSABLE: 'Reusable',
}

export function FilterDrawer({ isOpen, onClose, filters, onFiltersChange }: Props) {
  // Lock body scroll when drawer is open on mobile
  useEffect(() => {
    document.body.style.overflow = isOpen ? 'hidden' : ''
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  const toggleVoucherType = (type: string) => {
    const next = filters.voucherTypes.includes(type)
      ? filters.voucherTypes.filter(t => t !== type)
      : [...filters.voucherTypes, type]
    onFiltersChange({ ...filters, voucherTypes: next })
  }

  const hasActiveFilters =
    filters.sortBy !== 'relevance' ||
    filters.voucherTypes.length > 0 ||
    filters.openNow

  return (
    <>
      {/* Mobile backdrop */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/40 z-40 lg:hidden"
          />
        )}
      </AnimatePresence>

      {/* Drawer panel */}
      <AnimatePresence>
        {isOpen && (
          <motion.aside
            key="drawer"
            initial={{ x: 320 }}
            animate={{ x: 0 }}
            exit={{ x: 320 }}
            transition={{ type: 'spring', damping: 28, stiffness: 260 }}
            className="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-50 flex flex-col lg:hidden"
          >
            <DrawerContent
              filters={filters}
              onFiltersChange={onFiltersChange}
              onClose={onClose}
              hasActiveFilters={hasActiveFilters}
              toggleVoucherType={toggleVoucherType}
            />
          </motion.aside>
        )}
      </AnimatePresence>

      {/* Desktop sticky sidebar — always visible, no animation needed */}
      <aside className="hidden lg:flex flex-col w-64 flex-shrink-0 sticky top-24 self-start">
        <DrawerContent
          filters={filters}
          onFiltersChange={onFiltersChange}
          onClose={onClose}
          hasActiveFilters={hasActiveFilters}
          toggleVoucherType={toggleVoucherType}
          isDesktop
        />
      </aside>
    </>
  )
}

function DrawerContent({
  filters, onFiltersChange, onClose, hasActiveFilters, toggleVoucherType, isDesktop = false,
}: {
  filters: FilterState
  onFiltersChange: (f: FilterState) => void
  onClose: () => void
  hasActiveFilters: boolean
  toggleVoucherType: (t: string) => void
  isDesktop?: boolean
}) {
  return (
    <div className="flex flex-col h-full overflow-y-auto p-6 gap-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="font-display text-[20px] text-navy">Filters</h2>
        <div className="flex items-center gap-3">
          {hasActiveFilters && (
            <button
              onClick={() => onFiltersChange({ sortBy: 'relevance', voucherTypes: [], openNow: false })}
              className="font-mono text-[11px] tracking-wide text-red underline"
            >
              Clear all
            </button>
          )}
          {!isDesktop && (
            <button onClick={onClose} className="text-navy/40 hover:text-navy text-xl" aria-label="Close filters">
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Sort */}
      <div>
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Sort by</p>
        <div className="flex flex-col gap-2">
          {SORT_OPTIONS.map(opt => (
            <button
              key={opt.value}
              onClick={() => onFiltersChange({ ...filters, sortBy: opt.value })}
              className={`text-left text-[14px] px-4 py-2.5 rounded-xl border transition-colors ${
                filters.sortBy === opt.value
                  ? 'bg-navy text-white border-navy'
                  : 'text-navy/70 border-navy/[0.1] hover:border-navy/25'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      {/* Voucher types */}
      <div>
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Voucher type</p>
        <div className="flex flex-col gap-2">
          {VOUCHER_TYPES.map(type => {
            const checked = filters.voucherTypes.includes(type)
            return (
              <label key={type} className="flex items-center gap-3 cursor-pointer group">
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
                    checked ? 'bg-red border-red' : 'border-navy/20 group-hover:border-navy/40'
                  }`}
                  onClick={() => toggleVoucherType(type)}
                >
                  {checked && <span className="text-white text-[11px]">✓</span>}
                </span>
                <span className="text-[14px] text-navy/70">{VOUCHER_TYPE_LABELS[type]}</span>
              </label>
            )
          })}
        </div>
      </div>

      {/* Open now toggle */}
      <div className="flex items-center justify-between">
        <p className="text-[14px] text-navy/70">Open now</p>
        <button
          onClick={() => onFiltersChange({ ...filters, openNow: !filters.openNow })}
          className={`relative w-11 h-6 rounded-full transition-colors ${filters.openNow ? 'bg-red' : 'bg-navy/15'}`}
        >
          <span
            className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
              filters.openNow ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Create apps/customer-web/components/search/SearchBar.tsx**

Top search bar for `/search`. Controlled input with debounce. Shows filter button with active-filter count badge.

```typescript
'use client'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'

type Props = {
  activeFilterCount: number
  onFilterToggle: () => void
}

export function SearchBar({ activeFilterCount, onFilterToggle }: Props) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [value, setValue] = useState(searchParams.get('q') ?? '')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      const params = new URLSearchParams(searchParams.toString())
      if (value) {
        params.set('q', value)
      } else {
        params.delete('q')
      }
      params.delete('offset')
      router.push(`/search?${params.toString()}`)
    }, 350)
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current) }
  }, [value]) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex items-center gap-3 px-6 py-4 bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10">
      {/* Search input */}
      <div className="relative flex-1">
        <span className="absolute left-4 top-1/2 -translate-y-1/2 text-navy/30 text-[16px]" aria-hidden>
          🔍
        </span>
        <input
          type="search"
          value={value}
          onChange={e => setValue(e.target.value)}
          placeholder="Search businesses, categories…"
          className="w-full bg-white border border-navy/[0.1] rounded-xl pl-10 pr-4 py-3 text-[15px] text-navy placeholder:text-navy/30 focus:outline-none focus:border-navy/30 focus:ring-2 focus:ring-navy/[0.08] transition"
        />
      </div>

      {/* Filter toggle button */}
      <button
        onClick={onFilterToggle}
        className="relative flex items-center gap-2 bg-white border border-navy/[0.1] rounded-xl px-4 py-3 text-[14px] text-navy/70 hover:border-navy/25 transition-colors flex-shrink-0"
      >
        <span aria-hidden>⚙</span>
        Filters
        {activeFilterCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full bg-red text-white text-[10px] font-bold flex items-center justify-center">
            {activeFilterCount}
          </span>
        )}
      </button>
    </div>
  )
}
```

- [ ] **Step 8: Create apps/customer-web/components/search/SearchResults.tsx**

Grid of `MerchantTile` cards. Receives `results: MerchantTile[]` from parent, manages favourite state.

```typescript
'use client'
import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { MerchantTile, type MerchantTile as MerchantTileType } from '@/components/ui/MerchantTile'
import { apiFetch } from '@/lib/api'

type Props = {
  results: MerchantTileType[]
  total: number
  hasMore: boolean
  onLoadMore: () => void
  isLoading: boolean
}

export function SearchResults({ results, total, hasMore, onLoadMore, isLoading }: Props) {
  const [favourites, setFavourites] = useState<Set<string>>(
    new Set(results.filter(m => m.isFavourited).map(m => m.id)),
  )

  const handleFavouriteToggle = useCallback(async (merchantId: string) => {
    const isFav = favourites.has(merchantId)
    setFavourites(prev => {
      const next = new Set(prev)
      isFav ? next.delete(merchantId) : next.add(merchantId)
      return next
    })
    try {
      await apiFetch(
        `/api/v1/customer/favourites/merchants/${merchantId}`,
        { method: isFav ? 'DELETE' : 'POST', auth: true },
      )
    } catch {
      setFavourites(prev => {
        const next = new Set(prev)
        isFav ? next.add(merchantId) : next.delete(merchantId)
        return next
      })
    }
  }, [favourites])

  if (results.length === 0 && !isLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
        <span className="text-5xl mb-4" aria-hidden>🔍</span>
        <h3 className="font-display text-[24px] text-navy mb-2">No results found</h3>
        <p className="text-[15px] text-navy/50 max-w-sm">
          Try adjusting your search term or removing some filters.
        </p>
      </div>
    )
  }

  return (
    <div className="flex-1 px-6 py-6">
      {/* Result count */}
      <p className="font-mono text-[12px] tracking-wide text-navy/40 mb-5">
        {total} {total === 1 ? 'result' : 'results'}
      </p>

      {/* Grid */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
        initial="hidden"
        animate="visible"
        variants={{
          hidden: {},
          visible: { transition: { staggerChildren: 0.06 } },
        }}
      >
        {results.map((m, i) => (
          <motion.div
            key={m.id}
            variants={{
              hidden: { opacity: 0, y: 20 },
              visible: { opacity: 1, y: 0, transition: { duration: 0.4 } },
            }}
          >
            <MerchantTile
              merchant={{ ...m, isFavourited: favourites.has(m.id) }}
              onFavouriteToggle={handleFavouriteToggle}
              index={i}
            />
          </motion.div>
        ))}
      </motion.div>

      {/* Load more */}
      {hasMore && (
        <div className="mt-10 flex justify-center">
          <button
            onClick={onLoadMore}
            disabled={isLoading}
            className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy/55 border border-navy/[0.15] rounded-xl px-8 py-3 hover:border-navy/30 transition-colors disabled:opacity-50"
          >
            {isLoading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
```

**Note on MerchantTile width in grid:** In `SearchResults`, the tile is inside a grid cell (not a flex row), so remove the fixed `w-[220px]` constraint. Add a `variant="grid"` prop to `MerchantTile` that sets `w-full` instead of `w-[220px]`. Update `MerchantTile.tsx` accordingly:

```typescript
// Add to MerchantTile props:
type Props = {
  merchant: MerchantTile
  onFavouriteToggle?: (id: string) => void
  index?: number
  variant?: 'rail' | 'grid'   // 'rail' = fixed width, 'grid' = w-full
}

// Update the className on the outer div:
className={`group relative flex flex-col bg-white rounded-2xl overflow-hidden border border-navy/[0.06] shadow-sm hover:shadow-md transition-shadow ${
  variant === 'grid' ? 'w-full' : 'flex-shrink-0 w-[220px] sm:w-[240px]'
}`}
```

- [ ] **Step 9: Assemble apps/customer-web/app/discover/page.tsx**

This is a **Server Component**. It fetches home feed data server-side (no loading state on initial render). Categories are fetched in parallel. A `CategoryFilterBar` below the hero handles client-side navigation to filtered views.

```typescript
import type { Metadata } from 'next'
import { discoveryApi } from '@/lib/api'
import { DiscoverHero } from '@/components/discover/DiscoverHero'
import { CampaignBanner } from '@/components/discover/CampaignBanner'
import { CategoryFilterBar } from '@/components/discover/CategoryFilterBar'
import { MerchantRow } from '@/components/discover/MerchantRow'

export const metadata: Metadata = {
  title: 'Discover',
  description: 'Discover local businesses and exclusive vouchers near you.',
}

// No revalidation time set — revalidate on each request in development.
// For production, consider adding: export const revalidate = 60
export default async function DiscoverPage({
  searchParams,
}: {
  searchParams: { lat?: string; lng?: string; categoryId?: string }
}) {
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

  // Fetch home feed + categories in parallel
  const [feed, categoriesResult] = await Promise.allSettled([
    discoveryApi.homeFeed({ lat, lng }),
    discoveryApi.categories(),
  ])

  const feedData = feed.status === 'fulfilled' ? feed.value : null
  const categories = categoriesResult.status === 'fulfilled' ? categoriesResult.value.categories : []

  // If categoryId filter is active, use it to filter nearbyByCategory rows
  const activeCategory = searchParams.categoryId
  const categoryRows = feedData?.nearbyByCategory ?? []
  const filteredRows = activeCategory
    ? categoryRows.filter(row => row.category.id === activeCategory)
    : categoryRows

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <DiscoverHero locationContext={feedData?.locationContext ?? { city: null, source: 'none' }} />

      <CategoryFilterBar categories={categories} />

      {/* Campaign banners */}
      {feedData?.campaigns && feedData.campaigns.length > 0 && (
        <div className="pt-6">
          <CampaignBanner campaigns={feedData.campaigns} />
        </div>
      )}

      {/* Merchant rows */}
      <div className="flex flex-col gap-8 py-8">
        {/* Featured row */}
        {!activeCategory && feedData?.featured && feedData.featured.length > 0 && (
          <MerchantRow
            title="Featured near you"
            subtitle={`${feedData.featured.length} merchants`}
            merchants={feedData.featured}
          />
        )}

        {/* Trending row */}
        {!activeCategory && feedData?.trending && feedData.trending.length > 0 && (
          <MerchantRow
            title="Trending this month"
            merchants={feedData.trending}
          />
        )}

        {/* Category rows */}
        {filteredRows.map(row => (
          <MerchantRow
            key={row.category.id}
            title={row.category.name}
            subtitle={`${row.merchants.length} merchants`}
            merchants={row.merchants}
          />
        ))}

        {/* Empty state */}
        {filteredRows.length === 0 && !feedData?.featured?.length && !feedData?.trending?.length && (
          <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
            <span className="text-5xl mb-4" aria-hidden>🏪</span>
            <h2 className="font-display text-[28px] text-navy mb-2">No merchants near you yet</h2>
            <p className="text-[15px] text-navy/50 max-w-sm">
              We're growing — check back soon, or browse all merchants below.
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
```

**Note on `discoveryApi`:** Uses `discoveryApi.homeFeed({ lat, lng })` and `discoveryApi.categories()` — method names match `lib/api.ts` (Task 2) exactly. `homeFeed` accepts optional `lat`/`lng`; `categories` takes no params.

- [ ] **Step 10: Assemble apps/customer-web/app/search/page.tsx**

Search is a Client Component page — it manages filter state and re-fetches as params change. Uses `useSearchParams` to sync state with the URL so search results are shareable/bookmarkable.

```typescript
'use client'
import { useSearchParams, useRouter } from 'next/navigation'
import { useEffect, useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import { discoveryApi } from '@/lib/api'
import { SearchBar } from '@/components/search/SearchBar'
import { SearchResults } from '@/components/search/SearchResults'
import { FilterDrawer, type FilterState } from '@/components/ui/FilterDrawer'
import type { MerchantTile } from '@/components/ui/MerchantTile'

const DEFAULT_FILTERS: FilterState = {
  sortBy: 'relevance',
  voucherTypes: [],
  openNow: false,
}

const PAGE_SIZE = 20

export default function SearchPage() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [results, setResults] = useState<MerchantTile[]>([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [isLoading, setIsLoading] = useState(false)
  const [filterOpen, setFilterOpen] = useState(false)

  const [filters, setFilters] = useState<FilterState>(DEFAULT_FILTERS)

  const q = searchParams.get('q') ?? ''
  const categoryId = searchParams.get('categoryId') ?? undefined

  const activeFilterCount = [
    filters.sortBy !== 'relevance',
    filters.voucherTypes.length > 0,
    filters.openNow,
  ].filter(Boolean).length

  const fetchResults = useCallback(async (reset = true) => {
    setIsLoading(true)
    const currentOffset = reset ? 0 : offset
    try {
      const data = await discoveryApi.search({
        q: q || undefined,
        categoryId,
        sortBy: filters.sortBy,
        voucherTypes: filters.voucherTypes.length > 0 ? filters.voucherTypes : undefined,
        openNow: filters.openNow || undefined,
        limit: PAGE_SIZE,
        offset: currentOffset,
      })
      if (reset) {
        setResults(data.results)
        setOffset(PAGE_SIZE)
      } else {
        setResults(prev => [...prev, ...data.results])
        setOffset(o => o + PAGE_SIZE)
      }
      setTotal(data.total)
    } finally {
      setIsLoading(false)
    }
  }, [q, categoryId, filters, offset])

  // Re-fetch on q, categoryId, or filter changes
  useEffect(() => {
    fetchResults(true)
  }, [q, categoryId, filters]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleFiltersChange = (next: FilterState) => {
    setFilters(next)
    setFilterOpen(false)
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <SearchBar
        activeFilterCount={activeFilterCount}
        onFilterToggle={() => setFilterOpen(o => !o)}
      />

      <div className="flex max-w-screen-xl mx-auto">
        {/* Filter drawer — mobile: slide-in panel; desktop: sticky sidebar */}
        <FilterDrawer
          isOpen={filterOpen}
          onClose={() => setFilterOpen(false)}
          filters={filters}
          onFiltersChange={handleFiltersChange}
        />

        <SearchResults
          results={results}
          total={total}
          hasMore={results.length < total}
          onLoadMore={() => fetchResults(false)}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
```

**Note on `discoveryApi.search`:** Verify the method name and param shape against `lib/api.ts` (Task 2). Expected:
```typescript
discoveryApi.search(params: {
  q?: string; categoryId?: string; sortBy?: string;
  voucherTypes?: string[]; openNow?: boolean; limit: number; offset: number
}): Promise<{ results: MerchantTile[]; total: number; hasMore: boolean }>
```

- [ ] **Step 11: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 12: Visually verify in browser**

Open `http://localhost:3001/discover`. Verify:
- Hero heading renders with location context chip (will show "Discover local businesses" with no seed location data — that's correct)
- Category filter bar is sticky below navbar, pills are horizontally scrollable
- Campaign banners section present (will be empty if no seed campaigns — that's correct)
- Merchant rows render if seed data has active merchants; empty state shows otherwise
- No console errors

Open `http://localhost:3001/search`. Verify:
- Search bar is sticky below navbar
- Typing in the search box debounces and triggers a results fetch (check Network tab)
- Filter button opens drawer on mobile viewport
- Desktop: filter sidebar is visible alongside results
- Empty state renders correctly when no results

- [ ] **Step 13: Commit**

```bash
git add apps/customer-web/app/discover/ apps/customer-web/app/search/ \
        apps/customer-web/components/discover/ apps/customer-web/components/search/ \
        apps/customer-web/components/ui/MerchantTile.tsx \
        apps/customer-web/components/ui/FilterDrawer.tsx
git commit -m "feat: add discover feed and search pages with MerchantTile, FilterDrawer, and campaign banners"
```

---

## Task 7: Merchant Profile Page (`/merchants/[id]`)

**Files:**
- Create: `apps/customer-web/app/merchants/[id]/page.tsx`
- Create: `apps/customer-web/components/merchant-profile/MerchantProfileHeader.tsx`
- Create: `apps/customer-web/components/merchant-profile/VoucherCard.tsx`
- Create: `apps/customer-web/components/merchant-profile/VouchersSection.tsx`
- Create: `apps/customer-web/components/merchant-profile/BranchesSection.tsx`
- Create: `apps/customer-web/components/merchant-profile/AboutSection.tsx`
- Create: `apps/customer-web/components/merchant-profile/ReviewsSection.tsx`

**Design direction — REQUIRED before writing any code:**

The merchant profile page is the most content-dense page on the website. Design language: **editorial profile** — think a local magazine feature on a business, not a CRUD detail page. Layout decisions:

- `MerchantProfileHeader`: full-bleed banner image at the top, merchant logo overlapping the banner bottom-left (circle, border-white). Below the banner: name in large Calistoga, category badge, star rating + review count, open/closed chip, distance chip, favourite heart. **Not a card** — this is a page header region.
- `VoucherCard`: Each voucher is a horizontal card. Left: voucher type badge (`BOGO`, `DISCOUNT`, etc.) in DM Mono + coloured accent. Right: title, description excerpt, saving chip, terms. On website: shows "Redeem in the app" (not a redeem button). Framer Motion `whileInView` stagger.
- `BranchesSection`: If multiple branches, shows each as a row with address, phone, open/closed status, and distance. If single branch: shows inline below the header without a separate section heading.
- `AboutSection`: merchant description text, website link, amenities as pill chips. Warm-grey background panel.
- `ReviewsSection`: list of up to 5 recent reviews with `displayName` (backend-computed, defaults to "Anonymous"), date, star rating, `comment` text, and a "Verified" badge when `isVerified: true`. "Read more reviews" is out of scope.
- Page tab structure (mobile): sticky tab bar below header — "Vouchers", "About", "Branches". Smooth scroll to section anchors. Desktop: single-column scroll, no tabs.

**Backend data shape (verified from `getCustomerMerchant` in service.ts):**
```typescript
type MerchantProfile = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  bannerUrl: string | null
  description: string | null   // = about field
  websiteUrl: string | null
  phone: string | null
  email: string | null
  primaryCategory: { id: string; name: string; pinColour: string | null } | null
  subcategory: { id: string; name: string } | null
  avgRating: number | null
  reviewCount: number
  isFavourited: boolean
  isOpenNow: boolean
  distance: number | null
  nearestBranchId: string | null
  openingHours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[]
  amenities: { id: string; name: string; iconUrl: string | null }[]
  photos: string[]
  vouchers: {
    id: string; title: string; type: string; description: string | null
    terms: string | null; imageUrl: string | null; estimatedSaving: unknown; expiryDate: Date | null
  }[]
  branches: {
    id: string; name: string; isOpenNow: boolean; avgRating: number | null; reviewCount: number
    addressLine1: string; addressLine2: string | null; city: string; postcode: string
    phone: string | null; email: string | null
    latitude: number | null; longitude: number | null; distance: number | null
  }[]
}
```

**ReviewsSection note:** Endpoint is `GET /api/v1/customer/merchants/:id/reviews` (verified). Response field is `comment` (not `body`). `displayName` is a flat string on the review object (not nested under `reviewer`). Step 1 (reading the routes file) is now pre-verified — executor can proceed directly to Step 2.

**Framer Motion — REQUIRED:**
- `MerchantProfileHeader`: banner image fades in `opacity: 0 → 1` on mount with a subtle `scale: 1.03 → 1` (Ken Burns lite)
- `VoucherCard` stagger: each card `whileInView`, `delay: i * 0.1`, `y: 20 → 0`
- `AboutSection`: `whileInView opacity: 0 → 1`
- `ReviewsSection`: each review `whileInView`, stagger `delay: i * 0.08`

---

- [ ] **Step 1: Read src/api/customer/reviews/routes.ts**

Read the reviews routes file to verify the exact endpoint URL, query parameters, and response shape before writing `ReviewsSection`.

```bash
# Read the file — use the Read tool, not cat
# Expected: GET /api/v1/customer/reviews with branchId or merchantId param
```

Record the exact endpoint, params, and response shape here before proceeding to Step 5.

- [ ] **Step 2: Create apps/customer-web/components/merchant-profile/MerchantProfileHeader.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine this header visually. The banner + logo overlap + rating + chips layout benefits from visual iteration before committing.
> Prompt hint: `"Merchant profile page header, full-bleed banner image with Ken Burns subtle scale animation, merchant logo circle 80px overlapping banner bottom-left with white border and shadow, below banner: merchant name in large display font, category badge pill, star rating, open/closed status chip, distance label, heart favourite button top-right of banner, warm cream background below banner, Tailwind CSS, navy and red brand colors"`

```typescript
'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'
import { useState } from 'react'
import { apiFetch } from '@/lib/api'

type Props = {
  merchant: {
    id: string
    businessName: string
    tradingName: string | null
    logoUrl: string | null
    bannerUrl: string | null
    primaryCategory: { name: string } | null
    avgRating: number | null
    reviewCount: number
    isFavourited: boolean
    isOpenNow: boolean
    distance: number | null
  }
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m away`
  return `${(metres / 1000).toFixed(1)}mi away`
}

export function MerchantProfileHeader({ merchant }: Props) {
  const [isFavourited, setIsFavourited] = useState(merchant.isFavourited)
  const displayName = merchant.tradingName ?? merchant.businessName
  const dist = formatDistance(merchant.distance)

  const toggleFavourite = async () => {
    const prev = isFavourited
    setIsFavourited(!prev)
    try {
      await apiFetch(
        `/api/v1/customer/favourites/merchants/${merchant.id}`,
        { method: prev ? 'DELETE' : 'POST', auth: true },
      )
    } catch {
      setIsFavourited(prev)
    }
  }

  return (
    <div className="bg-[#FAF8F5]">
      {/* Banner */}
      <div className="relative h-[220px] md:h-[300px] overflow-hidden bg-navy/10">
        {merchant.bannerUrl ? (
          <motion.div
            className="absolute inset-0"
            initial={{ opacity: 0, scale: 1.04 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.9, ease: 'easeOut' }}
          >
            <Image
              src={merchant.bannerUrl}
              alt=""
              fill
              className="object-cover"
              sizes="100vw"
              priority
            />
          </motion.div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-navy/30 to-navy/10" />
        )}

        {/* Favourite button — top right */}
        <button
          onClick={toggleFavourite}
          className="absolute top-4 right-4 w-10 h-10 rounded-full bg-white/90 backdrop-blur-sm flex items-center justify-center shadow-md hover:bg-white transition-colors"
          aria-label={isFavourited ? 'Remove from favourites' : 'Add to favourites'}
        >
          <span className="text-[17px]" aria-hidden>
            {isFavourited ? '❤️' : '🤍'}
          </span>
        </button>
      </div>

      {/* Info area — logo overlaps banner */}
      <div className="relative px-6 pb-6 max-w-screen-xl mx-auto">
        {/* Logo — absolute positioned to straddle banner/info boundary */}
        {merchant.logoUrl && (
          <div className="absolute -top-10 left-6 w-[72px] h-[72px] rounded-full border-4 border-white shadow-lg overflow-hidden bg-white">
            <Image src={merchant.logoUrl} alt={displayName} fill className="object-cover" sizes="72px" />
          </div>
        )}

        {/* Spacer to push content below logo */}
        <div className={merchant.logoUrl ? 'pt-[52px]' : 'pt-5'}>
          {/* Category badge */}
          {merchant.primaryCategory && (
            <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-orange-red block mb-1">
              {merchant.primaryCategory.name}
            </span>
          )}

          {/* Name */}
          <h1 className="font-display text-[clamp(26px,4vw,40px)] text-navy leading-[1.08] mb-3">
            {displayName}
          </h1>

          {/* Chips row */}
          <div className="flex flex-wrap items-center gap-2 text-[13px]">
            {/* Rating */}
            {merchant.avgRating !== null && (
              <span className="flex items-center gap-1 text-navy/70">
                <span className="text-amber-500">★</span>
                {merchant.avgRating.toFixed(1)}
                <span className="text-navy/35">({merchant.reviewCount})</span>
              </span>
            )}

            {/* Open / Closed */}
            <span
              className={`font-mono text-[11px] tracking-wide px-3 py-1 rounded-full ${
                merchant.isOpenNow
                  ? 'bg-green-50 text-green-700 border border-green-200'
                  : 'bg-red/[0.07] text-red border border-red/20'
              }`}
            >
              {merchant.isOpenNow ? 'Open now' : 'Closed'}
            </span>

            {/* Distance */}
            {dist && (
              <span className="font-mono text-[11px] text-navy/40">{dist}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/components/merchant-profile/VoucherCard.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine the voucher card visually. The type badge colour coding, saving chip, and "Redeem in the app" CTA layout benefits from visual iteration.
> Prompt hint: `"Voucher card horizontal layout, left accent bar with voucher type badge (BOGO/DISCOUNT/FREEBIE etc.) in mono font, right: voucher title in display font, short description, saving chip 'Save up to £X', terms text small, 'Redeem in the Redeemo app' CTA label (no button — website only), white card with subtle border, navy and red brand colors, Tailwind CSS"`

```typescript
'use client'
import { motion } from 'framer-motion'

type Voucher = {
  id: string
  title: string
  type: string
  description: string | null
  terms: string | null
  imageUrl: string | null
  estimatedSaving: unknown
  expiryDate: Date | null
}

const TYPE_LABELS: Record<string, string> = {
  BOGO: 'BOGO', DISCOUNT: 'Discount', FREEBIE: 'Freebie',
  PACKAGE_DEAL: 'Package', TIME_LIMITED: 'Time Limited', REUSABLE: 'Reusable',
  SPEND_AND_SAVE: 'Spend & Save',
}

const TYPE_COLOURS: Record<string, string> = {
  BOGO: 'bg-purple-50 text-purple-700 border-purple-200',
  DISCOUNT: 'bg-red/[0.07] text-red border-red/20',
  FREEBIE: 'bg-green-50 text-green-700 border-green-200',
  PACKAGE_DEAL: 'bg-blue-50 text-blue-700 border-blue-200',
  TIME_LIMITED: 'bg-orange-50 text-orange-700 border-orange-200',
  REUSABLE: 'bg-teal-50 text-teal-700 border-teal-200',
  SPEND_AND_SAVE: 'bg-yellow-50 text-yellow-700 border-yellow-200',
}

export function VoucherCard({ voucher, index }: { voucher: Voucher; index: number }) {
  const saving = typeof voucher.estimatedSaving === 'number' || typeof voucher.estimatedSaving === 'string'
    ? Number(voucher.estimatedSaving)
    : null

  const typeLabel = TYPE_LABELS[voucher.type] ?? voucher.type
  const typeColour = TYPE_COLOURS[voucher.type] ?? 'bg-navy/[0.05] text-navy/60 border-navy/10'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.1 }}
      className="bg-white border border-navy/[0.08] rounded-2xl p-5 flex gap-4 items-start"
    >
      {/* Left: type badge */}
      <div className="flex-shrink-0 pt-0.5">
        <span className={`font-mono text-[10px] tracking-[0.1em] uppercase px-2.5 py-1 rounded-full border ${typeColour}`}>
          {typeLabel}
        </span>
      </div>

      {/* Right: content */}
      <div className="flex-1 min-w-0">
        <h3 className="font-display text-[18px] text-navy leading-snug mb-1.5">
          {voucher.title}
        </h3>

        {voucher.description && (
          <p className="text-[13px] leading-relaxed text-navy/55 mb-2 line-clamp-2">
            {voucher.description}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {saving !== null && !isNaN(saving) && saving > 0 && (
            <span className="text-[12px] font-semibold text-red bg-red/[0.07] px-2.5 py-0.5 rounded-full border border-red/15">
              Save up to £{saving.toFixed(0)}
            </span>
          )}

          {voucher.expiryDate && (
            <span className="font-mono text-[11px] text-navy/35">
              Expires {new Date(voucher.expiryDate).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
        </div>

        {voucher.terms && (
          <p className="text-[11px] text-navy/35 mt-2 leading-relaxed line-clamp-1">
            T&Cs: {voucher.terms}
          </p>
        )}

        {/* Website-only redeem message — no button */}
        <p className="mt-3 text-[12px] font-mono text-orange-red tracking-wide">
          📱 Redeem in the Redeemo app
        </p>
      </div>
    </motion.div>
  )
}
```

- [ ] **Step 4: Create apps/customer-web/components/merchant-profile/VouchersSection.tsx**

```typescript
import { VoucherCard } from './VoucherCard'

type Voucher = {
  id: string; title: string; type: string; description: string | null
  terms: string | null; imageUrl: string | null; estimatedSaving: unknown; expiryDate: Date | null
}

export function VouchersSection({ vouchers }: { vouchers: Voucher[] }) {
  if (vouchers.length === 0) {
    return (
      <section id="vouchers" className="px-6 py-10">
        <h2 className="font-display text-[22px] text-navy mb-6">Vouchers</h2>
        <p className="text-[14px] text-navy/45">No active vouchers at the moment.</p>
      </section>
    )
  }

  return (
    <section id="vouchers" className="px-6 py-10">
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="font-display text-[22px] text-navy">Vouchers</h2>
        <span className="font-mono text-[11px] text-navy/35 tracking-wide">
          {vouchers.length} available
        </span>
      </div>
      <div className="flex flex-col gap-4 max-w-2xl">
        {vouchers.map((v, i) => (
          <VoucherCard key={v.id} voucher={v} index={i} />
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 5: Create apps/customer-web/components/merchant-profile/BranchesSection.tsx**

```typescript
type Branch = {
  id: string; name: string; isOpenNow: boolean
  addressLine1: string; addressLine2: string | null; city: string; postcode: string
  phone: string | null; distance: number | null; avgRating: number | null; reviewCount: number
}

function formatDistance(metres: number | null): string | null {
  if (metres === null) return null
  if (metres < 1000) return `${Math.round(metres)}m`
  return `${(metres / 1000).toFixed(1)}mi`
}

export function BranchesSection({ branches }: { branches: Branch[] }) {
  if (branches.length === 0) return null

  // Single branch: show inline without full section header (handled by parent page)
  // Multiple branches: full section with each branch as a card
  return (
    <section id="branches" className="px-6 py-10 border-t border-navy/[0.06]">
      <h2 className="font-display text-[22px] text-navy mb-6">
        {branches.length === 1 ? 'Location' : `${branches.length} Locations`}
      </h2>

      <div className="flex flex-col gap-4 max-w-2xl">
        {branches.map(branch => {
          const dist = formatDistance(branch.distance)
          const address = [branch.addressLine1, branch.addressLine2, branch.city, branch.postcode]
            .filter(Boolean).join(', ')

          return (
            <div
              key={branch.id}
              className="bg-white border border-navy/[0.08] rounded-2xl p-5 flex items-start justify-between gap-4"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="font-display text-[16px] text-navy">{branch.name}</span>
                  <span
                    className={`font-mono text-[10px] tracking-wide px-2.5 py-0.5 rounded-full ${
                      branch.isOpenNow
                        ? 'bg-green-50 text-green-700'
                        : 'bg-red/[0.07] text-red'
                    }`}
                  >
                    {branch.isOpenNow ? 'Open' : 'Closed'}
                  </span>
                </div>
                <p className="text-[13px] text-navy/55 leading-relaxed">{address}</p>
                {branch.phone && (
                  <a href={`tel:${branch.phone}`} className="text-[13px] text-navy/45 hover:text-navy mt-1 block">
                    {branch.phone}
                  </a>
                )}
                {branch.avgRating !== null && (
                  <span className="text-[12px] text-navy/40 mt-1 block">
                    ★ {branch.avgRating.toFixed(1)} ({branch.reviewCount} reviews)
                  </span>
                )}
              </div>
              {dist && (
                <span className="font-mono text-[12px] text-navy/35 flex-shrink-0">{dist}</span>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
```

- [ ] **Step 6: Create apps/customer-web/components/merchant-profile/AboutSection.tsx**

```typescript
'use client'
import { motion } from 'framer-motion'

type Amenity = { id: string; name: string; iconUrl: string | null }

type Props = {
  about: string | null
  websiteUrl: string | null
  amenities: Amenity[]
  openingHours: { dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[]
}

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function AboutSection({ about, websiteUrl, amenities, openingHours }: Props) {
  const hasContent = about || websiteUrl || amenities.length > 0 || openingHours.length > 0
  if (!hasContent) return null

  return (
    <motion.section
      id="about"
      initial={{ opacity: 0 }}
      whileInView={{ opacity: 1 }}
      viewport={{ once: true }}
      transition={{ duration: 0.5 }}
      className="bg-[#F4F2EF] px-6 py-10 border-t border-navy/[0.06]"
    >
      <h2 className="font-display text-[22px] text-navy mb-6">About</h2>

      <div className="max-w-2xl flex flex-col gap-6">
        {about && (
          <p className="text-[15px] leading-[1.8] text-navy/65">{about}</p>
        )}

        {websiteUrl && (
          <a
            href={websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-[14px] text-red hover:underline font-medium"
          >
            <span aria-hidden>🌐</span>
            Visit website
          </a>
        )}

        {amenities.length > 0 && (
          <div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Amenities</p>
            <div className="flex flex-wrap gap-2">
              {amenities.map(a => (
                <span
                  key={a.id}
                  className="text-[13px] text-navy/65 bg-white border border-navy/[0.08] rounded-full px-3 py-1"
                >
                  {a.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {openingHours.length > 0 && (
          <div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/40 mb-3">Opening hours</p>
            <div className="flex flex-col gap-1.5">
              {openingHours.map(h => (
                <div key={h.dayOfWeek} className="flex justify-between text-[13px]">
                  <span className="text-navy/60">{DAY_NAMES[h.dayOfWeek]}</span>
                  <span className="font-mono text-navy/45">
                    {h.isClosed ? 'Closed' : `${h.openTime} – ${h.closeTime}`}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.section>
  )
}
```

- [ ] **Step 7: Create apps/customer-web/components/merchant-profile/ReviewsSection.tsx**

**Endpoint and response shape — verified against `src/api/customer/reviews/routes.ts` and `reviews/service.ts`:**
- `GET /api/v1/customer/merchants/:id/reviews?limit=5&offset=0`
- Response: `{ reviews: { id, rating, comment, displayName, branchId, branchName, isVerified, isOwnReview, createdAt, updatedAt }[], total: number }`

Note: the field is `comment` (not `body`), and `displayName` is a flat top-level string (not nested under `reviewer`). The backend builds `displayName` from `firstName + lastName` and defaults to `"Anonymous"` — no need to null-coalesce on the frontend.

```typescript
'use client'
import { motion } from 'framer-motion'
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api'

type Review = {
  id: string
  rating: number
  comment: string | null   // backend field name — NOT body
  displayName: string      // flat field — backend always returns a string (defaults to "Anonymous")
  branchId: string
  branchName: string
  isVerified: boolean
  isOwnReview: boolean
  createdAt: string
  updatedAt: string
}

type Props = {
  merchantId: string
  avgRating: number | null
  reviewCount: number
}

function StarRating({ rating }: { rating: number }) {
  return (
    <span className="text-[14px]" aria-label={`${rating} out of 5 stars`}>
      {[1,2,3,4,5].map(n => (
        <span key={n} className={n <= rating ? 'text-amber-500' : 'text-navy/15'}>★</span>
      ))}
    </span>
  )
}

export function ReviewsSection({ merchantId, avgRating, reviewCount }: Props) {
  const [reviews, setReviews] = useState<Review[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    apiFetch<{ reviews: Review[]; total: number }>(
      `/api/v1/customer/merchants/${merchantId}/reviews?limit=5&offset=0`,
    ).then(data => {
      setReviews(data.reviews)
      setLoaded(true)
    }).catch(() => setLoaded(true))
  }, [merchantId])

  if (reviewCount === 0) return null

  return (
    <section id="reviews" className="px-6 py-10 border-t border-navy/[0.06]">
      <div className="flex items-baseline gap-3 mb-6">
        <h2 className="font-display text-[22px] text-navy">Reviews</h2>
        {avgRating !== null && (
          <span className="font-mono text-[12px] text-navy/40">
            {avgRating.toFixed(1)} avg · {reviewCount} {reviewCount === 1 ? 'review' : 'reviews'}
          </span>
        )}
      </div>

      {loaded && reviews.length === 0 && (
        <p className="text-[14px] text-navy/40">No reviews yet.</p>
      )}

      <div className="flex flex-col gap-5 max-w-2xl">
        {reviews.map((review, i) => (
          <motion.div
            key={review.id}
            initial={{ opacity: 0, y: 16 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.4, delay: i * 0.08 }}
            className="bg-white border border-navy/[0.08] rounded-2xl p-5"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="font-medium text-[14px] text-navy">
                  {review.displayName}
                </span>
                <StarRating rating={review.rating} />
                {review.isVerified && (
                  <span className="font-mono text-[10px] text-green-600 tracking-wide">✓ Verified</span>
                )}
              </div>
              <span className="font-mono text-[11px] text-navy/30">
                {new Date(review.createdAt).toLocaleDateString('en-GB', {
                  day: 'numeric', month: 'short', year: 'numeric',
                })}
              </span>
            </div>
            {review.comment && (
              <p className="text-[14px] leading-relaxed text-navy/60">{review.comment}</p>
            )}
          </motion.div>
        ))}
      </div>
    </section>
  )
}
```

- [ ] **Step 8: Assemble apps/customer-web/app/merchants/[id]/page.tsx**

Server Component — fetches merchant data at request time. Reviews load client-side in `ReviewsSection`.

```typescript
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import Link from 'next/link'
import { discoveryApi } from '@/lib/api'
import { MerchantProfileHeader } from '@/components/merchant-profile/MerchantProfileHeader'
import { VouchersSection } from '@/components/merchant-profile/VouchersSection'
import { BranchesSection } from '@/components/merchant-profile/BranchesSection'
import { AboutSection } from '@/components/merchant-profile/AboutSection'
import { ReviewsSection } from '@/components/merchant-profile/ReviewsSection'

type Props = { params: { id: string }; searchParams: { lat?: string; lng?: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  try {
    const merchant = await discoveryApi.getMerchant(params.id)
    const name = merchant.tradingName ?? merchant.businessName
    return {
      title: name,
      description: merchant.description ?? `Discover vouchers from ${name} on Redeemo.`,
    }
  } catch {
    return { title: 'Merchant' }
  }
}

export default async function MerchantProfilePage({ params, searchParams }: Props) {
  const lat = searchParams.lat ? parseFloat(searchParams.lat) : undefined
  const lng = searchParams.lng ? parseFloat(searchParams.lng) : undefined

  let merchant
  try {
    merchant = await discoveryApi.getMerchant(params.id, { lat, lng })
  } catch (err: any) {
    // True not-found (wrong ID): show generic 404
    if (err?.statusCode === 404) notFound()
    // Any other error: also 404 (avoids leaking internal errors)
    notFound()
  }

  // Spec 7.4: inactive merchant via deep link → named unavailable state, not 404
  if (merchant.status !== 'ACTIVE') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Merchant</p>
          <h1 className="font-display text-[28px] text-navy leading-tight mb-4">
            This merchant is no longer available
          </h1>
          <p className="text-[15px] text-navy/55 mb-8">
            They may have paused or removed their listing. Explore other businesses near you.
          </p>
          <Link href="/discover" className="inline-block bg-navy text-white font-medium text-[14px] px-6 py-3 rounded-xl no-underline hover:opacity-90 transition-opacity">
            Browse merchants
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <MerchantProfileHeader merchant={merchant} />

      {/* Mobile sticky tab bar — smooth scroll to sections */}
      <nav className="sticky top-[64px] z-10 bg-[#FAF8F5] border-b border-navy/[0.06] overflow-x-auto scrollbar-none lg:hidden">
        <div className="flex gap-1 px-6 py-2" style={{ width: 'max-content' }}>
          {[
            { label: 'Vouchers', href: '#vouchers' },
            { label: 'About', href: '#about' },
            { label: 'Branches', href: '#branches' },
            { label: 'Reviews', href: '#reviews' },
          ].map(tab => (
            <a
              key={tab.href}
              href={tab.href}
              className="font-mono text-[11px] tracking-[0.08em] uppercase text-navy/55 px-4 py-2 rounded-full hover:bg-navy/[0.06] hover:text-navy transition-colors whitespace-nowrap"
            >
              {tab.label}
            </a>
          ))}
        </div>
      </nav>

      {/* Page sections */}
      <div className="max-w-screen-xl mx-auto">
        <VouchersSection vouchers={merchant.vouchers} />
        <AboutSection
          about={merchant.description}
          websiteUrl={merchant.websiteUrl}
          amenities={merchant.amenities}
          openingHours={merchant.openingHours}
        />
        <BranchesSection branches={merchant.branches} />
        <ReviewsSection
          merchantId={merchant.id}
          avgRating={merchant.avgRating}
          reviewCount={merchant.reviewCount}
        />
      </div>
    </div>
  )
}
```

**Note on `discoveryApi.getMerchant`:** Method is defined in `lib/api.ts` (Task 2) as `getMerchant(id, opts?)`. The response shape includes `status` — use this to handle the inactive merchant case (see below).

- [ ] **Step 9: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 10: Visually verify in browser**

Open `http://localhost:3001/merchants/<id>` using a merchant ID from seed data (find one via `npx prisma studio` or `SELECT id FROM "Merchant" LIMIT 1`).

Verify:
- Banner image renders (or gradient placeholder if no seed banner)
- Logo overlaps banner correctly
- Merchant name, category, open/closed chip, distance (null if no location passed) render
- Favourite heart button toggles (requires logged-in user — test as guest first, confirm heart shows without crashing)
- Mobile tab bar is visible and smooth-scrolls to sections
- Voucher cards render with type badges
- "Redeem in the Redeemo app" label present — no redeem button
- About section with opening hours renders if seed data includes hours
- Branches section renders
- Reviews section: shows empty state if no seed reviews (that's correct)
- No console errors

- [ ] **Step 11: Commit**

```bash
git add apps/customer-web/app/merchants/\[id\]/ apps/customer-web/components/merchant-profile/
git commit -m "feat: add merchant profile page with vouchers, branches, about, and reviews sections"
```

---

## Task 8: Auth Pages (`/login`, `/register`)

**Files:**
- Create: `apps/customer-web/app/login/page.tsx`
- Create: `apps/customer-web/app/register/page.tsx`
- Create: `apps/customer-web/components/auth/LoginForm.tsx`
- Create: `apps/customer-web/components/auth/RegisterForm.tsx`
- Create: `apps/customer-web/components/auth/AuthShell.tsx`

**Verified backend routes:**
- `POST /api/v1/customer/auth/register` — body: `{ email, password, firstName, lastName, marketingConsent }` → `{ message: string }` (account inactive until email + phone verified)
- `POST /api/v1/customer/auth/login` — body: `{ email, password, deviceId, deviceType, deviceName? }` → `{ accessToken, refreshToken, user: { id, email, firstName } }`
- `POST /api/v1/customer/auth/forgot-password` — body: `{ email }` → `{ message }` (rate-limited: 3/hour)
- Login response shape confirmed: `{ accessToken, refreshToken, user: { id, email, firstName } }`
- Register response: returns `{ message }` only — no tokens. User must then verify email + phone before logging in.

**Registration flow note (important):** Registration does NOT return tokens. The flow is:
1. `POST /register` → `{ message: "Check your email..." }`
2. User verifies email via link (handled server-side, no web page needed in this phase)
3. User verifies phone via OTP (also deferred — requires phone verification page, out of scope for Phase 3C)
4. Once both verified, user can log in

The register form therefore shows a success state after submit — it does not redirect to an authenticated page. Show: "Check your email to verify your account. Once verified, you'll be able to log in."

**Design direction — REQUIRED:**

Auth pages use `AuthShell` — a shared two-column layout: left column is a brand panel (dark navy, large Calistoga quote, the R logomark), right column is the form. On mobile it collapses to form-only (brand panel hidden). This is the refined, luxury end of the design spectrum — not a centred card on a grey background.

- Brand panel: `bg-deep-navy`, giant Calistoga quote ("Local businesses, exclusive to you."), gradient R icon, DM Mono caption
- Form panel: `bg-[#FAF8F5]` warm cream, left-aligned heading, generous field spacing
- Inputs: `bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5` — consistent with SearchBar inputs
- Primary button: gradient red→orange-red, full-width, `py-4 text-[16px] font-bold`
- Error messages: inline below the relevant field, `text-red text-[13px]`
- Framer Motion: form fields stagger in on mount (`y: 16→0`, `delay: i * 0.07`); brand panel slides in from left (`x: -40→0`)
- The `deviceId` required by login: generate a random UUID on the client (stored in `localStorage` as `redeemo_device_id`, reused on subsequent logins). `deviceType` = `'web'`. `deviceName` = `navigator.userAgent` truncated to 100 chars.

---

- [ ] **Step 1: Create apps/customer-web/components/auth/AuthShell.tsx**

Shared two-column layout wrapper used by both login and register pages.

**Design intent:** Brand panel is atmospheric and editorial — diagonal red shard, grain noise, oversized decorative "R" in Calistoga, layered depth. Not a flat colour block. Form panel is warm cream with generous breathing room. On mobile the brand panel is hidden entirely — the form fills the screen with the horizontal logo above the heading.

```typescript
'use client'
import Image from 'next/image'
import { motion } from 'framer-motion'

type Props = {
  children: React.ReactNode
  heading: string
  subheading: string
}

export function AuthShell({ children, heading, subheading }: Props) {
  return (
    <div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
      {/* Left: brand panel — hidden on mobile */}
      <motion.div
        initial={{ opacity: 0, x: -40 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ duration: 0.7, ease: 'easeOut' }}
        className="hidden lg:flex flex-col justify-between bg-deep-navy p-16 relative overflow-hidden"
      >
        {/* Grain noise texture */}
        <svg aria-hidden className="absolute inset-0 w-full h-full opacity-[0.025] pointer-events-none">
          <filter id="auth-grain">
            <feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch" />
            <feColorMatrix type="saturate" values="0" />
          </filter>
          <rect width="100%" height="100%" filter="url(#auth-grain)" />
        </svg>

        {/* Diagonal red shard — bottom-right atmospheric accent, consistent with HeroSection */}
        <div
          aria-hidden
          className="absolute bottom-0 right-0 w-[70%] h-[60%] pointer-events-none"
          style={{ background: 'linear-gradient(135deg, transparent 40%, rgba(226,0,12,0.07) 100%)' }}
        />

        {/* Secondary warm glow — top-left */}
        <div
          aria-hidden
          className="absolute -top-24 -left-24 w-[400px] h-[400px] rounded-full pointer-events-none"
          style={{ background: 'radial-gradient(ellipse, rgba(238,105,4,0.06) 0%, transparent 70%)' }}
        />

        {/* Logo top-left */}
        <div className="relative z-10">
          <Image src="/logo-horizontal.svg" alt="Redeemo" width={140} height={36} />
        </div>

        {/* Centre: oversized R + quote */}
        <div className="relative z-10 flex flex-col gap-6">
          {/* Giant decorative R — Calistoga, opacity 0.04 */}
          <span
            aria-hidden
            className="absolute -top-20 -left-6 font-display text-[clamp(160px,20vw,260px)] leading-none text-white opacity-[0.04] pointer-events-none select-none"
          >
            R
          </span>

          <blockquote className="font-display text-[clamp(28px,3vw,44px)] text-white leading-[1.1] max-w-xs relative z-10">
            Local businesses,{' '}
            <span className="gradient-brand-text">exclusive to you.</span>
          </blockquote>
          <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-white/30">
            The UK's location-first voucher marketplace
          </p>
        </div>

        {/* Bottom */}
        <p className="font-mono text-[11px] text-white/20 relative z-10 tracking-wide">
          redeemo.co.uk
        </p>
      </motion.div>

      {/* Right: form panel */}
      <div className="flex items-center justify-center bg-[#FAF8F5] px-6 py-16 lg:px-16">
        <div className="w-full max-w-[420px]">
          {/* Mobile-only logo */}
          <div className="lg:hidden mb-10">
            <Image src="/logo-horizontal.svg" alt="Redeemo" width={120} height={32} />
          </div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
          >
            <h1 className="font-display text-[clamp(28px,3.5vw,38px)] text-navy leading-[1.08] mb-2">
              {heading}
            </h1>
            <p className="text-[15px] text-navy/50 mb-10 leading-relaxed">
              {subheading}
            </p>
          </motion.div>

          {children}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create apps/customer-web/components/auth/LoginForm.tsx**

```typescript
'use client'
import { useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { motion } from 'framer-motion'
import Link from 'next/link'
import { authApi } from '@/lib/api'
import { saveTokens } from '@/lib/auth'

function getOrCreateDeviceId(): string {
  const key = 'redeemo_device_id'
  let id = localStorage.getItem(key)
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem(key, id)
  }
  return id
}

const FIELDS = [
  { name: 'email',    label: 'Email address', type: 'email',    autoComplete: 'email' },
  { name: 'password', label: 'Password',       type: 'password', autoComplete: 'current-password' },
]

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const next = searchParams.get('next') ?? '/discover'

  const [values, setValues] = useState({ email: '', password: '' })
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      const deviceId = getOrCreateDeviceId()
      const data = await authApi.login({
        email:      values.email,
        password:   values.password,
        deviceId,
        deviceType: 'web',
        deviceName: navigator.userAgent.slice(0, 100),
      })
      saveTokens(data.accessToken, data.refreshToken)
      router.push(next)
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'ACCOUNT_NOT_ACTIVE') {
        setError('Your account isn\'t active yet. Check your email for a verification link.')
      } else if (code === 'ACCOUNT_SUSPENDED') {
        setError('Your account has been suspended. Contact support.')
      } else {
        setError('Incorrect email or password.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div className="flex flex-col gap-4 mb-6">
        {FIELDS.map((field, i) => (
          <motion.div
            key={field.name}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.07 }}
          >
            <label className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
              {field.label}
            </label>
            <input
              type={field.type}
              autoComplete={field.autoComplete}
              value={values[field.name as keyof typeof values]}
              onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
              required
              className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
            />
          </motion.div>
        ))}
      </div>

      {/* Inline error */}
      {error && (
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red text-[13px] mb-4"
        >
          {error}
        </motion.p>
      )}

      {/* Forgot password */}
      <div className="flex justify-end mb-6">
        <Link href="/forgot-password" className="text-[13px] text-navy/45 hover:text-navy transition-colors">
          Forgot password?
        </Link>
      </div>

      {/* Submit */}
      <motion.button
        type="submit"
        disabled={isLoading}
        whileTap={{ scale: 0.98 }}
        className="w-full bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 transition-opacity shadow-[0_4px_24px_rgba(226,0,12,0.25)] hover:shadow-[0_4px_32px_rgba(226,0,12,0.4)] transition-shadow"
      >
        {isLoading ? 'Signing in…' : 'Sign in'}
      </motion.button>

      {/* Register link */}
      <p className="text-center text-[14px] text-navy/45 mt-6">
        Don't have an account?{' '}
        <Link href="/register" className="text-navy font-medium hover:text-red transition-colors">
          Create one free
        </Link>
      </p>
    </form>
  )
}
```

**Note on error code shape:** `authApi.login` should throw an error with a `code` property matching the backend `AppError` code (e.g. `ACCOUNT_NOT_ACTIVE`). Verify how `apiFetch` in `lib/api.ts` surfaces error codes — if it throws a plain `Error`, adjust the `err?.code` access pattern to match the actual error shape.

- [ ] **Step 3: Create apps/customer-web/app/login/page.tsx**

```typescript
import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'
import { LoginForm } from '@/components/auth/LoginForm'

export const metadata: Metadata = {
  title: 'Sign in',
  description: 'Sign in to your Redeemo account.',
}

export default function LoginPage() {
  return (
    <AuthShell
      heading="Welcome back."
      subheading="Sign in to access your vouchers and savings."
    >
      <LoginForm />
    </AuthShell>
  )
}
```

- [ ] **Step 4: Create apps/customer-web/components/auth/RegisterForm.tsx**

Multi-step form: Step 1 collects name + email + password. Step 2 shows success state (email verification pending). No phone OTP step in Phase 3C — that requires a separate `/verify-phone` page (out of scope).

```typescript
'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { authApi } from '@/lib/api'

type Step = 'form' | 'success'

const FIELDS = [
  { name: 'firstName', label: 'First name',     type: 'text',     autoComplete: 'given-name' },
  { name: 'lastName',  label: 'Last name',       type: 'text',     autoComplete: 'family-name' },
  { name: 'email',     label: 'Email address',   type: 'email',    autoComplete: 'email' },
  { name: 'password',  label: 'Password',         type: 'password', autoComplete: 'new-password' },
]

export function RegisterForm() {
  const [step, setStep] = useState<Step>('form')
  const [values, setValues] = useState({
    firstName: '', lastName: '', email: '', password: '',
  })
  const [marketingConsent, setMarketingConsent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setIsLoading(true)

    try {
      await authApi.register({
        firstName:       values.firstName,
        lastName:        values.lastName,
        email:           values.email,
        password:        values.password,
        marketingConsent,
      })
      setStep('success')
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'EMAIL_ALREADY_EXISTS') {
        setError('An account with that email already exists. Try signing in instead.')
      } else if (code === 'PASSWORD_POLICY_VIOLATION') {
        setError('Password must be at least 8 characters and include a number and uppercase letter.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <AnimatePresence mode="wait">
      {step === 'form' ? (
        <motion.form
          key="form"
          onSubmit={handleSubmit}
          noValidate
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, x: -20 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col gap-4 mb-6">
            {FIELDS.map((field, i) => (
              <motion.div
                key={field.name}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: i * 0.07 }}
              >
                <label className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/50 mb-2">
                  {field.label}
                </label>
                <input
                  type={field.type}
                  autoComplete={field.autoComplete}
                  value={values[field.name as keyof typeof values]}
                  onChange={e => setValues(v => ({ ...v, [field.name]: e.target.value }))}
                  required
                  className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                />
              </motion.div>
            ))}
          </div>

          {/* Marketing consent */}
          <label className="flex items-start gap-3 cursor-pointer mb-6">
            <span
              className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 mt-0.5 transition-colors ${
                marketingConsent ? 'bg-red border-red' : 'border-navy/20'
              }`}
              onClick={() => setMarketingConsent(v => !v)}
            >
              {marketingConsent && <span className="text-white text-[11px]">✓</span>}
            </span>
            <span className="text-[13px] text-navy/55 leading-relaxed">
              I'd like to receive offers and updates from Redeemo by email.
            </span>
          </label>

          {/* Inline error */}
          {error && (
            <motion.p
              initial={{ opacity: 0, y: -8 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-red text-[13px] mb-4"
            >
              {error}
            </motion.p>
          )}

          {/* Submit */}
          <motion.button
            type="submit"
            disabled={isLoading}
            whileTap={{ scale: 0.98 }}
            className="w-full bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 shadow-[0_4px_24px_rgba(226,0,12,0.25)] hover:shadow-[0_4px_32px_rgba(226,0,12,0.4)] transition-shadow"
          >
            {isLoading ? 'Creating account…' : 'Create free account'}
          </motion.button>

          {/* Terms notice */}
          <p className="text-center text-[12px] text-navy/35 mt-4 leading-relaxed">
            By creating an account you agree to our{' '}
            <Link href="/terms" className="underline hover:text-navy/60">Terms</Link>
            {' '}and{' '}
            <Link href="/privacy" className="underline hover:text-navy/60">Privacy Policy</Link>.
          </p>

          {/* Login link */}
          <p className="text-center text-[14px] text-navy/45 mt-5">
            Already have an account?{' '}
            <Link href="/login" className="text-navy font-medium hover:text-red transition-colors">
              Sign in
            </Link>
          </p>
        </motion.form>
      ) : (
        /* Success state */
        <motion.div
          key="success"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.4 }}
          className="flex flex-col items-center text-center gap-6 py-8"
        >
          <div className="w-16 h-16 rounded-full bg-green-50 border border-green-200 flex items-center justify-center text-3xl">
            ✓
          </div>
          <div>
            <h2 className="font-display text-[26px] text-navy mb-2">Check your email</h2>
            <p className="text-[15px] leading-relaxed text-navy/55 max-w-xs">
              We've sent a verification link to <strong className="text-navy">{values.email}</strong>.
              Click it to activate your account, then come back to sign in.
            </p>
          </div>
          <Link
            href="/login"
            className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy/45 hover:text-navy transition-colors"
          >
            Go to sign in →
          </Link>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 5: Create apps/customer-web/app/register/page.tsx**

```typescript
import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/AuthShell'
import { RegisterForm } from '@/components/auth/RegisterForm'

export const metadata: Metadata = {
  title: 'Create account',
  description: 'Join Redeemo free and discover exclusive vouchers from local businesses near you.',
}

export default function RegisterPage() {
  return (
    <AuthShell
      heading="Join Redeemo free."
      subheading="Discover exclusive vouchers from local businesses near you."
    >
      <RegisterForm />
    </AuthShell>
  )
}
```

- [ ] **Step 6: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 7: Visually verify in browser**

Open `http://localhost:3001/login`. Verify:
- Two-column layout: brand panel on left (dark navy, Calistoga quote, R letter), form on right
- Mobile (375px viewport): brand panel hidden, form fills screen, Redeemo logo visible above heading
- Form fields stagger in on mount
- Submit with wrong credentials → inline error appears below fields (not alert/toast)
- Forgot password link visible

Open `http://localhost:3001/register`. Verify:
- Same shell layout, different heading
- Submit with valid data → success state animates in (fade + slide)
- Success state shows email address in the copy

- [ ] **Step 8: Commit**

```bash
git add apps/customer-web/app/login/ apps/customer-web/app/register/ \
        apps/customer-web/components/auth/
git commit -m "feat: add login and register pages with two-column AuthShell and animated forms"
```

---

## Task 9: Subscribe Page (`/subscribe`)

**Files:**
- Create: `apps/customer-web/app/subscribe/page.tsx`
- Create: `apps/customer-web/components/subscribe/PlanSelector.tsx`
- Create: `apps/customer-web/components/subscribe/PaymentForm.tsx`
- Create: `apps/customer-web/lib/stripe.ts`

**Verified backend routes:**
- `GET /api/v1/subscription/plans` → `SubscriptionPlan[]` (from `prisma.subscriptionPlan.findMany`, ordered by `sortOrder`)
- `GET /api/v1/subscription/me` → `Subscription & { plan: SubscriptionPlan }` | `null` (auth required)
  - Statuses treated as "already subscribed": `ACTIVE`, `TRIALLING`, `PAST_DUE` — matches backend `ACTIVE_STATUSES` constant exactly
- `POST /api/v1/subscription/setup-intent` → `{ clientSecret: string }` (auth required — creates Stripe SetupIntent)
- `POST /api/v1/subscription` — body: `{ planId, paymentMethodId, promoCode? }` → created Subscription (auth required)

**SubscriptionPlan fields** (from `prisma.subscriptionPlan.findMany` — all Prisma model fields returned):
- `id`, `name`, `description`, `interval` (`MONTHLY` | `ANNUAL`), `price` (Decimal — treat as number), `currency`, `trialDays`, `isActive`, `sortOrder`, `stripePriceId`

**Payment flow (verified from subscription service.ts):**
1. User selects a plan → frontend calls `POST /setup-intent` → receives `clientSecret`
2. Frontend mounts Stripe `PaymentElement` (or `CardElement`) using `clientSecret`
3. User enters card → Stripe SDK confirms setup → returns `paymentMethodId`
4. Frontend calls `POST /api/v1/subscription` with `{ planId, paymentMethodId }`
5. Backend creates subscription, charges card, returns subscription record

**Stripe frontend setup:**
- Package: `@stripe/stripe-js` + `@stripe/react-stripe-js` (already in dependencies from Task 1)
- Stripe publishable key: `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` env var
- Use `PaymentElement` (not `CardElement`) — handles cards + Apple/Google Pay automatically
- `loadStripe` call in `lib/stripe.ts`, memoised with singleton pattern

**Design direction — REQUIRED:**

Three-column desktop, two-step mobile:

- Step 1 (plan selection): Two plan cards side by side — Monthly and Annual. Annual has "Best value" badge. Selecting a plan highlights it with a red border + gradient check. Clear price display in large Calistoga, billing period in DM Mono.
- Step 2 (payment): Mounts after plan selected. Stripe `PaymentElement` in a clean white card. Submit button below. Progress breadcrumb at top: `Plan → Payment → Done`.
- Framer Motion: plan cards fade + scale in on mount; payment form slides up (`y: 30→0`) when plan is selected; success state blooms in with scale.
- If user already has an active subscription: show a "You're already subscribed" state with their current plan and a link to `/account`.

**Magic MCP callout:**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine the `PlanSelector` cards visually. Pricing cards have many typographic details that benefit from visual iteration.
> Prompt hint: `"Two subscription pricing cards side by side, Monthly £6.99/month and Annual £69.99/year with 'Best value' badge, large price in Calistoga display font, billing period in mono font, feature list, selected state with red border and gradient checkmark, hover lift, warm cream background, navy and red brand colors, Tailwind CSS"`

---

- [ ] **Step 1: Create apps/customer-web/lib/stripe.ts**

```typescript
import { loadStripe, type Stripe } from '@stripe/stripe-js'

// Singleton — loadStripe is called once and the promise reused
let stripePromise: Promise<Stripe | null> | null = null

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    stripePromise = loadStripe(process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '')
  }
  return stripePromise
}
```

Add to `.env` (and `.env.example`):
```
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_test_...
```

- [ ] **Step 2: Create apps/customer-web/components/subscribe/PlanSelector.tsx**

> ⚡ **Magic MCP candidate** — see callout above. Generate the plan card component visually before wiring it up.

```typescript
'use client'
import { motion } from 'framer-motion'

type Plan = {
  id: string
  name: string
  interval: 'MONTHLY' | 'ANNUAL'
  price: number | string   // Prisma Decimal serialises as string over JSON
  currency: string
}

type Props = {
  plans: Plan[]
  selectedPlanId: string | null
  onSelect: (planId: string) => void
}

function formatPrice(price: number | string, currency: string): string {
  const num = Number(price)
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(num)
}

const INTERVAL_LABELS: Record<string, { period: string; badge: string | null }> = {
  MONTHLY: { period: '/month', badge: null },
  ANNUAL:  { period: '/year', badge: 'Best value' },
}

export function PlanSelector({ plans, selectedPlanId, onSelect }: Props) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
      {plans.map((plan, i) => {
        const isSelected = plan.id === selectedPlanId
        const isAnnual = plan.interval === 'ANNUAL'
        const { period, badge } = INTERVAL_LABELS[plan.interval] ?? { period: '', badge: null }
        const monthly = isAnnual ? Number(plan.price) / 12 : null

        // Annual card: navy background + white text — visually dominant, communicates higher value.
        // Monthly card: white background + navy text — secondary, no special treatment.
        const cardBase = isAnnual
          ? 'bg-navy text-white'
          : 'bg-white text-navy'

        const cardBorder = isSelected
          ? isAnnual
            ? 'border-red shadow-[0_0_0_4px_rgba(226,0,12,0.2)]'
            : 'border-red shadow-[0_0_0_4px_rgba(226,0,12,0.08)]'
          : isAnnual
            ? 'border-navy/40 hover:border-red/40'
            : 'border-navy/[0.1] hover:border-navy/25'

        const labelColour  = isAnnual ? 'text-white/40' : 'text-navy/45'
        const priceColour  = isAnnual ? 'text-white' : 'text-navy'
        const periodColour = isAnnual ? 'text-white/40' : 'text-navy/40'
        const savingColour = isAnnual ? 'text-white/40' : 'text-navy/40'
        const featColour   = isAnnual ? 'text-white/65' : 'text-navy/60'
        const checkColour  = isAnnual ? 'text-orange-red' : 'text-orange-red'

        return (
          <motion.button
            key={plan.id}
            type="button"
            onClick={() => onSelect(plan.id)}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: i * 0.1 }}
            whileHover={{ y: -3 }}
            className={`relative text-left p-7 rounded-2xl border-2 transition-all ${cardBase} ${cardBorder}`}
          >
            {/* Best value badge */}
            {badge && (
              <span className="absolute top-4 right-4 font-mono text-[10px] tracking-[0.1em] uppercase bg-gradient-to-br from-red to-orange-red text-white px-3 py-1 rounded-full">
                {badge}
              </span>
            )}

            {/* Selected check */}
            {isSelected && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                className="absolute top-4 left-4 w-5 h-5 rounded-full bg-gradient-to-br from-red to-orange-red flex items-center justify-center"
              >
                <span className="text-white text-[11px]">✓</span>
              </motion.div>
            )}

            <div className={isSelected ? 'pl-7' : ''}>
              <p className={`font-mono text-[11px] tracking-[0.1em] uppercase mb-3 ${labelColour}`}>
                {plan.name}
              </p>

              <div className="flex items-baseline gap-1 mb-1">
                <span className={`font-display text-[42px] leading-none ${priceColour}`}>
                  {formatPrice(plan.price, plan.currency)}
                </span>
                <span className={`font-mono text-[13px] ${periodColour}`}>{period}</span>
              </div>

              {monthly !== null && (
                <p className={`font-mono text-[12px] mb-4 ${savingColour}`}>
                  ≈ {formatPrice(monthly, plan.currency)}/month
                </p>
              )}

              <ul className="flex flex-col gap-2 mt-4">
                {[
                  'Unlimited voucher browsing',
                  'Redeem in the app',
                  'Cancel anytime',
                  ...(isAnnual ? ['~2 months free vs monthly'] : []),
                ].map(feat => (
                  <li key={feat} className={`flex items-center gap-2 text-[13px] ${featColour}`}>
                    <span className={`flex-shrink-0 ${checkColour}`}>✓</span>
                    {feat}
                  </li>
                ))}
              </ul>
            </div>
          </motion.button>
        )
      })}
    </div>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/components/subscribe/PaymentForm.tsx**

Mounts Stripe `Elements` + `PaymentElement`. Calls setup-intent on mount, then submits payment method to backend.

```typescript
'use client'
import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Elements, PaymentElement, useStripe, useElements } from '@stripe/react-stripe-js'
import { getStripe } from '@/lib/stripe'
import { subscriptionApi } from '@/lib/api'

type Props = {
  planId: string
  promoCode?: string
  onSuccess: () => void
}

// Inner form — must be a child of <Elements> to use useStripe/useElements
function StripePaymentForm({ planId, promoCode, onSuccess }: Props) {
  const stripe = useStripe()
  const elements = useElements()
  const [error, setError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!stripe || !elements) return

    setError(null)
    setIsLoading(true)

    try {
      // 1. Confirm card setup with Stripe SDK — gets paymentMethodId
      const { error: stripeError, setupIntent } = await stripe.confirmSetup({
        elements,
        redirect: 'if_required',
      })

      if (stripeError) {
        setError(stripeError.message ?? 'Card setup failed. Please try again.')
        return
      }

      const paymentMethodId = typeof setupIntent?.payment_method === 'string'
        ? setupIntent.payment_method
        : setupIntent?.payment_method?.id

      if (!paymentMethodId) {
        setError('Could not retrieve payment method. Please try again.')
        return
      }

      // 2. Create subscription via our backend
      await subscriptionApi.create({ planId, paymentMethodId, promoCode })
      onSuccess()
    } catch (err: any) {
      setError(err?.message ?? 'Something went wrong. Please try again.')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="bg-white rounded-2xl border border-navy/[0.08] p-6 mb-5">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <motion.p
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-red text-[13px] mb-4"
        >
          {error}
        </motion.p>
      )}

      <motion.button
        type="submit"
        disabled={!stripe || isLoading}
        whileTap={{ scale: 0.98 }}
        className="w-full bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] py-4 rounded-xl disabled:opacity-60 shadow-[0_4px_24px_rgba(226,0,12,0.25)] hover:shadow-[0_4px_32px_rgba(226,0,12,0.4)] transition-shadow"
      >
        {isLoading ? 'Processing…' : 'Subscribe now'}
      </motion.button>

      <p className="text-center text-[12px] text-navy/35 mt-3">
        Secured by Stripe. Cancel anytime.
      </p>
    </form>
  )
}

// Outer wrapper — fetches clientSecret, mounts Elements
export function PaymentForm({ planId, promoCode, onSuccess }: Props) {
  const [clientSecret, setClientSecret] = useState<string | null>(null)
  const [fetchError, setFetchError] = useState<string | null>(null)

  useEffect(() => {
    setClientSecret(null)
    setFetchError(null)
    subscriptionApi.createSetupIntent()
      .then(data => setClientSecret(data.clientSecret))
      .catch(() => setFetchError('Could not initialise payment. Please refresh and try again.'))
  }, [planId])

  if (fetchError) {
    return <p className="text-red text-[14px]">{fetchError}</p>
  }

  if (!clientSecret) {
    return (
      <div className="flex items-center justify-center h-32">
        <span className="font-mono text-[12px] text-navy/35 animate-pulse">Loading payment form…</span>
      </div>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <Elements stripe={getStripe()} options={{ clientSecret, appearance: { theme: 'stripe' } }}>
        <StripePaymentForm planId={planId} promoCode={promoCode} onSuccess={onSuccess} />
      </Elements>
    </motion.div>
  )
}
```

**Note on `subscriptionApi`:** Verify method names against `lib/api.ts` (Task 2). Expected:
```typescript
subscriptionApi.createSetupIntent(): Promise<{ clientSecret: string }>
subscriptionApi.create(body: { planId: string; paymentMethodId: string; promoCode?: string }): Promise<unknown>
```

- [ ] **Step 4: Assemble apps/customer-web/app/subscribe/page.tsx**

```typescript
'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import Link from 'next/link'
import { PlanSelector } from '@/components/subscribe/PlanSelector'
import { PaymentForm } from '@/components/subscribe/PaymentForm'
import { subscriptionApi } from '@/lib/api'
import { getAccessToken } from '@/lib/auth'

type Plan = {
  id: string; name: string; interval: 'MONTHLY' | 'ANNUAL'
  price: number | string; currency: string
}

type CheckStep = 'loading' | 'already_subscribed' | 'select_plan' | 'payment' | 'done'

const STEPS = ['Plan', 'Payment', 'Done']

export default function SubscribePage() {
  const router = useRouter()
  const [checkStep, setCheckStep] = useState<CheckStep>('loading')
  const [plans, setPlans] = useState<Plan[]>([])
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null)
  const [currentSubscription, setCurrentSubscription] = useState<any>(null)

  useEffect(() => {
    const token = getAccessToken()

    Promise.all([
      subscriptionApi.getPlans(),
      token ? subscriptionApi.getMySubscription() : Promise.resolve(null),
    ]).then(([plansData, sub]) => {
      setPlans(plansData)
      if (sub && ['ACTIVE', 'TRIALLING', 'PAST_DUE'].includes(sub.status)) {
        setCurrentSubscription(sub)
        setCheckStep('already_subscribed')
      } else {
        setCheckStep('select_plan')
      }
    }).catch(() => setCheckStep('select_plan'))
  }, [])

  const handlePlanSelect = (planId: string) => {
    setSelectedPlanId(planId)
    setCheckStep('payment')
  }

  const stepIndex = checkStep === 'payment' ? 1 : checkStep === 'done' ? 2 : 0

  if (checkStep === 'loading') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center">
        <span className="font-mono text-[12px] text-navy/35 animate-pulse">Loading…</span>
      </div>
    )
  }

  if (checkStep === 'already_subscribed') {
    return (
      <div className="min-h-screen bg-[#FAF8F5] flex items-center justify-center px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-sm"
        >
          <div className="text-5xl mb-5" aria-hidden>✓</div>
          <h1 className="font-display text-[32px] text-navy mb-2">You're already subscribed</h1>
          <p className="text-[15px] text-navy/50 mb-8">
            You're on the <strong>{currentSubscription?.plan?.name}</strong> plan.
            Your access continues until your next billing date.
          </p>
          <Link
            href="/account"
            className="inline-block bg-navy text-white font-bold text-[15px] px-8 py-3.5 rounded-xl no-underline hover:bg-navy/90 transition-colors"
          >
            Go to your account
          </Link>
        </motion.div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5] px-6 py-16">
      <div className="max-w-screen-sm mx-auto">
        {/* Progress breadcrumb */}
        <div className="flex items-center gap-2 mb-10 justify-center">
          {STEPS.map((label, i) => (
            <div key={label} className="flex items-center gap-2">
              <div className={`flex items-center gap-1.5 ${i <= stepIndex ? 'text-navy' : 'text-navy/25'}`}>
                <span
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold border transition-colors ${
                    i < stepIndex ? 'bg-red border-red text-white' :
                    i === stepIndex ? 'border-navy text-navy' :
                    'border-navy/20 text-navy/25'
                  }`}
                >
                  {i < stepIndex ? '✓' : i + 1}
                </span>
                <span className="font-mono text-[11px] tracking-[0.08em] uppercase">{label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="text-navy/15 mx-1">—</span>
              )}
            </div>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {checkStep === 'select_plan' && (
            <motion.div
              key="plan"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.35 }}
            >
              {/* Editorial heading block — oversized background word + left-aligned Calistoga */}
              <div className="relative mb-10">
                <span
                  aria-hidden
                  className="absolute -top-6 -left-2 font-display text-[clamp(80px,12vw,140px)] leading-none text-navy opacity-[0.04] pointer-events-none select-none"
                >
                  Plans
                </span>
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-orange-red mb-3 relative z-10">
                  Subscription
                </p>
                <h1 className="font-display text-[clamp(32px,5vw,52px)] text-navy leading-[1.06] relative z-10 mb-3">
                  Choose your plan
                </h1>
                <p className="text-[15px] text-navy/50 leading-relaxed relative z-10">
                  Cancel anytime. No commitment beyond your billing period.
                </p>
              </div>
              <PlanSelector
                plans={plans}
                selectedPlanId={selectedPlanId}
                onSelect={handlePlanSelect}
              />
            </motion.div>
          )}

          {checkStep === 'payment' && selectedPlanId && (
            <motion.div
              key="payment"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.35 }}
            >
              <div className="flex items-center gap-3 mb-8">
                <button
                  onClick={() => setCheckStep('select_plan')}
                  className="text-navy/40 hover:text-navy transition-colors text-[14px]"
                >
                  ← Back
                </button>
                <h1 className="font-display text-[clamp(24px,3vw,34px)] text-navy">Payment details</h1>
              </div>
              <PaymentForm
                planId={selectedPlanId}
                onSuccess={() => setCheckStep('done')}
              />
            </motion.div>
          )}

          {checkStep === 'done' && (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.94 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, type: 'spring', damping: 20 }}
              className="text-center py-10"
            >
              <div className="text-6xl mb-5" aria-hidden>🎉</div>
              <h1 className="font-display text-[36px] text-navy mb-2">You're subscribed!</h1>
              <p className="text-[15px] text-navy/50 mb-8">
                Start discovering exclusive vouchers from local businesses near you.
              </p>
              <Link
                href="/discover"
                className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-bold text-[16px] px-10 py-4 rounded-xl no-underline shadow-[0_4px_24px_rgba(226,0,12,0.25)]"
              >
                Discover local deals
              </Link>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
```

**Auth gate note:** `/subscribe` is not in the protected route matcher (middleware only covers `/account/**`). The page handles the unauthenticated case gracefully: `getAccessToken()` returns null → `getMySubscription()` is skipped → user lands on plan selection. When they proceed to payment, `createSetupIntent` will fail with 401 (no token) — at that point, redirect to `/login?next=/subscribe`. Add this to `PaymentForm`:

```typescript
// In PaymentForm useEffect error handler:
.catch((err) => {
  if (err?.statusCode === 401) {
    router.push('/login?next=/subscribe')
    return
  }
  setFetchError('Could not initialise payment. Please refresh and try again.')
})
```

This requires `useRouter` in `PaymentForm` — add `const router = useRouter()` at the top of that component.

- [ ] **Step 5: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 6: Visually verify in browser**

Open `http://localhost:3001/subscribe` (not logged in). Verify:
- Loading state briefly shows then resolves to plan selection
- Two plan cards render with correct prices (from seed data — verify via `npx prisma studio` → `SubscriptionPlan` table)
- Annual card has "Best value" badge
- Selecting a card highlights it with red border + animated checkmark
- Clicking "Continue" advances to payment step
- Breadcrumb updates: Plan → **Payment** → Done
- Payment step shows Stripe `PaymentElement` (requires `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` in `.env`)
- "Back" link returns to plan selection
- In test mode: use Stripe test card `4242 4242 4242 4242`, any future expiry, any CVC → should complete and show success state

- [ ] **Step 7: Commit**

```bash
git add apps/customer-web/app/subscribe/ \
        apps/customer-web/components/subscribe/ \
        apps/customer-web/lib/stripe.ts
git commit -m "feat: add subscribe page with plan selector, Stripe PaymentElement, and success state"
```

---

## Task 10: Account Hub + Profile Edit (`/account`, `/account/profile`)

**Files:**
- Create: `apps/customer-web/app/account/page.tsx`
- Create: `apps/customer-web/app/account/profile/page.tsx`
- Create: `apps/customer-web/components/account/AccountNav.tsx`
- Create: `apps/customer-web/components/account/ProfileForm.tsx`
- Create: `apps/customer-web/components/account/SubscriptionCard.tsx`

**Verified routes:**
- `GET /api/v1/customer/profile` → full profile object including `profileCompleteness: number` (0–100)
- `PATCH /api/v1/customer/profile` — body field is `name` (not `firstName`) — backend maps it to `firstName`
- `POST /api/v1/customer/profile/change-password` — body: `{ currentPassword, newPassword }`
- `GET /api/v1/subscription/me` → `{ status, plan: { name, interval, price }, currentPeriodEnd, cancelAtPeriodEnd }` | `null`
- `DELETE /api/v1/subscription` → cancel at period end

**Profile response shape (exact):**
```typescript
type CustomerProfile = {
  id: string
  firstName: string
  lastName: string
  email: string
  phone: string | null
  profileImageUrl: string | null
  dateOfBirth: Date | null
  gender: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  postcode: string | null
  newsletterConsent: boolean
  emailVerified: boolean
  phoneVerified: boolean
  createdAt: Date
  interests: { id: string; name: string }[]
  profileCompleteness: number   // 0–100, computed server-side
}
```

**PATCH body field note (critical):** The profile update body uses `name` to update `firstName`. Do NOT send `firstName` — the backend will ignore it silently. The form label says "First name" but the PATCH field is `name`.

**Design direction — REQUIRED:**

`/account` is a personal dashboard. Aesthetic: clean editorial warmth — not a settings panel, not a SaaS dashboard. Think a well-designed personal finance summary.

- **AccountNav**: left sidebar on desktop, horizontal scroll tabs on mobile. Active tab has red left-border accent. Items: Overview, Profile, Savings, Favourites.
- **Account hub `/account`**: two-column on desktop (nav | content). Content area has: greeting with first name in Calistoga, `profileCompleteness` progress arc (CSS `conic-gradient`) with percentage, subscription status card, quick links to sub-pages.
- **ProfileForm**: fields in two-column grid on desktop (first name / last name, city / postcode). Change-password in a collapsible section below — not a separate page. `whileFocus` label floats up (CSS only via `peer` + `placeholder-shown`). Progress bar at top reflects `profileCompleteness`.
- **SubscriptionCard**: shows plan name, status chip, next billing date, "Cancel subscription" link. If no subscription: CTA to `/subscribe`.
- Framer Motion: account hub content `y: 20→0 opacity: 0→1` on mount; `profileCompleteness` arc animates from 0 to actual value on mount using `useEffect` + `useState`.

**Responsive — REQUIRED:** All account pages use a shared layout with `AccountNav`. On mobile: nav is a horizontal scroll tab bar pinned below the site navbar. On desktop `lg:`: left sidebar `w-56` + content area side by side.

---

- [ ] **Step 1: Create apps/customer-web/components/account/AccountNav.tsx**

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to refine this component visually. The animated active indicator (sliding red left-border via `layoutId`) and the mobile-vs-desktop layout switch are worth iterating on visually before committing.
> Prompt hint: `"Account navigation component, desktop left sidebar with animated red left-border active indicator using framer-motion layoutId, mobile horizontal scroll pill tabs with active bg-navy, 4 nav items (Overview/Profile/Savings/Favourites), warm cream background, navy text, Tailwind CSS"`

Shared nav used by all `/account/**` pages. Active state derived from `usePathname()`.

```typescript
'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { motion } from 'framer-motion'

// Icons: inline SVGs render consistently cross-platform (no emoji rendering variance).
// These are minimal path-based icons — replace with lucide-react if that package is added later.
const NAV_ITEMS = [
  {
    href: '/account', label: 'Overview',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><rect x="1" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="1" width="5" height="5" rx="1" fill="currentColor"/><rect x="1" y="8" width="5" height="5" rx="1" fill="currentColor"/><rect x="8" y="8" width="5" height="5" rx="1" fill="currentColor"/></svg>,
  },
  {
    href: '/account/profile', label: 'Profile',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><circle cx="7" cy="4.5" r="2.5" fill="currentColor"/><path d="M2 12c0-2.761 2.239-5 5-5s5 2.239 5 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg>,
  },
  {
    href: '/account/savings', label: 'Savings',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><text x="1" y="12" fontFamily="serif" fontSize="13" fill="currentColor">£</text></svg>,
  },
  {
    href: '/account/favourites', label: 'Favourites',
    icon: <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden><path d="M7 12L2.5 7.5C1.5 6.5 1.5 4.9 2.5 3.9 3.5 2.9 5.1 2.9 6.1 3.9L7 4.8l.9-.9c1-1 2.6-1 3.6 0 1 1 1 2.6 0 3.6L7 12z" fill="currentColor"/></svg>,
  },
]

export function AccountNav() {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile: horizontal scroll tab bar */}
      <nav className="lg:hidden overflow-x-auto scrollbar-none bg-[#FAF8F5] border-b border-navy/[0.06] sticky top-[64px] z-10">
        <div className="flex gap-1 px-6 py-2" style={{ width: 'max-content' }}>
          {NAV_ITEMS.map(item => {
            const isActive = pathname === item.href
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-1.5 font-mono text-[11px] tracking-[0.08em] uppercase px-4 py-2 rounded-full whitespace-nowrap transition-colors ${
                  isActive
                    ? 'bg-navy text-white'
                    : 'text-navy/55 hover:text-navy'
                }`}
              >
                <span className="w-3.5 h-3.5 flex-shrink-0">{item.icon}</span>
                {item.label}
              </Link>
            )
          })}
        </div>
      </nav>

      {/* Desktop: sticky left sidebar */}
      <nav className="hidden lg:flex flex-col gap-1 w-56 flex-shrink-0 sticky top-24 self-start pt-2">
        {NAV_ITEMS.map((item, i) => {
          const isActive = pathname === item.href
          return (
            <motion.div
              key={item.href}
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3, delay: i * 0.06 }}
            >
              <Link
                href={item.href}
                className={`flex items-center gap-3 px-4 py-3 rounded-xl text-[14px] transition-colors relative group ${
                  isActive
                    ? 'bg-white text-navy font-medium shadow-sm'
                    : 'text-navy/55 hover:text-navy hover:bg-white/60'
                }`}
              >
                {/* Active left-border accent */}
                {isActive && (
                  <motion.span
                    layoutId="account-nav-indicator"
                    className="absolute left-0 top-2 bottom-2 w-[3px] bg-gradient-to-b from-red to-orange-red rounded-full"
                  />
                )}
                <span aria-hidden className="text-[16px] ml-2">{item.icon}</span>
                {item.label}
              </Link>
            </motion.div>
          )
        })}
      </nav>
    </>
  )
}
```

- [ ] **Step 2: Create apps/customer-web/components/account/SubscriptionCard.tsx**

```typescript
'use client'
import Link from 'next/link'
import { useState } from 'react'
import { motion } from 'framer-motion'
import { subscriptionApi } from '@/lib/api'

type Subscription = {
  status: string
  currentPeriodEnd: string
  cancelAtPeriodEnd: boolean
  plan: { name: string; interval: string; price: number | string; currency: string }
} | null

const STATUS_LABELS: Record<string, { label: string; colour: string }> = {
  ACTIVE:    { label: 'Active',     colour: 'bg-green-50 text-green-700 border-green-200' },
  TRIALLING: { label: 'Trial',      colour: 'bg-blue-50 text-blue-700 border-blue-200' },
  PAST_DUE:  { label: 'Past due',   colour: 'bg-amber-50 text-amber-700 border-amber-200' },
  CANCELLED: { label: 'Cancelled',  colour: 'bg-navy/[0.05] text-navy/50 border-navy/10' },
}

export function SubscriptionCard({ subscription }: { subscription: Subscription }) {
  const [cancelling, setCancelling] = useState(false)
  const [cancelled, setCancelled] = useState(false)

  const handleCancel = async () => {
    if (!confirm('Cancel your subscription? You\'ll keep access until the end of your billing period.')) return
    setCancelling(true)
    try {
      await subscriptionApi.cancel()
      setCancelled(true)
    } finally {
      setCancelling(false)
    }
  }

  if (!subscription || cancelled) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="bg-white border border-navy/[0.08] rounded-2xl p-6"
      >
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-2">Subscription</p>
        <p className="font-display text-[20px] text-navy mb-1">
          {cancelled ? 'Cancellation confirmed' : 'No active subscription'}
        </p>
        <p className="text-[14px] text-navy/50 mb-5">
          {cancelled
            ? `Access continues until ${new Date(subscription!.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })}.`
            : 'Subscribe to unlock voucher redemption in the app.'}
        </p>
        {!cancelled && (
          <Link
            href="/subscribe"
            className="inline-block bg-gradient-to-br from-red to-orange-red text-white font-bold text-[14px] px-6 py-3 rounded-xl no-underline"
          >
            Subscribe now
          </Link>
        )}
      </motion.div>
    )
  }

  const statusInfo = STATUS_LABELS[subscription.status] ?? { label: subscription.status, colour: 'bg-navy/[0.05] text-navy/50 border-navy/10' }
  const periodEnd = new Date(subscription.currentPeriodEnd).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4 }}
      className="bg-white border border-navy/[0.08] rounded-2xl p-6"
    >
      <div className="flex items-start justify-between mb-4">
        <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35">Subscription</p>
        <span className={`font-mono text-[10px] tracking-wide uppercase px-3 py-1 rounded-full border ${statusInfo.colour}`}>
          {statusInfo.label}
        </span>
      </div>

      <p className="font-display text-[24px] text-navy leading-none mb-1">
        {subscription.plan.name}
      </p>
      <p className="font-mono text-[13px] text-navy/40 mb-5">
        {subscription.cancelAtPeriodEnd
          ? `Access until ${periodEnd}`
          : `Renews ${periodEnd}`}
      </p>

      {!subscription.cancelAtPeriodEnd && (
        <button
          onClick={handleCancel}
          disabled={cancelling}
          className="text-[13px] text-navy/40 hover:text-red transition-colors underline-offset-2 hover:underline disabled:opacity-50"
        >
          {cancelling ? 'Cancelling…' : 'Cancel subscription'}
        </button>
      )}
    </motion.div>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/app/account/page.tsx**

Account hub — Server Component. Fetches profile + subscription in parallel.

```typescript
import type { Metadata } from 'next'
import { profileApi, subscriptionApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { SubscriptionCard } from '@/components/account/SubscriptionCard'
import Link from 'next/link'

export const metadata: Metadata = { title: 'My Account' }

// Profile completeness arc — pure CSS conic-gradient, animated via inline style.
// Server-rendered with actual value; no client JS needed for the visual.
function CompletenessArc({ pct }: { pct: number }) {
  // Red-to-orange gradient stop at the completion point, navy/5 for the remainder
  const gradient = `conic-gradient(#E2000C 0%, #EE6904 ${pct}%, rgba(1,12,53,0.06) ${pct}% 100%)`
  return (
    <div className="relative w-[88px] h-[88px] flex-shrink-0">
      <div
        className="w-full h-full rounded-full"
        style={{ background: gradient }}
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
      />
      {/* Inner white circle — creates donut */}
      <div className="absolute inset-[10px] rounded-full bg-[#FAF8F5] flex items-center justify-center">
        <span className="font-mono text-[14px] font-bold text-navy">{pct}%</span>
      </div>
    </div>
  )
}

export default async function AccountPage() {
  const [profile, subscription] = await Promise.allSettled([
    profileApi.getProfile(),
    subscriptionApi.getMySubscription(),
  ])

  const p = profile.status === 'fulfilled' ? profile.value : null
  const sub = subscription.status === 'fulfilled' ? subscription.value : null

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        {/* Sidebar rendered by AccountNav on desktop — spacer keeps content aligned */}
        <div className="hidden lg:block w-56 flex-shrink-0" />

        <main className="flex-1 max-w-2xl">
          {/* Greeting */}
          <div className="flex items-center gap-5 mb-10">
            {p && <CompletenessArc pct={p.profileCompleteness} />}
            <div>
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-1">Welcome back</p>
              <h1 className="font-display text-[clamp(28px,4vw,40px)] text-navy leading-none">
                {p ? p.firstName : 'Your account'}
              </h1>
              {p && p.profileCompleteness < 100 && (
                <Link
                  href="/account/profile"
                  className="text-[13px] text-orange-red hover:underline mt-1 block"
                >
                  Complete your profile →
                </Link>
              )}
            </div>
          </div>

          {/* Subscription card */}
          <div className="mb-6">
            <SubscriptionCard subscription={sub} />
          </div>

          {/* Quick links grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {[
              { href: '/account/savings',    icon: '£',  label: 'My Savings',    sub: 'See what you\'ve saved' },
              { href: '/account/favourites', icon: '♡',  label: 'Favourites',    sub: 'Saved merchants & vouchers' },
              { href: '/account/profile',    icon: '👤', label: 'Edit Profile',  sub: 'Name, address, interests' },
            ].map((item, i) => (
              <Link
                key={item.href}
                href={item.href}
                className="group bg-white border border-navy/[0.08] rounded-2xl p-5 hover:border-navy/20 hover:shadow-sm transition-all no-underline"
              >
                <span className="text-2xl mb-3 block" aria-hidden>{item.icon}</span>
                <p className="font-display text-[17px] text-navy mb-1 group-hover:text-red transition-colors">{item.label}</p>
                <p className="text-[12px] text-navy/45">{item.sub}</p>
              </Link>
            ))}
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create apps/customer-web/components/account/ProfileForm.tsx**

Two-section form: profile fields (two-column grid on desktop) + collapsible change-password section. Sends `name` (not `firstName`) per the backend PATCH contract.

```typescript
'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { profileApi } from '@/lib/api'

type Profile = {
  firstName: string; lastName: string; email: string; phone: string | null
  dateOfBirth: Date | null; gender: string | null
  addressLine1: string | null; addressLine2: string | null
  city: string | null; postcode: string | null
  newsletterConsent: boolean; profileCompleteness: number
}

type Props = { profile: Profile }

function Field({
  label, value, onChange, type = 'text', readOnly = false,
}: {
  label: string; value: string; onChange?: (v: string) => void
  type?: string; readOnly?: boolean
}) {
  return (
    <div>
      <label className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
        {label}
      </label>
      <input
        type={type}
        value={value}
        onChange={e => onChange?.(e.target.value)}
        readOnly={readOnly}
        className={`w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition ${
          readOnly ? 'opacity-50 cursor-not-allowed' : ''
        }`}
      />
    </div>
  )
}

export function ProfileForm({ profile }: Props) {
  const [values, setValues] = useState({
    firstName:    profile.firstName,
    lastName:     profile.lastName,
    dateOfBirth:  profile.dateOfBirth
      ? new Date(profile.dateOfBirth).toISOString().split('T')[0]
      : '',
    gender:       profile.gender ?? '',
    addressLine1: profile.addressLine1 ?? '',
    addressLine2: profile.addressLine2 ?? '',
    city:         profile.city ?? '',
    postcode:     profile.postcode ?? '',
  })
  const [newsletter, setNewsletter] = useState(profile.newsletterConsent)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Change password section
  const [pwOpen, setPwOpen] = useState(false)
  const [pwValues, setPwValues] = useState({ current: '', next: '', confirm: '' })
  const [pwSaving, setPwSaving] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)
  const [pwSuccess, setPwSuccess] = useState(false)

  const set = (field: keyof typeof values) => (v: string) =>
    setValues(prev => ({ ...prev, [field]: v }))

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)
    try {
      // CRITICAL: backend PATCH field is `name`, which maps to firstName server-side
      await profileApi.updateProfile({
        name:          values.firstName,   // 'name' → firstName (backend contract)
        dateOfBirth:   values.dateOfBirth ? new Date(values.dateOfBirth).toISOString() : undefined,
        gender:        values.gender || undefined,
        addressLine1:  values.addressLine1 || undefined,
        addressLine2:  values.addressLine2 || undefined,
        city:          values.city || undefined,
        postcode:      values.postcode || undefined,
        newsletterConsent: newsletter,
      })
      setSaveSuccess(true)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch {
      setSaveError('Could not save changes. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError(null)
    if (pwValues.next !== pwValues.confirm) {
      setPwError('New passwords do not match.')
      return
    }
    setPwSaving(true)
    try {
      await profileApi.changePassword({
        currentPassword: pwValues.current,
        newPassword: pwValues.next,
      })
      setPwSuccess(true)
      setPwValues({ current: '', next: '', confirm: '' })
    } catch (err: any) {
      setPwError(
        err?.code === 'CURRENT_PASSWORD_INCORRECT'
          ? 'Current password is incorrect.'
          : 'Could not change password. Please try again.'
      )
    } finally {
      setPwSaving(false)
    }
  }

  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      {/* Profile completeness bar */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35">
            Profile completeness
          </span>
          <span className="font-mono text-[12px] text-navy/55">{profile.profileCompleteness}%</span>
        </div>
        <div className="h-1.5 bg-navy/[0.06] rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-red to-orange-red rounded-full"
            initial={{ width: 0 }}
            animate={{ width: `${profile.profileCompleteness}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
      </div>

      {/* Profile fields form */}
      <form onSubmit={handleSave}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-5">
          <Field label="First name" value={values.firstName} onChange={set('firstName')} autoComplete="given-name" />
          {/* lastName is read-only — backend PATCH does not accept lastName separately */}
          <Field label="Last name" value={values.lastName} readOnly />
          <Field label="Email" value={profile.email} readOnly />
          <Field label="Date of birth" value={values.dateOfBirth} onChange={set('dateOfBirth')} type="date" />
          <Field label="Gender" value={values.gender} onChange={set('gender')} />
          <Field label="Address" value={values.addressLine1} onChange={set('addressLine1')} />
          <Field label="Address line 2" value={values.addressLine2} onChange={set('addressLine2')} />
          <Field label="City" value={values.city} onChange={set('city')} />
          <Field label="Postcode" value={values.postcode} onChange={set('postcode')} />
        </div>

        {/* Newsletter consent */}
        <label className="flex items-center gap-3 cursor-pointer mb-6">
          <span
            onClick={() => setNewsletter(v => !v)}
            className={`w-5 h-5 rounded flex items-center justify-center border flex-shrink-0 transition-colors ${
              newsletter ? 'bg-red border-red' : 'border-navy/20'
            }`}
          >
            {newsletter && <span className="text-white text-[11px]">✓</span>}
          </span>
          <span className="text-[13px] text-navy/60">Receive offers and updates from Redeemo by email</span>
        </label>

        {saveError && (
          <p className="text-red text-[13px] mb-3">{saveError}</p>
        )}

        <div className="flex items-center gap-4">
          <motion.button
            type="submit"
            disabled={saving}
            whileTap={{ scale: 0.98 }}
            className="bg-gradient-to-br from-red to-orange-red text-white font-bold text-[15px] px-8 py-3.5 rounded-xl disabled:opacity-60 shadow-[0_4px_20px_rgba(226,0,12,0.2)] hover:shadow-[0_4px_28px_rgba(226,0,12,0.35)] transition-shadow"
          >
            {saving ? 'Saving…' : 'Save changes'}
          </motion.button>
          <AnimatePresence>
            {saveSuccess && (
              <motion.span
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-[13px] text-green-600 font-medium"
              >
                ✓ Saved
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </form>

      {/* Change password — collapsible */}
      <div className="border-t border-navy/[0.06] pt-6">
        <button
          onClick={() => { setPwOpen(o => !o); setPwError(null); setPwSuccess(false) }}
          className="flex items-center gap-2 font-mono text-[12px] tracking-[0.08em] uppercase text-navy/50 hover:text-navy transition-colors"
        >
          <span
            className="transition-transform duration-200"
            style={{ display: 'inline-block', transform: pwOpen ? 'rotate(90deg)' : 'rotate(0deg)' }}
            aria-hidden
          >
            ▶
          </span>
          Change password
        </button>

        <AnimatePresence>
          {pwOpen && (
            <motion.form
              key="pw-form"
              onSubmit={handleChangePassword}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.3 }}
              className="overflow-hidden"
            >
              <div className="flex flex-col gap-4 mt-5 max-w-sm">
                {[
                  { field: 'current', label: 'Current password' },
                  { field: 'next',    label: 'New password' },
                  { field: 'confirm', label: 'Confirm new password' },
                ].map(({ field, label }) => (
                  <div key={field}>
                    <label className="block font-mono text-[11px] tracking-[0.1em] uppercase text-navy/45 mb-2">
                      {label}
                    </label>
                    <input
                      type="password"
                      value={pwValues[field as keyof typeof pwValues]}
                      onChange={e => setPwValues(v => ({ ...v, [field]: e.target.value }))}
                      required
                      className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                    />
                  </div>
                ))}
                {pwError && <p className="text-red text-[13px]">{pwError}</p>}
                {pwSuccess && <p className="text-green-600 text-[13px] font-medium">✓ Password changed</p>}
                <motion.button
                  type="submit"
                  disabled={pwSaving}
                  whileTap={{ scale: 0.98 }}
                  className="bg-navy text-white font-bold text-[14px] px-7 py-3 rounded-xl disabled:opacity-60 w-fit"
                >
                  {pwSaving ? 'Updating…' : 'Update password'}
                </motion.button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}
```

**Field note:** `lastName` is rendered read-only because the PATCH body only accepts `name` (→ `firstName`). The backend does not expose a `lastName` update field. If this changes in a future phase, remove `readOnly` from `lastName`.

- [ ] **Step 5: Create apps/customer-web/app/account/profile/page.tsx**

```typescript
import type { Metadata } from 'next'
import { profileApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { ProfileForm } from '@/components/account/ProfileForm'

export const metadata: Metadata = { title: 'Edit Profile' }

export default async function ProfilePage() {
  let profile
  try {
    profile = await profileApi.getProfile()
  } catch {
    // Middleware should have redirected unauthenticated users — this is a fallback
    profile = null
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <div className="hidden lg:block w-56 flex-shrink-0" />
        <main className="flex-1">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">Edit Profile</h1>
          </div>
          {profile
            ? <ProfileForm profile={profile} />
            : <p className="text-[14px] text-navy/45">Could not load profile. Please refresh.</p>
          }
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 7: Visually verify in browser**

Log in as `customer@redeemo.com` / `Customer1234!`. Open `http://localhost:3001/account`.

Verify:
- Greeting with first name from seed data
- `profileCompleteness` arc renders — colour fills based on percentage
- Subscription card shows status chip and plan name, or "No active subscription" CTA
- Three quick-link cards grid below
- Mobile (375px): horizontal tab bar below site navbar, no sidebar
- Desktop: left sidebar with active indicator (`/account` highlighted)

Open `http://localhost:3001/account/profile`. Verify:
- Completeness bar animates in
- Two-column field grid on desktop, stacked on mobile
- Email field and Last name field are read-only (greyed)
- Save → brief "✓ Saved" confirmation appears inline
- Change password section toggles open with smooth height animation
- Wrong current password → "Current password is incorrect." error

- [ ] **Step 8: Commit**

```bash
git add apps/customer-web/app/account/page.tsx \
        apps/customer-web/app/account/profile/ \
        apps/customer-web/components/account/AccountNav.tsx \
        apps/customer-web/components/account/ProfileForm.tsx \
        apps/customer-web/components/account/SubscriptionCard.tsx
git commit -m "feat: add account hub and profile edit page with completeness arc and change-password"
```

---

## Task 11: Savings Page (`/account/savings`)

**Files:**
- Create: `apps/customer-web/app/account/savings/page.tsx`
- Create: `apps/customer-web/components/account/SavingsChart.tsx`
- Create: `apps/customer-web/components/account/RedemptionList.tsx`

**Verified routes:**
- `GET /api/v1/customer/savings/summary` → `{ lifetimeSaving, thisMonthSaving, thisMonthRedemptionCount, monthlyBreakdown: [{month: "YYYY-MM", saving, count}][], byMerchant: [{merchantId, businessName, logoUrl, saving, count}][], byCategory: [{categoryId, name, saving}][] }`
- `GET /api/v1/customer/savings/redemptions?limit=20&offset=0` → `{ redemptions: [{id, redeemedAt, estimatedSaving, isValidated, merchant:{id,name,logoUrl}, voucher:{id,title,voucherType}, branch:{id,name}}][], total }`

**⚠️ Backend bug — `merchant.name`:** `getSavingsRedemptions` selects `merchant.name` at line 137 of `savings/service.ts`, but the Prisma field is `businessName`. This will likely cause a Prisma client error at runtime. **Executor must read `src/api/customer/savings/service.ts` line 136–138 before running this page and flag to the owner if it causes a 500.** For safety, the frontend accesses `merchant.name` as returned — if the backend is fixed to return `businessName`, update accordingly.

**Design direction — REQUIRED:**

`/account/savings` is a personal finance moment — this should feel genuinely satisfying to look at. Editorial, data-forward, warm.

- **Hero stat row**: Three editorial large-number callouts side by side — lifetime saving, this month saving, redemptions this month. Each in Calistoga. Not a card grid — a horizontal editorial band on a navy background. Numbers animate up from 0 on mount using `useEffect` + `requestAnimationFrame` counter.
- **Monthly bar chart (`SavingsChart`)**: Pure CSS/SVG bar chart showing 12-month breakdown. No external charting library — renders `<rect>` bars with `width: 100%` and `height: (saving / maxSaving * 100)%`. Bars animate height from 0 on mount (`whileInView`, stagger). Bars coloured with brand gradient. Month labels in DM Mono below.
- **By merchant list**: Each row shows logo circle, merchant name, saving amount right-aligned. Warm-grey background.
- **Redemption history**: Paginated list of redemption events — merchant logo + voucher title + date + saving + validated badge. "Load more" pagination.
- Framer Motion: hero stats count up; chart bars stagger `whileInView`; redemption rows stagger on initial load.

> ⚡ **Magic MCP candidate** — use `mcp__magic__21st_magic_component_builder` during execution to generate and refine the `SavingsChart` bar chart component visually. Getting bar proportions, label alignment, and the gradient fill to look right is faster visually.
> Prompt hint: `"12-month savings bar chart, pure SVG bars no library, bars fill from bottom with brand red-to-orange gradient, each bar has month label in DM Mono below and saving amount on hover tooltip, bars animate height from 0 on mount with stagger, warm cream background, navy text, Tailwind CSS"`

---

- [ ] **Step 1: Create apps/customer-web/components/account/SavingsChart.tsx**

> ⚡ **Magic MCP candidate** — see callout above.

```typescript
'use client'
import { motion } from 'framer-motion'

type MonthData = { month: string; saving: number; count: number }

export function SavingsChart({ data }: { data: MonthData[] }) {
  // data[0] = current month, data[11] = 11 months ago — display oldest-first (reverse)
  const displayed = [...data].reverse()
  const maxSaving = Math.max(...displayed.map(d => d.saving), 1)

  return (
    <div className="bg-white border border-navy/[0.08] rounded-2xl p-6">
      <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-6">
        Monthly savings — last 12 months
      </p>

      <div className="flex items-end gap-2 h-[120px]">
        {displayed.map((d, i) => {
          const heightPct = maxSaving > 0 ? (d.saving / maxSaving) * 100 : 0
          const label = d.month.slice(5) // "MM" from "YYYY-MM"

          return (
            <div key={d.month} className="flex flex-col items-center gap-1 flex-1 group">
              {/* Bar */}
              <div className="w-full flex items-end flex-1">
                <motion.div
                  className="w-full rounded-t-md"
                  style={{
                    background: 'linear-gradient(to top, #E2000C, #EE6904)',
                    minHeight: d.saving > 0 ? 4 : 2,
                    opacity: d.saving > 0 ? 1 : 0.15,
                  }}
                  initial={{ height: 0 }}
                  whileInView={{ height: `${heightPct}%` }}
                  viewport={{ once: true }}
                  transition={{ duration: 0.5, delay: i * 0.04, ease: 'easeOut' }}
                />
              </div>
              {/* Month label */}
              <span className="font-mono text-[9px] text-navy/30 tracking-wide">{label}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create apps/customer-web/components/account/RedemptionList.tsx**

```typescript
'use client'
import { useState, useCallback } from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { savingsApi } from '@/lib/api'

type Redemption = {
  id: string
  redeemedAt: string
  estimatedSaving: number
  isValidated: boolean
  // ⚠️ Backend note: merchant.name may be undefined if the backend bug (selecting
  // non-existent field `name` instead of `businessName`) is present. If the page
  // shows blank merchant names, check src/api/customer/savings/service.ts line 137.
  merchant: { id: string; name: string | undefined; logoUrl: string | null }
  voucher: { id: string; title: string; voucherType: string }
  branch: { id: string; name: string }
}

type Props = { initial: Redemption[]; total: number }

export function RedemptionList({ initial, total }: Props) {
  const [items, setItems] = useState<Redemption[]>(initial)
  const [loading, setLoading] = useState(false)

  const loadMore = useCallback(async () => {
    setLoading(true)
    try {
      const data = await savingsApi.getRedemptions({ limit: 20, offset: items.length })
      setItems(prev => [...prev, ...data.redemptions])
    } finally {
      setLoading(false)
    }
  }, [items.length])

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <span className="text-4xl mb-3 block" aria-hidden>🎟</span>
        <p className="font-display text-[20px] text-navy mb-1">No redemptions yet</p>
        <p className="text-[14px] text-navy/45">Redeem vouchers in the Redeemo app to see them here.</p>
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        {items.map((r, i) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: Math.min(i, 5) * 0.06 }}
            className="bg-white border border-navy/[0.08] rounded-2xl p-4 flex items-center gap-4"
          >
            {/* Merchant logo */}
            <div className="w-10 h-10 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0">
              {r.merchant.logoUrl
                ? <Image src={r.merchant.logoUrl} alt="" width={40} height={40} className="object-cover" />
                : <div className="w-full h-full" />
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="font-medium text-[14px] text-navy truncate">
                {r.merchant.name ?? r.merchant.id}
              </p>
              <p className="text-[12px] text-navy/45 truncate">{r.voucher.title}</p>
              <p className="font-mono text-[11px] text-navy/30 mt-0.5">
                {r.branch.name} · {new Date(r.redeemedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            {/* Right: saving + validated */}
            <div className="flex flex-col items-end gap-1 flex-shrink-0">
              {r.estimatedSaving > 0 && (
                <span className="font-mono text-[13px] font-bold text-red">
                  £{r.estimatedSaving.toFixed(2)}
                </span>
              )}
              {r.isValidated && (
                <span className="font-mono text-[10px] text-green-600 tracking-wide">✓ Validated</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>

      {items.length < total && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={loadMore}
            disabled={loading}
            className="font-mono text-[12px] tracking-[0.1em] uppercase text-navy/45 border border-navy/[0.15] rounded-xl px-8 py-3 hover:border-navy/30 transition-colors disabled:opacity-50"
          >
            {loading ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/app/account/savings/page.tsx**

```typescript
import type { Metadata } from 'next'
import { savingsApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { SavingsChart } from '@/components/account/SavingsChart'
import { RedemptionList } from '@/components/account/RedemptionList'
import Image from 'next/image'

export const metadata: Metadata = { title: 'My Savings' }

// Animated counter for hero stats — client-side only via CSS animation
// Uses CSS @property + transition trick: no JS counter needed
function HeroStat({ label, value, prefix = '' }: { label: string; value: number; prefix?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">{label}</span>
      <span className="font-display text-[clamp(36px,5vw,60px)] text-white leading-none">
        {prefix}{value.toFixed(2)}
      </span>
    </div>
  )
}

export default async function SavingsPage() {
  const [summaryResult, redemptionsResult] = await Promise.allSettled([
    savingsApi.getSummary(),
    savingsApi.getRedemptions({ limit: 20, offset: 0 }),
  ])

  const summary = summaryResult.status === 'fulfilled' ? summaryResult.value : null
  const redemptions = redemptionsResult.status === 'fulfilled' ? redemptionsResult.value : null

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav />

      {/* Hero stat band — navy background, full-width editorial */}
      <div className="bg-deep-navy px-6 py-12 relative overflow-hidden">
        {/* Subtle diagonal shard */}
        <div
          aria-hidden
          className="absolute inset-0 pointer-events-none"
          style={{ background: 'linear-gradient(135deg, rgba(226,0,12,0.06) 0%, transparent 60%)' }}
        />
        <div className="max-w-screen-xl mx-auto lg:flex lg:gap-12 relative z-10">
          <div className="hidden lg:block w-56 flex-shrink-0" />
          <div className="flex flex-col sm:flex-row gap-10 sm:gap-16">
            <HeroStat
              label="Lifetime savings"
              value={summary?.lifetimeSaving ?? 0}
              prefix="£"
            />
            <div className="w-px bg-white/[0.08] hidden sm:block" />
            <HeroStat
              label="This month"
              value={summary?.thisMonthSaving ?? 0}
              prefix="£"
            />
            <div className="w-px bg-white/[0.08] hidden sm:block" />
            <div className="flex flex-col gap-1">
              <span className="font-mono text-[10px] tracking-[0.12em] uppercase text-white/35">
                Redemptions this month
              </span>
              <span className="font-display text-[clamp(36px,5vw,60px)] text-white leading-none">
                {summary?.thisMonthRedemptionCount ?? 0}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <div className="hidden lg:block w-56 flex-shrink-0" />
        <main className="flex-1 flex flex-col gap-8">
          {/* Monthly bar chart */}
          {summary?.monthlyBreakdown && summary.monthlyBreakdown.length > 0 && (
            <SavingsChart data={summary.monthlyBreakdown} />
          )}

          {/* By merchant this month */}
          {summary?.byMerchant && summary.byMerchant.length > 0 && (
            <div className="bg-[#F4F2EF] rounded-2xl p-6">
              <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-5">
                By merchant — this month
              </p>
              <div className="flex flex-col gap-3">
                {summary.byMerchant.map(m => (
                  <div key={m.merchantId} className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-white overflow-hidden flex-shrink-0 border border-navy/[0.06]">
                      {m.logoUrl && (
                        <Image src={m.logoUrl} alt="" width={32} height={32} className="object-cover" />
                      )}
                    </div>
                    <span className="flex-1 text-[14px] text-navy">{m.businessName}</span>
                    <span className="font-mono text-[13px] text-red font-bold">
                      £{m.saving.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Redemption history */}
          <div>
            <p className="font-mono text-[11px] tracking-[0.1em] uppercase text-navy/35 mb-5">
              Redemption history
            </p>
            <RedemptionList
              initial={redemptions?.redemptions ?? []}
              total={redemptions?.total ?? 0}
            />
          </div>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 5: Visually verify in browser**

Open `http://localhost:3001/account/savings`. Verify:
- Navy hero band with three stat columns renders (zeros are correct if no seed redemptions)
- Monthly chart renders — if all zeros, bars show at minimum height (the `minHeight: 2` fallback)
- By merchant section absent if no seed redemptions this month (correct)
- Redemption history shows empty state with ticket emoji if no seed data
- No console errors

⚠️ If the page throws a 500, check `src/api/customer/savings/service.ts` line 137 — the `merchant.name` vs `businessName` field bug. Report to owner before proceeding.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-web/app/account/savings/ \
        apps/customer-web/components/account/SavingsChart.tsx \
        apps/customer-web/components/account/RedemptionList.tsx
git commit -m "feat: add savings page with stat hero band, monthly chart, and redemption history"
```

---

## Task 12: Favourites Page (`/account/favourites`)

**Files:**
- Create: `apps/customer-web/app/account/favourites/page.tsx`
- Create: `apps/customer-web/components/account/FavouritesList.tsx`

**Verified routes:**
- `GET /api/v1/customer/favourites/merchants` → `[{ id, businessName, tradingName, logoUrl, status, primaryCategory:{id,name}, vouchers:[{id,title,estimatedSaving,type}][] (max 2), favouritedAt }]`
- `GET /api/v1/customer/favourites/vouchers` → `[{ id, title, type, estimatedSaving, imageUrl, status, approvalStatus, merchant:{id,businessName,logoUrl}, favouritedAt }]`
- `DELETE /api/v1/customer/favourites/merchants/:merchantId` → `{ success: true }`
- `DELETE /api/v1/customer/favourites/vouchers/:voucherId` → `{ success: true }`

**Favourite merchant tile shape (exact):**
```typescript
type FavouriteMerchant = {
  id: string
  businessName: string
  tradingName: string | null
  logoUrl: string | null
  status: string          // always ACTIVE (filtered server-side)
  primaryCategory: { id: string; name: string } | null
  vouchers: { id: string; title: string; estimatedSaving: unknown; type: string }[]  // max 2
  favouritedAt: Date
}
```

**Favourite voucher shape (exact):**
```typescript
type FavouriteVoucher = {
  id: string
  title: string
  type: string
  estimatedSaving: unknown    // Decimal — cast to Number()
  imageUrl: string | null
  status: string
  approvalStatus: string
  merchant: { id: string; businessName: string; logoUrl: string | null }
  favouritedAt: Date
}
```

**Design direction — REQUIRED:**

Two-tab layout: "Merchants" and "Vouchers". Tab switching is client-side (no page navigation). Each tab shows a responsive grid of cards. Remove button (heart with X) on each card with optimistic delete + undo toast.

- **Merchant favourite card**: logo circle + name in Calistoga + category badge + up-to-2 voucher pills. Link to `/merchants/[id]`. Remove heart top-right.
- **Voucher favourite card**: title in Calistoga + merchant name + type badge + saving chip. "Redeem in app" label (website rule). Remove heart top-right.
- Framer Motion: cards stagger in on tab switch (`AnimatePresence` + `mode="wait"`); removed card animates `scale: 1→0.8, opacity: 1→0` before unmounting.
- No Magic MCP callout — these cards are close enough to `MerchantTile` and `VoucherCard` from earlier tasks to implement directly. Executor should reuse those components or derive from them rather than generating new ones.

---

- [ ] **Step 1: Create apps/customer-web/components/account/FavouritesList.tsx**

```typescript
'use client'
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import Image from 'next/image'
import Link from 'next/link'
import { favouritesApi } from '@/lib/api'

type FavouriteMerchant = {
  id: string; businessName: string; tradingName: string | null; logoUrl: string | null
  primaryCategory: { id: string; name: string } | null
  vouchers: { id: string; title: string; estimatedSaving: unknown; type: string }[]
  favouritedAt: string
}

type FavouriteVoucher = {
  id: string; title: string; type: string; estimatedSaving: unknown
  imageUrl: string | null
  merchant: { id: string; businessName: string; logoUrl: string | null }
  favouritedAt: string
}

type Props = {
  merchants: FavouriteMerchant[]
  vouchers: FavouriteVoucher[]
}

type Tab = 'merchants' | 'vouchers'

function MerchantCard({ m, onRemove }: { m: FavouriteMerchant; onRemove: (id: string) => void }) {
  const name = m.tradingName ?? m.businessName
  return (
    <motion.div
      layout
      exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.2 } }}
      className="bg-white border border-navy/[0.08] rounded-2xl overflow-hidden relative group"
    >
      {/* Remove button */}
      <button
        onClick={() => onRemove(m.id)}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 border border-navy/[0.08] flex items-center justify-center text-navy/30 hover:text-red hover:border-red/20 transition-colors z-10"
        aria-label="Remove from favourites"
      >
        ✕
      </button>

      <Link href={`/merchants/${m.id}`} className="block p-5 no-underline">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0">
            {m.logoUrl && <Image src={m.logoUrl} alt="" width={40} height={40} className="object-cover" />}
          </div>
          <div className="min-w-0">
            {m.primaryCategory && (
              <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-orange-red block">
                {m.primaryCategory.name}
              </span>
            )}
            <p className="font-display text-[17px] text-navy leading-snug truncate">{name}</p>
          </div>
        </div>

        {m.vouchers.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {m.vouchers.slice(0, 2).map(v => (
              <span
                key={v.id}
                className="text-[11px] text-navy/55 bg-navy/[0.04] border border-navy/[0.07] rounded-full px-2.5 py-0.5 truncate max-w-[140px]"
              >
                {v.title}
              </span>
            ))}
          </div>
        )}
      </Link>
    </motion.div>
  )
}

function VoucherCard({ v, onRemove }: { v: FavouriteVoucher; onRemove: (id: string) => void }) {
  const saving = Number(v.estimatedSaving)
  return (
    <motion.div
      layout
      exit={{ scale: 0.85, opacity: 0, transition: { duration: 0.2 } }}
      className="bg-white border border-navy/[0.08] rounded-2xl p-5 relative"
    >
      {/* Remove button */}
      <button
        onClick={() => onRemove(v.id)}
        className="absolute top-3 right-3 w-7 h-7 rounded-full bg-white/90 border border-navy/[0.08] flex items-center justify-center text-navy/30 hover:text-red hover:border-red/20 transition-colors"
        aria-label="Remove from favourites"
      >
        ✕
      </button>

      {/* Merchant info */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-6 h-6 rounded-full bg-navy/[0.06] overflow-hidden flex-shrink-0">
          {v.merchant.logoUrl && (
            <Image src={v.merchant.logoUrl} alt="" width={24} height={24} className="object-cover" />
          )}
        </div>
        <span className="font-mono text-[11px] text-navy/45 truncate">{v.merchant.businessName}</span>
      </div>

      <p className="font-display text-[18px] text-navy leading-snug mb-2 pr-8">{v.title}</p>

      <div className="flex flex-wrap gap-2 mb-3">
        <span className="font-mono text-[10px] tracking-[0.08em] uppercase text-navy/45 border border-navy/[0.1] rounded-full px-2.5 py-0.5">
          {v.type.replace(/_/g, ' ')}
        </span>
        {!isNaN(saving) && saving > 0 && (
          <span className="text-[11px] font-semibold text-red bg-red/[0.07] px-2.5 py-0.5 rounded-full">
            Save up to £{saving.toFixed(0)}
          </span>
        )}
      </div>

      <p className="font-mono text-[11px] text-orange-red tracking-wide">📱 Redeem in the Redeemo app</p>
    </motion.div>
  )
}

export function FavouritesList({ merchants: initialMerchants, vouchers: initialVouchers }: Props) {
  const [tab, setTab] = useState<Tab>('merchants')
  const [merchants, setMerchants] = useState(initialMerchants)
  const [vouchers, setVouchers] = useState(initialVouchers)

  const removeMerchant = async (id: string) => {
    setMerchants(prev => prev.filter(m => m.id !== id))
    try {
      await favouritesApi.removeMerchant(id)
    } catch {
      // Silently fail — the item is already removed from UI
    }
  }

  const removeVoucher = async (id: string) => {
    setVouchers(prev => prev.filter(v => v.id !== id))
    try {
      await favouritesApi.removeVoucher(id)
    } catch {
      // Silently fail
    }
  }

  const isEmpty = tab === 'merchants' ? merchants.length === 0 : vouchers.length === 0

  return (
    <div>
      {/* Tab bar */}
      <div className="flex gap-1 mb-8 border-b border-navy/[0.06] pb-0">
        {(['merchants', 'vouchers'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`relative px-5 py-3 font-mono text-[12px] tracking-[0.08em] uppercase transition-colors ${
              tab === t ? 'text-navy' : 'text-navy/40 hover:text-navy/70'
            }`}
          >
            {t === 'merchants' ? `Merchants (${merchants.length})` : `Vouchers (${vouchers.length})`}
            {tab === t && (
              <motion.span
                layoutId="fav-tab-indicator"
                className="absolute bottom-0 left-0 right-0 h-[2px] bg-gradient-to-r from-red to-orange-red"
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        {isEmpty ? (
          <motion.div
            key={`empty-${tab}`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="text-center py-16"
          >
            <span className="text-4xl mb-3 block" aria-hidden>{tab === 'merchants' ? '🏪' : '🎟'}</span>
            <p className="font-display text-[22px] text-navy mb-1">
              No favourite {tab} yet
            </p>
            <p className="text-[14px] text-navy/45">
              {tab === 'merchants'
                ? 'Heart a merchant on the discover feed to save it here.'
                : 'Heart a voucher on a merchant profile to save it here.'}
            </p>
          </motion.div>
        ) : (
          <motion.div
            key={tab}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.25 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            <AnimatePresence>
              {tab === 'merchants'
                ? merchants.map(m => (
                    <MerchantCard key={m.id} m={m} onRemove={removeMerchant} />
                  ))
                : vouchers.map(v => (
                    <VoucherCard key={v.id} v={v} onRemove={removeVoucher} />
                  ))
              }
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
```

- [ ] **Step 2: Create apps/customer-web/app/account/favourites/page.tsx**

```typescript
import type { Metadata } from 'next'
import { favouritesApi } from '@/lib/api'
import { AccountNav } from '@/components/account/AccountNav'
import { FavouritesList } from '@/components/account/FavouritesList'

export const metadata: Metadata = { title: 'Favourites' }

export default async function FavouritesPage() {
  const [merchantsResult, vouchersResult] = await Promise.allSettled([
    favouritesApi.listMerchants(),
    favouritesApi.listVouchers(),
  ])

  const merchants = merchantsResult.status === 'fulfilled' ? merchantsResult.value : []
  const vouchers = vouchersResult.status === 'fulfilled' ? vouchersResult.value : []

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <div className="hidden lg:block w-56 flex-shrink-0" />
        <main className="flex-1">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">Favourites</h1>
          </div>
          <FavouritesList merchants={merchants} vouchers={vouchers} />
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 4: Visually verify in browser**

Open `http://localhost:3001/account/favourites`. Verify:
- Two tabs: "Merchants (N)" and "Vouchers (N)"
- Tab switch animates content in/out
- Empty states render correctly if no seed favourites
- Remove button (✕) top-right of each card — clicking removes card with scale-out animation
- Merchant cards link to `/merchants/[id]`
- Voucher cards show "Redeem in the Redeemo app" — no redeem button
- No console errors

- [ ] **Step 5: Commit**

```bash
git add apps/customer-web/app/account/favourites/ \
        apps/customer-web/components/account/FavouritesList.tsx
git commit -m "feat: add favourites page with merchant and voucher tabs, optimistic remove"
```

---

## Task 13: Forgot Password + Reset Password Pages

**Spec:** A5 (Forgot Password) and A6 (Reset Password) — both web: yes.

**Backend routes verified from `src/api/auth/customer/routes.ts`:**
- `POST /api/v1/customer/auth/forgot-password` — body: `{ email }` → `{ message: string }` (rate-limited: 3/hour; always returns 200 — no email oracle)
- `POST /api/v1/customer/auth/reset-password` — body: `{ token: string, newPassword: string }` → `{ message: string }` (token arrives via email link: `?token=<hex>`)

**Files:**
- Create: `apps/customer-web/app/forgot-password/page.tsx`
- Create: `apps/customer-web/app/reset-password/page.tsx`
- Modify: `apps/customer-web/lib/api.ts` (add `authApi.forgotPassword` and `authApi.resetPassword`)

**Design brief:** Use the same `AuthShell` layout as login/register (Task 8). Each page is a single-field form with the brand panel on the left. Atmosphere: same diagonal shard + warm glow + oversized decorative "R". These are low-traffic, high-trust moments — keep them calm and clear, no over-engineering.

- [ ] **Step 1: Add forgot/reset password methods to lib/api.ts**

Open `apps/customer-web/lib/api.ts`. Locate the `export const authApi = {` block. Add two methods at the end of the object (before the closing `}`):

```typescript
  forgotPassword: (email: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/forgot-password', {
      method: 'POST',
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, newPassword: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ token, newPassword }),
    }),
```

- [ ] **Step 2: Create apps/customer-web/app/forgot-password/page.tsx**

```typescript
'use client'
import { useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthShell } from '@/components/auth/AuthShell'
import { authApi } from '@/lib/api'

export default function ForgotPasswordPage() {
  const [email, setEmail]     = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent]       = useState(false)
  const [error, setError]     = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      await authApi.forgotPassword(email)
      setSent(true)
    } catch {
      // Never reveal whether email exists — always show the same message
      setSent(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="sent"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Password reset</p>
            <h1 className="font-display text-[clamp(26px,4vw,36px)] text-navy leading-tight mb-4">
              Check your inbox
            </h1>
            <p className="text-[15px] text-navy/60 leading-relaxed mb-8">
              If <span className="text-navy font-medium">{email}</span> is registered, we've sent a reset link. Check your spam folder if it doesn't arrive within a couple of minutes.
            </p>
            <Link
              href="/login"
              className="text-[14px] text-navy/50 hover:text-navy transition-colors underline underline-offset-4"
            >
              Back to login
            </Link>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          >
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Password reset</p>
            <h1 className="font-display text-[clamp(26px,4vw,36px)] text-navy leading-tight mb-2">
              Forgot your password?
            </h1>
            <p className="text-[15px] text-navy/55 mb-8">
              Enter your email and we'll send you a reset link.
            </p>

            {error && (
              <p className="text-[13px] text-red mb-4">{error}</p>
            )}

            <div className="mb-6">
              <label className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">Email</label>
              <input
                type="email"
                required
                autoFocus
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full bg-red text-white font-medium text-[15px] py-4 rounded-xl hover:opacity-90 transition disabled:opacity-60 mb-4"
            >
              {loading ? 'Sending…' : 'Send reset link'}
            </button>

            <Link
              href="/login"
              className="block text-center text-[14px] text-navy/45 hover:text-navy transition-colors"
            >
              Back to login
            </Link>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
```

- [ ] **Step 3: Create apps/customer-web/app/reset-password/page.tsx**

The token arrives as a query param: `/reset-password?token=<hex>`. If the token is missing or invalid (backend returns error), show an error state with a link back to forgot-password.

```typescript
'use client'
import { useState, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AuthShell } from '@/components/auth/AuthShell'
import { authApi } from '@/lib/api'

function ResetPasswordForm() {
  const params    = useSearchParams()
  const token     = params.get('token') ?? ''
  const router    = useRouter()
  const [newPassword, setNewPassword] = useState('')
  const [confirm, setConfirm]         = useState('')
  const [loading, setLoading]         = useState(false)
  const [done, setDone]               = useState(false)
  const [error, setError]             = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    if (newPassword !== confirm) {
      setError('Passwords do not match.')
      return
    }
    if (!token) {
      setError('Reset link is missing or invalid. Please request a new one.')
      return
    }
    setLoading(true)
    try {
      await authApi.resetPassword(token, newPassword)
      setDone(true)
      setTimeout(() => router.push('/login'), 2500)
    } catch (err: any) {
      const code = err?.code ?? ''
      if (code === 'TOKEN_INVALID' || code === 'TOKEN_EXPIRED') {
        setError('This reset link has expired or already been used. Please request a new one.')
      } else if (code === 'PASSWORD_POLICY_VIOLATION') {
        setError('Password must be at least 8 characters and include a number and uppercase letter.')
      } else {
        setError('Something went wrong. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <AuthShell>
      <AnimatePresence mode="wait">
        {done ? (
          <motion.div
            key="done"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Password reset</p>
            <h1 className="font-display text-[clamp(26px,4vw,36px)] text-navy leading-tight mb-4">
              Password updated
            </h1>
            <p className="text-[15px] text-navy/60 mb-8">
              Your password has been changed. Redirecting you to login…
            </p>
            <Link href="/login" className="text-[14px] text-navy/50 hover:text-navy transition underline underline-offset-4">
              Go to login
            </Link>
          </motion.div>
        ) : (
          <motion.form
            key="form"
            onSubmit={handleSubmit}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Password reset</p>
            <h1 className="font-display text-[clamp(26px,4vw,36px)] text-navy leading-tight mb-2">
              Set a new password
            </h1>
            <p className="text-[15px] text-navy/55 mb-8">
              Choose a new password. Min 8 characters, at least one number and uppercase letter.
            </p>

            {error && (
              <div className="mb-5 p-3.5 bg-red/[0.06] border border-red/20 rounded-xl">
                <p className="text-[13px] text-red leading-snug">{error}</p>
                {(error.includes('expired') || error.includes('invalid')) && (
                  <Link href="/forgot-password" className="text-[13px] text-red underline underline-offset-3 mt-1 inline-block">
                    Request a new reset link
                  </Link>
                )}
              </div>
            )}

            <div className="space-y-4 mb-6">
              <div>
                <label className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">New password</label>
                <input
                  type="password"
                  required
                  autoFocus
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                />
              </div>
              <div>
                <label className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">Confirm password</label>
                <input
                  type="password"
                  required
                  value={confirm}
                  onChange={e => setConfirm(e.target.value)}
                  className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[15px] text-navy placeholder:text-navy/25 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={loading || !token}
              className="w-full bg-red text-white font-medium text-[15px] py-4 rounded-xl hover:opacity-90 transition disabled:opacity-60"
            >
              {loading ? 'Updating…' : 'Update password'}
            </button>
          </motion.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}

// useSearchParams must be wrapped in Suspense in Next.js App Router
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}
```

- [ ] **Step 4: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 5: Visually verify in browser**

Forgot password (`http://localhost:3001/forgot-password`):
- Single email field, "Send reset link" button
- On submit: form is replaced with "Check your inbox" message showing the email typed
- "Back to login" link visible at both stages
- No visible error when backend silently accepts any email

Reset password (`http://localhost:3001/reset-password?token=abc123`):
- Two password fields (new + confirm)
- Mismatch shows inline "Passwords do not match."
- Success: replaced with confirmation text, redirects to `/login` after 2.5s
- Missing token (`?token=` absent): error state shown inline with link to `/forgot-password`

- [ ] **Step 6: Commit**

```bash
git add apps/customer-web/app/forgot-password/ \
        apps/customer-web/app/reset-password/
git commit -m "feat: add forgot-password and reset-password pages"
```

---

## Task 14: Delete Account Page

**Spec:** AC5 — web: yes. The delete-account flow is OTP-gated: the user must have a verified phone number on file. If they don't, the flow explains this and directs them to add one (out of scope — show a message only).

**Backend routes verified from `src/api/auth/customer/routes.ts`:**
- `POST /api/v1/customer/auth/otp/send` — body: `{ action: 'ACCOUNT_DELETION' }` (auth required; requires verified phone — returns `PHONE_NOT_VERIFIED` error if not set) → `{ message }`
- `POST /api/v1/customer/auth/otp/verify` — body: `{ code: string }` (auth required) → `{ verified: true, actionToken: string, action: string }` (actionToken valid 300s)
- `POST /api/v1/customer/auth/delete-account` — body: `{ actionToken: string }` (auth required) → `{ message }` — anonymises user record, revokes all sessions

**Files:**
- Create: `apps/customer-web/app/account/delete/page.tsx`
- Modify: `apps/customer-web/lib/api.ts` (add `authApi.sendDeletionOtp`, `authApi.verifyDeletionOtp`, `authApi.deleteAccount`)
- Modify: `apps/customer-web/app/account/page.tsx` — add "Delete account" link to the hub page destructive zone

**Design brief:** Deep navy danger zone. The page sits inside the account layout but uses a deliberately stark, heavy treatment to communicate the weight of the action. Three sequential states: `'confirm'` (warning + "Send code" button), `'otp'` (6-digit code entry), `'done'` (anonymised, session cleared, redirect to `/`). No undo.

- [ ] **Step 1: Add deletion methods to lib/api.ts**

Open `apps/customer-web/lib/api.ts`. Add to `authApi`:

```typescript
  sendDeletionOtp: () =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/otp/send', {
      method: 'POST', auth: true,
      body: JSON.stringify({ action: 'ACCOUNT_DELETION' }),
    }),

  verifyDeletionOtp: (code: string) =>
    apiFetch<{ verified: boolean; actionToken: string; action: string }>(
      '/api/v1/customer/auth/otp/verify', {
        method: 'POST', auth: true,
        body: JSON.stringify({ code }),
      }
    ),

  deleteAccount: (actionToken: string) =>
    apiFetch<{ message: string }>('/api/v1/customer/auth/delete-account', {
      method: 'POST', auth: true,
      body: JSON.stringify({ actionToken }),
    }),
```

- [ ] **Step 2: Create apps/customer-web/app/account/delete/page.tsx**

```typescript
'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { AccountNav } from '@/components/account/AccountNav'
import { authApi } from '@/lib/api'
import { clearTokens } from '@/lib/auth'

type Stage = 'confirm' | 'otp' | 'done'

export default function DeleteAccountPage() {
  const router          = useRouter()
  const [stage, setStage]   = useState<Stage>('confirm')
  const [code, setCode]     = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError]   = useState<string | null>(null)

  // Step 1: request OTP
  async function requestOtp() {
    setError(null)
    setLoading(true)
    try {
      await authApi.sendDeletionOtp()
      setStage('otp')
    } catch (err: any) {
      const c = err?.code ?? ''
      if (c === 'PHONE_NOT_VERIFIED') {
        setError('You need a verified phone number to delete your account. Please add one in your profile settings first.')
      } else {
        setError('Failed to send verification code. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  // Step 2: submit OTP → get actionToken → delete
  async function submitOtp(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const { actionToken } = await authApi.verifyDeletionOtp(code)
      await authApi.deleteAccount(actionToken)
      clearTokens()
      setStage('done')
      setTimeout(() => router.push('/'), 3000)
    } catch (err: any) {
      const c = err?.code ?? ''
      if (c === 'OTP_INVALID') setError('Incorrect code. Please try again.')
      else if (c === 'OTP_MAX_ATTEMPTS') setError('Too many attempts. Please request a new code.')
      else if (c === 'ACTION_TOKEN_INVALID') setError('Verification expired. Please start over.')
      else setError('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[#FAF8F5]">
      <AccountNav />
      <div className="max-w-screen-xl mx-auto px-6 py-10 lg:flex lg:gap-12">
        <div className="hidden lg:block w-56 flex-shrink-0" />
        <main className="flex-1 max-w-lg">
          <div className="mb-8">
            <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-2">Account</p>
            <h1 className="font-display text-[clamp(26px,4vw,38px)] text-navy leading-none">Delete account</h1>
          </div>

          <AnimatePresence mode="wait">
            {stage === 'confirm' && (
              <motion.div
                key="confirm"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {/* Warning panel */}
                <div className="bg-deep-navy rounded-2xl p-8 mb-6 relative overflow-hidden">
                  {/* Subtle diagonal shard */}
                  <div
                    className="absolute inset-0 pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, rgba(226,0,12,0.12) 0%, transparent 50%)',
                    }}
                  />
                  <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-red/80 mb-4">Permanent action</p>
                  <h2 className="font-display text-[22px] text-white leading-snug mb-4">
                    This cannot be undone
                  </h2>
                  <ul className="space-y-2 mb-0">
                    {[
                      'Your account will be permanently anonymised',
                      'Your subscription will be cancelled immediately',
                      'Your saved favourites and redemption history will be removed',
                      'You will be signed out on all devices',
                    ].map(item => (
                      <li key={item} className="flex items-start gap-2.5 text-[14px] text-white/65 leading-snug">
                        <span className="text-red mt-0.5 flex-shrink-0">×</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>

                {error && (
                  <p className="text-[13px] text-red mb-4 bg-red/[0.06] border border-red/20 rounded-xl px-4 py-3">{error}</p>
                )}

                <p className="text-[14px] text-navy/55 mb-6">
                  We'll send a verification code to your registered phone number to confirm.
                </p>

                <div className="flex gap-3">
                  <button
                    onClick={requestOtp}
                    disabled={loading}
                    className="flex-1 bg-red text-white font-medium text-[15px] py-3.5 rounded-xl hover:opacity-90 transition disabled:opacity-60"
                  >
                    {loading ? 'Sending code…' : 'Send verification code'}
                  </button>
                  <Link
                    href="/account"
                    className="flex-1 bg-white border border-navy/[0.12] text-navy font-medium text-[15px] py-3.5 rounded-xl text-center hover:bg-navy/[0.03] transition"
                  >
                    Cancel
                  </Link>
                </div>
              </motion.div>
            )}

            {stage === 'otp' && (
              <motion.form
                key="otp"
                onSubmit={submitOtp}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="text-[15px] text-navy/60 mb-6">
                  Enter the 6-digit code sent to your phone.
                </p>

                {error && (
                  <p className="text-[13px] text-red mb-4 bg-red/[0.06] border border-red/20 rounded-xl px-4 py-3">{error}</p>
                )}

                <div className="mb-6">
                  <label className="block text-[12px] font-medium text-navy/60 mb-1.5 uppercase tracking-wide">Verification code</label>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="\d{6}"
                    maxLength={6}
                    required
                    autoFocus
                    value={code}
                    onChange={e => setCode(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                    className="w-full bg-white border border-navy/[0.1] rounded-xl px-4 py-3.5 text-[20px] text-navy font-mono tracking-[0.3em] text-center placeholder:text-navy/20 focus:outline-none focus:border-red/40 focus:ring-2 focus:ring-red/[0.08] transition"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || code.length !== 6}
                  className="w-full bg-red text-white font-medium text-[15px] py-4 rounded-xl hover:opacity-90 transition disabled:opacity-60 mb-3"
                >
                  {loading ? 'Deleting account…' : 'Confirm account deletion'}
                </button>

                <button
                  type="button"
                  onClick={() => { setStage('confirm'); setCode(''); setError(null) }}
                  className="w-full text-[14px] text-navy/40 hover:text-navy transition py-2"
                >
                  Start over
                </button>
              </motion.form>
            )}

            {stage === 'done' && (
              <motion.div
                key="done"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                <p className="font-mono text-[11px] tracking-[0.12em] uppercase text-navy/35 mb-4">Done</p>
                <h2 className="font-display text-[28px] text-navy leading-tight mb-4">
                  Your account has been deleted.
                </h2>
                <p className="text-[15px] text-navy/55 mb-6">
                  We're sorry to see you go. Redirecting you to the home page…
                </p>
                <Link href="/" className="text-[14px] text-navy/45 hover:text-navy transition underline underline-offset-4">
                  Go to home page
                </Link>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Add delete account link to account hub**

Open `apps/customer-web/app/account/page.tsx`. At the bottom of the main content area (after the quick-links grid), add a destructive zone:

```typescript
{/* Destructive zone — visually separated */}
<div className="mt-12 pt-8 border-t border-navy/[0.08]">
  <Link
    href="/account/delete"
    className="text-[13px] text-navy/35 hover:text-red transition-colors"
  >
    Delete account
  </Link>
</div>
```

- [ ] **Step 4: Run typecheck — must pass**

```bash
cd apps/customer-web && npm run typecheck
```

Expected: `Found 0 errors.`

- [ ] **Step 5: Visually verify in browser**

Open `http://localhost:3001/account/delete`:
- Deep navy warning panel with red shard, consequences list
- "Send verification code" triggers OTP step (error in dev: PHONE_NOT_VERIFIED if seed user has no phone — inline error explains this clearly)
- OTP stage: 6-digit input, monospace centred, numeric keyboard on mobile
- "Start over" returns to confirm stage
- Done stage: confirmation message, redirect to `/`
- "Delete account" link visible at bottom of `/account` page hub

- [ ] **Step 6: Commit**

```bash
git add apps/customer-web/app/account/delete/ \
        apps/customer-web/app/account/page.tsx
git commit -m "feat: add delete account page with OTP-gated confirmation flow"
```

---

## Self-Review Summary (completed)

**Spec gaps fixed:** Added Task 13 (forgot-password A5, reset-password A6) and Task 14 (delete account AC5) — both were spec'd for web but missing from the original draft.

**Type inconsistencies fixed:**
1. `MerchantTileData` in `lib/api.ts` now matches the full shape used in `MerchantTile.tsx` (businessName, tradingName, bannerUrl, avgRating, etc.) — duplicate definition in `MerchantTile.tsx` replaced with a re-export alias.
2. `favouritesApi` method renamed `merchants` → `listMerchants`; missing `listVouchers()` and `removeVoucher()` methods added to match `FavouritesList.tsx` and `FavouritesPage` call sites.
3. `SavingsSummary.monthlyBreakdown` field renamed `label` → `month` to match backend `getSavingsSummary` return shape. `byMerchant` and `byCategory` field names aligned to backend exactly (`businessName`, `name` instead of `merchantName`, `categoryName`).

**No placeholder issues found** (TBD, TODO, implement later — none present).

---

Plan complete and saved to `docs/superpowers/plans/2026-04-12-customer-website.md`. Two execution options:

**1. Subagent-Driven (recommended)** — fresh subagent per task, two-stage review between tasks (spec compliance then code quality), fast iteration

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?
