# Redeemo Product Decisions

This document records confirmed product decisions with their reasoning. It is the source of truth for non-obvious choices made during design. Update it when decisions change — do not delete old entries, mark them superseded.

---

## Merchant Registration & Onboarding

### Decision: Low-friction registration, full setup in portal

**Confirmed:** 2026-04-09

Registration collects only basic details (email, password, essential contact info) and requires email verification. No branches, no vouchers, no contract, no RMV during registration.

All real business setup happens inside the merchant portal after registration via a structured onboarding checklist.

**Reasoning:** We do not want to lose merchants during sign-up because the process feels too demanding or uncomfortable. Even incomplete registrations are valuable — they allow Redeemo to follow up and help merchants complete onboarding. Separating account creation from business setup keeps both flows clean.

---

### Decision: Server-enforced onboarding checklist gates approval submission

**Confirmed:** 2026-04-09

The merchant portal shows a checklist of required onboarding steps. The checklist is computed server-side from real data — not from a single status enum. All gates must pass before a merchant can submit for admin approval.

**Required gates (must all be true to submit):**
1. At least 1 branch created (not soft-deleted)
2. Contract accepted (`contractStatus = SIGNED`)
3. At least 2 RMV vouchers with status `PENDING_APPROVAL` or `ACTIVE` — `NEEDS_CHANGES` does NOT count; the merchant must fix and resubmit rejected RMV before this gate passes

The `onboardingStep` enum on `Merchant` is a convenience summary field updated as a side-effect of writes. It is never used as a gate condition. Checklist computation always reads real data.

**Reasoning:** Onboarding may not remain linear as the platform evolves. Deriving state from facts prevents the summary field from going stale and enables non-linear flows in future.

---

### Decision: Merchant account statuses

**Confirmed:** 2026-04-09

```
REGISTERED       — account created, onboarding incomplete
BRANCH_ADDED     — at least one branch exists (convenience milestone)
CONTRACT_SIGNED  — contract accepted
RMV_CONFIGURED   — RMV vouchers submitted for review
SUBMITTED        — submitted for admin approval, awaiting review
APPROVED         — admin approved, merchant is live
LIVE             — synonym for APPROVED (may be split later)
SUSPENDED        — immediately removes merchant and vouchers from customer app
NEEDS_CHANGES    — admin rejected submission, merchant must fix and resubmit
```

Merchant remains invisible to customers until status reaches `APPROVED`.

---

## Branch Model

### Decision: Every merchant must have at least one branch

**Confirmed:** 2026-04-09

Even single-location businesses must create a branch. There is no "merchant without a branch" state in the customer app.

**Reasoning:** The customer app is location-based. Customers interact with branch profiles, not abstract merchant accounts. Branches are what appear on the map, in search results, and in the customer's nearby feed. A merchant without a branch has no customer-facing presence.

---

### Decision: Branch holds all customer-facing profile data

**Confirmed:** 2026-04-09

**Branch-level (customer-facing):** name, description, logo, banner, photos, address, location (lat/long), opening hours, phone, email, branch website URL, amenities.

**Merchant-level (account/portal):** account status, onboarding state, business name, trading name, company number, VAT number, merchant-level logo/banner/description (portal only in early phases, may become customer-facing in a future merchant directory), merchant-level website URL (corporate site — portal only, never shown to customers directly).

**`websiteUrl` clarification:** Both `Merchant` and `Branch` have a `websiteUrl` field. The merchant-level one is the corporate/organisation website, used for portal and admin purposes only. The branch-level one is what is shown to customers on the branch profile in the customer app. They are independent fields and may differ.

**Reasoning:** Branch details may differ between locations. Customers care about the specific branch they are visiting, not the abstract merchant entity. Keeping customer-facing data at branch level enables accurate per-branch profiles.

---

### Decision: Main branch is an administrative marker only

**Confirmed:** 2026-04-09

`isMainBranch = true` identifies the primary contact/verification branch for admin and internal purposes. It is not surfaced to customers.

Customers always see branches ordered by proximity to their location. There is no "main branch" concept in the customer app.

**Rules:**
- Every merchant must have exactly one `isMainBranch = true` at all times
- First branch created is automatically set as main
- Changing main branch atomically unsets the previous main
- Main branch cannot be deleted — another must be promoted first

---

### Decision: Branch soft delete only

**Confirmed:** 2026-04-09

Branches are never hard-deleted. `deletedAt` is set on soft delete. All historical redemptions, analytics, and reviews are preserved.

**Delete rules:**
- Cannot delete if it is the only active branch of a live (`APPROVED`) merchant
- Cannot delete the main branch without first promoting another
- All `BranchUser` records are deactivated (not deleted) on soft delete
- Deleted branches are immediately invisible to customers

---

## Voucher Model

### Decision: Vouchers are merchant-wide, redemptions are branch-attributed

**Confirmed:** 2026-04-09

A voucher belongs to a merchant and applies across all of that merchant's branches. The same voucher appears consistently to customers regardless of which branch they view.

When a redemption occurs, the `VoucherRedemption` record records which branch it happened at. This enables branch-level analytics and reporting without creating branch-specific voucher visibility.

**Reasoning:** Voucher consistency across branches is critical for customer trust. A customer should never see an offer at one branch that is unavailable at another branch of the same merchant.

---

### Decision: Monthly cycle rule — redeem once per merchant per cycle

**Confirmed:** 2026-04-09

If a customer redeems a specific voucher at any branch of a merchant, that voucher becomes inactive for that customer across all branches of that merchant for the remainder of the cycle. It resets at the customer's next subscription renewal.

**Reasoning:** Keeps the experience simple and predictable. Prevents misuse (e.g. redeeming the same offer at multiple branches in the same cycle).

---

### Decision: All vouchers require admin approval before going live

**Confirmed:** 2026-04-09

This applies to both custom vouchers and RMV vouchers. No voucher is visible to customers until an admin explicitly approves it.

**Lifecycle:**
```
DRAFT → (merchant submits) → PENDING_APPROVAL → (admin approves) → ACTIVE
                                               → (admin rejects)  → NEEDS_CHANGES
NEEDS_CHANGES → (merchant edits + resubmits)   → PENDING_APPROVAL
ACTIVE → (merchant deactivates or suspended)   → INACTIVE
```

Merchants submit explicitly — no voucher moves to `PENDING_APPROVAL` automatically.

**Reasoning:** Full control over the quality and consistency of offers shown to customers protects platform trust. Merchants and admins operate in clearly separate lanes.

---

## RMV (Redeemo Mandatory Vouchers)

### Decision: RMV are system-generated and merchant-constrained

**Confirmed:** 2026-04-09

RMV are the highest-value offers on the platform and the primary draw for customers. Because merchants join free and pay only when redemptions happen (performance-based), RMV are their effective marketing cost. Low-quality RMV would damage customer trust in the platform.

**Rules:**
- RMV are generated from `RmvTemplate` rows seeded by Redeemo (one or more per category)
- Merchants may only fill in fields explicitly allowed by the template (`allowedFields`)
- Merchants cannot change the voucher type, title structure, or minimum saving floor
- RMV require admin approval before going live (same lifecycle as custom vouchers)
- Custom vouchers remain fully flexible with no template constraints

---

### Decision: RMV setup happens during onboarding, not registration

**Confirmed:** 2026-04-09

RMV is a required onboarding step (gate #3 for approval submission) but is not part of the registration flow.

**Reasoning:** Introducing RMV during registration would increase drop-off. Merchants are more receptive to requirements once they are inside the portal and have context about the platform's value.

---

### Decision: RMV are provisioned when merchant sets their primary category

**Confirmed:** 2026-04-09

When a merchant sets `primaryCategoryId` in their profile (a portal action post-registration):
1. System looks up active `RmvTemplate` rows for that category
2. Creates 2 `Voucher` rows: `isRmv = true`, `status = DRAFT`, pre-populated with template values. No admin approval queue entry is created at this point — the voucher is truly a draft until the merchant explicitly submits it.
3. Merchant fills in allowed fields and explicitly submits each for review via `POST /vouchers/rmv/:id/submit`

**Category change rules:**
- If any RMV has been submitted (`PENDING_APPROVAL`, `ACTIVE`, or `NEEDS_CHANGES`): category change is **blocked**. Merchant must contact Redeemo support.
- If all RMV are still `DRAFT`: category change is allowed but requires `confirm: true` in the API request. Existing DRAFT RMV are soft-deleted and new ones provisioned. The client must present an explicit confirmation UI — never silent.

**Reasoning:** Prevents silent destruction of in-progress work. Preserves audit trail. Keeps Redeemo in control of RMV quality at all times.

---

### Decision: RmvTemplate designed for future admin management

**Confirmed:** 2026-04-09

`RmvTemplate` rows are seeded by Redeemo and are not merchant-editable. The data model is designed to support admin management of templates in a future phase (admin can create/edit/deactivate templates per category). Full admin template management UI is out of scope for Phase 2C.

---

## Sensitive Field Edit Flow

### Decision: Sensitive identity fields require pending review, not immediate overwrite

**Confirmed:** 2026-04-09

**Merchant sensitive fields:** `businessName`, `tradingName`, `logoUrl`, `bannerUrl`, `description`
**Branch sensitive fields:** `name`, `about`, `addressLine1`, `addressLine2`, `city`, `postcode`, `latitude`, `longitude`, `logoUrl`, `bannerUrl`, photos (add/remove)

Edits to these fields create a `MerchantPendingEdit` or `BranchPendingEdit` record. Live data is unchanged until admin approves. An `AdminApproval` record is created so it appears in the admin review queue.

**Reasoning:** Sensitive fields affect customer perception and trust. A bad actor could impersonate another business by changing branch name, address, or branding. The pending review pattern prevents this without blocking legitimate edits.

---

### Decision: One pending edit per entity at a time, no silent overwrites

**Confirmed:** 2026-04-09

If a `PENDING` edit already exists for a merchant or branch, a new edit request returns `409 CONFLICT` with the existing edit's ID and creation date.

To submit a new edit, the merchant must explicitly withdraw the existing one via `DELETE /edit-requests/:id`. Withdrawals are recorded in the audit log with `status = WITHDRAWN`.

**Reasoning:** Silent last-write-wins would confuse admin reviewers who might be partway through reviewing an edit. Full audit trail is preserved for every state transition.

---

### Decision: Initial branch creation is unrestricted

**Confirmed:** 2026-04-09

On initial branch creation (`POST /branches`), all fields including sensitive ones (name, address, logo, etc.) may be provided. The pending review pattern applies to subsequent edits only — particularly after the merchant is approved/live.

**Reasoning:** A merchant cannot set up their first branch if basic identity fields require admin approval before they can be entered. The pending review pattern is a fraud-prevention measure for post-approval edits, not a barrier to initial setup.

---

## File Upload

### Decision: Pre-signed URL pattern — client uploads directly to S3/R2

**Confirmed:** 2026-04-09

The API accepts URL strings for all image/file fields. The client is responsible for uploading files directly to S3 or Cloudflare R2 (via pre-signed URLs provided by a separate endpoint to be built) and passing the resulting URL to the API.

Multipart file upload through the API server is not built in Phase 2C.

**Reasoning:** Keeps the API server stateless and avoids large file handling complexity. Pre-signed URL upload is the standard pattern for this architecture.

---

## Future Decisions (not yet confirmed)

- Admin RMV template management UI — designed for, not built in 2C
- Merchant directory (customer-facing merchant profiles) — will use merchant-level sensitive fields; governance is already in place
- Zoho Sign integration for contract signing — click-to-agree in 2C, Zoho in future phase
- GDPR DSAR and deletion flows — required before launch, planned for later phase
- ICO registration — required before launch
