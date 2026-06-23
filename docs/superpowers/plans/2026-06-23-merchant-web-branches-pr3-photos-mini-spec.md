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
- **Photo edit-request lane** (`src/api/merchant/branch/service.ts` `createBranchPhotoEditRequest`): signature `(prisma, adminId, branchId, photoChanges: { add?: string[]; remove?: string[] }, ctx)`. Auth = `resolveAdminMerchant` (OWNER-ONLY today; PR-2 left it owner-only, NOT in PR-2's classified BM set). It stores `proposedChanges: photoChanges` VERBATIM (no content validation), `includesPhotos: true`, `status: 'PENDING'`, plus an `AdminApproval` type `BRANCH_IDENTITY_EDIT`. Guarded by `PENDING_EDIT_EXISTS` (at most one PENDING edit per branch). PR-3 migrates this to `resolveMerchantContext` + `assertBranchAllowed` per D3 (§4 D-PR3-4).
- **Photo asset upload** (`src/api/merchant/upload/routes.ts`, `POST /api/v1/merchant/uploads/:kind`): for `kind === 'photo'` the route calls `assertCanManageVouchers(ctx)` (OWNER || `canManageVouchers`); `logo`/`banner` require `assertOwner`. This `kind:'photo'` path is the VOUCHER photo upload; its `canManageVouchers` gate is correct for vouchers and must NOT become the key for branch-photo management (a normal assigned-branch BRANCH_MANAGER without `canManageVouchers` would be wrongly blocked). PR-3 therefore adds a BRANCH-SCOPED branch-photo upload (§6c) gated by branch assignment, not voucher delegation; the existing voucher `kind:'photo'` path is left UNCHANGED (no widening).
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
| Photo management role-scope (controlling source = the LOCKED role/security decision D3, NOT screenshot-only inference) | photo edit-request lane owner-only today (`resolveAdminMerchant`); the only photo upload is the VOUCHER `kind:'photo'` route gated `assertCanManageVouchers`; PR-2 left photos owner-only | ROLE-SCOPED per D3: add-via-review = OWNER (any branch) OR BRANCH_MANAGER (ASSIGNED branch), completable WITHOUT `canManageVouchers` via a NEW branch-scoped upload + the BM-scoped edit-request (both `assertBranchAllowed`); instant-removal = OWNER-ONLY in v1 (EXPLICIT exception: instant + unreviewed + destructive + customer-visible) | add a branch-scoped photo upload (§6c) + migrate `createBranchPhotoEditRequest` to `resolveMerchantContext`+`assertBranchAllowed`; instant-removal route owner-only; voucher `kind:'photo'` upload UNTOUCHED; merchant FE renders photo controls owner-only until the deferred `viewerCapabilities` signal |
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
- **D-PR3-4 (auth, v1) [REVISED per Codex + umbrella D3]:** photo actions are SPLIT by type and BACKEND-enforced (not UI-only):
  - **Add-via-review (reviewed):** OWNER for any branch; BRANCH_MANAGER for ASSIGNED branches, fully completable WITHOUT `canManageVouchers`. Two backend pieces, BOTH branch-scoped via `resolveMerchantContext` + `assertBranchAllowed(branchId)`: (i) the edit-request submission, migrating `createBranchPhotoEditRequest` from `resolveAdminMerchant` to the scoped resolver; AND (ii) a NEW BRANCH-SCOPED photo-asset upload (§6c) so the upload step is gated by branch assignment, NOT by `assertCanManageVouchers`. This aligns with D3 ("a BM may submit review-required branch-detail changes, including photos, for assigned branches, server-enforced") and the PR-2 pattern: a normal assigned-branch BM can complete the whole add-photo flow. `canManageVouchers` is NOT the key for branch-photo management. The existing voucher `kind:'photo'` upload (`assertCanManageVouchers`) is left UNCHANGED and is NOT widened.
  - **Instant removal (unreviewed, destructive, customer-visible):** OWNER-ONLY in v1, as an EXPLICIT EXCEPTION to the general BM edit rule. Rationale: it is immediate, UNREVIEWED (no admin gate, unlike add-via-review), customer-visible, and a permanent delete with no undo; a non-owner instant destructive action is not granted in v1. This is a deliberate exception, NOT an accidental "all photo actions owner-only" default. DOCUMENTED ALTERNATIVE (owner picks at review): allow BRANCH_MANAGER for ASSIGNED branches (`assertBranchAllowed`) for symmetry with add-via-review; if chosen, add the `assertBranchAllowed` enforcement on the removal route + the BM assigned/unassigned removal tests in §11.
  - **FE rendering:** the backend enforces the above; the merchant-web FE still renders photo controls OWNER-ONLY in PR-3 because it has no per-branch BM capability signal yet. BM photo controls light up only when the deferred FE `viewerCapabilities` signal lands (additive `viewerCapabilities` on `GET /branches/:id`, the PR-2 follow-up). So PR-3 ships: backend BM-scoping for add-via-review + owner-only instant-removal + FE owner-rendered.
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

## 6. Backend auth changes (add-via-review scoping + instant-removal endpoint)

**6a. Add-via-review scoping (migrate to BM-scoped per D3):** change `createBranchPhotoEditRequest` auth from `resolveAdminMerchant` (owner-only) to `resolveMerchantContext` + `assertBranchAllowed(ctx, branchId)`, so an OWNER (any branch) OR a BRANCH_MANAGER (assigned branch) can submit a photo review request. This mirrors the PR-2 write-route migration and honours D3. Also add the `remove`-ID branch-scope validation here (§3). Preserve the `PENDING_EDIT_EXISTS` guard + the audit. The asset-upload step is the branch-scoped upload in §6c (NOT the voucher `/uploads/photo` route), so a normal assigned-branch BM completes the whole add-photo flow WITHOUT `canManageVouchers`.

**6b. Instant photo-removal endpoint (NEW):**

- **Route:** `DELETE /api/v1/merchant/branches/:id/photos/:photoId` (merchant-authed).
- **Auth:** OWNER-ONLY in v1 (`resolveAdminMerchant`), per the D-PR3-4 EXPLICIT EXCEPTION (instant + unreviewed + destructive + customer-visible). This is intentionally STRICTER than the add-via-review lane (which is BM-scoped) because removal has no admin review gate. DOCUMENTED ALTERNATIVE (owner picks at review): switch to `resolveMerchantContext` + `assertBranchAllowed` to let a BRANCH_MANAGER remove an assigned-branch photo (then add the BM assigned/unassigned removal tests in §11).
- **Service** `removeBranchPhoto(prisma, adminId, branchId, photoId, ctx)`:
  - Resolve owner merchant + branch ownership (`resolveBranch`).
  - Find `BranchPhoto` by `id` AND `branchId`. Not found / not on branch -> 404 `BRANCH_PHOTO_NOT_FOUND` (NEW additive error code).
  - GUARD: only delete a photo with `moderationStatus: 'APPROVED'` (instant-removal is for live photos). A non-APPROVED row -> 409 `PHOTO_NOT_REMOVABLE`. (Pending adds are not rows, so they never reach here; FLAGGED/edge rows are guarded out.)
  - Delete the row atomically; `writeAuditLog` ADMIN-actor with the before snapshot.
  - Customer effect: row gone -> immediately out of the APPROVED read set -> invisible. Instant, no review.
- **Idempotency:** a repeat delete -> 404 (already gone); acceptable.

**6c. Branch-scoped photo-asset upload (NEW, Option A: resolves Codex P1):** branch-photo asset upload must be gated by BRANCH ASSIGNMENT, not voucher delegation. Add a branch-scoped upload. Route shape is the implementer's choice (the AUTH contract is what is locked): either a dedicated `POST /api/v1/merchant/branches/:id/photos/upload`, OR `POST /api/v1/merchant/uploads/photo` with `purpose:'branch-photo'` + `branchId`.
- **Auth:** `resolveMerchantContext` + `assertBranchAllowed(ctx, branchId)` -> OWNER may upload for ANY branch; BRANCH_MANAGER may upload ONLY for ASSIGNED branches; NEITHER requires `canManageVouchers`.
- Returns `{ url }` (the stored asset URL, same shape as the existing upload); the URL then feeds `createBranchPhotoEditRequest({ add:[url] })` (also branch-scoped, §6a). The asset is not bound to the branch until the edit-request + admin approval; the `branchId` on the upload is used only for the `assertBranchAllowed` check.
- **Do NOT widen the voucher upload:** the existing `kind:'photo'` route keeps its `assertCanManageVouchers` gate UNCHANGED (voucher photos keep the voucher gate). Branch photos use this new scoped path. This stops `canManageVouchers` from silently becoming the branch-photo key and avoids widening voucher/business-wide upload behaviour.
- Reuse the existing image validation (type/size caps) + R2 storage of the current upload route; only the auth (+ optional route) differ. NO schema change (route + auth only).

---

## 7. Merchant UI behavior (merchant-web)

`components/branches/sections/BrandingPhotosCard.tsx` (+ `lib/api/branch.ts`):
- **Approved photos:** render from `branch.photos` where `moderationStatus === 'APPROVED'`, each with an "Approved" marker AND a per-photo Remove (X) control (owner-only). Add `moderationStatus` to the client `branchPhotoSchema` (replace the PR-1 blanket-"Approved").
- **Pending (in-review) photos:** render thumbnails from the open pending edit's `branch.pendingEdits[0].proposedChanges.add` URLs (only if `includesPhotos`), each labelled "In review" with NO remove control. Show an "X in review" counter = `proposedChanges.add.length`.
- **Remove action:** clicking a Remove (X) on an APPROVED photo calls a new client fn `removeBranchPhoto(branchId, photoId)` -> the DELETE route; optimistic removal + invalidate `['branch', id]`; toast. Owner-only.
- **Add action:** the PR-1 disabled "Add photo" affordance becomes live: upload via the NEW branch-scoped photo upload (§6c, `assertBranchAllowed`, no `canManageVouchers`) -> `requestBranchPhotoEdit(branchId, [uploadedUrl])` (also branch-scoped) -> creates the PENDING edit -> the new photo shows as "In review" and the counter increments. `PENDING_EDIT_EXISTS` (409) -> "a change is already in review" (cannot stack a second). BACKEND supports OWNER (any branch) + assigned BRANCH_MANAGER; the FE renders this owner-only in PR-3 and lights up for assigned BMs when the `viewerCapabilities` signal lands (no `canManageVouchers` needed for branch photos).
- **Cancel a pending add:** via the existing PendingEditsList WITHDRAW (no per-photo remove on an in-review thumbnail).
- **Banner/logo:** unchanged from PR-1 (edited via the F7 reviewed branch-details modal); the "Add a new banner" affordance lights up via the same `requestBranchPhotoEdit`/banner path only if in prototype scope (banner is a `bannerUrl` SENSITIVE field, edited via F7; keep banner OUT of the photo-gallery lane unless the prototype requires the gallery to manage it; confirm at implementation, default = banner stays F7).
- **Review-status messaging:** keep the PR-1 copy ("New images are checked before they show to customers. Approved images stay live while a new one is in review.").
- **Non-owner / BM rendering (backend vs FE split):** in PR-3 the merchant-web FE renders the photo-management controls (Add, Remove) OWNER-ONLY, because merchant-web has no per-branch BM capability signal yet (the same gap as PR-1/PR-2). The BACKEND, however, now permits a BRANCH_MANAGER to add-via-review for ASSIGNED branches (§6a, `assertBranchAllowed` + the existing `canManageVouchers` upload gate); those Add controls light up for BMs only when the deferred FE `viewerCapabilities` signal lands (the PR-2 follow-up). Instant-removal stays OWNER-only on BOTH backend and FE in v1 (D-PR3-4 exception). Net: no BM regression and no broken/403 controls surface in PR-3; the BM path is backend-ready and lights up with the capability signal.

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
5. Photo-action auth (D-PR3-4), backend-enforced (not UI-only): add-via-review is BM-scoped (OWNER any branch; BRANCH_MANAGER assigned branch) across BOTH the branch-scoped upload (§6c) AND the edit-request (§6a), each via `assertBranchAllowed` (runs before any write, so a BM can never act on an unassigned branch) and WITHOUT `canManageVouchers`; the voucher `kind:'photo'` upload keeps its `assertCanManageVouchers` gate and is NOT widened; instant-removal is OWNER-ONLY in v1 (explicit exception). The merchant FE renders photo controls owner-only until the `viewerCapabilities` signal; the backend guard is the real boundary.
6. No raw R2/storage keys in any new payload; reuse existing url handling. The merchant card renders only urls already on the branch payload.

---

## 11. Tests

- **Applier (vitest):** approve a photos-only edit -> add URLs become APPROVED rows (correct sortOrder append) + remove IDs deleted (branch-scoped) + statuses APPROVED + ADMIN before/after audit; reject -> no rows written, existing APPROVED untouched; add does NOT create a PENDING row; a `remove` ID not on the branch is NOT deleted (no cross-branch delete); a poisoned `proposedChanges` key is never written (allow-list).
- **Instant-removal endpoint (vitest):** OWNER removes an APPROVED photo -> row deleted + (customer read) no longer APPROVED-visible; remove non-existent / cross-branch id -> 404 `BRANCH_PHOTO_NOT_FOUND`, nothing deleted; remove a non-APPROVED row -> 409 `PHOTO_NOT_REMOVABLE`; OWNER-ONLY in v1 -> a BRANCH_MANAGER (even for an assigned branch) is DENIED (the D-PR3-4 exception), no row deleted. [If the owner picks the BM-assigned removal ALTERNATIVE: BRANCH_MANAGER assigned -> 200; BRANCH_MANAGER unassigned -> 403 via `assertBranchAllowed`.]
- **`createBranchPhotoEditRequest` add-via-review (vitest, role matrix):** OWNER submits for any branch -> 200; BRANCH_MANAGER submits for an ASSIGNED branch -> 200 (`assertBranchAllowed` passes); BRANCH_MANAGER for an UNASSIGNED branch -> 403 (no edit-request created, no DB write); `remove` validated as branch-owned IDs (reject foreign/unknown); `add` URLs stored; PENDING_EDIT_EXISTS still guards.
- **Branch-scoped photo upload (§6c) (vitest, role matrix):** OWNER uploads for any branch -> 200 `{url}`; BRANCH_MANAGER WITHOUT `canManageVouchers` uploads for an ASSIGNED branch -> 200 (the key fix: a normal assigned-branch BM CAN add a photo); BRANCH_MANAGER for an UNASSIGNED branch -> 403 (`assertBranchAllowed`); and a regression pin that the EXISTING voucher `kind:'photo'` upload still requires `assertCanManageVouchers` (a BM without it is still blocked on the VOUCHER path) and is NOT widened.
- **Customer read (vitest):** pending add (URL-in-edit, no row) invisible; approved visible; removed gone.
- **merchant-web (jest):** approved photos render with per-photo Remove (owner); Remove calls the DELETE route + optimistic drop; in-review thumbnails render from pending-edit add URLs (no remove); Add opens upload + submits the edit-request -> in-review status + counter increments; PENDING_EDIT_EXISTS surfaced; non-owner = read-only (no Add/Remove); `branchPhotoSchema` parses `moderationStatus`.
- **admin-web (jest):** Approve a photo edit succeeds (no throw) + UI reflects applied photos; reject unchanged.

---

## 12. Rollback + stop-and-report triggers

- STOP AND REPORT if: a schema field turns out needed (D-PR3-6); the applier cannot cleanly segregate identity-vs-photo deltas in a mixed edit (§5.6); remove-by-ID cannot be branch-scoped safely; the customer `moderationStatus` gate would be weakened; migrating `createBranchPhotoEditRequest` to `assertBranchAllowed` cannot be done without a structural change (it should mirror the PR-2 write-route migration); the branch-scoped photo upload (§6c) cannot be added without touching/widening the voucher `kind:'photo'` path (it must stay isolated); the banner-in-gallery question needs an owner call (§7); or R2/storage handling forces a contract change.
- Rollback: the applier change is additive within the existing transaction (revert restores the throw); the new DELETE route + error codes are additive (revert removes them); the merchant-web wiring reverts to the PR-1 disabled affordances + blanket render. No data migration.

---

## 13. Scope boundaries + deferrals

IN PR-3: a NEW branch-scoped photo-asset upload (§6c, `assertBranchAllowed`, no `canManageVouchers`); `createBranchPhotoEditRequest` auth migration to `resolveMerchantContext` + `assertBranchAllowed` (BM-scoped add-via-review per D3) + remove-by-ID branch-scope validation; instant photo-removal endpoint + service (OWNER-only v1); applier photo-apply (close the throw); merchant-web photo gallery (approved + in-review render, owner-rendered Remove + Add wiring, per-photo moderationStatus); admin-web apply-success reflection; the customer gate stays as-is; tests; new error codes `BRANCH_PHOTO_NOT_FOUND` / `PHOTO_NOT_REMOVABLE`. The voucher `kind:'photo'` upload is left UNCHANGED.

OUT / DEFERRED:
- Automated image moderation/scanning (the moderation worker stays unwired; admin approval is the moderation).
- The merchant FE that surfaces BM photo controls (Add for assigned branches): DEFERRED to the `viewerCapabilities` signal (PR-2 follow-up). The PR-3 BACKEND already BM-scopes add-via-review; the FE renders owner-only until then.
- Instant-removal for Branch Managers: OWNER-only in v1; the BM-assigned removal ALTERNATIVE (§4 D-PR3-4) is an owner decision, deferred.
- Banner management via the photo-gallery lane (banner stays the F7 reviewed branch-details modal unless the prototype proves otherwise).
- Photo reordering UX (append-on-add only; `sortOrder` drag-reorder is not in PR-3 unless the prototype requires it).
- Any schema change (none in PR-3).

---

## 14. PR shape

PR-3 as ONE stacked PR on the PR-2 branch (backend applier + new endpoint + remove-by-ID validation + admin-web apply reflection + merchant-web gallery), since the customer-visibility contract should land atomically. Fresh implementer + fresh adversarial (security) reviewer; open when green; SHA-bound merge gate; do not merge. If backend + FE are easier to review separately, split into PR-3a (backend: applier + endpoint + validation + tests) and PR-3b (admin-web + merchant-web), both stacked, both reviewed, neither merged.

---

## 15. Self-review

Covers the owner-required sections: instant photo-removal endpoint (§6); admin apply closing `EDIT_PHOTO_APPLY_NOT_SUPPORTED` safely (§5); remove-by-ID not URL (§3 + D-PR3-1); customer photo visibility / `moderationStatus` (§9 + D-PR3-5); merchant UI for approved/pending/remove/review-status (§7); admin review behavior (§8); tests + rollback + stop-and-report (§11, §12); explicit scope + deferrals (§13). Includes the required prototype-vs-live cross-check table (§2). Live code re-verified; corrections folded in (PR-1 blanket-"Approved" -> real per-photo state; in-review thumbnails from pending-edit add URLs; `branchPhotoSchema` lacks `moderationStatus`; reject already photo-safe; BranchPhoto cascade-delete; the `/uploads/photo` `assertCanManageVouchers` gate). No schema change.

Codex review round (rev 3, auth/scope): fixed the D-PR3-4 mismatch Codex flagged. The old "all photo actions OWNER-only" conflicted with umbrella D3 (a BM may submit review-required branch-detail changes, including photos, for assigned branches, server-enforced via `assertBranchAllowed`). Now SPLIT: (1) add-via-review is BM-scoped (migrate `createBranchPhotoEditRequest` to `resolveMerchantContext` + `assertBranchAllowed`; OWNER any branch, BRANCH_MANAGER assigned branch; the existing `/uploads/photo` `assertCanManageVouchers` gate is reused unchanged as the asset constraint, with a flagged owner-option to widen it for non-`canManageVouchers` BMs) [this asset-upload sub-decision is SUPERSEDED by rev 4 below: replaced with a branch-scoped upload, §6c]; (2) instant-removal is OWNER-only in v1 as an EXPLICIT exception (instant + unreviewed + destructive + customer-visible), with a documented BM-assigned alternative for owner choice; (3) the cross-check role-scope row, §6 backend-auth section, security invariant #5, the §11 role-matrix + owner-only-removal tests, and §13 scope/deferrals were all updated; (4) the FE renders photo controls owner-only until the `viewerCapabilities` signal, so no BM regression and no broken/403 controls in PR-3.

Codex re-review round (rev 4, P1 upload gate): Codex flagged that reusing the voucher `/uploads/photo` `assertCanManageVouchers` gate means a normal assigned-branch BM CANNOT actually complete the D3 add-photo flow (`canManageVouchers` is a different, business-wide/voucher permission and must not silently become the branch-photo key). RESOLVED via Codex's preferred Option A: PR-3 now adds a NEW BRANCH-SCOPED photo upload (§6c) gated by `resolveMerchantContext` + `assertBranchAllowed` (OWNER any branch; BRANCH_MANAGER assigned branch; NO `canManageVouchers`); the voucher `kind:'photo'` upload keeps its `assertCanManageVouchers` gate UNCHANGED and is NOT widened. The rev-3 "reuse `canManageVouchers` + owner-option-to-widen" approach is SUPERSEDED. Updated across: §1 upload fact, the §2 cross-check role row, D-PR3-4 add-via-review, §6a + the new §6c, §7 Add action, security invariant #5, §11 (new branch-scoped-upload role-matrix test covering OWNER / assigned-BM-without-canManageVouchers / unassigned-BM + a voucher-path-unchanged regression pin), §12 stop-and-report, and §13 IN/deferred. Net: a normal assigned-branch BM can genuinely add a branch photo per D3, voucher-upload behaviour untouched, instant-removal still OWNER-only v1. Ready for owner + Codex re-review. No PR-3 implementation until approved.
