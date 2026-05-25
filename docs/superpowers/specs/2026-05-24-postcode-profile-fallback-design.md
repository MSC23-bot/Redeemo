# §DF Postcode / Profile-Location Fallback — Design Spec (customer-app v1)

**Version:** 1.1
**Status:** Locked — ready for implementation planning
**Tier:** 2 — plan-first (multi-file: User location backfill + customer-app honesty hint + Settings sub-screen + permission-education UX + seed enrichment + tests)
**Brainstorm:** in-session 2026-05-23 → 2026-05-24 (10-section package + competitor research + customer-web addendum + owner locks for client/server split + Q2/Q3/Q4/Q-web-1 + sub-workstream split).
**v1.1 amendments (2026-05-24):** owner review found (a) backend resolver already exists at `src/api/lib/effectiveLocation.ts` (Plan 4 M2.4) — spec re-framed to extend/leverage, not rebuild; (b) precedence corrected to PLACE_QUERY > GPS > SAVED_PROFILE > null (existing resolver behaviour preserved); (c) "every onboarded user has postcode" softened to acknowledge seed + legacy gaps; (d) new §6.4 §DF-UX permission education + recovery section added.
**Trigger:** PR #127 (§DG) London/Westminster device-QA confirmed no-GPS users see a diminished Home (no Trending, mostly-rose Popular, no NBC) even though authenticated post-PC2 users should have saved-profile coordinates on file. Plan 4 M2.4 shipped the resolver; the remaining gap is (1) ensuring `User.latitude/longitude/localityId` are populated for seed + legacy users, (2) the Home UI hint, (3) Settings → Saved Area sub-screen, (4) §DF-UX permission education + recovery.
**Sub-workstream:** §DF (customer-app v1, this spec). §DF-web is a separate Tier 2 workstream sequenced after §DF — see §13.

---

## 1. Problem statement

When GPS is denied or unavailable, customer-app Discovery resolves `effLoc = null` and the current cascade ([service.ts:1732-1734](src/api/customer/discovery/service.ts#L1732-L1734) mutual exclusion + `homeRailBuilders.ts` early-returns) produces:

- **Featured** falls back to UK-wide; every tile renders rose "Nearest match on Redeemo" because `distanceMetres` is null.
- **Popular** (post-§DG) fires UK-wide without a rung-priority anchor — rank is genuine popularity but with no local-first preference, every tile still rose.
- **Trending** goes silent — no inclusion-query target.
- **NBC rails** hidden entirely — they require `effLoc` to compute per-category distance buckets.
- **Discovery search** scopes NEARBY/CITY early-return empty; only scope=UK works.
- **Map** initial bbox = England-wide default; user-location dot suppressed.

The user looks at Home and concludes the app is broken, even though every rail is honestly representing its state. This is a particularly bad failure mode because **post-PC2 onboarded users should have postcode/profile-location data on file** — PC2 onboarding mandates it. The resolver IS consulting it ([effectiveLocation.ts](src/api/lib/effectiveLocation.ts) priority 3 SAVED_PROFILE branch), but the SAVED_PROFILE branch only fires when User has `latitude AND longitude AND localityId`. Seed users (`customer@redeemo.com` ships with all three null) and any legacy users registered before PC2 collected lat/lng fall through to `effLoc = null` and see the diminished Home.

In short: the resolver is correct. The data is missing. The UI surface (honesty hint + Settings update path + permission-education recovery) is also missing.

---

## 2. Goal

When GPS is unavailable or denied, customer-app Home should render with the same shape and same ranking ladder it would if GPS were available, anchored on the user's saved profile postcode. A visible honesty hint discloses the fallback source so the user understands why and can correct it (move, holiday, stale postcode).

When GPS becomes available later (user grants permission, or moves to a different physical location), GPS wins immediately and the honesty hint disappears.

**Non-goals (v1):**
- No multi-saved-locations ("Home" + "Work").
- No GPS-vs-postcode disagreement reconciliation UI.
- No IP-based location on customer-app (browser-only concern, §13).
- No surfaces beyond Home (Search, Map, voucher detail, merchant profile inherit the new `effLoc`, but they do NOT render the honesty hint in v1 — see §6 / Q2 decision).
- No re-onboarding flow forcing legacy users to set a postcode.

---

## 3. Locked decisions

| ID | Decision | Reasoning |
|---|---|---|
| **D1** | **Client never sends profile postcode/locality.** Client sends live GPS when available; omits coords otherwise. Backend resolves SAVED_PROFILE from the authenticated `User` row. | Keeps profile postcode trusted server-side. Avoids duplicating profile-location state in client requests. Removes a class of staleness bug (client cache vs server truth). |
| **D2** | **NO raw postcode-prefix matching.** Resolve postcode → Locality coords first via `findOrCreateLocality`, then reuse the existing V3 ranking ladder. | Postcode prefixes don't model real proximity (HD1 / HD2 are adjacent; HD9 / HX1 are not). Plan 4 M1 already supplies coordinate resolution. |
| **D3 (Q2)** | **Honesty hint on Home only for v1.** Other surfaces inherit the new `effLoc` silently. | Minimises surface area; device-QA can flag confusion on Search/Map/voucher detail later if it materialises. |
| **D4 (Q3)** | **Settings → Saved Area** dedicated sub-screen. No inline Home edit sheet. | Parity with PC2 onboarding pattern; reuses the existing postcode-lookup UI. |
| **D5 (Q4)** | **No aggressive GPS prompt** on first Home open if profile postcode exists. Silently use saved postcode. Offer "Use current location" as an affordance where appropriate. | Avoids permission-prompt fatigue. Postcode is already sufficient for ranking; GPS is an enhancement, not a requirement. |
| **D6** | **Source-resolution precedence (server-side, preserves existing resolver):** PLACE_QUERY (explicit place search) > GPS (live, this request) > SAVED_PROFILE (from `User` row) > null. | PLACE_QUERY is an intentional user action ("show me Manchester") and must win for that search context. GPS is the most current ambient signal; profile is the intentional persistent fallback. Matches the locked Plan 4 M2.4 resolver at [`src/api/lib/effectiveLocation.ts:59-108`](src/api/lib/effectiveLocation.ts#L59-L108). **Home-specific behaviour:** Home has no PLACE_QUERY caller (PLACE_QUERY only fires from explicit Search/Category place selection), so Home effectively behaves as GPS > SAVED_PROFILE > null. |
| **D7** | **Sub-workstream split.** Ship §DF (customer-app) first as Tier 2. §DF-web follows as its own Tier 2 using the same `effectiveLocation` contract. | Validates the shared resolver on one surface first. Reduces single-PR blast radius. |
| **D8 (Q-web-1, deferred to §DF-web)** | For signed-in web users: profile postcode wins by default. Explicit "Use current location" tap overrides profile postcode for that session only. | Mirrors Uber / Just Eat saved-address-by-default + explicit-current-location-override. Locked here for forward reference but applies to §DF-web. |

---

## 4. Server-side resolution model

### 4.1 Resolution precedence — preserved from Plan 4 M2.4

The resolver at [`src/api/lib/effectiveLocation.ts`](src/api/lib/effectiveLocation.ts) already implements the locked precedence. §DF does NOT modify the resolver; it ensures upstream data (User profile fields) is populated so the SAVED_PROFILE branch can actually fire.

```
resolveEffectiveLocation(prisma, query, userId):
  │
  ├─ Priority 1: query.placeLocality present (PLACE_QUERY)
  │     → effLoc.source = 'PLACE_QUERY'
  │       lat/lng = placeLocality.centerLat/centerLng
  │       locality = placeLocality
  │       densityClass = deriveDensityClass(placeLocality.populationTier)
  │
  ├─ Priority 2: query.lat + query.lng present (live GPS)
  │     → effLoc.source = 'GPS'
  │       lat/lng = RAW query coords
  │       locality = findNearestLocality(lat, lng)
  │       densityClass = deriveDensityClass(locality.populationTier)
  │       (returns null if no nearest Locality)
  │
  ├─ Priority 3: userId present + User has localityId + latitude + longitude
  │     → effLoc.source = 'SAVED_PROFILE'
  │       lat/lng = User.latitude / User.longitude
  │       locality = User.locality
  │       densityClass = deriveDensityClass(User.locality.populationTier)
  │       (NB: requires ALL THREE — incomplete profile falls through)
  │
  └─ Priority 4: none of the above
        → null
          (existing no-location behaviour preserved)
```

**Home-specific note (per D6):** Home callers never set `query.placeLocality` (PLACE_QUERY fires only from Search/Category place selection), so Home precedence reduces to GPS > SAVED_PROFILE > null.

### 4.2 EffectiveLocation contract — already shipped

```ts
// src/api/lib/effectiveLocation.ts (existing)
export type EffectiveLocation = {
  lat: number
  lng: number
  locality: Locality
  densityClass: DensityClass
  source: 'GPS' | 'SAVED_PROFILE' | 'PLACE_QUERY'
}
```

`source` is already on the type. Downstream consumers (`rankBranchesV3`, `homeRailBuilders`, NBC builders) already treat all three sources identically for ranking — same ladder, same rungs, same proximity-band derivation. §DF does NOT alter ranking dispatch on `source`.

### 4.3 Resolver location in code — already shipped

`resolveEffectiveLocation(prisma, query, userId)` lives at [`src/api/lib/effectiveLocation.ts:59`](src/api/lib/effectiveLocation.ts#L59) (Plan 4 M2.4). It is already consumed by Home, Search, NBC, and the two Map bbox-default sites (`grep -n "resolveEffectiveLocation" src/api/customer/discovery/service.ts` returns 5 call sites).

**§DF does NOT create a new resolver or duplicate logic.** Any extension required (e.g. a future fallback to `Locality.centerLat/centerLng` when User has localityId but null lat/lng) would land as a small, targeted amendment to the existing file with its own follow-up spec. For v1, the SAVED_PROFILE invariant remains "all three of latitude, longitude, localityId must be populated" — backfill closes the data gap rather than relaxing the invariant.

### 4.4 Wire-shape envelope — already emitted

A separate helper `resolveLocationContext` at [`src/api/customer/discovery/service.ts:109-151`](src/api/customer/discovery/service.ts#L109-L151) already emits the 3-state envelope used by the Home response at [service.ts:1750](src/api/customer/discovery/service.ts#L1750):

```ts
locationContext: { city, source: 'coordinates' | 'profile' | 'none', locality }
```

Mapping is consistent with §5.1 below. §DF v1 does NOT modify `resolveLocationContext` for the Home path.

**Forward-looking risk to flag (NOT in v1 scope):** `resolveLocationContext` uses different qualifying fields than `resolveEffectiveLocation`. The former returns `source='profile'` when User has `localityId OR city` (text label); the latter requires `localityId AND latitude AND longitude`. After backfill (§8), every legacy user will satisfy both helpers' invariants AND seed users will be enriched, so the gap closes for the user base §DF v1 cares about. Pre-PC2 users with `city` text but no `localityId`/lat/lng would still see `locationContext.source='profile'` from a `city`-only fallback while `effLoc=null` (rank UK-wide, hint shows profile). This is a latent inconsistency carried forward; v2 should either align the two helpers OR add a `Locality.centerLat/centerLng` fallback in the resolver. Recorded as §DF-v2-i.

### 4.5 Database reads — no new reads in v1

`resolveEffectiveLocation` already does the `User.findUnique({ include: { locality: true } })` once per Discovery request when GPS coords absent. §DF v1 adds zero new DB reads on the hot path. The data-population work happens off-hot-path (PC2 onboarding writes were shipped via Plan 4 M2.4; seed + backfill close the historical gap).

---

## 5. Wire shape

Strictly additive — no breaking changes. The Home response already includes the `locationContext` envelope shipped via PR #126 §BB / D8 (2026-05-22).

### 5.1 `locationContext` envelope — already on Home

```ts
locationContext: {
  city: string | null              // e.g. "Huddersfield"
  source: 'coordinates' | 'profile' | 'none'
  locality: { id: string; name: string } | null
}
```

Source mapping (already implemented in `resolveLocationContext`):

| Server signal | `locationContext.source` |
|---|---|
| lat + lng query params present (GPS) | `'coordinates'` |
| no coords + User.localityId or User.city | `'profile'` |
| no coords + no profile signal | `'none'` |

PLACE_QUERY collapses to `'coordinates'` from the wire perspective because the user explicitly chose where to look — no honesty hint needed.

### 5.2 Why not expose `source: 'GPS' | 'SAVED_PROFILE' | 'PLACE_QUERY'` directly to client

The wire shape collapses GPS + PLACE_QUERY into `'coordinates'` because the client's honesty hint only cares about a 3-way: precise coords / profile fallback / none. The server keeps the full 4-state internally (`EffectiveLocation.source`) for testing + future surfaces.

### 5.3 Search / NBC / Map parity (audit task in plan)

The plan doc will verify whether Search, NBC, and Map endpoints emit the same `locationContext` envelope. If any do not, the plan will add the emit (additive, no breaking change). Required for §DF-UX top-of-app status pill (§6.4) to render consistently across surfaces; not strictly required for the Home-only honesty hint (D3).

---

## 6. Customer-app surface impact

### 6.1 Surfaces consuming the new `effLoc` (silent — no UI change)

- **Search** — NEARBY/CITY scopes start working when profile-anchored. PLACE scope unaffected.
- **NBC rails** — fire from saved postcode coords; tiles render distance chips against profile locality.
- **Map** — initial bbox centres on profile `Locality` coords. User-location dot **suppressed** (it's not real GPS — showing a dot would lie). Map's existing bbox-pan behaviour unchanged.
- **Voucher Detail / Merchant Profile** — distance lines render from profile coords. Same chip semantics as GPS path.

No honesty hint on any of these in v1 (D3 / Q2 lock).

### 6.2 Home — Saved-Area Honesty Hint

A single thin row at the top of Home (above Featured), visible only when `locationContext.source === 'profile'`:

```
📍 Showing offers near Huddersfield · based on your saved postcode    [Update ▸]
```

- Tap target on the whole row + chevron → routes to Settings → Saved Area sub-screen (§7).
- Hidden when `source === 'coordinates'` or `source === 'none'`.
- No animation on mount (avoid drawing attention to a fallback state). Slides up on `source` transition to `coordinates` (300ms ease-out) once GPS grants.
- Reduced-motion: instant show/hide.

Visual treatment: cream-tinted background (`color.surface.tint`), 1px brand-rose hairline border, body.sm copy, brand-rose pin icon. Sits flush below the top safe-area; no card shadow.

### 6.3 Home — "Use current location" affordance

Not as a standalone Home-top pill in v1. Owner direction (D5/Q4): "Offer 'Use current location' as an action where appropriate." For v1, the implicit affordance is the honesty hint → Settings → Saved Area sub-screen, which offers both "Use current location" + "Update postcode". A standalone Home-top "Use current location" pill is deferred to v2 once device-QA validates the v1 hint feels right.

### 6.4 §DF-UX — Permission education + recovery

Mandatory for v1. The native iOS/Android GPS permission prompt is a one-shot, brand-less moment with no context. Once denied, native settings cannot be re-triggered by the app — the user has to know to go to OS Settings. Without education + recovery, denied-permission users get stuck on SAVED_PROFILE forever even when they'd grant if asked clearly.

#### 6.4.1 Branded pre-permission explainer

Before the first native GPS prompt of a session, show a branded modal sheet:

```
Icon: brand-rose pin
Headline: Show offers near you
Body: Redeemo uses your location to surface nearby merchants,
      vouchers, and offers. We never share your location with
      merchants — only distance is shown.
Primary: Continue        ← triggers the native OS prompt
Secondary: Not now       ← dismiss; rely on saved postcode
```

Trigger points:
- First "Use current location" tap in Settings → Saved Area.
- First explicit GPS-requesting action elsewhere in the app (Map "Centre on me", future Home top-pill).
- NOT auto-triggered on cold app open (D5/Q4 — no aggressive prompting if profile postcode exists).

Per-platform: identical UX. Persistence: shown once per OS permission state (i.e. shown again if user previously denied and we're asking again because they tapped "Use current location").

#### 6.4.2 Denied / off recovery prompt

When GPS is requested AND the OS returns "denied" / "permanently denied" / "location services off device-wide", show a recovery sheet instead of silently falling back:

```
Icon: brand-rose pin with subtle slash
Headline: Location is off
Body:    Turn on location in your phone settings to see offers
         near you right now. We'll keep using your saved area
         until then.
Primary: Open settings   ← Linking.openSettings() (iOS) /
                           IntentLauncher → APP_DETAILS_SETTINGS (Android)
Secondary: Use saved area  ← dismisses, source stays 'profile'
```

The recovery sheet is non-blocking. The user can always continue with the saved-area Home experience.

#### 6.4.3 Top-of-app location status label

A small clickable label sits at the top of Home (and inherits to Search, Map, NBC if the parity audit lands them — §5.3), surfacing the current location state at a glance:

| State (`locationContext.source` + permission) | Label |
|---|---|
| `coordinates` (GPS granted, live coords) | `Using current location` |
| `profile` | `Using saved area · Huddersfield` |
| `none` + GPS permission denied | `No GPS · Set location ›` |
| `none` + GPS not yet asked + no saved postcode | `Set location ›` |

- Tap target routes to Settings → Saved Area sub-screen in all states.
- Visual: 12pt label.eyebrow, brand-rose pin icon, thin row.
- Sits ABOVE the saved-area honesty hint (§6.2). When both fire (state = `profile`), the top label is the compact identity ("Using saved area · Huddersfield"); the honesty hint below carries the full caveat + Update affordance. v1 can ship JUST the honesty hint and defer the top label to v1.1 if that simplifies the build; the plan doc will lock the order.

#### 6.4.4 Permission-state hook — consolidate, do NOT add a third abstraction

Customer-app needs a single source of truth for GPS permission + GPS coords + explainer/recovery sheet plumbing. Two relevant abstractions already exist:

- `useUserLocation` at [`apps/customer-app/src/hooks/useLocation.ts`](apps/customer-app/src/hooks/useLocation.ts)
- `useLocationAssist` at [`apps/customer-app/src/lib/location.ts`](apps/customer-app/src/lib/location.ts)

**Plan-doc audit mandate:** before introducing any new hook, the plan must inventory what `useUserLocation` and `useLocationAssist` already do, what they don't, and decide between:

1. **Extend / consolidate**: add the missing capabilities (permission state, request flow that shows the §6.4.1 explainer, recovery sheet trigger on deny, `openSettings()` action) to one of the existing hooks. Migrate the other call sites onto the consolidated hook if duplication exists. **Preferred outcome.**
2. **Introduce a new hook (`usePermissionState` or similar)** ONLY if the audit demonstrates that consolidation would create a worse interface for one of the existing call sites, AND the new hook clearly reduces overall duplication (i.e. it replaces, or wraps, one of the existing hooks rather than running alongside).

**Hard guardrail:** §DF v1 must NOT ship with three parallel location-permission abstractions. If the audit can't find a clean consolidation, the plan returns to the spec for a decision before code lands.

Expected shape (interface, not file path) regardless of which hook owns it:

```ts
{
  permission: 'granted' | 'denied' | 'undetermined' | 'unavailable'
  coords: { lat: number; lng: number } | null
  request(): Promise<void>            // shows pre-permission explainer → native prompt
  openSettings(): Promise<void>       // recovery action
}
```

All Discovery callers read from the consolidated hook to decide whether to pass `lat/lng` to the API. The hook owns the explainer + recovery sheet mounts. Plan doc will lock the consolidation decision + library choice (expo-location already pulled in by the existing hooks).

#### 6.4.5 v1 scope vs deferred

**In v1:**
- §6.4.1 branded pre-permission explainer.
- §6.4.2 denied/off recovery sheet.
- §6.4.4 permission-state hook.

**Defer if scope-creep risk emerges:** §6.4.3 top-of-app status label. Belongs in v1 ideally; if the plan-doc time estimate balloons, drop to v1.1 follow-up so the honesty hint + Settings sub-screen + permission education ship together. The honesty hint (§6.2) already covers the most critical "no GPS but profile is working" disclosure.

Recorded so it is not lost: even if the status label drops to v1.1, the §DF-v2-g standalone "Use current location" pill stays on the deferred list.

### 6.5 Free-user / unauthenticated state

Unauthenticated requests don't have a `User` row → server can't resolve SAVED_PROFILE → falls through to `effLoc = null`. Existing no-location behaviour preserved. Honesty hint not rendered (no `source = 'profile'` ever fires for unauthenticated users). §6.4.2 recovery prompt still fires if an unauthenticated user explicitly taps "Use current location" anywhere and gets denied.

---

## 7. Saved Area sub-screen (under Profile / Settings surface)

**Route + file names are discovery work — NOT a locked spec assumption.** The current customer-app `(app)` route is flat (`profile.tsx` exists; no `settings/` subdirectory). The plan-doc audit will inspect the current Profile/Settings surface shape and decide one of:
- Add a new Saved Area route alongside existing profile screens (e.g. `app/(app)/saved-area.tsx`).
- Open a new Settings stack and put Saved Area inside it (e.g. `app/(app)/settings/saved-area.tsx`).
- Reuse an existing settings/profile sub-screen mechanism if one is already wired (the plan-doc audit will look).

What this spec locks: there IS a Saved Area sub-screen reachable from the Profile/Settings surface. Exact route shape, file names, and whether a new stack is needed are deliberate plan-doc decisions.

### 7.1 Surface contents

```
Header: "Saved Area"
Body:
  Current saved postcode:  HD1 1AA
  Current locality:        Huddersfield, West Yorkshire

  [Update postcode]  ← opens PC2-style lookup
  [Use current location]  ← triggers GPS permission prompt

  Caveat: "Your saved postcode helps us show relevant offers when location is off."
```

### 7.2 Update flow

- **Update postcode** — reuses the existing PC2 postcode-lookup component (the plan-doc audit will confirm the exact component name + import path). On confirmation:
  1. `PATCH /api/v1/customer/profile` with `{ postcode }` (existing endpoint; existing `findOrCreateLocality` server-side hook).
  2. Invalidate React Query caches: `['home']`, `['discovery']`, `['search']`, `['map']`, `['nbc']` (exact key list to be reconciled with the customer-app cache audit).
  3. Navigate back; Home re-renders against new locality.

- **Use current location** — routes through the §6.4 permission flow:
  1. Show §6.4.1 branded pre-permission explainer (skip if permission state is already `granted`).
  2. On Continue → trigger native OS GPS prompt via `usePermissionState().request()`.
  3. **On grant**: read GPS coords; invalidate Discovery caches; navigate back; Home re-renders with `source='coordinates'`; honesty hint disappears.
  4. **On deny / off**: show §6.4.2 recovery sheet ("Open settings" / "Use saved area").
  5. **GPS coords are NOT written to `User.postcode`.** They live in the client's location-state singleton and ride future Discovery requests as `lat/lng` query params. Profile postcode is untouched.

### 7.3 Cross-link from Profile tab

The Profile tab (`app/(app)/profile.tsx`) gains a single row: `Saved Area · Huddersfield, West Yorkshire ›` → routes to the Saved Area sub-screen (route shape per §7 lead-in). Exact row placement + visual treatment to be confirmed during plan/code audit against the existing Profile layout.

---

## 8. Seed + backfill

The `resolveEffectiveLocation` SAVED_PROFILE branch requires `User.localityId AND User.latitude AND User.longitude` — all three. Seed + backfill must populate all three for SAVED_PROFILE to fire.

### 8.1 Seed customer postcodes

`prisma/seed.ts` currently creates `customer@redeemo.com` with `postcode = null`, `latitude = null`, `longitude = null`, `localityId = null`. §DF v1 seeds:

| Email | Postcode | Locality | latitude / longitude |
|---|---|---|---|
| `customer@redeemo.com` | `HD1 1AA` | Huddersfield, West Yorkshire (existing seed merchant cluster) | resolved from `findOrCreateLocality(postcode)` → locality centroid |
| Any other seeded customer accounts | Realistic UK postcode covering a seeded-supply locality | — | — |

Seed flow: resolve postcode → call `findOrCreateLocality(postcode)` (Plan 4 M1) → set `User.localityId`, `User.latitude = locality.centerLat`, `User.longitude = locality.centerLng`. Note: postcode-centroid resolution gives locality-centre coords, not pinpoint address coords. This is consistent with the §R3 risk note and aligned with the `POSTCODE_CENTROID` redaction contract.

### 8.2 Backfill script for legacy + incomplete users

New script: `prisma/backfill-user-locality.ts`.

Scope: every `User` with `postcode IS NOT NULL` and (`localityId IS NULL OR latitude IS NULL OR longitude IS NULL`).

Action per user:
1. `findOrCreateLocality(user.postcode)` to resolve Locality.
2. UPDATE `User SET localityId = locality.id, latitude = locality.centerLat, longitude = locality.centerLng` where currently null.

Notes:
- Idempotent — re-running over an already-backfilled user is a no-op (the WHERE clause filters them out).
- Passive — no forced re-onboarding. Users with no postcode at all stay on no-location until they update profile (§DF-v2-b: optional Home prompt to set postcode).
- Caveat captured: backfill uses postcode-centroid coords, NOT real address geocoding. Same caveat as seed (§8.1). Acceptable for Discovery ranking; not for navigation. Users who actually onboarded via PC2 will have real address-resolved lat/lng (PC2 calls postcodes.io which returns the postcode-area centroid too, so the actual precision is the same — locality-centre level).

Run cadence: once on §DF deploy. Re-run on demand if a future ONSPD refresh or audit flags more incomplete rows.

### 8.3 Phrasing clarification — who has data, who needs backfill

| User cohort | Expected state | §DF action |
|---|---|---|
| Post-PC2 onboarded users | Should have postcode + lat/lng + localityId | Backfill script no-ops for these |
| Legacy users (pre-PC2 onboarding lat/lng collection) | Have postcode, may have NULL lat/lng / localityId | Backfill closes the gap |
| Seed users (`customer@redeemo.com`, others) | All location fields NULL | Seed script populates them |
| Users with no postcode at all | NULL everywhere | No-op — stay on no-location until they update profile |

Soften the "every onboarded user already has postcode" framing: this is true for post-PC2 onboarded users, but seed + legacy users need enrichment/backfill. The backfill script is the v1 mechanism for closing both gaps.

### 8.4 No automated re-resolution on stale postcode

If a Locality row gets updated upstream (ONSPD refresh), existing `User.localityId` FKs stay pointing to the old row. v1 accepts this. Locality data is centroid-stable — boundaries don't shift materially between ONSPD releases. v2 could add a periodic "refresh user locality from postcode" job if needed.

---

## 9. Testing strategy

### 9.1 Backend integration pins

| Pin | Verifies |
|---|---|
| **§DF-1** GPS coords win over saved profile | Authenticated user with `postcode=HD1` AND request lat/lng=51.5 (London) → response `locationContext.source = 'coordinates'`, `locationContext.city = "London"`. Rank ladder anchors on London coords. (Closes D6 GPS > SAVED_PROFILE priority.) |
| **§DF-2** SAVED_PROFILE resolves when no GPS | Backfilled user (`postcode=HD1`, `latitude/longitude/localityId` populated), no request coords → `locationContext.source = 'profile'`, `city = "Huddersfield"`. Same rail shape as GPS-anchored Huddersfield request. |
| **§DF-3** PLACE_QUERY beats GPS AND SAVED_PROFILE | Authenticated user with `postcode=HD1` AND request lat/lng=53.6 (Huddersfield) AND `placeLocality=Manchester` → effLoc.source='PLACE_QUERY', ranking anchored on Manchester. Wire `locationContext.source='coordinates'` (PLACE_QUERY collapses per §5.1). (Closes D6 PLACE_QUERY > GPS priority.) |
| **§DF-4** Identical ranking on same coords regardless of source | Two requests, same lat/lng, one via GPS one via SAVED_PROFILE → identical V3 ranking output. Proves no source-based ranking branching. |
| **§DF-5** Unauthenticated request falls through to no-location | No auth, no coords → `locationContext.source = 'none'`, existing no-location behaviour. |
| **§DF-6** Authenticated user with no postcode falls through | Authenticated, postcode/lat/lng/localityId all null, no GPS → `effLoc = null`, `locationContext.source = 'none'`. |
| **§DF-7** Incomplete profile (localityId without lat/lng) falls through to effLoc=null | Authenticated, `localityId` set but `latitude=null` → `effLoc = null` (per resolver invariant). `locationContext.source` may still be `'profile'` (per §4.4 latent inconsistency note). Pin documents current behaviour so the §DF-v2-i alignment work has a baseline. |

### 9.2 Backend unit tests

- Resolver: no changes (existing tests at `tests/api/lib/effective-location.test.ts` cover the 4-branch precedence; verify they still pass after seed/backfill).
- Backfill script: unit test covering (a) post-PC2 user no-op; (b) legacy postcode-only user populated; (c) seed user populated; (d) no-postcode user no-op; (e) idempotency on re-run.

### 9.3 Customer-app unit tests

- `HomeScreen` renders honesty hint when `locationContext.source === 'profile'`.
- `HomeScreen` does NOT render hint when `source === 'coordinates'` or `'none'`.
- Hint tap routes to the Saved Area sub-screen (exact route per §7 plan-doc audit).
- Saved Area screen renders current postcode + locality from profile read.
- Saved Area screen "Update postcode" invalidates Discovery caches on confirm.
- Saved Area screen "Use current location" routes through the consolidated location hook (§6.4.4):
  - shows pre-permission explainer when permission state is `'undetermined'`;
  - skips explainer when permission state is `'granted'`;
  - shows recovery sheet on deny.
- Consolidated location hook unit tests covering grant / deny / unavailable / undetermined states.
- §6.4.3 top-of-app status label renders correct copy for each `(source × permission)` combination.

### 9.4 Device-QA

- **Huddersfield URBAN** (HD1) — silent profile-fallback; Home renders fully; chip on Karaara/Pino's reads green.
- **Builth Wells RURAL** (LD2) — silent profile-fallback; Home renders sparse but honest (NBC may be thin; chips honest).
- **GPS → granted mid-session** — honesty hint disappears within one Home refresh; rail rerank against GPS coords.
- **GPS → denied + no profile postcode** (legacy account) — existing no-location behaviour preserved; no honesty hint; recovery sheet fires if user taps "Use current location" anywhere.
- **First "Use current location" tap in Settings** — branded pre-permission explainer fires; native prompt fires on Continue; recovery sheet fires on Deny.
- **App backgrounded → user grants permission in OS Settings → returns** — top-of-app label updates from `No GPS · Set location` to `Using current location` on next focus.

---

## 10. Risks

| ID | Risk | Mitigation |
|---|---|---|
| **R1** | Profile postcode stale (user moved). | Visible honesty hint + Update action. v2 could add a periodic "Is HD1 still right?" prompt if device-QA flags this. |
| **R2** | Legacy users without postcode stay diminished. | Passive backfill via honesty-hint conversion. Owner-direction: no forced re-onboarding. v2 could add a one-time Home banner prompting postcode-set if Profile.postcode is null. |
| **R3** | `Locality` centroid distance is ~1-5km imprecise. | Acceptable for Discovery (already aligned with `POSTCODE_CENTROID` redaction). Not for navigation — Map directions still require GPS. |
| **R4** | Resolver adds a User DB read per Discovery request when GPS absent. | One small indexed read (`User.findUnique` by id, select narrow fields). Request-scope cache prevents duplication within a single Home call. Monitor in §W production-resilience pre-launch. |
| **R5** | `locationContext.source = 'profile'` could leak the fact that a user IS authenticated to a malicious-but-authed observer. | N/A — the field is only returned on authenticated requests anyway. No new surface area. |
| **R6** | React Query cache invalidation on "Update postcode" / "Use current location" might miss a query key. | Comprehensive invalidation list in §7.2; integration pin §DF-1 + §DF-2 with cache snapshot before/after. |

---

## 11. Out of scope / deferred

| ID | Item | Deferred to |
|---|---|---|
| §DF-v2-a | Multiple saved locations ("Home" / "Work") | Tier 2 brainstorm when user demand materialises |
| §DF-v2-b | Home banner prompting postcode-set when User.postcode is null | Tier 1 follow-up if device-QA shows no-postcode users get stuck on no-location |
| §DF-v2-c | Aggressive GPS prompt on first Home open | Re-evaluate if Settings-sub-screen "Use current location" tap-rate is low |
| §DF-v2-d | GPS-vs-postcode disagreement reconciliation UI | Tier 2 brainstorm if device-QA flags confusion |
| §DF-v2-e | Periodic "Is your postcode still right?" prompt | Tier 1 follow-up if R1 materialises in production |
| §DF-v2-f | Honesty hint on Search / Map / voucher detail / merchant profile | Tier 1 expansion if device-QA flags confusion |
| §DF-v2-g | Standalone Home-top "Use current location" pill | Tier 1 polish after v1 ships |
| §DF-v2-h | `User.localityId` re-resolution job on ONSPD refresh | Tier 2 when ONSPD refresh cadence is established |
| §DF-v2-i | Align `resolveEffectiveLocation` + `resolveLocationContext` field requirements (or add `Locality.centerLat/centerLng` fallback in resolver) | Tier 1 when device-QA flags users seeing `source='profile'` honesty hint while ranking is UK-wide |
| §DF-v2-j | §6.4.3 top-of-app location status label, IF dropped from v1 per §6.4.5 scope-creep guard | Tier 1 follow-up — must ship soon after v1 |
| **§DF-web** | Customer-website location resolution (5 sources, browser geolocation, IP fallback, visible location control) | **§13 — separate Tier 2 workstream sequenced after §DF v1** |

---

## 12. Competitor research

Empirical validation of the saved/manual/current location fallback model:

- **Groupon** — favourite-locations list + explicit location search; mobile uses GPS when available, falls back to user-saved location. Resolves saved areas to coords + ranks by proximity. Does NOT match by raw postcode prefix.
- **Just Eat** — postcode/address-first model (users enter a delivery postcode upfront); ranking by distance-to-delivery-address. Entire discovery experience anchored on a resolved address, not on prefix matching.
- **Uber** — when location permission denied, prompts for manual entry; supports saved places ("Home", "Work"). Both saved places resolve to coordinates; the ranking engine consumes coords, not labels.
- **tastecard** — map / search around user area or current location, with fallback to manual area entry.

**Lock-in conclusion** (D2): *"Redeemo should not rely only on live GPS. If GPS is denied/unavailable, use saved postcode/profile location as a first-class fallback. But do not use raw postcode-prefix matching as the primary model. Resolve postcode/profile area into coordinates/locality/effectiveLocation, then reuse the same Discovery ranking ladder."*

Every competitor in this set converges on the same architectural choice §DF v1 makes: resolve location source → coordinates → shared ranking. §DF differs only in that **the client never ships profile data** (D1) — competitors typically pass the saved-address ID from a client cache; §DF keeps profile state server-side and the client only sends what it actively knows (live GPS).

---

## 13. §DF-web — follow-up sub-workstream (separate Tier 2)

§DF-web is sequenced AFTER §DF v1 ships and uses the same `effectiveLocation` resolver. **Listed here for forward reference; NOT part of §DF v1 execution.**

### 13.1 Locked architectural principle

*"Customer-web must not build separate ranking logic. It must resolve a location source into the shared `effectiveLocation` contract, then reuse the same Discovery ranking/scope ladder."*

This is non-negotiable. §DF-web extends `resolveEffectiveLocation` with web-specific source-resolution paths; it does NOT fork the ranker or add web-specific scopes.

### 13.2 Five location sources (web)

1. **Signed-in profile postcode** — same `User.postcode` / `User.localityId` as customer-app.
2. **Explicit postcode/town search** — primary web mechanism; visible location control near the top of discovery.
3. **Browser geolocation** — via `navigator.geolocation`, requires explicit user action.
4. **IP-based rough location** — low-confidence default (city/region level). Provider TBD (Cloudflare headers / MaxMind GeoLite2). Honesty hint MUST disclose "Based on approximate location."
5. **None** — same fallback as customer-app no-GPS state.

### 13.3 Source precedence (web, locked Q-web-1 / Option C)

```
dev override (cookie / query param)
  ↓
user-selected web location (explicit search OR explicit "Use current location" this session)
  ↓
signed-in profile postcode      ← profile wins by default; explicit user action overrides for session only
  ↓
IP-derived rough location
  ↓
none
```

Decision: profile postcode is the default anchor for signed-in users. Browser geolocation is NOT auto-consulted on page load — it only applies when the user explicitly taps "Use current location" (mirrors Uber / Just Eat). The session override does NOT mutate `User.postcode`.

### 13.4 Visible location control

Near the top of every Discovery surface (Home + Search + Categories landing):

```
Showing offers near Huddersfield. [Change ▾] [Use current location] [Enter postcode]
```

Sheet content: profile postcode (if set), recent searches, postcode/town entry field. Saved-places ("Home" / "Work") deferred to v2.

### 13.5 Honesty hint variants (web)

| `source` | Copy |
|---|---|
| `'profile'` | *"Based on your saved postcode."* |
| `'ip'` | *"Based on approximate location. Set your postcode for more relevant offers."* (inline CTA) |
| `'browser-geolocation'` | *"Using your current location."* |
| `'manual'` (explicit search) | *"Showing offers near {place}."* (no caveat) |

### 13.6 §DF-web scope additions

- IP-resolution provider integration (Cloudflare headers MVP; MaxMind GeoLite2 if needed).
- Browser geolocation UI + permission-flow handling.
- Visible location control component.
- Web honesty hint variants (§13.5).
- Web regression tests (jest + jsdom — note: customer-web unit-test infra is currently zero per §BW; §DF-web carries the dependency).

### 13.7 Sequencing rationale

Ship §DF (customer-app) first to validate the shared `effectiveLocation` contract on one surface. §DF-web then reuses the resolver + adds web-specific source paths. Bundling them would be 5-8 days as a single Tier 2 PR — workable, but two surfaces moving simultaneously raises risk. Splitting lets us prove the shared resolver, then layer web on top.

---

## 14. Files touched (estimated)

### 14.1 Backend (~3 files — minimal, resolver already shipped)

- No changes to `src/api/lib/effectiveLocation.ts` (resolver shipped Plan 4 M2.4).
- No changes to `resolveLocationContext` for Home path (wire envelope already shipped).
- POSSIBLE: extend Search / NBC / Map endpoints to emit `locationContext` if §5.3 audit shows gaps (likely needed for §6.4.3 top-of-app label).
- `apps/customer-app/src/lib/api/*` — extend Zod schemas to mirror existing wire envelope.
- New integration pins added to existing `tests/api/customer/discovery/home-feed-rail-states.test.ts` for §DF-1 through §DF-7. Backfill script test in `tests/scripts/backfill-user-locality.test.ts` (NEW).

### 14.2 Customer-app (~8-10 files — the bulk of v1, exact paths TBD by plan-doc audit)

- **Location hook** — consolidated from existing `useUserLocation` ([`src/hooks/useLocation.ts`](apps/customer-app/src/hooks/useLocation.ts)) and `useLocationAssist` ([`src/lib/location.ts`](apps/customer-app/src/lib/location.ts)) per §6.4.4 audit mandate. NOT a third parallel hook.
- `apps/customer-app/src/lib/location/PrePermissionExplainer.tsx` (NEW, path TBD by audit) — §6.4.1.
- `apps/customer-app/src/lib/location/RecoverySheet.tsx` (NEW, path TBD by audit) — §6.4.2.
- `apps/customer-app/src/features/home/components/SavedAreaHonestyHint.tsx` (NEW) — §6.2.
- `apps/customer-app/src/features/home/components/LocationStatusLabel.tsx` (NEW, may defer per §6.4.5) — §6.4.3.
- `apps/customer-app/src/features/home/screens/HomeScreen.tsx` — mount hint + (maybe) status label; honour `locationContext.source`.
- **Saved Area sub-screen** — route + file shape per §7 lead-in; plan-doc audit chooses between flat route, new settings stack, or existing mechanism.
- `apps/customer-app/app/(app)/profile.tsx` — add Saved Area cross-link row per §7.3.
- `apps/customer-app/src/lib/api/discovery.ts` (or equivalent — plan-doc to confirm) — Zod schema covers `locationContext` envelope.
- Test files mirroring §9.3.

### 14.3 Seed + backfill (~2 files)

- `prisma/seed.ts` — populate `postcode`, `latitude`, `longitude`, `localityId` for `customer@redeemo.com` and any other seeded customer accounts (§8.1).
- `prisma/backfill-user-locality.ts` (NEW) — close legacy + incomplete-profile gaps (§8.2).

### 14.4 Docs (~4 files)

- `docs/superpowers/plans/2026-05-24-postcode-profile-fallback.md` (NEW — plan doc derived from this spec)
- `docs/customer-flow-current.md` — add saved-area fallback + permission-education behaviour to current spec.
- `docs/customer-flow-changelog.md` — dated entry for §DF v1 behaviour change.
- `CLAUDE.md` — add §DF as next planned work / move to shipped on merge.

Estimated total: ~17-19 files. Tier 2 plan-first. Backend is minimal; customer-app permission-education UX is the bulk.

---

## 15. Cross-references

- **Plan 4 M1** (location-model UK enrichment) — `docs/superpowers/specs/2026-05-13-plan-4-location-model-uk-enrichment-design.md`. §DF depends on `findOrCreateLocality`, `Locality` table, PC2 postcode collection, `User.localityId` FK, `exposeBranchPosition` redaction contract — all shipped.
- **§DG Popular ranking** — `docs/superpowers/specs/2026-05-23-popular-ranking-design.md` v1.2. §DF amplifies §DG by giving Popular a rung-priority anchor for the majority of users who currently fall through to no-location.
- **PR #126 Home Relevance v1.5-v1.9** — `docs/superpowers/specs/2026-05-22-home-relevance-design.md`. §DF builds on v1.5+ cascade/banner infrastructure; no contract changes required.
- **§W production resilience standing checklist** — applies to §DF resolver (one new indexed DB read per Discovery request when GPS absent).
- **§BW customer-web test infrastructure** — blocker dependency for §DF-web (NOT for §DF customer-app v1).
- **PC2 postcode lookup component** — reused for Settings → Saved Area update flow.

---

## 16. Implementation tier + estimate

**Tier 2 — plan-first.** Backend resolver + wire envelope shipped via Plan 4 M2.4 + PR #126 §BB. Net new work:

| Track | Effort |
|---|---|
| Seed enrichment + backfill script + script test | ~0.5 day |
| Customer-app location hook audit + consolidation (per §6.4.4) + Zod schema audit | ~0.5-1 day |
| Customer-app pre-permission explainer + recovery sheet (§6.4.1, §6.4.2) | ~0.5 day |
| Customer-app Home honesty hint (§6.2) | ~0.25 day |
| Customer-app Settings → Saved Area sub-screen (§7) + Profile row | ~0.5-1 day |
| Customer-app top-of-app status label (§6.4.3, defer-flag) | ~0.5 day |
| §5.3 Search/NBC/Map parity audit + emit if needed | ~0.25 day |
| Backend integration pins + customer-app unit tests | ~0.5 day |
| Device-QA + spec/plan doc closure | ~0.5 day |
| **Total** | **~4-5 days** |

Higher estimate than v1.0 because (a) §DF-UX permission education was added in v1.1; (b) most of the work is customer-app UI + a permission hook that needs careful native interop testing. Backend stays minimal — the resolver, wire envelope, and ranker dispatch are already shipped.

Ship via subagent-driven development. Tasks specced in the plan doc cover seed/backfill → permission hook → UX surfaces → tests → device-QA.

---

**End of spec.** PAUSE for owner review before writing the plan.
