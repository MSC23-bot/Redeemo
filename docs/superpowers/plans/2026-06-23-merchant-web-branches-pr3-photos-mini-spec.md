# Branches PR-3 (Photos review lane) Mini-Spec

> Status: DRAFT (gates PR-3 implementation; awaiting owner + Codex review). NO PR-3 code until this is approved.
> Tier: 2 (no-schema) but cross-surface and touches a shipped sensitive applier + customer-facing visibility, so it is plan-first per the owner's stop-and-report decision.
> Parent: umbrella spec `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` §3 "PR-3" + decision D7; PR-1 plan `docs/superpowers/plans/2026-06-23-merchant-web-branches-pr1-surface-spine.md` §5.
> Stacks on: PR-2 branch (`feat/merchant-web-branches-pr2-bm-scoped-writes`) when implemented.

---

## 0. Why this mini-spec exists

PR-3 was classified "no-schema Tier-2" in the umbrella plan, but a read-only discovery pass found it trips stop-and-report triggers: it needs a NEW backend endpoint (instant photo-removal), it performs surgery on the shipped Option B B1 `editApplier` (closing `EDIT_PHOTO_APPLY_NOT_SUPPORTED`), it changes CUSTOMER-FACING photo visibility, and it had a data-loss ambiguity (remove-by-ID vs URL). The owner approved writing this focused mini-spec before any PR-3 code. Decisions are locked in §3.

---

## 1. Verified live-code facts (re-confirm before coding; do not re-derive wrong)

- **Applier throw site:** `src/api/admin/approvals/editApplier.ts` (~line 162) `if (edit.includesPhotos === true) throw new AppError('EDIT_PHOTO_APPLY_NOT_SUPPORTED')` blocks any `BranchPendingEdit` with `includesPhotos` BEFORE any mutation. B1 invariants in that file: single `prisma.$transaction`; `pickAllowed` allow-list (never blind-spread `proposedChanges`); ADMIN-actor audit with before/after; flips `BranchPendingEdit.status` + `AdminApproval.status` to APPROVED.
- **Photo edit-request lane:** `src/api/merchant/branch/service.ts` `createBranchPhotoEditRequest(prisma, adminId, branchId, { add?, remove? }, ctx)` creates a `BranchPendingEdit` with `proposedChanges = { add?, remove? }`, `includesPhotos: true`, `status: 'PENDING'`, plus an `AdminApproval` type `BRANCH_IDENTITY_EDIT`. It is OWNER-ONLY today (`resolveAdminMerchant`) and was intentionally left owner-only by PR-2 (not in PR-2's classified BM set). It does NOT currently validate the contents of `add`/`remove`.
- **`BranchPhoto` model (`prisma/schema.prisma`):** `id`, `branchId`, `url`, `sortOrder`, `createdAt`, `moderationStatus: PhotoModerationStatus` (enum `PENDING | APPROVED | FLAGGED`, default `PENDING`), `moderationCheckedAt?`, `moderationDetail?`. NO schema change is needed for PR-3.
- **Pending adds are NOT BranchPhoto rows today:** a merchant photo add lives only as a URL inside `BranchPendingEdit.proposedChanges.add` until approved. No `BranchPhoto` row exists for a pending add. So pending adds are customer-invisible by construction (no row), independent of `moderationStatus`.
- **No instant-removal route exists.** Removing a photo today is only possible by submitting an edit-request and waiting for approval. PR-3 must add a direct removal route.
- **Customer gate (`src/api/customer/discovery/service.ts` ~line 1976):** customer photo reads filter `where: { moderationStatus: 'APPROVED' }`. This is the SOLE gate between a non-approved photo and a customer (the "PR-0.6 gate").
- **Admin-web review panel** already surfaces `photoChanges` (`{ add: string[], remove: string[] }`) from `proposedChanges`; today its Approve throws. After PR-3 the apply succeeds; the panel reflects success.

---

## 2. Photo identity + the remove-by-ID decision (locked)

- **Add** carries NEW photo URLs (the merchant uploads via the existing `FileUpload` -> `/uploads/photo` -> URL, then submits the URL). `proposedChanges.add: string[]` = URLs of newly-uploaded images.
- **Remove** carries existing `BranchPhoto.id` values (NOT URLs). `proposedChanges.remove: string[]` = `BranchPhoto` row IDs. The merchant-web gallery renders existing photos from `branch.photos[]` which carry `{ id, url }`, so the client always has the ID. **Remove-by-URL is forbidden** (a duplicate URL on the same branch could cause a wildcard/over-delete = data loss).
- `createBranchPhotoEditRequest` MUST be updated to: (a) treat `remove` as `BranchPhoto` IDs; (b) validate every `remove` ID belongs to THIS branch (reject otherwise); (c) optionally validate `add` URLs are non-empty strings. This is a `proposedChanges`-content convention change, NOT a schema change.
- The same remove-by-ID + branch-scoping rule applies to the instant-removal endpoint (§4).

---

## 3. Locked decisions (owner + Codex)

- **D-PR3-1 (remove matching):** remove-by-ID, never remove-by-URL (§2).
- **D-PR3-2 (instant-removal):** a NEW merchant route does an instant, un-reviewed delete of an ALREADY-APPROVED photo (§4). A pending (in-review) add is cancelled via the existing edit-request WITHDRAW, not this route.
- **D-PR3-3 (apply on approve):** admin approve creates added photos as `moderationStatus: 'APPROVED'` rows and deletes removed rows, inside the existing B1 transaction, preserving all B1 invariants (§5). Admin approval IS the moderation: the merchant-add-via-review flow does NOT create `PENDING` rows (pending adds stay URLs in the pending edit until approval).
- **D-PR3-4 (auth, v1):** photo actions (add-via-review + instant-remove) are OWNER-ONLY in v1, consistent with the photo edit-request lane already being owner-only. BM-scoped photo actions are DEFERRED and tied to the future FE BM-rendering capability signal (umbrella decision: additive `viewerCapabilities` on `GET /branches/:id`). Recorded as a follow-up; not in PR-3.
- **D-PR3-5 (customer gate unchanged):** `moderationStatus: 'APPROVED'` stays the sole customer gate; no customer-code change beyond what already filters APPROVED.
- **D-PR3-6 (no schema):** confirmed no schema/migration. If implementation finds a field is needed, STOP AND REPORT.

---

## 4. New endpoint: instant photo-removal

- **Route:** `DELETE /api/v1/merchant/branches/:id/photos/:photoId` (merchant-authed).
- **Auth:** OWNER-ONLY in v1 (`resolveAdminMerchant`), matching the photo edit-request lane. (When BM photo management is scoped later, migrate to `resolveMerchantContext` + `assertBranchAllowed` like PR-2 did for the other write routes.)
- **Service:** `removeBranchPhoto(prisma, adminId, branchId, photoId, ctx)`:
  - Resolve the merchant (owner) + branch ownership.
  - Find the `BranchPhoto` by `id` AND `branchId` (scope to the branch). If not found / not on this branch -> 404 `BRANCH_PHOTO_NOT_FOUND` (a NEW error code; additive, no schema).
  - GUARD: only delete a photo with `moderationStatus: 'APPROVED'` (instant-removal is for live photos). A non-APPROVED row -> 409 `PHOTO_NOT_REMOVABLE` (or route the merchant to withdraw the pending edit). Pending adds are not rows, so this only guards FLAGGED/edge rows.
  - Delete the row atomically; write an ADMIN-actor audit (before snapshot).
  - Customer effect: the row is gone -> immediately drops out of the `moderationStatus:'APPROVED'` read set -> invisible. Instant, no review.
- **Idempotency:** a second delete of the same id -> 404 (already gone); acceptable.

---

## 5. Applier change: close `EDIT_PHOTO_APPLY_NOT_SUPPORTED` safely

In `editApplier.approveEdit` (branch path), INSIDE the existing `prisma.$transaction`, replace the `includesPhotos` throw with apply logic that preserves every B1 invariant:

1. Parse `proposedChanges` defensively: `add` = array of non-empty URL strings (else skip); `remove` = array of `BranchPhoto` IDs (else skip). Use an explicit allow-list shape (do NOT blind-spread `proposedChanges` into any create/update).
2. **Add:** for each `add` URL, create a `BranchPhoto { branchId, url, moderationStatus: 'APPROVED', sortOrder: <append> }`. (APPROVED because admin approval is the moderation gate; do not write PENDING.)
3. **Remove:** delete `BranchPhoto` rows where `id IN remove AND branchId = <this branch>` (branch-scoped; an ID not on this branch is ignored/skipped, never a cross-branch delete).
4. Flip `BranchPendingEdit.status = APPROVED` + `AdminApproval.status = APPROVED` (existing B1 step).
5. Audit: ADMIN-actor before/after capturing the photo delta (added URLs + removed IDs). Same `writeAuditLogTx` pattern as the identity-edit path.
6. **Reject path unchanged:** rejecting the edit writes NO photo rows; existing APPROVED photos are untouched (immutability preserved). Withdraw path unchanged.
7. A branch edit that includes BOTH identity fields AND photos: apply the SENSITIVE identity fields via the existing `pickAllowed` path AND the photo delta, all in the one transaction. (Confirm the edit-request lane can carry both, or keep photo edits as their own `includesPhotos` edit — match how `createBranchPhotoEditRequest` vs `createBranchEditRequest` actually segregate; if they are always separate edits, apply each kind in its own approve. STOP AND REPORT if the two kinds can be mixed in one pending edit in a way the allow-list cannot cleanly handle.)

---

## 6. Surfaces touched

- **backend:** `src/api/admin/approvals/editApplier.ts` (apply photos), `src/api/merchant/branch/{routes.ts,service.ts}` (new DELETE photo route + `removeBranchPhoto` + remove-by-ID validation in `createBranchPhotoEditRequest`), `src/api/shared/errors.ts` (new `BRANCH_PHOTO_NOT_FOUND` / `PHOTO_NOT_REMOVABLE` codes; additive).
- **admin-web:** the edit-review panel Approve now succeeds for photo edits; reflect success (toast/refresh). No new screen.
- **merchant-web:** `components/branches/sections/BrandingPhotosCard.tsx` (+ client `lib/api/branch.ts`): wire the PR-1 disabled "Add photo"/"Add a new banner" affordances to the real flow (`requestBranchPhotoEdit` for add -> pending/in-review status) and an instant Remove on approved photos (new client fn -> the DELETE route). Owner-only in v1. Show pending-in-review status.
- **customer:** none beyond the existing `moderationStatus:'APPROVED'` filter (D-PR3-5).

---

## 7. Security invariants (PR-3)

1. B1 applier discipline preserved: single transaction; explicit allow-list (never blind-spread `proposedChanges`); ADMIN-actor before/after audit; status flips.
2. Remove is branch-scoped by ID: a delete can NEVER touch a `BranchPhoto` of another branch (no URL matching, no cross-branch IDs).
3. Instant-removal is APPROVED-only; pending/in-review adds are cancelled via withdraw, not deleted.
4. Customer visibility gate (`moderationStatus:'APPROVED'`) is the sole gate and is preserved: approve -> APPROVED (visible); instant-remove -> deleted (invisible); reject -> unchanged; pending add -> no row (invisible).
5. Photo actions owner-only in v1 (D-PR3-4).
6. No raw R2 keys / no secret leakage in any new payload; reuse the existing storage/url handling.

---

## 8. Tests

- **Applier (vitest):** approve a photos-only edit -> added URLs become `APPROVED` `BranchPhoto` rows + removed IDs deleted (branch-scoped) + statuses APPROVED + ADMIN audit before/after; reject -> no rows written, existing APPROVED untouched; an add does NOT create a PENDING row; a `remove` ID not on the branch is NOT deleted (no cross-branch delete); allow-list: a poisoned `proposedChanges` key is never written.
- **Instant-removal endpoint (vitest):** owner removes an APPROVED photo -> row deleted + (read-path) no longer in the APPROVED set; remove a non-existent / cross-branch id -> 404, nothing deleted; remove a non-APPROVED row -> 409 `PHOTO_NOT_REMOVABLE`; (when BM auth is added later) BM scoping — out of v1.
- **`createBranchPhotoEditRequest` (vitest):** `remove` validated as branch-owned `BranchPhoto` IDs (reject foreign/unknown IDs); `add` URLs stored.
- **Customer read (vitest):** a pending add (URL-in-edit, no row) is invisible; an approved photo is visible; a removed photo is gone.
- **merchant-web (jest):** Add opens the upload + submits the edit-request -> pending-in-review status shown; Remove on an approved photo calls the DELETE route + optimistically drops it; owner-only (no controls for non-owner).
- **admin-web (jest):** Approve a photo edit succeeds (no throw) + UI reflects.

---

## 9. Rollback + stop-and-report triggers

- STOP AND REPORT if: a schema field turns out to be needed (D-PR3-6); the applier cannot cleanly segregate identity-vs-photo deltas in a mixed edit (§5.7); remove-by-ID cannot be branch-scoped safely; the customer `moderationStatus` gate would be weakened; the photo-action auth needs to be BM-scoped in v1 (it should not — owner-only per D-PR3-4); or R2/storage handling forces a contract change.
- Rollback: the applier change is additive within the existing transaction (revert restores the throw); the new DELETE route + error codes are additive (revert removes them); the merchant-web wiring reverts to the PR-1 disabled affordances. No data migration.

---

## 10. Out of scope / deferred

- Automated image moderation/scanning (stays admin-review; the moderation worker is unwired and out of scope).
- BM-scoped photo actions (owner-only in v1; revisit with the FE `viewerCapabilities` signal).
- Photo reordering / `sortOrder` UX beyond append-on-add (unless the prototype requires it; confirm at implementation).
- Logo/banner editing is already handled via the PR-1/F7 reviewed branch-details edit modal; PR-3 is the photo GALLERY only.

---

## 11. PR shape

PR-3 as ONE stacked PR on the PR-2 branch (backend applier + new endpoint + remove-by-ID validation + admin-web apply + merchant-web wiring), since the pieces are cohesive and the customer-visibility contract should land atomically. Fresh implementer + fresh adversarial (security) reviewer; open when green; SHA-bound merge gate; do not merge. If the backend and FE prove easier to review separately, split into PR-3a (backend: applier + endpoint + validation + tests) and PR-3b (admin-web + merchant-web wiring) — both stacked, both reviewed, neither merged.

---

## 12. Self-review

This mini-spec covers the five owner-required sections: the instant photo-removal endpoint (§4), admin apply closing `EDIT_PHOTO_APPLY_NOT_SUPPORTED` safely (§5), remove-by-ID not URL (§2 + D-PR3-1), customer-facing photo visibility / `moderationStatus` behavior (§5 + §7 + D-PR3-5), and tests + rollback/stop-and-report triggers (§8 + §9). It is grounded in the verified live-code facts (§1), locks the data-loss ambiguity (remove-by-ID, branch-scoped), preserves the Option B B1 applier invariants and the customer moderation gate, keeps photo actions owner-only in v1, and confirms no schema change. Ready for owner + Codex review. No PR-3 implementation until approved.
