# PR-6 mini-spec: Location business/address lookup (Google Text Search)

Status: DRAFT for owner + Codex review. Docs-only. No implementation until approved. BRAINSTORM-FIRST slice (umbrella invariant: the merchant-side Google integration needs its own mini-spec/decision before any code; this is that mini-spec).

Programme: Merchant Portal Branches (PR-1 to PR-8). Source of truth: `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` (umbrella, D6 + the PR-6 section) + the locked location decisions in `docs/design/merchant-portal/upload-bundle/2026-06-16-merchant-portal-product-blueprint.md` §11.2 to §11.4.

OWNER DECISION (grill-me, 2026-06-24) - SECURITY CORRECTION, not a feature fork: a merchant's Google Text Search pick may autofill/stage the branch address and store server-side Google metadata for admin review, but it MUST NOT set `locationConfidence = ADDRESS_GEOCODED` (or any `CONFIRMED_LOCATION_SET` value) from unilateral merchant action. The branch stays in a non-confirmed / non-discovery-visible confidence state until an admin confirms the precise pin (`MANUALLY_CONFIRMED`). The umbrella D6 phrase "confidence is set to ADDRESS_GEOCODED" is SUPERSEDED/CORRECTED by the older, more-specific, security-motivated locked blueprint §11.4.1; `ADDRESS_GEOCODED` remains reserved for a FUTURE explicitly-approved automated high-confidence rule, not PR-6 merchant self-confirmation.

Grounded in a five-subsystem live-code inspection (the funded `googlePlaces.ts`; the exact-pin-confirmation flow + the placeId question; the SENSITIVE-field edit lane + `locationConfidence`; merchant-web address-entry surfaces + authz; cost/cap + security + the new route).

BASELINE NOTE: PR-6 stacks on the open PR-1/PR-2/PR-3 stack (PRs #309/#310/#313). `assertCanManageBranch` (the management-write guard) + the `resolveMerchantContext`-based branch-edit guard land in PR-2 (#310) and are NOT on `main`; merchant-web branch + onboarding surfaces land in PR-1 (#309). Backend non-merchant-branch files (`googlePlaces.ts`, the customer reads, `confirmBranchLocation`, `editApplier`, `shared/location.ts`) are on `main`. Locate by symbol; line numbers are indicative.

---

## 1. Live-code reality (what exists today)

- The funded Google wrapper `src/api/lib/googlePlaces.ts` (Plan 4 M2.1 / M2.3.5): `searchPlaces(query, opts)` where `opts.source: 'admin_cli' | 'merchant_portal'`. Returns `GooglePlaceCandidate[]` of shape `{ placeId, name, formattedAddress, latitude, longitude, types[], googleMapsUrl }`. `FIELD_MASK` = `places.id,places.displayName,places.formattedAddress,places.location,places.types` (the Text Search Pro field set; deliberately NO `places.addressComponents`, so the only address data returned is the SINGLE `formattedAddress` string). Local caps: `DEFAULT_DAILY_CAP = 500`, `DEFAULT_MONTHLY_CAP = 4500` (env-overridable), checked BEFORE fetch; usage accounted in `.cache/google-places-usage.json` with `bySource` buckets. The `GOOGLE_MAPS_API_KEY` is server-only. `bestCandidateConfidence` returns `'HIGH' | 'LOW'` (a CLI trust heuristic, NOT the `LocationConfidence` enum).
- `merchant_portal` is ALREADY a typed, documented, test-pinned `UsageSource` bucket (`tests/api/lib/googlePlaces.test.ts` forward-compat pin) - PR-6 needs ZERO change to the wrapper to start counting in its own bucket. Caps are TOTAL across sources (admin_cli + merchant_portal share one budget), NOT per-source.
- The only caller today is the owner CLI `prisma/suggest-branch-pin.ts` (`source` defaults to `admin_cli`). It builds a query, calls `searchPlaces`, prints candidates, and applies a confirm-pin (`confirmBranchLocation`-equivalent). There is NO merchant-facing route calling `searchPlaces` - PR-6 is the FIRST.
- `docs/operations/google-places-setup.md`: the key is server-only, funded (Text Search Pro free tier, ~5,000 events/month), NOT customer-facing; merchant-portal self-service WILL call `searchPlaces(query, {source:'merchant_portal'})`; brainstorm-first required before any merchant-side Google call.
- `confirmBranchLocation` (src/api/admin/branches/service.ts): the admin confirm-location flow. Sets lat/lng + `locationConfidence = 'MANUALLY_CONFIRMED'` (unconditionally) + a `BRANCH_LOCATION_CONFIRMED` audit. Gated `branch:confirm-location`. This is the authority for the customer-visible precise pin.
- `resolveBranchLocationFields` (src/api/merchant/branch/service.ts): on ANY postcode change it returns `locationConfidence = 'POSTCODE_CENTROID'` and lat/lng from the postcodes.io centroid, OVERWRITING any caller lat/lng. Called by `createBranchEditRequest` (the reviewed lane) + `updateBranchSensitiveDirectCore` (the direct draft-window lane). So a postcode-bearing address change always lands at `POSTCODE_CENTROID` (non-confirmed) unless something explicitly overrides afterwards.
- `SENSITIVE_FIELDS` (src/api/merchant/branch/service.ts) includes `name/about/addressLine1/addressLine2/city/postcode/latitude/longitude/logoUrl/bannerUrl` (non-exhaustive listing; the address fields are the relevant ones for PR-6). So an address change is SENSITIVE -> on a LIVE branch it flows through the reviewed edit lane `createBranchEditRequest -> BranchPendingEdit -> AdminApproval(BRANCH_IDENTITY_EDIT) -> editApplier.approveEdit`. The applier's `BRANCH_LOCATION_SNAPSHOT_FIELDS` allow-list includes `latitude/longitude/locationConfidence` and applies them verbatim on approval.
- `CONFIRMED_LOCATION_SET = ['MANUALLY_CONFIRMED', 'ADDRESS_GEOCODED']` (src/api/shared/location.ts:33) + `isBranchLocationConfirmed`. This set gates discovery-list ranking (`src/api/lib/ranking.ts:332` returns null otherwise) AND M5 go-live (`src/api/admin/approvals/service.ts:588` throws `MAIN_BRANCH_LOCATION_UNCONFIRMED`). `shared/location.ts` comments already note the code is split: `hasExactPosition`/`exposeBranchPosition` key on `MANUALLY_CONFIRMED`-only (map pin + real coords), while `ranking.ts` accepts both (list). The blueprint reconciliation note flags this inconsistency and resolves the direction to admin-confirmed-only for MVP visibility.
- `Branch` model: has `latitude`/`longitude` (Decimal) + `locationConfidence LocationConfidence @default(POSTCODE_CENTROID)`. There is NO `placeId`/`googlePlaceId` column, NO Place/Geocode table, ZERO placeId references in the generated client. The existing pin flow persists placeId ONLY in `AuditLog.metadata` (audit-only); the editApplier allow-lists DROP placeId. `LocationConfidence` enum already contains `ADDRESS_GEOCODED` (no schema needed for the value).
- Merchant-web (PR-1 stack): the read-only `LocationCard` shows the formatted address + a `locationConfidence` badge (Location-confirmed / Awaiting-location-check) + a pure HTML/CSS map PLACEHOLDER (pinned to make NO network call); its location-edit affordance is currently a DISABLED `LockedAffordance` ("live map + business lookup ship in PR-6"), `isOwner`-gated - NOT an active control. So PR-6 must UN-DISABLE it (not merely re-gate it). Address is entered in the onboarding `BranchStepForm` (create) and edited via `BranchDetailsEditModal` (day-2, through `createBranchEditRequest`). `lib/api/branch.ts` create/edit bodies are address-only (NO lat/lng).
- The blueprint §11.3 (LOCKED pre-live gate): before ANY merchant-facing Google flow goes live, the quota/cost protection MUST move from the file-based counter to the Redis `atomicLimiter` (or equivalent multi-instance-safe limiter) with per-user + per-IP + per-merchant/session + global daily/monthly caps. The file counter is single-process and unsafe in production (per-instance, reset-on-deploy).

Corrections to assumptions:
- CORRECTION 1 (the security correction above): the merchant pick does NOT set `ADDRESS_GEOCODED`. This removes the need to "defeat `resolveBranchLocationFields`" for a confidence write - the existing POSTCODE_CENTROID stamp on the address change is now CORRECT (non-confirmed = non-discovery-visible, exactly what the decision requires). The Google lat/lng becomes admin-review metadata, NOT live confirmed coords.
- CORRECTION 2 (placeId): no schema. placeId is transient / audit-only (stored in `BranchPendingEdit.proposedChanges` + `AuditLog.metadata` for admin review), NOT a Branch column - consistent with the existing pin flow. A queryable `Branch.googlePlaceId` would be schema -> stop-and-report (deferred).
- CORRECTION 3 (no schema overall): `ADDRESS_GEOCODED` already exists (and we are NOT setting it from merchant action anyway); `Branch` already has lat/lng; the only code surfaces are a new server-proxied route + the autofill UI + staging the Google metadata + (pre-live) the Redis cap migration.

---

## 2. Prototype behaviour being targeted

The merchant searches by business name/address; picks a Google Text Search result; the UI autofills the address fields; the merchant reviews/edits and submits. The precise pin remains admin-confirmed. (The prototype also designs Autocomplete + a draggable map pin; both are OUT of scope here - Autocomplete is a separate billable endpoint and a stop-and-approve checkpoint per blueprint §11.4.2; merchant pin-drop is excluded per D6 + blueprint §11.4.1.)

---

## 3. Schema change

NONE. (`ADDRESS_GEOCODED` already exists and is not set by merchant action; `Branch` already has lat/lng; placeId stays transient/audit-only.) If implementation finds a genuine need for a queryable `Branch.googlePlaceId` (e.g. de-dup, re-geocode, or a static-map render keyed by placeId), that is a SCHEMA need and a STOP-AND-REPORT (it contradicts "likely no-schema").

---

## 4. Backend behaviour

### 4a. New server-proxied merchant search route

`POST /api/v1/merchant/location/search` (MERCHANT-LEVEL, NO `:id`), body `{ query: string }`, registered on the merchant plugin. WHY merchant-level, not branch-scoped: the create / add-branch and onboarding flows have NO branch id yet (the branch does not exist), so a `/branches/:id/...` route cannot serve them; and the Google search itself is branch-agnostic (a query -> candidates), so the branch id is irrelevant to the search. Auth: `resolveMerchantContext(app.prisma, req.user.sub)` + the caller must be OWNER or BRANCH_MANAGER (STAFF denied) - a merchant-level "can create or edit a branch" gate, because there is no branch id to scope with `assertCanManageBranch`. The per-branch teeth are enforced at the APPLY step, not the search: create is OWNER-only (`resolveAdminMerchant`); a day-2 edit-request is `assertCanManageBranch(branchId)`. The search reveals nothing branch-specific. Calls `searchPlaces(query, { source: 'merchant_portal' })` so usage lands in the reserved bucket. Maps `GooglePlaceCandidate[]` to a CLIENT-SAFE DTO that STRIPS `latitude`/`longitude`/`googleMapsUrl`: `{ candidateToken, name, formattedAddress }` plus the structured address parts for autofill (section 4d) - a server-issued opaque `candidateToken`, NOT raw coords.

CANDIDATE-TOKEN FLOW (the client NEVER submits lat/lng, in either direction): on search the backend stashes each candidate's coords + `placeId` short-lived in Redis keyed by `merchant + candidateToken` and returns ONLY the token + the display/address fields. The client renders the candidates, the merchant picks one, the client autofills the address text and holds the chosen `candidateToken`. At the APPLY step - whichever of (a) create-branch (the create body), (b) the day-2 reviewed edit-request, or (c) the onboarding direct-write - the client submits the address fields + the `candidateToken` (NOT lat/lng, NOT placeId). The backend resolves the token -> the server-held coords + placeId at apply time and records them as ADMIN-REVIEW METADATA (section 4b). The token resolution MUST be the Redis cache lookup, NOT a fresh billable Google call (no Place Details / second `searchPlaces` - a blueprint §11.4.2 stop-and-approve); if the token has expired, the merchant re-searches (do NOT silently re-call Google). lat/lng + placeId are never on the wire in either direction.

### 4b. Pick + autofill (merchant)

On pick, the client receives the address text to autofill (see 4d on the address source). The merchant edits/reviews the autofilled fields and submits the branch address change:
- LIVE branch: through the EXISTING reviewed edit lane `createBranchEditRequest` (address is SENSITIVE; never bypass identity review). The submit carries the chosen `candidateToken` (NOT lat/lng, NOT placeId); the backend resolves the token to the server-held coords + placeId and stashes them as ADMIN-REVIEW METADATA in `BranchPendingEdit.proposedChanges` (a metadata sub-key) + an `AuditLog.metadata` entry - NOT as a confirmed Branch confidence. The address fields apply through the existing lane as normal; the postcode resolver stamps `POSTCODE_CENTROID` (CORRECT - non-confirmed).
- Create / onboarding (draft-window, direct write): the create-branch body (or the onboarding branch save) submits the autofilled address fields + the `candidateToken`; the address saves directly as today, `locationConfidence` stays `POSTCODE_CENTROID` (non-confirmed). The backend resolves the token to the server-held coords + placeId and records them as admin-review metadata via an `AuditLog` entry on the branch (alongside the existing `BRANCH_CREATED`/`BRANCH_UPDATED` audit; the direct create/edit does not produce a `BranchPendingEdit`). NO `ADDRESS_GEOCODED`. (If the create/onboarding direct-write path has no convenient audit sink for this metadata, that is a small additive decision to resolve at implementation, not a schema change.)

CRITICAL (the security correction): NEITHER path sets `locationConfidence` to any `CONFIRMED_LOCATION_SET` value. The branch is NOT discovery-visible / not go-live-eligible from the merchant's Google pick. The merchant's pick only (a) autofills the address and (b) gives the admin a high-quality suggested pin to confirm.

### 4c. Admin confirmation (unchanged authority)

The admin reviews the branch (the existing actioner / confirm-location flow) and, using the merchant's staged Google-suggested lat/lng/placeId metadata as an input, runs `confirmBranchLocation` to set the precise lat/lng + `MANUALLY_CONFIRMED`. THIS is the only thing that makes the branch discovery-visible + go-live-eligible. PR-6 may surface the staged Google suggestion in the admin review so the admin can confirm at the suggested pin (a light read of the staged metadata); the confirm authority + the `MANUALLY_CONFIRMED` write stay exactly as M6 built them.

### 4d. Address autofill source (recorded default)

`searchPlaces` returns only a single `formattedAddress` string (FIELD_MASK omits `addressComponents`). Recorded default: WIDEN `FIELD_MASK` to add `places.addressComponents` so the route can return structured address parts (street / locality / postal town / postcode) for clean autofill into the existing `addressLine1/addressLine2/city/postcode` fields. `addressComponents` is within the same Text Search Pro field tier (no new SKU); VERIFY the field-billing-tier is cost-neutral at implementation (if it bumps the tier or breaks the funded free-tier assumption, fall back to parsing `formattedAddress` heuristically). The widen is additive to the shared wrapper (the admin CLI ignores the extra field). The merchant ALWAYS reviews/edits the autofilled fields before submitting, so imperfect component mapping is acceptable.

### 4e. Cost/cap + rate limit (LOCKED pre-live gate)

Per blueprint §11.3 (LOCKED): before this merchant-facing Google flow goes LIVE, the quota/cost protection MUST move off the single-process file counter (`.cache/google-places-usage.json`) to a multi-instance-safe limiter (the Redis `atomicLimiter` or equivalent) with per-user (`req.user.sub`) + per-IP + per-merchant + global daily/monthly caps. PR-6 SCOPE INCLUDES this migration for the merchant route (the file counter stays for the admin CLI / dev). The global `100/min/IP` is too coarse and the wrapper's 500/day is aggregate + shared with the CLI, so a per-merchant tier is required. If the `atomicLimiter` is not readily reusable for this shape, STOP-AND-REPORT (the file-counter merchant flow must NOT ship to production). Also add a client-side min-query-length + debounce on the search box (cheap abuse protection), reusing the public-form protections where relevant.

---

## 5. Customer-visible behaviour

NONE changes from a merchant Google pick. Because the merchant pick never writes a `CONFIRMED_LOCATION_SET` confidence, the branch's discovery-list ranking + map exposure are UNCHANGED until an admin confirms (`MANUALLY_CONFIRMED`). This is the whole point of the security correction: a merchant cannot place themselves into customer discovery (accidentally or maliciously). The customer-facing precise pin remains admin-confirmed only.

---

## 6. Merchant / admin behaviour

Merchant (merchant-web): a search-and-pick UI (search box + candidate list + "use this address") slots into BOTH the onboarding `BranchStepForm` (create) AND `BranchDetailsEditModal` (day-2 edit), writing the picked address into the SAME address fields each form already owns (no new field plumbing). The day-2 pick flows through the existing reviewed edit lane (never a direct PATCH). The lookup entry point + the "Update location" affordance are gated to match the SERVER gate (`assertCanManageBranch` = OWNER + assigned BM), NOT `isOwner` (reconcile the PR-1 `LocationCard` `isOwner` gate to `canManage` so assigned BMs get the lookup; recorded default). The merchant never sees lat/lng or a pin; they see the address + the existing "Awaiting location check" / "Location confirmed" badge.

Admin: the confirm-location authority is unchanged (M6 `confirmBranchLocation` -> `MANUALLY_CONFIRMED`). PR-6 optionally surfaces the merchant's staged Google-suggested location metadata in the admin review so the admin can confirm at that pin. No new admin capability; no new approval type (the address change rides the existing `BRANCH_IDENTITY_EDIT` review lane).

---

## 7. Authorization (Owner / Branch Manager / Staff)

| Action | OWNER | BRANCH_MANAGER | STAFF |
|---|---|---|---|
| Location search (merchant-level route, no branch id) | Allowed | Allowed | Denied |
| Submit a Google-picked address change | Allowed | Allowed (assigned, via the reviewed edit lane) | Denied |
| Admin confirm location -> `MANUALLY_CONFIRMED` | admin capability `branch:confirm-location` | n/a | n/a |

The merchant-level search route is gated `resolveMerchantContext` + caller is OWNER or BRANCH_MANAGER (STAFF denied); it has no branch id, so the per-branch teeth are enforced at the APPLY step (create = OWNER-only `resolveAdminMerchant`; day-2 edit-request = `assertCanManageBranch(branchId)`). Server-enforced. The key + lat/lng are server-only (never sent to the client; the candidate-token flow keeps coords server-side in both directions).

---

## 8. Tests

Backend:
- The merchant-level search route returns candidates for a query (mocked `searchPlaces`), gated OWNER-or-BRANCH_MANAGER (OWNER 200; any BRANCH_MANAGER 200, since the search is branch-agnostic and the per-branch teeth are at the apply step; STAFF 403); the wire DTO NEVER contains `latitude`/`longitude`/`googleMapsUrl` (the never-expose invariant). The candidate-token apply (create + edit) submits the token, never lat/lng.
- The route counts usage in the `merchant_portal` bucket and refuses past the cap (the multi-instance-safe limiter, not the file counter, in the production path).
- A Google-picked address change on a LIVE branch creates a `BranchPendingEdit` (reviewed) carrying the address + the staged Google metadata; `locationConfidence` is NOT set to `ADDRESS_GEOCODED` / any `CONFIRMED_LOCATION_SET` value (it remains `POSTCODE_CENTROID`); the branch is NOT discovery-rankable (`isBranchLocationConfirmed` false) and NOT go-live-eligible from this action.
- Admin `confirmBranchLocation` still required to reach `MANUALLY_CONFIRMED`; only then is the branch confirmed.
- Onboarding direct-write pick: address saved, `locationConfidence` stays `POSTCODE_CENTROID`, Google metadata recorded in audit.
- placeId is NOT written to a Branch column (no schema); it lives only in the edit-request / audit metadata.
- Autofill: with the widened FIELD_MASK, the route returns structured address parts (mocked); falls back gracefully if components are absent.

merchant-web (jest/RTL): the search-and-pick UI in both the create form + the edit modal autofills the existing address fields; the lookup entry point is `canManage`-gated (OWNER + assigned BM see it; STAFF/non-owner do not); no lat/lng or pin is ever rendered; the submit routes through the reviewed edit lane on a live branch.

---

## 9. Rollback plan

- Code rollback: revert the PR. The new search route + autofill UI disappear; address entry returns to manual-only; the read-only `LocationCard` stays a placeholder. No data migration (no schema). Any staged Google metadata in existing `BranchPendingEdit`/audit rows is inert.
- No schema to roll back. The `merchant_portal` usage bucket entries are harmless accounting.
- The Redis cap migration (4e) is additive infra; reverting the route makes it dormant.

---

## 10. Stop-and-report triggers

- ANY schema need (e.g. a queryable `Branch.googlePlaceId`) - PR-6 is no-schema; a schema need is a stop-and-report.
- ANY path where a Google pick would write a customer-visible identity/location change WITHOUT admin review, OR would set a `CONFIRMED_LOCATION_SET` confidence from merchant action (the security correction forbids both).
- ANY cost model that exceeds the funded free tier at expected merchant volume; if the `atomicLimiter` (the LOCKED pre-live multi-instance-safe cap, blueprint §11.3) is not readily reusable for the merchant route, the merchant Google flow must NOT ship on the file counter - report.
- Widening `FIELD_MASK` to `addressComponents` bumping the Places field-billing tier above the funded free-tier assumption - report (fall back to parsing `formattedAddress`).
- Any temptation to add Autocomplete / Place Details / Address Validation (each a separate billable endpoint + a blueprint §11.4.2 stop-and-approve checkpoint) - out of scope; report if it seems needed.
- DECISION RECORDED (the grill-me security correction): merchant pick does NOT set `ADDRESS_GEOCODED`; admin confirmation gates discovery visibility; D6's "sets ADDRESS_GEOCODED" is superseded/corrected. `ADDRESS_GEOCODED` reserved for a future automated high-confidence rule.

---

## 11. Explicit deferrals

- Type-ahead Autocomplete (separate SKU + stop-and-approve checkpoint, blueprint §11.4.2).
- Merchant map pin-drop / draggable pin (blueprint §11.4.1: merchant-submitted pins do not confer visibility; excluded from this slice).
- A live provider-backed map and/or a static map image on the read-only `LocationCard` (D6 optional sub-choice) - DEFERRED: a Static Maps image is a separate paid Google SKU + a network call on a privacy-sensitive surface; the `LocationCard` stays the designed placeholder.
- A queryable `Branch.googlePlaceId` column (schema) - deferred unless a concrete need (de-dup / re-geocode / placeId-keyed static map) arises.
- The future automated high-confidence rule that would set `ADDRESS_GEOCODED` without admin action (reserved, explicitly-approved future work; NOT PR-6).
- Address Validation / Place Details endpoints (separate billable; not needed for search-and-pick autofill).

---

## 12. Cross-check table (existing code -> proposed PR-6)

| # | Existing (live code) | Proposed PR-6 | Note |
|---|---|---|---|
| 1 | `searchPlaces(query,{source})` funded; only caller is the admin CLI (`admin_cli`); `merchant_portal` bucket reserved + test-pinned; key server-only. | New server-proxied MERCHANT-LEVEL route `POST /merchant/location/search` (NO branch id, so create/onboarding-safe) calling `searchPlaces(query,{source:'merchant_portal'})`, gated OWNER-or-BRANCH_MANAGER (per-branch teeth at the apply step), returning a client-safe DTO (no lat/lng) + a candidate-token flow. | First merchant-side Google caller; honours the brainstorm-first lock (this mini-spec). Branch-id-keyed would not serve add-branch/onboarding (no branch id yet). |
| 2 | Candidate returns `formattedAddress` (single string); `FIELD_MASK` omits `addressComponents`. | Widen `FIELD_MASK` to `addressComponents` for structured autofill (Pro tier, verify cost-neutral); else parse `formattedAddress`. Merchant reviews. | Additive to the shared wrapper; CLI ignores the extra field. |
| 3 | `ADDRESS_GEOCODED` in `CONFIRMED_LOCATION_SET` confers discovery ranking (ranking.ts:332) + M5 go-live (approvals/service.ts:588). | Merchant pick does NOT set `ADDRESS_GEOCODED` / any confirmed confidence (SECURITY CORRECTION, blueprint §11.4.1). Branch stays non-confirmed until admin `MANUALLY_CONFIRMED`. | Supersedes umbrella D6's "sets ADDRESS_GEOCODED". Discovery/go-live stay admin-gated. |
| 4 | `resolveBranchLocationFields` forces `POSTCODE_CENTROID` + discards caller lat/lng on a postcode change. | LEFT AS-IS: the `POSTCODE_CENTROID` stamp on the picked-address change is now CORRECT (non-confirmed). Google lat/lng is admin-review metadata, not live confirmed coords. | The original "defeat the resolver" concern is removed by the security correction. |
| 5 | Address is SENSITIVE -> reviewed edit lane (`createBranchEditRequest -> BranchPendingEdit -> editApplier`). | Google-picked address change on a LIVE branch flows through the SAME reviewed lane; never a direct write; the Google metadata rides in `proposedChanges`/audit. | Never bypass identity review. |
| 6 | placeId persisted only in `AuditLog.metadata` today; no Branch column; editApplier allow-lists drop it. | placeId stays transient / audit-only (edit-request + audit metadata); NO Branch column. No-schema. | A queryable column would be schema -> stop-and-report. |
| 7 | `confirmBranchLocation` (admin) sets lat/lng + `MANUALLY_CONFIRMED` (unconditional). | Unchanged authority; PR-6 optionally surfaces the staged Google suggestion so the admin can confirm at that pin. | Admin confirmation is the sole discovery-visibility gate. |
| 8 | Cost cap = single-process file counter (`.cache/google-places-usage.json`); global `100/min/IP`. | PR-6 moves the merchant route to the multi-instance-safe Redis `atomicLimiter` (LOCKED pre-live gate, blueprint §11.3) with per-user/per-IP/per-merchant/global caps + client debounce + min-query-length. | The file counter stays for the admin CLI / dev; merchant flow must NOT ship on it. |
| 9 | merchant-web `LocationCard` "Update location" is `isOwner`-gated; map is a no-network placeholder; address entered in create form + edit modal. | Search-and-pick UI in both forms autofilling existing address fields; entry point gated `canManage` (match the server gate); map stays a placeholder (static map deferred). | No new field plumbing; lat/lng never rendered. |

---

## 13. PR shape + sequencing

- PR-6 is the BRAINSTORM-FIRST location-lookup slice; likely NO schema. It stacks AFTER PR-1/PR-2/PR-3 (uses the PR-1 surfaces + the PR-2 `assertCanManageBranch` guard).
- Suggested order: the multi-instance-safe cap migration for the merchant route (the LOCKED pre-live gate) -> the server-proxied search route (DTO strips lat/lng) -> the FIELD_MASK widen + structured-address mapping -> staging the Google metadata into the reviewed edit lane + audit (no confidence write) -> the merchant-web search-and-pick UI in the create form + edit modal -> the optional admin-review surfacing of the suggestion -> tests.
- Out of scope: Autocomplete; map pin-drop; static/live map; Address Validation/Place Details; any merchant-set confirmed confidence; PR-7 (alerts); PR-8 (multi-window).

No implementation until this mini-spec is owner + Codex approved.
