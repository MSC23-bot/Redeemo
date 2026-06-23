# Branches PR-3 (Photos review lane) Mini-Spec

> Status: DRAFT (gates PR-3 implementation; awaiting owner + Codex review). NO PR-3 code until this is approved.
> Tier: 2 (no-schema) but cross-surface; it touches a shipped sensitive applier (Option B B1) + customer-facing visibility, so it is plan-first per the owner's stop-and-report decision.
> Date: 2026-06-23 (rev 2: live-code re-verified + cross-check table + expanded UI/admin sections).
> Parent: umbrella spec `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` §3 "PR-3" + decision D7; PR-1 plan `docs/superpowers/plans/2026-06-23-merchant-web-branches-pr1-surface-spine.md` §5.
> Builds on: PR-1 (#309) merchant-web Branches surface + PR-2 (#310) backend BM-scope. Stacks on the PR-2 branch when implemented.

---

## 0. Why this mini-spec exists

PR-3 was classified "no-schema Tier-2" in the umbrella plan, but discovery found it trips stop-and-report triggers: a NEW backend endpoint (instant photo-removal), surgery on the shipped Option B B1 `editApplier` (closing `EDIT_PHOTO_APPLY_NOT_SUPPORTED`), a CUSTOMER-FACING photo-visibility change, and a remove-matching data-loss ambiguity. The owner approved writing this focused mini-spec before any PR-3 code. Decisions are locked in §4.

---

## 1. Live-code facts (verified this pass; re-confirm before coding)

- **Applier throw + branch path** (`src/api/admin/approvals/editApplier.ts`): `approveEdit` runs one `prisma.$transaction`; the `kind === 'branch'` path (after `editKindOf`) at **line 163** does `if (edit.includesPhotos === true) throw new AppError('EDIT_PHOTO_APPLY_NOT_SUPPORTED')` BEFORE any mutation. The non-photo branch apply uses `pickAllowed(proposed, BRANCH_SENSITIVE_FIELDS)` + `pickAllowed(proposed, BRANCH_LOCATION_SNAPSHOT_FIELDS)` (lines 170-171), flips `BranchPendingEdit.status='APPROVED'` (184) + `AdminApproval.status='APPROVED'` (188), and `writeAuditLogTx` (190). The REJECT path (line 288) is already photo-safe ("no mutation"). `getEditReviewContext` (line 434) builds `photoChanges` from `proposedChanges` for the admin panel.
- **Photo edit-request lane** (`src/api/merchant/branch/service.ts` `createBranchPhotoEditRequest`): signature `(prisma, adminId, branchId, photoChanges: { add?: string[]; remove?: string[] }, ctx)`. Auth = `resolveAdminMerchant` (OWNER-ONLY; PR-2 intentionally left it owner-only). It stores `proposedChanges: photoChanges` VERBATIM (no content validation), `includesPhotos: true`, `status: 'PENDING'`, plus an `AdminApproval` type `BRANCH_IDENTITY_EDIT`. Guarded by `PENDING_EDIT_EXISTS` (at most one PENDING edit per branch).
- **`BranchPhoto`** (`prisma/schema.prisma`): `id`, `branchId`, `url`, `sortOrder Int @default(0)`, `createdAt`, `moderationStatus PhotoModerationStatus @default(PENDING)`, `moderationCheckedAt?`, `moderationDetail?`. Branch relation `onDelete: Cascade`. Indexes `[branchId]` + `[branchId, moderationStatus]`. NO schema change needed for PR-3.
- **`PhotoModerationStatus`** enum: `PENDING` (not public) | `APPROVED` (the ONLY public state) | `FLAGGED` (not public).
- **Pending photo ADDS are NOT `BranchPhoto` rows.** `createBranchPhotoEditRequest` stores add URLs in `BranchPendingEdit.proposedChanges.add`; it creates NO `BranchPhoto` row. A row appears only when the edit is APPROVED (today: never, because of the throw). So a pending add is customer-invisible by construction (no row).
- **Customer gate** (`src/api/customer/discovery/service.ts` line 1976): customer photo reads filter `where: { moderationStatus: 'APPROVED' }`. SOLE gate between a non-approved photo and a customer (PR-0.6 gate).
- **No instant-removal route exists.** PR-3 adds one.
- **Admin-web review** (`apps/admin-web/features/review/EditReviewDiff.tsx` + `apps/admin-web/lib/api/editReview.ts`): already surfaces `photoChanges` (`{ add: string[], remove: string[] }`); today Approve throws `EDIT_PHOTO_APPLY_NOT_SUPPORTED`. After PR-3 Approve succeeds; the panel reflects success. No new admin screen.
- **Merchant-web (PR-1, on #309):**
  - `lib/api/branch.ts` client `branchPendingEditSchema.proposedChanges` already types `add: z.array(z.string()).optional()` + `remove: z.array(z.string()).optional()`. The photo `branchPhotoSchema` is `z.object({ id, url }).passthrough()` and does NOT type `moderationStatus` (it rides via passthrough). `requestBranchPhotoEdit(branchId, addUrls)` is ADD-ONLY today (POSTs `{ add }`).
  - `components/branches/sections/BrandingPhotosCard.tsx` renders `branch.photos` and labels EVERY row "Approved" (blanket), plus a numeric "X in review" counter from `pendingEdits.filter(includesPhotos).length`. "Add photo" / "Add a new banner" are disabled `LockedAffordance`s; it NEVER calls `requestBranchPhotoEdit`. Copy: "New images are checked before they show to customers. Approved images stay live while a new one is in review."

---

## 2. Prototype expectation vs live reality cross-check (REQUIRED)

Prototype screenshots: `docs/superpowers/prototype-references/merchant-web-branches/05-branding-photos-staff-start.png`, `06-staff-and-close-section.png`, `09-second-branch-photos-staff-close.png`.

| Prototype expectation (05/06/09) | Live reality (verified) | PR-3 decision | Implementation implication |
|---|---|---|---|
| Photos card with a grid of photos, each Approved photo showing a remove (X) | merchant `getBranch` returns `branch.photos[]` (all rows, any moderationStatus); no remove route exists | Each APPROVED photo gets an instant remove (X) | NEW `DELETE /branches/:id/photos/:photoId` (instant, APPROVED-only) + a per-photo Remove control on approved photos |
| "Removing a photo takes it down straight away" (instant, not reviewed) | only the reviewed edit-request lane exists for photos | Removal of an APPROVED photo is INSTANT via the DELETE route; NOT the review lane | merchant Remove -> DELETE route -> row deleted -> immediately out of the customer APPROVED set |
| Per-photo state: some "Approved", one "In review" + an "X in review" counter | PR-1 card blanket-labels ALL photos "Approved"; in-review counter is just `pendingEdits.includesPhotos` count; pending-add thumbnails not shown | Render REAL per-photo state: APPROVED rows = "Approved"; pending-add URLs (from the open pending edit's `proposedChanges.add`) = "In review" thumbnails (no remove) | merchant card renders approved rows (from `branch.photos` where moderationStatus APPROVED) + in-review thumbnails (from `branch.pendingEdits[0].proposedChanges.add` URLs); add `moderationStatus` to `branchPhotoSchema` |
| "Add photo" tile (new image goes to review) | `requestBranchPhotoEdit` (add-only) exists but is unused/disabled in PR-1 | Add = REVIEWED via the existing edit-request lane | wire the PR-1 disabled "Add photo" affordance to `requestBranchPhotoEdit({add:[uploadedUrl]})` -> pending/in-review |
| Admin approves a photo change -> it goes live to customers | `editApplier` THROWS `EDIT_PHOTO_APPLY_NOT_SUPPORTED` for `includesPhotos` (apply blocked) | Admin approve APPLIES: create added URLs as APPROVED `BranchPhoto` rows; delete removed rows | replace the throw with apply logic inside the B1 transaction (§5) |
| Approved images stay live while a new one is in review | pending adds are URLs in the edit (no row); approved rows are separate | preserved: approving an add does not disturb existing approved rows; reject leaves them untouched | applier add = create new rows only; never mutate existing approved rows |
| (No prototype element implies BMs manage photos) | photo edit-request lane is owner-only (`resolveAdminMerchant`) | photo actions (add + instant-remove) OWNER-ONLY in v1 | keep owner-only; BM-scoped photos deferred to the future FE `viewerCapabilities` signal |
| "X new photo in review" counter (07/09) | PR-1 counter = count of pending photo edits | keep a counter, but drive the in-review THUMBNAILS from the pending edit's add URLs | counter = `proposedChanges.add.length` of the open pending edit |

No prototype photo element is unmapped. The one place live PR-1 diverges from the prototype (blanket-"Approved" + no in-review thumbnails + no remove) is exactly what PR-3 closes.

---

## 3. Photo identity + remove-by-ID (locked, data-loss-safe)

- **Add** = NEW photo URLs (merchant uploads via the existing `FileUpload` -> `/uploads/photo` -> URL). `proposedChanges.add: string[]` = URLs of newly-uploaded images. Approved -> become `BranchPhoto` rows.
- **Remove** (instant, of an APPROVED photo) = the existing `BranchPhoto.id` (from `branch.photos[].id`). The instant-removal route takes `:photoId`. **Remove-by-URL is forbidden** (a duplicate URL on a branch could wildcard-delete = data loss).
- The reviewed edit-request `proposedChanges.remove` field (if ever populated) is also `BranchPhoto` IDs, branch-scoped. The PR-3 merchant UI does NOT use reviewed-remove (removal is instant per D7); the applier still handles `remove` IDs defensively (§5) so a bundled edit is safe. `createBranchPhotoEditRequest` should validate any `remove` IDs belong to the branch.

---

## 4. Locked decisions

- **D-PR3-1:** remove-by-ID, never remove-by-URL (§3).
- **D-PR3-2:** removal of an APPROVED photo is INSTANT via a NEW route (§6); a pending (in-review) add is cancelled via the existing edit-request WITHDRAW (not a per-photo control).
- **D-PR3-3:** admin approve creates added URLs as `moderationStatus:'APPROVED'` `BranchPhoto` rows and deletes removed rows, inside the existing B1 transaction, preserving all B1 invariants (§5). Admin approval IS the moderation: the merchant-add-via-review flow does NOT create `PENDING` rows.
- **D-PR3-4 (auth, v1):** photo actions (add-via-review + instant-remove) are OWNER-ONLY, consistent with the photo edit-request lane. BM-scoped photo actions are DEFERRED, tied to the future FE BM-rendering signal (additive `viewerCapabilities` on `GET /branches/:id`).
- **D-PR3-5:** `moderationStatus:'APPROVED'` stays the sole customer gate; no customer-code change.
- **D-PR3-6:** NO schema/migration. If implementation finds a field is needed, STOP AND REPORT.
- **D-PR3-7:** the merchant card renders REAL per-photo state (approved rows + in-review pending-add URLs), replacing PR-1's blanket-"Approved"; add `moderationStatus` to the client `branchPhotoSchema`.

---

## 5. Applier change: close `EDIT_PHOTO_APPLY_NOT_SUPPORTED` safely

In `editApplier.approveEdit`, `kind === 'branch'` path, INSIDE the existing `prisma.$transaction`, replace the line-163 throw with apply logic preserving every B1 invariant:

1. Parse `proposedChanges` defensively (explicit allow-list, never blind-spread): `add` = array of non-empty URL strings; `remove` = array of `BranchPhoto` ID strings.
2. **Add:** for each `add` URL create `BranchPhoto { branchId, url, moderationStatus: 'APPROVED', sortOrder: <append after current max> }`. APPROVED because admin approval is the moderation gate; never write PENDING here.
3. **Remove:** `deleteMany` `BranchPhoto where { id: { in: removeIds }, branchId }` (branch-scoped; an ID not on this branch is silently skipped, NEVER a cross-branch delete).
4. Flip `BranchPendingEdit.status='APPROVED'` + `AdminApproval.status='APPROVED'` (existing B1 step, unchanged).
5. Audit: `writeAuditLogTx` ADMIN-actor before/after capturing the photo delta (added URLs + removed IDs), same pattern as the identity path.
6. A pending edit that carries BOTH identity SENSITIVE fields AND photos: apply the identity `pickAllowed` fields AND the photo delta in the one transaction. NOTE (verified): `createBranchEditRequest` (identity) and `createBranchPhotoEditRequest` (photos) create SEPARATE edits, so in practice an edit is either identity-only or photos-only; still, implement the photo apply alongside (not instead of) the identity apply so a future mixed edit is safe. STOP AND REPORT if a mixed edit cannot be cleanly handled by the allow-list.
7. REJECT path: unchanged (no mutation); existing APPROVED rows untouched (immutability preserved). WITHDRAW path: unchanged.

---

## 6. New endpoint: instant photo-removal

- **Route:** `DELETE /api/v1/merchant/branches/:id/photos/:photoId` (merchant-authed).
- **Auth:** OWNER-ONLY in v1 (`resolveAdminMerchant`), matching the photo edit-request lane (D-PR3-4). (When BM photo management is scoped later, migrate to `resolveMerchantContext` + `assertBranchAllowed` as PR-2 did.)
- **Service** `removeBranchPhoto(prisma, adminId, branchId, photoId, ctx)`:
  - Resolve owner merchant + branch ownership (`resolveBranch`).
  - Find `BranchPhoto` by `id` AND `branchId`. Not found / not on branch -> 404 `BRANCH_PHOTO_NOT_FOUND` (NEW additive error code).
  - GUARD: only delete a photo with `moderationStatus: 'APPROVED'` (instant-removal is for live photos). A non-APPROVED row -> 409 `PHOTO_NOT_REMOVABLE`. (Pending adds are not rows, so they never reach here; FLAGGED/edge rows are guarded out.)
  - Delete the row atomically; `writeAuditLog` ADMIN-actor with the before snapshot.
  - Customer effect: row gone -> immediately out of the APPROVED read set -> invisible. Instant, no review.
- **Idempotency:** a repeat delete -> 404 (already gone); acceptable.

---

## 7. Merchant UI behavior (merchant-web)

`components/branches/sections/BrandingPhotosCard.tsx` (+ `lib/api/branch.ts`):
- **Approved photos:** render from `branch.photos` where `moderationStatus === 'APPROVED'`, each with an "Approved" marker AND a per-photo Remove (X) control (owner-only). Add `moderationStatus` to the client `branchPhotoSchema` (replace the PR-1 blanket-"Approved").
- **Pending (in-review) photos:** render thumbnails from the open pending edit's `branch.pendingEdits[0].proposedChanges.add` URLs (only if `includesPhotos`), each labelled "In review" with NO remove control. Show an "X in review" counter = `proposedChanges.add.length`.
- **Remove action:** clicking a Remove (X) on an APPROVED photo calls a new client fn `removeBranchPhoto(branchId, photoId)` -> the DELETE route; optimistic removal + invalidate `['branch', id]`; toast. Owner-only.
- **Add action:** the PR-1 disabled "Add photo" affordance becomes live: upload via the existing `FileUpload` -> `requestBranchPhotoEdit(branchId, [uploadedUrl])` -> creates the PENDING edit -> the new photo shows as "In review" and the counter increments. `PENDING_EDIT_EXISTS` (409) -> "a change is already in review" (cannot stack a second). Owner-only.
- **Cancel a pending add:** via the existing PendingEditsList WITHDRAW (no per-photo remove on an in-review thumbnail).
- **Banner/logo:** unchanged from PR-1 (edited via the F7 reviewed branch-details modal); the "Add a new banner" affordance lights up via the same `requestBranchPhotoEdit`/banner path only if in prototype scope (banner is a `bannerUrl` SENSITIVE field, edited via F7; keep banner OUT of the photo-gallery lane unless the prototype requires the gallery to manage it; confirm at implementation, default = banner stays F7).
- **Review-status messaging:** keep the PR-1 copy ("New images are checked before they show to customers. Approved images stay live while a new one is in review.").
- **Non-owner:** the whole photo-management surface stays read-only (no Add, no Remove), consistent with D-PR3-4 + PR-1 owner-gating.

---

## 8. Admin review behavior (admin-web)

- `features/review/EditReviewDiff.tsx` already renders `photoChanges` (`add` URLs as image previews, `remove` as the items to drop). No new screen.
- The actioner Approve currently surfaces the `EDIT_PHOTO_APPLY_NOT_SUPPORTED` error; after PR-3 the apply succeeds. The admin-web change is to reflect SUCCESS (toast + refetch the review context so the applied photos show) and remove any "photo apply not supported" messaging. Reject is unchanged (already photo-safe).
- The diff should show added thumbnails (from `add` URLs) and removed thumbnails (resolved from `remove` IDs -> the branch's current photo URLs, for a human-readable diff). Confirm `editReview.ts`/`getEditReviewContext` can resolve `remove` IDs to URLs for display; if not, show the IDs (acceptable) and note it.

---

## 9. Customer-facing photo visibility (unchanged contract)

`moderationStatus:'APPROVED'` (customer discovery service line 1976) stays the SOLE gate:
- Admin approve -> added rows are APPROVED -> visible.
- Instant-remove -> row deleted -> invisible.
- Reject -> no rows written; existing APPROVED unchanged.
- Pending add -> URL only, no row -> invisible.
No customer-code change. (A latent note: any pre-existing PENDING/FLAGGED `BranchPhoto` row from another path is already customer-invisible via this filter; the merchant card per-photo rendering (§7) should reflect such states accurately rather than blanket-"Approved".)

---

## 10. Security invariants (PR-3)

1. B1 applier discipline preserved: single transaction; explicit allow-list (never blind-spread `proposedChanges`); ADMIN-actor before/after audit; status flips unchanged.
2. Remove is branch-scoped by ID: a delete can NEVER touch another branch's `BranchPhoto` (no URL matching, no cross-branch IDs).
3. Instant-removal is APPROVED-only; pending/in-review adds are cancelled via withdraw, not deleted.
4. Customer gate (`moderationStatus:'APPROVED'`) preserved and sole.
5. Photo actions owner-only in v1 (D-PR3-4).
6. No raw R2/storage keys in any new payload; reuse existing url handling. The merchant card renders only urls already on the branch payload.

---

## 11. Tests

- **Applier (vitest):** approve a photos-only edit -> add URLs become APPROVED rows (correct sortOrder append) + remove IDs deleted (branch-scoped) + statuses APPROVED + ADMIN before/after audit; reject -> no rows written, existing APPROVED untouched; add does NOT create a PENDING row; a `remove` ID not on the branch is NOT deleted (no cross-branch delete); a poisoned `proposedChanges` key is never written (allow-list).
- **Instant-removal endpoint (vitest):** owner removes an APPROVED photo -> row deleted + (customer read) no longer APPROVED-visible; remove non-existent / cross-branch id -> 404 `BRANCH_PHOTO_NOT_FOUND`, nothing deleted; remove a non-APPROVED row -> 409 `PHOTO_NOT_REMOVABLE`; owner-only (non-owner denied).
- **`createBranchPhotoEditRequest` (vitest):** `remove` validated as branch-owned IDs (reject foreign/unknown); `add` URLs stored; PENDING_EDIT_EXISTS still guards.
- **Customer read (vitest):** pending add (URL-in-edit, no row) invisible; approved visible; removed gone.
- **merchant-web (jest):** approved photos render with per-photo Remove (owner); Remove calls the DELETE route + optimistic drop; in-review thumbnails render from pending-edit add URLs (no remove); Add opens upload + submits the edit-request -> in-review status + counter increments; PENDING_EDIT_EXISTS surfaced; non-owner = read-only (no Add/Remove); `branchPhotoSchema` parses `moderationStatus`.
- **admin-web (jest):** Approve a photo edit succeeds (no throw) + UI reflects applied photos; reject unchanged.

---

## 12. Rollback + stop-and-report triggers

- STOP AND REPORT if: a schema field turns out needed (D-PR3-6); the applier cannot cleanly segregate identity-vs-photo deltas in a mixed edit (§5.6); remove-by-ID cannot be branch-scoped safely; the customer `moderationStatus` gate would be weakened; the photo-action auth needs to be BM-scoped in v1 (it should not, per D-PR3-4); the banner-in-gallery question needs an owner call (§7); or R2/storage handling forces a contract change.
- Rollback: the applier change is additive within the existing transaction (revert restores the throw); the new DELETE route + error codes are additive (revert removes them); the merchant-web wiring reverts to the PR-1 disabled affordances + blanket render. No data migration.

---

## 13. Scope boundaries + deferrals

IN PR-3: instant photo-removal endpoint + service; applier photo-apply (close the throw); remove-by-ID validation in `createBranchPhotoEditRequest`; merchant-web photo gallery (approved + in-review render, Remove, Add wiring, per-photo moderationStatus); admin-web apply-success reflection; the customer gate stays as-is; tests; new error codes `BRANCH_PHOTO_NOT_FOUND` / `PHOTO_NOT_REMOVABLE`.

OUT / DEFERRED:
- Automated image moderation/scanning (the moderation worker stays unwired; admin approval is the moderation).
- BM-scoped photo actions (owner-only v1; tied to the future FE `viewerCapabilities` signal).
- Banner management via the photo-gallery lane (banner stays the F7 reviewed branch-details modal unless the prototype proves otherwise).
- Photo reordering UX (append-on-add only; `sortOrder` drag-reorder is not in PR-3 unless the prototype requires it).
- Any schema change (none in PR-3).

---

## 14. PR shape

PR-3 as ONE stacked PR on the PR-2 branch (backend applier + new endpoint + remove-by-ID validation + admin-web apply reflection + merchant-web gallery), since the customer-visibility contract should land atomically. Fresh implementer + fresh adversarial (security) reviewer; open when green; SHA-bound merge gate; do not merge. If backend + FE are easier to review separately, split into PR-3a (backend: applier + endpoint + validation + tests) and PR-3b (admin-web + merchant-web), both stacked, both reviewed, neither merged.

---

## 15. Self-review

Covers the owner-required sections: instant photo-removal endpoint (§6); admin apply closing `EDIT_PHOTO_APPLY_NOT_SUPPORTED` safely (§5); remove-by-ID not URL (§3 + D-PR3-1); customer photo visibility / `moderationStatus` (§9 + D-PR3-5); merchant UI for approved/pending/remove/review-status (§7); admin review behavior (§8); tests + rollback + stop-and-report (§11, §12); explicit scope + deferrals (§13). Includes the required prototype-vs-live cross-check table (§2). Live code re-verified this pass; corrections folded in (PR-1 blanket-"Approved" -> real per-photo state; in-review thumbnails from pending-edit add URLs; `branchPhotoSchema` lacks `moderationStatus`; photo lane owner-only; reject already photo-safe; BranchPhoto cascade-delete). No schema change. Ready for owner + Codex review. No PR-3 implementation until approved.
