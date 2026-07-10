# Admin Prototype → Code Mapping

Verified against worktree `.worktrees/admin-proto-assets` @ `5f4f7792` (past d99305e2). Read-only build-planning analysis.

Key backend admin surface: `src/api/admin/{plugin,capability,approvals,merchants,branches,notifications,timeline,redemptions}`. Frontend: `apps/admin-web/app/(app)/{queue,merchants,redemptions}`, feature dirs `apps/admin-web/features/{shared,merchants,review,queue,timeline}`, hooks `apps/admin-web/lib/{merchants,queue,review,redemptions,timeline,notifications,api,auth}`.

All admin data routes are registered under a scoped plugin that applies `authenticateAdmin`; each route additionally gates on `requireAdminCapability(cap)`. Two-layer gating (UI capability mirror + backend 403) is mandatory per `.claude/rules/admin-web.md`.

---

## 1. MERCHANT 360 — tab-by-tab

### What `GET /api/v1/admin/merchants/:id` returns TODAY (`getMerchantDetail`, service.ts:105)
Response shape `{ merchant, branches }`:
- **merchant**: `id, businessName, tradingName, status, verificationStatus, onboardingStep, websiteUrl, vatNumber, companyNumber, primaryCategoryId, description, logoUrl, category (name), categoryLocked, hasPendingIdentityEdit, submitChecklist{branch_created,contract_signed,rmv_configured,all_complete}, canSubmitOnBehalf`
- **branches[]** (deletedAt:null, main-first): `id, name, isMainBranch, addressLine1, addressLine2, city, postcode, localityName, locationConfidence, phone, email, websiteUrl, isActive` (redemptionPin NEVER selected)
- NOT returned here: `bannerUrl`, `contractStartDate/EndDate`, `createdAt`, owner contact, documents, vouchers, timeline. (Some of these ARE in `getReviewContext` — see below.)

### Tab map

| Tab | (a) Existing FE reuse | (b) Existing backend read | (c) Missing backend read | (d) New capability |
|---|---|---|---|---|
| **Overview** | merchants/[id]/page.tsx header + status/verification badge helpers; `useMerchantDetail` | `GET /merchants/:id` (status, verification, onboardingStep, submitChecklist, canSubmitOnBehalf) | Overview KPIs (branch count, voucher count, redemptions-this-cycle, contract dates) not aggregated in one read | none (additive read) |
| **Profile / Identity** | EditMerchantWebsiteDialog, EditMerchantIdentityDialog, EditCategoryDialog, ProposeMerchantEditDialog | `GET /merchants/:id` returns websiteUrl/vat/company/category/description/logoUrl | `bannerUrl` + contract dates absent from detail read (present in getReviewContext) | edits: `merchant:edit`, `merchant:edit-identity`, `merchant:edit-category`, `merchant:propose-edit` (all exist) |
| **Branches** | branches list in page.tsx; AddBranchDialog, EditBranchDialog, DeleteBranchConfirm; LocationProvenanceBadge; `branch:confirm-location` flow + Slice-2 LocationTrustPanel (in review router) | branches[] in `GET /merchants/:id`; `POST /merchants/:id/branches`, `PATCH /branches/:branchId`, `POST /branches/:branchId/delete`, `POST /branches/:id/confirm-location` | branch-level redemptions summary; branch opening hours (`BranchOpeningHours`) not in admin read; branch photos not exposed | `merchant:manage-branches`, `branch:confirm-location` (exist) |
| **Vouchers** | `listAdminRmvVouchers` hook territory (RMV co-build) | `GET /merchants/:id/vouchers/rmv` (RMV only: id,code,title,type,estimatedSaving,status,approvalStatus,merchantFields,allowedFields) | **MISSING: admin list of CUSTOM (RCV) vouchers.** Only RMVs are readable by admin today. `getReviewContext` returns ALL vouchers but is approval-scoped, not merchant-scoped | RMV edit/submit = `merchant:manage-vouchers` (exists, wired). Custom-voucher CRUD flagged in capability.ts as a SEPARATE higher-bar cap (B5.2, not built) |
| **Redemptions (merchant-scoped)** | redemptions page + `lib/redemptions` hook + row formatter | **YES: `GET /admin/redemptions?merchantId=<id>` works today** (D67; also branchId/status/code/voucherType/from/to/sort/includeTest filters). Confirmed in redemptions/service.ts:35 | none — filter already supported; just needs a merchant-scoped view/embed | `redemption:read` (exists) |
| **Documents** | MerchantDocumentsCard | `GET /merchants/:id/documents` (presigned, available:false degrade); `POST .../documents`, `POST .../documents/:id/delete` | none | view=`merchant:read`; manage=`merchant:manage-documents` (exist) |
| **Timeline / Activity** | features/timeline/* + `lib/timeline` | `GET /merchants/:id/timeline` (M7: merged AuditLog actions + OWNER lifecycle emails w/ delivery state; payload/PIN never selected) | none | `approval:read` (exists) |
| **Agreement / Compliance** | — (no dedicated component) | contractStatus in getMerchantDetail; contractStartDate/EndDate + companyNumber/vatNumber in getReviewContext | contract dates + `MerchantContract` (signedAt, tcVersion, signatureMethod, zohoSignRequestId) NOT exposed in any merchant-scoped admin read | none (additive read) |
| **Staff** | — (none) | — **NONE.** No admin read of `BranchUser` exists anywhere | **MISSING: admin BranchUser list read** (staff@branch: firstName/lastName/email/jobTitle/status/lastLoginAt; never passwordHash) | likely new `merchant:read` or a `branch:manage-staff` cap if mutating |
| **Notes** | — (none) | — **NONE.** Confirmed: no `MerchantNote` model in schema | **MISSING: MerchantNote model + read/write routes** | new cap (e.g. `merchant:notes`) + SCHEMA |
| **Insights-lite** | — (none) | Redemptions list can be counted; no aggregation endpoint | **MISSING: merchant insights aggregation** (analytics gap already noted in memory: Merchant Portal analytics aggregation is the known gap) | none for read; must honor isTestData-exclusion rule for analytics |

**Owner contact** (name/email/phone) is available via `getMerchantOwner` / getReviewContext but NOT in getMerchantDetail — a 360 overview would want it added to the detail read.

---

## 2. APPROVAL QUEUE

### What exists today
- **Queue list** `GET /admin/approvals` (`listApprovals`, service.ts:80) — filters: `type, status, claimedById, referenceId, olderThanMinutes, page, pageSize`. Ordered `submittedAt asc`.
- **Per-type row enrichment already delivered** (per row in the page):
  - `MERCHANT_ONBOARDING`: `merchant{id,businessName,status,onboardingStep,verificationStatus,contractStatus}`
  - `VOUCHER`: `voucher{title,type,status,approvalStatus}` + `merchant{id,businessName,status}` + `goLiveHint('live-now'|'waiting-for-go-live')`
  - `VOUCHER_EDIT`: `voucherEditKind('CHANGE'|'END')`
  - all rows: `claimedBy{id,name}` (batch-resolved AdminUser name)
  - edit lanes (MERCHANT_IDENTITY_EDIT / BRANCH_IDENTITY_EDIT / BRANCH_CREATE / BRANCH_CLOSE): `merchant:null, claimedBy` only (no enrichment)
- **Review router** — 5 lanes with per-type detail reads + actions, all live:
  - onboarding: `/:id/review` (getReviewContext) + `/claim /release /request-changes /reject /approve`
  - edit: `/:id/edit-review` + `/approve-edit /reject-edit` (`approval:apply-edit`)
  - branch lifecycle: `/:id/branch-lifecycle-review` + `/approve-branch-lifecycle /reject-branch-lifecycle`
  - voucher: `/:id/voucher-review` + `/approve-voucher /reject-voucher /request-voucher-changes`
- **Claim-to-act model**: single-winner conditional claim (`updateMany where claimedById:null status:PENDING`); claimed-by-other → read-only; claimer-or-SUPER_ADMIN release. This is the queue's concurrency control.

### vs prototype two-court (Needs-you / Awaiting-merchant)
The two courts are **derivable from existing data WITHOUT schema**:
- "Needs-you" = `status PENDING` (+ optionally claimedById == me OR unclaimed)
- "Awaiting-merchant" = `status CHANGES_REQUESTED` (merchant has been asked for changes; onboardingStep NEEDS_CHANGES)
- Both statuses already filterable via `listApprovals`. A two-court UI is a pure-frontend regrouping of the current list plus possibly one added filter (`claimedById=me`).

### D59 assign-then-claim — CONFIRMED NO SCHEMA SUPPORT
`AdminApproval` (schema.prisma:1716) has `adminUserId` (actioner), `claimedById`, `claimedAt`, `lastStaleAlertAt`. **NO `assignedToId` / `assignedById` / `assignedAt` fields.** True assignment (assign a queue item to a rep before they claim) needs a SCHEMA migration. Claim (self-service pickup) is the only ownership primitive today.

### Fidelity split
- **WITHOUT schema**: two-court grouping; per-type row treatments (icons/labels/color per ApprovalType — data already on the row); "assigned to me" view via `claimedById=me` filter; urgency from `submittedAt`/`olderThanMinutes`; queue-age chips. Add missing enrichment for edit/branch lanes (a merchant-summary batch like the onboarding/voucher batches — additive read, no schema).
- **WITH schema**: real assign-then-claim (D59) needs `assignedToId/assignedById/assignedAt` on AdminApproval + assign/unassign routes + a new `approval:assign` capability.

---

## 3. LEADS & ONBOARDING

### CONFIRMED: no lead/prospect model
Grep of `prisma/schema.prisma` for `lead|prospect|MerchantNote|assignedTo|nextAction` returned **zero matches**. There is no lead pipeline anywhere in schema or backend.

### Create-draft + claim path (end-to-end, exists today)
- **`POST /admin/merchants`** (`createMerchantDraft`, service.ts:311, cap `merchant:create-draft`): one tx creates Merchant(status REGISTERED), owner MerchantAdmin (no password, `mustChangePassword:true`), OWNER MerchantMembership, + audit rows. Returns `{merchantId, ownerAdminId, ownerEmail, passwordSetupRequired:true}`. Admin never gets a password/token.
- **Claim token flow** (`issueMerchantClaim`, auth/merchant/service.ts:668): Redis-backed, **7-day TTL** (`CLAIM_TTL = 7*24*3600`), keys `merchantClaim(token)`→adminId + `merchantClaimCurrent(adminId)`→token; single-use (reuse → `CLAIM_TOKEN_EXPIRED`); completing writes `MERCHANT_CLAIM_COMPLETED` audit. Fired best-effort after draft POST (draft survives claim-email failure). Frontend: `apps/admin-web/app/(app)/merchants/new/page.tsx`.

### Assisted-onboarding wizard — how Option-B wrapped merchant caps for on-behalf use (all live)
The wizard can drive a rep-created merchant to go-live entirely from admin, reusing the SAME cores as the merchant portal (no weaker path):
- Profile: `PATCH /merchants/:id/profile` (websiteUrl, `merchant:edit`); `PATCH /merchants/:id/identity` (vat/company, `merchant:edit-identity`); `PATCH /merchants/:id/category` (`merchant:edit-category`); `POST /merchants/:id/edit-request` (sensitive text → B1 pending-edit lane, `merchant:propose-edit`)
- Branches: `POST /merchants/:id/branches` (`merchant:manage-branches`); `PATCH /branches/:branchId`; `POST /branches/:branchId/delete`; `POST /branches/:id/confirm-location` (`branch:confirm-location`)
- Documents: `POST /merchants/:id/documents` + `/delete` (`merchant:manage-documents`)
- RMV vouchers: `GET/PATCH/POST .../vouchers/rmv[/submit]` (`merchant:manage-vouchers`)
- Submit: `POST /merchants/:id/submit` (`merchant:submit`) — reuses live submit core + onboarding checklist
- Approve/go-live stays separate `approval:action` (separation of duties)

**Gap for "rep fully manages a merchant who never touches the portal":** contract signing is merchant-portal-only (no admin contract-sign route; an unsigned merchant fails `ONBOARDING_GATES_INCOMPLETE` on submit) and RMV custom-voucher creation (B5.2) is unbuilt. These are the two blockers to 100% admin-side onboarding.

### Proposed MINIMAL MerchantLead model — OWNER-GATED, Tier 3
```
model MerchantLead {
  id                String   @id @default(uuid())
  businessName      String
  categoryGuess     String?          // free text or Category id
  locationHint      String?          // postcode / city
  contactName       String?
  contactEmail      String?
  contactPhone      String?
  source            String?          // referral / inbound / event / cold
  stage             LeadStage @default(NEW)  // NEW→CONTACTED→QUALIFIED→ONBOARDING→WON→LOST
  nextAction        String?
  dueDate           DateTime?
  assignedRepId     String?          // AdminUser id (no FK to keep additive)
  lostReason        String?
  convertedMerchantId String?        // set when create-draft fires from this lead
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt
  @@index([stage]) @@index([assignedRepId]) @@index([dueDate])
}
```
Requires new caps (`lead:read`, `lead:manage`) + routes. **Tier 3 (schema + new contract); brainstorm→spec→plan before build.** Convert = write `convertedMerchantId` then call existing `createMerchantDraft`.

---

## 4. IA / NAV

### Current `NAV_ITEMS` (admin-shell.tsx:37)
```
Approval queue  /queue        approval:read
Merchants       /merchants    merchant:read
Redemptions     /redemptions  redemption:read
```
Flat, capability-filtered (`can(cap)`), fail-closed.

### Minimal restructure (keeps every existing route working; no unbuilt modules)
Group into sections without moving files (Next routes stay at `/queue`, `/merchants`, `/redemptions`, `/merchants/[id]`, `/merchants/new`):
- **Work**: Approval queue (`/queue`)
- **Merchants**: Directory (`/merchants`), New merchant (`/merchants/new`)
- **Operations**: Redemptions (`/redemptions`)
- **(future, gated-off until built)**: Leads (`/leads`) — only render when a `lead:read` cap exists
Merchant 360 tabs live UNDER `/merchants/[id]` (sub-nav within the page, not top nav). No redirects needed; if the prototype renames a path, add a Next `redirect()` alias rather than moving the route. Nav grouping is a pure `NAV_ITEMS` shape change (add optional `section` field) — frontend only.

---

## 5. RISK / SEQUENCE

### Bucketed
**(a) Pure-frontend (ship first, no backend):**
- Merchant 360 shell + tabs over existing `/merchants/[id]` reusing getMerchantDetail + timeline + documents + RMV + redemptions(merchantId) reads already live
- Approval Queue two-court regrouping + per-type row treatments (data already on rows)
- Nav grouping (NAV_ITEMS section field)
- Merchant-scoped redemptions view = embed `/admin/redemptions?merchantId=` (route exists)

**(b) Additive backend reads (no schema):**
- Enrich getMerchantDetail with owner contact + contract dates + bannerUrl + branch/voucher/redemption counts (overview KPIs)
- Admin CUSTOM-voucher list read (extend beyond RMV-only)
- Admin BranchUser (staff) list read
- Merchant insights-lite aggregation (respect isTestData exclusion)
- Edit/branch-lane queue row enrichment (merchant summary batch)
- Merchant-scoped agreement/compliance read (MerchantContract fields)

**(c) Schema-needing (Tier 3, owner-gated):**
- `MerchantNote` model (Notes tab)
- `MerchantLead` model + LeadStage enum (Leads pipeline)
- `AdminApproval.assignedToId/assignedById/assignedAt` (D59 true assignment)
- Admin contract-signing path (to fully onboard a portal-less merchant) — may be schema-light but is a new merchant-lifecycle contract → Tier 3
- Custom-voucher-CRUD-on-behalf capability (B5.2)

### Merchant 360 slice sequence (schema-free first)
1. 360 shell + Overview/Profile/Branches/Documents/Timeline tabs (all reads exist) — pure FE
2. Merchant-scoped Redemptions tab (embed existing D67 route) — pure FE
3. Additive read: enrich detail (owner, contract dates, counts) → richer Overview — backend read
4. Additive read: custom-voucher list + staff list → Vouchers/Staff tabs — backend read
5. Notes tab — SCHEMA (Tier 3), last

### House test conventions (per `.claude/rules/admin-web.md` + observed)
- Jest per page/component (`__tests__` beside each in `app/**` and `features/**`); hooks tested under `lib/**/__tests__`
- Two-layer capability gating REQUIRED: UI capability mirror gate + backend `requireAdminCapability` 403; test BOTH
- Wire-pin tests: assert payloads OMIT secrets (redemptionPin, CommunicationLog.payload, raw R2 keys, MerchantAdmin passwords) — pattern already in reviewBranchSelect/timeline tests
- `next build` is MANDATORY for admin-web PRs (catches Next15 errors tsc/lint/jest miss — see memory `feedback_admin_web_next_build_verification`)
- Backend: `npm run test:unit` is the CI lane; don't run full vitest casually (mutates shared Neon)
