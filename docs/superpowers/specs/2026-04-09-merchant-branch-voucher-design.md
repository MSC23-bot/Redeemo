# Phase 2C: Merchant, Branch & Voucher API Design

**Date:** 2026-04-09
**Phase:** 2C — Merchant + Branch + Voucher CRUD
**Depends on:** Phase 2B (Auth API — `authenticateMerchant` decorator)

---

## Goal

Build the complete merchant-facing management API: merchant profile management, branch CRUD, voucher lifecycle (custom and RMV), and server-enforced onboarding checklist with approval submission. All routes are authenticated via the existing `authenticateMerchant` decorator.

---

## Architecture

Four API modules following the existing `plugin.ts / routes.ts / service.ts` pattern under `src/api/merchant/`:

| Module | Prefix | Responsibility |
|---|---|---|
| `profile` | `/api/v1/merchant/profile` | Merchant account fields, sensitive edit requests |
| `onboarding` | `/api/v1/merchant/onboarding` | Checklist, contract acceptance, approval submission |
| `branch` | `/api/v1/merchant/branches` | Branch CRUD, opening hours, amenities, photo requests |
| `voucher` | `/api/v1/merchant/vouchers` | Custom voucher lifecycle + RMV lifecycle |

All four modules are registered under a single Fastify plugin that applies `authenticateMerchant` to every route.

---

## Schema Additions (require migration)

### New models

#### `MerchantPendingEdit`
```prisma
model MerchantPendingEdit {
  id              String              @id @default(uuid())
  merchantId      String              @unique          // one active edit per merchant
  proposedChanges Json                                 // partial Merchant fields
  status          PendingEditStatus   @default(PENDING)
  reviewedBy      String?                              // AdminUser.id
  reviewNote      String?
  createdAt       DateTime            @default(now())
  reviewedAt      DateTime?

  merchant        Merchant            @relation(fields: [merchantId], references: [id])
}
```

#### `BranchPendingEdit`
```prisma
model BranchPendingEdit {
  id              String              @id @default(uuid())
  branchId        String              @unique          // one active edit per branch
  merchantId      String
  proposedChanges Json                                 // partial Branch fields
  includesPhotos  Boolean             @default(false)
  status          PendingEditStatus   @default(PENDING)
  reviewedBy      String?
  reviewNote      String?
  createdAt       DateTime            @default(now())
  reviewedAt      DateTime?

  branch          Branch              @relation(fields: [branchId], references: [id])
  merchant        Merchant            @relation(fields: [merchantId], references: [id])
}
```

#### `RmvTemplate`
```prisma
model RmvTemplate {
  id                String      @id @default(uuid())
  categoryId        String                            // FK → Category
  voucherType       VoucherType
  title             String                            // template title shown to merchant
  description       String                            // template description shown to merchant
  allowedFields     Json                              // array of field names merchant may fill
  minimumSaving     Decimal     @db.Decimal(10, 2)   // floor set by Redeemo
  isActive          Boolean     @default(true)
  createdAt         DateTime    @default(now())
  updatedAt         DateTime    @updatedAt

  category          Category    @relation(fields: [categoryId], references: [id])
  vouchers          Voucher[]
}
```

### New enum

```prisma
enum PendingEditStatus {
  PENDING
  APPROVED
  REJECTED
  WITHDRAWN
}

enum OnboardingStep {
  REGISTERED
  BRANCH_ADDED
  CONTRACT_SIGNED
  RMV_CONFIGURED
  SUBMITTED
  APPROVED
  LIVE
  SUSPENDED
  NEEDS_CHANGES
}
```

### Additions to existing models

**`Merchant`:**
- `onboardingStep     OnboardingStep  @default(REGISTERED)` — convenience summary, never used as gate condition
- `primaryCategoryId  String?`        — FK → Category; triggers RMV provisioning when set
- `pendingEdit        MerchantPendingEdit?`

**`Branch`:**
- `pendingEdit     BranchPendingEdit?`

**`Voucher`:**
- `isRmv           Boolean         @default(false)`
- `rmvTemplateId   String?`        // FK → RmvTemplate
- `merchantFields  Json?`          // merchant-editable values for this RMV instance

**`AdminApproval` — new `approvalType` enum values:**
- `MERCHANT_IDENTITY_EDIT`
- `BRANCH_IDENTITY_EDIT`
- `MERCHANT_ONBOARDING` (for the submission review queue)

---

## API Surface

### Merchant Profile

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/merchant/profile` | Fetch own profile + current onboarding summary |
| `PATCH` | `/api/v1/merchant/profile` | Update non-sensitive fields immediately |
| `POST` | `/api/v1/merchant/profile/edit-request` | Propose sensitive field changes |
| `GET` | `/api/v1/merchant/profile/edit-requests` | List own pending edit requests |
| `DELETE` | `/api/v1/merchant/profile/edit-requests/:id` | Withdraw a pending edit request |

**Directly editable (no review):** `websiteUrl`, `vatNumber`, `companyNumber`

**Require pending review:** `businessName`, `tradingName`, `logoUrl`, `bannerUrl`, `description`

Reason: sensitive fields will become customer-facing (merchant directory) and governance must be established now.

---

### Onboarding

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/merchant/onboarding/checklist` | Computed checklist derived from real data |
| `GET` | `/api/v1/merchant/onboarding/contract` | Fetch current T&C text + version |
| `POST` | `/api/v1/merchant/onboarding/contract/accept` | Record contract acceptance (IP, timestamp, version) |
| `POST` | `/api/v1/merchant/onboarding/submit` | Validate all gates, set status = PENDING_APPROVAL |

**Checklist computation (source of truth — never the enum):**

```
branch_created:    branches.count(merchantId, deletedAt = null) >= 1
contract_signed:   merchant.contractStatus = SIGNED
rmv_configured:    vouchers.count(merchantId, isRmv = true, status IN [PENDING_APPROVAL, ACTIVE]) >= 2
                   // NEEDS_CHANGES does NOT count — merchant must fix and resubmit before this gate passes
```

The `onboardingStep` enum is updated as a side-effect of writes for convenience but is never read as a gate condition. All three checklist items must be true for `submit` to succeed.

---

### Branches

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/merchant/branches` | List own branches |
| `POST` | `/api/v1/merchant/branches` | Create branch (all fields permitted on creation) |
| `GET` | `/api/v1/merchant/branches/:id` | Get single branch |
| `PATCH` | `/api/v1/merchant/branches/:id` | Update non-sensitive fields immediately |
| `POST` | `/api/v1/merchant/branches/:id/edit-request` | Propose sensitive field changes |
| `GET` | `/api/v1/merchant/branches/:id/edit-requests` | List pending edit requests for branch |
| `DELETE` | `/api/v1/merchant/branches/:id/edit-requests/:editId` | Withdraw a pending branch edit |
| `POST` | `/api/v1/merchant/branches/:id/hours` | Set/replace full week opening hours (upsert) |
| `POST` | `/api/v1/merchant/branches/:id/amenities` | Set amenities list (full replace) |
| `POST` | `/api/v1/merchant/branches/:id/photos/edit-request` | Propose photo add/remove |
| `DELETE` | `/api/v1/merchant/branches/:id` | Soft delete branch |

**Directly editable:** `phone`, `email`, `websiteUrl`, `isActive`, opening hours, amenities

**Require pending review:** `name`, `about`, `addressLine1`, `addressLine2`, `city`, `postcode`, `latitude`, `longitude`, `logoUrl`, `bannerUrl`, photos (add/remove)

**Initial branch creation** may include all fields including sensitive ones. The pending review pattern applies to subsequent edits once the merchant has reached `APPROVED` status. Before approval, merchants can freely edit branch identity fields directly (changes are still visible only inside the portal, not to customers, until merchant is approved).

**Main branch rules:**
- `isMainBranch` is an administrative marker, not customer-facing
- Customers always see branches ordered by proximity
- Every merchant must have exactly one `isMainBranch = true` at all times
- First branch created is automatically main
- To change main branch: `PATCH /branches/:id` with `isMainBranch: true` atomically unsets the previous
- Main branch cannot be deleted; another must be promoted first

**Branch delete rules:**
- Soft delete only (`deletedAt` timestamp) — all history, redemptions, analytics preserved
- Cannot delete if it is the only active branch of a live (`APPROVED`) merchant
- Cannot delete if it is the main branch (promote another first)
- All `BranchUser` records for the branch are deactivated (not deleted) on soft delete
- Deleted branches are immediately invisible to customers

---

### Vouchers — Custom

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/merchant/vouchers` | List all own vouchers (all statuses) |
| `POST` | `/api/v1/merchant/vouchers` | Create custom voucher (starts as DRAFT) |
| `GET` | `/api/v1/merchant/vouchers/:id` | Get single voucher |
| `PATCH` | `/api/v1/merchant/vouchers/:id` | Edit (DRAFT or NEEDS_CHANGES only) |
| `POST` | `/api/v1/merchant/vouchers/:id/submit` | Submit for admin approval (DRAFT → PENDING_APPROVAL) |
| `DELETE` | `/api/v1/merchant/vouchers/:id` | Delete (DRAFT only) |

### Vouchers — RMV

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/v1/merchant/vouchers/rmv` | List own RMV vouchers + completion state |
| `PATCH` | `/api/v1/merchant/vouchers/rmv/:id` | Fill in merchant-editable fields only |
| `POST` | `/api/v1/merchant/vouchers/rmv/:id/submit` | Submit RMV for admin review (DRAFT → PENDING_APPROVAL) |

---

## Business Logic

### Voucher lifecycle (both custom and RMV)

```
DRAFT → (explicit submit) → PENDING_APPROVAL → (admin approves) → ACTIVE
                                              → (admin rejects)  → NEEDS_CHANGES
NEEDS_CHANGES → (merchant edits + resubmits)  → PENDING_APPROVAL
ACTIVE → (merchant deactivates or suspended)  → INACTIVE
```

- Vouchers in `DRAFT` or `PENDING_APPROVAL` are invisible to customers
- `ACTIVE` vouchers are visible only if merchant status is `APPROVED` or `LIVE`
- Merchants cannot edit a voucher that is `PENDING_APPROVAL` — must wait for admin decision
- No voucher goes live without explicit admin approval

### RMV provisioning

Triggered when merchant sets their primary category in the portal (a `PATCH /profile` action on `primaryCategoryId`, a field to be added to `Merchant`):

1. Look up active `RmvTemplate` rows for the given `categoryId`
2. Create 2 `Voucher` rows: `isRmv = true`, `status = DRAFT`, `approvalStatus = PENDING` — populated with template values. `approvalStatus` remains `PENDING` throughout the DRAFT stage and only becomes meaningful after the merchant explicitly submits. No admin review queue entry is created at provisioning time.
3. `merchantFields` starts empty — merchant fills in allowed fields before submitting

**Category change rules:**
- If any RMV voucher has been submitted (status `PENDING_APPROVAL`, `ACTIVE`, or `NEEDS_CHANGES`): category change is **blocked**. Merchant must contact Redeemo support.
- If all RMV vouchers are still `DRAFT`: category change is permitted but requires `confirm: true` in the request body. On confirmation, existing DRAFT RMV vouchers are soft-deleted and new ones are provisioned from the new category's templates. Client must present an explicit confirmation step — not silent.

### Sensitive field edit flow

1. Merchant POSTs proposed changes to `/edit-request`
2. If a `PENDING` edit already exists for that entity: API returns `409 CONFLICT` with the existing edit's ID and `createdAt`
3. Merchant must explicitly `DELETE /edit-requests/:id` (withdraw) before submitting a new one
4. Withdrawal is recorded in the audit log with `status = WITHDRAWN`
5. On new edit creation: `MerchantPendingEdit` / `BranchPendingEdit` row created with `status = PENDING`, and an `AdminApproval` row is created so it appears in the admin queue
6. Live data is not changed — customers see current approved data throughout
7. On admin approval: proposed changes are applied to the live record, `status = APPROVED`
8. On admin rejection: `status = REJECTED`, merchant is notified with `reviewNote`

Only one `PENDING` edit per merchant / per branch at a time. Full audit trail preserved for every state transition.

### Photo change flow

- Live photos: stored as `BranchPhoto` rows — what customers see
- Photo change proposal: `POST /branches/:id/photos/edit-request` creates a `BranchPendingEdit` with `includesPhotos = true` and `proposedChanges` containing `{ add: [urlStrings], remove: [photoIds] }`
- Live `BranchPhoto` rows are untouched until admin approves
- On approval: system applies the diff — inserts new `BranchPhoto` rows, soft-deletes removed ones

### Merchant field visibility

| Field | Level | Customer-facing | Notes |
|---|---|---|---|
| `businessName` | Merchant | No | Legal name, portal/admin only |
| `tradingName` | Merchant | Future (directory) | Semi-public — treated as sensitive |
| `companyNumber` | Merchant | No | Verification only |
| `vatNumber` | Merchant | No | Verification only |
| `logoUrl` | Merchant | Future (directory) | Portal only in 2C — still sensitive |
| `bannerUrl` | Merchant | Future (directory) | Portal only in 2C — still sensitive |
| `description` | Merchant | Future (directory) | Portal only in 2C — still sensitive |
| `websiteUrl` | Merchant | No | Corporate/org website — portal only, not shown to customers |
| `websiteUrl` | Branch | Yes | Branch-specific website shown to customers on branch profile |

---

## File Structure

### New files to create

```
src/api/merchant/
  plugin.ts                        # Registers all 4 sub-modules, applies authenticateMerchant
  profile/
    routes.ts                      # Profile + edit-request routes
    service.ts                     # Profile read/write + pending edit logic
  onboarding/
    routes.ts                      # Checklist, contract, submit routes
    service.ts                     # Gate validation, checklist computation, submission logic
  branch/
    routes.ts                      # Branch CRUD + hours + amenities + photo edit-request
    service.ts                     # Branch business logic + main branch rules + delete rules
  voucher/
    routes.ts                      # Custom + RMV voucher routes
    service.ts                     # Voucher lifecycle + RMV provisioning + category change logic

tests/api/merchant/
  profile.test.ts
  onboarding.test.ts
  branch.test.ts
  voucher.test.ts
  voucher-rmv.test.ts
```

### Files to modify

```
prisma/schema.prisma               # Add new models, fields, enums (see Schema section)
prisma/seed.ts                     # Add RmvTemplate seed data per category
src/api/app.ts                     # Register new merchant plugin
```

---

## Testing Strategy

- Integration tests hit a real test database (same pattern as auth tests)
- Each test file covers one module
- Key scenarios per module:
  - **profile:** fetch, non-sensitive edit, sensitive edit-request flow, 409 on duplicate pending, withdraw
  - **onboarding:** checklist gates, contract accept, submit blocked when gates incomplete, submit succeeds when all clear
  - **branch:** create, update non-sensitive, sensitive edit-request, 409 on duplicate, main branch promotion, delete rules (last branch, main branch)
  - **voucher:** DRAFT → submit → PENDING_APPROVAL, edit blocked in PENDING_APPROVAL, delete DRAFT only, RMV provisioning, RMV category change blocked after submit, RMV category change with confirm flag

---

## Out of Scope for 2C

- Admin-side approval endpoints (Phase 5)
- File upload (pre-signed URLs only — client uploads directly to S3/R2)
- Customer-facing read endpoints (Phase 3)
- Redemption system (Phase 2D)
- Subscription system (Phase 2E)
- Admin RMV template management UI (future)
- Analytics endpoints (future)
