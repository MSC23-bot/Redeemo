# Admin Members & Subscriptions — read-only v1 (Slice S4)

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT start coding before reading the Inventory findings and the FLAGS FOR OWNER section.

**Goal:** give OPERATIONS (and SUPER_ADMIN) the first admin surface over customers and their subscriptions: a read-only Members directory (search + filter + paginate) and a per-customer detail view showing account status and subscription/cycle context. This is the largest current operational gap in the admin panel: today there are ZERO admin endpoints exposing `User`/`Subscription` (verified 2026-07-09). READ-ONLY v1: no mutations, no admin-grant, no CSV, no revenue tiles.

**Scope:** backend (Fastify, ADMIN scope) two new read endpoints under `/api/v1/admin/customers`; a new fail-closed `customer:read` capability (backend map + admin-web mirror); admin-web (Next.js 15, `apps/admin-web`) Members directory page + detail page + nav entry. NO schema change (see FLAGS: the plan stays within existing columns and reuses the existing QA-email helper). No customer-scope or merchant-scope serializer is touched.

**Tier:** 2 (new backend read contract on a new domain + multi-file admin-web surface; plan-doc-first, owner decisions surfaced before implementation). Not Tier 3: no schema change, no new architecture, an additive read that mirrors the D67 redemptions slice and the WP2 merchants directory.

**Branch:** `feat/admin-members-subscriptions-readonly-v1` off `origin/main`. Commit per task. NO PR until the adversarial-review checkpoint passes; NO merge.

**Predecessor pattern (follow closely):** the D67 admin redemptions slice (`src/api/admin/redemptions/{routes,service,format}.ts`, plan `docs/superpowers/plans/2026-07-09-d67-admin-redemption-visibility.md`) and the WP2 merchants directory (`src/api/admin/merchants/service.ts::listMerchants`). Frontend pattern: `apps/admin-web/app/(app)/redemptions/page.tsx` + `lib/api/redemptions.ts` + `lib/redemptions/useRedemptions.ts`.

**Owner-locked constraints (planning defaults; not relitigated here):** READ-ONLY; conservative PII (name + email + subscription state for OPERATIONS/SUPER_ADMIN; NO phone; NO MRR tile; NO demographic/behavioural data); D60-model in spirit (role-tiered PII, search is not a PII side-door, PII access audited); new fail-closed `customer:read`; two-layer gating mandatory (`.claude/rules/admin-web.md`); no schema change (else mark BLOCKED-ON-OWNER at that point).

---

## Inventory findings (done before planning)

### Data model (`prisma/schema.prisma`)

- **`User` has NO `isTestData` column.** The `isTestData` flag exists on `Merchant`/`Branch`/`Voucher`/`VoucherRedemption` (SEC-C3), NOT on `User`. Test/seed/QA customers are identified ONLY by email convention: `src/api/customer/discovery/qaAccountFilter.ts` exports `isQaAccountEmail(email)` (`QA_ACCOUNT_EMAILS = ['customer@redeemo.com']`, `QA_ACCOUNT_EMAIL_DOMAINS = ['redeemo.dev']`, case-insensitive). This is the SINGLE existing source of the "is this a test account" truth for users. Consequence: the D67 `includeTest` column-filter pattern CANNOT be copied directly; the Members directory computes a per-row `isTestAccount` boolean from `isQaAccountEmail(email)` (reused, not re-rolled) and its `includeTest` filter excludes those rows when `false`. See FLAG 1.
- **`User` PII surface (what must NEVER be selected):** `passwordHash`, `phone`, `phoneCountryCode`, `dateOfBirth`, `gender`, `addressLine1`, `addressLine2`, `city`, `postcode`, `latitude`, `longitude`, `localityId`/`postTown`/`ladDistrict`/`adminCounty`/`region`/`country`/`locationResolvedAt` (location snapshot), `interests` (relation), `newsletterConsent`/`marketingConsentAt`/`tcConsent*`, `ssoProviders`, `stripeCustomerId`, `profileImageUrl`. The v1 tier allows ONLY: `id`, `firstName`, `lastName`, `email`, `status`, `createdAt` (+ derived subscription summary + derived test-account flag). Owner default: **full name IS allowed** for OPERATIONS (the customer-name masking `formatCustomerName` is the MERCHANT-facing OD4 rule, not the admin tier; admins already see full customer identity nowhere else today, and the owner constraint explicitly permits name + email here).
- **`UserStatus` enum:** `ACTIVE | INACTIVE | SUSPENDED | DELETED`. `User.deletedAt` exists. DELETED users are shown HONESTLY in the directory (status badge = "Deleted"), no PII beyond the tier; a DELETED row is not hidden. Do not attempt to resurrect any PII a deletion may have scrubbed: only select the tier fields, whatever remains.
- **`Subscription` model:** 1:1 with `User` (`userId @unique`), nullable relation (`User.subscription Subscription?`). Fields used: `status`, `planId`, `currentPeriodStart`, `currentPeriodEnd`, `cancelAtPeriodEnd`, `cancelledAt`, `cycleAnchorDate` (immutable), `createdAt`. `SubscriptionPlan`: `name`, `priceGbp` (Decimal), `billingInterval`. `stripeSubscriptionId`/`stripeCustomerId` nullable (IAP/admin-grant ready) — NEVER surfaced.
- **`SubscriptionStatus` enum (the REAL derived state set; do not invent):** `TRIALLING | ACTIVE | CANCELLED | EXPIRED | PAST_DUE`. There is NO "free" status value: a customer with NO `Subscription` row is the free tier (browses only, business rule 1). So the directory's derived subscription-state filter set is exactly: `none` (free, no row) · `trialling` · `active` · `past_due` · `cancelled` · `expired`. `cancelAtPeriodEnd` is a MODIFIER on an otherwise-active row (surfaced as a sub-flag, not a separate state). The task brief listed "none/free/active/trialling/past-due/cancelled" and omitted `EXPIRED`; the model has it, so v1 includes it (see FLAG 2). "free" and "none" are the same thing; the filter uses `none`.
- **Cycle window:** `getCurrentCycleWindow(cycleAnchorDate, now)` in `src/api/subscription/cycle.ts` is the single source of truth. The detail read NEVER re-derives cycle logic; it calls this helper with the subscription's `cycleAnchorDate`.
- **`VoucherRedemption` has NO `merchantId`.** Redemption count for a customer is `voucherRedemption.count({ where: { userId } })` (direct, no join needed for the count); last redemption is `findFirst({ where: { userId }, orderBy: { redeemedAt: 'desc' }, select: { redeemedAt: true } })`. These are direct scoped counts (NOT analytics aggregates), so the analytics-cleanliness carve-outs do not apply.

### Capability + gating (`src/api/admin/capability.ts`, `apps/admin-web/lib/auth/session.ts`)

- `AdminCapability` union + `ALL_SLICE1_CAPS` + per-role `ROLE_CAPABILITIES` (`OPERATIONS: ALL_SLICE1_CAPS`, FINANCE/CONTENT/SUPPORT `[]`). `SUPER_ADMIN` short-circuits every cap in `adminHasCapability`. D67 added `redemption:read` to `ALL_SLICE1_CAPS`. The admin-web `session.ts` mirror duplicates the literal union + `ALL_SLICE1_CAPS` + `ROLE_CAPABILITIES` + `hasCapability` verbatim (deliberate copy, "the admin-web app must not depend on the API source tree"). Both layers are mandatory (`.claude/rules/admin-web.md`).
- **Decision: single `customer:read` capability, NOT split into `customer:read` + `subscription:read`.** Justification: the subscription summary is shown INLINE on the same row/detail as customer identity; there is no role in the current model that should hold customer-identity-read while being denied subscription-state, or vice versa (FINANCE/CONTENT/SUPPORT hold nothing; OPERATIONS/SUPER_ADMIN hold everything). A second capability would add mirror/map upkeep with zero consumer. The natural future seam is when admin-grant subscriptions land (a `subscription:write`/finance-scoped MRR surface): that is a WRITE/revenue boundary, which is where a distinct capability earns its keep. v1 keeps one cap; the future split is documented as a trigger, not pre-built.

### Backend patterns to mirror

- **Route + plugin:** the admin-management plugin (`src/api/admin/plugin.ts`) applies `authenticateAdmin` to the whole scope; each route additionally gates on `requireAdminCapability(cap)`. Register `adminCustomerRoutes` there (mirrors the D67 `adminRedemptionRoutes` line).
- **Zod query parsing:** D67's `filterSchema` is the template: `z.coerce.number().int().min().max().default()` for limit/offset; the `includeTest` literal-token transform (`z.enum(['true','false']).optional().transform((v) => v === undefined ? true : v === 'true')` — NOT `z.coerce.boolean`, because `Boolean('false') === true`); capped free-text (`.max(...)`).
- **Service shape:** `Promise.all([count, findMany])` → `{ items, total, limit, offset }`; curated `satisfies Prisma.XSelect` constant; a `to...Row` mapper that coerces `Decimal` → `Number` and `Date` → `.toISOString()`.
- **Redaction pin:** the D67/Location-Trust convention is a co-located `SELECT` constant plus an exact-key-set unit test and a "never selects <secret>" test (like `reviewBranchSelect`). Reproduce for `CUSTOMER_ROW_SELECT` / `CUSTOMER_DETAIL_SELECT`.

### Audit (`src/api/shared/audit.ts`)

- `writeAuditLog(prisma, ctx)` is fire-and-forget but its `AuditContext` does NOT carry `actorId`/`actorType`. `writeAuditLogTx(tx, ctx)` carries actor but is transaction-bound (awaited). A read has no transaction. **Decision:** add a small additive fire-and-forget `writeAuditLogWithActor(prisma, ctx)` (same fields as `AuditContext` plus `actorId`, `actorType`) OR extend `AuditContext` with optional `actorId?`/`actorType?` and pass them through in `writeAuditLog`. Either is a pure code addition, no migration. `AuditLog.event` is a String column, so the new event literal `ADMIN_CUSTOMER_VIEWED` is a union-only addition with NO migration; `entityType: 'customer'` already exists in the union. Actor wiring in routes: `actorId: req.user.sub`, `actorType: 'ADMIN'`, `ipAddress: req.ip`, `userAgent: req.headers['user-agent'] ?? ''` (see `merchants/routes.ts`).
- **Decision (what gets audited):** the DETAIL read (`GET /customers/:id`) writes ONE audit row per view (`event: 'ADMIN_CUSTOMER_VIEWED'`, `entityType: 'customer'`, `entityId: customerId`, `actorId: adminId`). The LIST does NOT audit per-row (it would flood the log and a list row carries only tier fields); the list is protected by the capability + rate limit. This matches the D60 "access audited" intent: targeted PII access (opening a person) is logged; browsing the directory is not.

### Frontend patterns to mirror (`apps/admin-web`)

- `app/(app)/redemptions/page.tsx`: `'use client'`; `useSession()` → `can('redemption:read')`; a `ForbiddenState` / `LoadingState` / `ErrorState` trio; status chips; a debounced/Enter-submit search box; an "Include test data" toggle default ON; offset pagination with `ChevronLeft`/`ChevronRight`; `lucide-react` icons, neutral shadcn styling (NO brand colours/fonts, `.claude/rules/admin-web.md`).
- `lib/api/redemptions.ts`: Zod-validated typed wrapper over `apiFetch`, `URLSearchParams` builder, response schema `.parse()`d so contract drift is a clear error.
- `lib/redemptions/useRedemptions.ts`: React Query hook keyed on the filter tuple, `enabled` gated by the caller on `can(cap)` (so a capability-less role never fires a guaranteed-403 request), `placeholderData: (prev) => prev`.
- `components/admin-shell.tsx`: `NAV_ITEMS: NavItem[]` each with `{ label, href, cap }`, filtered by `can(item.cap)`. Add `{ label: 'Members', href: '/members', cap: 'customer:read' }`.
- **The D67 redemptions route has NO `userId` filter** (verified). So the customer detail page CANNOT deep-link to `/redemptions?userId=...` today. v1 computes redemption count + last-redemption-date directly in the customer detail service (above). Adding a `userId` filter to the D67 route is an OPTIONAL, additive convenience (Task 2b) so a future "View this customer's redemptions" link works; it is NOT required for v1 and does not gate this slice.

### Prototype anchor

- `docs/superpowers/prototype-references/admin-panel/README.md`: Ops Home (Screen 1.2) shows a full 9-group nav including "Members" and "Revenue", a "subscription snapshot", and DPIA-gated platform analytics shown as gated. Fidelity is directional for this operational v1, not pixel-exact. v1 ships the Members directory + detail only; Revenue/MRR and DPIA-gated analytics are explicitly OUT. Behavioural/demographic/cohort data stays DPIA-gated, default-off, untouched.

---

### Task 1: Backend — `GET /api/v1/admin/customers` (Members directory list)

**Files:**
- Create: `src/api/admin/customers/format.ts` (curated `CUSTOMER_ROW_SELECT`, derived subscription-state helper, `toAdminCustomerRow` mapper)
- Create: `src/api/admin/customers/service.ts` (`buildAdminCustomerWhere`, `listAdminCustomers`)
- Create: `src/api/admin/customers/routes.ts` (`adminCustomerRoutes`, `GET` list)
- Modify: `src/api/admin/plugin.ts` (register `adminCustomerRoutes`)
- Test: `tests/api/admin/customers/format.test.ts`, `tests/api/admin/customers/service.test.ts` (unit lane, no DB)

- [ ] **Step 1 (TDD):** failing unit tests for `format.ts`:
  - `CUSTOMER_ROW_SELECT` has EXACTLY the key set `{ id, firstName, lastName, email, status, createdAt, subscription: { select: { status, cancelAtPeriodEnd, currentPeriodEnd, plan: { select: { name, billingInterval } } } } }` (exact-key-set test).
  - `CUSTOMER_ROW_SELECT` NEVER selects `passwordHash`, `phone`, `phoneCountryCode`, `dateOfBirth`, `gender`, any address/location field, `stripeCustomerId`, `interests`, `newsletterConsent`, `marketingConsentAt`, `profileImageUrl` (explicit "never selects PII" pins, one assertion per forbidden field — the redaction pin).
  - `deriveSubscriptionState(subscription | null)` returns `none` for null; `trialling|active|past_due|cancelled|expired` mapping `TRIALLING|ACTIVE|PAST_DUE|CANCELLED|EXPIRED` (1:1, lower-snake); throws/`never`-guards an unknown enum value so a new DB enum can't silently mislabel.
  - `toAdminCustomerRow` maps to `{ id, name (formatted first+last, "Customer" fallback when both empty), email, status, createdAt (ISO), isTestAccount (from isQaAccountEmail(email)), subscription: { state, planName|null, billingInterval|null, cancelAtPeriodEnd, currentPeriodEnd|null } }`. Decimal never appears (planName/interval are strings). `isTestAccount` reuses `isQaAccountEmail` (import from `src/api/customer/discovery/qaAccountFilter.ts`), not a re-rolled check.
- [ ] **Step 2:** implement `format.ts`. Name rendering for the admin tier is the FULL name (`[firstName, lastName].filter(Boolean).join(' ')` with a `'Customer'` fallback), NOT `formatCustomerName` (that is the merchant OD4 mask; the admin tier is explicitly allowed the full name). Document this divergence in a header comment.
- [ ] **Step 3 (TDD):** failing unit tests for `service.ts::buildAdminCustomerWhere`:
  - `q` builds a case-insensitive `OR` over `firstName` / `lastName` / `email` `contains` (bounded; see route cap). No other field is searchable (search is NOT a PII side-door: never search phone/address).
  - `status` filter maps to `where.status`.
  - subscription-state filter: `none` → `where.subscription: { is: null }`; a concrete state → `where.subscription: { is: { status: <ENUM> } }`.
  - `includeTest === false` → excludes QA-email rows: `where.email` `notIn` `QA_ACCOUNT_EMAILS` AND a `NOT` endsWith over `QA_ACCOUNT_EMAIL_DOMAINS` (case-insensitive; reuse the helper's lists, do not hardcode). `includeTest` default TRUE (param absent → include).
- [ ] **Step 4:** implement `service.ts`. `listAdminCustomers(prisma, filters, { limit, offset })` = `Promise.all([user.count({ where }), user.findMany({ where, orderBy: { createdAt: 'desc' }, skip: offset, take: limit, select: CUSTOMER_ROW_SELECT })])` → `{ items: rows.map(toAdminCustomerRow), total, limit, offset }`. Ordering carries no `id` tie-break requirement unless flakiness appears; add `orderBy: [{ createdAt: 'desc' }, { id: 'desc' }]` for a deterministic total order across offset pages (mirrors D67 rationale).
- [ ] **Step 5:** implement `routes.ts`. `prefix = '/api/v1/admin/customers'`; `GET` gated `preHandler: [requireAdminCapability('customer:read')]`. `filterSchema`: `q: z.string().max(120).optional()`, `status: z.enum(['ACTIVE','INACTIVE','SUSPENDED','DELETED']).optional()`, `subscriptionState: z.enum(['none','trialling','active','past_due','cancelled','expired']).optional()`, `includeTest` literal-token transform (default true), `limit: z.coerce.number().int().min(1).max(100).default(25)`, `offset: z.coerce.number().int().min(0).default(0)`. Register in `plugin.ts`. NO per-row audit.
- [ ] **Step 6:** `npx prisma generate` then `npx tsc --noEmit` clean; `npm run test:unit` green. Commit.

### Task 2: Backend — `GET /api/v1/admin/customers/:id` (customer detail)

**Files:**
- Create/extend: `src/api/admin/customers/format.ts` (`CUSTOMER_DETAIL_SELECT`, `toAdminCustomerDetail`)
- Extend: `src/api/admin/customers/service.ts` (`getAdminCustomerDetail`)
- Extend: `src/api/admin/customers/routes.ts` (`GET /:id`, audited)
- Extend: `src/api/shared/audit.ts` (fire-and-forget actor variant + `ADMIN_CUSTOMER_VIEWED` event literal)
- Test: extend `format.test.ts` (detail redaction pins + cycle passthrough), `tests/api/shared/audit.test.ts` (actor variant)

- [ ] **Step 1 (TDD):** failing tests for `CUSTOMER_DETAIL_SELECT` exact-key-set + redaction pins (same forbidden-field list as Task 1; the detail select adds ONLY `subscription.cycleAnchorDate`, `subscription.currentPeriodStart`, `subscription.createdAt`, `subscription.cancelledAt`, `subscription.plan.priceGbp` + `subscription.plan.billingInterval`, and `_count: { redemptions: true }` — still NO phone/address/behavioural field).
- [ ] **Step 2 (TDD):** failing test for `toAdminCustomerDetail(user, now)`: emits `{ id, name, email, status, createdAt, subscription: null | { state, planName, priceGbp (Number), billingInterval, currentPeriodStart, currentPeriodEnd, cancelAtPeriodEnd, cancelledAt, cycleAnchorDate, currentCycle: { start, end } } , redemptionCount, lastRedemptionAt }`. `currentCycle` MUST come from `getCurrentCycleWindow(cycleAnchorDate, now)` (assert the mapper calls the real helper / matches its output for a known anchor+now; NEVER re-derive). When `subscription` is null, `currentCycle` is null (no anchor). `priceGbp` Decimal coerced to Number. NO redemption CODE list (only the count + last date).
- [ ] **Step 3:** implement. `getAdminCustomerDetail(prisma, id, now)` reads the user with `CUSTOMER_DETAIL_SELECT` (includes `_count.redemptions`), plus a `lastRedemptionAt` via `voucherRedemption.findFirst({ where: { userId: id }, orderBy: { redeemedAt: 'desc' }, select: { redeemedAt: true } })`. Returns `null`/throws `CUSTOMER_NOT_FOUND` (mirror the merchants `NOT_FOUND` convention) when the user does not exist. DELETED users ARE returned (honest status), not hidden.
- [ ] **Step 4:** add `writeAuditLogWithActor` (fire-and-forget, actor-carrying) to `audit.ts` + the `ADMIN_CUSTOMER_VIEWED` event literal. Unit-test the helper writes `actorId`/`actorType`/`entityType: 'customer'`/`event`.
- [ ] **Step 5:** implement `GET /:id` gated `customer:read`; on a successful read, `writeAuditLogWithActor(app.prisma, { entityId: id, entityType: 'customer', event: 'ADMIN_CUSTOMER_VIEWED', actorId: req.user.sub, actorType: 'ADMIN', ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' })`. Audit fires AFTER the row is found (do not audit a 404 as a view).
- [ ] **Step 6:** `npx tsc --noEmit` clean; `npm run test:unit` green. Commit.

### Task 2b (OPTIONAL, additive): `userId` filter on the D67 redemptions route

**Only if the detail page's "View this customer's redemptions" link is wanted in v1.** Additive: extend the D67 `filterSchema` with `userId: z.string().optional()` and `buildAdminRedemptionWhere` with `if (f.userId) where.userId = f.userId`. No PII change (redemption rows already mask the customer name via OD4). Gated on the existing `redemption:read`. If skipped, the detail page shows the count + last date only, no cross-link. Skippable without blocking S4.

### Task 3: Capability + mirror + nav + fail-closed states

**Files:**
- Modify: `src/api/admin/capability.ts` (add `customer:read` to the union + `ALL_SLICE1_CAPS`)
- Modify: `apps/admin-web/lib/auth/session.ts` (mirror: add `customer:read` to the union + `ALL_SLICE1_CAPS`, aligned comment)
- Modify: `apps/admin-web/components/admin-shell.tsx` (add the Members nav item)
- Test: extend the capability unit tests (both trees) that assert OPERATIONS holds the Slice-1 caps and FINANCE/CONTENT/SUPPORT do not; assert `SUPER_ADMIN` short-circuits `customer:read`.

- [ ] **Step 1 (TDD):** failing tests: backend `adminHasCapability('OPERATIONS','customer:read') === true`, `('FINANCE','customer:read') === false`, `('SUPER_ADMIN','customer:read') === true`, `(undefined, ...) === false`. Mirror the same in the admin-web `session.test.ts`.
- [ ] **Step 2:** add `customer:read` to BOTH `AdminCapability` unions and BOTH `ALL_SLICE1_CAPS` arrays, with a doc comment on each ("gates the read-only Members directory + detail; single cap covers customer identity + subscription state; a distinct subscription/finance cap is deferred to the admin-grant/MRR surface. Keep the two trees aligned."). Grant is OPERATIONS + SUPER_ADMIN (via `ALL_SLICE1_CAPS` + short-circuit). NOT granted to FINANCE (v1: FINANCE holds nothing; a finance revenue surface is a later, separate decision — see FLAGS).
- [ ] **Step 3:** add `{ label: 'Members', href: '/members', cap: 'customer:read' }` to `NAV_ITEMS`. Tests green. Commit.

### Task 4: admin-web — Members directory page + detail page

**Files:**
- Create: `apps/admin-web/lib/api/customers.ts` (Zod-validated `customersApi.list` + `customersApi.get`)
- Create: `apps/admin-web/lib/members/useCustomers.ts` + `useCustomerDetail.ts` (React Query hooks, `enabled` gated on `can('customer:read')`)
- Create: `apps/admin-web/app/(app)/members/page.tsx` (directory; mirror `redemptions/page.tsx`)
- Create: `apps/admin-web/app/(app)/members/[id]/page.tsx` (detail)
- Test: `apps/admin-web/app/(app)/members/__tests__/page.test.tsx`, `.../[id]/__tests__/page.test.tsx`, and `lib/api/__tests__/customers.test.ts`

- [ ] **Step 1 (TDD):** failing `lib/api/customers.ts` tests: response schemas parse the row/detail shape; the query-string builder sets `q`/`status`/`subscriptionState`/`includeTest`/`limit`/`offset` only when present; a malformed field surfaces a Zod error, not `undefined`.
- [ ] **Step 2:** implement `customers.ts` mirroring `redemptions.ts` (`apiFetch`, `URLSearchParams`, `.parse()`). Row schema: `{ id, name, email, status, createdAt, isTestAccount, subscription: { state, planName, billingInterval, cancelAtPeriodEnd, currentPeriodEnd } }`. Detail schema adds the cycle window + counts.
- [ ] **Step 3 (TDD):** failing directory page tests: renders `ForbiddenState` (`data-testid`) when `!can('customer:read')` and does NOT fire a request (hook `enabled:false`); renders rows with name + email + status badge + subscription-state badge + a "Test" badge when `isTestAccount`; the "Include test data" toggle defaults ON; search submits on Enter; the subscription-state filter chips issue the right `subscriptionState` param; DELETED rows render with a "Deleted" status badge (not hidden); pagination chevrons page by offset.
- [ ] **Step 4:** implement the directory page (mirror `redemptions/page.tsx`: `ForbiddenState`/`LoadingState`/`ErrorState`, chips, search, toggle, offset pager). Neutral shadcn styling, `lucide-react` icons (e.g. `Users` for the header, `AlertCircle` forbidden), no emoji, no brand colours, copy uses `:` `;` `()` `·` and no em-dash. Row links to `/members/[id]`.
- [ ] **Step 5 (TDD + impl):** failing detail page tests: `ForbiddenState` when capability-less; renders account status, subscription state + plan + price + billing interval, `cancelAtPeriodEnd` note, `cycleAnchorDate` + the current cycle window (start/end), redemption count + last redemption date; free (subscription null) renders a "Free tier (no subscription)" state with NO cycle block; NO redemption-code list anywhere. Implement.
- [ ] **Step 6:** admin-web `npx jest` green. Commit.

### Task 5: Full verification + security self-review + docs

- [ ] backend: `npx prisma generate` then `npx tsc --noEmit` clean; `npm run test:unit` green (report exact file/test counts; the format redaction-pin suite + service suite + audit-actor suite present).
- [ ] admin-web: `npx jest` green (report exact suite/test counts; new Members directory + detail + api-client suites present).
- [ ] admin-web: `npx next build` PASSES (mandatory; Next 15 catches what tsc/lint/jest miss — `feedback_admin_web_next_build_verification`).
- [ ] Update `docs/deferrals/open-register.md` (or the admin slice roadmap) with an S4 row: implemented on this branch, not merged; the deferred items in "What is OUT".
- [ ] Run the Opus adversarial-review checkpoint (below). Only after it passes: push `feat/admin-members-subscriptions-readonly-v1`; open the S4 implementation PR. NO merge.

---

## SECURITY SEAMS (call out explicitly; verify each at review)

1. **Redaction pin is the primary control.** The ONLY PII gate is the curated `CUSTOMER_ROW_SELECT` / `CUSTOMER_DETAIL_SELECT`. A blind `select`-less `findMany` or a `...spread` would leak `passwordHash`/`phone`/address/location. Pinned by exact-key-set + per-forbidden-field "never selects" unit tests. Any later field addition MUST update the pin test first.
2. **Search is not a PII side-door.** `q` searches ONLY `firstName`/`lastName`/`email`, bounded (`max(120)`), case-insensitive `contains`. It NEVER searches phone/address/DOB, and the response echoes only tier fields, so search cannot be used to enumerate or confirm hidden PII. The global admin auth-scope rate limit backstops enumeration; no new per-route limiter needed for v1 (note it if abuse appears).
3. **Two-layer capability gating (mandatory).** UI mirror (`hasCapability`) gates the nav item, the page render (`ForbiddenState`), and the React Query `enabled` (no guaranteed-403 request). Backend `requireAdminCapability('customer:read')` is the real enforcement (defence-in-depth). Never rely on only one. FINANCE/CONTENT/SUPPORT get a `ForbiddenState`, not data.
4. **Audit is targeted, not blanket.** DETAIL reads write `ADMIN_CUSTOMER_VIEWED` (actor + customer id); the list does not. This is the D60 "access audited" seam: opening a person is attributable; browsing is not logged (and would flood the log). Confirm the audit fires only on a found row, never on a 404.
5. **DELETED / scrubbed PII.** DELETED users are shown honestly (status badge) but the select only returns tier fields; do not add any code path that resurrects PII a deletion may have cleared. No aggregate re-identification risk (no cohort/demographic surface exists here).
6. **No revenue math.** No MRR/price aggregate is computed anywhere (the plan's price fields are per-row display only, coerced from Decimal). MRR definition is an unresolved owner stop-and-flag (below); v1 ships zero revenue tiles.
7. **No new capability sprawl.** Single `customer:read`; do not add `subscription:read` speculatively (documented trigger for the future split is the admin-grant/finance surface).

## Opus adversarial-review checkpoint (BEFORE opening the PR)

Dispatch an Opus reviewer (model: opus) with this diff and the security seams above. Required checks, each with evidence:
- Grep the two `SELECT` constants and confirm NO forbidden field appears; confirm the exact-key-set tests exist and are green.
- Confirm no route returns `phone`, `passwordHash`, any address/location field, `stripeCustomerId`, or behavioural/demographic data on ANY code path (list, detail, error).
- Confirm both capability layers are wired and a FINANCE token gets 403 (backend) + `ForbiddenState` (UI); confirm the mirror union/array matches the backend verbatim.
- Confirm the detail read audits with actor+customer-id and only on success; the list does not audit.
- Confirm `getCurrentCycleWindow` is CALLED, not re-implemented.
- Confirm `includeTest` uses the literal-token transform (not `z.coerce.boolean`) and that the test-account flag/filter reuse `isQaAccountEmail`/`QA_ACCOUNT_*` (no re-rolled list).
- Confirm `next build` passes and no schema change was introduced.

## What is OUT of v1 (deferred, do not build)

- Phone number (any surface). Any address/location/DOB/gender/demographic field.
- MRR / revenue tiles / any subscription revenue aggregate (MRR definition is an unresolved owner decision — FLAG).
- CSV / export of any kind.
- ALL mutations: no edit, no suspend, no cancel, no refund.
- Admin-grant subscriptions (separate open owner decision).
- Behavioural / demographic / cohort / interests / where-from data (DPIA-gated, default-off, untouched).
- Customer-360 tabs beyond the v1 basics (activity timeline, communications, favourites, reviews-by-customer, device/session list): out.
- A FINANCE-role grant of `customer:read` (v1 grants OPERATIONS + SUPER_ADMIN only).
- The prototype's "Revenue" nav group and DPIA-gated platform analytics.

---

## FLAGS FOR OWNER

**FLAG 1 — `User` has no `isTestData` column; the test/real distinction is email-derived.** Unlike the D67 redemptions view (which filters `VoucherRedemption.isTestData`), the Members directory cannot column-filter test customers. The plan reuses the existing `isQaAccountEmail` helper (`QA_ACCOUNT_EMAILS = ['customer@redeemo.com']`, `QA_ACCOUNT_EMAIL_DOMAINS = ['redeemo.dev']`) to compute a per-row `isTestAccount` badge and an `includeTest` filter (default ON, like D67). This is NOT a schema change (no `User.isTestData` column is added). Consequence: any test/QA customer NOT matching those email patterns will not be badged or excluded. If the owner wants a first-class `User.isTestData` flag, that is a schema change and this slice becomes BLOCKED-ON-OWNER for that sub-part; the email-derived approach is the no-migration default and is what the plan proceeds with.

**FLAG 2 — subscription-state set includes `EXPIRED`, which the brief omitted.** The `SubscriptionStatus` enum is `TRIALLING | ACTIVE | CANCELLED | EXPIRED | PAST_DUE`; the brief's suggested filter set ("none/free/active/trialling/past-due/cancelled") did not list `EXPIRED`. The plan surfaces all real states plus `none` (free): `none · trialling · active · past_due · cancelled · expired`. "free" and "none" are the same (a customer with no `Subscription` row); the filter token is `none`. Confirm this state set (and that `cancelAtPeriodEnd` is shown as a modifier flag on active rows, not a distinct state).

**FLAG 3 — MRR remains an unresolved stop-and-flag; v1 ships no revenue tile.** Per the owner constraint, no MRR tile is built (the MRR definition — which statuses count, trial handling, IAP vs Stripe, currency timing — is undefined). Recorded here as the trigger for a future FINANCE/Revenue surface, which is also the natural point to introduce a distinct subscription/finance capability (see the single-`customer:read` justification). No action needed for S4; flagged so it is not silently forgotten.

**FLAG 4 — no schema change is required for v1.** The plan stays entirely within existing columns and one existing helper; the only backend additions are a fire-and-forget audit variant and a String-column audit-event literal (neither is a migration). If implementation uncovers a genuine need for a schema change (e.g. the owner chooses a real `User.isTestData` flag per FLAG 1), STOP and mark BLOCKED-ON-OWNER at that task rather than shipping a migration inside a plan scoped as no-schema-change.
