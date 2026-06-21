# Merchant Portal M3 - Redemptions + Validate-a-code - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan slice-by-slice. Each slice is a fresh implementer subagent + a fresh adversarial reviewer subagent. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship the merchant-portal Redemptions log + two-step Validate-a-code surface (no-schema, voucher-type-generic) per the approved spec `docs/superpowers/specs/2026-06-21-merchant-web-m3-redemptions-design.md`.

**Architecture:** Additive backend read endpoints under a new `src/api/merchant/redemptions/` module (merchant-session scoped via `resolveAdminMerchant`, which also enforces the SEC-M2 live suspend block), one behaviour-preserving bug fix in the shared `verifyRedemption`, and a new merchant-web Redemptions surface (page + shared two-step validate dialog) reusing existing conventions. No schema, no migration.

**Tech stack:** Backend - Fastify + Prisma 7 + vitest. Frontend - Next 15 App Router + React Query + zod + jest/RTL, merchant-web at port 3003.

**PR structure:** two stacked PRs, each owner-gated at its merge gate.
- **PR-A (backend):** B1 list + B2 lookup + B3 validator-fix + B4 CSV. Branch `feat/merchant-web-m3-redemptions-backend` off `main`.
- **PR-B (frontend):** F1 log page + F2 validate dialog + F3 detail. Branch `feat/merchant-web-m3-redemptions-frontend` stacked on the backend branch (it consumes the new endpoints), rebased onto `main` when PR-A merges.

**Hard stop-and-report (from the owner):** any schema/migration need; any change to customer-app / customer-web / admin-web; any email/notification implementation; any Reverse; any custom-voucher CRUD; any analytics/Home/Insights; anything exposing customer email/phone or redemption PIN; any uncertainty about tenant scoping, SEC-M1/M2 suspend checks, or validation attribution.

**Merge rule:** implement + test + review + open PRs in the background; **never merge without explicit SHA-bound owner approval**; pause at each merge gate with PR URL, head SHA, exact files, CI status, review verdict, scope confirmation.

---

## File structure

**Backend (PR-A):**
- Create `src/api/merchant/redemptions/format.ts` - pure helpers: `formatCustomerName`, `deriveRedemptionStatus`, `validatedByLabel`, `toMerchantRedemptionRow`, the curated `ROW_SELECT`, `normalizeRedemptionCode`.
- Create `src/api/merchant/redemptions/service.ts` - `listMerchantRedemptions`, `lookupMerchantRedemptionByCode`, `getMerchantRedemptionsForExport`, `buildRedemptionWhere`, `redemptionsToCsv`.
- Create `src/api/merchant/redemptions/routes.ts` - `merchantRedemptionRoutes(app)` with GET list / GET lookup / GET export.csv.
- Modify `src/api/merchant/plugin.ts` - register `merchantRedemptionRoutes`.
- Modify `src/api/redemption/service.ts` - B3 one-line fix to `verifyRedemption` (`validatedById` branch-only).
- Tests: `tests/api/merchant/redemptions/{format,list,lookup,export}.test.ts`, `tests/api/merchant/redemptions/cross-tenant.test.ts`, and a B3 regression in `tests/api/redemption/` (e.g. `verify-validator-attribution.test.ts`).

**Frontend (PR-B):**
- Create `apps/merchant-web/lib/api/redemptions.ts` - zod schemas + `listRedemptions`, `lookupRedemptionByCode`, `validateRedemptionCode`, `exportRedemptionsCsv`.
- Create `apps/merchant-web/app/(app)/redemptions/page.tsx` - the log surface.
- Create `apps/merchant-web/components/redemptions/{RedemptionsTable,RedemptionFilters,ValidateCodeDialog,RedemptionDetail}.tsx`.
- Modify `apps/merchant-web/components/shell/navItems.ts` - Redemptions `href: '#'` -> `/redemptions`.
- Modify `apps/merchant-web/components/shell/Topbar.tsx` - wire the Validate-a-code button to open the shared dialog.
- Tests: `apps/merchant-web/lib/api/__tests__/redemptions.test.ts`, `apps/merchant-web/app/(app)/redemptions/__tests__/page.test.tsx`, `apps/merchant-web/components/redemptions/__tests__/ValidateCodeDialog.test.tsx`.

---

## PR-A - Backend (no schema)

### Task B0: branch + format helpers (pure, fully unit-tested first)

**Files:** Create `src/api/merchant/redemptions/format.ts`; Test `tests/api/merchant/redemptions/format.test.ts`.

- [ ] **Step 1: branch.** `git checkout main && git pull --ff-only origin main && git checkout -b feat/merchant-web-m3-redemptions-backend`.

- [ ] **Step 2: write failing tests** for the pure helpers:

```ts
// tests/api/merchant/redemptions/format.test.ts
import { describe, it, expect } from 'vitest'
import { formatCustomerName, deriveRedemptionStatus, validatedByLabel, normalizeRedemptionCode } from '../../../../src/api/merchant/redemptions/format'

describe('formatCustomerName (OD4: first name + last initial)', () => {
  it('formats first + last initial', () => { expect(formatCustomerName('Sarah', 'Khan')).toBe('Sarah K.') })
  it('uppercases the initial', () => { expect(formatCustomerName('sarah', 'khan')).toBe('sarah K.') })
  it('first only when no last name', () => { expect(formatCustomerName('Sarah', '')).toBe('Sarah') })
  it('neutral fallback when both empty', () => { expect(formatCustomerName('', '')).toBe('Customer') })
  it('trims', () => { expect(formatCustomerName('  Sarah ', ' Khan ')).toBe('Sarah K.') })
  it('never returns a full surname', () => { expect(formatCustomerName('Sarah', 'Khan')).not.toContain('Khan') })
})
describe('deriveRedemptionStatus', () => {
  it('validated', () => { expect(deriveRedemptionStatus(true)).toBe('VALIDATED') })
  it('awaiting', () => { expect(deriveRedemptionStatus(false)).toBe('AWAITING_VALIDATION') })
})
describe('validatedByLabel (OD6)', () => {
  it('null when not validated', () => { expect(validatedByLabel({ isValidated: false, validatedBy: null })).toBeNull() })
  it('branch-staff name when validatedBy present', () => { expect(validatedByLabel({ isValidated: true, validatedBy: { firstName: 'Jon', lastName: 'Smith' } })).toBe('Jon S.') })
  it('"Validated in the portal" when validated but no validatedBy (merchant-admin path)', () => { expect(validatedByLabel({ isValidated: true, validatedBy: null })).toBe('Validated in the portal') })
})
describe('normalizeRedemptionCode', () => {
  it('uppercases + strips spaces', () => { expect(normalizeRedemptionCode('a7k2 p9x4')).toBe('A7K2P9X4') })
  it('strips non-alphanumerics', () => { expect(normalizeRedemptionCode('a7k2-p9x4')).toBe('A7K2P9X4') })
})
```

- [ ] **Step 3: run, expect fail** (`npx vitest run tests/api/merchant/redemptions/format.test.ts`).

- [ ] **Step 4: implement** `src/api/merchant/redemptions/format.ts`:

```ts
import { Prisma } from '../../../../generated/prisma/client'

export type RedemptionStatus = 'AWAITING_VALIDATION' | 'VALIDATED'

export function formatCustomerName(firstName?: string | null, lastName?: string | null): string {
  const first = (firstName ?? '').trim()
  const last = (lastName ?? '').trim()
  if (!first && !last) return 'Customer'
  if (!last) return first
  if (!first) return last.charAt(0).toUpperCase() + '.'
  return first + ' ' + last.charAt(0).toUpperCase() + '.'
}

export function deriveRedemptionStatus(isValidated: boolean): RedemptionStatus {
  return isValidated ? 'VALIDATED' : 'AWAITING_VALIDATION'
}

export function validatedByLabel(r: { isValidated: boolean; validatedBy: { firstName: string | null; lastName: string | null } | null }): string | null {
  if (!r.isValidated) return null
  if (r.validatedBy) return formatCustomerName(r.validatedBy.firstName, r.validatedBy.lastName)
  return 'Validated in the portal'
}

export function normalizeRedemptionCode(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '')
}

// Curated select: NEVER a blind spread, NEVER redemptionPin (lives on Branch),
// NEVER customer email/phone. Branch select is id + name only.
export const ROW_SELECT = {
  id: true, redemptionCode: true, redeemedAt: true,
  isValidated: true, validatedAt: true, validationMethod: true, estimatedSaving: true,
  voucher: { select: { id: true, title: true, type: true } },
  branch: { select: { id: true, name: true } },
  user: { select: { firstName: true, lastName: true } },
  validatedBy: { select: { firstName: true, lastName: true } },
} satisfies Prisma.VoucherRedemptionSelect

// Same as ROW_SELECT but also pulls voucher.merchantId for the lookup ownership check.
export const ROW_SELECT_WITH_MERCHANT = {
  ...ROW_SELECT,
  voucher: { select: { id: true, title: true, type: true, merchantId: true } },
} satisfies Prisma.VoucherRedemptionSelect

export function toMerchantRedemptionRow(r: any) {
  return {
    id: r.id,
    redemptionCode: r.redemptionCode,
    voucher: { id: r.voucher.id, title: r.voucher.title, type: r.voucher.type },
    branch: { id: r.branch.id, name: r.branch.name },
    customerName: formatCustomerName(r.user?.firstName, r.user?.lastName),
    redeemedAt: r.redeemedAt.toISOString(),
    status: deriveRedemptionStatus(r.isValidated),
    validatedAt: r.validatedAt ? r.validatedAt.toISOString() : null,
    validationMethod: r.validationMethod ?? null,
    validatedByLabel: validatedByLabel(r),
    estimatedSaving: Number(r.estimatedSaving),
  }
}
```

- [ ] **Step 5: run, expect pass.** **Step 6: commit** (`git add src/api/merchant/redemptions/format.ts tests/api/merchant/redemptions/format.test.ts && git commit`).

### Task B1: merchant-wide list endpoint

**Files:** Create `src/api/merchant/redemptions/service.ts`, `src/api/merchant/redemptions/routes.ts`; Modify `src/api/merchant/plugin.ts`; Test `tests/api/merchant/redemptions/list.test.ts`.

- [ ] **Step 1: write failing tests** (`list.test.ts`) against `buildApp` + a prisma mock (mirror `tests/api/merchant/voucher-rmv.test.ts` harness): GET `/api/v1/merchant/redemptions` returns the paginated merchant-safe shape; `customerName` is first+last-initial; `isTestData=true` rows excluded by default; `branchId`/`status`/`from`/`to`/`voucherType`/`code` filters shape the `where`; `redemptionPin` is never selected (assert the `select` passed to the mock has no `redemptionPin` and the branch select is `{id,name}`); the response carries `{ items, total, limit, offset }`; a suspended merchant (resolveAdminMerchant throws) returns `MERCHANT_SUSPENDED`.

- [ ] **Step 2: run, expect fail.**

- [ ] **Step 3: implement** `service.ts` (`buildRedemptionWhere` + `listMerchantRedemptions`):

```ts
import { PrismaClient, Prisma } from '../../../../generated/prisma/client'
import { ROW_SELECT, ROW_SELECT_WITH_MERCHANT, toMerchantRedemptionRow, normalizeRedemptionCode } from './format'
import { AppError } from '../../shared/errors'

export interface RedemptionFilters {
  branchId?: string
  status?: 'awaiting' | 'validated'
  from?: Date
  to?: Date
  voucherType?: string
  code?: string
}

export function buildRedemptionWhere(merchantId: string, f: RedemptionFilters): Prisma.VoucherRedemptionWhereInput {
  const where: Prisma.VoucherRedemptionWhereInput = { branch: { merchantId }, isTestData: false }
  if (f.branchId) where.branchId = f.branchId            // AND branch.merchantId => cross-tenant branchId yields empty
  if (f.status === 'awaiting') where.isValidated = false
  if (f.status === 'validated') where.isValidated = true
  if (f.from || f.to) where.redeemedAt = { ...(f.from ? { gte: f.from } : {}), ...(f.to ? { lte: f.to } : {}) }
  if (f.voucherType) where.voucher = { is: { type: f.voucherType as any } }
  if (f.code) where.redemptionCode = { startsWith: normalizeRedemptionCode(f.code) }
  return where
}

export async function listMerchantRedemptions(
  prisma: PrismaClient, merchantId: string, f: RedemptionFilters & { limit: number; offset: number }
) {
  const where = buildRedemptionWhere(merchantId, f)
  const [total, rows] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({ where, orderBy: { redeemedAt: 'desc' }, take: f.limit, skip: f.offset, select: ROW_SELECT }),
  ])
  return { items: rows.map(toMerchantRedemptionRow), total, limit: f.limit, offset: f.offset }
}
```

`routes.ts` (note `resolveAdminMerchant` both resolves merchantId AND enforces the live SEC-M2 suspend block):

```ts
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { resolveAdminMerchant } from '../shared'
import { listMerchantRedemptions, lookupMerchantRedemptionByCode, getMerchantRedemptionsForExport, redemptionsToCsv } from './service'

const filterSchema = z.object({
  branchId: z.string().optional(),
  status: z.enum(['awaiting', 'validated']).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  voucherType: z.string().optional(),
  code: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function merchantRedemptionRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/redemptions'

  app.get(prefix, async (req: FastifyRequest, reply) => {
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    const q = filterSchema.parse(req.query)
    const result = await listMerchantRedemptions(app.prisma, merchantId, {
      ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined,
    })
    return reply.send(result)
  })

  app.get(`${prefix}/lookup`, async (req: FastifyRequest, reply) => {
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    const { code } = z.object({ code: z.string().min(1) }).parse(req.query)
    const result = await lookupMerchantRedemptionByCode(app.prisma, merchantId, code)
    return reply.send(result)
  })

  app.get(`${prefix}/export.csv`, async (req: FastifyRequest, reply) => {
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    const q = filterSchema.omit({ limit: true, offset: true }).parse(req.query)
    const { rows, truncated } = await getMerchantRedemptionsForExport(app.prisma, merchantId, {
      ...q, from: q.from ? new Date(q.from) : undefined, to: q.to ? new Date(q.to) : undefined,
    })
    const csv = redemptionsToCsv(rows, truncated)
    reply.header('Content-Type', 'text/csv; charset=utf-8')
    reply.header('Content-Disposition', 'attachment; filename="redemptions.csv"')
    return reply.send(csv)
  })
}
```

Register in `plugin.ts`: import `merchantRedemptionRoutes` and add `await scoped.register(merchantRedemptionRoutes)` alongside the others.

- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task B2: lookup-by-code preview (read-only)

**Files:** Modify `service.ts`; Test `tests/api/merchant/redemptions/lookup.test.ts`.

- [ ] **Step 1: failing tests:** GET `/redemptions/lookup?code=` returns the merchant-safe row incl. validation details when already validated; an unknown code throws `REDEMPTION_NOT_FOUND`; a code belonging to **another merchant** throws `REDEMPTION_NOT_FOUND` (cross-tenant masked, not a different error); the code is normalised (lowercase + spaces) before lookup; read-only (no `update` call on the prisma mock).

- [ ] **Step 2: run, expect fail. Step 3: implement** in `service.ts`:

```ts
export async function lookupMerchantRedemptionByCode(prisma: PrismaClient, merchantId: string, rawCode: string) {
  const code = normalizeRedemptionCode(rawCode)
  const r = await prisma.voucherRedemption.findUnique({ where: { redemptionCode: code }, select: ROW_SELECT_WITH_MERCHANT })
  if (!r || (r as any).voucher.merchantId !== merchantId) throw new AppError('REDEMPTION_NOT_FOUND')
  const row = toMerchantRedemptionRow(r)
  // toMerchantRedemptionRow maps voucher to {id,title,type} only, so merchantId never leaks out.
  return row
}
```

- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task B3: validator-attribution bug fix (OD6)

**Files:** Modify `src/api/redemption/service.ts`; Test `tests/api/redemption/verify-validator-attribution.test.ts`.

- [ ] **Step 1: failing tests:** branch actor -> `validatedById = actor.actorId` (unchanged); **merchant actor -> `validatedById = null`** (assert the `update` data) and `validationMethod` is the passed method; the `VOUCHER_VERIFIED` audit still records `metadata.actorId` for the merchant. Use the existing mocked-prisma harness from `tests/api/redemption/service.test.ts`.

- [ ] **Step 2: run, expect fail** (the current code sets `validatedById: actor.actorId` unconditionally).

- [ ] **Step 3: implement** - in `verifyRedemption`, change the `update` data line:

```ts
      validatedById:    actor.role === 'branch' ? actor.actorId : null,
```

(Everything else in `verifyRedemption` is unchanged - the SEC-M1 live-DB merchant/branch checks stay.)

- [ ] **Step 4: run, expect pass; also run `npx vitest run tests/api/redemption` to confirm no regression. Step 5: commit.**

### Task B4: CSV export

**Files:** Modify `service.ts`; Test `tests/api/merchant/redemptions/export.test.ts`.

- [ ] **Step 1: failing tests:** `getMerchantRedemptionsForExport` returns capped rows + `truncated` flag (cap+1 fetch); `redemptionsToCsv` emits the privacy-safe columns only (code, voucher title, voucher type, branch, customer first+last-initial, redeemed-at, status, validated-at, method, saving) and contains **no** email/phone/PIN/raw-id headers; CSV values are quote-escaped; a truncated export includes a trailing note row/flag; same `where` filters as B1 (e.g. `status=validated` excludes awaiting rows).

- [ ] **Step 2: run, expect fail. Step 3: implement** in `service.ts`:

```ts
const EXPORT_CAP = 50000

export async function getMerchantRedemptionsForExport(prisma: PrismaClient, merchantId: string, f: RedemptionFilters) {
  const where = buildRedemptionWhere(merchantId, f)
  const rows = await prisma.voucherRedemption.findMany({ where, orderBy: { redeemedAt: 'desc' }, take: EXPORT_CAP + 1, select: ROW_SELECT })
  const truncated = rows.length > EXPORT_CAP
  return { rows: rows.slice(0, EXPORT_CAP).map(toMerchantRedemptionRow), truncated }
}

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v)
  return '"' + s.replace(/"/g, '""') + '"'
}

export function redemptionsToCsv(rows: ReturnType<typeof toMerchantRedemptionRow>[], truncated: boolean): string {
  const header = ['Redemption code', 'Voucher', 'Type', 'Branch', 'Customer', 'Redeemed at', 'Status', 'Validated at', 'Method', 'Saving (GBP)']
  const lines = [header.map(csvCell).join(',')]
  for (const r of rows) {
    lines.push([
      r.redemptionCode, r.voucher.title, r.voucher.type, r.branch.name, r.customerName,
      r.redeemedAt, r.status, r.validatedAt ?? '', r.validationMethod ?? '', r.estimatedSaving.toFixed(2),
    ].map(csvCell).join(','))
  }
  if (truncated) lines.push(csvCell('Export truncated at ' + EXPORT_CAP + ' rows. Narrow the filters for a complete export.'))
  return lines.join('\r\n')
}
```

- [ ] **Step 4: run, expect pass. Step 5: commit.**

### Task B5: cross-tenant denial + gate

**Files:** Test `tests/api/merchant/redemptions/cross-tenant.test.ts`.

- [ ] **Step 1: write tests** proving merchant B cannot list, look up, or export merchant A's redemptions (the `where` always carries `branch.merchantId === sessionMerchantId`; a lookup of A's code under B's session throws `REDEMPTION_NOT_FOUND`). **Step 2: run, expect pass** (the scoping is built in; this is a guard test). **Step 3: commit.**

- [ ] **Step 4: full gate:** `npx vitest run tests/api/merchant tests/api/redemption` green; `npm run test:unit` green; `npx tsc --noEmit` clean; dash-clean staged diff. **Step 5:** open **PR-A** off `main` and PAUSE at the merge gate (PR URL, head SHA, files, CI, review verdict, scope confirmation).

---

## PR-B - Frontend (stacked on PR-A; rebased onto main when PR-A merges)

> Branch `feat/merchant-web-m3-redemptions-frontend` off the backend branch. Run jest from `apps/merchant-web` (Node version per the merchant-web CI job). Mirror the conventions in the spec §1.1 + §5. House style: no em dashes / no emojis; brand tokens from `app/globals.css`; icons via `@/lib/icons`.

### Task F1: API client + Redemptions log page + nav wire

**Files:** Create `lib/api/redemptions.ts`, `app/(app)/redemptions/page.tsx`, `components/redemptions/{RedemptionsTable,RedemptionFilters}.tsx`; Modify `components/shell/navItems.ts`; Tests `lib/api/__tests__/redemptions.test.ts`, `app/(app)/redemptions/__tests__/page.test.tsx`.

- [ ] **Step 1: failing client tests** for `lib/api/redemptions.ts`: `listRedemptions(filters)` builds the querystring + parses the zod row shape; `lookupRedemptionByCode(code)`; `validateRedemptionCode(code)` POSTs to `/api/v1/redemption/verify` with `{ code, method: 'MANUAL' }`; `exportRedemptionsCsv(filters)` hits the export URL. Mock `apiFetch`.

- [ ] **Step 2: implement** `lib/api/redemptions.ts`:

```ts
import { z } from 'zod'
import { apiFetch } from './client'

export const redemptionRowSchema = z.object({
  id: z.string(),
  redemptionCode: z.string(),
  voucher: z.object({ id: z.string(), title: z.string(), type: z.string() }),
  branch: z.object({ id: z.string(), name: z.string() }),
  customerName: z.string(),
  redeemedAt: z.string(),
  status: z.enum(['AWAITING_VALIDATION', 'VALIDATED']),
  validatedAt: z.string().nullable(),
  validationMethod: z.enum(['MANUAL', 'QR_SCAN']).nullable(),
  validatedByLabel: z.string().nullable(),
  estimatedSaving: z.number(),
}).passthrough()
export type RedemptionRow = z.infer<typeof redemptionRowSchema>

export interface RedemptionFilters { branchId?: string; status?: 'awaiting'|'validated'; from?: string; to?: string; voucherType?: string; code?: string; limit?: number; offset?: number }

function qs(f: Record<string, unknown>): string {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(f)) if (v !== undefined && v !== '' && v !== null) p.set(k, String(v))
  const s = p.toString(); return s ? `?${s}` : ''
}

export async function listRedemptions(f: RedemptionFilters = {}) {
  const data = await apiFetch(`/api/v1/merchant/redemptions${qs(f)}`, { method: 'GET', auth: true })
  return z.object({ items: z.array(redemptionRowSchema), total: z.number(), limit: z.number(), offset: z.number() }).parse(data)
}
export async function lookupRedemptionByCode(code: string) {
  return redemptionRowSchema.parse(await apiFetch(`/api/v1/merchant/redemptions/lookup${qs({ code })}`, { method: 'GET', auth: true }))
}
export async function validateRedemptionCode(code: string) {
  return apiFetch('/api/v1/redemption/verify', { method: 'POST', auth: true, body: JSON.stringify({ code, method: 'MANUAL' }) })
}
export function exportRedemptionsCsvPath(f: RedemptionFilters = {}) {
  const { limit: _l, offset: _o, ...rest } = f
  return `/api/v1/merchant/redemptions/export.csv${qs(rest)}`
}
```

- [ ] **Step 3: failing page tests** (`page.test.tsx`, `QueryClientProvider` wrapper, mock the client + `useSession`/`useRouter`): list renders the table; loading + empty + error states; status pills; first+last-initial rendered (assert no full surname / no email/phone text); a filter change updates the query key; the Export button hits the export path; the "Validate a code" action opens the dialog.

- [ ] **Step 4: implement** `app/(app)/redemptions/page.tsx` + `RedemptionsTable.tsx` (reuse `components/ui/table.tsx` columns: status `Badge`, code, voucher title + type `Chip`, branch, customer, redeemed-at, validated-at + `validatedByLabel`, saving) + `RedemptionFilters.tsx` (branch selector All/per-branch, status, date range, voucher-type, code search) using React Query `useQuery({ queryKey: ['redemptions', filters], queryFn: () => listRedemptions(filters), staleTime: 30_000 })`; an Export CSV button (download via the export path); a "Validate a code" button that opens the F2 dialog. Point `navItems.ts` Redemptions `href` to `/redemptions`.

- [ ] **Step 5: run jest, expect pass. Step 6: commit.**

### Task F2: two-step Validate-a-code dialog (topbar + page)

**Files:** Create `components/redemptions/ValidateCodeDialog.tsx`; Modify `components/shell/Topbar.tsx`; Tests `components/redemptions/__tests__/ValidateCodeDialog.test.tsx`.

- [ ] **Step 1: failing tests:** entry -> client format validation (rejects < 8 / invalid chars before any request); lookup shows the merchant-safe preview; **awaiting** -> Confirm calls `validateRedemptionCode` then shows success + invalidates `['redemptions']`; **already validated** -> shows details + NO confirm; `REDEMPTION_NOT_FOUND` / `MERCHANT_SUSPENDED` / `BRANCH_UNAVAILABLE` / generic errors render their messages; the preview shows first+last-initial (no contact field).

- [ ] **Step 2: implement** `ValidateCodeDialog.tsx` using `components/ui/dialog.tsx`: a small state machine `entry -> preview -> done` with an `already-validated` preview variant and an `error` surface; normalise + 4+4 display the code; on confirm call `validateRedemptionCode`, then `queryClient.invalidateQueries({ queryKey: ['redemptions'] })`; copy notes QR is done in the staff app. Wire `Topbar.tsx:74` button (pass an `onValidate` handler / local open-state) to open this dialog; also open it from the page action (lift the dialog or use a shared open-state).

- [ ] **Step 3: run jest, expect pass. Step 4: commit.**

### Task F3: redemption detail + CSV button polish

**Files:** Create `components/redemptions/RedemptionDetail.tsx`; Tests in `page.test.tsx`.

- [ ] **Step 1: failing tests:** clicking a row opens a merchant-safe detail (full voucher title/type/description/terms, branch, customer first+last-initial, redeemed-at, status + validation details, saving, code); never email/phone/PIN; the Export CSV button is present and uses the current filters.

- [ ] **Step 2: implement** `RedemptionDetail.tsx` (an in-page panel/dialog reusing the fetched row + the voucher fields available; if more voucher fields are needed than the list row carries, reuse the lookup endpoint by code). Finalise the Export button (current filters).

- [ ] **Step 3: run jest, expect pass. Step 4: commit.**

### Task F4: frontend gate

- [ ] `npx tsc --noEmit` (merchant-web) clean; `npx jest --forceExit` green; `npm run lint` clean; `npm run build` succeeds; dash-clean. Open **PR-B** stacked on PR-A and PAUSE at the merge gate.

---

## Execution model (subagent-driven)

- **Per slice:** a fresh implementer subagent (TDD, explicit COMMIT step, scope-locked to the slice's files) -> a fresh adversarial reviewer subagent that checks against: the spec, this plan, live code, the prototype where relevant, the privacy/security invariants (IDOR cross-tenant test, `redemptionPin` never selected, no email/phone, first+last-initial, SEC-M1/M2 suspend), and the closed-scope exclusions. Fix confirmed blockers before advancing.
- **Per PR:** `/code-review` + a Codex-style fresh review on the delta before the merge gate, SHA-bound.
- **Stop-and-report** immediately on any of the owner's hard conditions (schema, cross-surface change, email, Reverse, custom-voucher CRUD, analytics, PII/PIN exposure, scoping/suspend/attribution uncertainty).
- **Merge:** never without explicit SHA-bound owner approval; pause at each gate with the full report.

---

## Self-review

- **Spec coverage:** B1 list (§4.1), B2 lookup (§4.2), B3 fix (§4.3), B4 CSV (§4.4), invariants (§4.5/§8), F1/F2/F3 (§5), state machine (§6), voucher-type-generic (§7) - all mapped to tasks. The deferred email/Reverse/merchantId/validatedByAdminId items are NOT tasks (correctly out of scope).
- **No schema:** every backend task is additive endpoints + one in-place fix; the curated `ROW_SELECT` + `branch:{merchantId}` filter avoid any model change.
- **Type consistency:** `RedemptionRow` (frontend zod) mirrors `toMerchantRedemptionRow` (backend); `status` enum + `validationMethod` enum match on both sides; `validatedByLabel` is the single attribution string.
- **Placeholder scan:** none - each step has real code or a concrete test list.
