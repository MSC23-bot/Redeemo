# Branches PR-1 (Surface Spine) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (fresh implementer + fresh adversarial reviewer per task) to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.
> Status: DRAFT (awaiting owner + Codex review before any implementation).
> Tier: 2 (no-schema merchant-web surface over existing backend routes).
> Source of truth: the approved umbrella spec `docs/superpowers/specs/2026-06-23-merchant-web-branches-programme-design.md` (PR #307) + the 12 prototype screenshots in `docs/superpowers/prototype-references/merchant-web-branches/`.

**Goal:** Build the read/edit "surface spine" of the merchant-portal Branches module (`apps/merchant-web`) over the EXISTING backend, exposing only actions that already behave correctly, with every not-yet-safe action present as a disabled "coming in this Branches rollout" affordance.

**Architecture:** Two new client pages under the existing `(app)` route group: `branches/page.tsx` (overview list) and `branches/[id]/page.tsx` (detail), following the established Vouchers/Redemptions/Staff page conventions (`'use client'`, React Query, `apiFetch`, the `@/components/ui/*` design system). New components under `components/branches/**`; new hooks/utilities under `lib/branches/**`; the existing `lib/api/branch.ts` is EXTENDED (not rewritten) with the few read functions + schema fields PR-1 needs. No backend change, no schema, no migration.

**Tech stack:** Next.js 15 App Router (client components), React Query 5, zod 4, the merchant-web `@/components/ui/*` primitives + brand tokens, jest + RTL. Node 24 (merchant-web CI job).

---

## 0. Closed scope (the gate)

PR-1 builds ONLY the no-schema Branches surface over existing backend routes. NOT in PR-1 (each is an explicit disabled affordance or a later slice): PR-2 Branch-Manager write enablement; PR-3 photo gallery apply/remove; PR-4 hours cool-off edit; PR-5 add/close lifecycle; PR-6 Google Places lookup; PR-7 redemption alerts; PR-8 multi-window hours. No backend changes unless a task identifies a MISSING required field, in which case STOP AND REPORT (do not add backend scope inside PR-1). No admin-web, no customer changes, no Prisma/schema/migration.

PR-1 write controls are OWNER-ONLY (the live branch write routes use the owner-only resolver `resolveAdminMerchant`); a non-owner Branch Manager sees PR-1 as READ-ONLY on writes. Full BM-scoped writes are PR-2. Do NOT migrate resolvers in PR-1.

---

## 1. Verified anchors (inspect first; these are facts, re-confirm before coding)

These were verified against live code during planning (read the cited files first; treat as anchors, correct if drifted):

### 1.1 merchant-web conventions (reuse verbatim)
- Route group `apps/merchant-web/app/(app)/` holds authed pages; each feature has `page.tsx` (list) + `[id]/page.tsx` (detail). New: `app/(app)/branches/page.tsx` + `app/(app)/branches/[id]/page.tsx`, both `'use client'`. Template: `app/(app)/vouchers/page.tsx` + `app/(app)/vouchers/[id]/page.tsx`.
- Shell/auth: `app/(app)/layout.tsx` wraps `MerchantPortalShell` (sidebar + topbar + auth gate). New pages inherit it; no auth code needed in the page.
- Sidebar: `components/shell/navItems.ts` line ~22 has `{ label: 'Branches', href: '#', icon: MapPin }` in the "Locations & team" group. Wiring = change `href` to `/branches`.
- React Query: provider in `app/providers.tsx` (staleTime 60_000, refetchOnWindowFocus false, retry 1). Query keys are flat arrays. Mutations invalidate via `useQueryClient`.
- Transport: `lib/api/client.ts` `apiFetch<T>(path, { method, auth, body })`. `auth: true` attaches the in-memory Bearer token and auto-refreshes once on 401 (then routes to /sign-in on refresh failure). Throws `ApiError { status, statusCode, code, message, body }`.
- Session: `lib/auth/session.tsx` `useSession()` → `{ ready, isAuthenticated, businessName, approvalStatus, signOut, ... }`. NO membership role on the session/JWT (the merchant JWT carries only `{sub, role:'merchant', deviceId, sessionId}`). NAMING TRAP (verified): the session's `approvalStatus` field is populated from `Merchant.status` (the `MerchantStatus` enum: `REGISTERED | PENDING_APPROVAL | ACTIVE | INACTIVE | SUSPENDED | DELETED`), NOT the `ApprovalStatus` enum. So "Live" is `status === 'ACTIVE'`, never `'APPROVED'`. Evidence: `src/api/auth/merchant/service.ts` `approvalStatus: merchantInfo.status`.
- Lifecycle helper: `apps/merchant-web/lib/auth/lifecycle.ts` exports `deriveStatusPill(profile)` (`status==='ACTIVE'` → `'live'`, `'SUSPENDED'` → `'suspended'`, `'PENDING_APPROVAL'` → `'in_review'`, etc) and `homeFor(state)` (`'live'`/`'live_new'` → `'live'`). This is the canonical merchant-web "is the merchant live" source; reuse it.
- Merchant profile: `lib/auth/useMerchantProfile.ts` `useMerchantProfile(isAuthenticated)` → merchant data (the source of `primaryCategoryId`, needed by the amenity catalogue read).
- Capability seam pattern: `lib/voucher/useVoucherCapability.ts` returns `{ canManage: true }` (v1 hardcode; single seam; DISPLAY-ONLY; backend enforces).
- Toast: `@/components/ui/toast` `useToast()` → `toast({ message, variant })`. Dialog: `@/components/ui/dialog` (hand-rolled, focus-trap + Escape + scrim-close). Tables: `@/components/ui/table` (Table/THead/TBody/TR/TH/TD/TableEmpty). Plus button/card/input/textarea/label/switch/badge/popover/file-upload, and icons via `@/lib/icons`. Brand tokens in `app/globals.css` (semantic class names: `bg-primary`, `text-foreground`, `border-border`, `font-display`, `font-body`).

### 1.2 Existing `apps/merchant-web/lib/api/branch.ts` (current state, verified): F1 EXTENDS this file
Currently exports: `branchSchema` (id, name, isMainBranch?, addressLine1/2, city, postcode, phone, email, websiteUrl, about, bannerUrl, openingHours[], amenities[{amenity:{id,name}}], photos[{id,url}]; all `.passthrough()`), `Branch` type, `listBranches()`, `createBranch()`, `updateBranch()` (+`BranchUpdateBody`), `setBranchHours()`, `getBranchAmenities(categoryId)` (+`Amenity`), `setBranchAmenities()`, `getBranchPin()`, `setBranchPin()`, `requestBranchPhotoEdit()`.
NOT present (F1 must ADD, all consuming EXISTING backend routes): `getBranch(branchId)`; schema fields `logoUrl`, `locationConfidence`, `isActive`, `latitude`, `longitude`, `pendingEdits[]`; `createBranchEditRequest()`, `listBranchEditRequests()`, `withdrawBranchEditRequest()`; `sendBranchPin()`; `isMainBranch?` on `BranchUpdateBody`.

### 1.3 Backend branch routes consumed by PR-1 (all exist; verified `src/api/merchant/branch/{routes,service}.ts`)
- `GET /api/v1/merchant/branches` (`listBranches`, SCOPED via `resolveMerchantContext`) → array of full Branch rows incl. `openingHours[]`, `amenities[{amenity}]`, `photos[]`, `pendingEdits[]` (PENDING only), `isActive`, `isMainBranch`, `locationConfidence`, `city`/`localityName`/`postTown`, `logoUrl`/`bannerUrl`. SECURITY: this payload currently ALSO ships the AES-encrypted `redemptionPin` (raw rows); never render/log it (see §7). [SUPERSEDED 2026-07-05 by PR #377: every merchant branch-row exit now strips the ciphertext and emits a derived `redemptionPinSet` boolean; the frontend reads the boolean (with a temporary presence-only legacy bridge for old-backend skew, removal-gated on a confirmed Railway deployment of the corrected contract). Historical description below preserved.]
- `GET /api/v1/merchant/branches/:id` (`getBranch`, SCOPED via `assertBranchAllowed`) → single Branch, same shape. 404 `BRANCH_NOT_FOUND`.
- `PATCH /api/v1/merchant/branches/:id` (OWNER-only): body `{ phone?, email?, websiteUrl?, isActive?, isMainBranch? }` (DIRECT_FIELDS) → updated Branch. `isMainBranch:true` atomically demotes others. Sensitive identity fields route through edit-request UNLESS in draft window.
- `POST /api/v1/merchant/branches/:id/amenities` (OWNER-only): body `{ amenityIds: string[] }` (full replace) → `{ ok: true }`.
- `GET /api/v1/merchant/branches/:id/pin` (OWNER-only) → `{ pin: string|null }` (decrypted). `PUT .../pin` body `{ pin: /^\d{4}$/ }`. `POST .../pin/send` → dispatch (SMS live, email dark). Errors: `INVALID_PIN_FORMAT`, `PIN_NOT_CONFIGURED`, `BRANCH_NOT_FOUND`.
- `POST /api/v1/merchant/branches/:id/edit-request` (OWNER-only): body = record filtered to SENSITIVE_FIELDS (`name, about, addressLine1, addressLine2, city, postcode, latitude, longitude, logoUrl, bannerUrl`) → `BranchPendingEdit`. Postcode auto-resolves location server-side (`POSTCODE_CENTROID`). 409 `PENDING_EDIT_EXISTS`. Creates `AdminApproval` type `BRANCH_IDENTITY_EDIT`.
- `GET /api/v1/merchant/branches/:id/edit-requests` (OWNER-only) → `BranchPendingEdit[]` (ALL statuses; caller filters PENDING). `DELETE .../edit-requests/:editId` → withdraws (status WITHDRAWN). 404 `PENDING_EDIT_NOT_FOUND`.
- Amenity catalogue: `GET /api/v1/customer/categories/:id/amenities` (NO auth) → `{ amenities: [{id,name,iconUrl?,isActive}] }`. Call with the merchant's `primaryCategoryId`.

### 1.4 Staff endpoints + client for F12 (verified; reuse, no new endpoint)
- `GET /api/v1/merchant/staff` (OWNER-gated `assertOwner`) → `{ members: MemberRow[] }`, `MemberRow = { id, name, email, role: OWNER|BRANCH_MANAGER|STAFF, status, canManageVouchers, allBranches, branchIds[], claimed, lastLoginAt }`. Client: `listStaff()` in `lib/api/staff.ts` (unwraps to `MemberRow[]`); hook `useStaff(enabled)` (`STAFF_KEY = ['staff']`).
- `GET /api/v1/merchant/staff/app-users` (OWNER-gated) → `{ branches: [{ branchId, branchName, appUserCount, users: [{ id, branchId, firstName, lastName, jobTitle, email, status, lastLoginAt }] }] }`. Client: `listBranchAppUsers()`; hook `useBranchAppUsers(enabled)` (`APP_USERS_KEY = ['branchAppUsers']`). NO secrets (no passwordHash/PIN/phone).
- Pills: `AccessPill` + `RoleChip` are defined INSIDE `components/staff/StaffTable.tsx` (not exported) + `ROLE_LABEL` in `lib/staff/display.ts`. F12 extracts `AccessPill`/`RoleChip` into a shared `components/branches/StaffPills.tsx` (or `components/ui/staffPills.tsx`) and updates StaffTable to import them (a refactor that keeps Staff working; if extraction risks the Staff surface, duplicate the small styled spans instead and note it).

### 1.5 Owner-vs-Branch-Manager signal (DECIDED for PR-1; reuses the established staff-endpoint pattern)
There is no membership role on the merchant session/JWT today. PR-1 reuses the established merchant-web pattern (the Staff & Access page) that derives `isOwner` from whether the owner-gated `GET /staff` succeeds:
```ts
// lib/branches/useBranchCapability.ts (mirrors staff/page.tsx)
const staff = useStaff(/* enabled when on the detail page */)
const staffForbidden = staff.isError && (staff.error as ApiError)?.code === 'INSUFFICIENT_PERMISSIONS'
const isOwner = staff.isSuccess && !staffForbidden
const ready = staff.isSuccess || staffForbidden // settled either way
```
PR-1 DECISION (not an open question): the DETAIL page fetches `useStaff()` (also the F12 data source), and `isOwner` from that query gates all detail write controls (F4/F5/F6/F7/F8). The OVERVIEW page needs no owner probe (its only write, Add branch, is a locked disabled affordance regardless). Backend 403 on every branch write is the defence-in-depth boundary, so even if the client gate is wrong the server rejects. A cleaner role-in-session signal is a future improvement (deferred, not PR-1).

EXECUTION SEQUENCING (so the gate is testable): implement F1 first (data layer), then F3 detail shell + F12 staff query (which yields `isOwner`/`useBranchCapability`), then F4-F8 write controls gated on that signal. Write-control gating tests depend on the F12 staff query being in place; sequence accordingly (F1 -> F2 -> F3 -> F12 -> F4..F8 -> F9..F11 -> F13 -> F14). Until `ready`, render write controls as not-yet-available (no flash, no premature 403).

### 1.6 Draft-window nuance
PR-1 targets the LIVE (approved) merchant managing day-2 branches. For a live merchant, sensitive identity edits route through the edit-request lane (F7). The PATCH "direct sensitive write in the draft window" path is the onboarding flow (`status=REGISTERED`/`onboardingStep=NEEDS_CHANGES`) and is out of PR-1 scope. F4/F7 must NOT send sensitive fields via PATCH.

---

## 2. File structure

Create (all under `apps/merchant-web/`):
- `app/(app)/branches/page.tsx`: overview list page (orchestrator)
- `app/(app)/branches/[id]/page.tsx`: detail page (orchestrator)
- `components/branches/BranchesOverview.tsx`: summary cards + branch table
- `components/branches/BranchDetail.tsx`: detail layout composing the section cards
- `components/branches/sections/ContactCard.tsx` (F4)
- `components/branches/sections/AmenitiesCard.tsx` (F5)
- `components/branches/sections/PinCard.tsx` (F6)
- `components/branches/sections/BranchDetailsCard.tsx` + `components/branches/BranchDetailsEditModal.tsx` + `components/branches/PendingEditsList.tsx` (F7)
- `components/branches/sections/MainBranchControl.tsx` (F8)
- `components/branches/sections/LocationCard.tsx` (F9)
- `components/branches/sections/OpeningHoursCard.tsx` (F10)
- `components/branches/sections/BrandingPhotosCard.tsx` (F11)
- `components/branches/sections/StaffAtBranchCard.tsx` (F12)
- `components/branches/StaffPills.tsx` (extracted AccessPill/RoleChip) (F12)
- `components/branches/ReviewStateBanners.tsx` (F3/F9/F11 review-state banners)
- `components/branches/LockedAffordance.tsx` (F13 shared disabled control + copy)
- `lib/branches/useBranches.ts`: `BRANCHES_KEY`, `useBranches()`, `useBranch(id)`, mutations (`useUpdateBranchContact`, `useSetAmenities`, `useSetMainBranch`, `usePin*`, `useCreateBranchEditRequest`, `useWithdrawBranchEditRequest`)
- `lib/branches/useBranchCapability.ts`: `{ isOwner, ready }` from the staff query (§1.5)
- `lib/branches/openNow.ts`: client mirror of `src/api/shared/isOpenNow.ts` (Europe/London) for "Open right now" + the Today's-hours cell
- `lib/branches/withRedeemo.ts`: `isWithRedeemo(branch)` = `branch.isActive === true && branch.locationConfidence === 'MANUALLY_CONFIRMED'` (+ the merchant-lifecycle guard helper)
- Tests: `__tests__/` alongside each page + component; `lib/api/__tests__/branch.test.ts` (extend); `lib/branches/__tests__/openNow.test.ts`; parity test against the backend isOpenNow cases.

Modify:
- `lib/api/branch.ts`: extend schema + add read/edit-request/pin-send functions (F1)
- `components/shell/navItems.ts`: Branches `href` `#` → `/branches` (F13/F2)
- `components/staff/StaffTable.tsx`: import `AccessPill`/`RoleChip` from the extracted `StaffPills.tsx` (F12; only if extraction is chosen over duplication)

Do NOT touch: any `src/api/**`, `prisma/**`, `apps/admin-web/**`, `apps/customer-app/**`, `apps/customer-web/**`.

---

## 3. Tasks F1 to F14

Each task lists: Files; Endpoints + expected fields; UI states; Owner vs Branch Manager; Tests first; Stop-and-report; Rollback.

### F1: API client + zod schema extensions (no-schema; consume existing routes)

- **Files:** `lib/api/branch.ts` (extend); `lib/branches/useBranches.ts` (new); `lib/api/__tests__/branch.test.ts` (extend).
- **Endpoints + fields (exact contracts; consume existing routes only):**
  - Extend `branchSchema` (keep `.passthrough()`) with these exact additions:
    ```ts
    // add inside the existing branchSchema z.object({ ... }):
    logoUrl: z.string().nullish(),
    locationConfidence: z.enum(['MANUALLY_CONFIRMED','ADDRESS_GEOCODED','POSTCODE_CENTROID','NEEDS_REVIEW']).nullish(),
    isActive: z.boolean().optional(),
    latitude: z.number().nullish(),
    longitude: z.number().nullish(),
    pendingEdits: z.array(branchPendingEditSchema).optional(), // PENDING-only on list+detail (BRANCH_INCLUDE)
    ```
  - Define `branchPendingEditSchema` exactly (mirrors the backend `BranchPendingEdit` model + `PendingEditStatus` enum, verified):
    ```ts
    export const pendingEditStatusSchema = z.enum(['PENDING','APPROVED','REJECTED','WITHDRAWN']) // backend PendingEditStatus
    // proposedChanges is a partial bag of the branch SENSITIVE_FIELDS (+ photo add/remove for includesPhotos edits).
    const proposedChangesSchema = z.object({
      name: z.string().optional(), about: z.string().optional(),
      addressLine1: z.string().optional(), addressLine2: z.string().optional(),
      city: z.string().optional(), postcode: z.string().optional(),
      logoUrl: z.string().optional(), bannerUrl: z.string().optional(),
      latitude: z.number().optional(), longitude: z.number().optional(),
      add: z.array(z.string()).optional(), remove: z.array(z.string()).optional(), // photo edits
    }).passthrough()
    export const branchPendingEditSchema = z.object({
      id: z.string(), branchId: z.string(), merchantId: z.string(),
      proposedChanges: proposedChangesSchema, includesPhotos: z.boolean(),
      status: pendingEditStatusSchema,
      reviewedBy: z.string().nullish(), reviewNote: z.string().nullish(),
      createdAt: z.string(), reviewedAt: z.string().nullish(),
    }).passthrough()
    export type BranchPendingEdit = z.infer<typeof branchPendingEditSchema>
    ```
  - Add `getBranch(branchId: string): Promise<Branch>` → `GET /api/v1/merchant/branches/:id`, `auth:true`, parse `branchSchema`.
  - Add `isMainBranch?: boolean` to the existing `BranchUpdateBody` interface (backend `updateBranch` already accepts it; F8 uses `updateBranch(id, { isMainBranch: true })`).
  - Add `createBranchEditRequest(branchId: string, changes: BranchEditRequestBody): Promise<BranchPendingEdit>` → `POST /api/v1/merchant/branches/:id/edit-request`, `auth:true`, body = the SENSITIVE subset (`name?, about?, addressLine1?, addressLine2?, city?, postcode?, logoUrl?, bannerUrl?`), parse `branchPendingEditSchema`. (Define `BranchEditRequestBody` as that partial interface; do NOT send lat/lng, the backend resolves location from postcode.)
  - Add `listBranchEditRequests(branchId: string): Promise<BranchPendingEdit[]>` → `GET /api/v1/merchant/branches/:id/edit-requests`, `auth:true`, parse `z.array(branchPendingEditSchema)` (returns ALL statuses; the caller filters `status === 'PENDING'`).
  - Add `withdrawBranchEditRequest(branchId: string, editId: string): Promise<BranchPendingEdit>` → `DELETE /api/v1/merchant/branches/:id/edit-requests/:editId`, `auth:true`, parse `branchPendingEditSchema`.
  - Add `sendBranchPin(branchId: string): Promise<{ message: string }>` → `POST /api/v1/merchant/branches/:id/pin/send`, `auth:true`, parse `z.object({ message: z.string() }).passthrough()`.
  - Hooks in `lib/branches/useBranches.ts` (mirror `lib/staff/useStaff.ts`): `BRANCHES_KEY = ['branches']`; `useBranches()` → `listBranches`; `useBranch(id)` (key `['branch', id]`) → `getBranch`; mutation hooks (`useUpdateBranchContact`, `useSetAmenities`, `useSetMainBranch`, `useSetBranchPin`, `useCreateBranchEditRequest`, `useWithdrawBranchEditRequest`, `useSendBranchPin`) each `onSuccess` → `qc.invalidateQueries({ queryKey: BRANCHES_KEY })` + `qc.invalidateQueries({ queryKey: ['branch', id] })`.
- **UI states:** n/a (data layer).
- **Owner vs BM:** n/a at the client layer; gating happens in components.
- **Tests first:** extend `branch.test.ts`: (a) `branchSchema` parses `locationConfidence`+`isActive`+`logoUrl`+`pendingEdits`; (b) `getBranch` GETs `/branches/:id` with `auth:true`; (c) `createBranchEditRequest`/`listBranchEditRequests`/`withdrawBranchEditRequest`/`sendBranchPin` call the exact path+method+auth+body (mock `apiFetch`, assert call args, beforeEach reset); (d) `branchPendingEditSchema` REJECTS an invalid `status` (e.g. `'BOGUS'`) and accepts the four enum values; (e) `createBranchEditRequest` returns the parsed `BranchPendingEdit` shape (id/status/createdAt present). Mirror the existing `branch.test.ts` structure.
- **Stop-and-report:** if any consumed route returns a field the prototype needs but the schema/route does not provide (do not add backend scope).
- **Rollback:** schema additions are additive `.nullish()`/`.optional()`; reverting removes only new exports.

### F2: Branches overview page (summary cards + list)

- **Files:** `app/(app)/branches/page.tsx`; `components/branches/BranchesOverview.tsx`; tests alongside.
- **Endpoints + fields:** `useBranches()` (`GET /branches`). Cells derive from the single list payload (NO per-branch fetch): name; status (`isActive`); locality/town (`city` → `localityName` → `postTown` fallback); Today's hours (via `lib/branches/openNow.ts` over `openingHours`); Setup = amenity count (`amenities.length`) + PIN set/not-set (`redemptionPin != null`: never render the value); main-branch indicator (`isMainBranch`; list is main-first).
- **Summary cards (prototype 01/12):** Locations = `branches.length`; Open right now = count where `openNow(branch.openingHours)` (Europe/London); With Redeemo = count where `isWithRedeemo(branch)` = `branch.isActive === true && branch.locationConfidence === 'MANUALLY_CONFIRMED'`, GATED by the merchant-lifecycle guard. CANONICAL lifecycle source (nominated, single source of truth): reuse `apps/merchant-web/lib/auth/lifecycle.ts` over the merchant profile from `useMerchantProfile()`: the merchant is "Live" iff `homeFor(deriveStatusPill(profile)) === 'live'` (equivalently `profile.status === 'ACTIVE'`). When the merchant is NOT live (`status` any of `REGISTERED / PENDING_APPROVAL / INACTIVE / SUSPENDED / DELETED`), it is not on Redeemo at all, so render With Redeemo = 0 (never the raw per-branch `MANUALLY_CONFIRMED` count). DO NOT compare to `'APPROVED'`: the `MerchantStatus` enum has no `APPROVED` value, and the session's `approvalStatus` field is actually `Merchant.status` (see §1.1 naming trap). If using the session field instead of the profile, compare to `'ACTIVE'`.
- **UI states:** loading (conditional, no skeleton lib: match Vouchers/Redemptions); error (`Card` + alert role + Try again → `refetch()`); empty (`TableEmpty` + locked Add affordance); success (cards + table; row click → `router.push('/branches/'+id)`).
- **Owner vs BM:** list is scoped server-side (`listBranches` returns only allowed branches for a scoped member). The "Add branch" control is a LOCKED disabled affordance for everyone in PR-1 (F13).
- **Tests first:** renders summary cards from a mocked list (Locations/Open/With-Redeemo correct); With-Redeemo guard: count is the true `isActive && MANUALLY_CONFIRMED` total when `profile.status === 'ACTIVE'`, and 0 when `profile.status` is non-ACTIVE (e.g. `PENDING_APPROVAL`, `SUSPENDED`); renders rows with Setup PIN set/not-set WITHOUT exposing the pin value; row click navigates; empty + error states; "Add branch" is disabled and fires no network call.
- **Stop-and-report:** if `openingHours` is absent from the list payload (it should be present): then Open-now/Today cannot derive without an N+1.
- **Rollback:** delete `branches/page.tsx` + `BranchesOverview.tsx`; revert nav href.

### F3: Branch detail page shell + routing

- **Files:** `app/(app)/branches/[id]/page.tsx`; `components/branches/BranchDetail.tsx`; `components/branches/ReviewStateBanners.tsx`; tests.
- **Endpoints + fields:** `useBranch(id)` (`GET /branches/:id`). Header (prototype 02/07): hero/banner (`bannerUrl`) + logo (`logoUrl`), name, sub-brand (`businessName` from session/profile), status pill (`isActive` + open-now), "Main branch" badge vs "Make main branch" (F8). Review-state banners (prototype 07; use the screenshot's exact copy as source of truth): a "Photos awaiting review" banner with the in-review count (driven by `pendingEdits[]` where `includesPhotos`), and an "Awaiting location check" banner ("We are checking the exact spot from the address. The pin may be approximate until confirmed. Nothing for you to do.") driven by `locationConfidence !== 'MANUALLY_CONFIRMED'`. An approved/confirmed branch shows neither banner.
- **UI states:** loading; error (`BRANCH_NOT_FOUND` → "Branch not found" + back to /branches); success composes the section cards (F4-F12) + locked affordances (F13). Back button → `/branches`.
- **Owner vs BM:** detail is readable by a scoped BM (`getBranch` via `assertBranchAllowed`); `useBranchCapability()` (§1.5) computes `isOwner` from the F12 staff query and passes it to all section cards to gate write controls. BM = read-only.
- **Tests first:** renders header + sub-brand + status; review banners show when pendingEdits/awaiting-location; not-found state; composes the section cards; back nav.
- **Stop-and-report:** if `getBranch` deep-link/refresh fails for a scoped member who should have access (assertBranchAllowed regression).
- **Rollback:** delete the detail page + components.

### F4: Contact instant-save (owner-only)

- **Files:** `components/branches/sections/ContactCard.tsx`; tests.
- **Endpoints + fields:** `PATCH /branches/:id` with `{ phone?, email?, websiteUrl? }` (DIRECT_FIELDS; NOT sensitive). On success, toast + invalidate `['branch', id]` + `BRANCHES_KEY`.
- **UI states:** view (phone/email/website + "Saves instantly" hint + Edit pencil); edit (inputs + Save/Cancel); pending (button busy); error (`setActionError` + alert). `isActive` is NOT a Contact control: the prototype (screenshots 02/03/07) shows only phone/email/website in the Contact card; the branch active/closed state is the read-only header status pill (derived from `isActive` + open-now). PR-1 does NOT expose an `isActive` toggle anywhere (branch deactivation/close is the PR-5 lifecycle). F4 sends ONLY `{ phone?, email?, websiteUrl? }`.
- **Owner vs BM:** Edit controls render ONLY when `isOwner`; BM sees read-only values.
- **Tests first:** owner edit → PATCH with exactly the changed direct fields; non-owner → no Edit control; error display; instant-save toast.
- **Stop-and-report:** if a prototype contact field maps to a SENSITIVE field (it must not; address is F7).
- **Rollback:** delete component.

### F5: Amenities instant-save (owner-only)

- **Files:** `components/branches/sections/AmenitiesCard.tsx`; tests.
- **Endpoints + fields:** catalogue via `getBranchAmenities(primaryCategoryId)` (`GET /customer/categories/:id/amenities`, no auth) using the merchant's `primaryCategoryId` (from `useMerchantProfile`); current selections from `branch.amenities[].amenity.id`. Save via `setBranchAmenities(id, amenityIds)` (`POST /branches/:id/amenities`, full replace) → toast + invalidate.
- **UI states:** view (checked amenity chips, read-only); edit (toggle chips + Save); loading catalogue; error; MISSING-CATEGORY fallback: if the merchant has no `primaryCategoryId`, render the card showing the branch's current `amenities` read-only with a small note "Amenity editing is unavailable until your business category is set" and NO edit control (do not crash; the catalogue fetch is skipped). Also STOP AND REPORT (onboarding-data gap, not a PR-1 fix).
- **Owner vs BM:** edit only when `isOwner`.
- **Tests first:** catalogue fetched with primaryCategoryId; toggle → POST full amenityIds; non-owner read-only; missing primaryCategoryId → graceful empty + no crash.
- **Stop-and-report:** if `primaryCategoryId` is missing/null on the merchant profile (catalogue cannot load): report (likely an onboarding-data gap, not a PR-1 fix).
- **Rollback:** delete component.

### F6: PIN reveal / change / send (owner-only)

- **Files:** `components/branches/sections/PinCard.tsx`; tests.
- **Endpoints + fields:** reveal `getBranchPin(id)` (`GET /pin` → `{pin}`); change `setBranchPin(id, pin)` (`PUT /pin`, `/^\d{4}$/`); send `sendBranchPin(id)` (`POST /pin/send`). The PIN is shown MASKED by default with a reveal action (prototype shows obscured dots); the decrypted value is fetched only on explicit reveal, never from the list payload.
- **UI states:** masked (default) → reveal; change (4-digit input + validation `INVALID_PIN_FORMAT`); send (busy → success toast; `PIN_NOT_CONFIGURED` error); not-set state.
- **Owner vs BM:** all PIN controls owner-only (the routes are owner-only).
- **Tests first:** reveal calls `GET /pin` only on demand; change validates 4 digits + PUTs; send POSTs + toasts; non-owner sees no PIN section; the list-derived PIN set/not-set indicator (F2) never calls `GET /pin`.
- **Stop-and-report:** if reveal would need to read the encrypted pin from the list payload (forbidden): it must use `GET /pin`.
- **Rollback:** delete component.

### F7: Branch-details reviewed edit modal + pending requests + withdraw (owner-only)

- **Files:** `components/branches/sections/BranchDetailsCard.tsx`; `components/branches/BranchDetailsEditModal.tsx`; `components/branches/PendingEditsList.tsx`; tests.
- **Endpoints + fields:** submit `createBranchEditRequest(id, changes)` (`POST /edit-request`) with fields from the modal (prototype 11): Branch name (`name`), Description (`about`), Address line 1 (`addressLine1`), Address line 2 (`addressLine2`), Town or city (`city`), Postcode (`postcode`), plus logo/banner (`logoUrl`/`bannerUrl`): all SENSITIVE → reviewed. List pending via `listBranchEditRequests(id)` (filter `status==='PENDING'`); withdraw via `withdrawBranchEditRequest(id, editId)`. The in-modal "Location on the map" preview is a designed READ-ONLY placeholder (NO Google call, NO lat/lng; consistent with F9). Existing approved values stay live until approval.
- **UI states:** card (current identity values + "Reviewed by Redeemo" + Edit); modal (form + reviewed-warning banner + Cancel / "Send for review"); pending banner (prototype 07) with withdraw; `PENDING_EDIT_EXISTS` (409) → inline notice "A change is already in review" + point to the pending item (do not allow a second concurrent request); postcode resolver errors: on `POSTCODE_NOT_FOUND` show inline (role=alert) under the Postcode field "We could not find that postcode. Check it and try again."; on `GAZETTEER_UNAVAILABLE` show a modal-level inline alert "Address lookup is temporarily unavailable. Please try again shortly." In both cases the modal STAYS OPEN and "Send for review" is re-enabled (not a dead-end). All modal fields are a subset of the backend SENSITIVE_FIELDS (name, about=Description, addressLine1, addressLine2, city=Town or city, postcode, logoUrl, bannerUrl); the modal does NOT expose lat/lng (location resolves server-side from postcode). CONFIRM at implementation that every rendered modal field is in SENSITIVE_FIELDS; if the prototype shows a field that is not, STOP AND REPORT (a pre-existing backend gap, not a PR-1 fix).
- **Owner vs BM:** modal + withdraw owner-only.
- **Tests first:** submit posts the SENSITIVE fields only; pending list filters PENDING; withdraw deletes; 409 handled; postcode error surfaced; in-modal map is a static placeholder (no network); non-owner read-only.
- **Stop-and-report:** if the prototype modal requires a field not in SENSITIVE_FIELDS; if logo/banner submission cannot apply (note: logo/banner DO apply via the allow-list today; only the photo GALLERY is blocked: that is F11/PR-3, not here).
- **Rollback:** delete the three components.

### F8: Set main branch (owner-only, instant)

- **Files:** `components/branches/sections/MainBranchControl.tsx`; tests.
- **Endpoints + fields:** `PATCH /branches/:id` with `{ isMainBranch: true }` (same route as F4; atomic single-main promotion). Asymmetric render (prototype 02/07): when `branch.isMainBranch` → "Main branch" badge, NO button; else → "Make main branch" action (owner-only). Record the close-eligibility coupling copy ("cannot close the main branch") for the PR-5 close flow (display note only in PR-1).
- **UI states:** badge (is main); action + confirm → PATCH → toast + invalidate; pending; error.
- **Owner vs BM:** action owner-only.
- **Tests first:** main branch shows badge + no button; non-main shows action (owner only); action PATCHes isMainBranch:true + invalidates; BM sees neither control.
- **Stop-and-report:** none expected.
- **Rollback:** delete component.

### F9: Location card (read-only)

- **Files:** `components/branches/sections/LocationCard.tsx`; tests.
- **Endpoints + fields:** read `locationConfidence` + formatted address from `useBranch`. Badge: `MANUALLY_CONFIRMED` → green "Location confirmed"; otherwise orange "Awaiting location check". The map placeholder is a PURE HTML/CSS stub (a bordered/greyed card with a centred pin SVG from `@/lib/icons`, e.g. `MapPin`), ZERO network calls, NO map library, NO tiles, NO provider (per screenshot 03, which shows a static greyed map region with a decorative pin, no zoom/controls). NO lat/lng shown, NO pin-drop, NO Google call. Prototype copy: "Worked out from the address. You did not enter coordinates." The "placeholder needs a provider" stop-and-report only fires IF a future requirement demands a live map; PR-1 ships the static stub.
- **UI states:** confirmed; awaiting-check banner (prototype 07 copy: "We are checking the exact spot ... Nothing for you to do."). A disabled "Update location / find your business" affordance (locked, PR-6).
- **Owner vs BM:** read-only for both; the locked lookup affordance shows for owner (disabled).
- **Tests first:** badge maps from locationConfidence (confirmed vs awaiting); no lat/lng rendered; no network call to Google; locked affordance disabled.
- **Stop-and-report:** if rendering the placeholder needs a provider/key (it must not in PR-1).
- **Rollback:** delete component.

### F10: Opening hours (read-only)

- **Files:** `components/branches/sections/OpeningHoursCard.tsx`; tests.
- **Endpoints + fields:** read `branch.openingHours[]` (single window/day). Render the day/time table read-only; "Closed" days. Use `lib/branches/openNow.ts` for the open-now/Today derivation only.
- **UI states:** read-only day/time table (incl. "Closed" days). The Edit control is a LOCKED disabled affordance (PR-4). Multi-window is a locked affordance (PR-8). OMIT the "2 hour customer cool off" chip entirely in PR-1: the live prototype hours section (screenshots 03/08) shows the read-only table + a disabled Edit link and does NOT show a live cool-off chip; the cool-off behaviour ships in PR-4. Do not render the chip even statically.
- **Owner vs BM:** read-only for both; locked Edit affordance shows (disabled).
- **Tests first:** renders hours read-only incl. Closed days; Edit affordance disabled + no network; cool-off chip not presented as active.
- **Stop-and-report:** none.
- **Rollback:** delete component.

### F11: Branding + photos display rules

- **Files:** `components/branches/sections/BrandingPhotosCard.tsx`; tests.
- **Endpoints + fields:** display `logoUrl` (the branch logo mark, shown in the small cream/peach logo box per screenshots 05/06/09) + `bannerUrl` (the hero/banner image behind the header) + `photos[]` (the gallery, with approved/pending state). Logo/banner EDITS go through F7's reviewed edit-request (they are SENSITIVE and apply via the allow-list today); F11 itself renders them but routes any edit into the F7 modal. Photo GALLERY add/replace/remove is DISPLAY-ONLY in PR-1: render the grid + per-photo approved/in-review state markers + an in-review counter (from `pendingEdits` where `includesPhotos`) read-only; the "Add photo"/"Add a new banner" controls are LOCKED disabled affordances (PR-3); do NOT call `requestBranchPhotoEdit`.
- **UI states:** logo/banner display; photo grid (approved/pending markers); disabled "Add more"; in-review counter.
- **Owner vs BM:** logo/banner edit via F7 owner-only; photo controls disabled for all (PR-3).
- **Tests first:** photos render read-only with state markers; "Add photo" disabled + no `requestBranchPhotoEdit` call; logo/banner edit routes into the F7 modal.
- **Stop-and-report:** if the prototype implies functional photo submission is required in this first surface (it is PR-3): report rather than wire it.
- **Rollback:** delete component.

### F12: Staff-at-branch display (BOTH endpoints, owner-only)

- **Files:** `components/branches/sections/StaffAtBranchCard.tsx`; `components/branches/StaffPills.tsx`; possibly edit `components/staff/StaffTable.tsx`; tests.
- **Endpoints + fields:** `useStaff()` (`GET /staff`) + `useBranchAppUsers()` (`GET /staff/app-users`), both owner-gated. Filter to this branch: portal members = `members.filter(m => m.allBranches || m.branchIds.includes(branchId))`; app users = the `branches` group with `branchId===id` (or flat-filter `users[].branchId===id`).
- **Pill/role rendering (reconciled prototype + spec):** reuse the EXISTING pill primitives from `components/staff/StaffTable.tsx` (the established Staff & Access table) BUT render the umbrella-spec-approved access labels EXACTLY: a portal member shows their colour-coded role chip (`RoleChip(ROLE_LABEL[role])`: OWNER=red, BRANCH_MANAGER=navy, STAFF=teal) PLUS an `AccessPill` labelled **"Portal + app"**, and an Invited/Pending marker when `claimed===false`; an app-only `BranchUser` shows an "App user" role chip PLUS an `AccessPill` labelled **"App access"**. (These exact labels match the umbrella spec / owner screenshots; note the StaffTable's own `RoleAccessCell` uses the shorter "Portal"/"App" copy on the separate Staff surface, so F12 passes the longer approved label strings to the shared `AccessPill` rather than reusing `RoleAccessCell` verbatim.) This satisfies the prototype's role-coloured pills (screenshots 05/06/09) AND the spec requirement to distinguish portal vs app-only staff with the approved copy. Show name + status; NEVER expose passwordHash/PIN/phone. Email-correlation de-dup is DISPLAY-ONLY (do not merge identities). Extract `AccessPill`/`RoleChip` into `components/branches/StaffPills.tsx` so F12 can pass its own labels; if extraction risks the Staff surface, duplicate the small styled spans and note it.
- **UI states:** owner: rendered list with pills + "Assign or manage staff" cross-link (routes to the existing Staff & Access surface, owner-gated). BM/non-owner: the whole panel does NOT render (the staff queries 403). Loading/empty.
- **Owner vs BM:** owner-only (this query also provides the `isOwner` signal in §1.5).
- **Tests first:** portal + app users merged + filtered by branchId; pills render the EXACT approved labels: portal members show a "Portal + app" access pill, app-only users show an "App access" access pill (assert the literal strings); `allBranches` member shows at every branch; non-owner (staff 403) → panel hidden + `isOwner=false`; no secret fields rendered.
- **Stop-and-report:** if staff-at-branch must be made BM-visible (do NOT relax `assertOwner`; that is a PR-2 decision).
- **Rollback:** delete the card; revert StaffTable import if extraction was done.

### F13: Disabled affordances + copy

- **Files:** `components/branches/LockedAffordance.tsx`; `components/shell/navItems.ts` (wire `/branches`); wiring across F2/F3/F9/F10/F11.
- **Behaviour:** a shared disabled control rendering the prototype label + a "Coming in this Branches rollout" tooltip/subtext, performing NO network write. Applied to: Add branch (F2), Close branch (F3/detail close section), Opening-hours Edit + Multi-window (F10), Redemption alerts (F3 detail), Live map / business-lookup (F9). Redemption alerts: the card is ALWAYS VISIBLE with ALL its controls disabled (prototype 04 shows the alerts card; do NOT hide the whole card) so the UI matches the prototype while performing no behaviour. Nav: change Branches `href` `#` → `/branches`.
- **UI states:** disabled (visually present, non-interactive or tooltip-only).
- **Owner vs BM:** disabled for all.
- **Tests first:** each locked affordance renders disabled and fires no network call; nav routes to /branches.
- **Stop-and-report:** if any locked affordance cannot be rendered disabled without implying it works.
- **Rollback:** revert nav href; delete component.

### F14: Tests, accessibility, responsive, prototype-fidelity QA

- **Files:** the `__tests__/` across F1-F13; a prototype-fidelity QA checklist appended to this plan's review notes.
- **Coverage:** unit + integration per task (above); `lib/branches/openNow.ts` parity test against the backend `isOpenNow` cases (Europe/London, cross-midnight as currently behaves, Closed days); the With-Redeemo merchant-lifecycle guard; the PIN-never-rendered invariant; the owner-vs-BM gating across all write controls; every locked affordance disabled.
- **A11y:** labels paired with inputs; `role="alert"` on errors; dialog focus-trap (reuse `@/components/ui/dialog`); buttons have accessible names; status pills not colour-only (text label too).
- **Responsive:** verify at the shell's NARROW breakpoint (820px): overview table + detail cards reflow; no horizontal scroll.
- **Prototype-fidelity QA:** map each rendered surface to its screenshot (01-12) and confirm copy/labels/states match (see §4 cross-check).
- **Owner vs BM:** tests assert BM read-only across the board.
- **Stop-and-report:** any fidelity gap vs a screenshot that is not an approved deferral.

---

## 4. Cross-check table (prototype/feature → code → task → status → tests → stop-and-report)

| Prototype (screenshot) / feature | Existing code / endpoint | PR-1 task | Status | Test coverage | Stop-and-report |
|---|---|---|---|---|---|
| Overview summary cards + list (01,12) | `GET /branches` + `lib/api/branch.ts` | F2 | Included | cards+rows+nav+empty+error | openingHours absent from list |
| With-Redeemo count (01) | `isActive`+`locationConfidence` on list + `lib/auth/lifecycle.ts` over `useMerchantProfile()` | F2 + `withRedeemo.ts` | Included | count + guard 0 when `profile.status !== 'ACTIVE'` | merchant lifecycle not on branch payload (use profile `status==='ACTIVE'`, NOT `'APPROVED'`) |
| Open right now (01) | `openingHours` on list | F2 + `openNow.ts` | Included | openNow parity vs backend | n/a |
| Setup PIN set/not-set (01) | `redemptionPin != null` on list | F2 | Included | indicator without value | never render encrypted pin |
| Detail header + hero + sub-brand + status (02,07) | `GET /branches/:id` | F3 | Included | header + banners + not-found | n/a |
| Review-state banners (07) | `pendingEdits[]`, `locationConfidence` | F3/F9/F11 | Included | banner conditions | n/a |
| Contact instant-save (03,08) | `PATCH /branches/:id` DIRECT (phone/email/website only) | F4 | Included (owner-only) | owner edit + BM read-only | a contact field maps to a SENSITIVE field (it must not; isActive is NOT a contact control) |
| Amenities (04) | catalogue `GET /customer/categories/:id/amenities` + `POST .../amenities` | F5 | Included (owner-only) | catalogue + toggle + missing category | primaryCategoryId missing |
| Redemption PIN reveal/change/send (04,08) | `GET/PUT/POST .../pin` | F6 | Included (owner-only) | reveal-on-demand + change + send | reading pin from list |
| Branch-details edit modal + pending + withdraw (07,11) | `POST/GET/DELETE .../edit-request[s]` | F7 | Included (owner-only) | submit SENSITIVE + pending + withdraw + 409 | field outside SENSITIVE_FIELDS |
| Set main branch (02,07) | `PATCH isMainBranch:true` | F8 | Included (owner-only) | badge vs action + PATCH | n/a |
| Location card + badge (03,07) | `locationConfidence` | F9 | Included (read-only) | badge mapping + no lat/lng/no Google | placeholder needs provider |
| Opening hours (03,08) | `openingHours[]` | F10 | Included (read-only) | read-only + cool-off-not-active | n/a |
| Branding/logo/banner (05) | `logoUrl`/`bannerUrl` via F7 | F11 | Included (edit via F7) | logo/banner edit routes to F7 | n/a |
| Photo gallery (05,06,09) | `photos[]` (display) | F11 | Display-only | read-only + add disabled | functional photo submit required |
| Staff at branch (05,06,09) | `GET /staff` + `/staff/app-users` | F12 | Included (owner-only) | merge+filter+pills+secrets | must be BM-visible (PR-2) |
| Add branch CTA (01) | `POST /branches` (createBranch exists) | F13 | DISABLED affordance | disabled + no call | n/a |
| Close branch + modal (06,09,10) | `DELETE /branches/:id` | F13 | DISABLED affordance | disabled + no call | n/a |
| Opening-hours Edit (03,08) | `POST .../hours` | F13 | DISABLED affordance | disabled + no call | n/a |
| Multi-window hours | (PR-8) | F13 | DISABLED affordance | disabled | n/a |
| Redemption alerts card (04) | (PR-7) | F13 | DISABLED affordance | whole card disabled + no call | n/a |
| Live map / business lookup (03) | (PR-6, Google) | F13 | DISABLED affordance | disabled + no Google call | n/a |
| Persistent topbar (Validate a code / status / View-Owner) | existing shell | n/a | Out of Branches scope | n/a | n/a |

No unmapped prototype element remains (the inventory pass found none).

---

## 5. Known deferred but NOT dropped (PR-2 to PR-8)

These are locked in the umbrella spec; PR-1 must leave each as a disabled affordance or read-only, never half-wired:
- **PR-2** Branch-Manager scoped writes: migrate classified write routes to `resolveMerchantContext` + `assertBranchAllowed`; turn PR-1's owner-only-hidden controls into BM-usable for assigned branches.
- **PR-3** Photos review lane: close `EDIT_PHOTO_APPLY_NOT_SUPPORTED`; photo gallery add=review / remove=instant.
- **PR-4** Hours 2h cool-off: durable staging table + delayed promotion; the "2 hour customer cool off" chip becomes live here.
- **PR-5** Add/close branch lifecycle: status-on-Branch + AdminApproval; customer exclusion (feeds AND branch picker).
- **PR-6** Google Places lookup: merchant Text Search → autofill → `ADDRESS_GEOCODED`; mini-spec, brainstorm-first.
- **PR-7** Redemption alerts: per-branch toggle + producer on validation; recipient model deferred (owner decision).
- **PR-8** Multi-window hours: shared platform slice (onboarding + day-2 + customer reads + migration + cross-midnight fix).

---

## 6. Security invariants (must hold in PR-1)

1. Branch Managers are READ-ONLY in PR-1; no write controls render for them (owner-only writes; BM-scoping is PR-2). Do not relax any owner gate.
2. Owner-only write controls (contact, amenities, PIN, set-main, edit-request, withdraw) gate on `isOwner` (§1.5); the backend owner-only resolver is the real boundary.
3. Never render, cache, log, or extract the AES-encrypted `redemptionPin` shipped on the list payload, even though it is encrypted (an exfiltrated ciphertext is a latent risk if a key is ever exposed). Derive ONLY PIN set/not-set from its presence/null-ness; the decrypted value is fetched only on explicit reveal in F6 via `GET /branches/:id/pin`.
4. The decrypted PIN comes only from `GET /branches/:id/pin` on explicit reveal; never a per-row list fetch (no N+1).
5. Locked affordances are visually present but perform NO network write.
6. No lat/lng shown, no Google call, no pin placement (F9 placeholder only).
7. Photo gallery add/remove disabled until PR-3; do not call `requestBranchPhotoEdit` in PR-1.
8. Opening-hours edit disabled until PR-4.
9. Staff-at-branch never exposes passwordHash/PIN/phone; portal + app identities are not merged.

---

## 7. Verification commands + review workflow

Run from `apps/merchant-web` (Node 24 toolchain):
- `npm run typecheck` (or `npx tsc --noEmit`): clean.
- `npm run lint`: clean.
- `npm run build`: succeeds.
- `npx jest` (full) and focused: `npx jest branches` + `npx jest lib/api/__tests__/branch` + `npx jest lib/branches`.
- Capture ALL warnings/errors (console, act(), React warnings) and resolve or record them; a non-failing warning must be explained.

Review workflow (per subagent-driven-development):
- Fresh implementer per task (F1 first; F1 is the dependency for F2-F13).
- After each task: spec-compliance review (matches THIS plan + the umbrella spec) then code-quality review; fix loops until both pass.
- Fresh adversarial reviewer per PR checkpoint with this checklist: (a) scope: nothing from PR-2..PR-8 wired; (b) owner-only writes + BM read-only enforced in UI and not bypassing backend; (c) PIN value never rendered; (d) no Google call / no lat-lng; (e) prototype-fidelity vs screenshots 01-12; (f) no backend/schema/admin/customer files touched; (g) tests-first present and green; (h) dash/style scan clean (no em/en-dashes, real brand tokens, no emojis).
- Prototype screenshot review checklist: open each of 01-12 beside the rendered surface; confirm copy/labels/states; record any deviation as a fidelity finding or an approved deferral.
- SHA-bound PR gate: open the PR only when reviewed + green; never merge without explicit owner approval bound to the exact head SHA (`REDEEMO_PR_SCOPE_VERIFIED=<head-sha>` per the git-safety hook); verify the live `gh api compare` file list before any merge.
- Update the active checklist + memory baseline at the PR gate; record warnings/baselines discovered.

---

## 8. Open questions / assumptions to confirm before/at implementation

1. **Owner-capability signal (§1.5): DECIDED for PR-1 (owner confirm welcome):** PR-1 derives `isOwner` from the owner-gated `GET /staff` success on the detail page (the established merchant-web pattern; backend 403 is the real boundary). A role-in-session signal is a future improvement, deferred. This is the locked PR-1 decision, not a blocker; flagged for owner/Codex visibility.
2. **`isActive` placement (F4): RESOLVED:** the prototype Contact card (screenshots 02/03/07) shows only phone/email/website; the active/closed state is the read-only header status pill. PR-1 exposes NO `isActive` toggle; deactivation/close is the PR-5 lifecycle. No open question remains.
3. **`primaryCategoryId` (F5):** confirm it is populated on the merchant profile so the amenity catalogue loads; if absent, that is an onboarding-data gap (stop-and-report, not a PR-1 fix).
4. **Detail data source:** PR-1 adds `getBranch(id)` so the detail page deep-links/refreshes correctly; confirm acceptable vs deriving detail from the list cache only.
5. **StaffPills extraction (F12):** confirm extracting `AccessPill`/`RoleChip` from `StaffTable.tsx` into a shared file (vs duplicating the small styled spans). Extraction touches one Staff file; if that risks the Staff surface, duplicate instead.
6. **Backend `redemptionPin`-on-list hardening:** tracked as a non-PR-1 follow-up (umbrella spec §11). PR-1 only ensures the value is never rendered/logged.

Programme-wide stop-and-report triggers from the umbrella spec §10 apply (any unanticipated schema, a no-schema slice needing schema, a missing prototype-required field, a locked affordance pressured to be enabled early, any security invariant weakened).

---

## 9. Checklist discipline

Maintain the active checklist with: spec approved (PR #307); this plan in review; the F1-F14 task states; the open assumptions in §8; the deferred PR-2..PR-8 items (§5); the stop-and-report triggers; and any warnings/baselines discovered during planning or implementation. Update at each task completion and at the PR gate.

---

## 10. Self-review

A fresh 5-lens adversarial review was run on this plan (spec-fidelity, scope-discipline, anchor-accuracy, background-implementability, prototype-fidelity). Verdicts: spec-fidelity PASS; scope-discipline PASS; anchor-accuracy PASS; prototype-fidelity PASS; background-implementability FAIL (5 must-fix + 4 should-fix) on a first pass because F1 lacked concrete code and two signals were left open. All must-fix and clearly-correct should-fix/nit findings were then integrated (each verified against live code where needed: `PendingEditStatus` enum, `ApprovalStatus` values, `useSession().approvalStatus`, the prototype Contact/hours/staff treatments):

- F1 made concrete: exact `branchPendingEditSchema` (with the verified `PendingEditStatus` enum + a typed `proposedChanges` bag), `isMainBranch?` added to `BranchUpdateBody`, exact return types for `getBranch`/`createBranchEditRequest`/`listBranchEditRequests`/`withdrawBranchEditRequest`/`sendBranchPin`, hook list, and added schema-rejection + return-shape tests.
- With-Redeemo lifecycle guard: nominated ONE canonical source: `lib/auth/lifecycle.ts` (`deriveStatusPill`/`homeFor`) over `useMerchantProfile()`; Live iff `profile.status === 'ACTIVE'`; otherwise the count is 0. (Corrected in the Codex round below: the earlier `approvalStatus === 'APPROVED'` was wrong.)

### Codex review round (PR #308): 2 plan fixes integrated

Codex reviewed the plan (scope confirmed clean) and flagged two errors, both verified against live code and patched:
1. **P1 (With-Redeemo lifecycle value):** the session's `approvalStatus` field is populated from `Merchant.status` (the `MerchantStatus` enum `REGISTERED|PENDING_APPROVAL|ACTIVE|INACTIVE|SUSPENDED|DELETED`), NOT the `ApprovalStatus` enum (evidence: `src/api/auth/merchant/service.ts` `approvalStatus: merchantInfo.status`; `apps/merchant-web/lib/auth/lifecycle.ts` derives live from `status === 'ACTIVE'`). The guard now uses the canonical `lib/auth/lifecycle.ts` helper over `useMerchantProfile()` with the `status === 'ACTIVE'` predicate (never `'APPROVED'`); §1.1 naming-trap note, F2 summary-cards, F2 tests, and the §4 cross-check row all updated.
2. **P2 (staff pill copy):** F12 now renders the exact umbrella-spec-approved access labels "Portal + app" (portal members) and "App access" (app-only users), passing those label strings to the shared `AccessPill` (the StaffTable's own `RoleAccessCell` uses shorter "Portal"/"App" copy on the separate Staff surface). F12 tests assert the literal strings.
- Owner-capability: DECIDED (not open) as the staff-403-derived `isOwner` with an explicit execution sequence (F1 -> F2 -> F3 -> F12 -> F4..F8); a role-in-session signal stays a deferred future improvement.
- `isActive` RESOLVED: not a Contact control; read-only header status pill; F4 sends phone/email/website only.
- F5 missing-`primaryCategoryId` fallback state specified; F7 postcode-error UX + SENSITIVE-field confirmation specified; F9 map = pure HTML/CSS stub (zero network); F10 cool-off chip omitted entirely; F11 logo-vs-banner semantics; F12 pills reconciled via the existing `RoleAccessCell` (role chip + Portal/App access pill, satisfying both prototype and spec); F13 redemption-alerts card visible-but-disabled; F3 banner copy bound to screenshot 07; §7 encrypted-PIN rationale added.

Prototype-fidelity lens confirmed no unmapped element and the cross-check table matches screenshots 01-12. Anchor-accuracy lens confirmed the live-code anchors (branch.ts current state, backend routes, staff endpoints, isOpenNow source, design-system paths, nav href). No finding contradicted the umbrella spec or a locked decision.

Verdict: with the integrations above, the plan is concrete, scope-clean, prototype-faithful, and safe for a low-owner-input background implementation of PR-1. Ready for owner + Codex review. No implementation until both approve.
