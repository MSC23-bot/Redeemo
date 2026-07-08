# Plan: Merchant Portal — Skeleton loading states (A8) + data-fetch parallelization audit (A9)

Status: ACTIVE. Tier 2 (multi-file UI, additive only). Base: main @ `f470f659` (post #418).

## 0. Goal

Replace the generic literal "Loading X..." text (and a couple of bare spinner-less blank
states) with layout-matching skeleton placeholders across the highest-value merchant-web
surfaces (A8), and separately audit the app for sequential-await data-fetch waterfalls,
proposing fixes but landing only the trivial/isolated/safe ones in this same PR (A9).

## 1. A8 — per-route audit approach

Enumerate every page under `app/(app)/*` (home, vouchers list + detail, redemptions,
branches list + detail, insights (+ report), business profile, my account, staff, help,
notifications, billing, promote, onboarding/*, foundations). For each, grep + read the
page/component to record the CURRENT loading treatment (verified against real code, not
the stale seed grep): every route in this app uses a literal `"Loading ...”` text string
inside a `role="status"` div gating the whole content slot; there is no `loading.tsx`
Suspense convention anywhere and no spinner component. Confirmed by a repo-wide grep for
`loading.tsx`, `Loading...`, and `role="status"`.

Findings feed a before/after table (route, current loading UI, source file:line, planned
skeleton) delivered in the PR body, not this plan.

## 2. Skeleton primitive design

New file `apps/merchant-web/components/ui/skeleton.tsx`:
- `Skeleton` — base rounded `bg-muted` block; a `usePrefersReducedMotion` hook (real
  `matchMedia('(prefers-reduced-motion: reduce)')` listener, not a CSS-only gate) decides
  whether `animate-pulse` is applied, so the behaviour is unit-testable via a mocked
  `matchMedia`.
- `SkeletonText`, `SkeletonCircle` — line/avatar bones built on `Skeleton`.
- `SkeletonCard` — a card-chrome bone (matches `components/ui/card.tsx` radii/border/bg)
  with a configurable number of text lines; covers KPI tiles, profile/account info cards,
  and voucher-card-shaped rows.
- `SkeletonTable` — header + N row bones; covers Redemptions/Branches tabular lists.
- `SkeletonChartBlock` — chart-card-shaped bone; covers TrendChart/BusiestDays fallbacks.
- `LoadingStatus` — wraps composed skeletons in a single `role="status" aria-live="polite"`
  region carrying the EXACT existing sr-only copy (so existing `getByText(/loading your
  account/i)`-style assertions keep passing) with the visual bones marked
  `aria-hidden="true"` beneath it, so no route ends up with more than one `role="status"`
  node (several existing tests assert `getByRole('status')` singular).

Tokens only (`bg-muted`, `bg-card`, `border-border` utilities already mapped from
`globals.css`); no new colours.

## 3. Wiring priority (adjust per actual audit findings)

Home dashboard → Vouchers list → Redemptions list → Branches list → Insights →
Business profile → My account. Shell/layout/sidebar/topbar untouched; only the
content-slot loading branch changes per page/component.

## 4. A9 audit approach

Grep every `app/(app)/**/page.tsx` and the components/hooks they call for: sequential
`await` chains with no data dependency between steps, and independent React Query hooks
that already run in parallel (React Query fires independent `useQuery` calls concurrently
by default, so most "waterfalls" worth flagging live in Next.js route handlers / server
helpers with sequential `await`, not in the client hook layer). Findings go in a full
table in the PR body (file:line, pattern, proposed fix, risk, est. saving, included y/n).
Only a fix that is trivial, isolated to one function, has no ordering/behavioural side
effect, and gets its own test proving the merge is safe lands in this PR; everything else
is proposal-only.

## 5. Verification

`npx jest`, `npx tsc --noEmit`, `eslint` on changed files only, in `apps/merchant-web`.
No merge; PR opened against `main` per the delivery instructions.
