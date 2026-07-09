# Branch Location Trust — Slice 1b Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The Slice 1 auto-trust pipeline (a Google-picked pin becomes a customer-visible `ADDRESS_GEOCODED` map pin when it cross-checks, else `NEEDS_REVIEW`) now runs on the branch EDIT lanes too, not just CREATE. A merchant who re-picks their Google listing during an address edit gets the same server-side cross-check the create path already gives them.

**Architecture:** Extend the existing candidate-token flow (coords never cross the wire; L1 unchanged) so the resolved Google pin is APPLIED on an address EDIT when the two cross-checks pass (postcode match + centroid sanity radius), stamping `ADDRESS_GEOCODED` + `googlePlaceId`; any failure degrades to exactly today's behaviour (the postcode-centroid snapshot) plus a `NEEDS_REVIEW` stamp. `crossCheckGoogleLocation` (Slice 1, `src/api/merchant/branch/locationTrust.ts`) is REUSED verbatim: it stays the ONLY writer-authority for the `ADDRESS_GEOCODED` decision (L2). Spec: `docs/superpowers/specs/2026-07-09-branch-location-trust-model.md` (invariants L1-L4; slice table row 1b).

**Tech Stack:** Fastify + Prisma 7 (client at `generated/prisma/client`), Redis candidate stash, vitest (`npm run test:unit` only; NEVER plain `npx vitest run`).

**Branch:** `feat/branch-location-trust-slice-1b` off `main` (Slice 1 = 92d0b2bd). Commit per task.

---

## Scope decision (surfaced before implementation)

Slice 1 left the suggestion as admin-review metadata only on the EDIT paths. There are TWO edit paths that carry a `locationSuggestion`, and both are in scope for 1b because both are structurally an "apply an address change" step, and leaving either behind reproduces the exact create-vs-edit asymmetry Slice 1b exists to remove:

1. **Reviewed-edit APPLY lane** (`editApplier.approveEdit`, branch kind) — the headline 1b deliverable per the spec slice table. The suggestion is staged into `BranchPendingEdit.proposedChanges` at request time and the pipeline runs when the admin APPROVES (apply time). No fresh Google/postcode call at apply: the centroid was resolved at request time and rides in the snapshot (unchanged "pin re-anchors at request time, not apply time" contract).
2. **Draft-window DIRECT sensitive edit lane** (`updateBranchSensitiveDirectCore`) — a direct write, structurally identical to `createBranchCore` (it re-resolves the postcode centroid inline via `resolveBranchLocationFields`). The Slice 1 comment already earmarked it for 1b; the Slice 1 route tests deliberately encode a create-vs-draft-edit asymmetry (create route -> `NEEDS_REVIEW`; draft PATCH route -> `POSTCODE_CENTROID`) that 1b closes.

NOT touched: `confirmBranchLocation` stays the sole `MANUALLY_CONFIRMED` authority (L2). The simple-DIRECT path (phone/email/websiteUrl/isActive) is not an address edit and ignores the suggestion (unchanged).

### Documented behaviours (per the task brief)

- **Address edit with NO staged suggestion:** exactly today's behaviour. The postcode resolver stamps `POSTCODE_CENTROID` (resolve-on-write) and applies verbatim; no pipeline runs; no `googlePlaceId`. Untouched.
- **An `ADDRESS_GEOCODED` / `MANUALLY_CONFIRMED` branch whose postcode changes WITHOUT a suggestion:** today's re-anchor behaviour stays. `resolveBranchLocationFields` re-anchors the pin to the new postcode centroid and stamps `POSTCODE_CENTROID`; the old confirmed confidence is intentionally dropped because the coordinates no longer describe a confirmed point. No pipeline, no `NEEDS_REVIEW`.
- **Edit carries a suggestion but does NOT change the postcode:** the pipeline is GATED to run only when a fresh postcode-centroid snapshot is present (a `NEW` postcode). With no new postcode there is no "new centroid" to cross-check against, so the suggestion stays metadata-only and the branch's existing location is left untouched (never silently downgraded to `NEEDS_REVIEW`). In practice a Google pick always autofills the postcode, so this is a defensive guard, not a common path.
- **A staged suggestion whose Google postcode is null/absent (incl. pre-1b in-flight staged edits):** a failed postcode check, exactly like the create lane (spec route test: "no parseable postcode -> NEEDS_REVIEW"). It degrades to `NEEDS_REVIEW` (both `POSTCODE_CENTROID` and `NEEDS_REVIEW` are fully redacted from customers per L3, so this is the safe, more-conservative outcome; it routes the branch to the admin exception queue).
- **A malformed/poisoned staged suggestion blob (no valid coords/placeId):** the pipeline is skipped entirely and the edit applies at `POSTCODE_CENTROID` (graceful degrade; never a crash, never an accidental `ADDRESS_GEOCODED`).

### Invariants (spec §4) — how 1b honours them

- **L1 (no wire-shape change):** unchanged. The client still submits only `candidateToken`; coords/placeId are resolved server-side. The applier consumes the SERVER-staged sub-key (`__locationSuggestion`), never client-supplied coordinates.
- **L2 (`ADDRESS_GEOCODED` only via `crossCheckGoogleLocation`; `MANUALLY_CONFIRMED` only via `confirmBranchLocation`):** the two new edit-lane call sites route through `crossCheckGoogleLocation`; no other writer sets `ADDRESS_GEOCODED`. `confirmBranchLocation` is untouched.
- **L3 (redaction lock):** `POSTCODE_CENTROID` + `NEEDS_REVIEW` never expose lat/lng. No exposure-gate code changes in 1b; every existing redaction test stays green unchanged.
- **L4 (no partial application):** a failed cross-check keeps the postcode-centroid coords and only stamps `NEEDS_REVIEW`; a pass overwrites coords + placeId + confidence together, in one `branch.update`, inside the existing transaction. No half-applied Google coords.

---

### Task 1: Thread the Google postcode into the staged suggestion metadata

**Why first:** the reviewed-edit apply lane can only read what was persisted in `proposedChanges`. The staged sub-key today (`locationSuggestionMetadata`) carries `{ placeId, latitude, longitude, source }` and DROPS the Google-parsed postcode — so the applier has nothing to cross-check the postcode against. Adding `postcode` to the one shared metadata builder feeds both the staged sub-key (functional) and the create/edit audit metadata (richer provenance).

**Files:**
- Modify: `src/api/merchant/branch/service.ts` (`locationSuggestionMetadata`; the `BranchLocationSuggestion.postcode` doc comment)
- Test: `tests/api/merchant/branch/location-suggestion-apply.test.ts` (the two exact-match `.toEqual` assertions on the metadata shape: create audit + staged sub-key)

- [ ] **Step 1: Failing tests** — update the two `.toEqual` shape assertions (create-audit line ~148, staged sub-key line ~237) to include `postcode: 'HD1 2PY'`. Run to verify RED.
- [ ] **Step 2: Implement** — add `postcode: suggestion.postcode` to `locationSuggestionMetadata`'s returned object. Update the `BranchLocationSuggestion.postcode` doc comment: the edit lane now stages this postcode for the apply-lane pipeline (no longer "metadata only until Slice 1b").
- [ ] **Step 3: Run the file's suite; verify the two updated assertions pass and nothing else in the file regressed.**
- [ ] **Step 4: Commit** (`feat(location): carry the Google postcode in the staged suggestion metadata (Slice 1b enabling)`).

### Task 2: Draft-window DIRECT sensitive edit lane runs the pipeline

**Files:**
- Modify: `src/api/merchant/branch/service.ts` (`updateBranchSensitiveDirectCore`; its "metadata only until Slice 1b" comments)
- Test: `tests/api/merchant/branch/location-suggestion-apply.test.ts` (add a draft-window direct-core matrix; update the route test that PATCHes in the draft window)

- [ ] **Step 1: Failing tests** — service-level (mocked prisma), calling the draft-window path (via `updateBranch` with a REGISTERED merchant):
  - suggestion postcode matches entered postcode + pin within radius -> `branch.update` data has `locationConfidence: 'ADDRESS_GEOCODED'`, `googlePlaceId`, and the Google coords (overwriting the centroid);
  - suggestion postcode mismatch -> `NEEDS_REVIEW`, no `googlePlaceId`, centroid coords kept (L4);
  - no suggestion -> `POSTCODE_CENTROID` untouched.
  Also update the existing route test "PATCH draft-window sensitive address edit with candidateToken" (legacy stash, no postcode) so it now expects `NEEDS_REVIEW` + no `googlePlaceId`, mirroring the create-lane route test. Run to verify RED.
- [ ] **Step 2: Implement** — after the existing in-`safe` postcode re-resolve block, add the same pipeline shape as `createBranchCore`, guarded on a fresh `safe.locationConfidence === 'POSTCODE_CENTROID'` snapshot (a real postcode change). Reuse `crossCheckGoogleLocation`; the full `BranchLocationSuggestion` (with `.postcode`) is in scope directly (no JSON round-trip). PASS -> overwrite `safe.latitude/longitude`, set `safe.googlePlaceId`, `safe.locationConfidence = 'ADDRESS_GEOCODED'`; FAIL -> `safe.locationConfidence = 'NEEDS_REVIEW'`. Update the comments.
- [ ] **Step 3: Run the branch suites; verify pass.**
- [ ] **Step 4: Commit** (`feat(location): draft-window direct branch edit runs the location-trust pipeline (Slice 1b)`).

### Task 3: Reviewed-edit APPLY lane runs the pipeline (editApplier)

**Files:**
- Modify: `src/api/admin/approvals/editApplier.ts` (branch-kind apply block in `approveEdit`)
- Modify: `src/api/merchant/branch/service.ts` (`createBranchEditRequest` + `updateBranch` staging comments; the interface `LANE SPLIT` doc block), `src/api/merchant/location/service.ts` (the "REVIEWED-EDIT lane ... until Slice 1b" line)
- Test: `tests/api/merchant/branch/location-suggestion-apply.test.ts` (rewrite the `approveEdit` allow-list block into the Slice 1b apply matrix; refresh the file header)

- [ ] **Step 1: Failing tests** — rewrite the `approveEdit __locationSuggestion` describe block into a matrix (mocked prisma; the staged snapshot supplies the centroid). The load-bearing allow-list proof STAYS: `applied` never carries a raw `__locationSuggestion` / `source` / `placeId` key.
  - staged suggestion (postcode matches + within radius) -> `branch.update` data: `locationConfidence: 'ADDRESS_GEOCODED'`, `googlePlaceId` set, coords overwritten to the Google pin; NO `__locationSuggestion`/`source`/`placeId` column;
  - staged suggestion, postcode mismatch -> `NEEDS_REVIEW`, no `googlePlaceId`, centroid coords kept;
  - staged suggestion with null/absent postcode -> `NEEDS_REVIEW` (missing_postcode);
  - no staged suggestion -> `POSTCODE_CENTROID` verbatim (unchanged);
  - staged suggestion but no postcode-snapshot in proposedChanges (no postcode change) -> pipeline skipped; no confidence downgrade.
  Run to verify RED.
- [ ] **Step 2: Implement** — in the branch-kind block, after `applied` is assembled and before `branch.update`, read `proposed[LOCATION_SUGGESTION_KEY]` (re-declare the `'__locationSuggestion'` constant in the applier, matching the file's own-your-allow-list discipline; drift is fail-safe: a mismatch degrades to metadata-only). Gate on a fresh `applied.locationConfidence === 'POSTCODE_CENTROID'` snapshot with a string `applied.postcode` and finite `applied.latitude/longitude`. Capture the centroid coords into locals, run `crossCheckGoogleLocation`, then mutate `applied`: PASS -> Google coords + `googlePlaceId` + `ADDRESS_GEOCODED`; FAIL -> `NEEDS_REVIEW`. A malformed suggestion (non-finite coords / missing placeId) skips the pipeline. Update the staging comments + interface `LANE SPLIT` block + `location/service.ts` line to reflect that all three lanes (create + draft-direct + reviewed-apply) now run the pipeline.
- [ ] **Step 3: Run the applier suites (unit) + the suggestion-apply file; verify pass.**
- [ ] **Step 4: Commit** (`feat(location): reviewed-edit apply lane runs the location-trust pipeline (Slice 1b)`).

### Task 4: Full verification + as-shipped addendum + push

- [ ] `npx tsc --noEmit` (clean after `npx prisma generate`).
- [ ] `npm run test:unit` (full lane green; record exact counts).
- [ ] Confirm by grep that no stale "metadata only until Slice 1b" comment remains in `src/` or `tests/`.
- [ ] Append a short "As shipped" addendum to this plan (final SHAs + test counts).
- [ ] Push `feat/branch-location-trust-slice-1b`; do NOT create a PR and do NOT merge. (PROJECT-STATE / open-register status flips belong with the eventual merge, not this branch.)

---

## Self-review notes

- Pipeline reuse: `crossCheckGoogleLocation` is imported/called, never forked. Three call sites now: `createBranchCore` (Slice 1), `updateBranchSensitiveDirectCore` (1b Task 2), `editApplier.approveEdit` (1b Task 3). L2 single-authority preserved.
- L1: no route/DTO/wire change. Task 1 enriches a SERVER-side persisted metadata blob only; the client still sends `candidateToken`.
- L4: every outcome is a single in-memory mutation of the update payload followed by one `branch.update` inside the pre-existing transaction. No partial coord writes.
- The apply lane never re-resolves the postcode or re-calls Google: it cross-checks the request-time centroid snapshot against the request-time Google postcode, both already persisted.
