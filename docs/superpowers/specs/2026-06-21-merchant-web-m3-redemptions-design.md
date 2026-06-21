# Merchant Portal M3 - Redemptions + Validate-a-code - Design Spec

**Status:** Draft (for owner review before the implementation plan)
**Tier:** 2 (surface rebaseline / multi-file backend + frontend), plan-first, owner-gated per slice and per PR
**Date:** 2026-06-21
**Milestone goal:** Give a live (approved) merchant the first operational surface they need after onboarding: a merchant-wide redemptions log and a two-step Validate-a-code flow, so they can see and honour the vouchers customers bring in and reconcile delayed/batch validations. No schema. Voucher-type-generic.

**Predecessor:** M2 onboarding is complete end-to-end on `main` (`07fc18b4`). This is the next milestone, chosen via the 2026-06-21 audit + grill-me pass.

---

## 0. Owner-locked decisions (grill-me, 2026-06-21)

| # | Decision | Outcome |
|---|---|---|
| OD1 | Next milestone | **Redemptions + Validate-a-code.** Voucher-type-generic: works for the flagship RMV vouchers today and any future custom / TIME_LIMITED / REUSABLE redemption record without redesign. **No custom-voucher CRUD** is pulled in. |
| OD2 | Reverse (un-redeem) | **Deferred** to a Tier-3 follow-up. It is the only schema-touching part. This milestone stays **no-schema**. |
| OD3 | Merchant-wide list scoping | Filter via the **`branch.merchantId`** relation. No `VoucherRedemption.merchantId` column is added; that denormalization decision moves to the Insights milestone. |
| OD4 | Customer identity shown to merchants | **First name + last initial** (e.g. "Sarah K."), formatted at the API boundary. **Never** email or phone. |
| OD5 | Validate flow | **Two-step confirm-before-validate:** enter code, look up a read-only preview, confirm, then validate. Validation is a separate, often delayed/batch audit step (staff jot codes on bills and validate later). Already-validated codes show their details and are never double-validated. Web is manual entry; QR is reserved for the future staff app. |
| OD6 | Validator attribution | **No-schema bug fix:** set `validatedById = null` for merchant-admin portal validations (fixes a latent `BranchUser`-FK crash). Display portal validations as "Validated in the portal". Per-person portal-validator attribution is deferred to the multi-user staff/access milestone. |
| CSV | Redemptions CSV export | **In scope**, tightly bounded: export the current filtered log view, privacy-safe (no email/phone/PIN; customer identity is first name + last initial), reconciliation fields only. For merchant reconciliation/audit, not a broad reporting system. |

Standing constraint: if any work in this milestone turns out to need a schema change, **stop and report** the exact SQL + rollback before implementing it. The design below is deliberately no-schema.

---

## 1. Verified current state (on `main` `07fc18b4`)

### 1.1 Frontend (`apps/merchant-web`)
- Auth + onboarding are live. Every post-onboarding sidebar item is an `href:'#'` stub (`components/shell/navItems.ts`), including **Redemptions** (`{ label: 'Redemptions', href: '#', icon: ScanLine }`).
- The topbar **Validate a code** button (`components/shell/Topbar.tsx:74`, navy variant + `ScanLine`) is rendered but inert (no handler). Quick actions + Notifications bell are also inert.
- The "live" Home state is a "full dashboard coming soon" placeholder.
- Conventions to mirror: client-component pages under `app/(app)/<feature>/page.tsx` wrapped by `MerchantPortalShell` (`app/(app)/layout.tsx`); `lib/api/<x>.ts` clients calling `apiFetch(path, { auth: true })` (`lib/api/client.ts`, Bearer access token, single-flight 401 refresh, typed `ApiError`); React Query with flat array keys + `invalidateQueries`; jest+RTL tests under `app/(app)/<feature>/__tests__/page.test.tsx` with a `QueryClientProvider` wrapper; design-system primitives `components/ui/{table,dialog,badge,button,card,input}.tsx`; brand tokens in `app/globals.css` (`--rose #E20C04`, `--coral #E84A00`, `--navy #010C35`, `--cream #FFF9F5`). Redemptions does not need a BFF route (no token issuance) - direct authed `apiFetch` is the pattern.

### 1.2 Backend (`src/api`)
- `POST /api/v1/redemption/verify` (`src/api/redemption/routes.ts:123`) validates a code and accepts a **merchant-admin JWT** (or branch-staff JWT) via per-route token resolution. On a merchant token it checks `redemption.voucher.merchantId === actor.merchantId`, re-checks merchant status + branch active from the **live DB** (SEC-M1), and flips `isValidated` / `validatedAt` / `validationMethod` / `validatedById`.
- `GET /api/v1/branch/:branchId/redemptions` (`routes.ts:172`) lists **one branch's** redemptions and also accepts a merchant-admin JWT (verifies the branch belongs to the merchant). `listBranchRedemptions` already returns `customer: { name: firstName + ' ' + lastName }`, `voucher {id,title}`, plus a `...r` spread of all `VoucherRedemption` columns. **No merchant-wide list exists.**
- The only lookup-by-code endpoint is `getMyRedemptionByCode` - a **customer self-lookup** (customer JWT). **There is no merchant/staff preview-by-code endpoint.**
- `VoucherRedemption` has `branchId` but **no `merchantId`** (`prisma/schema.prisma`); merchant scoping is via `branch.merchantId`.
- **Latent bug:** `verifyRedemption` sets `validatedById: actor.actorId`, but `validatedById` is a **`BranchUser` FK** (`schema.prisma:1080`). For a merchant-admin actor `actorId` is a `MerchantAdmin` id, which violates the FK against the real DB. Unexercised today (no portal validate surface; merchant-path unit tests use a mocked Prisma; the integration test hits the suspended branch before the write).
- No merchant analytics aggregation exists anywhere.
- **Email is dark:** `sendEmail()` (`shared/email.ts`) is gated by `EMAIL_ENABLED` (default off). `notify()` (`shared/notify.ts:109`) writes `CommunicationLog` outbox rows; the email worker records `skipped-disabled` while dark. **`redeem()` currently sends no email or notification.**

---

## 2. Scope

### 2.1 In scope (M3)
1. **Merchant-wide redemptions log** (new backend list endpoint + new frontend page + nav wire), with branch / status / date-range / voucher-type filters, pagination, and the merchant-safe row shape.
2. **Lookup-by-code preview** (new read-only backend endpoint) returning a merchant-safe preview, including the already-validated details.
3. **Two-step Validate-a-code flow** (frontend), reachable from the topbar global action and the Redemptions page, calling the lookup preview then the existing verify route (method `MANUAL`).
4. **Validator-attribution bug fix** (`validatedById = null` for merchant-admin validations) in `verifyRedemption`.
5. **Merchant-safe redemption detail** view.
6. **Privacy-safe CSV export** of the filtered log.
7. The cross-cutting invariants: multi-tenant (IDOR) scoping with a cross-tenant-denial test per endpoint; SEC-M1 live-DB suspend check on validate and preview; never select `redemptionPin`; never expose customer email/phone; customer identity is first name + last initial.

### 2.2 Out of scope (recorded, not started)
- **Reverse** (un-validate / un-redeem) - Tier-3 schema follow-up (OD2).
- **`VoucherRedemption.merchantId`** denormalization - Insights milestone (OD3).
- **`validatedByAdminId`** per-person portal-validator column - multi-user staff/access milestone (OD6).
- **Redemption notification emails** (customer + merchant/branch) - a dedicated follow-up notification slice (see section 9); email is dark and depends on provider readiness + templates + the per-branch alert-recipients model.
- Analytics / Home dashboard, custom-voucher CRUD, day-2 branches, staff/access, demographics (DPIA-gated). All later milestones.

---

## 3. Cross-check table (anchor / prototype + doc intent / live reality / M3 decision)

| Anchor | Prototype + doc intent | Live reality (verified) | M3 decision |
|---|---|---|---|
| Redemptions log | Per-branch + all-branches log; customer name, code, status, method, saving; export CSV | Per-branch list only; no merchant-wide list; full name returned | New merchant-wide list (branch.merchantId join); first+last-initial; all-branches + per-branch filter |
| Status model | Awaiting validation / Validated / Reversed | `isValidated` boolean only; no Reversed | Two statuses this milestone (Awaiting validation / Validated); Reversed deferred but the UI leaves room for it |
| Validate-a-code | Manual entry, lookup -> confirm -> done, 8 error states; QR is the staff app | `verify` validates immediately; no preview endpoint; QR/MANUAL method enum | Two-step preview + confirm; method `MANUAL` on web; the relevant error states (no wrong-branch for a merchant actor; no Reversed) |
| Who validated | Per-staff attribution | `validatedById` is a BranchUser FK; crashes for merchant actors | No-schema fix: null for merchant; show "Validated in the portal" |
| Customer identity | Name shown, never email/phone | Backend returns full first+last name, no contact info | Format to first name + last initial at the API boundary |
| Delayed/batch validation | Staff write codes on bills, validate later | Supported by the data model (a redemption persists until validated) | The log + lookup flow is built around delayed/batch reconciliation |
| CSV export | Export, no customer personal data | None | Privacy-safe CSV of the filtered view (no email/phone/PIN) |
| Redemption emails | Customer confirmation + review prompt; merchant/branch alert with code -> validate prompt | Email dark; `redeem()` sends nothing; per-branch alert-recipients unbuilt | Deferred to a follow-up notification slice (section 9) |
| Redemption PIN | Never exposed | PIN lives on `Branch`, not on the redemption | Ensure no branch select pulls `redemptionPin` into any redemption payload |

---

## 4. Backend design (all additive, no schema)

New endpoints live under a new `src/api/merchant/redemptions/` module (routes + service), guarded by the merchant session so `merchantId` is always taken from the authenticated session, never a client parameter. The validate action reuses the existing `POST /api/v1/redemption/verify` (which already accepts a merchant JWT) after the OD6 fix.

### 4.1 B1 - Merchant-wide redemptions list
`GET /api/v1/merchant/redemptions`

- **Auth:** merchant session (`merchantVerify`); resolves `merchantId` from the session.
- **Query params (all optional):** `branchId` (must belong to the merchant, else 403/empty), `status` (`awaiting` | `validated`), `from`, `to` (ISO, on `redeemedAt`), `voucherType` (one of the `VoucherType` enum values), `code` (exact/prefix search on `redemptionCode`), `limit` (default 25, max 100), `offset`.
- **Query:** `prisma.voucherRedemption.findMany({ where: { branch: { merchantId }, ...filters }, orderBy: { redeemedAt: 'desc' }, take, skip, select: <curated> })` plus a matching `count`. The `branch: { merchantId }` relation filter is the IDOR boundary (merchantId from the session). `branchId` filter is additionally constrained to the merchant's branches.
- **`isTestData`:** by default the merchant-facing list **excludes** `isTestData = true` rows (seed/QA noise), matching how Popular/Trending exclude them. (Confirm in review; the default is exclude.)
- **Response row shape (merchant-safe, curated select - never a blind `...r` spread):**
  ```
  {
    id: string,
    redemptionCode: string,                 // merchant-facing; needed to match the code on the bill (NOT a PIN)
    voucher: { id, title, type },           // type for the voucher-type-generic chip
    branch: { id, name },                   // name only; NEVER redemptionPin / address-sensitive fields beyond name
    customerName: string,                   // OD4: first name + last initial, formatted server-side
    redeemedAt: string,                     // ISO
    status: 'AWAITING_VALIDATION' | 'VALIDATED',  // derived from isValidated
    validatedAt: string | null,
    validationMethod: 'MANUAL' | 'QR_SCAN' | null,
    validatedByLabel: string | null,        // branch-staff name, OR "Validated in the portal" for merchant validations
    estimatedSaving: number                 // GBP, coerced from Decimal
  }
  ```
- **`customerName` formatting helper (server-side):** `firstName` plus, if `lastName` is non-empty, a space and `lastName[0] + '.'`. Empty-name rows degrade gracefully (e.g. just the first name, or a neutral placeholder). This helper is the single source of the OD4 format and is unit-tested.
- **`validatedByLabel` derivation:** if `validatedById` resolves to a `BranchUser`, show that person's first name + last initial; if `validatedById` is null but `isValidated` is true, show "Validated in the portal" (the merchant-admin portal path under OD6). Never expose a raw id.
- **Pagination envelope:** `{ items, total, limit, offset }`.

### 4.2 B2 - Lookup-by-code preview (read-only, no state change)
`GET /api/v1/merchant/redemptions/lookup?code=<code>`

- **Auth:** merchant session.
- **Behaviour:** normalise the code (uppercase, strip spaces), find the redemption by `redemptionCode`, and **scope to the session merchant**: if the redemption's `voucher.merchantId !== session.merchantId`, return the same not-found response as a missing code (do **not** leak cross-tenant existence). Re-check merchant status from the live DB (SEC-M1); a suspended merchant gets a clean suspended error.
- **Returns** the same merchant-safe row shape as B1, plus, when already validated, the validation details (`validatedAt`, `validationMethod`, `validatedByLabel`) so the UI can show "already validated" without attempting to re-validate. **Read-only - never writes.**
- **Error semantics:** not-found (missing or cross-tenant) -> `REDEMPTION_NOT_FOUND`; suspended -> `MERCHANT_SUSPENDED`; branch inactive is surfaced as a status note in the preview rather than a hard error (the merchant may still want to see it), with the final guard enforced at confirm time by `verify`.
- Never selects `redemptionPin` or any customer contact field.

### 4.3 B3 - Validator-attribution bug fix (OD6) + method on web
In `verifyRedemption` (`src/api/redemption/service.ts`): set `validatedById` to `actor.actorId` **only when `actor.role === 'branch'`**, and to `null` when `actor.role === 'merchant'`. The merchant-admin actor id continues to be recorded in the `VOUCHER_VERIFIED` audit log (`metadata.actorId`, already present), which remains the authoritative record of who validated in the portal. This is a behaviour-preserving fix for branch staff and a crash-fix for merchant admins.
- The portal validate call sends `method: 'MANUAL'` (web is manual entry; QR is the future staff app).
- This is the only change to a shared route; it is covered by a regression test asserting branch-staff attribution is unchanged and merchant-admin validation writes `validatedById = null` (and does not throw an FK error against a real DB).

### 4.4 CSV export
`GET /api/v1/merchant/redemptions/export.csv?<same filters as B1>`

- **Auth:** merchant session; same `branch: { merchantId }` IDOR scoping and same filters as B1, but **no pagination** (a documented hard cap, e.g. 50,000 rows, with the response noting truncation if hit - no silent cap).
- **Content-Type:** `text/csv`; a `Content-Disposition` filename including the merchant + date range.
- **Columns (privacy-safe, reconciliation only):** redemption code, voucher title, voucher type, branch name, customer (first name + last initial), redeemed timestamp, validation status, validated timestamp, validation method, saving (GBP). **No** email, phone, PIN, raw ids, or internal flags.
- Reuses the B1 query + the same `customerName` helper.

### 4.5 Backend invariants (enforced + tested)
1. **Multi-tenant (IDOR):** every endpoint derives `merchantId` from the session and filters by `branch.merchantId`; any client-supplied `branchId` is constrained to the merchant's branches. A cross-tenant-denial test per endpoint (a second merchant cannot list, look up, validate, or export another merchant's redemptions).
2. **SEC-M1 live-DB suspend check:** preserved on `verify` (already present) and added to the lookup preview - suspension is read from the live DB, never the cached session snapshot.
3. **`redemptionPin` never selected** into any redemption payload (the PIN lives on `Branch`; ensure no branch select includes it). Asserted by test.
4. **No customer email/phone** in any redemption payload or CSV.
5. **Customer identity = first name + last initial**, formatted by the single server-side helper.
6. **`isTestData` excluded** from the merchant-facing list/export by default.
7. **No blind spreads:** every redemption response uses a curated `select`/mapping, never `...r` over the whole row.

---

## 5. Frontend design (`apps/merchant-web`)

### 5.1 F1 - Redemptions log page
- **Route:** `app/(app)/redemptions/page.tsx` (client component, wrapped by the existing shell).
- **Nav:** point `components/shell/navItems.ts` Redemptions item `href: '#'` -> `href: '/redemptions'`.
- **Client:** new `lib/api/redemptions.ts` with zod schemas (`.passthrough()` for forward-compat) + `listRedemptions(filters)`, `lookupRedemptionByCode(code)`, `validateRedemptionCode(code)` (calls `POST /api/v1/redemption/verify` with `method: 'MANUAL'`), and `exportRedemptionsCsvUrl(filters)` / a fetch that triggers a download. All via `apiFetch(..., { auth: true })`.
- **React Query:** `useQuery({ queryKey: ['redemptions', filters], queryFn: () => listRedemptions(filters), staleTime: 30_000 })`.
- **Layout:** a header with a short purpose line + the **Validate a code** primary action (shared with the topbar); a filter row (branch selector "All branches" + per-branch, status filter, date range, voucher-type filter, code search); a `Table` (`components/ui/table.tsx`) with columns: status pill, redemption code, voucher (title + type `Chip`), branch, customer (first + last initial), redeemed-at, validated-at + method (or "Validated in the portal"), saving; pagination; an **Export CSV** button.
- **States:** loading skeleton, `TableEmpty` empty state ("Redemptions appear once customers start redeeming your vouchers"), error state, and a pre-live note if the merchant is not yet `live` (defence-in-depth; the nav is only reachable when live).
- **Status pills:** `Badge` - "Awaiting validation" (neutral/caution) and "Validated" (success). Leave a slot for "Reversed" later (do not build it).

### 5.2 F2 - Validate-a-code (two-step, shared dialog)
- A single shared `Dialog` (`components/ui/dialog.tsx`) opened from both the topbar **Validate a code** button (wire the existing `Topbar.tsx:74` button) and the Redemptions page action.
- **Step 1 - entry:** an input for the 8-character code with client-side normalisation (uppercase, strip spaces) and a 4+4 display; a "Look up" action. Client-side format validation (8 chars, valid alphabet) before any request.
- **Step 2 - preview (confirm-before-validate):** call B2; show the merchant-safe match - customer (first + last initial), voucher title + type, branch, redeemed-at, saving, and current status.
  - If **awaiting validation:** a clear **Confirm validation** action that calls `verify` (method `MANUAL`), then a success state ("Validated") with the new validation details.
  - If **already validated:** show the validation details (when, method, "Validated in the portal" or the branch-staff name) and **no confirm action** - never double-validate.
- **Errors:** format (inline, client); not-found ("No redemption found for that code"); merchant-suspended; branch-unavailable (surfaced, with the final guard at confirm); generic/network. The `verify` call defensively handles `ALREADY_VALIDATED` (re-shows the already-validated state).
- On success, invalidate `['redemptions', ...]` so the log reflects the new validation.
- **Method:** the web flow always sends `MANUAL`. The dialog copy notes that QR scanning is done in the Redeemo staff app at the counter (forward-compat, no QR UI built).

### 5.3 F3 - Redemption detail
- A merchant-safe detail view (a row click or a dedicated route/panel) showing the full voucher (title, type, description, terms), branch, customer (first + last initial), redeemed-at, status + validation details, saving, and the redemption code. Never email/phone/PIN. Reuses the same client + schemas.

### 5.4 Design-system + brand
Reuse `Table`, `Dialog`, `Badge`, `Chip`, `Button` (gradient primary / navy / secondary), `Card`, `Input`; brand tokens from `app/globals.css`; icons via `@/lib/icons`. House style: no em dashes in UI copy (use `:` `;` `()` `·`); no emojis; brand hexes from tokens.

### 5.5 Tests (jest + RTL, per conventions)
`app/(app)/redemptions/__tests__/page.test.tsx` + `lib/api/__tests__/redemptions.test.ts` + a Validate-dialog test: list renders + loading/empty/error; filters drive the query key; the two-step validate (entry -> preview -> confirm -> success); already-validated shows details + no confirm; error states; CSV button triggers the export; first+last-initial is rendered (never a full surname or any contact field).

---

## 6. Validation state machine + error mapping (M3)

```
entry --(lookup)--> preview --(confirm/verify)--> validated(done)
  |                    |
  |                    +-- already-validated (no confirm; show details)
  |
  +-- client format error (not 8 valid chars)
```

| Backend signal | Origin | UX |
|---|---|---|
| client format | dialog | "Enter the 8-character code (letters and numbers)." |
| `REDEMPTION_NOT_FOUND` (incl. cross-tenant, masked) | B2 lookup | "No redemption found for that code. Check it and try again." |
| already validated (preview status) | B2 lookup | Show validation details; no confirm action. |
| `MERCHANT_SUSPENDED` | B2 / verify (live DB) | "Your account is suspended. Contact Redeemo." |
| `BRANCH_UNAVAILABLE` | verify (live DB) | "This branch is currently unavailable." |
| `ALREADY_VALIDATED` | verify (defensive) | Re-show the already-validated state. |
| network/unknown | any | Generic retry message. |

Not applicable in M3: wrong-branch (a merchant actor owns all their branches), wrong-merchant (masked as not-found), reversed (Reverse deferred).

---

## 7. Voucher-type-generic guarantee

The validate path flips `isValidated` on an existing redemption row and does **not** re-run redeem guards, so it is inherently type-agnostic - it already works for RMV, custom (RCV), TIME_LIMITED, and REUSABLE records. The list and preview display `voucher.type` + `voucher.title` generically (a type `Chip` + title), so any voucher type renders without per-type code. No assumption that only the two flagship RMVs exist. This satisfies OD1 at no extra cost; a test asserts a non-RMV redemption row renders and validates through the same path.

---

## 8. Privacy + security invariants (consolidated, test-pinned)

1. Customer identity shown to merchants is **first name + last initial only**; never email or phone, anywhere (list, preview, detail, CSV).
2. **`redemptionPin` is never** selected into any redemption payload.
3. **Multi-tenant isolation:** `merchantId` from the session; `branch.merchantId` filter on every endpoint; client `branchId` constrained to the merchant; a cross-tenant-denial test per endpoint.
4. **SEC-M1:** suspended-merchant and inactive-branch checks read the **live DB** on validate (and suspended on preview), never the cached session.
5. **No silent caps:** the CSV export documents and signals truncation if the row cap is hit.
6. **No blind row spreads:** curated selects only.

---

## 9. Redemption notification emails - evaluated, DEFERRED to a follow-up notification slice

**Owner anchor:** when a customer redeems (PIN entered, code generated), Redeemo should email both the customer (confirmation + review/rate prompt) and the merchant/branch contact (alert with merchant-safe details + the code + a prompt to validate in the portal), with strict privacy boundaries (no PINs; no unnecessary customer contact details in merchant-facing email; role-separated copy).

**Live-code finding:** the email **infrastructure** exists and is sound - `notify()` writes `CommunicationLog` outbox rows, the email worker + Resend integration + bounce webhooks exist - but **sending is dark** (`EMAIL_ENABLED` default off; the worker records `skipped-disabled`), and **`redeem()` currently sends no email or notification at all**. Going live needs the runbook §6 provider-readiness gates (domain verify, SPF/DKIM/DMARC, monitored inboxes, bounce webhooks, the §SEC.1 atomic limiter) and the D-F sender policy (`noreply@redeemo.co.uk` etc.).

**Decision:** **out of M3 scope; recorded as a dedicated follow-up "redemption notification slice", not dropped.** Rationale: (a) the trigger is on the **customer-app redeem path** (`redeem()`), not the merchant-portal surface this milestone builds; (b) it depends on **email go-live** (a Phase-6 / devops gate, not safe/available now); (c) the **merchant/branch recipient** maps to the prototype's per-branch "redemption alerts" model (manageable recipients + an optional extra non-portal recipient), which is itself unbuilt and partly schema (alert-recipients), so wiring it now would balloon M3 and pre-empt a Branches-day-2 design; (d) two new role-separated templates with privacy boundaries need their own design.

**Captured design for the follow-up slice (so it is not lost):**
- **Trigger:** in `redeem()`, after the redemption + claim are committed, enqueue two `notify()` calls (customer + merchant/branch) so they ride the existing outbox and stay dark until `EMAIL_ENABLED` is on.
- **Customer email:** to `User.email`; confirmation + voucher/redemption details + encouraging copy + a review/rate prompt (reuses the PR-C verified-review flow); never the merchant PIN.
- **Merchant/branch email:** to the branch contact / per-branch alert recipients; merchant-safe voucher + redemption details + the redemption **code** + a prompt to validate in the portal; never the customer's email/phone, never the PIN.
- **Dependencies (stop-and-report where schema):** email go-live gates; two templates; the per-branch alert-recipients model (schema; Branches-day-2 / notification milestone); recipient resolution rules.

---

## 10. Deferred / stop-and-report ledger (none block M3)

| Item | Why deferred | When |
|---|---|---|
| Reverse (un-validate) | Schema (Reversed status + `reversedById`/`reversedAt`/`reason`) + transactional per-type claim-revert | Tier-3 follow-up (OD2) |
| `VoucherRedemption.merchantId` denorm | Performance for aggregation; not needed for M3 reads | Insights milestone (OD3) |
| `validatedByAdminId` (per-person portal validator) | Only matters with multi-user portal access | Staff/access milestone (OD6) |
| Redemption notification emails | Email dark + templates + alert-recipients model | Follow-up notification slice (section 9) |
| Per-branch alert-recipients model | Schema | Branches-day-2 / notification milestone |
| Restrict self-serve `deactivate` endpoint | Contradicts the 12-month contract rule | Before any My-account surface |
| OWNER contract-route gate | Owner-by-absence today | When multi-user/staff lands |
| Demographics analytics | DPIA / ICO gate | Insights milestone |

---

## 11. Testing strategy

- **Backend (vitest):** B1 list (filters, pagination, first+last-initial, `isTestData` excluded, no `redemptionPin`, no contact fields, validatedByLabel derivation); B2 preview (read-only, already-validated details, cross-tenant masked as not-found, SEC-M1 suspended); B3 fix (branch attribution unchanged; merchant validation writes `validatedById = null` and does not FK-crash; method `MANUAL`); CSV (privacy-safe columns, filter parity, cap signalling); a **cross-tenant-denial test per endpoint**; a voucher-type-generic test (a non-RMV redemption lists + validates).
- **Frontend (jest + RTL):** page list/loading/empty/error; filter-driven query keys; two-step validate happy path; already-validated no-confirm; error states; CSV trigger; first+last-initial rendered, never a surname/contact field.
- **Gates:** backend `vitest` + merchant-web `jest` green; `tsc --noEmit` clean both; dash-clean; scope-clean per slice.

---

## 12. Slice sequence (high-level; the implementation plan details the tasks)

Backend first, then frontend; each slice its own owner-gated PR off updated `main`, behind the green merchant-web jest + backend vitest gates.

1. **B1** - merchant-wide list endpoint + `customerName` helper + curated select + cross-tenant test.
2. **B2** - lookup-by-code preview endpoint (read-only) + already-validated shape + cross-tenant/SEC-M1 tests.
3. **B3** - `verifyRedemption` validator-attribution bug fix + regression test.
4. **B4** - CSV export endpoint (reuses B1 query) + privacy-safe column test + cap signalling.
5. **F1** - `lib/api/redemptions.ts` + Redemptions page + nav wire + list/filter/pagination/empty/error + tests.
6. **F2** - shared Validate-a-code dialog (two-step) wired to the topbar + the page + tests.
7. **F3** - redemption detail + CSV export button + tests.

(Backend B1-B4 may be bundled into one backend PR if small; the plan will decide the PR cut points.)

**Execution model:** fresh implementer subagent per slice + fresh adversarial reviewer per slice (no self-certify); the reviewer runs the cross-tenant-denial test, asserts `redemptionPin` never leaks, and checks SEC-M1 on validate/preview; `/code-review` + Codex SHA-bound before each merge; Playwright permitted on the prototype (first-class) and the dev server for QA.

---

## 13. Open questions / self-review

- **CSV row cap:** the exact cap (proposed 50,000) and the truncation signal - confirm in the plan.
- **`isTestData` exclusion** from the merchant-facing list/export - the design excludes by default; confirm in review.
- **Detail surface form:** F3 as a dedicated route vs an in-page panel - a plan-level UX choice; either is no-schema.
- **Code-search semantics:** exact vs prefix on `redemptionCode` - the plan will pin it (proposed: exact for the validate lookup, prefix for the list search).
- **Self-review:** every section maps to a locked decision (OD1-OD6 + CSV); no placeholders; the only schema-touching ideas (Reverse, `merchantId`, `validatedByAdminId`, alert-recipients) are explicitly deferred; the email anchor is evaluated and parked with its design captured; privacy/security invariants are consolidated and test-pinned.

---

**Next step:** owner review of this spec. On approval, the Tier-2 implementation plan (`docs/superpowers/plans/2026-06-21-merchant-web-m3-redemptions.md`) will break this into the bite-sized B/F slices above. No implementation code, schema, or PRs until the plan is approved.
