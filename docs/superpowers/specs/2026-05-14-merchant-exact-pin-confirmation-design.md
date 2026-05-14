# Merchant Exact-Pin Confirmation — Design Spec

| Field | Value |
| --- | --- |
| **Date** | 2026-05-14 |
| **Status** | **Draft — awaiting owner approval** (direction approved in principle 2026-05-14; explicit implementation approval pending) |
| **Tier** | 3 (new architectural pattern — first external paid-API integration on the admin-side) |
| **Author** | Claude / owner conversation |
| **Spec scope** | Phase 1 MVP (admin/owner CLI) fully specified. Phase 2 (merchant-portal self-service) architecture sketched; full spec deferred. |

---

## 1. Context

PR #81 (Plan 4 M1) shipped the server-side redaction contract:

> Until a branch is `MANUALLY_CONFIRMED`, its postcode-centroid coordinates are nulled out on customer-facing responses, distance / nearest / map / bbox / GPS-rank computations skip the branch, and the customer-app cannot accidentally present approximate coords as exact.

The redaction protects user trust today but leaves the system without a real path to **upgrade** branches to `MANUALLY_CONFIRMED`. M1.16 hardcoded the 14 seeded fixtures via `BRANCH_LOCALITY_MAP`. For real merchant onboarding (Huddersfield trial → wider UK), branches need a reliable workflow to move from `POSTCODE_CENTROID` to `MANUALLY_CONFIRMED` without admin typing lat/lng by hand.

**This spec defines that workflow.**

## 2. Core principle (owner-locked 2026-05-14)

- **Postcodes.io** remains the free postcode validation + admin-geography source. Unchanged.
- **Google Places** is used to suggest an exact merchant/business pin from branch name + merchant name + address + postcode.
- **A Google result does NOT auto-confirm.** The branch becomes `MANUALLY_CONFIRMED` only after a deliberate admin/owner confirmation action.
- **No customer-flow Google calls.** Ever.

## 3. Confidence ladder

Branches move through:

```
POSTCODE_CENTROID  →  (ADDRESS_GEOCODED)  →  MANUALLY_CONFIRMED
```

- **`POSTCODE_CENTROID`** — set by `createBranch` (M1.21) after postcode-resolve, or by `backfill-locality-data.ts` (M1.22). Lat/lng = postcode centroid (approximate).
- **`ADDRESS_GEOCODED`** — intermediate state for the **Phase 2 merchant-portal flow** where a merchant has suggested a pin via Google but admin hasn't yet approved it. Lat/lng = Google's suggested storefront. **Not used in Phase 1 MVP.**
- **`MANUALLY_CONFIRMED`** — admin/owner has confirmed the pin (either by accepting a Google candidate or by manual override). Lat/lng = confirmed storefront. Customer-app surfaces this as exact.

All four `LocationConfidence` enum values are already in the M1.2 schema. **No schema migration required.**

## 4. Phase 1 — MVP — admin/owner CLI

**Status:** Fully specified; ready to plan.

### 4.1 Workflow

```
                ┌──────────────────────────────────────┐
                │  prisma/suggest-branch-pin.ts        │
                │    <branchId>                        │
                │    (default: read-only suggestion)   │
                └──────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────────────┐
                │  Load branch + merchant from Prisma  │
                │  Build search query                  │
                │  POST Google Places Text Search ──►  │
                │  Parse top candidates                │
                │  Compute high-confidence flag        │
                │  Print to stdout (NO writes)         │
                └──────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────────────┐
                │  Owner reviews candidates            │
                │  Re-runs with --confirm-best         │
                │  OR --confirm-place-id <id>          │
                │  OR --manual --lat --lng             │
                └──────────────────────────────────────┘
                              │
                              ▼
                ┌──────────────────────────────────────┐
                │  Validate flag combination           │
                │  Update Branch: latitude/longitude,  │
                │    locationConfidence,               │
                │    locationResolvedAt                │
                │  Write AuditLog row                  │
                │  Print before/after summary          │
                └──────────────────────────────────────┘
```

### 4.2 Google Places Text Search wrapper

New module: `src/api/lib/googlePlaces.ts`.

```typescript
export type GooglePlaceCandidate = {
  placeId: string
  name: string
  formattedAddress: string
  latitude: number
  longitude: number
  types: string[]              // e.g. ['restaurant', 'food', 'point_of_interest', 'establishment']
  googleMapsUrl: string | null // built from placeId
}

export type SearchPlacesResult =
  | { ok: true; candidates: GooglePlaceCandidate[] }
  | { ok: false; error: 'NO_RESULTS' | 'API_KEY_MISSING' | 'QUOTA_EXCEEDED' | 'GOOGLE_UNAVAILABLE' }

export async function searchPlaces(query: string): Promise<SearchPlacesResult>
```

- Calls Google Places API (New) **Text Search** endpoint: `POST https://places.googleapis.com/v1/places:searchText`.
- Reads API key from `process.env.GOOGLE_MAPS_API_KEY`. **Returns `API_KEY_MISSING` if absent** (no silent fallback; refuses to run).
- `AbortSignal.timeout(10_000)` on the fetch (10 s — same pattern as the postcodes.io resolver, slightly more generous for Google).
- **Caps the response at 5 candidates via the `pageSize: 5` request parameter** (Places API New default is 20; explicit cap keeps payload + latency + cost predictable).
- **Filters out any result with missing / non-numeric `location.latitude` or `location.longitude`** — never coerces missing coords to `0,0`. If all results are filtered out, returns `NO_RESULTS`. (Storing `0,0` as a branch pin is a critical-bug shape; refusing to construct that shape at the wrapper layer is defence in depth.)
- Discriminated-union result mirrors the M1.17 `resolvePostcode` pattern.

**Request body:**
```json
{ "textQuery": "<query>", "pageSize": 5 }
```

**Field mask** (the Places API New uses a field-mask header to limit cost-per-call):
```
X-Goog-FieldMask: places.id,places.displayName,places.formattedAddress,places.location,places.types
```
This is the minimum set needed to populate `GooglePlaceCandidate`. **No `places.regularOpeningHours`, no `places.photos`, no `places.websiteUri`, no `places.nationalPhoneNumber`.** Smaller field mask = lower per-call cost AND avoids importing Google data we haven't yet decided how to display.

### 4.3 CLI script modes

New script: `prisma/suggest-branch-pin.ts`.

| Mode | Command | Effect |
| --- | --- | --- |
| Suggest (default) | `npx tsx prisma/suggest-branch-pin.ts <branchId>` | One Google call. Print candidates + current branch state. **No DB writes.** |
| Confirm best | `... <branchId> --confirm-best` | One Google call. Pick candidate #1. Update branch + audit log. |
| Confirm specific | `... <branchId> --confirm-place-id <placeId>` | One Google call. Pick candidate matching the placeId from the candidate list. Reject if not in current top-5. Update branch + audit log. |
| Manual override | `... <branchId> --manual --lat <n> --lng <n>` | **Zero Google calls.** Update branch with user-supplied coords + audit log. For the rare case where Google has no listing or returns wrong location. |

**Validation rules:**
- `<branchId>` is required for every mode; CLI exits 1 with usage banner otherwise.
- Mutually exclusive: `--confirm-best`, `--confirm-place-id`, `--manual` cannot combine.
- `--manual` requires both `--lat` and `--lng`; validates within UK bounding box (lat ∈ [49.5, 61.0], lng ∈ [-8.5, 2.0]).
- An optional `--note "..."` flag captures free-text admin context (e.g., `--note "owner: confirmed in-person 2026-05-15"`). Optional, not required.

### 4.4 High-confidence heuristic

Inside `searchPlaces`, compute a `bestCandidateConfidence: 'HIGH' | 'LOW'` signal **only for the first candidate**:

| Check | Threshold |
| --- | --- |
| Distance from postcode centroid | ≤ 50 metres |
| Place has a business type | `types` includes any of: `restaurant`, `cafe`, `bar`, `store`, `establishment`, `point_of_interest`, `health`, `gym`, `beauty_salon`, `hair_care`, ... (curated list in module constants) — NOT only `route` / `locality` / `political` / `street_address` |
| Name-token match | At least ONE non-trivial token (≥3 chars, lowercased) from Google's `displayName` appears in `Merchant.businessName` OR `Merchant.tradingName` OR `Branch.name`. Trivial tokens (`the`, `and`, `co`, `ltd`, common articles) excluded. |

All three must pass → `HIGH`. Otherwise → `LOW`. The flag is **displayed** to the owner but **never auto-confirms** — confirmation always requires an explicit CLI flag.

### 4.5 Audit metadata

Reuses the existing `AuditLog` table — **no new schema**. On confirmation, write:

```typescript
prisma.auditLog.create({
  data: {
    entityId: branch.id,
    entityType: 'branch',
    event: 'BRANCH_PIN_CONFIRMED',
    ipAddress: 'cli',
    userAgent: 'prisma/suggest-branch-pin.ts',
    metadata: {
      provider: 'google_places' | 'manual',
      placeId: string | null,                  // null for manual override
      candidateName: string | null,
      candidateAddress: string | null,
      candidateTypes: string[] | null,
      googleMapsUrl: string | null,
      bestConfidence: 'HIGH' | 'LOW' | null,
      distanceFromPostcodeCentroidMetres: number | null,
      oldLatitude: number | null,
      oldLongitude: number | null,
      oldConfidence: string,                   // previous LocationConfidence value
      newLatitude: number,
      newLongitude: number,
      newConfidence: 'MANUALLY_CONFIRMED',
      confirmedBy: 'cli',                      // future: admin user id from Phase 5
      note: string | null,
      apiCalls: number,                        // 1 for google modes, 0 for --manual
    },
  },
})
```

Future Phase 5 admin panel will write the same shape with `confirmedBy: <adminUserId>` and `ipAddress: req.ip`. CLI → admin-panel migration is a swap of caller; audit shape unchanged.

### 4.6 Google Cloud setup (owner-action items)

Owner-managed; documented in a setup checklist saved next to the CLI script.

| Step | Owner action |
| --- | --- |
| 1 | Create / use existing Google Cloud project. |
| 2 | Enable **Places API (New)** in the project. (Not legacy Places API; the New API has different pricing + endpoints.) |
| 3 | Create an **API key**. Restrict to "Places API (New)" only. |
| 4 | Apply **server / IP restrictions** when feasible (the dev machine / future server IP). |
| 5 | **Skip** the Google Cloud per-day quota cap — Places API (New) is NOT user-adjustable downward (`Adjustable: No`). See §4.8.1 for the replacement (local hard-stop). |
| 6 | Set a **billing alert** at ~£5/month (or local-currency equivalent), 50% / 90% / 100% thresholds, "Actual" trigger. |
| 7 | Add `GOOGLE_MAPS_API_KEY=<key>` to `.env`. Never commit. `.env.example` documents the variable. |
| 8 | Verify with one suggest invocation against `tax-branch-karaara-001`. |

**If the implementer needs the actual API key during development, they MUST pause and ask the owner.** No hardcoded keys; no committing keys.

### 4.7 Cost expectations (Phase 1) — verified 2026-05-14, subject to Google pricing changes

> **⚠ Pricing-currency note.** The figures below were **verified against the live Google Maps Platform developer pricing page on 2026-05-14**. Google pricing + free-credit terms change. Before any volume-shifting change, the owner / implementer MUST re-skim <https://developers.google.com/maps/billing-and-pricing/pricing> and adjust the cost table, local caps, and billing alert accordingly. The cap-and-alert pattern is what protects us against drift; the dollar figures are only a snapshot.

The wrapper requests `places.id,places.displayName,places.formattedAddress,places.location,places.types`, which lands us in the **Places API Text Search Pro** SKU (the IDs-only SKU is too restrictive — we need name + location + types).

| SKU | Free monthly cap | Per 1,000 calls (first 100k tier) |
| --- | --- | --- |
| Text Search Pro ← our SKU                 | **5,000 events** | **$32.00** |
| Text Search Enterprise                    | 1,000 events     | $35.00     |
| Text Search Essentials (IDs-only, N/A here) | Unlimited      | $0         |

These figures **supersede** the spec's earlier ~$5/1,000 working assumption captured pre-implementation.

Estimated volume against the verified pricing model + local caps from §4.8:

| Volume | Calls | Real cost |
| --- | --- | --- |
| Huddersfield trial (~30 branches × 1 suggest + 1 confirm) | 60 | **$0** (well within 5,000 free) |
| 300 merchants/month × 1 suggest + 1 confirm | 600 | **$0** (still inside free tier) |
| Whole 5,000 free tier burned in a month | 5,000 | $0 |
| Bug loop attempting 1,000 calls/day for 5 days | 5,000 | $0 — both local caps would refuse before fetch; £5 alert is the backstop |

**The local caps (§4.8.1) are the critical safety net.** They bound the worst-case spend independently of whatever the current per-call price actually is, *and* independently of Google's free-tier terms. The billing alert is a secondary notification. Both are owner-set at setup time (§4.6).

### 4.8 Local daily + monthly hard-stop (M2.3.5 — replaces unavailable Google quota)

Google does not expose a per-day quota knob for Places API (New) — the `Adjustable` column reads `No` in the Cloud Console for every Places API (New) row. To bound bug loops + surprise invoices the wrapper enforces TWO local caps before any `fetch` call:

| Cap | Default | Override env var | Reasoning |
| --- | --- | --- | --- |
| Daily   | **500 calls / local-calendar-day**   | `GOOGLE_PLACES_DAILY_CAP`   | Circuit-breaker — high enough for a busy onboarding day, low enough that a runaway script cannot burn the whole monthly allowance in one afternoon. |
| Monthly | **4,500 calls / local-calendar-month** | `GOOGLE_PLACES_MONTHLY_CAP` | Sits under Google's 5,000 free Text Search Pro events/month so we stay inside the free tier even at worst-case usage. |

If either cap is reached, `searchPlaces()` returns one of `LOCAL_DAILY_CAP_REACHED` / `LOCAL_MONTHLY_CAP_REACHED` (distinct error codes, daily checked first so the failure message is deterministic). The CLI prints a friendly hint with the override.

**Source tracking.** Usage state is shaped to support future per-source budgets without a schema change. Phase 1 calls land under `admin_cli`; a future merchant-portal track would call `searchPlaces(query, { source: 'merchant_portal' })` and accumulate in its own `bySource` bucket. Caps apply to the TOTAL across sources.

State lives in `.cache/google-places-usage.json` (gitignored). Shape:

```json
{
  "month": "2026-05",
  "monthTotal": 123,
  "monthBySource": { "admin_cli": 123 },
  "days": {
    "2026-05-14": { "total": 12, "bySource": { "admin_cli": 12 } }
  }
}
```

Increment / reset rules:

- A live `fetch` attempt counts ONCE (transport failures included — retry storms can't escape the bound).
- An attempt blocked by either cap does NOT increment.
- Local-day rollover: new `days[YYYY-MM-DD]` entry; `monthTotal` keeps running.
- Local-month rollover: entire structure wiped + replaced (prevents unbounded `days` accumulation).
- Malformed JSON file: treated as fresh start (defensive — does not crash the CLI).

### 4.9 Phase 1 constraints (explicit non-requirements)

- **No Place Details API call.** Text Search returns enough fields with the small field-mask. Place Details would cost ~$17/1000 per call and import richer Google data we haven't decided how to display.
- **No richer Google data imported.** Specifically excluded: opening hours, photos, ratings, reviews, phone number, website, booking info. Decision deferred to a future "Google-assisted merchant profile enrichment" spec.
- **No customer-flow Google calls.** PC2 typing, customer discovery, merchant profile, search, map — none of these paths call Google. Ever.
- **No postcode-preview Google calls.** `/postcode/preview` continues to use postcodes.io only.
- **No background bulk pre-fetch.** No "suggest pins for all unconfirmed branches" mode in MVP. One branch per command.
- **No automatic retries.** Single Google call per invocation. If it fails, print the error + exit non-zero. Owner re-runs if appropriate.
- **No autocomplete / keystroke calls.** N/A — there's no UI in MVP. Locked here for Phase 2.
- **No bulk confirm-all mode.** Same as above.

## 5. Phase 2 — Future — merchant-portal self-service

**Status:** Architecture sketched; full spec deferred to its own document when triggered.

### 5.1 Trigger

Phase 2 work begins when **either**:
- Huddersfield trial scales beyond what admin can confirm by hand (~50-100 merchants), OR
- A second curated Market goes live (per §AP trigger in `project_admin_panel_market_expansion_tooling.md`).

Whichever first. Until then, Phase 1 CLI covers the need.

### 5.2 Locked product constraints (carried into Phase 2 spec)

When the merchant portal can trigger pin-suggestion lookups, the risk profile changes substantially. The following constraints are **locked now** to inform the Phase 2 spec:

- **Authenticated** — merchant must be logged in. No anonymous lookups.
- **Explicit user action** — Google call fires only on an explicit "Find suggested pin" button, never on keystroke or every-edit autosave.
- **Per-user rate limit** — distinct from the IP-based rate limit. Both: per-user (`req.user.sub`) AND per-IP. Per-user prevents one merchant from burning the budget; per-IP catches shared-NAT abuse.
- **Per-branch / per-day cap** — same branch should not generate more than ~3 Google calls per day (re-suggestion is rare; abuse is more common).
- **Cache the last suggestion** — if the merchant runs "Find suggested pin" on the same branch within 24h AND the address hasn't changed, return the cached result without calling Google.
- **Pending suggestion lifecycle** — merchant's suggested pin lands as `locationConfidence: ADDRESS_GEOCODED`, NOT `MANUALLY_CONFIRMED`. Branches in this state remain redacted on customer flows per the PR #81 contract (`MANUALLY_CONFIRMED` is the only "exact" tier).
- **Admin approval flips to MANUALLY_CONFIRMED.** Either via a new admin endpoint (reuses the `AuditLog` event names from Phase 1) or via the future Phase 5 admin-panel review queue.
- **Full audit trail** — every lookup, every suggestion, every approval / rejection writes to `AuditLog`. Same metadata shape as Phase 1, with `confirmedBy` populated.

### 5.3 Workflow sketch

```
Merchant enters branch name + address + postcode in portal
       ↓
postcodes.io validates the postcode (existing M1.20 / M1.21 path)
       ↓
Merchant clicks "Find suggested pin"  (explicit action)
       ↓
Server: checks per-user / per-IP / per-branch-day rate limits
        AND checks 24h same-address cache
       ↓ (cache miss)
Server: calls Google Places Text Search (single call)
       ↓
Server: stores candidates + best-confidence flag in a short-lived
        BranchPinSuggestion row (or extends BranchPendingEdit with
        kind: 'PIN_SUGGESTION')
       ↓
Merchant sees candidates in portal map. Picks one OR drags pin
       ↓
Merchant clicks "Submit suggestion"
       ↓
Branch updates: locationConfidence = ADDRESS_GEOCODED,
                latitude/longitude = chosen pin
       ↓ (admin review queue)
Admin approves → locationConfidence = MANUALLY_CONFIRMED
Admin rejects → branch reverts to POSTCODE_CENTROID, optional reason
```

### 5.4 Phase 2 spec deferred

A separate spec document (`docs/superpowers/specs/YYYY-MM-DD-merchant-portal-pin-suggestion-design.md`) will be written when the trigger hits. It will:

- Pick the exact storage shape (`BranchPinSuggestion` table vs `BranchPendingEdit.kind = 'PIN_SUGGESTION'`).
- Define the merchant-portal UI contract.
- Define the per-user / per-IP / per-branch rate-limit tiers.
- Define the cache key / TTL for the 24h same-address de-duplication.
- Define the admin-review queue endpoints.
- Define the audit-trail amendments (`confirmedBy` populated; `merchantUserId` field added).

**Phase 1 implementation MUST NOT prematurely build Phase 2 scaffolding.** The CLI + lib + audit-log shape are forward-compatible: Phase 2 plumbing slots into the same `AuditLog` event names + `LocationConfidence` ladder without breaking changes.

## 6. Schema impact

**Phase 1: zero schema changes.** Reuses:
- `Branch.latitude` / `longitude` / `locationConfidence` / `locationResolvedAt` (M1.2)
- `AuditLog.metadata` JSON (existing)
- `LocationConfidence` enum (`MANUALLY_CONFIRMED | ADDRESS_GEOCODED | POSTCODE_CENTROID | NEEDS_REVIEW`) — all four values already in the M1.2 schema

**Phase 2: may add `BranchPinSuggestion` table or extend `BranchPendingEdit`.** Decision in Phase 2 spec.

## 7. Customer-app impact

**Phase 1: zero customer-app changes.** The PR #81 redaction contract handles both states:

- Before confirmation: branch is `POSTCODE_CENTROID`, redacted server-side, not on map / no distance.
- After confirmation: branch is `MANUALLY_CONFIRMED`, full lat/lng exposed via `exposeBranchPosition`, appears on map / distance computed.

The transition is automatic via the existing helper. No client-side change required.

**Phase 2: customer-app may need an "Approximate location" badge for `ADDRESS_GEOCODED` branches** (the merchant-suggested-but-not-yet-confirmed state). That's a UX polish decision, NOT a blocker. Tracked as a Phase 2 follow-up.

## 8. Pin expiry policy

**Confirmed pins do not expire automatically.**

If a merchant relocates:
- Phase 1: admin manually re-runs `suggest-branch-pin.ts` for the affected branch.
- Phase 2: merchant submits a new pin suggestion → admin approves → audit-log row records the change with `previousLatitude/Longitude` for history.

No automated re-verification cadence. Re-confirmation is event-driven.

## 9. Explicit out-of-scope

- **Google Place Details API** — deferred to future "Google-assisted merchant profile enrichment" spec.
- **Mapbox / OpenStreetMap** — Google Places is the locked Phase 1 provider. Mapbox may revisit for **customer-app basemap rendering** as a separate cost-optimisation track (the basemap doesn't need business listings).
- **Auto-confirmation threshold** — never. Every pin transition through admin sign-off.
- **Bulk confirm tooling** — out of MVP. If admin volume becomes the bottleneck before Phase 2 lands, revisit.
- **Geocoding fallback** — out of MVP. If Google returns `NO_RESULTS`, owner uses `--manual --lat --lng`.

## 10. Implementation status / next steps

| Track | Status |
| --- | --- |
| Spec (this document) | **Updated 2026-05-14** — direction approved; M2.3.5 amendments applied (real pricing in §4.7, local cap §4.8, Phase 1 call pattern). |
| Plan | `docs/superpowers/plans/2026-05-14-merchant-exact-pin-confirmation.md` — M2.3.5 task section added pre-M2.4 per owner direction. |
| M2.1 (`src/api/lib/googlePlaces.ts` + tests) | **Implemented + committed** (mocked tests only — no live Google calls). 15 tests green. |
| M2.2 (`prisma/suggest-branch-pin.ts` CLI) | **Implemented + committed** (mocked tests only). |
| M2.3 (`.env.example` + `docs/operations/google-places-setup.md`) | **Implemented + committed**. |
| M2.3.5 (local daily + monthly cap hard-stop + source tracking) | **Implemented + committed**. 30/30 wrapper tests green; 86/86 `tests/api/lib/` regression green; tsc clean. |
| M2.4 (live smoke + write-path validation) | **Completed 2026-05-14.** Live `suggest` smoke (1 Google Text Search call, owner-authorised) returned a Veppura candidate against Karaara — owner classified the heuristic LOW (name-token miss) as expected behaviour for a converting premises. Manual write-path smoke test (`--manual` mode, 0 Google calls) executed against dev fixture `1a024ace-eeec-4892-aaf5-725868de828f` — confirmed: lat/lng overwrite, `POSTCODE_CENTROID` → `MANUALLY_CONFIRMED` flip, `BRANCH_PIN_CONFIRMED` AuditLog row with full before/after metadata, counter unchanged (apiCalls=0 in manual mode), single-branch scope, Karaara untouched. **No further live Google calls pending unless explicitly approved by the owner.** |
| M2.5 (push + open PR) | **Completed 2026-05-14.** Branch `feature/merchant-pin-confirmation-phase-1` pushed; PR #82 open against `main`. |
| Google Cloud project setup | Owner-completed (per session of 2026-05-14): project + billing enabled, Places API (New) enabled, key restricted to Places API (New), billing alert at ~£5/month, `GOOGLE_MAPS_API_KEY` in `.env`. **Note:** Google-side per-day quota knob is NOT settable for Places API (New) — replaced by the local hard-stop in §4.8. |

**Pause points for the implementer (locked):**

1. **Before any live Google call.** Mocked-test development is OK. The moment a task would issue an actual outbound request to Google (e.g., M2.4 smoke test), the implementer **pauses and asks the owner** to confirm: (a) `GOOGLE_MAPS_API_KEY` is present in `.env`, (b) the local daily + monthly caps (§4.8) are implemented and active — they auto-activate inside `searchPlaces()`, (c) the billing alert is configured, (d) no Google-side hard quota is assumed (Places API New is not user-adjustable downward; the local cap is the hard stop).
2. **If `GOOGLE_MAPS_API_KEY` is missing.** The CLI's first runtime check returns `API_KEY_MISSING` for any non-`--manual` mode; the implementer also pauses + asks the owner during the smoke-test step rather than working around the missing key.
3. **If pricing has materially drifted from §4.7's verified-2026-05-14 figures.** The implementer skim-checks the Google developer pricing page before any volume-shifting change; if the per-call price is meaningfully different, pause and surface the delta + revised cost table to the owner before proceeding.

## 11. Open questions for owner (closed defaults shown)

| # | Question | Closed default |
| --- | --- | --- |
| 1 | Provider for MVP | Google Places Text Search ✓ (owner-locked) |
| 2 | CLI shape | Single script, multi-mode ✓ (owner-locked) |
| 3 | Confirmation flag required to write | Yes; default mode is read-only ✓ (owner-locked) |
| 4 | High-confidence heuristic thresholds (50m / business type / name-token) | Accept defaults ✓ |
| 5 | Pin expiry | Never expire ✓ (owner-locked) |
| 6 | `--note` field required | Optional ✓ |
| 7 | Place Details enrichment | Out of MVP ✓ (owner-locked) |
| 8 | `--manual` UK bounds validation | Lat ∈ [49.5, 61.0], lng ∈ [-8.5, 2.0] (covers GB + NI). Adjustable. |
| 9 | Local daily cap | **500 calls/local-calendar-day** (§4.8). Code-enforced; not a Google setting (Google-side quota is not user-adjustable down). Override env: `GOOGLE_PLACES_DAILY_CAP`. |
| 10 | Local monthly cap | **4,500 calls/local-calendar-month** (§4.8). Sits under Google's 5,000 free Text Search Pro events/month. Override env: `GOOGLE_PLACES_MONTHLY_CAP`. |
| 11 | Billing alert | ~£5/month (or local-currency equivalent). Secondary safety net behind the local cap. |

All eleven have defensible defaults; #9 / #10 are code-enforced (the wrapper refuses fetch before either cap is exceeded), #11 is an owner-set Google Cloud Billing setting.

---

**End of spec.** Plan document follows at `docs/superpowers/plans/2026-05-14-merchant-exact-pin-confirmation.md`.
