# Merchant-web Home dashboard (Slice 1, reuse-only)

Status: DRAFT (owner-directed). Tier-2 frontend. NO backend/schema change. Unmerged PR.
Base: main @ 3c01a1f0. Prototype: mp-screens/home-1.png (Live), home-2.png (Live, just started).

## Decision (owner)

Home is a quick business-overview DASHBOARD, not a pointer to Insights. This slice REUSES
existing operational endpoints only; it adds no backend routes and no schema. Only the LIVE
lifecycle path of the merchant Home is replaced. All pre-live / read-only states
(setup / changes / submitted / in_review / suspended / rejected) stay EXACTLY as-is via
`LifecycleHome` and `StaircaseHub`.

## Gating

- `page.tsx` routes `live` / `live_new` to the new `HomeDashboard`; every other state is
  unchanged.
- Full dashboard renders ONLY for `profile.viewerCapabilities.canViewInsights` viewers
  (OWNER / BRANCH_MANAGER). Insights endpoints require canViewInsights and 403 for STAFF.
- A STAFF viewer (canViewInsights false) on a live business gets a LEAN live home
  (welcome card + quick actions) and NEVER calls any `/insights/*` endpoint. Staff Home
  proper is a separate not-started surface; this is only a safe fallback.

## Just-started threshold (FLAG for owner confirm)

`justStarted` = all-time redemptions === 0, derived from
`getInsightsOverview({ period: 'all' }).redemptionActivity.logged === 0`. This is a
reasonable default; owner to confirm the exact boundary (e.g. whether "awaiting-only"
counts as started).

## Wiring (prototype element -> endpoint / source)

Live dashboard (home-1, canViewInsights):
- Header "Welcome back, <firstName>" -> `profile.viewerCapabilities.displayName` (first word),
  fallback businessName; subtitle names businessName; inline "Live" status treatment.
- Redemptions-over-time chart -> `GET /insights/trend` (period all) via reused `<TrendChart>`.
- Busiest-days chart -> `GET /insights/busy-times` (period all) via reused `<Heatmap>`.
- KPI tile "Customers brought in" -> `overview.distinctCustomers.logged` (period all).
- KPI tile "New customers this cycle" -> STAGED gated/coming state. Maps to the
  behavioural new-vs-returning split which is default-OFF / fail-closed. Rendered as a
  clearly-gated "coming" tile (like the Insights Customers tab's available:false). NO number
  fabricated and NO ungated substitute presented as "new".
- KPI tile "Live vouchers" -> count of ACTIVE rows from `GET /merchant/vouchers` +
  `GET /merchant/vouchers/rmv`.
- KPI tile "Busiest day" -> `busy-times.busiest.day` mapped to a weekday; "gathering data"
  when busiest is null (threshold not set) or busy-times unavailable.
- "Needs your attention" (client-assembled): `profile.pendingEdits.length>0` ->
  "A profile change is in review" (/profile); branch `locationConfidence==='NEEDS_REVIEW'`
  -> "Confirm a branch location" (/branches); branch `pendingEdits.length>0` ->
  "A branch change is in review" (/branches); voucher `approvalStatus==='CHANGES_REQUESTED'`
  -> "A voucher needs changes" (/vouchers). Empty -> "all caught up" state.
- "Recent redemptions" -> `GET /merchant/redemptions?sort=recent&limit=5` (rows already
  first-name + last-initial only). Relative time via reused `formatRelativeTime`.
- "Your live vouchers" ranked list -> ACTIVE vouchers sorted by redemptionCount desc.

Just-started home (home-2, canViewInsights + zero all-time redemptions):
- Celebratory "<business> is live on Redeemo" banner.
- Placeholder chart ("Your first redemptions will show here") - NO charts-with-data.
- First-run tiles: Live vouchers ready (ACTIVE count) / first redemption on its way /
  visible on App and website.
- "Ways to bring in more customers" static tips grid (add vouchers -> /vouchers, add a
  photo -> /branches, consider featured placement -> /promote, check opening hours ->
  /branches).

## Deferred

- Trend card headline total + month-on-month delta chip (prototype "318 / 13% up"): needs a
  derivation / extra overview fetch; not fabricated here.
- "New customers this cycle" real number: needs the behavioural gate opened (new-vs-returning).
- "A document is needed" / "A voucher is expiring soon" attention rows: need schema / signals
  not on the current wire; omitted (only the four wired sources are shown).

## Brand / style

Action CTAs use `variant="gradient"` (red/coral), never navy (owner). No emojis (SVG icons via
`@/lib/icons`), no em-dashes, tokens only. Shell/sidebar untouched.
