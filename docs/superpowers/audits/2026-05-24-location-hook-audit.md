# §DF Pre-Implementation Audits — Tasks 0a / 0b / 0c

**Date:** 2026-05-24
**Branch:** `feature/df-postcode-profile-fallback`
**Spec:** [`docs/superpowers/specs/2026-05-24-postcode-profile-fallback-design.md`](../specs/2026-05-24-postcode-profile-fallback-design.md) v1.1 (commit `0fcb120`)
**Plan:** [`docs/superpowers/plans/2026-05-24-postcode-profile-fallback.md`](../plans/2026-05-24-postcode-profile-fallback.md) v1.0 (commit `6b53ac6`)
**Audit method:** three parallel general-purpose subagents, read-only, structured-report template per task.

This document locks the architectural decisions §DF v1 implementation rests on. Owner review checkpoint sits at the bottom — implementation does NOT proceed until the owner acknowledges these findings.

---

## Task 0a — Location Hook Consolidation Audit

### Inventory

**`useUserLocation`** ([`apps/customer-app/src/hooks/useLocation.ts`](../../../apps/customer-app/src/hooks/useLocation.ts))
- **Return shape:** `{ status: 'idle'|'loading'|'granted'|'denied', location: { lat, lng, area, city } | null, requestPermission: () => Promise<void> }`
- **Side effects:** on mount probes `getForegroundPermissionsAsync`; if already granted, auto-fetches GPS + reverse-geocodes. Sets `area`/`city` from `reverseGeocodeAsync`.
- **Call sites (7):** `HomeScreen.tsx`, `HomeNoLocationBanner.tsx`, `CategoryResultsScreen.tsx`, `MapScreen.tsx`, `SearchScreen.tsx`, `VoucherDetailScreen.tsx`, `MerchantProfileScreen.tsx`.
- **§AU dev override handled:** YES — short-circuits both the `useEffect` probe and `requestPermission`, sets `status='granted'` + override coords, skips OS prompt entirely.

**`useLocationAssist`** ([`apps/customer-app/src/lib/location.ts`](../../../apps/customer-app/src/lib/location.ts))
- **Return shape:** `{ request: () => Promise<ResolvedAddress|null>, status: 'idle'|'loading'|'denied'|'unavailable', address: ResolvedAddress|null, loading: boolean }` where `ResolvedAddress = { addressLine1, addressLine2, city, postcode, country, isoCountryCode }`.
- **Side effects:** lazy `request()` only — no auto-probe on mount. Requests permission, gets GPS, reverse-geocodes into a street-level address shape.
- **Call sites (1):** `PC2AddressScreen.tsx` only.
- **Purpose differs from `useUserLocation`:** YES — returns street-level postal address fields (addressLine1, postcode, country, isoCountryCode) for onboarding form prefill, NOT GPS coords for discovery distance math. No `lat`/`lng` exposed. Orthogonal concern.

### Gap analysis (relative to §DF UX requirements)

| Requirement | `useUserLocation` | `useLocationAssist` |
|---|---|---|
| 4-state `permission` enum (granted/denied/undetermined/unavailable) | partial (idle/loading/granted/denied — missing undetermined + unavailable; conflates loading with permission) | partial (idle/loading/denied/unavailable — no granted) |
| `coords: {lat,lng}` | yes (`location.lat`/`lng`) | no (address only) |
| `request()` with explainer hook | no (jumps straight to OS prompt) | no (jumps straight to OS prompt) |
| Recovery sheet trigger on deny | no | no |
| `openSettings()` action | no | no |
| §AU dev override preserved | yes | n/a (not needed — onboarding only) |

### Locked decision

**Option A — extend `useUserLocation`.** Add proper 4-state permission enum, decoupled loading flag, `request(opts?: { onBeforePrompt? })` callback, `onDenied` callback (or context-mounted sheet), and `openSettings()`. Leave `useLocationAssist` alone — its purpose (street-address reverse-geocode for PC2 form prefill) is orthogonal to GPS-permission lifecycle for discovery, single-call-site, no overlap.

### Migration impact

- **Call sites needing updates: 0 strictly required.** Today's consumers read `{ location }` and `{ requestPermission }` only — both stay backward-compatible if §DF adds new fields/options additively. `MapScreen` (`locationState.requestPermission()`), `HomeNoLocationBanner` (`requestPermission()`) keep working. PC2 is untouched.
- **Recommended (not required) post-§DF cleanups:** thread the new explainer-sheet callback into `HomeNoLocationBanner` + `MapScreen` so the branded pre-prompt fires before the OS dialog. ~2 files for optional polish.
- **Estimated touch points:** 1 file mandatory (`useLocation.ts`); 2 files optional (`HomeNoLocationBanner.tsx`, `MapScreen.tsx`) plus the Saved Area screen (new in Task 7).

### Three-abstractions guardrail — CONFIRMED

§DF v1 will ship with EXACTLY **2** location-permission abstractions:
1. Extended `useUserLocation` — GPS-permission lifecycle for discovery (extended in Task 4).
2. Unchanged `useLocationAssist` — reverse-geocode-to-postal-address for PC2 onboarding (untouched).

Not three parallel. `useLocationAssist`'s narrow address-prefill purpose is orthogonal, single-call-site, and does not duplicate GPS-permission lifecycle concerns.

---

## Task 0b — Profile / Settings Route Audit

### Current `(app)/` structure

- **Flat with 3 dynamic-route subdirs only** (`merchant/`, `voucher/`, `redemption/` — each holding a single `[id].tsx`). All other screens are top-level files.
- **Existing sub-screens registered as `Tabs.Screen` with `href: null`:** `search`, `categories`, `category/[id]` (no tab-bar hide); `merchant/[id]`, `voucher/[id]`, `redemption/[id]` (with `tabBarStyle: { display: 'none' }`).
- **No existing `settings/` subdirectory: CONFIRMED.** No `settings/`, no `account/`, no `profile/` subdirectory. Only the 3 dynamic-route dirs above.
- **`profile.tsx` state:** minimal shell (89 lines) — Title + identity card (avatar + name + email) + spacer + Sign-out button. Header comment explicitly flags Phase 3C.1h Profile rebaseline supersedes it.

### Locked route shape

**Option A — flat sub-route.** No existing or imminent `settings/` subtree, so Option B would invent structure §DF does not need. Mirrors the established `Tabs.Screen` + `href: null` + hidden-tab-bar pattern with lowest blast radius.

- **Route file path:** `apps/customer-app/app/(app)/saved-area.tsx`
- **Screen component path:** `apps/customer-app/src/features/saved-area/screens/SavedAreaScreen.tsx`
- **`_layout.tsx` registration line to add** (insert after line 138, alongside other hidden non-tab routes):

```tsx
<Tabs.Screen name="saved-area"      options={{ href: null, tabBarStyle: { display: 'none' } }} />
```

### Profile cross-link insertion

- **File:** `apps/customer-app/app/(app)/profile.tsx`
- **Suggested insertion:** after line 43 (close of `identityCard` View), before line 45 (`<View style={styles.spacer} />`).
- **Why this spot:** places the Saved Area row directly below the identity card and above the flex spacer that pushes Sign-out to the bottom — the only natural slot in the current shell. New row is a `Pressable` with `router.push('/saved-area')`, using existing `spacing` / `color` / `radius` tokens already imported.
- **Phase 3C.1h Profile rebaseline collision risk: LOW.** Rebaseline will fully replace this shell anyway (per the line 8-11 comment). The cross-link is a 1-block insertion using already-imported design-system tokens — easily ported into the rebaselined Profile (it will need a Saved Area entry-point regardless). No new imports, no new shared state, no new route wiring required beyond the `_layout.tsx` line above.

---

## Task 0c — locationContext Wire-Shape Parity Audit

### Parity table

| Endpoint | Emits `locationContext`? | If no, complexity to add |
|---|---|---|
| Home (`getHomeFeed`) | YES — [`service.ts:1750`](../../../src/api/customer/discovery/service.ts#L1750) | n/a |
| Search (`searchBranches`) | no | low |
| NBC rails | part of Home (returned inside `getHomeFeed` payload as `nearbyByCategory` / `nearbyByCategoryBranches`) | n/a — inherits Home's emit |
| Map (`getInAreaBranches` / `getInAreaMerchants`) | no | low |
| Voucher Detail (`getCustomerVoucher`) | no | medium (no current `lat`/`lng` plumbing into the function; would need `resolveLocationContext` call + signature plumbing for caller lat/lng if surface wants live coords) |
| Merchant Profile (`getCustomerMerchant`) | no | medium (same plumbing caveat as Voucher Detail) |

**Count of endpoints missing emit: 4** (Search, Map, Voucher Detail, Merchant Profile).

### Locked ship/defer decision for §6.4.3 top-of-app status label

**DEFER to §DF-v2-j.** 4 endpoints (≥3 threshold) need additive emit, two of them (Voucher Detail + Merchant Profile) carry plumbing complexity beyond a one-line `resolveLocationContext` call because they don't currently accept or propagate `lat`/`lng`. Shipping the top-of-app status label in v1 would balloon the PR with cross-endpoint signature changes + 4 customer-app Zod schema updates. Per spec §6.4.5 scope guard, DEFER.

**Confirmed: Home-only honesty hint is enough for §DF v1.** The Home payload already carries `locationContext.source === 'profile'`, which is the load-bearing signal for the saved-area honesty hint. The top-of-app status label across Search/Map/Voucher/Merchant surfaces becomes §DF-v2-j with its own plumbing plan (especially the Voucher Detail + Merchant Profile lat/lng propagation question).

### Customer-app Zod schema impact

- Home discovery client ([`apps/customer-app/src/lib/api/discovery.ts`](../../../apps/customer-app/src/lib/api/discovery.ts)) already has `locationContext` in schema: **YES** (`locationContextSchema` defined at line 189, used in the home response schema at line 278).
- Other API clients needing additive schema update if SHIP: **n/a — DEFER decision.** (For the eventual §DF-v2-j follow-up: `discovery.ts` for Search + Map response schemas; `voucher.ts` for Voucher Detail; `merchant.ts` for Merchant Profile.)

---

## Implications for the Plan

The plan has 11 implementation tasks; the audits resolve two conditionals:

| Plan task | Status after audits |
|---|---|
| Task 1 — Seed customer postcode enrichment | RUN as planned |
| Task 2 — backfill script | RUN as planned |
| **Task 3 — Backend `locationContext` parity emit (CONDITIONAL)** | **SKIP — defer to §DF-v2-j per Task 0c** |
| Task 4 — Location hook consolidation | RUN per Task 0a Option A (extend `useUserLocation`) |
| Task 5 — Explainer + recovery sheet | RUN as planned |
| Task 6 — Home saved-area honesty hint | RUN as planned (already has Zod schema support per Task 0c) |
| Task 7 — Saved Area sub-screen + Profile cross-link | RUN per Task 0b Option A (flat route + line 43 insertion) |
| **Task 8 — Top-of-app status label (CONDITIONAL)** | **SKIP — defer to §DF-v2-j per Task 0c** |
| Task 9 — Backend integration pins §DF-1..§DF-7 | RUN as planned |
| Task 10 — Customer-app coverage gap closure | RUN as planned |
| Task 11 — Device-QA + closure docs | RUN as planned |

**Net: 9 implementation tasks remain** (was 11). Estimate revised: **~3-4 days** (was 4-5).

§DF-v2-j follow-up scope (recorded for future):
- Backend additive `locationContext` emit on Search / Map / Voucher Detail / Merchant Profile.
- Voucher Detail + Merchant Profile lat/lng propagation plumbing (signature changes).
- 4 customer-app Zod schema extensions.
- §6.4.3 top-of-app `LocationStatusLabel` component + mount on every Discovery surface.

---

## Owner review checkpoint

§DF implementation will not proceed until the owner acknowledges this audit. Three things to lock:

1. **Task 0a:** Option A (extend `useUserLocation`, leave `useLocationAssist`). Two abstractions total, not three.
2. **Task 0b:** Flat sub-route at `app/(app)/saved-area.tsx`, component at `src/features/saved-area/screens/SavedAreaScreen.tsx`, Profile cross-link after line 43.
3. **Task 0c:** Defer §6.4.3 top-of-app status label to §DF-v2-j. Home-only honesty hint ships in v1.

On owner approval, Task 1 starts.
