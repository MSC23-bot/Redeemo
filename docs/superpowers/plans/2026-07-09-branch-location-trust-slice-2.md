# Branch Location Trust — Slice 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins can tell at a glance where a branch pin came from and how much to trust it, act on the exceptions, and never re-enter a location that Google already verified. Surface provenance on the admin approval screen and branch rows; make `NEEDS_REVIEW` branches discoverable; keep the existing `confirmBranchLocation` flow as the single correction path.

**Scope:** admin-web (Next.js 15, `apps/admin-web`) + one small additive ADMIN-scope backend read (`getReviewContext`). No customer-scope serializer is touched (invariants L1-L4 hold). No gate logic is changed.

**Spec:** `docs/superpowers/specs/2026-07-09-branch-location-trust-model.md` §2 point 4; invariants §4 L1-L4. Predecessors: Slice 1 (`92d0b2bd`), Slice 1b (`cef158a9`). Register row: `docs/deferrals/open-register.md` §LOC-2.

**Tier:** 2 (multi-file admin-web surface + additive backend read; plan-doc-first).

**Branch:** `feat/branch-location-trust-slice-2` off `origin/main`. Commit per task. NO PR, NO merge.

---

## Inventory findings (done before planning)

- **Badge component:** `apps/admin-web/features/shared/Badge.tsx` exists (`tone: neutral|info|warn|success|danger`, semantic Tailwind colours). Admin-web is deliberately NEUTRAL (`.claude/rules/admin-web.md`: no brand fonts/colours); the existing Badge semantic tones are the house convention here, so provenance badges reuse them rather than injecting brand red. No emoji, SVG icons via `lucide-react` (already the admin-web icon set).
- **Two branch payloads + two render sites (both carry `locationConfidence`):**
  1. Review context `reviewBranchSchema` (`apps/admin-web/lib/api/review.ts`) → rendered by `features/review/BranchTable.tsx` on `app/(app)/queue/[id]/page.tsx`. Already maps confidence→Badge but with NON-spec labels ("Confirmed"/"Geocoded"/"Postcode centroid").
  2. Merchant detail `branchDetailSchema` (`apps/admin-web/lib/api/merchants.ts`) → rendered inline on `app/(app)/merchants/[id]/page.tsx` (line ~173) as the RAW `locationConfidence` string.
- **Correction path already wired (task D):** `features/merchants/ConfirmLocationDialog.tsx` (manual lat/lng, NO map) is opened from `BranchTable`'s per-row "Confirm location" button, wired in `queue/[id]/page.tsx`. `confirmBranchLocation` (backend `src/api/admin/branches/service.ts`) → `MANUALLY_CONFIRMED`. There is NO map component anywhere in admin-web.
- **Map approach decision (reuse-first → zero-dependency fallback):** admin-web CSP (`apps/admin-web/lib/securityHeaders.ts`) is `default-src 'self'` with `img-src` limited to self/data/blob/R2/S3 and no `frame-src`. An OpenStreetMap embed iframe OR a static tile image would BOTH be blocked by CSP; enabling either means loosening the admin security policy (a security-surface change I will not make unilaterally). **Chosen:** the task's offered zero-dependency fallback — a lat/lng + address + provenance-badge panel with an external "Open in Google Maps" link (a top-level new-tab navigation, not blocked by CSP). No maps SDK, no API key, no CSP change.
- **Backend admin read:** `getReviewContext` (`src/api/admin/approvals/service.ts`) branch `select` omits `latitude`/`longitude`/`googlePlaceId`. The staged Google suggestion lives in `AuditLog.metadata.locationSuggestion` on the `BRANCH_CREATED` row (`{ placeId, latitude, longitude, postcode, source }`), NOT a Branch column. Admin reads are not customer-redacted, so exposing coords + the staged suggestion here is allowed (L3 governs CUSTOMER exposure only).
- **Gate reality (no change):** the go-live "main-branch location confirmed" gate (`getReviewContext`/approve path, `isBranchLocationConfirmed`) already uses `CONFIRMED_LOCATION_SET = [MANUALLY_CONFIRMED, ADDRESS_GEOCODED]` (Slice 1, owner-approved). So `ADDRESS_GEOCODED` ALREADY satisfies approval; `POSTCODE_CENTROID`/`NEEDS_REVIEW` block it. Slice 2 only VISUALISES this; it changes no gate.
- **Queue list is approval-scoped:** `app/(app)/queue/page.tsx` + `features/queue/StatusFilter.tsx` list APPROVALS, not branches. `NEEDS_REVIEW` is branch-level; flagging it on approval rows needs a backend queue-list additive field → out of Slice-2 scope. Task C is served at the branch-list level (`BranchTable`).

**QUESTION for the lead (non-blocking; proceeding with the visual default):** an `ADDRESS_GEOCODED` main branch auto-satisfies the go-live location gate with NO human ever having looked at the pin ("Approving the merchant IS the human glance", spec §2.4), yet its badge reads "Google-verified (unreviewed)". The UI reflects this by toning `ADDRESS_GEOCODED`/`MANUALLY_CONFIRMED` as pass (info/success) and `POSTCODE_CENTROID`/`NEEDS_REVIEW` as attention (warn), and by NOT nudging the admin to "correct" an already-trusted pin. Confirm this framing is what you want, or whether ADDRESS_GEOCODED should carry a lighter "review recommended" nudge on the approval glance.

---

### Task 1: Backend — additive ADMIN-scope fields on the review read (`latitude`, `longitude`, `googlePlaceId`, staged `locationSuggestion`)

**Files:**
- Create: `src/api/admin/approvals/reviewBranchSerializer.ts` (pure mapper + staged-suggestion parser)
- Modify: `src/api/admin/approvals/service.ts` (`getReviewContext`: extend branch `select`; fetch staged suggestions from `AuditLog`; map branches through the serializer)
- Test: `tests/api/admin/approvals/reviewBranchSerializer.test.ts` (unit lane, no DB)

- [ ] **Step 1 (TDD):** failing unit tests for `serializeReviewBranch(row, suggestion)` and `parseStagedSuggestion(metadata)`:
  - coerces `Decimal` lat/lng to `number`, `null` when absent
  - passes through `googlePlaceId` (nullable)
  - attaches `locationSuggestion` when a parseable staged suggestion is given, `null` otherwise
  - `parseStagedSuggestion` returns the flat `{ placeId, latitude, longitude, postcode }` from `metadata.locationSuggestion`, and `null` for missing/malformed metadata (defensive against arbitrary JSON)
- [ ] **Step 2:** implement the pure module. `serializeReviewBranch` keeps ALL existing fields; adds `latitude`, `longitude`, `googlePlaceId`, `locationSuggestion`. `redemptionPin` is never in scope (never selected).
- [ ] **Step 3:** wire into `getReviewContext`:
  - add `latitude: true, longitude: true, googlePlaceId: true` to the branch `select`
  - after the `Promise.all`, one extra read: `auditLog.findMany({ where: { entityType: 'branch', entityId: { in: branchIds }, event: 'BRANCH_CREATED' }, select: { entityId, metadata, createdAt }, orderBy: { createdAt: 'desc' } })`, reduced to the latest parseable suggestion per branch id
  - map `branches` through `serializeReviewBranch`
- [ ] **Step 4:** extend `reviewBranchSchema` (`apps/admin-web/lib/api/review.ts`) with `latitude: z.number().nullable()`, `longitude: z.number().nullable()`, `googlePlaceId: z.string().nullable()`, `locationSuggestion: z.object({ placeId: z.string(), latitude: z.number(), longitude: z.number(), postcode: z.string().nullable() }).nullable()`. (Additive + nullable → back-compat.)
- [ ] **Step 5:** `npx tsc --noEmit` clean (after `npx prisma generate`); `npm run test:unit` green. Commit.

### Task 2: Shared provenance mapping + badge (task A core)

**Files:**
- Create: `apps/admin-web/features/shared/locationProvenance.tsx` (label + tone map, `LocationProvenanceBadge`, `isLocationTrusted`/`isLocationUnconfirmed` helpers)
- Test: `apps/admin-web/features/shared/__tests__/locationProvenance.test.tsx`

- [ ] **Step 1 (TDD):** failing test asserting the spec labels + tones for all values:
  - `ADDRESS_GEOCODED` → "Google-verified (unreviewed)", tone `info`
  - `MANUALLY_CONFIRMED` → "Human-confirmed", tone `success`
  - `NEEDS_REVIEW` → "Needs review", tone `warn` (attention)
  - `POSTCODE_CENTROID` → "Approximate (postcode)", tone `warn`
  - unknown value → falls back to the raw string, tone `neutral`
- [ ] **Step 2:** implement. `LocationProvenanceBadge` wraps the shared `Badge`; a `lucide-react` SVG icon per tone (e.g. `ShieldCheck` confirmed, `Sparkles`/`MapPinned` geocoded, `AlertTriangle` needs-review, `MapPin` approximate). No emoji.
- [ ] **Step 3:** test green. Commit.

### Task 3: LocationTrustPanel — pin (coords) + address + badge + external map link + NEEDS_REVIEW suggestion context (task B)

**Files:**
- Create: `apps/admin-web/features/review/LocationTrustPanel.tsx`
- Test: `apps/admin-web/features/review/__tests__/LocationTrustPanel.test.tsx`

- [ ] **Step 1 (TDD):** failing tests:
  - renders the provenance badge + resolved address + coordinates when present
  - renders an "Open in Google Maps" external link (`https://www.google.com/maps/search/?api=1&query=<lat>,<lng>`, `target=_blank`, `rel=noopener noreferrer`) when coords exist
  - for `NEEDS_REVIEW` with a `locationSuggestion`, renders the suggested Google pin vs the current centroid and the cross-check-failed framing
  - for `NEEDS_REVIEW` without a suggestion, still renders the attention framing (graceful)
  - renders a "Correct location" button that calls `onCorrectLocation(branchId)` when the caller supplies it (deep-link to the existing confirm-location flow, task D)
- [ ] **Step 2:** implement. Props: `branch: ReviewBranch`, `canCorrectLocation?: boolean`, `onCorrectLocation?: (branchId) => void`. Copy uses `:` `;` `()` `·`, no em-dash, no emoji.
- [ ] **Step 3:** test green. Commit.

### Task 4: Wire panel + spec badges + NEEDS_REVIEW filter into BranchTable + review page (tasks A, B, C, D)

**Files:**
- Modify: `apps/admin-web/features/review/BranchTable.tsx` (use shared label/tone; add "Needs location review (N)" filter chip that appears only when ≥1 NEEDS_REVIEW branch; keep the confirm-location button)
- Modify: `apps/admin-web/app/(app)/queue/[id]/page.tsx` (render `LocationTrustPanel` for the main branch + any NEEDS_REVIEW branch; wire `onCorrectLocation` to the existing `setConfirmLocationBranchId`)
- Test: extend `apps/admin-web/features/review/__tests__/BranchTable.test.tsx` (spec labels; filter chip filters to NEEDS_REVIEW; chip hidden when none)

- [ ] **Step 1 (TDD):** failing BranchTable tests for the spec labels + the filter chip (shown/hidden, filters rows, count).
- [ ] **Step 2:** implement. Filter chip matches `StatusFilter` chip styling conventions; no new top-level nav.
- [ ] **Step 3:** tests green. Commit.

### Task 5: Merchant detail provenance badge (task A, second render site)

**Files:**
- Modify: `apps/admin-web/app/(app)/merchants/[id]/page.tsx` (replace the raw `branch.locationConfidence` string at ~line 173 with `LocationProvenanceBadge`)
- Test: extend the existing merchant detail page test if one asserts the branch row; otherwise rely on the shared badge test.

- [ ] **Step 1:** implement (badge keys off `locationConfidence` only; no backend change to the merchants payload).
- [ ] **Step 2:** admin-web `npx jest` green. Commit.

### Task 6: Full verification + docs + push

- [ ] admin-web: `npx jest` green (report exact counts; new tests for badge mapping + queue filter present)
- [ ] admin-web: `npx next build` PASSES (mandatory; Next 15 catches what tsc/lint/jest miss)
- [ ] backend (touched the review read): `npx prisma generate` then `npx tsc --noEmit` clean; `npm run test:unit` green
- [ ] Update `docs/deferrals/open-register.md` §LOC-2 (mark Slice 2 implemented on this branch; not yet merged)
- [ ] Push `feat/branch-location-trust-slice-2`; NO PR, NO merge.

---

## Self-review notes

- Spec §2.4 → this slice. §2.5 pin-drop = Slice 3; §2.6 backfill = Slice 4 (out of scope).
- L1-L4: no customer-scope serializer touched; coords exposed ONLY on the admin review read; no gate changed; no wire-shape change. L3 (customer redaction) untouched.
- Map approach: coordinate display + external Google Maps link (CSP blocks embedded maps; documented above). If the lead wants a true embedded mini-map, that is a separate CSP-loosening decision.
- Task D: the correction path is the EXISTING `ConfirmLocationDialog`/`confirmBranchLocation`; the panel deep-links to it, nothing rebuilt.

---

## As-shipped addendum — review corrections (2026-07-09, post-`f0070b86`)

Two review-driven corrections on `feat/branch-location-trust-slice-2` after the first CI run.

### Correction 1 — admin-web CI typecheck fix (blocking)

- **Root cause:** the M6 `makeBranch` fixture in `apps/admin-web/app/(app)/queue/[id]/__tests__/page.test.tsx` supplied `latitude`/`longitude`/`googlePlaceId`/`locationSuggestion` ONLY via its `...overrides` spread (a `Partial<ReviewContext['branches'][number]>`), so those four fields typed as `X | undefined`. `reviewBranchSchema` deliberately requires `number | null` / `string | null` / suggestion-or-null (the serializer always emits them), so `undefined` is not assignable → `tsc --noEmit` TS2322 at line 1331. CI reports the first incompatible field (`latitude`); `longitude`/`googlePlaceId`/`locationSuggestion` would have failed serially.
- **Fix (root cause, not schema loosening):** the base literal now supplies explicit `null`s for all four fields, matching the wire contract. Schema strictness preserved.
- **Fixture audit:** grepped all admin-web branch fixtures feeding the review schema. Only this ONE fixture had the gap; `BranchTable.test.tsx`, `LocationTrustPanel.test.tsx`, and `lib/api/__tests__/review.test.ts` already carry explicit values. So exactly **1 fixture** needed fixing.

### Correction 2 — widen the staged-suggestion read (lead-adjudicated)

- **Writer/reader shape check:** both lanes stage the SAME flat blob via `locationSuggestionMetadata` (`{ placeId, latitude, longitude, postcode, source }`): the create lane under `AuditLog.metadata.locationSuggestion` (BRANCH_CREATED), the reviewed-edit lane under `BranchPendingEdit.proposedChanges.__locationSuggestion` (Slice 1b, key `__locationSuggestion`, confirmed against `merchant/branch/service.ts` + `editApplier.applyLocationTrust` and the `location-suggestion-apply` test).
- **Read (backend `getReviewContext` + `reviewBranchSerializer.ts`):** now surfaces the RELEVANT (freshest) staged suggestion per branch. Precedence: an OPEN (`status: 'PENDING'`) `BranchPendingEdit`'s `proposedChanges.__locationSuggestion` WINS over the BRANCH_CREATED audit metadata; fall back to the audit; null when neither. Each lane reads the latest PARSEABLE row; a malformed blob is treated as absent (validated exactly like `applyLocationTrust`: non-object / missing-or-empty `placeId` / non-finite coords → null, never a throw). New `parsePendingEditSuggestion` reader mirrors `parseStagedSuggestion`.
- **Source discriminator:** `ReviewLocationSuggestion` now carries `source: 'pending_edit' | 'branch_created_audit'` (backend + `reviewLocationSuggestionSchema` in admin-web). `LocationTrustPanel` renders a short source line (`Source: staged with the merchant's pending edit request.` / `Source: staged when the branch was created.`), house copy, no em-dashes.
- **Security cross-check (admin-only widening; nothing else moved):**
  - Admin-only coordinate exposure preserved: only `getReviewContext`/`reviewBranchSerializer.ts` (ADMIN scope) touched; no customer-scope serializer touched (L1-L4 hold; L3 customer redaction untouched).
  - `redemptionPin` never selected: the branch `select` is now the pinned `reviewBranchSelect` constant (co-located with the DTO); `redemptionPin` deliberately absent, pinned by the `reviewBranchSelect NEVER selects redemptionPin` + exact-key-set unit tests, plus the serializer's `never emits a redemptionPin field` DTO test.
  - External link safety: `LocationTrustPanel`'s "Open in Google Maps" link keeps `target="_blank"` + `rel="noopener noreferrer"` with an api=1 query; unchanged and re-verified by the existing panel link test.

### Verification (exact numbers)

- Backend: `tsc --noEmit` clean; `npm run test:unit` = **239 files / 2955 tests** pass (serializer suite = 12).
- admin-web: `npm run typecheck` (`tsc --noEmit`) clean (the CI failure); `npx jest` = **69 suites / 963 tests** pass; `npm run build` (`next build`) PASSES.

### Correction 3 — third lane: BRANCH_UPDATED audit read (lead-adjudicated, same review round)

- **Gap:** Slice 1b runs the trust pipeline on THREE lanes, not two. The draft-window DIRECT edit
  (`updateBranch` direct path) applies the cross-check immediately and records its suggestion on the
  `BRANCH_UPDATED` audit row: it is the lane that stamps `NEEDS_REVIEW` in place, and a merchant editing a
  branch address during onboarding then submitting lands on exactly the review screen this panel ships on.
  Reading only `BRANCH_CREATED` audit rows missed that suggestion, or worse surfaced a STALE create-time
  suggestion for a superseded address.
- **Fix:** the audit read now covers `BRANCH_CREATED` + `BRANCH_UPDATED` via the exported, test-pinned
  `STAGED_SUGGESTION_AUDIT_EVENTS` map (event → source tag); latest parseable row wins across BOTH events,
  so an edit-time suggestion supersedes a create-time one. New source value `branch_updated_audit` flows
  through `reviewLocationSuggestionSchema` and gets its own `LocationTrustPanel` source line ("Source:
  staged with a merchant address edit (draft window)."). Precedence unchanged: an OPEN pending edit still
  wins over both audit sources.
- **Final lane coverage (all three Slice 1/1b writers):** create (`BRANCH_CREATED` audit) ·
  draft-window direct edit (`BRANCH_UPDATED` audit) · reviewed edit (OPEN `BranchPendingEdit`,
  precedence-winning). Post-apply live-merchant `NEEDS_REVIEW` discoverability (a queue-level surfacing)
  remains out of Slice-2 scope as recorded in the Inventory notes.
