# Voucher Detail / Redemption Rebaseline (Phase 3C.1c + 3C.1i)

> **Status: APPROVED with two amendments locked 2026-05-06.** Implementation begins on M1 after owner confirms the §11 Branch attribution contract is correctly captured. D1–D8 owner-locked; D2 amended to **dual endpoint** (`useCustomerVoucher` + `useMerchantProfile`) after pre-M1 audit found the dedicated `GET /api/v1/customer/vouchers/:id` endpoint already on main with `isRedeemedThisCycle` exposed.

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

**Redemption code shape:** ~~alphanumeric (mixed case + digits), **10 characters**, generated via `crypto.randomBytes` rejection-sampled to 62-char alphabet~~ — **SUPERSEDED 2026-05-07 (PR #46): now 8 characters, uppercase A-Z + digits 0-9 with `O` and `I` excluded** (34-char alphabet). Same `crypto.randomBytes` rejection-sampling pattern. Display is `4+4` grouping. The change came from device QA: 10-char mixed-case codes (e.g. `LQGFhpaoun`) were too long, mis-readable when transcribed onto bills, and easily confused (O/0, I/1). New shape (e.g. `A7K2 P9X4`) is staff-friendly for manual recording. UI still treats the value as opaque.

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

**This is a meaningful architectural difference from the reference build** (`feature/customer-app`), which treated each branch as its own merchant profile. The rebaseline must inherit current main's "one merchant profile, branches inside" model — see §11 for the full branch-attribution contract.

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

### D2. Detail-fetch shape — **AMENDED 2026-05-06: dual endpoint**

Pre-M1 audit found that a dedicated voucher endpoint **already exists on current main** (was always there; the original v1 plan missed it):

```
GET /api/v1/customer/vouchers/:id
```

Backed by `getCustomerVoucher(prisma, voucherId, userId)` ([service.ts:844-895](src/api/customer/discovery/service.ts#L844-L895)). Returns:
```ts
{
  id, title, type, description, terms, imageUrl,
  estimatedSaving: number,                            // Number-coerced Decimal
  expiryDate, code, status, approvalStatus,
  merchant: { id, businessName, tradingName, logoUrl, status },
  isRedeemedThisCycle: boolean,                       // ← directly answers state #3
  isFavourited: boolean
}
```

The endpoint is purpose-built for this surface, returns `isRedeemedThisCycle` directly (no client-side cycle math, no extra query), and requires no backend changes.

**Locked decision (owner direction, post-audit):** **dual endpoint.**

- New `useCustomerVoucher(voucherId)` hook hitting `GET /api/v1/customer/vouchers/:id` — drives the voucher panel, `isRedeemedThisCycle`, `isFavourited`.
- Existing `useMerchantProfile(merchantId, { branchId })` hook continues to be used for **branch list + selectedBranch + distance** — needed for the BranchPickerSheet (M2) and the "Redeem at <branchName>" attribution UX. The voucher endpoint doesn't carry branch data.
- Both queries cached separately by React Query; both cheap single-Prisma-query endpoints; React Query parallelises them.
- Zero backend changes for M1.

**State #3 (already-redeemed) source = `voucher.isRedeemedThisCycle` from the dedicated endpoint.** Branch-independent value (per the contract in §11).

### D3. Branch passing from Merchant Profile → Voucher Detail

When the user taps a voucher inside a merchant page that has a selectedBranch resolved, how does that pass through?

- **(A) Recommended: append `?branch=<sb.id>` to the navigation URL.** Voucher Detail reads it, passes to `useMerchantProfile`, gets the same selectedBranch. If user navigates directly (deep link) without a branch param, cold-open resolution kicks in (nearest by GPS / isMainBranch).
- (B) Pass via global state. Brittle — survives navigation but tangles state management.

**Recommendation:** A. Stateless URL is the right pattern; matches the merchant-profile chip behaviour.

### D4. Redemption code formatting

> **SUPERSEDED 2026-05-07 (PR #46) — see top of §1 for the new shape.** Original recommendation A (5+5 mixed-case) was owner-locked 2026-05-06 and shipped in PR #44. Device QA on 2026-05-07 surfaced: mixed-case codes are easy to misread when staff transcribe them onto bills (e.g. "is this an O or a 0?", "is that l a one?"), and 10 chars is too many to read aloud. Owner override: 8-char uppercase, 4+4 grouping, alphabet excludes O and I. Locked.

Backend emits 8-char uppercase alphanumeric (alphabet: `ABCDEFGHJKLMNPQRSTUVWXYZ0123456789`, 34 chars). UI display:

- **(A) Locked: `4+4` grouping with monospace font** — e.g. `A7K2 P9X4`. Easier to read aloud / write down / compare on a small screen than 10 chars. Excluded characters (O, I) eliminate the most common manual-entry confusion (O/0, I/1). Backend `@unique` constraint backstops collisions; alphabet provides 34^8 ≈ 1.79 × 10^12 combinations.
- (B) Show as one continuous string. Harder to read.
- (C) Add hyphens (`A7K2-P9X4`). Easy on the eye but introduces a glyph users might mistake for part of the code.

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

~~**Open question to surface during M1 implementation:** does the existing merchant profile response include `isRedeemedInCurrentCycle` per voucher for the calling user?~~ **RESOLVED 2026-05-06 by pre-M1 audit:** state #3 sources from `voucher.isRedeemedThisCycle` returned by the dedicated `GET /api/v1/customer/vouchers/:id` endpoint (see §3 D2 amendment). No backend additive field, no side-channel query.

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
- **Branch attribution accidents** — the reference build treated each branch as its own merchant profile; current `main` consolidates branches inside one merchant profile per merchant. **`VoucherRedemption.branchId` is permanent attribution data — wrong-branch values would corrupt merchant analytics with no easy fix.** See §11 for the locked branch-attribution contract that M1+M2 implement. Tests in M2 explicitly assert the `branchId` sent to the redemption mutation comes from `selectedBranch.id` and nowhere else.

---

## 7. Implementation milestones

### M1 — View-only Voucher Detail (PR 1)

Goal: route + screen + all 12 states displayed. RedeemCTA fires a `Alert("Coming next milestone")` placeholder so visual states are reachable without DB side-effects.

**Branch-attribution requirements (per §11):**
- Read `?branch=<id>` from URL via `useLocalSearchParams`; pass to `useMerchantProfile`.
- Display "Redeem at <selectedBranch.name>" prominently in the screen (single-branch: just the merchant name; multi-branch: branch name + city). Source = `merchant.selectedBranch` from the merchant-profile response.
- BranchPickerSheet itself is M2; M1 may show a stub "Change" affordance that no-ops or "Coming next milestone" — do NOT wire branch switching in M1.
- Tests: assert that the displayed-branch value comes from `merchant.selectedBranch.id`, NOT `merchant.branches[0].id` or any other source.

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

### M1.1 — As shipped (rounds 13–24, merged 2026-05-06 as PR #40, merge `b93ef9c`)

This addendum captures everything that landed in M1 BEYOND the original M1 view-only scope above. It exists because the conversion-flow + UX-polish work that happened during owner QA expanded M1 substantially beyond "route + screen + 12 states + branch attribution." Recorded here so future readers can see the actual M1-as-shipped contract, not just the as-planned shape.

**Conversion flow for free users (round 16) — locked design**

- `SubscriptionPromptModal` replaces the deleted `FreeUserGateModal`. Renders for free users on Voucher Detail; auto-shown after the round-22 delay (see below); dismissible via "Maybe later" or close icon.
- Sticky free-user CTA: `redeem-cta-subscribe` testID, navy background, copy "Subscribe to Redeem · £6.99/mo", routes to `/(auth)/subscription-prompt` with the full voucher-origin return-context query (see next bullet).
- Plan-pre-pick: tapping the modal's annual / monthly buttons builds the URL with `plan=annual` or `plan=monthly` so `SubscribePromptScreen` initialises its plan selector to the user's pick (no double-pick).
- Free users navigate THROUGH to Voucher Detail and see the free-user state — backend enforces subscription at redemption time, so browsing is unrestricted.

**Voucher-origin subscription routing (rounds 20–21) — locked URL contract**

`SubscribePromptScreen` honours the voucher-origin source via this URL shape:

```
/(auth)/subscription-prompt
  ?source=voucher
  &plan=<annual|monthly>
  &returnVoucherId=<id>
  &branch=<id>
  &returnMerchantId=<id>
  &tab=vouchers
```

- `source=voucher` swaps CTA copy to "Continue with Annual" / "Continue with Monthly" / "Continue with Free Account" (vs the onboarding default "Explore full access" / "Start with free access").
- `plan=<plan>` initialises the plan selector to the user's pre-pick.
- `returnVoucherId` + `branch` + `returnMerchantId` + `tab` rebuild the exact return URL on the secondary CTA.
- Voucher-origin secondary CTA does NOT stamp `subscriptionPromptSeenAt` — user is past onboarding and the flag is for first-run only.
- Defensive fallback: when return-context params are missing, secondary CTA falls back to `router.back()` rather than dropping the user on Discovery.

**Suppression flag (round 22) — `?suppressSubscribePrompt=1`**

`Continue with Free Account` returns to voucher with `?suppressSubscribePrompt=1` appended. `VoucherDetailScreen` reads it and skips the auto-modal so the user isn't nag-looped after a deliberate free-pick. Sticky CTA stays visible and tappable; only the auto-modal is gated.

**Delayed auto-modal (round 22 part 5) — `SUBSCRIPTION_PROMPT_DELAY_MS = 800ms`**

Auto-modal waits 800ms after the screen becomes interactive so the user briefly sees the voucher itself before the conversion overlay slides in. Owner direction — synchronous show felt gate-like (the same UX the modal was meant to replace). Implemented as a `setTimeout` inside an effect with full cancellation paths:

- Blur (sticky CTA tap → navigation → focus loss → cleanup).
- Dismiss (Maybe later / close → `promptDismissed` flips → effect returns early).
- Sub state change (`isSubscribed` flips → effect returns early).
- Suppression flag (URL param).

Two-layer gate: `modalReady` (timer fired) AND every scheduling guard still holds. Without the second layer, dismiss wouldn't hide the modal because `modalReady` stays true after the timer fires.

**How It Works variants (rounds 17–19) — locked**

- Both subscribed and free variants finalised at 5 steps (round 17). Free variant starts with "Subscribe to Unlock"; subscribed variant starts with "Review the Voucher".
- Section is a tappable card with chevron toggle (round 19). Free default = expanded (still supports conversion). Subscribed default = collapsed (process explanation is secondary once eligibility is unlocked).

**§O7 voucher-tap branch race fix (round 23) — `MerchantProfileScreen.handleVoucherPress`**

`handleVoucherPress` reads branch id from `useBranchSelection().branchId` (the URL param) rather than `merchant.selectedBranch.id`. Falls back to the merchant-resolved branch only on cold-open. Eliminates the `keepPreviousData` stale-branch race when a user taps a voucher within ~1s of switching branches. Pre-existing bug (since PR #33), shipped inside PR #40 because PR #40 makes the voucher URL branch param load-bearing. Pinned by `tests/features/merchant/voucher-press-branch-race.test.tsx` (4 cases).

**Round 24 — `PRODUCT.md` workspace hygiene**

`PRODUCT.md` (impeccable design-skill local context file, added round 13) untracked via `git rm --cached` and added to `.gitignore` alongside `DESIGN.md`. Same workspace-hygiene category as `.claude/`, `.superpowers/`, `graphify-out/`, `docs/branding/`. Skill keeps working locally; doesn't ship to main.

**Post-merge symmetric fix (PR #41, merge `234e9e8`, 2026-05-06)**

§O7 closed the stale-`selectedBranch` race in `MerchantProfileScreen.handleVoucherPress` (the *outbound* voucher-tap URL). PR #41 closes the symmetric race in `VoucherDetailScreen.buildSubscriptionUrl` (the *inbound* subscribe-prompt URL):

- Voucher data has no branch dep → `useCustomerVoucher` resolves first.
- Free-user state machine fires once voucher + subscription resolve → sticky CTA + auto-modal plan buttons become tappable WHILE `useMerchantProfile` is still in flight.
- During that window `selectedBranch` is null.
- Old `buildSubscriptionUrl` gated `branch=…` on `selectedBranch` only → URL would omit `branch=` entirely.
- Downstream impact: `SubscribePromptScreen.handleSecondaryChoice` ("Continue with Free Account") needs `returnVoucherId + branch + returnMerchantId + tab` to rebuild the exact return URL with `suppressSubscribePrompt=1` appended. Missing `branch=` → defensive fallback to `router.back()` → suppression contract lost.

Fix: source branch from URL `branchIdParam` first, fall back to `selectedBranch?.id` only on cold-open (no URL branch). Same shape as §O7. Pinned by 4 new tests in `voucher-detail-free-user.test.tsx` (sticky CTA + modal annual + modal monthly under load, plus cold-open fallback regression).

**Test counts at PR #40 merge:** customer-app jest **394/394** across 48 suites (10s); backend vitest discovery.voucher-detail **10/10** (449ms); `tsc --noEmit` clean.

**Test counts at PR #41 merge:** voucher-detail-free-user 32/32; full voucher + merchant + subscribe regression 371/371 across 46 suites; `tsc --noEmit` clean.

**Deferred items spawned during M1** (tracked in `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md`):

- §N10 + §N8 — native iOS edge-swipe-back: requires moving both `voucher/[id]` AND `merchant/[id]` from `Tabs.Screen` into a Stack/native-stack flow together. Tier 2/3 navigation workstream, design with future tab-swipe / gesture arbitration.
- §N11 — broader branch-switch perceived-lag UX (`keepPreviousData` shows OLD branch until refetch lands; voucher detail's loading-gate ignores `merchantQuery.isLoading`). Tier 1/2 owner-direction follow-up.
- §O1 — TIME_LIMITED proper availability windows (M1 stub; needs backend `availableFrom`/`availableUntil`).
- §O3 — `Change ▾` Unicode glyph → chevron icon polish.
- §O4 — Voucher favourite toggle wiring (M1 fires `Alert("Coming next milestone")`).
- §O5 — VoucherDetailScreen decomposition only if M2/M3 grow it past ~600 lines.
- §O6 — Already-Redeemed full surface (M2/M3, backend dep).

**Closed during M1:**

- §O7 — voucher-tap branch race vs in-flight merchant refetch. SHIPPED in round 23.

### M2 — Redemption flow (PR 2)

Goal: PinEntrySheet → RedeemMutation → SuccessPopup → routes back to Voucher Detail with `state=3`.

**Branch-attribution requirements (per §11):**
- BranchPickerSheet wired for multi-branch merchants. Picker writes via `useBranchSelection.select(branchId)` (existing hook) → URL updates → merchant profile re-fetches with new `selectedBranch`. Reuse the existing pattern from MerchantProfileScreen.
- `useRedeem` reads `branchId` from `merchant.selectedBranch.id` at mutation time (a function-of-state read, NOT a captured-earlier value). Defensive guard: if `selectedBranch == null`, abort and reopen picker.
- **REQUIRED test:** assert `useRedeem` sends `branchId === selectedBranch.id` and not from any other source (merchant aggregate, branches[0], etc).
- **REQUIRED test:** PIN failure at one branch does not affect retry eligibility at the same or different branch (rate-limit is per `(userId, branchId)`).
- **REQUIRED test:** state #3 (already-redeemed) renders the same RedeemedBadge regardless of which branch the picker has selected — eligibility is branch-independent.

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

## 10. Outstanding decisions — RESOLVED

All locked. D1, D3, D4, D5, D6, D7, D8 owner-locked 2026-05-06 as my recommendations. D2 amended same day to dual endpoint after pre-M1 audit (see §3 D2). State #3 sourcing question resolved (see §4).

---

## 11. Branch attribution contract — owner-locked 2026-05-06

> **This is a core M1/M2 contract, not a nice-to-have.** Any deviation found during implementation must pause and report before being shipped.

### 11.1 Architectural premise (vs reference build)

In the reference (`feature/customer-app`) build, **each branch effectively behaved like its own merchant profile** — a tile per branch, separate detail navigation. Current `main` consolidates this:

- **One merchant profile per merchant.** Branches live INSIDE the merchant profile via the locked branch-aware contract (PR #32/#33).
- **Discovery may surface branches separately as entry points** but they all resolve into the same merchant profile with a `selectedBranch` (server-resolved from `?branch=<id>` or cold-open by GPS / `isMainBranch`).
- **Vouchers are merchant-wide** ([CLAUDE.md](CLAUDE.md) "Voucher redeemed once per user per cycle across ALL branches"). No per-branch voucher availability gating in v1 ([deferral inventory](~/.claude/.../project_deferred_followups_index.md) §A — `BranchVoucher` table is explicitly NOT v1).
- **Branch is purely the redemption attribution point + the PIN-validation source** — `Branch.redemptionPin` is per-branch; `VoucherRedemption.branchId` is the attribution column merchant analytics + reporting key off.

The Voucher Detail surface inherits this. The reference implementation's "voucher belongs to a branch" mental model does NOT apply to current main and must NOT leak into the rebaselined screens.

### 11.2 Five contract clauses (must all hold)

**C1. Entry source — branch context arrives as a URL query param.**

| Entry | Branch-context source |
|---|---|
| From Merchant Profile voucher card | `?branch=<sb.id>` appended by MerchantProfileScreen at `router.push('/voucher/${voucherId}?branch=${sb.id}')` |
| From a future Discovery branch tile | `?branch=<tileBranchId>` preserved through to Voucher Detail |
| From a deep link / share / notification with no branch param | Cold-open resolution: pass `voucherId` to `GET /api/v1/customer/vouchers/:id` for voucher data, then call `useMerchantProfile(merchantId, { branchId: undefined })` — backend resolver picks nearest-by-GPS / `isMainBranch` (same algorithm Merchant Profile uses) |
| Single-branch merchant | The single branch auto-selects; BranchPickerSheet never opens for the user |

The branch-context source MUST NEVER be "merchant aggregate" or "first branch in array" or "any branch I can find." A missing branch param is a NULL state that must be resolved either by GPS / `isMainBranch` (server-side, via `useMerchantProfile`'s existing fallback) or by surfacing the picker before redeem.

**C2. Voucher Detail branch context — visible + changeable.**

The screen MUST display which branch the redemption will attribute to, in a place the user notices before tapping Redeem. Examples (final wording per impl):

- Multi-branch: "Redeem at **Old Foundry · Colchester** ▾" with a tap target opening BranchPickerSheet to switch.
- Single-branch: "Redeem at **The Coffee House**" — non-tappable, no picker.

The user MUST be able to change the redemption branch BEFORE entering the PIN. After the PIN is entered correctly and the redemption is created, the branch is locked into `VoucherRedemption.branchId` and not changeable (same constraint as the backend — branch is captured atomically with the redemption row).

**C3. Redeem mutation — `branchId` from selected branch only.**

`POST /api/v1/redemption` payload must be:
```ts
{
  voucherId: string,    // current voucher
  branchId:  string,    // SELECTED branch (NOT merchant aggregate, NOT first-in-array)
  pin:       string,    // 4-digit PIN entered by user
}
```

`branchId` is sourced from the same `selectedBranch.id` the screen is displaying as "Redeem at." The mutation hook must not look up the voucher's "default branch" or use any other heuristic. **If `selectedBranch` is somehow null at the moment the mutation fires, abort with a defensive error — do not redeem.**

**C4. Already-redeemed eligibility — branch-independent.**

`isRedeemedThisCycle` is per `(userId, voucherId)` per cycle — **across all branches** for that merchant. Backend enforcement is in [redemption/service.ts:108-124](src/api/redemption/service.ts#L108-L124) via `UserVoucherCycleState` keyed by `(userId, voucherId)` (NO branch in the unique key).

The 12-state UI MUST treat `isRedeemedThisCycle === true` as voucher-locked across ALL branches:

- State #3 (already redeemed) shows the same RedeemedBadge regardless of which branch the user selects via the picker.
- Switching branches in the picker on a state-#3 voucher does NOT change eligibility or unlock the voucher.
- A redemption attempt at Branch B for a voucher already redeemed at Branch A returns `ALREADY_REDEEMED` from the backend — the frontend respects that error and does NOT retry against a different branch.

**C5. Analytics + merchant reporting — `VoucherRedemption.branchId` is the source of truth.**

Whatever value the frontend sends as `branchId` becomes the merchant's branch-attribution column for that redemption forever. Merchant portal reports (Phase 4) will roll up by this field. Wrong-branch attribution is a permanent data error (would require a manual DB fix to undo — unlikely to ever be done).

So: M1/M2 must be paranoid about which branch is "selected" at the moment of mutation. **Tests must include a test that asserts `useRedeem` sends the `branchId` from `selectedBranch.id`, NOT from the merchant aggregate, NOT from `merchant.branches[0]`, NOT from any other source.** Add this assertion explicitly to the M2 test plan.

### 11.3 Implementation rules per milestone

**M1 (view-only):**
- Read `?branch=<id>` query param into `useMerchantProfile(merchantId, { branchId })`.
- Resolve `selectedBranch` from the merchant-profile response (server-resolved if no param). Display "Redeem at <selectedBranch.name>" prominently.
- For multi-branch, ensure the displayed branch matches the URL param (or the cold-open fallback). If they ever diverge (server reconciled to a different branch), surface that via the merchant-profile reconcile flow already on main (`useBranchSelection.reconcile` — same as MerchantProfileScreen does).
- BranchPickerSheet UI lives in M2, not M1. M1 just displays the selected branch name + a stub-disabled "Change" affordance with a "Coming next milestone" toast, OR no affordance (decide during impl).

**M2 (redemption):**
- Wire BranchPickerSheet to allow changing the selected branch BEFORE PIN entry. Picker writes back to `useBranchSelection.select(branchId)` → URL updates → merchant profile re-fetches. **Same pattern as Merchant Profile's BranchPickerSheet — reuse where possible.**
- `useRedeem` mutation reads `branchId` from `merchant.selectedBranch.id` at the moment of submission, NOT from any cached or earlier value.
- Add a defensive guard: if `selectedBranch == null` when the user taps Redeem, show a "Pick a branch first" error and reopen the picker. Should never happen in normal flow but defensive against race conditions.
- Tests:
  - `useRedeem` calls POST /redemption with the `selectedBranch.id` value at mutation time (not from any other source).
  - PIN failure at one branch doesn't affect the user's eligibility to retry at the same or a different branch.
  - State-machine: `isRedeemedThisCycle: true` shows state #3 regardless of which branch the picker has selected.

**M3 (ShowToStaff):**
- ShowToStaff displays "Redeemed at <branch>" where branch comes from the redemption row server-side (`redemption.branch.name` per the existing `getMyRedemption` shape — verify during impl). NOT from the picker — by then the redemption is locked.

### 11.4 Risks specific to this contract

- **Wrong-branch attribution from race conditions.** User taps Redeem just as the picker is animating closed → `selectedBranch` may briefly be the old value. Mitigation: read `selectedBranch.id` from a stable React state, not from a transient picker callback. Test for it.
- **Multi-branch merchant with NO branch param in URL.** If the user deep-links to `/voucher/[id]` directly, `useMerchantProfile` cold-opens to a server-resolved branch (nearest by GPS / `isMainBranch`). Display this clearly with the picker available so the user can change it before redeeming — ESPECIALLY if the cold-open chose poorly (e.g. user travelled).
- **selectedBranch resolves to a SUSPENDED branch.** Currently the merchant-profile resolver falls back to the next active branch with the `selectedBranchFallbackReason: 'candidate-inactive'` banner. Voucher Detail must respect that — show the same banner inline and use the resolved branch for attribution.

---

(Section §10 above retained as historical record of decision approval flow.)
