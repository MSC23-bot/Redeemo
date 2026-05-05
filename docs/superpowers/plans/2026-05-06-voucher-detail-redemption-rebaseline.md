# Voucher Detail / Redemption Rebaseline (Phase 3C.1c + 3C.1i)

> **Status: AWAITING OWNER APPROVAL.** No implementation begins until owner signs off on §3 decisions and the milestone shape in §7. Tier 2 standing rule.

**Tier:** 2 — multi-file UI work in one new surface (port of an already-built reference implementation onto current main + branch-aware contracts).
**Tracks:** Phase 3C.1c (Voucher Detail + Redemption) + Phase 3C.1i (QR Code Rendering) — bundled because the redemption flow only completes when staff can validate the code, which requires the QR / Show-to-Staff surface.
**Scope boundary:** existing-design port. **NOT** the deferred Tier 3 voucher UX redesign brainstorm (deferral inventory §C). If something looks like it needs new design thinking, flag and stop — don't redesign mid-port.

---

## 1. Current main state — audit

### 1.1 Routes / screens / hooks

| | |
|---|---|
| `app/(app)/voucher/[id].tsx` | ❌ does not exist — user reports 404 ("page could not be found"). |
| `apps/customer-app/src/features/voucher/` | ❌ entire directory absent. |
| `apps/customer-app/src/lib/api/redemption.ts` | ⚠️ placeholder only — exports `VoucherType` literal. No client functions, no Zod schemas. |
| `MerchantProfileScreen.tsx:259` | ✅ already calls `router.push('/voucher/${voucherId}' as any)` for subscribed users — the cast is a deliberate placeholder pending this rebaseline. Comment at lines 249–258 documents the gap. |

### 1.2 Backend redemption contract — fully on main

Confirmed via `src/api/redemption/{routes,service}.ts`:

| Endpoint | Purpose |
|---|---|
| `POST /api/v1/redemption` | Customer initiates redemption (PIN + voucherId + branchId). Validates 9 guards (subscription ACTIVE/TRIALLING, voucher ACTIVE+APPROVED, merchant ACTIVE, branch-merchant coherence, PIN match with rate-limit, phone-verified, cycle-window check). Atomically creates `VoucherRedemption` + upserts `UserVoucherCycleState`. Returns the redemption row including `redemptionCode`. |
| `GET /api/v1/redemption/my` | List my redemptions (paginated). |
| `GET /api/v1/redemption/my/:id` | Get a specific redemption by row id (customer self-lookup). Returns voucher + branch metadata. |
| `POST /api/v1/redemption/verify` | Branch staff or merchant admin validates a code (QR scan or manual). Sets `isValidated=true`, records `validationMethod`. |

**Redemption code shape:** alphanumeric (mixed case + digits), **10 characters**, generated via `crypto.randomBytes` rejection-sampled to 62-char alphabet (`src/api/redemption/service.ts` `generateRedemptionCode`). The CLAUDE.md note about "3+3 grouping for 6-char codes" was an aspirational design-doc fragment that didn't ship; current backend emits 10-char codes. UI should format readably (e.g. `5+5` grouping with a non-breaking-space separator) but treat the value as opaque.

### 1.3 Subscription / cycle contract — locked + tested

Verified during the PR #38 + PR #39 audit:
- `useSubscription().isSubscribed` is `true` ⇔ `Subscription.status ∈ {ACTIVE, TRIALLING}` (PAST_DUE / CANCELLED / EXPIRED / null all return false).
- Backend redemption guard: same set ([service.ts:74](src/api/redemption/service.ts#L74)).
- Cycle math: `getCurrentCycleWindow(sub.cycleAnchorDate, now)` ([cycle.ts](src/api/subscription/cycle.ts)). Monthly window anchored to day-of-month, day-clamped (28/29/30 → end of short months). Annual subscribers use the same monthly cycle.
- One redemption per `(userId, voucherId)` per cycle across **all branches**. Branch is attribution only — voucher availability stays merchant-wide.
- Renewal: webhook calls `resetVoucherCycleForUser(prisma, userId)` on Stripe renewal events.
- 16 cycle tests + 28 redemption tests pass on current main.

### 1.4 Branch-aware merchant profile — current contract

Per the locked baseline post-PR-#35:
- `merchant.selectedBranch` resolved server-side from `?branch=<id>` query param OR cold-open by GPS / `isMainBranch`.
- Voucher list is merchant-wide; the redemption is **branch-attributed** via the chip / picker.
- Multi-branch merchants need a Branch Picker before PIN entry; single-branch auto-selects.

### 1.5 Prerequisites already on main

| Capability | Module |
|---|---|
| Loading indicator | `<RedeemoLoader>` (PR #37) — reuse for view loading + post-redeem loading |
| Bottom sheet primitive | `design-system/motion/BottomSheet.tsx` — for PIN entry sheet, branch picker, success popup |
| Reanimated | v4.1.1 installed |
| react-native-svg | for SVG paths (already used by VoucherCard, RedeemoLoader, R logo) |
| react-native-qrcode-svg | `^6.3.21` installed |
| expo-brightness | `~14.0.8` installed (for QR brightness boost) |
| expo-screen-capture | `~8.0.9` installed (for screenshot guard) |
| expo-blur | `~15.0.8` installed (auto-hide blur) |
| Subscription Zod fix | PR #39 — `priceGbp: z.coerce.number()` |
| Auth + branch-aware contracts | All locked |

### 1.6 Reference implementation

`feature/customer-app` has a fully-built Voucher Detail + Redemption + QR Show-to-Staff per CLAUDE.md Phase 3C.1c + Phase 3C.1i notes. **Reference only — do not import wholesale.** The reference predates the branch-aware contract (PR #32/#33), the locked merchant-profile chrome (PR #35 → #36), the RedeemoLoader (PR #37), and the subscription Zod fix (PR #39). The port must adapt to those.

The original implementation plan `docs/superpowers/plans/2026-04-17-voucher-detail-redemption.md` (4081 lines, 18 tasks) is the canonical reference for what each component does. This rebaseline plan is shorter because it points at the original for the per-task detail and only calls out **deltas**.

---

## 2. Required surface

### 2.1 Route

**`app/(app)/voucher/[id].tsx`** — single dynamic route. Reads `id` (voucherId) + optional `?branch=<branchId>` (passes through from MerchantProfileScreen so the user lands with the same selected branch). Hides bottom Tab Bar (`tabBarStyle: { display: 'none' }` on the route registration) — same pattern as `merchant/[id]`.

### 2.2 Screens / components

| | Purpose |
|---|---|
| `<VoucherDetailScreen>` | Main orchestrator. Fetches voucher + selectedBranch, derives 12 visual states, hosts PIN sheet + success popup + Show-to-Staff modal + redemption-details card |
| `<CouponHeader>` + `<PerforationLine>` | Type-coloured top of the coupon (BOGO/DISCOUNT/etc. gradient) |
| `<CouponCardTop>` + `<CouponBody>` | Hero £value, title, description, terms |
| `<MerchantRow>` | Merchant name + nearest branch + distance |
| `<HowItWorks>` | 3-step explainer pinned beneath the coupon |
| `<RedeemCTA>` | Brand-red sticky CTA at bottom — primary action for can-redeem state |
| `<PinEntrySheet>` | Bottom sheet, 4-digit PIN entry (matches BranchPin), error states + lockout timer |
| `<SuccessPopup>` | Animated checkmark, auto-dismiss → routes into Show-to-Staff |
| `<ShowToStaff>` | Full-screen anti-fraud surface: live QR, brightness boost, screen-capture detect + flag, auto-hide blur after 2 min idle, LIVE pulsing dot |
| `<RedemptionDetailsCard>` | Persistent post-redeem surface inside Voucher Detail (return-visit path) |
| `<TimeLimitedBanner>` | Countdown / expired / unavailable banner under coupon |
| `<RedeemedBadge>` | Out-of-coupon badge shown when already-redeemed |
| `<BranchPickerSheet>` | Multi-branch picker — auto-skipped on single-branch merchants |

### 2.3 Hooks

| | Purpose |
|---|---|
| `useVoucherDetail(voucherId, branchId?)` | Fetches the merchant profile slice for this voucher's merchant; selects the voucher row. Reuses existing `useMerchantProfile` under the hood OR adds a dedicated endpoint — see §3 D2. |
| `useRedeem()` | Mutation: POST /api/v1/redemption. Optimistic UI handled inside the screen; this hook is the network call + cache invalidation (`['subscription']`, `['merchant', merchantId]`, `['my-redemptions']`). |
| `useRedemption(id)` | Polls GET /api/v1/redemption/my/:id every 5s while ShowToStaff is open. Detects validation transitions to flip the screen state. |
| `useTimeLimited(voucher)` | Derives countdown / availability for time-limited vouchers. |
| `useFavourite` | Already exists. Reuse. |
| `useBrightnessBoost` | New — captures and restores screen brightness while ShowToStaff is open. |
| `useScreenshotGuard` | New — iOS screenshot listener + Android `FLAG_SECURE`. Calls a "screenshot taken" flag to telemetry (pre-validation gate). |
| `useAutoHideTimer` | New — dims QR after 2-min inactivity, freezes when validated. |

### 2.4 API client extension

`apps/customer-app/src/lib/api/redemption.ts` (currently a stub) gains:
- `redemptionApi.redeem({ voucherId, branchId, pin })` → POST `/api/v1/redemption`
- `redemptionApi.getMyRedemption(id)` → GET `/api/v1/redemption/my/:id`
- `redemptionApi.listMyRedemptions(opts)` → GET `/api/v1/redemption/my`
- Zod schemas with `z.coerce.number()` for any Decimal field (e.g. `estimatedSaving` if it surfaces) — repeat the lesson from PR #39 to avoid the same silent-null trap.

---

## 3. Owner decisions — please answer before implementation

Each decision has my recommended pick. Reply "as proposed" if no objections, or override individually.

### D1. Milestone shape

How aggressively to split the rebaseline into PRs?

- **(A) Recommended: 3 milestones, 1 PR per milestone.** Ship each in turn:
  - **M1 view-only Voucher Detail** — route, hooks, all 12 states displayed but redemption disabled (RedeemCTA fires a "coming next milestone" toast). Lets you QA the visual side of the screen + branch-aware data flow before introducing redemption side-effects.
  - **M2 redemption flow** — PinEntrySheet + RedeemMutation + SuccessPopup. End-to-end redeem path lands here.
  - **M3 ShowToStaff + QR + anti-fraud** — full-screen QR + brightness boost + screenshot guard + polling. Closes the loop with the staff-validates-code path.
- (B) Single bundled PR — all 3 milestones together. Faster to ship; harder to QA.
- (C) 4 milestones — split M3 further into ShowToStaff scaffold + anti-fraud (brightness/screenshot/auto-hide). Granular but more PR overhead.

**Recommendation:** A. The mid-milestone pause after M1 is valuable because that's where you can verify the rebaseline got the visual-state machine right before introducing irreversible state changes (redemptions in the DB).

### D2. Detail-fetch shape

How does Voucher Detail get its data?

- **(A) Recommended: reuse `useMerchantProfile(merchantId, opts)` + select the voucher inside.** Voucher Detail's data is a strict subset of Merchant Profile's response (voucher row + selectedBranch + merchant.branches). Reusing the hook means a single source of truth for branch resolution, distance computation, and rating. The merchant-profile endpoint is already cached — opening voucher detail from a merchant page is a cache hit. No new backend route required.
- (B) New backend endpoint `GET /api/v1/customer/voucher/:voucherId` — leaner payload but duplicates branch-resolution logic. Adds backend surface area for the rebaseline.

**Recommendation:** A. Reuse existing endpoint. The `?branch=<id>` resolution and selectedBranch fallback are already on main. Voucher Detail just selects from `merchant.vouchers.find(v => v.id === voucherId)`.

### D3. Branch passing from Merchant Profile → Voucher Detail

When the user taps a voucher inside a merchant page that has a selectedBranch resolved, how does that pass through?

- **(A) Recommended: append `?branch=<sb.id>` to the navigation URL.** Voucher Detail reads it, passes to `useMerchantProfile`, gets the same selectedBranch. If user navigates directly (deep link) without a branch param, cold-open resolution kicks in (nearest by GPS / isMainBranch).
- (B) Pass via global state. Brittle — survives navigation but tangles state management.

**Recommendation:** A. Stateless URL is the right pattern; matches the merchant-profile chip behaviour.

### D4. Redemption code formatting

Backend emits 10-char alphanumeric. UI display:

- **(A) Recommended: `5+5` grouping with monospace font** — e.g. `aB3xK ZmLp9`. Easier to read aloud / compare on a small screen. Same approach the reference 3C.1i used (it shipped with 6-char `3+3`; we use the same separator strategy with the actual 10-char shape).
- (B) Show as one continuous string. Harder to read.
- (C) Add hyphens (`aB3xK-ZmLp9`). Easy on the eye but introduces a glyph users might mistake for part of the code.

**Recommendation:** A. Monospace font + space separator at midpoint.

### D5. Show-to-Staff anti-fraud scope

Phase 3C.1i shipped 4 anti-fraud measures on the reference branch (brightness boost, screenshot detect, auto-hide blur, LIVE pulsing dot). Are all 4 in scope for this rebaseline?

- **(A) Recommended: all 4.** They're already-built patterns; not implementing them on the port leaves the surface less safe than the reference. Backend `screenshot-flag` route is an aspirational design note — the reference plan referenced it but the route is **not on current main**. So screenshot detection works client-side (alert + dim) without telemetry to the backend. Document that telemetry is deferred to a tiny follow-up PR.
- (B) Brightness + LIVE only; defer screenshot guard + auto-hide. Smaller M3 milestone.

**Recommendation:** A. Anti-fraud is the point of the surface. Drop the screenshot-flag backend telemetry only; keep the client-side experience.

### D6. Merchant Profile chrome reuse

The merchant-profile rebaseline shipped a stretchy hero + collapsed sticky header (PR #36). Voucher Detail has its own coupon-heavy layout. Should the chrome patterns transfer?

- **(A) Recommended: NO collapsed header on Voucher Detail.** The screen is short (coupon + how-it-works + sticky CTA), doesn't need scroll-collapse. A simple back button + favourite button at the top, brand-red sticky RedeemCTA at the bottom — matches the reference design intent. Consistency comes from shared tokens + RedeemoLoader, not chrome shape.
- (B) Use the collapsed header pattern. Probably overkill.

**Recommendation:** A. Don't transplant chrome that doesn't fit the surface.

### D7. PIN sheet error UX

PIN failure backend returns `INVALID_PIN` with a rate-limit counter (5 attempts / 15 min per `(userId, branchId)` per the redemption-system plan). What happens at limit?

- **(A) Recommended: replicate the reference design.** Inline error text under PIN dots after each wrong attempt; on `PIN_RATE_LIMIT_EXCEEDED` flip the sheet to a "Try again in X min" lockout state with a countdown to the rate-limit window's end. Same as 3C.1c plan Task 12.
- (B) Surface limit hits as a modal alert. Less polished.

**Recommendation:** A.

### D8. Tests scope

- **(A) Recommended: minimum-viable** — Zod schemas (mirror the PR #39 lesson — coerce decimals), state-machine tests for the 12-state derivation in VoucherDetailScreen, PIN error mapping (one test per error code), redemption mutation cache invalidation, ShowToStaff mounts under the right state. Skip pixel snapshot tests.
- (B) Comprehensive — also snapshot test every component visually. Higher coverage cost, lower bug-prevention value at this maturity.

**Recommendation:** A.

---

## 4. Subscription-cycle contract — explicit reaffirmation

This rebaseline implements the contract that's already on the backend. Listing the rules so the reviewer can spot-check that frontend behaviour matches.

- `Subscription.status ∈ {ACTIVE, TRIALLING}` → can attempt redeem. Frontend `useSubscription().isSubscribed = true`.
- `Subscription.status ∈ {PAST_DUE, CANCELLED, EXPIRED}` OR `null` → cannot redeem. Frontend `isSubscribed = false`. Backend redemption guard rejects with `SUBSCRIPTION_REQUIRED`.
- One redemption per `(userId, voucherId)` per cycle window, **across all branches**. The cycle window is computed from `Subscription.cycleAnchorDate` via `getCurrentCycleWindow`. Annual subscribers still get monthly cycles.
- After a successful redeem, `UserVoucherCycleState.isRedeemedInCurrentCycle = true`. The frontend treats this voucher as "Already Redeemed (this cycle)" — RedeemCTA disabled with a "Redeemed" stamp; tap routes into RedemptionDetailsCard / ShowToStaff as a return-visit path.
- Branch is attribution only. Picking Branch B for redemption when the user previously redeemed at Branch A in the same cycle still throws `ALREADY_REDEEMED`.
- Cycle rolls over: on the next cycle window, the same voucher becomes redeemable again. Server resets via `resetVoucherCycleForUser` on Stripe renewal events; client doesn't need to do anything except respect the backend's `ALREADY_REDEEMED` vs success response.

The frontend MUST NOT compute cycle windows or eligibility client-side. **Trust the backend.** The 12 visual states key off `isSubscribed` (from `useSubscription`) + `isRedeemedInCurrentCycle` (from the voucher row when it surfaces — TBD whether merchant profile API exposes this; see §3 D2 implications) + voucher status (ACTIVE/EXPIRED/TIME_LIMITED) + redemption record (returned post-redeem).

**Open question to surface during M1 implementation:** does the existing merchant profile response include `isRedeemedInCurrentCycle` per voucher for the calling user? If not, we need either a backend additive field on the voucher payload OR a separate `GET /api/v1/redemption/my?voucherId=…` cached query. **Flag during M1; do not block M1 scaffolding on it.**

---

## 5. The 12 visual states (reference recap)

From the reference plan's Task 16. Reaffirm here so the rebaseline preserves them:

| # | State | Trigger |
|---|---|---|
| 1 | Free user | not subscribed → RedeemCTA → SubscribePromptScreen |
| 2 | Subscribed, can redeem | ACTIVE/TRIALLING + voucher ACTIVE + not yet redeemed this cycle |
| 3 | Already redeemed this cycle | UserVoucherCycleState.isRedeemedInCurrentCycle = true → "Redeemed" badge + tap → RedemptionDetailsCard |
| 4 | Voucher expired | voucher.expiryDate < now → "Expired" state, no CTA |
| 5 | Time-limited — currently available | voucher.timeLimited windows → countdown + RedeemCTA active |
| 6 | Time-limited — currently unavailable | outside the window → "Unavailable until HH:MM" banner |
| 7 | Time-limited — last few minutes (urgency) | <30min remaining in window → urgency styling |
| 8 | Cycle-locked from another voucher | (defensive — same merchant cap if rule ever changes) — currently same as state 2 |
| 9 | Loading (initial fetch) | RedeemoLoader |
| 10 | PIN-entry-active | PinEntrySheet open |
| 11 | Success (just redeemed) | SuccessPopup → ShowToStaff |
| 12 | ShowToStaff active | full-screen QR |

States 5/6/7 use `useTimeLimited`. State 3 + state 12 share the RedemptionDetailsCard surface for return-visit context.

---

## 6. Risks

- **Backend voucher payload may not include `isRedeemedInCurrentCycle`** for the calling user. If so, a state-machine input is missing. Mitigation: small additive backend field on `getCustomerMerchant` voucher slice OR separate query — decide during M1, NOT M0.
- **Decimal-as-string trap** for `estimatedSaving` if it surfaces in the redemption response. Mitigation: `z.coerce.number()` from the start. Mirror PR #39's lesson in every Zod schema this PR adds.
- **Brightness boost on Android** — `expo-brightness` semantics differ between platforms (system vs app brightness). Mitigation: best-effort; no hard error if brightness API rejects.
- **Screenshot detection on Android** — uses `FLAG_SECURE` which prevents screenshots system-wide for the screen. iOS uses a listener (cannot prevent, only detect after-the-fact). Different UX expectations per platform; document in the ShowToStaff component header.
- **Polling cost** — `useRedemption(id)` polls every 5s while ShowToStaff is open. Stops on validation transition or 15-min timeout. Mitigation: explicit 5s interval, no exponential backoff (don't want to delay the validation-detected response).
- **Reference branch drift** — `feature/customer-app`'s implementation predates the branch-aware contract + Subscription Zod fix + RedeemoLoader. Direct copy-paste WILL break. Each component must be re-fitted.

---

## 7. Implementation milestones

### M1 — View-only Voucher Detail (PR 1)

Goal: route + screen + all 12 states displayed. RedeemCTA fires a `Alert("Coming next milestone")` placeholder so visual states are reachable without DB side-effects.

Files (new):
- `app/(app)/voucher/[id].tsx` (route)
- `apps/customer-app/src/features/voucher/screens/VoucherDetailScreen.tsx`
- `apps/customer-app/src/features/voucher/components/{CouponHeader,CouponCardTop,CouponBody,MerchantRow,HowItWorks,RedeemCTA,RedeemedBadge,TimeLimitedBanner,PerforationLine}.tsx`
- `apps/customer-app/src/features/voucher/hooks/{useVoucherDetail,useTimeLimited}.ts`
- `apps/customer-app/src/lib/api/redemption.ts` — extended with Zod schemas + `redemptionApi.listMyRedemptions` (for state-3 derivation)
- `apps/customer-app/src/design-system/tokens` — verify voucher type colours already present from VoucherCard work; add anything missing

Files (modified):
- `apps/customer-app/app/(app)/_layout.tsx` — register the `voucher/[id]` route with `tabBarStyle: { display: 'none' }` (matches `merchant/[id]`)
- `apps/customer-app/src/features/merchant/screens/MerchantProfileScreen.tsx` — drop the `as any` on `router.push('/voucher/${voucherId}')` once the route exists; pass `?branch=<id>` if multi-branch context

Tests:
- `tests/features/voucher/voucher-detail-states.test.tsx` — pin the 12-state derivation
- `tests/lib/api/redemption.test.ts` — Zod parse for redemption schemas
- `tests/features/voucher/use-time-limited.test.ts` — countdown / window math

Pause for owner on-device QA. **Do not start M2 until M1 is approved.**

### M2 — Redemption flow (PR 2)

Goal: PinEntrySheet → RedeemMutation → SuccessPopup → routes back to Voucher Detail with `state=3`.

Files (new):
- `apps/customer-app/src/features/voucher/components/{PinEntrySheet,SuccessPopup,RedemptionDetailsCard}.tsx`
- `apps/customer-app/src/features/voucher/components/BranchPickerSheet.tsx` (lighter-weight version of merchant-profile's; or reuse if shape matches — check during impl)
- `apps/customer-app/src/features/voucher/hooks/useRedeem.ts`

Files (modified):
- `VoucherDetailScreen.tsx` — wire RedeemCTA to open PinEntrySheet; mount SuccessPopup; route into RedemptionDetailsCard on state 3

Tests:
- `tests/features/voucher/pin-entry-sheet.test.tsx` — PIN length, error mapping, lockout countdown
- `tests/features/voucher/use-redeem.test.tsx` — mutation cache invalidation
- Backend integration smoke: assert `useRedeem` calls hit `POST /api/v1/redemption` with the right shape (mock api)

Pause for owner on-device QA.

### M3 — ShowToStaff + QR + anti-fraud (PR 3)

Goal: full-screen QR with brightness boost, screenshot guard, auto-hide. SuccessPopup auto-dismisses into this screen.

Files (new):
- `apps/customer-app/src/features/voucher/components/{ShowToStaff,QRCodeBlock,LiveDot}.tsx`
- `apps/customer-app/src/features/voucher/hooks/{useRedemption,useBrightnessBoost,useScreenshotGuard,useAutoHideTimer}.ts`

Files (modified):
- `SuccessPopup.tsx` — auto-dismiss handler now routes into ShowToStaff
- `RedemptionDetailsCard.tsx` — "Show to Staff again" button opens ShowToStaff for state 3 / state 12 return visits

Tests:
- `tests/features/voucher/show-to-staff.test.tsx` — mounts under right state, polls correctly, validation transition
- `tests/features/voucher/use-auto-hide-timer.test.ts` — frozen-when-validated, resets on tap
- A11y: QRCodeBlock accessibility label includes the redemption code formatted readably

Pause for owner on-device QA. **THEN open the consolidated PR vs `main` per Tier 2 milestone-pause-then-PR rule.** Or, if M1/M2/M3 are each merged independently per D1 = A, this is the final milestone pause before the final merge.

---

## 8. On-device QA plan (cumulative across milestones)

Devices that matter: iPhone 14/15/16 Pro (Dynamic Island + brightness boost), iPhone 11–13 (notch), iPhone SE (no notch), Pixel 6+ (Android brightness + FLAG_SECURE).

### Golden paths

1. Subscribed user, single-branch merchant, voucher ACTIVE → tap Redeem → enter PIN → see SuccessPopup → arrive at ShowToStaff with QR. Code visible. Staff scans (or types) → app polls + transitions to "Validated" state.
2. Subscribed user, multi-branch merchant → tap Redeem → BranchPicker opens → pick branch → PIN entry → success → ShowToStaff (with branch attribution surfaced).
3. Already-redeemed-this-cycle return visit → voucher detail shows RedeemedBadge + RedemptionDetailsCard → "Show to Staff again" reopens ShowToStaff with same code.
4. Free user → tap Redeem → SubscribePromptScreen (the Coming-soon Alert path).

### State-machine paths

5. Voucher EXPIRED → "Expired" state, no CTA.
6. Voucher TIME_LIMITED — currently available → countdown + RedeemCTA active.
7. TIME_LIMITED — outside window → "Unavailable until HH:MM" banner, no CTA.
8. TIME_LIMITED — last 30 min → urgency styling.
9. Network error during fetch → RedeemoLoader → error retry surface.

### Anti-fraud paths

10. ShowToStaff open → take a screenshot (iOS) → app shows screenshot-detected dim + alert.
11. ShowToStaff open Android → screenshot blocked by FLAG_SECURE.
12. ShowToStaff open → idle 2 min → QR auto-blurs with "Tap to show" CTA.
13. ShowToStaff open → backgrounded then foregrounded → brightness restored to original on dismiss.

### Edge

14. Wrong PIN 5 times → rate-limit lockout countdown.
15. Concurrent redeem attempts (PIN entered fast twice) → `ALREADY_REDEEMED` from backend on the second attempt → friendly error.
16. Subscription state change mid-session (e.g. cancel via web) → next redeem attempt rejected by backend → frontend transitions to free-user state on next refresh.
17. Reduced motion ON → RedeemoLoader stretch + SuccessPopup checkmark + LIVE pulse all use the gesture-driven / instant-snap fallbacks from existing primitives.

---

## 9. Documentation updates required

After M3 merges:
- Update CLAUDE.md "Phase 3C.1c" + "Phase 3C.1i" entries to reference the rebaseline PRs and remove the "awaiting page-review lock" status.
- Update `~/.claude/.../project_current_state.md` (memory) to mark Voucher Detail surface live on main.
- Update the deferral inventory §C "Voucher full UX redesign" to clarify it's the Tier 3 brainstorm, distinct from this completed Tier 2 rebaseline.

---

## 10. Outstanding decisions

D1 milestone shape · D2 detail-fetch hook · D3 branch passing · D4 code formatting · D5 anti-fraud scope · D6 chrome · D7 PIN UX · D8 tests scope.

Default = my recommendations as listed in §3. If you reply "approved as proposed", I'll proceed with M1 and pause at the end of M1 for on-device QA.
