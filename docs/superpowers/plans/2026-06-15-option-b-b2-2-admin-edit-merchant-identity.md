# Option B B2.2: Admin Edit Merchant Identity Fields (vatNumber / companyNumber) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a SUPER_ADMIN edit a merchant's registered identity fields (`vatNumber`, `companyNumber`) on the merchant's behalf, behind a new capability + mandatory reason + explicit confirmation, with a distinct audit event, surfaced as a dedicated "Business registration" card and dialog on the admin merchant detail page.

**Architecture:** Reuse the shipped B2.1 service seam (`updateMerchantProfileDirectCore`, which already filters to `DIRECT_SIMPLE_FIELDS` that include vat/company) so there is no second apply path and "no weaker path" holds. Add only: a new SUPER_ADMIN-only capability `merchant:edit-identity`; a distinct audit event `MERCHANT_IDENTITY_UPDATED` (TS-union only, no DB migration) passed via a new optional `event` param on the core; a separate guarded route `PATCH /api/v1/admin/merchants/:id/identity`; vat/company exposed read-only on the existing `merchant:read` detail payload; and a separate admin-web card + dialog + client + hook. No schema or migration.

**Tech Stack:** Backend Fastify 5 + Prisma 7 (Neon Postgres 16), Vitest (mock `test:unit` + real-DB `*.integration.test.ts`). Admin-web Next 15 App Router + React 19 + React Query v5 + Tailwind 4, Jest + jsdom.

---

## Context the implementer needs (live code, inspected 2026-06-15)

- **The seam already writes vat/company.** `src/api/merchant/profile/service.ts:16` `DIRECT_SIMPLE_FIELDS = ['websiteUrl', 'vatNumber', 'companyNumber']`. `updateMerchantProfileDirectCore` (lines 36-71) filters `updates` to that list, captures `before` (selects `websiteUrl, vatNumber, companyNumber`), then `prisma.$transaction(update + writeAuditLogTx)` with `event: 'MERCHANT_PROFILE_UPDATED'`, `actorType: actor.type`, before/after, reason. The merchant self-serve `updateMerchantProfile` and the B2.1 admin website route both delegate to it.
- **vat/company are NOT sensitive.** `SENSITIVE_FIELDS = ['businessName', 'tradingName', 'logoUrl', 'bannerUrl', 'description']` (line 8) are the only fields routed to the B1 edit-request lane. vat/company are DIRECT (merchant can self-edit them at any time). B2.2 is an admin-side policy slice, NOT a sensitivity reclassification, and does NOT touch the B1 lane.
- **Capability model** `src/api/admin/capability.ts`: `AdminCapability` union; `ALL_SLICE1_CAPS`; `ROLE_CAPABILITIES` (OPERATIONS = all; FINANCE/CONTENT/SUPPORT = none); `adminHasCapability(role, cap)` short-circuits `SUPER_ADMIN -> true`; `requireAdminCapability(cap)` preHandler 403s `ADMIN_CAPABILITY_DENIED`. A capability added to the union but NOT to `ALL_SLICE1_CAPS` is held ONLY by SUPER_ADMIN.
- **Admin-web mirror** `apps/admin-web/lib/auth/session.ts`: a deliberate copy of the union + `ROLE_CAPABILITIES` + `hasCapability`. `useSession()` (in `useSession.ts`) exposes `{ ready, role, can(cap), adminId }`.
- **Read endpoint** `src/api/admin/merchants/service.ts:97-139` `getMerchantDetail`: TIGHT explicit selects; currently does NOT select vat/company (comment line 93 "excluded, they belong to B2.2"); `redemptionPin` and branch secrets NEVER selected; soft-deleted branches excluded. Route `GET /api/v1/admin/merchants/:id` gated `merchant:read` in `src/api/admin/merchants/routes.ts:36-39`.
- **Route file** `src/api/admin/merchants/routes.ts`: `adminMerchantRoutes(app)`; the B2.1 `PATCH ${prefix}/:id/profile` (lines 95-116) is the route precedent; helpers `idParam(req)` and `auditCtx(req)` at lines 73-74; `resolveTargetMerchantForAdmin` (does NOT block SUSPENDED) and `updateMerchantProfileDirectCore` already imported.
- **Audit registry** `src/api/shared/audit.ts:3` `AuditEvent` closed TS union; `AuditLog.event` is a plain `String` column (`prisma/schema.prisma:327`), so a new event is union-only (NO migration). No test pins the closed event set; integration tests assert specific event strings via `where: { entityId, event }`.
- **Resolver** `src/api/merchant/shared.ts`: `EditActor = { type: 'MERCHANT_ADMIN' | 'ADMIN'; id: string; reason? }`; `resolveTargetMerchantForAdmin(prisma, id) -> { merchantId, status }`, throws `MERCHANT_NOT_FOUND`, does NOT block SUSPENDED.
- **Admin-web B2.1-web surfaces** to extend: `app/(app)/merchants/[id]/page.tsx` (Website card precedent), `features/merchants/EditMerchantWebsiteDialog.tsx` (dialog precedent), `features/merchants/SuspendDialog.tsx` (reason + confirm-checkbox precedent), `lib/api/merchants.ts` (`editProfile` + `merchantDetailSchema`), `lib/merchants/useMerchantActions.ts` (`useEditMerchantProfile` + `useInvalidateAfterEdit`), `lib/merchants/useMerchantDetail.ts` (`merchantDetailQueryKey`).
- **Existing tests to extend/mirror:** `tests/api/admin/admin-merchant-edit-routes.test.ts` (mock; note line 94 already pins `/:id/profile` 400s on `vatNumber` - that pin MUST stay green, proving the website route is NOT widened), `admin-merchant-edit.integration.test.ts` (real-DB audit-row assertions), `merchant-detail-routes.test.ts` + `merchant-detail.integration.test.ts` (read payload + redaction). Admin-web: `lib/api/__tests__/merchants.test.ts`, `lib/merchants/__tests__/useMerchantActions.test.tsx`, `app/(app)/merchants/[id]/__tests__/page.test.tsx`, dialog tests under `features/merchants/__tests__/`.

## Cross-check table (plan need -> live code reality -> locked decision)

| # | B2.2 need | Live code reality | Locked decision |
|---|---|---|---|
| 1 | Write vat/company on the admin path | `updateMerchantProfileDirectCore` already filters to `DIRECT_SIMPLE_FIELDS` incl. vat/company | Reuse the core; add only a new guarded ROUTE (no second apply path) |
| 2 | Gate tighter than `merchant:edit` | `merchant:edit` held by OPERATIONS + SUPER_ADMIN | New `merchant:edit-identity`, in the union + mirror but NOT in `ALL_SLICE1_CAPS` -> SUPER_ADMIN-only |
| 3 | Do not break B2.1 `/:id/profile` gate | Test line 94 pins `/:id/profile` 400 on vatNumber | Separate route `PATCH /:id/identity`; leave `/:id/profile` byte-unchanged |
| 4 | UI must show + prefill vat/company | `getMerchantDetail` does NOT select them | Expose on the existing `merchant:read` detail payload (read for Operations; edit SUPER_ADMIN-only) |
| 5 | Confirmation before a high-risk edit | `SuspendDialog` reason+checkbox precedent | UI confirm checkbox AND backend `confirm: literal(true)` required |
| 6 | Distinct audit event | `AuditEvent` closed union, `event` is a String column, no closed-set test | Add `MERCHANT_IDENTITY_UPDATED`; pass via a new optional `event` param on the core (default unchanged). Churn = LOW |
| 7 | SUSPENDED-merchant editability | `resolveTargetMerchantForAdmin` does not block SUSPENDED | Reuse as-is; no go-live gate (vat/company are DIRECT, status-independent) |
| 8 | Field validation | merchant path does no format validation | Minimal: trim, empty-to-null. No UK regex this slice (recorded as future symmetric hardening) |

## File structure

**Backend (modify):**
- `src/api/shared/audit.ts` - add `'MERCHANT_IDENTITY_UPDATED'` to the `AuditEvent` union.
- `src/api/merchant/profile/service.ts` - add an optional `event: AuditEvent = 'MERCHANT_PROFILE_UPDATED'` param to `updateMerchantProfileDirectCore`; pass it into `writeAuditLogTx`.
- `src/api/admin/capability.ts` - add `'merchant:edit-identity'` to the `AdminCapability` union (NOT to `ALL_SLICE1_CAPS`); document SUPER_ADMIN-only.
- `src/api/admin/merchants/service.ts` - add `vatNumber`, `companyNumber` to the `getMerchantDetail` merchant select + return; update the redaction comment.
- `src/api/admin/merchants/routes.ts` - add `PATCH ${prefix}/:id/identity` gated `merchant:edit-identity`.

**Backend (tests):**
- Modify `tests/api/admin/admin-merchant-edit-routes.test.ts` (or add `admin-merchant-identity-routes.test.ts`) - identity route auth/capability/strict-body/confirm/reason.
- Add `tests/api/admin/admin-merchant-identity.integration.test.ts` - real-DB write + audit row + SUSPENDED + not-found.
- Modify `tests/api/admin/merchant-detail-routes.test.ts` + `merchant-detail.integration.test.ts` - vat/company present, redemptionPin still absent.
- Modify the capability unit test (wherever `adminHasCapability` is asserted) - new cap SUPER_ADMIN-only.

**Admin-web (modify):**
- `lib/auth/session.ts` - mirror `'merchant:edit-identity'` in the union (NOT in `ALL_SLICE1_CAPS`).
- `lib/api/merchants.ts` - add `vatNumber`/`companyNumber` to `merchantDetailSchema.merchant`; add `EditMerchantIdentityInput` + `merchantsApi.editIdentity`.
- `lib/merchants/useMerchantActions.ts` - add `useEditMerchantIdentity` (reuse `useInvalidateAfterEdit`).
- `app/(app)/merchants/[id]/page.tsx` - add the "Business registration" card + mount the dialog.

**Admin-web (create):**
- `features/merchants/EditMerchantIdentityDialog.tsx` - the dialog.
- `features/merchants/__tests__/EditMerchantIdentityDialog.test.tsx`, plus extend `lib/api/__tests__/merchants.test.ts`, `lib/merchants/__tests__/useMerchantActions.test.tsx`, `lib/auth/__tests__/session.test.ts` (or wherever the mirror is tested), `app/(app)/merchants/[id]/__tests__/page.test.tsx`.

---

## Task 1: Backend capability + audit event + core event param

**Files:**
- Modify: `src/api/shared/audit.ts` (add the event to the union)
- Modify: `src/api/admin/capability.ts` (add the capability, NOT to ALL_SLICE1_CAPS)
- Modify: `src/api/merchant/profile/service.ts` (optional event param on the core)
- Test: the existing capability unit test + the merchant profile test (`tests/api/merchant/profile.test.ts`) must stay green

- [ ] **Step 1: Add the audit event**

In `src/api/shared/audit.ts`, add to the `AuditEvent` union near the other `MERCHANT_*` profile events (after `MERCHANT_PROFILE_UPDATED`):

```ts
  | 'MERCHANT_PROFILE_UPDATED'
  // Option B B2.2: a SUPER_ADMIN edited a merchant's registered identity
  // fields (vatNumber / companyNumber) on the merchant's behalf. Distinct from
  // MERCHANT_PROFILE_UPDATED so high-risk identity changes are filterable in
  // the audit trail. event is a String column, so this is union-only (no migration).
  | 'MERCHANT_IDENTITY_UPDATED'
```

- [ ] **Step 2: Add the capability (SUPER_ADMIN-only)**

In `src/api/admin/capability.ts`, add to the `AdminCapability` union (after `merchant:edit`):

```ts
  | 'merchant:edit'
  // Option B B2.2: gates the admin edit of a merchant's registered identity
  // fields (vatNumber / companyNumber). Intentionally NOT in ALL_SLICE1_CAPS:
  // it is held ONLY by SUPER_ADMIN (via the superuser short-circuit in
  // adminHasCapability). OPERATIONS does NOT hold it - identity edits are a
  // higher bar than the websiteUrl / branch-contact edits gated by merchant:edit.
  | 'merchant:edit-identity'
```

Do NOT add `'merchant:edit-identity'` to `ALL_SLICE1_CAPS`. Leave `ROLE_CAPABILITIES` and `adminHasCapability` unchanged (the `SUPER_ADMIN -> true` short-circuit grants it).

- [ ] **Step 3: Add the optional event param to the core**

In `src/api/merchant/profile/service.ts`, import the `AuditEvent` type and add a 5th param to `updateMerchantProfileDirectCore`:

```ts
import { writeAuditLog, writeAuditLogTx, type AuditEvent } from '../../shared/audit'
```

```ts
export async function updateMerchantProfileDirectCore(
  prisma: PrismaClient,
  { merchantId, actor }: { merchantId: string; actor: EditActor },
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string },
  event: AuditEvent = 'MERCHANT_PROFILE_UPDATED'
) {
```

Inside the `$transaction`, pass it through:

```ts
    await writeAuditLogTx(tx, {
      entityId: merchantId,
      entityType: 'merchant',
      event,
      actorId: actor.id,
      actorType: actor.type,
      before,
      after: safe,
      reason: actor.reason,
      ipAddress: ctx.ipAddress,
      userAgent: ctx.userAgent,
    })
```

The merchant self-serve path and the B2.1 admin website route omit the 5th arg, so they keep `MERCHANT_PROFILE_UPDATED` unchanged.

- [ ] **Step 4: Run the backend type-check + the touched unit tests**

Run: `eval "$(fnm env)"; fnm use 24; npx tsc --noEmit && npx vitest run tests/api/merchant/profile.test.ts`
Expected: tsc clean; profile tests still PASS (the default param keeps the merchant path emitting `MERCHANT_PROFILE_UPDATED`).

- [ ] **Step 5: Commit**

```bash
git add src/api/shared/audit.ts src/api/admin/capability.ts src/api/merchant/profile/service.ts
git commit -m "feat(admin): add merchant:edit-identity cap + MERCHANT_IDENTITY_UPDATED event + core event param (B2.2)"
```

## Task 2: Expose vat/company on the read payload (merchant:read)

**Files:**
- Modify: `src/api/admin/merchants/service.ts:97-139` (`getMerchantDetail` select + return)
- Test: `tests/api/admin/merchant-detail-routes.test.ts`, `tests/api/admin/merchant-detail.integration.test.ts`

- [ ] **Step 1: Write/extend the failing read assertion**

In `tests/api/admin/merchant-detail.integration.test.ts`, add to the success-path assertions that the merchant payload exposes vat/company and still never exposes a branch `redemptionPin`. Seed the merchant with `vatNumber: 'GB999'`, `companyNumber: '12345678'` and assert:

```ts
expect(body.merchant.vatNumber).toBe('GB999')
expect(body.merchant.companyNumber).toBe('12345678')
expect(JSON.stringify(body)).not.toContain('redemptionPin')
```

In `tests/api/admin/merchant-detail-routes.test.ts`, extend the mock `findUnique` resolved value to include `vatNumber`/`companyNumber` and assert they pass through.

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/api/admin/merchant-detail-routes.test.ts`
Expected: FAIL (fields undefined - not yet selected).

- [ ] **Step 3: Add the fields to the select + return**

In `src/api/admin/merchants/service.ts` `getMerchantDetail`, add to the merchant `select` (alongside `websiteUrl`):

```ts
      websiteUrl: true,
      vatNumber: true,
      companyNumber: true,
      logoUrl: true,
```

Update the redaction comment block above the function: change "High-risk merchant fields (vatNumber/companyNumber) are excluded (they belong to B2.2)." to note they are now returned read-only for `merchant:read` display (edit is gated by `merchant:edit-identity`); `redemptionPin` and branch secrets remain excluded. `vatNumber`/`companyNumber` flow through the existing `...rest` spread, so no change to the return shape construction is needed.

- [ ] **Step 4: Run to verify it passes**

Run: `npx vitest run tests/api/admin/merchant-detail-routes.test.ts`
Expected: PASS. Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/admin/merchants/service.ts tests/api/admin/merchant-detail-routes.test.ts tests/api/admin/merchant-detail.integration.test.ts
git commit -m "feat(admin): expose vatNumber/companyNumber on merchant detail read (B2.2)"
```

## Task 3: Backend identity route (PATCH /:id/identity)

**Files:**
- Modify: `src/api/admin/merchants/routes.ts`
- Test: `tests/api/admin/admin-merchant-edit-routes.test.ts` (add an identity describe block; keep the existing `/:id/profile` pins green)

- [ ] **Step 1: Write the failing route tests**

In `tests/api/admin/admin-merchant-edit-routes.test.ts`, add a `describe('PATCH /admin/merchants/:id/identity', ...)` block mirroring the existing profile-route structure. Cases (use the existing `signAdmin(role)` + `app.inject` helpers and the prisma mock that returns `{ id, status, websiteUrl, vatNumber, companyNumber }` from `findUnique` and `{ id }` from `update`):

```ts
const identityUrl = '/api/v1/admin/merchants/m1/identity'

it('401 when unauthenticated', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl, payload: { vatNumber: 'GB1', reason: 'fix', confirm: true } })
  expect(res.statusCode).toBe(401)
})

it('403 ADMIN_CAPABILITY_DENIED for OPERATIONS (lacks merchant:edit-identity)', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl,
    headers: { authorization: `Bearer ${signAdmin('OPERATIONS')}` },
    payload: { vatNumber: 'GB1', reason: 'fix', confirm: true } })
  expect(res.statusCode).toBe(403)
})

it('200 for SUPER_ADMIN with vat/company + reason + confirm', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl,
    headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    payload: { vatNumber: 'GB999', companyNumber: '12345678', reason: 'companies house correction', confirm: true } })
  expect(res.statusCode).toBe(200)
})

it('400 when confirm is missing', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl,
    headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    payload: { vatNumber: 'GB1', reason: 'fix' } })
  expect(res.statusCode).toBe(400)
})

it('400 when confirm is false', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl,
    headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    payload: { vatNumber: 'GB1', reason: 'fix', confirm: false } })
  expect(res.statusCode).toBe(400)
})

it('400 when reason is missing', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl,
    headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    payload: { vatNumber: 'GB1', confirm: true } })
  expect(res.statusCode).toBe(400)
})

it('400 when a non-allow-listed key is sent (websiteUrl, strict body)', async () => {
  const res = await app.inject({ method: 'PATCH', url: identityUrl,
    headers: { authorization: `Bearer ${signAdmin('SUPER_ADMIN')}` },
    payload: { websiteUrl: 'https://x.com', reason: 'fix', confirm: true } })
  expect(res.statusCode).toBe(400)
})
```

Leave the existing `/:id/profile` tests (incl. the line-94 "400 on vatNumber" pin) untouched - they prove the website route is NOT widened.

- [ ] **Step 2: Run to verify the new cases fail**

Run: `npx vitest run tests/api/admin/admin-merchant-edit-routes.test.ts`
Expected: the new identity cases FAIL (route 404s / not defined); existing profile cases still PASS.

- [ ] **Step 3: Add the route**

In `src/api/admin/merchants/routes.ts`, after the B2.1 `PATCH ${prefix}/:id/profile` handler, add:

```ts
  // Option B B2.2: admin edit of a merchant's registered identity fields
  // (vatNumber / companyNumber) on the merchant's behalf. Gated on the
  // SUPER_ADMIN-only `merchant:edit-identity` capability (NOT `merchant:edit`).
  // STRICT body: only vat/company + reason + confirm; any other key (e.g.
  // websiteUrl / businessName) 400s before the service runs. `confirm: true` is
  // required (backend confirmation, not just the UI checkbox). The shared core
  // does the validation/apply/audit (the SAME path the merchant + B2.1 routes
  // run, no weaker path), tagged with the distinct MERCHANT_IDENTITY_UPDATED
  // event. resolveTargetMerchantForAdmin allows a SUSPENDED merchant.
  app.patch(`${prefix}/:id/identity`, { preHandler: [requireAdminCapability('merchant:edit-identity')] }, async (req: any) => {
    const body = z
      .object({
        vatNumber: z.string().trim().min(1).nullable().optional(),
        companyNumber: z.string().trim().min(1).nullable().optional(),
        reason: z.string().trim().min(1),
        confirm: z.literal(true),
      })
      .strict()
      .parse(req.body)

    const id = idParam(req)
    await resolveTargetMerchantForAdmin(app.prisma, id)

    const updates: Record<string, unknown> = {}
    if ('vatNumber' in body) updates.vatNumber = body.vatNumber
    if ('companyNumber' in body) updates.companyNumber = body.companyNumber

    return updateMerchantProfileDirectCore(
      app.prisma,
      { merchantId: id, actor: { type: 'ADMIN', id: req.user.sub, reason: body.reason } },
      updates,
      auditCtx(req),
      'MERCHANT_IDENTITY_UPDATED',
    )
  })
```

Note on empty-to-null: the Zod field `z.string().trim().min(1).nullable().optional()` accepts a non-empty string OR `null` OR omission. The admin-web dialog converts a blank input to `null` (clear) before sending, matching the B2.1 website/branch dialogs; an empty string is never sent.

- [ ] **Step 4: Run to verify all pass**

Run: `npx vitest run tests/api/admin/admin-merchant-edit-routes.test.ts`
Expected: PASS (new identity cases + existing profile cases). Then `npx tsc --noEmit` clean.

- [ ] **Step 5: Commit**

```bash
git add src/api/admin/merchants/routes.ts tests/api/admin/admin-merchant-edit-routes.test.ts
git commit -m "feat(admin): PATCH /admin/merchants/:id/identity (SUPER_ADMIN, confirm, reason) (B2.2)"
```

## Task 4: Backend integration test (real DB)

**Files:**
- Create: `tests/api/admin/admin-merchant-identity.integration.test.ts`

- [ ] **Step 1: Write the integration test**

Mirror `admin-merchant-edit.integration.test.ts` setup (real Neon, seed a merchant via the existing helpers, sign a SUPER_ADMIN token). Use bulk prefix-scoped teardown (`deleteMany` on a unique business-name prefix) with a 60s timeout, per the B1/B2.1 integration lesson. Assert:

```ts
// success path
const res = await app.inject({ method: 'PATCH', url: `/api/v1/admin/merchants/${merchantId}/identity`,
  headers: { authorization: `Bearer ${superAdminToken}` },
  payload: { vatNumber: 'GB424242', companyNumber: '87654321', reason: 'companies house correction', confirm: true } })
expect(res.statusCode).toBe(200)

const updated = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { vatNumber: true, companyNumber: true } })
expect(updated).toMatchObject({ vatNumber: 'GB424242', companyNumber: '87654321' })

const audit = await prisma.auditLog.findFirst({ where: { entityId: merchantId, event: 'MERCHANT_IDENTITY_UPDATED' }, orderBy: { createdAt: 'desc' } })
expect(audit).toBeTruthy()
expect(audit?.actorType).toBe('ADMIN')
expect(audit?.reason).toBe('companies house correction')
// before/after capture the changed fields
expect(audit?.after).toMatchObject({ vatNumber: 'GB424242', companyNumber: '87654321' })

// SUSPENDED merchant is editable (resolveTargetMerchantForAdmin does not block)
// -> suspend the merchant, repeat the PATCH, expect 200 + audit row

// not found
const nf = await app.inject({ method: 'PATCH', url: `/api/v1/admin/merchants/does-not-exist/identity`,
  headers: { authorization: `Bearer ${superAdminToken}` },
  payload: { vatNumber: 'GB1', reason: 'x', confirm: true } })
expect(nf.statusCode).toBe(404) // MERCHANT_NOT_FOUND
```

- [ ] **Step 2: Run the integration test locally (real DB)**

Run: `eval "$(fnm env)"; fnm use 24; npx vitest run tests/api/admin/admin-merchant-identity.integration.test.ts`
Expected: PASS. (Integration tests are NOT in the CI unit gate; run locally.)

- [ ] **Step 3: Commit**

```bash
git add tests/api/admin/admin-merchant-identity.integration.test.ts
git commit -m "test(admin): B2.2 identity edit integration (write + audit + suspended + 404)"
```

## Task 5: Admin-web capability mirror + API client + detail schema

**Files:**
- Modify: `apps/admin-web/lib/auth/session.ts` (mirror the capability)
- Modify: `apps/admin-web/lib/api/merchants.ts` (schema fields + editIdentity)
- Test: `apps/admin-web/lib/auth/__tests__/session.test.ts` (or the existing capability test), `apps/admin-web/lib/api/__tests__/merchants.test.ts`

- [ ] **Step 1: Mirror the capability**

In `apps/admin-web/lib/auth/session.ts`, add `'merchant:edit-identity'` to the `AdminCapability` union with a comment, and do NOT add it to `ALL_SLICE1_CAPS` (keep it aligned with the backend: SUPER_ADMIN-only via the `hasCapability` short-circuit).

- [ ] **Step 2: Add the capability mirror test**

Add to the session/capability test:

```ts
expect(hasCapability('SUPER_ADMIN', 'merchant:edit-identity')).toBe(true)
expect(hasCapability('OPERATIONS', 'merchant:edit-identity')).toBe(false)
expect(hasCapability('SUPPORT', 'merchant:edit-identity')).toBe(false)
```

- [ ] **Step 3: Extend the detail schema + add editIdentity**

In `apps/admin-web/lib/api/merchants.ts`, add to `merchantDetailSchema.merchant`:

```ts
    websiteUrl: z.string().nullable(),
    vatNumber: z.string().nullable(),
    companyNumber: z.string().nullable(),
    logoUrl: z.string().nullable(),
```

Add the input type + the client call (mirror `editProfile`):

```ts
export interface EditMerchantIdentityInput {
  vatNumber?: string | null
  companyNumber?: string | null
  reason: string
  confirm: true
}
```

```ts
  /**
   * Edit a merchant's registered identity fields (vatNumber / companyNumber) on
   * the merchant's behalf (B2.2, `merchant:edit-identity`-gated; SUPER_ADMIN
   * only). reason + confirm are mandatory; the change is audited as
   * MERCHANT_IDENTITY_UPDATED. The return is parsed minimally (UI re-reads via
   * query invalidation). Throws ApiError (MERCHANT_NOT_FOUND).
   */
  editIdentity: async (id: string, input: EditMerchantIdentityInput): Promise<{ id: string }> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${id}/identity`, {
      method: 'PATCH',
      auth: true,
      body: JSON.stringify(input),
    })
    return editAckSchema.parse(raw)
  },
```

- [ ] **Step 4: Add the client test**

In `apps/admin-web/lib/api/__tests__/merchants.test.ts`, add a case asserting `editIdentity` calls `PATCH /api/v1/admin/merchants/<id>/identity` with `auth: true` and the exact body, and parses `{ id }`. Also assert `merchantDetailSchema` accepts a payload with vat/company and tolerates drift (existing `.or(z.string())` pattern unaffected).

- [ ] **Step 5: Run + commit**

Run: `cd apps/admin-web; eval "$(fnm env)"; fnm use 24; npx jest lib/api lib/auth`
Expected: PASS.

```bash
git add apps/admin-web/lib/auth/session.ts apps/admin-web/lib/auth/__tests__/session.test.ts apps/admin-web/lib/api/merchants.ts apps/admin-web/lib/api/__tests__/merchants.test.ts
git commit -m "feat(admin-web): merchant:edit-identity mirror + editIdentity client + detail vat/company (B2.2)"
```

## Task 6: Admin-web edit hook

**Files:**
- Modify: `apps/admin-web/lib/merchants/useMerchantActions.ts`
- Test: `apps/admin-web/lib/merchants/__tests__/useMerchantActions.test.tsx`

- [ ] **Step 1: Add the hook**

In `useMerchantActions.ts`, add (reusing the existing `useInvalidateAfterEdit(merchantId)`):

```ts
import type { ..., EditMerchantIdentityInput } from '@/lib/api/merchants'
```

```ts
export function useEditMerchantIdentity(merchantId: string) {
  const invalidate = useInvalidateAfterEdit(merchantId)
  return useMutation<{ id: string }, Error, EditMerchantIdentityInput>({
    mutationFn: (input) => merchantsApi.editIdentity(merchantId, input),
    onSuccess: invalidate,
    onError: invalidate,
  })
}
```

- [ ] **Step 2: Add the hook test**

Mirror the existing `useEditMerchantProfile` test: assert `invalidateQueries` is called with `merchantDetailQueryKey(merchantId)` AND `MERCHANTS_LIST_KEY` on success AND on error (mock `merchantsApi.editIdentity` to resolve, then to reject).

- [ ] **Step 3: Run + commit**

Run: `cd apps/admin-web; npx jest lib/merchants`
Expected: PASS.

```bash
git add apps/admin-web/lib/merchants/useMerchantActions.ts apps/admin-web/lib/merchants/__tests__/useMerchantActions.test.tsx
git commit -m "feat(admin-web): useEditMerchantIdentity hook (invalidate detail + list) (B2.2)"
```

## Task 7: Admin-web EditMerchantIdentityDialog

**Files:**
- Create: `apps/admin-web/features/merchants/EditMerchantIdentityDialog.tsx`
- Test: `apps/admin-web/features/merchants/__tests__/EditMerchantIdentityDialog.test.tsx`

- [ ] **Step 1: Write the dialog**

Model on `EditMerchantWebsiteDialog.tsx` + the `SuspendDialog` confirm-checkbox. Props: `{ merchantId, currentVatNumber: string | null, currentCompanyNumber: string | null, onSuccess, onCancel }`. State: `vatNumber`, `companyNumber` (prefilled, clearable -> null), `reason`, `confirmed` (checkbox). `canSubmit = reason.trim().length > 0 && confirmed && !mutation.isPending`. On submit send exactly:

```ts
await mutation.mutateAsync({
  vatNumber: toNullable(vatNumber),
  companyNumber: toNullable(companyNumber),
  reason: reason.trim(),
  confirm: true,
})
```

Use the shared `<Dialog>` (label "Edit business registration", `initialFocusRef` on the VAT input), `<Input>` for vat/company with labels + "Leave a field blank to clear it." helper, a styled `<input type="checkbox">` for confirmation with the text "I confirm I am changing this merchant's registered identity on their behalf.", a reason `<textarea>`, the audit-on-behalf note ("Recorded in the audit log as an admin change on the merchant's behalf."), `<NamedGateBanner error={mutation.error} />`, and Cancel/Save buttons (Save `disabled={!canSubmit}`). Use testids `edit-merchant-identity-vat`, `-company`, `-confirm`, `-reason`, `-submit`, `-cancel`, panel `edit-merchant-identity-dialog`.

- [ ] **Step 2: Write the dialog test**

Assert: Save disabled when reason empty; Save disabled when reason present but checkbox unchecked; Save disabled when checkbox checked but reason empty; Save enabled when both satisfied; submit sends a body whose keys are EXACTLY `['companyNumber','confirm','reason','vatNumber']` (`Object.keys(arg).sort()`), with `confirm === true`; blank vat -> null; `NamedGateBanner` renders on mutation error.

- [ ] **Step 3: Run + commit**

Run: `cd apps/admin-web; npx jest features/merchants/__tests__/EditMerchantIdentityDialog.test.tsx`
Expected: PASS.

```bash
git add apps/admin-web/features/merchants/EditMerchantIdentityDialog.tsx apps/admin-web/features/merchants/__tests__/EditMerchantIdentityDialog.test.tsx
git commit -m "feat(admin-web): EditMerchantIdentityDialog (reason + confirm, strict body) (B2.2)"
```

## Task 8: Admin-web "Business registration" card on the detail page

**Files:**
- Modify: `apps/admin-web/app/(app)/merchants/[id]/page.tsx`
- Test: `apps/admin-web/app/(app)/merchants/[id]/__tests__/page.test.tsx`

- [ ] **Step 1: Write the card + dialog wiring**

Add a "Business registration" `<section>` below the Website card, showing `VAT number` and `Company number` (value or "Not set"), each on its own row. Add an Edit button rendered only when `canEditIdentity = can('merchant:edit-identity')`:

```ts
const canEditIdentity = can('merchant:edit-identity')
```

Extend the `OpenDialog` union with `{ kind: 'identity' }` and the dialog mount:

```tsx
{dialog?.kind === 'identity' && data && (
  <EditMerchantIdentityDialog
    merchantId={data.merchant.id}
    currentVatNumber={data.merchant.vatNumber}
    currentCompanyNumber={data.merchant.companyNumber}
    onSuccess={onDialogSuccess}
    onCancel={closeDialog}
  />
)}
```

Use testids `merchant-identity-card`, `merchant-vat-value`, `merchant-company-value`, `merchant-identity-edit`.

- [ ] **Step 2: Extend the page test**

Assert: the identity card renders with the vat/company values; the Edit button is PRESENT for a SUPER_ADMIN session (`can` returns true for `merchant:edit-identity`); the Edit button is ABSENT for an OPERATIONS session (has `merchant:read` + `merchant:edit` but not `merchant:edit-identity`); clicking Edit mounts the identity dialog. Reuse the page test's `mockSession({ can })` helper.

- [ ] **Step 3: Run + commit**

Run: `cd apps/admin-web; npx jest "app/(app)/merchants"`
Expected: PASS.

```bash
git add "apps/admin-web/app/(app)/merchants/[id]/page.tsx" "apps/admin-web/app/(app)/merchants/[id]/__tests__/page.test.tsx"
git commit -m "feat(admin-web): Business registration card + identity edit on /merchants/[id] (B2.2)"
```

## Task 9: Full verification

- [ ] **Step 1: Backend type-check + unit gate**

Run: `eval "$(fnm env)"; fnm use 24; npx tsc --noEmit && npm run test:unit`
Expected: tsc 0 new errors (4 pre-existing baseline errors in `tests/api/customer/savings.service.test.ts` remain); unit gate green. The default `event` param keeps every existing `MERCHANT_PROFILE_UPDATED` assertion green.

- [ ] **Step 2: Backend integration (local, real DB)**

Run: `npx vitest run tests/api/admin/admin-merchant-identity.integration.test.ts tests/api/admin/merchant-detail.integration.test.ts`
Expected: PASS (verify NEW failures only; pre-existing flaky discovery/seed suites are env baseline).

- [ ] **Step 3: Admin-web tsc + full jest + next build (controller, main checkout)**

Run: `cd apps/admin-web; npx tsc --noEmit && npx jest && npm run build`
Expected: tsc clean; all suites PASS; `next build` 8/8 incl. the `/merchants/[id]` route. (Worktree subagents cannot run `next build` - the controller runs it in the main checkout.)

- [ ] **Step 4: Style sweep**

Run: `git diff main..HEAD | grep -nP '^\+' | grep -P '\x{2014}'` (use the brace form, NOT `\xHH`) and an emoji scan.
Expected: NONE on added lines. No em-dashes, no emojis, brand colours only.

- [ ] **Step 5: CI**

Push the branch, open the PR, confirm CI green on backend (typecheck + unit), admin-web (typecheck / lint / build), customer-web (typecheck / lint / build). Verify the live compare scope matches the file list above.

---

## Closed-scope exclusions (do NOT touch in B2.2)

- No schema change, no migration (the audit event is a String column; `merchant:edit-identity` is TS-only).
- No widening of the B2.1 `PATCH /:id/profile` route (the line-94 "400 on vatNumber" pin must stay green).
- No `primaryCategoryId` / RMV provisioning (B2.3).
- No branch create / soft-delete (B2.4).
- No post-go-live SENSITIVE identity fields via the B1 lane (B2.5); no change to `SENSITIVE_FIELDS` or the edit-request flow.
- No submit-on-behalf (B3), document upload (B4), voucher co-build (B5), Merchant Portal (Phase 4).
- No photo-apply, no PR3 `branchCount` soft-deleted fix, no stash restore.
- No UK VAT / company-number regex validation this slice (recorded below as a future symmetric hardening item for BOTH the merchant and admin paths).
- No customer-app / customer-web changes.

## Future hardening (recorded, NOT in B2.2)

- **Format validation (symmetric):** add UK VAT (GB + 9 or 12 digits) and Companies House company-number (8 alphanumeric) validation to BOTH the merchant self-serve path and the admin identity route, as a single symmetric change so neither path can set a value the other rejects. Deferred; tracked here and in the deferred-followups index.
