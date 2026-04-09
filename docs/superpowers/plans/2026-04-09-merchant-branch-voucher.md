# Merchant, Branch & Voucher API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the complete merchant-facing management API — merchant profile, onboarding checklist, branch CRUD, and voucher lifecycle (custom + RMV) — following the existing Fastify plugin/routes/service pattern.

**Architecture:** Four modules under `src/api/merchant/` (profile, onboarding, branch, voucher), each with `routes.ts` and `service.ts`, registered via a single `plugin.ts`. All routes use the existing `authenticateMerchant` decorator. Schema is extended with `MerchantPendingEdit`, `BranchPendingEdit`, `RmvTemplate`, and new fields/enums on existing models. Tests use vitest with mocked Prisma/Redis (matching the existing test pattern).

**Tech Stack:** Node.js 24, TypeScript, Fastify 5, Prisma 7, Zod 4, Vitest, ioredis

**Spec:** `docs/superpowers/specs/2026-04-09-merchant-branch-voucher-design.md`

---

## File Map

### New files to create

```
src/api/merchant/
  plugin.ts                    # Registers all 4 sub-modules under authenticateMerchant
  profile/
    routes.ts                  # GET/PATCH profile, POST/GET/DELETE edit-request routes
    service.ts                 # Profile read/write, pending edit logic, RMV provisioning trigger
  onboarding/
    routes.ts                  # GET checklist, GET/POST contract, POST submit
    service.ts                 # Checklist computation, gate validation, submission logic
  branch/
    routes.ts                  # Branch CRUD, hours, amenities, photo edit-request, soft delete
    service.ts                 # Branch business logic, main branch rules, delete rules
  voucher/
    routes.ts                  # Custom voucher CRUD + submit, RMV list/patch/submit
    service.ts                 # Voucher lifecycle, RMV provisioning, category change logic

tests/api/merchant/
  profile.test.ts
  onboarding.test.ts
  branch.test.ts
  voucher.test.ts
  voucher-rmv.test.ts
```

### Files to modify

```
prisma/schema.prisma           # New models, enums, fields — see Task 1
prisma/seed.ts                 # RmvTemplate seed data per category
src/api/app.ts                 # Register merchant plugin
src/api/shared/errors.ts       # New error codes for this phase
src/api/shared/audit.ts        # New audit event types
```

---

## Task 1: Schema migration — new models, enums, and field additions

**Files:**
- Modify: `prisma/schema.prisma`

### Context

The existing schema has `Merchant`, `Branch`, `Voucher`, `Category`, `AdminApproval`, and `MerchantContract`. This task adds the new models and fields required by Phase 2C. After editing the schema, run `npx prisma migrate dev` to apply changes and regenerate the client.

The `ApprovalType` enum already exists in the schema and needs new values added.

- [ ] **Step 1: Add new enums to schema**

Open `prisma/schema.prisma`. After the existing `ValidationMethod` enum block, add:

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

- [ ] **Step 2: Add new fields to Merchant model**

In the `Merchant` model, add after `description String?`:

```prisma
  primaryCategoryId String?
  onboardingStep    OnboardingStep @default(REGISTERED)

  primaryCategory   Category?       @relation("MerchantPrimaryCategory", fields: [primaryCategoryId], references: [id])
  pendingEdit       MerchantPendingEdit?
```

Also add a named index: `@@index([primaryCategoryId])`

- [ ] **Step 3: Add new field to Branch model**

In the `Branch` model, add after the existing fields:

```prisma
  pendingEdit  BranchPendingEdit?
```

- [ ] **Step 4: Add new fields to Voucher model**

In the `Voucher` model, add after `approvedBy String?`:

```prisma
  isRmv          Boolean      @default(false)
  rmvTemplateId  String?
  merchantFields Json?

  rmvTemplate    RmvTemplate? @relation(fields: [rmvTemplateId], references: [id])
```

Also add: `@@index([isRmv])`

- [ ] **Step 5: Add MerchantPendingEdit model**

Add this model block after the `Merchant` model:

```prisma
model MerchantPendingEdit {
  id              String            @id @default(uuid())
  merchantId      String
  proposedChanges Json
  status          PendingEditStatus @default(PENDING)
  reviewedBy      String?
  reviewNote      String?
  createdAt       DateTime          @default(now())
  reviewedAt      DateTime?

  merchant        Merchant          @relation(fields: [merchantId], references: [id])

  @@index([merchantId])
  @@index([status])
}
```
// NOTE: No @unique on merchantId — a merchant may have multiple edit records over time (WITHDRAWN, REJECTED, etc.).
// Only one PENDING edit per merchant at a time is enforced at the application layer in service.ts.

- [ ] **Step 6: Add BranchPendingEdit model**

Add this model block after `BranchPhoto`:

```prisma
model BranchPendingEdit {
  id              String            @id @default(uuid())
  branchId        String
  merchantId      String
  proposedChanges Json
  includesPhotos  Boolean           @default(false)
  status          PendingEditStatus @default(PENDING)
  reviewedBy      String?
  reviewNote      String?
  createdAt       DateTime          @default(now())
  reviewedAt      DateTime?

  branch          Branch            @relation(fields: [branchId], references: [id])
  merchant        Merchant          @relation(fields: [merchantId], references: [id])

  @@index([branchId])
  @@index([merchantId])
  @@index([status])
}
```
// NOTE: No @unique on branchId — same reasoning as MerchantPendingEdit. App-layer enforcement only.

- [ ] **Step 7: Add RmvTemplate model**

Add this model block after the `Category` model:

```prisma
model RmvTemplate {
  id            String      @id @default(uuid())
  categoryId    String
  voucherType   VoucherType
  title         String
  description   String
  allowedFields Json
  minimumSaving Decimal     @db.Decimal(10, 2)
  isActive      Boolean     @default(true)
  createdAt     DateTime    @default(now())
  updatedAt     DateTime    @updatedAt

  category      Category    @relation("CategoryRmvTemplates", fields: [categoryId], references: [id])
  vouchers      Voucher[]

  @@index([categoryId])
  @@index([isActive])
}
```

- [ ] **Step 8: Add named relations to Category model**

In the `Category` model, add:

```prisma
  primaryMerchants  Merchant[]    @relation("MerchantPrimaryCategory")
  rmvTemplates      RmvTemplate[] @relation("CategoryRmvTemplates")
```

- [ ] **Step 9: Extend ApprovalType enum**

Find the existing `ApprovalType` enum and add three new values:

```prisma
enum ApprovalType {
  // ... existing values ...
  MERCHANT_IDENTITY_EDIT
  BRANCH_IDENTITY_EDIT
  MERCHANT_ONBOARDING
}
```

- [ ] **Step 10: Run migration**

```bash
npx prisma migrate dev --name phase-2c-merchant-branch-voucher
```

Expected output: `Your database is now in sync with your schema.` and a new migration file in `prisma/migrations/`.

- [ ] **Step 11: Verify client is regenerated**

```bash
npx prisma generate
```

Expected: `Generated Prisma Client` with no errors.

- [ ] **Step 12: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat: add Phase 2C schema — MerchantPendingEdit, BranchPendingEdit, RmvTemplate, new enums and fields"
```

---

## Task 2: New error codes + audit events

**Files:**
- Modify: `src/api/shared/errors.ts`
- Modify: `src/api/shared/audit.ts`

### Context

The existing `errors.ts` has an `ERROR_DEFINITIONS` object. Add new entries to the same object. The existing `audit.ts` has a `AuditEvent` type union — extend it.

- [ ] **Step 1: Add new error codes to errors.ts**

In `src/api/shared/errors.ts`, add the following entries to the `ERROR_DEFINITIONS` object (after existing entries):

```typescript
  MERCHANT_NOT_FOUND:             { statusCode: 404, message: 'Merchant not found.' },
  BRANCH_NOT_FOUND:               { statusCode: 404, message: 'Branch not found.' },
  VOUCHER_NOT_FOUND:              { statusCode: 404, message: 'Voucher not found.' },
  PENDING_EDIT_EXISTS:            { statusCode: 409, message: 'A pending edit already exists. Withdraw it before submitting a new one.' },
  PENDING_EDIT_NOT_FOUND:         { statusCode: 404, message: 'Pending edit not found.' },
  BRANCH_IS_MAIN:                 { statusCode: 409, message: 'Cannot delete the main branch. Promote another branch to main first.' },
  BRANCH_LAST_ACTIVE:             { statusCode: 409, message: 'Cannot delete the only active branch of a live merchant.' },
  VOUCHER_NOT_EDITABLE:           { statusCode: 409, message: 'This voucher cannot be edited in its current state.' },
  VOUCHER_NOT_DELETABLE:          { statusCode: 409, message: 'Only draft vouchers can be deleted.' },
  VOUCHER_NOT_SUBMITTABLE:        { statusCode: 409, message: 'This voucher is not in a state that can be submitted for review.' },
  RMV_NOT_FOUND:                  { statusCode: 404, message: 'RMV voucher not found.' },
  RMV_FIELD_NOT_ALLOWED:          { statusCode: 400, message: 'One or more fields cannot be edited on this RMV voucher.' },
  CATEGORY_CHANGE_BLOCKED:        { statusCode: 409, message: 'Category cannot be changed after RMV vouchers have been submitted. Contact support.' },
  ONBOARDING_GATES_INCOMPLETE:    { statusCode: 409, message: 'Not all onboarding requirements are complete. Check your onboarding checklist.' },
  ALREADY_SUBMITTED:              { statusCode: 409, message: 'This merchant has already been submitted for approval.' },
  CONTRACT_ALREADY_SIGNED:        { statusCode: 409, message: 'The contract has already been accepted.' },
  NO_RMV_TEMPLATE:                { statusCode: 422, message: 'No RMV template found for this category. Please contact Redeemo support.' },
  NO_SENSITIVE_FIELDS:            { statusCode: 400, message: 'No editable sensitive fields were provided. Use PATCH /profile for non-sensitive fields.' },
```

- [ ] **Step 2: Add new audit events to audit.ts**

In `src/api/shared/audit.ts`, extend the `AuditEvent` type union by adding:

```typescript
  | 'MERCHANT_PROFILE_UPDATED'
  | 'MERCHANT_EDIT_REQUEST_CREATED'
  | 'MERCHANT_EDIT_REQUEST_WITHDRAWN'
  | 'MERCHANT_CONTRACT_ACCEPTED'
  | 'MERCHANT_SUBMITTED_FOR_APPROVAL'
  | 'BRANCH_CREATED'
  | 'BRANCH_UPDATED'
  | 'BRANCH_DELETED'
  | 'BRANCH_EDIT_REQUEST_CREATED'
  | 'BRANCH_EDIT_REQUEST_WITHDRAWN'
  | 'BRANCH_MAIN_CHANGED'
  | 'VOUCHER_CREATED'
  | 'VOUCHER_UPDATED'
  | 'VOUCHER_DELETED'
  | 'VOUCHER_SUBMITTED'
  | 'RMV_UPDATED'
  | 'RMV_SUBMITTED'
  | 'RMV_PROVISIONED'
  | 'CATEGORY_CHANGED'
```

- [ ] **Step 3: Commit**

```bash
git add src/api/shared/errors.ts src/api/shared/audit.ts
git commit -m "feat: add Phase 2C error codes and audit event types"
```

---

## Task 3: RmvTemplate seed data

**Files:**
- Modify: `prisma/seed.ts`

### Context

The seed script already creates categories: Food & Drink, Beauty & Wellness, Health & Fitness, Retail & Shopping, Entertainment, Professional Services, and subcategories Restaurants, Cafes & Coffee, Bars & Pubs, Hair Salons, Nail & Beauty.

RMV templates must be seeded so tests and local dev can work. Each active category gets 2 templates (the minimum required before a merchant can submit). Templates are upserted by a composite key of `categoryId + title`.

- [ ] **Step 1: Add RmvTemplate seed after categories**

In `prisma/seed.ts`, after the categories + subcategories block, add:

```typescript
  // ── RMV Templates ──
  // Food & Drink — suitable for restaurants, cafes, bars
  const rmvFoodTemplates = [
    {
      voucherType: 'BOGO' as const,
      title: 'Buy One Get One Free',
      description: 'Customer gets a second item free when they purchase one at full price.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
    {
      voucherType: 'DISCOUNT_PERCENT' as const,
      title: '25% Off Your Total Bill',
      description: 'Customer receives 25% off their total food/drink bill.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
  ]
  for (const t of rmvFoodTemplates) {
    await prisma.rmvTemplate.upsert({
      where: { categoryId_title: { categoryId: foodCat.id, title: t.title } },
      update: {},
      create: { ...t, categoryId: foodCat.id, isActive: true },
    })
  }

  // Beauty & Wellness — suitable for salons, spas, nail bars
  const rmvBeautyTemplates = [
    {
      voucherType: 'DISCOUNT_PERCENT' as const,
      title: '20% Off Your First Visit',
      description: 'New customers receive 20% off any service on their first visit.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
    {
      voucherType: 'FREEBIE' as const,
      title: 'Free Treatment with Any Booking',
      description: 'Customer receives a complimentary add-on treatment with any full-price booking.',
      allowedFields: ['terms', 'expiryDate'],
      minimumSaving: 5.00,
    },
  ]
  for (const t of rmvBeautyTemplates) {
    await prisma.rmvTemplate.upsert({
      where: { categoryId_title: { categoryId: beautyCat.id, title: t.title } },
      update: {},
      create: { ...t, categoryId: beautyCat.id, isActive: true },
    })
  }

  // Generic fallback templates for remaining top-level categories
  const otherCats = await prisma.category.findMany({
    where: { name: { in: ['Health & Fitness', 'Retail & Shopping', 'Entertainment', 'Professional Services'] }, parentId: null },
  })
  for (const cat of otherCats) {
    const genericTemplates = [
      {
        voucherType: 'DISCOUNT_PERCENT' as const,
        title: '20% Off',
        description: 'Customer receives 20% off any product or service.',
        allowedFields: ['terms', 'expiryDate'],
        minimumSaving: 5.00,
      },
      {
        voucherType: 'SPEND_AND_SAVE' as const,
        title: 'Spend £30, Save £10',
        description: 'Customer saves £10 when they spend £30 or more.',
        allowedFields: ['terms', 'expiryDate'],
        minimumSaving: 10.00,
      },
    ]
    for (const t of genericTemplates) {
      await prisma.rmvTemplate.upsert({
        where: { categoryId_title: { categoryId: cat.id, title: t.title } },
        update: {},
        create: { ...t, categoryId: cat.id, isActive: true },
      })
    }
  }
  console.log('Created RMV templates')
```

- [ ] **Step 2: Add unique constraint for upsert key**

The upsert above uses `categoryId_title`. Add this to the `RmvTemplate` model in `prisma/schema.prisma`:

```prisma
  @@unique([categoryId, title])
```

Then run migration again:

```bash
npx prisma migrate dev --name add-rmvtemplate-unique-key
npx prisma generate
```

- [ ] **Step 3: Run seed to verify**

```bash
npx prisma db seed
```

Expected: `Created RMV templates` in output with no errors.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/seed.ts prisma/migrations/
git commit -m "feat: add RMV template seed data + unique constraint"
```

---

## Task 4: Merchant plugin scaffold + shared Zod schemas for this module

**Files:**
- Create: `src/api/merchant/plugin.ts`
- Create: `src/api/merchant/profile/routes.ts` (stub)
- Create: `src/api/merchant/profile/service.ts` (stub)
- Create: `src/api/merchant/onboarding/routes.ts` (stub)
- Create: `src/api/merchant/onboarding/service.ts` (stub)
- Create: `src/api/merchant/branch/routes.ts` (stub)
- Create: `src/api/merchant/branch/service.ts` (stub)
- Create: `src/api/merchant/voucher/routes.ts` (stub)
- Create: `src/api/merchant/voucher/service.ts` (stub)
- Modify: `src/api/app.ts`
- Create: `tests/api/merchant/profile.test.ts` (first failing test)

### Context

Follow the exact pattern used by the auth plugins. `plugin.ts` is a `fastify-plugin` wrapper that registers sub-route functions and applies `authenticateMerchant` as a `preHandler`. The JWT token from `authenticateMerchant` puts the decoded payload on `request.merchant` — check how this is set in `src/api/auth/merchant/plugin.ts` to confirm the field name.

The merchant JWT payload contains: `{ adminId, merchantId, email }` — verify this from `src/api/auth/merchant/service.ts` where `app.merchantSign` is called.

- [ ] **Step 1: Write the first failing test**

Create `tests/api/merchant/profile.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant profile routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantPendingEdit: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      branch: { count: vi.fn(), findMany: vi.fn() },
      voucher: { count: vi.fn() },
      adminApproval: { create: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
      del: vi.fn().mockResolvedValue(1),
    } as any)
    // Sign a merchant token using the plugin's sign method
    merchantToken = app.merchantSign({ adminId: 'ma1', merchantId: 'm1', email: 'merchant@test.com' })
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/profile returns 200 with profile', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({
      id: 'm1',
      businessName: 'Test Co',
      tradingName: null,
      companyNumber: null,
      vatNumber: null,
      websiteUrl: null,
      logoUrl: null,
      bannerUrl: null,
      description: null,
      status: 'REGISTERED',
      onboardingStep: 'REGISTERED',
      primaryCategoryId: null,
      contractStatus: 'NOT_SIGNED',
    })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).businessName).toBe('Test Co')
  })

  it('GET /api/v1/merchant/profile returns 401 without token', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/v1/merchant/profile' })
    expect(res.statusCode).toBe(401)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/api/merchant/profile.test.ts
```

Expected: FAIL — `Cannot read properties of undefined` or `Route not found`.

- [ ] **Step 3: Create stub service files**

Create `src/api/merchant/profile/service.ts`:

```typescript
import { PrismaClient } from '../../../../generated/prisma/client'

export async function getMerchantProfile(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId } })
  if (!merchant) throw new Error('NOT_FOUND')
  return merchant
}
```

Create `src/api/merchant/onboarding/service.ts`:

```typescript
// Stub — implemented in Task 6
export {}
```

Create `src/api/merchant/branch/service.ts`:

```typescript
// Stub — implemented in Task 7
export {}
```

Create `src/api/merchant/voucher/service.ts`:

```typescript
// Stub — implemented in Tasks 8–9
export {}
```

- [ ] **Step 4: Create stub route files**

Create `src/api/merchant/onboarding/routes.ts`:

```typescript
import { FastifyInstance } from 'fastify'
export async function onboardingRoutes(_app: FastifyInstance) {}
```

Create `src/api/merchant/branch/routes.ts`:

```typescript
import { FastifyInstance } from 'fastify'
export async function branchRoutes(_app: FastifyInstance) {}
```

Create `src/api/merchant/voucher/routes.ts`:

```typescript
import { FastifyInstance } from 'fastify'
export async function voucherRoutes(_app: FastifyInstance) {}
```

- [ ] **Step 5: Create profile routes**

Create `src/api/merchant/profile/routes.ts`:

```typescript
import { FastifyInstance } from 'fastify'
import { getMerchantProfile } from './service'

export async function profileRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/profile'

  app.get(prefix, async (req: any, reply) => {
    const profile = await getMerchantProfile(app.prisma, req.merchant.merchantId)
    return reply.send(profile)
  })
}
```

- [ ] **Step 6: Create the merchant plugin**

Create `src/api/merchant/plugin.ts`:

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { profileRoutes } from './profile/routes'
import { onboardingRoutes } from './onboarding/routes'
import { branchRoutes } from './branch/routes'
import { voucherRoutes } from './voucher/routes'

async function merchantManagementPlugin(app: FastifyInstance) {
  // Apply merchant auth to all routes in this plugin scope
  app.addHook('preHandler', app.authenticateMerchant)

  await app.register(profileRoutes)
  await app.register(onboardingRoutes)
  await app.register(branchRoutes)
  await app.register(voucherRoutes)
}

export default fp(merchantManagementPlugin, {
  name: 'merchant-management',
  dependencies: ['merchant-auth'],
})
```

- [ ] **Step 7: Register plugin in app.ts**

In `src/api/app.ts`, add after the existing merchant auth registrations:

```typescript
import merchantManagementPlugin from './merchant/plugin'
// ... after existing merchant auth lines:
await app.register(merchantManagementPlugin)
```

- [ ] **Step 8: Run test to verify it passes**

```bash
npx vitest run tests/api/merchant/profile.test.ts
```

Expected: PASS (2 tests).

- [ ] **Step 9: Commit**

```bash
git add src/api/merchant/ src/api/app.ts tests/api/merchant/profile.test.ts
git commit -m "feat: scaffold merchant management plugin with GET profile stub"
```

---

## Task 5: Merchant profile — full CRUD + edit-request flow

**Files:**
- Modify: `src/api/merchant/profile/service.ts`
- Modify: `src/api/merchant/profile/routes.ts`
- Modify: `tests/api/merchant/profile.test.ts`

### Context

**Non-sensitive fields** (update immediately): `websiteUrl`, `vatNumber`, `companyNumber`
**Sensitive fields** (require pending review): `businessName`, `tradingName`, `logoUrl`, `bannerUrl`, `description`

Setting `primaryCategoryId` via PATCH profile triggers RMV provisioning (covered in Task 9). For now, `primaryCategoryId` is treated as a non-sensitive directly-editable field; the RMV provisioning side-effect is added in Task 9.

The `request.merchant` payload has shape `{ adminId: string, merchantId: string, email: string }`.

Pending edit 409 rule: if a `PENDING` `MerchantPendingEdit` already exists, return 409 with `{ existingEditId, createdAt }`.

- [ ] **Step 1: Write failing tests for PATCH profile and edit-request**

Add to `tests/api/merchant/profile.test.ts` (inside the `describe` block, after existing tests):

```typescript
  it('PATCH /api/v1/merchant/profile returns 400 when sensitive fields are included', async () => {
    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'Should Be Rejected' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('NO_SENSITIVE_FIELDS')
  })

  it('PATCH /api/v1/merchant/profile updates non-sensitive fields', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Test Co', status: 'REGISTERED', onboardingStep: 'REGISTERED' })
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', websiteUrl: 'https://test.com' })

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { websiteUrl: 'https://test.com' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ websiteUrl: 'https://test.com' }) })
    )
  })

  it('POST /api/v1/merchant/profile/edit-request creates pending edit', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Test Co', pendingEdit: null })
    app.prisma.merchantPendingEdit.findUnique = vi.fn().mockResolvedValue(null)
    app.prisma.merchantPendingEdit.create = vi.fn().mockResolvedValue({ id: 'pe1', merchantId: 'm1', status: 'PENDING', createdAt: new Date() })
    app.prisma.adminApproval.create = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'New Name Ltd' },
    })

    expect(res.statusCode).toBe(201)
    expect(app.prisma.merchantPendingEdit.create).toHaveBeenCalled()
    expect(app.prisma.adminApproval.create).toHaveBeenCalled()
  })

  it('POST /api/v1/merchant/profile/edit-request returns 409 when pending edit exists', async () => {
    const existingEdit = { id: 'pe1', merchantId: 'm1', status: 'PENDING', createdAt: new Date('2026-04-09') }
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', businessName: 'Test Co', pendingEdit: existingEdit })
    app.prisma.merchantPendingEdit.findUnique = vi.fn().mockResolvedValue(existingEdit)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/profile/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { businessName: 'Another Name' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
  })

  it('DELETE /api/v1/merchant/profile/edit-requests/:id withdraws pending edit', async () => {
    app.prisma.merchantPendingEdit.findUnique = vi.fn().mockResolvedValue({ id: 'pe1', merchantId: 'm1', status: 'PENDING' })
    app.prisma.merchantPendingEdit.update = vi.fn().mockResolvedValue({ id: 'pe1', status: 'WITHDRAWN' })

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/v1/merchant/profile/edit-requests/pe1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchantPendingEdit.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'WITHDRAWN' }) })
    )
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/merchant/profile.test.ts
```

Expected: FAIL on the new tests (routes not implemented).

- [ ] **Step 3: Implement profile service**

Replace `src/api/merchant/profile/service.ts` with:

```typescript
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'

const SENSITIVE_FIELDS = ['businessName', 'tradingName', 'logoUrl', 'bannerUrl', 'description'] as const
const DIRECT_FIELDS    = ['websiteUrl', 'vatNumber', 'companyNumber', 'primaryCategoryId'] as const

export async function getMerchantProfile(prisma: PrismaClient, merchantId: string) {
  const merchant = await prisma.merchant.findUnique({
    where: { id: merchantId },
    include: { pendingEdit: true },
  })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  return merchant
}

export async function updateMerchantProfile(
  prisma: PrismaClient,
  merchantId: string,
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string; adminId: string }
) {
  // Reject if any sensitive fields are passed — they must go through POST /edit-request
  const attemptedSensitive = SENSITIVE_FIELDS.filter(k => k in updates)
  if (attemptedSensitive.length > 0) {
    throw new AppError('NO_SENSITIVE_FIELDS') // clear signal: use /edit-request instead
  }

  const safe: Record<string, unknown> = {}
  for (const key of DIRECT_FIELDS) {
    if (key in updates) safe[key] = updates[key]
  }
  if (Object.keys(safe).length === 0) return getMerchantProfile(prisma, merchantId)

  const updated = await prisma.merchant.update({ where: { id: merchantId }, data: safe })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}

export async function createMerchantEditRequest(
  prisma: PrismaClient,
  merchantId: string,
  proposedChanges: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string; adminId: string }
) {
  // Validate at least one sensitive field is being changed
  const sensitiveKeys = SENSITIVE_FIELDS.filter(k => k in proposedChanges)
  if (sensitiveKeys.length === 0) throw new AppError('NO_SENSITIVE_FIELDS')

  // Check for existing pending edit (app-layer enforcement — no DB unique constraint)
  const existing = await prisma.merchantPendingEdit.findFirst({
    where: { merchantId, status: 'PENDING' },
  })
  if (existing) throw new AppError('PENDING_EDIT_EXISTS')

  const filteredChanges: Record<string, unknown> = {}
  for (const k of sensitiveKeys) filteredChanges[k] = proposedChanges[k]

  const pendingEdit = await prisma.merchantPendingEdit.create({
    data: { merchantId, proposedChanges: filteredChanges, status: 'PENDING' },
  })

  await prisma.adminApproval.create({
    data: {
      approvalType: 'MERCHANT_IDENTITY_EDIT',
      status:       'PENDING',
      entityId:     pendingEdit.id,
      notes:        `Merchant ${merchantId} requested identity field changes`,
    },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return pendingEdit
}

export async function listMerchantEditRequests(prisma: PrismaClient, merchantId: string) {
  return prisma.merchantPendingEdit.findMany({
    where: { merchantId },
    orderBy: { createdAt: 'desc' },
  })
}

export async function withdrawMerchantEditRequest(
  prisma: PrismaClient,
  merchantId: string,
  editId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const edit = await prisma.merchantPendingEdit.findFirst({ where: { id: editId, merchantId } })
  if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
  if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_FOUND')

  const updated = await prisma.merchantPendingEdit.update({
    where: { id: editId },
    data: { status: 'WITHDRAWN', reviewedAt: new Date() },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_EDIT_REQUEST_WITHDRAWN', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}
```

- [ ] **Step 4: Implement profile routes**

Replace `src/api/merchant/profile/routes.ts` with:

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import {
  getMerchantProfile, updateMerchantProfile,
  createMerchantEditRequest, listMerchantEditRequests, withdrawMerchantEditRequest,
} from './service'

const sensitiveSchema = z.object({
  businessName: z.string().min(1).max(200).optional(),
  tradingName:  z.string().min(1).max(200).optional(),
  logoUrl:      z.string().url().optional(),
  bannerUrl:    z.string().url().optional(),
  description:  z.string().max(2000).optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field required' })

const directSchema = z.object({
  websiteUrl:        z.string().url().optional(),
  vatNumber:         z.string().max(50).optional(),
  companyNumber:     z.string().max(50).optional(),
  primaryCategoryId: z.string().uuid().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field required' })

export async function profileRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/profile'

  app.get(prefix, async (req: any, reply) => {
    const profile = await getMerchantProfile(app.prisma, req.merchant.merchantId)
    return reply.send(profile)
  })

  app.patch(prefix, async (req: any, reply) => {
    const body = directSchema.parse(req.body)
    const result = await updateMerchantProfile(app.prisma, req.merchant.merchantId, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '', adminId: req.merchant.adminId,
    })
    return reply.send(result)
  })

  app.post(`${prefix}/edit-request`, async (req: any, reply) => {
    const body = sensitiveSchema.parse(req.body)
    const result = await createMerchantEditRequest(app.prisma, req.merchant.merchantId, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '', adminId: req.merchant.adminId,
    })
    return reply.status(201).send(result)
  })

  app.get(`${prefix}/edit-requests`, async (req: any, reply) => {
    const list = await listMerchantEditRequests(app.prisma, req.merchant.merchantId)
    return reply.send(list)
  })

  app.delete(`${prefix}/edit-requests/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const result = await withdrawMerchantEditRequest(app.prisma, req.merchant.merchantId, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/merchant/profile.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/merchant/profile/ tests/api/merchant/profile.test.ts
git commit -m "feat: merchant profile CRUD and sensitive edit-request flow"
```

---

## Task 6: Onboarding — checklist, contract, and submission

**Files:**
- Modify: `src/api/merchant/onboarding/service.ts`
- Modify: `src/api/merchant/onboarding/routes.ts`
- Create: `tests/api/merchant/onboarding.test.ts`

### Context

The contract text is stored as a hardcoded constant for now (Zoho Sign integration is a future phase). The current T&C version is `"1.0"`.

Checklist gates (must ALL be true for `submit` to succeed):
1. `branch_created` — `branch.count({ merchantId, deletedAt: null }) >= 1`
2. `contract_signed` — `merchant.contractStatus === 'SIGNED'`
3. `rmv_configured` — `voucher.count({ merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } }) >= 2`

The `onboardingStep` enum is updated as a convenience side-effect (not a gate).

The `MerchantContract` model already exists in the schema: `{ merchantId, signedAt, ipAddress, tcVersion, signatureMethod }`.

- [ ] **Step 1: Write failing tests**

Create `tests/api/merchant/onboarding.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant onboarding routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      merchantContract: { findUnique: vi.fn(), create: vi.fn() },
      branch: { count: vi.fn() },
      voucher: { count: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', {
      get: vi.fn().mockResolvedValue(null),
      set: vi.fn().mockResolvedValue('OK'),
    } as any)
    merchantToken = app.merchantSign({ adminId: 'ma1', merchantId: 'm1', email: 'merchant@test.com' })
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/onboarding/checklist returns computed state', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(0)

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/checklist',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.branch_created).toBe(true)
    expect(body.contract_signed).toBe(false)
    expect(body.rmv_configured).toBe(false)
    expect(body.all_complete).toBe(false)
  })

  it('GET /api/v1/merchant/onboarding/contract returns contract text and version', async () => {
    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/merchant/onboarding/contract',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.version).toBe('1.0')
    expect(typeof body.text).toBe('string')
  })

  it('POST /api/v1/merchant/onboarding/contract/accept records acceptance', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED' })
    app.prisma.merchantContract.findUnique = vi.fn().mockResolvedValue(null)
    app.prisma.merchantContract.create = vi.fn().mockResolvedValue({})
    app.prisma.merchant.update = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '1.0' },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchantContract.create).toHaveBeenCalled()
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ contractStatus: 'SIGNED' }) })
    )
  })

  it('POST /api/v1/merchant/onboarding/contract/accept returns 409 if already signed', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'SIGNED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/contract/accept',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { version: '1.0' },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('CONTRACT_ALREADY_SIGNED')
  })

  it('POST /api/v1/merchant/onboarding/submit returns 409 when gates incomplete', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'NOT_SIGNED', status: 'REGISTERED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(0)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(0)

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('ONBOARDING_GATES_INCOMPLETE')
  })

  it('POST /api/v1/merchant/onboarding/submit succeeds when all gates pass', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', contractStatus: 'SIGNED', status: 'REGISTERED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.voucher.count = vi.fn().mockResolvedValue(2)
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/merchant/onboarding/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(app.prisma.merchant.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' }) })
    )
    expect(app.prisma.adminApproval.create).toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/merchant/onboarding.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement onboarding service**

Replace `src/api/merchant/onboarding/service.ts` with:

```typescript
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'

export const CONTRACT_VERSION = '1.0'
export const CONTRACT_TEXT = `
Redeemo Merchant Agreement v${CONTRACT_VERSION}

By accepting this agreement, you agree to offer a minimum of two Redeemo Mandatory Vouchers (RMV) on the platform. These vouchers are performance-based — you are only promoted when a customer redeems. You retain full control of your custom vouchers. Redeemo reserves the right to suspend merchants who fail to honour redeemed vouchers.

Full legal terms are available at redeemo.co.uk/merchant-terms.
`.trim()

export async function getOnboardingChecklist(prisma: PrismaClient, merchantId: string) {
  const [merchant, branchCount, rmvCount] = await Promise.all([
    prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } }),
    prisma.branch.count({ where: { merchantId, deletedAt: null } }),
    prisma.voucher.count({ where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE'] } } }),
  ])
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

  const branch_created  = branchCount >= 1
  const contract_signed = merchant.contractStatus === 'SIGNED'
  const rmv_configured  = rmvCount >= 2

  return {
    branch_created,
    contract_signed,
    rmv_configured,
    all_complete: branch_created && contract_signed && rmv_configured,
  }
}

export async function acceptContract(
  prisma: PrismaClient,
  merchantId: string,
  version: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { contractStatus: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (merchant.contractStatus === 'SIGNED') throw new AppError('CONTRACT_ALREADY_SIGNED')

  await prisma.merchantContract.create({
    data: {
      merchantId,
      signedAt:        new Date(),
      ipAddress:       ctx.ipAddress,
      tcVersion:       version,
      signatureMethod: 'CLICK_TO_AGREE',
    },
  })

  await prisma.merchant.update({
    where: { id: merchantId },
    data:  { contractStatus: 'SIGNED', contractStartDate: new Date() },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_CONTRACT_ACCEPTED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return { accepted: true }
}

export async function submitForApproval(
  prisma: PrismaClient,
  merchantId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true, contractStatus: true } })
  if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')
  if (merchant.status === 'SUBMITTED' || merchant.status === 'APPROVED' || merchant.status === 'LIVE') {
    throw new AppError('ALREADY_SUBMITTED')
  }

  const checklist = await getOnboardingChecklist(prisma, merchantId)
  if (!checklist.all_complete) throw new AppError('ONBOARDING_GATES_INCOMPLETE')

  const updated = await prisma.merchant.update({
    where: { id: merchantId },
    data:  { status: 'PENDING_APPROVAL', onboardingStep: 'SUBMITTED' },
  })

  await prisma.adminApproval.create({
    data: {
      approvalType: 'MERCHANT_ONBOARDING',
      status:       'PENDING',
      entityId:     merchantId,
      notes:        'Merchant submitted for onboarding approval',
    },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_SUBMITTED_FOR_APPROVAL', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return updated
}
```

- [ ] **Step 4: Implement onboarding routes**

Replace `src/api/merchant/onboarding/routes.ts` with:

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { CONTRACT_VERSION, CONTRACT_TEXT, getOnboardingChecklist, acceptContract, submitForApproval } from './service'

export async function onboardingRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/onboarding'

  app.get(`${prefix}/checklist`, async (req: any, reply) => {
    const checklist = await getOnboardingChecklist(app.prisma, req.merchant.merchantId)
    return reply.send(checklist)
  })

  app.get(`${prefix}/contract`, async (_req, reply) => {
    return reply.send({ version: CONTRACT_VERSION, text: CONTRACT_TEXT })
  })

  app.post(`${prefix}/contract/accept`, async (req: any, reply) => {
    const { version } = z.object({ version: z.string() }).parse(req.body)
    const result = await acceptContract(app.prisma, req.merchant.merchantId, version, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/submit`, async (req: any, reply) => {
    const result = await submitForApproval(app.prisma, req.merchant.merchantId, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/merchant/onboarding.test.ts
```

Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/merchant/onboarding/ tests/api/merchant/onboarding.test.ts
git commit -m "feat: merchant onboarding checklist, contract acceptance, and approval submission"
```

---

## Task 7: Branch CRUD — create, read, update, delete, hours, amenities, edit-request

**Files:**
- Modify: `src/api/merchant/branch/service.ts`
- Modify: `src/api/merchant/branch/routes.ts`
- Create: `tests/api/merchant/branch.test.ts`

### Context

Branch create: all fields permitted on creation (no pending review). Pending review applies to sensitive field edits after merchant reaches `APPROVED` status — before that, `PATCH` still applies sensitive field changes directly.

Main branch rule: first branch created automatically gets `isMainBranch = true`. If `isMainBranch: true` is passed on `PATCH`, atomically unset previous main.

Delete rules: soft delete only. Block if last active branch of `APPROVED` merchant or if main branch.

Hours: full-week upsert. Each day is `{ dayOfWeek: 0-6, openTime: 'HH:MM', closeTime: 'HH:MM', isClosed: bool }`. Use Prisma `upsert` with `@@unique([branchId, dayOfWeek])`.

Amenities: replace. Delete all `BranchAmenity` for branch, re-insert.

Photo edit-request: creates a `BranchPendingEdit` with `includesPhotos: true`.

Sensitive edit-request: same 409 rule as merchant (one pending per branch at a time).

- [ ] **Step 1: Write failing tests**

Create `tests/api/merchant/branch.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant branch routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockBranch = {
    id: 'b1', merchantId: 'm1', name: 'Main Branch', isMainBranch: true,
    addressLine1: '1 Test St', city: 'London', postcode: 'EC1A 1BB',
    country: 'GB', isActive: true, deletedAt: null, pendingEdit: null,
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      merchant: { findUnique: vi.fn() },
      branch: {
        findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
        update: vi.fn(), updateMany: vi.fn(), count: vi.fn(),
      },
      branchOpeningHours: { upsert: vi.fn() },
      branchAmenity: { deleteMany: vi.fn(), createMany: vi.fn() },
      branchPendingEdit: { findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
      adminApproval: { create: vi.fn().mockResolvedValue({}) },
      branchUser: { updateMany: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null), set: vi.fn() } as any)
    merchantToken = app.merchantSign({ adminId: 'ma1', merchantId: 'm1', email: 'merchant@test.com' })
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/branches returns branch list', async () => {
    app.prisma.branch.findMany = vi.fn().mockResolvedValue([mockBranch])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/merchant/branches creates branch and sets isMainBranch on first', async () => {
    app.prisma.branch.count = vi.fn().mockResolvedValue(0)
    app.prisma.branch.create = vi.fn().mockResolvedValue({ ...mockBranch, isMainBranch: true })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'Main Branch', addressLine1: '1 Test St', city: 'London', postcode: 'EC1A 1BB' },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isMainBranch: true }) })
    )
  })

  it('POST /api/v1/merchant/branches sets isMainBranch false for subsequent branches', async () => {
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)
    app.prisma.branch.create = vi.fn().mockResolvedValue({ ...mockBranch, id: 'b2', isMainBranch: false })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'Second Branch', addressLine1: '2 Test St', city: 'London', postcode: 'EC1A 1BC' },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.branch.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ isMainBranch: false }) })
    )
  })

  it('DELETE /api/v1/merchant/branches/:id blocks deleting main branch', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue({ ...mockBranch, isMainBranch: true })

    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/merchant/branches/b1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_IS_MAIN')
  })

  it('DELETE /api/v1/merchant/branches/:id blocks deleting last active branch of live merchant', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue({ ...mockBranch, isMainBranch: false })
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', status: 'APPROVED' })
    app.prisma.branch.count = vi.fn().mockResolvedValue(1)

    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/merchant/branches/b1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('BRANCH_LAST_ACTIVE')
  })

  it('POST /api/v1/merchant/branches/:id/edit-request returns 409 when pending edit exists', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue(mockBranch)
    app.prisma.branchPendingEdit.findUnique = vi.fn().mockResolvedValue({ id: 'pe1', branchId: 'b1', status: 'PENDING', createdAt: new Date() })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/edit-request',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { name: 'New Name' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('PENDING_EDIT_EXISTS')
  })

  it('POST /api/v1/merchant/branches/:id/hours upserts full week', async () => {
    app.prisma.branch.findFirst = vi.fn().mockResolvedValue(mockBranch)
    app.prisma.branchOpeningHours.upsert = vi.fn().mockResolvedValue({})

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/branches/b1/hours',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: {
        hours: [
          { dayOfWeek: 0, isClosed: true },
          { dayOfWeek: 1, openTime: '09:00', closeTime: '17:00', isClosed: false },
        ],
      },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.branchOpeningHours.upsert).toHaveBeenCalledTimes(2)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/merchant/branch.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement branch service**

Replace `src/api/merchant/branch/service.ts` with:

```typescript
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'

const BRANCH_SENSITIVE = ['name', 'about', 'addressLine1', 'addressLine2', 'city', 'postcode', 'latitude', 'longitude', 'logoUrl', 'bannerUrl'] as const
const BRANCH_DIRECT    = ['phone', 'email', 'websiteUrl', 'isActive'] as const

export async function listBranches(prisma: PrismaClient, merchantId: string) {
  return prisma.branch.findMany({
    where: { merchantId, deletedAt: null },
    include: { openingHours: true, amenities: { include: { amenity: true } }, photos: true, pendingEdit: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function getBranch(prisma: PrismaClient, merchantId: string, branchId: string) {
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    include: { openingHours: true, amenities: { include: { amenity: true } }, photos: true, pendingEdit: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  return branch
}

export async function createBranch(
  prisma: PrismaClient,
  merchantId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const existingCount = await prisma.branch.count({ where: { merchantId, deletedAt: null } })
  const isMainBranch = existingCount === 0

  const branch = await prisma.branch.create({
    data: {
      merchantId,
      isMainBranch,
      name:        data.name as string,
      addressLine1: data.addressLine1 as string,
      addressLine2: data.addressLine2 as string | undefined,
      city:        data.city as string,
      postcode:    data.postcode as string,
      country:     (data.country as string | undefined) ?? 'GB',
      latitude:    data.latitude as number | undefined,
      longitude:   data.longitude as number | undefined,
      phone:       data.phone as string | undefined,
      email:       data.email as string | undefined,
      websiteUrl:  data.websiteUrl as string | undefined,
      logoUrl:     data.logoUrl as string | undefined,
      bannerUrl:   data.bannerUrl as string | undefined,
      about:       data.about as string | undefined,
    },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'BRANCH_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { branchId: branch.id } })
  return branch
}

export async function updateBranch(
  prisma: PrismaClient,
  merchantId: string,
  branchId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, merchantId, deletedAt: null } })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  // Handle main branch promotion atomically
  const safe: Record<string, unknown> = {}
  for (const key of BRANCH_DIRECT) { if (key in data) safe[key] = data[key] }

  if (data.isMainBranch === true && !branch.isMainBranch) {
    // Unset all other main branches for this merchant, then set this one
    await prisma.branch.updateMany({ where: { merchantId, isMainBranch: true }, data: { isMainBranch: false } })
    safe.isMainBranch = true
    writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'BRANCH_MAIN_CHANGED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { branchId } })
  }

  if (Object.keys(safe).length === 0) return getBranch(prisma, merchantId, branchId)

  const updated = await prisma.branch.update({ where: { id: branchId }, data: safe })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'BRANCH_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { branchId } })
  return updated
}

export async function createBranchEditRequest(
  prisma: PrismaClient,
  merchantId: string,
  branchId: string,
  proposedChanges: Record<string, unknown>,
  includesPhotos: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, merchantId, deletedAt: null } })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  // App-layer enforcement — check for active PENDING edit (no DB unique constraint)
  const existing = await prisma.branchPendingEdit.findFirst({ where: { branchId, status: 'PENDING' } })
  if (existing) throw new AppError('PENDING_EDIT_EXISTS')

  const filtered: Record<string, unknown> = {}
  if (includesPhotos) {
    filtered.photos = proposedChanges.photos
  } else {
    for (const key of BRANCH_SENSITIVE) { if (key in proposedChanges) filtered[key] = proposedChanges[key] }
  }

  const pendingEdit = await prisma.branchPendingEdit.create({
    data: { branchId, merchantId, proposedChanges: filtered, includesPhotos, status: 'PENDING' },
  })

  await prisma.adminApproval.create({
    data: {
      approvalType: 'BRANCH_IDENTITY_EDIT',
      status:       'PENDING',
      entityId:     pendingEdit.id,
      notes:        `Branch ${branchId} identity edit request`,
    },
  })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'BRANCH_EDIT_REQUEST_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { branchId } })
  return pendingEdit
}

export async function withdrawBranchEditRequest(
  prisma: PrismaClient,
  merchantId: string,
  branchId: string,
  editId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const edit = await prisma.branchPendingEdit.findFirst({ where: { id: editId, branchId, merchantId } })
  if (!edit) throw new AppError('PENDING_EDIT_NOT_FOUND')
  if (edit.status !== 'PENDING') throw new AppError('PENDING_EDIT_NOT_FOUND')

  const updated = await prisma.branchPendingEdit.update({
    where: { id: editId },
    data: { status: 'WITHDRAWN', reviewedAt: new Date() },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'BRANCH_EDIT_REQUEST_WITHDRAWN', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { branchId } })
  return updated
}

export async function setOpeningHours(
  prisma: PrismaClient,
  merchantId: string,
  branchId: string,
  hours: Array<{ dayOfWeek: number; openTime?: string; closeTime?: string; isClosed: boolean }>
) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, merchantId, deletedAt: null } })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  await Promise.all(hours.map(h =>
    prisma.branchOpeningHours.upsert({
      where:  { branchId_dayOfWeek: { branchId, dayOfWeek: h.dayOfWeek } },
      update: { openTime: h.openTime ?? null, closeTime: h.closeTime ?? null, isClosed: h.isClosed },
      create: { branchId, dayOfWeek: h.dayOfWeek, openTime: h.openTime, closeTime: h.closeTime, isClosed: h.isClosed },
    })
  ))
  return { updated: hours.length }
}

export async function setAmenities(
  prisma: PrismaClient,
  merchantId: string,
  branchId: string,
  amenityIds: string[]
) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, merchantId, deletedAt: null } })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  await prisma.branchAmenity.deleteMany({ where: { branchId } })
  if (amenityIds.length > 0) {
    await prisma.branchAmenity.createMany({
      data: amenityIds.map(amenityId => ({ branchId, amenityId })),
      skipDuplicates: true,
    })
  }
  return { updated: amenityIds.length }
}

export async function softDeleteBranch(
  prisma: PrismaClient,
  merchantId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const branch = await prisma.branch.findFirst({ where: { id: branchId, merchantId, deletedAt: null } })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (branch.isMainBranch) throw new AppError('BRANCH_IS_MAIN')

  const merchant = await prisma.merchant.findUnique({ where: { id: merchantId }, select: { status: true } })
  if (merchant?.status === 'APPROVED' || merchant?.status === 'LIVE') {
    const activeCount = await prisma.branch.count({ where: { merchantId, deletedAt: null } })
    if (activeCount <= 1) throw new AppError('BRANCH_LAST_ACTIVE')
  }

  await prisma.branch.update({ where: { id: branchId }, data: { deletedAt: new Date(), isActive: false } })
  await prisma.branchUser.updateMany({ where: { branchId }, data: { status: 'INACTIVE' } })

  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'BRANCH_DELETED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { branchId } })
  return { deleted: true }
}
```

- [ ] **Step 4: Implement branch routes**

Replace `src/api/merchant/branch/routes.ts` with:

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  listBranches, getBranch, createBranch, updateBranch,
  createBranchEditRequest, withdrawBranchEditRequest,
  setOpeningHours, setAmenities, softDeleteBranch,
} from './service'

const branchCreateSchema = z.object({
  name:         z.string().min(1).max(200),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city:         z.string().min(1).max(100),
  postcode:     z.string().min(1).max(20),
  country:      z.string().length(2).optional(),
  latitude:     z.number().min(-90).max(90).optional(),
  longitude:    z.number().min(-180).max(180).optional(),
  phone:        z.string().max(30).optional(),
  email:        z.string().email().optional(),
  websiteUrl:   z.string().url().optional(),
  logoUrl:      z.string().url().optional(),
  bannerUrl:    z.string().url().optional(),
  about:        z.string().max(2000).optional(),
})

const branchUpdateSchema = z.object({
  phone:        z.string().max(30).optional(),
  email:        z.string().email().optional(),
  websiteUrl:   z.string().url().optional(),
  isActive:     z.boolean().optional(),
  isMainBranch: z.boolean().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field required' })

const sensitiveEditSchema = z.object({
  name:         z.string().min(1).max(200).optional(),
  about:        z.string().max(2000).optional(),
  addressLine1: z.string().max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city:         z.string().max(100).optional(),
  postcode:     z.string().max(20).optional(),
  latitude:     z.number().min(-90).max(90).optional(),
  longitude:    z.number().min(-180).max(180).optional(),
  logoUrl:      z.string().url().optional(),
  bannerUrl:    z.string().url().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field required' })

const hoursSchema = z.object({
  hours: z.array(z.object({
    dayOfWeek: z.number().int().min(0).max(6),
    openTime:  z.string().regex(/^\d{2}:\d{2}$/).optional(),
    closeTime: z.string().regex(/^\d{2}:\d{2}$/).optional(),
    isClosed:  z.boolean(),
  })).min(1).max(7),
})

const photoEditSchema = z.object({
  add:    z.array(z.string().url()).optional(),
  remove: z.array(z.string().uuid()).optional(),
}).refine(obj => (obj.add?.length ?? 0) + (obj.remove?.length ?? 0) > 0, { message: 'Provide add or remove' })

export async function branchRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/branches'

  app.get(prefix, async (req: any, reply) => {
    return reply.send(await listBranches(app.prisma, req.merchant.merchantId))
  })

  app.post(prefix, async (req: any, reply) => {
    const body = branchCreateSchema.parse(req.body)
    const branch = await createBranch(app.prisma, req.merchant.merchantId, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(branch)
  })

  app.get(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return reply.send(await getBranch(app.prisma, req.merchant.merchantId, id))
  })

  app.patch(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = branchUpdateSchema.parse(req.body)
    return reply.send(await updateBranch(app.prisma, req.merchant.merchantId, id, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  app.post(`${prefix}/:id/edit-request`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = sensitiveEditSchema.parse(req.body)
    const result = await createBranchEditRequest(app.prisma, req.merchant.merchantId, id, body, false, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(result)
  })

  app.get(`${prefix}/:id/edit-requests`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const list = await app.prisma.branchPendingEdit.findMany({ where: { branchId: id, merchantId: req.merchant.merchantId }, orderBy: { createdAt: 'desc' } })
    return reply.send(list)
  })

  app.delete(`${prefix}/:id/edit-requests/:editId`, async (req: any, reply) => {
    const { id, editId } = z.object({ id: z.string().uuid(), editId: z.string().uuid() }).parse(req.params)
    return reply.send(await withdrawBranchEditRequest(app.prisma, req.merchant.merchantId, id, editId, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  app.post(`${prefix}/:id/hours`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { hours } = hoursSchema.parse(req.body)
    return reply.send(await setOpeningHours(app.prisma, req.merchant.merchantId, id, hours))
  })

  app.post(`${prefix}/:id/amenities`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const { amenityIds } = z.object({ amenityIds: z.array(z.string().uuid()) }).parse(req.body)
    return reply.send(await setAmenities(app.prisma, req.merchant.merchantId, id, amenityIds))
  })

  app.post(`${prefix}/:id/photos/edit-request`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = photoEditSchema.parse(req.body)
    const result = await createBranchEditRequest(app.prisma, req.merchant.merchantId, id, { photos: body }, true, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(result)
  })

  app.delete(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return reply.send(await softDeleteBranch(app.prisma, req.merchant.merchantId, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/merchant/branch.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/merchant/branch/ tests/api/merchant/branch.test.ts
git commit -m "feat: branch CRUD, opening hours, amenities, photo and identity edit-request flow"
```

---

## Task 8: Custom voucher lifecycle

**Files:**
- Modify: `src/api/merchant/voucher/service.ts`
- Modify: `src/api/merchant/voucher/routes.ts`
- Create: `tests/api/merchant/voucher.test.ts`

### Context

Custom vouchers: created as `DRAFT`, merchant edits freely, submits explicitly. Only `DRAFT` or `NEEDS_CHANGES` are editable. Only `DRAFT` is deletable. Only `DRAFT` or `NEEDS_CHANGES` are submittable (→ `PENDING_APPROVAL`).

The `Voucher` model fields: `id`, `merchantId`, `code`, `isMandatory`, `type`, `title`, `description`, `terms`, `imageUrl`, `estimatedSaving`, `expiryDate`, `status`, `approvalStatus`, `isRmv`, `rmvTemplateId`, `merchantFields`.

The `code` field must be unique — generate it using `nanoid` with a prefix `RCV-` for custom vouchers.

- [ ] **Step 1: Write failing tests**

Create `tests/api/merchant/voucher.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant custom voucher routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockVoucher = {
    id: 'v1', merchantId: 'm1', code: 'RCV-ABC123', isRmv: false,
    type: 'DISCOUNT_PERCENT', title: '10% off', description: null, terms: null,
    imageUrl: null, estimatedSaving: 5.00, expiryDate: null,
    status: 'DRAFT', approvalStatus: 'PENDING', isMandatory: false,
    rmvTemplateId: null, merchantFields: null,
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      voucher: {
        findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(),
        update: vi.fn(), delete: vi.fn(),
      },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as any)
    merchantToken = app.merchantSign({ adminId: 'ma1', merchantId: 'm1', email: 'merchant@test.com' })
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/vouchers returns vouchers', async () => {
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([mockVoucher])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('POST /api/v1/merchant/vouchers creates a DRAFT voucher', async () => {
    app.prisma.voucher.create = vi.fn().mockResolvedValue({ ...mockVoucher })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { type: 'DISCOUNT_PERCENT', title: '10% off', estimatedSaving: 5.00 },
    })
    expect(res.statusCode).toBe(201)
    expect(app.prisma.voucher.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'DRAFT', isRmv: false }) })
    )
  })

  it('PATCH /api/v1/merchant/vouchers/:id updates a DRAFT voucher', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockVoucher, title: 'Updated title' })
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Updated title' },
    })
    expect(res.statusCode).toBe(200)
  })

  it('PATCH /api/v1/merchant/vouchers/:id returns 409 for PENDING_APPROVAL voucher', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Updated title' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_EDITABLE')
  })

  it('POST /api/v1/merchant/vouchers/:id/submit moves DRAFT to PENDING_APPROVAL', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/v1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) })
    )
  })

  it('DELETE /api/v1/merchant/vouchers/:id deletes a DRAFT voucher', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'DRAFT' })
    app.prisma.voucher.delete = vi.fn().mockResolvedValue(mockVoucher)
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
  })

  it('DELETE /api/v1/merchant/vouchers/:id returns 409 for non-DRAFT voucher', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockVoucher, status: 'PENDING_APPROVAL' })
    const res = await app.inject({
      method: 'DELETE', url: '/api/v1/merchant/vouchers/v1',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('VOUCHER_NOT_DELETABLE')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/merchant/voucher.test.ts
```

Expected: FAIL — routes not found.

- [ ] **Step 3: Implement voucher service (custom vouchers)**

Replace `src/api/merchant/voucher/service.ts` with:

```typescript
import { nanoid } from 'nanoid'
import { PrismaClient } from '../../../../generated/prisma/client'
import { AppError } from '../../shared/errors'
import { writeAuditLog } from '../../shared/audit'

const EDITABLE_STATUSES  = ['DRAFT', 'NEEDS_CHANGES'] as const
const SUBMITTABLE_STATUSES = ['DRAFT', 'NEEDS_CHANGES'] as const

export async function listVouchers(prisma: PrismaClient, merchantId: string) {
  return prisma.voucher.findMany({
    where: { merchantId, isRmv: false },
    orderBy: { createdAt: 'desc' },
  })
}

export async function getVoucher(prisma: PrismaClient, merchantId: string, voucherId: string) {
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: false } })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  return voucher
}

export async function createVoucher(
  prisma: PrismaClient,
  merchantId: string,
  data: {
    type: string; title: string; estimatedSaving: number;
    description?: string; terms?: string; imageUrl?: string; expiryDate?: string;
  },
  ctx: { ipAddress: string; userAgent: string }
) {
  const code = `RCV-${nanoid(8).toUpperCase()}`
  const voucher = await prisma.voucher.create({
    data: {
      merchantId,
      code,
      isRmv:          false,
      isMandatory:    false,
      type:           data.type as any,
      title:          data.title,
      estimatedSaving: data.estimatedSaving,
      description:    data.description,
      terms:          data.terms,
      imageUrl:       data.imageUrl,
      expiryDate:     data.expiryDate ? new Date(data.expiryDate) : undefined,
      status:         'DRAFT',
      approvalStatus: 'PENDING',
    },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'VOUCHER_CREATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId: voucher.id } })
  return voucher
}

export async function updateVoucher(
  prisma: PrismaClient,
  merchantId: string,
  voucherId: string,
  data: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: false } })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (!EDITABLE_STATUSES.includes(voucher.status as any)) throw new AppError('VOUCHER_NOT_EDITABLE')

  const allowedFields = ['title', 'description', 'terms', 'imageUrl', 'estimatedSaving', 'expiryDate', 'type']
  const safe: Record<string, unknown> = {}
  for (const key of allowedFields) { if (key in data) safe[key] = data[key] }
  if (data.expiryDate) safe.expiryDate = new Date(data.expiryDate as string)

  const updated = await prisma.voucher.update({ where: { id: voucherId }, data: safe })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'VOUCHER_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return updated
}

export async function submitVoucher(
  prisma: PrismaClient,
  merchantId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: false } })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (!SUBMITTABLE_STATUSES.includes(voucher.status as any)) throw new AppError('VOUCHER_NOT_SUBMITTABLE')

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data:  { status: 'PENDING_APPROVAL', publishedAt: new Date() },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'VOUCHER_SUBMITTED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return updated
}

export async function deleteVoucher(
  prisma: PrismaClient,
  merchantId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: false } })
  if (!voucher) throw new AppError('VOUCHER_NOT_FOUND')
  if (voucher.status !== 'DRAFT') throw new AppError('VOUCHER_NOT_DELETABLE')

  await prisma.voucher.delete({ where: { id: voucherId } })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'VOUCHER_DELETED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return { deleted: true }
}
```

- [ ] **Step 4: Implement voucher routes (custom)**

Replace `src/api/merchant/voucher/routes.ts` with:

```typescript
import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import {
  listVouchers, getVoucher, createVoucher, updateVoucher, submitVoucher, deleteVoucher,
  listRmvVouchers, updateRmvVoucher, submitRmvVoucher,
} from './service'

const VoucherType = z.enum(['BOGO', 'SPEND_AND_SAVE', 'DISCOUNT_FIXED', 'DISCOUNT_PERCENT', 'FREEBIE', 'PACKAGE_DEAL', 'TIME_LIMITED', 'REUSABLE'])

const createVoucherSchema = z.object({
  type:            VoucherType,
  title:           z.string().min(1).max(200),
  estimatedSaving: z.number().positive(),
  description:     z.string().max(2000).optional(),
  terms:           z.string().max(2000).optional(),
  imageUrl:        z.string().url().optional(),
  expiryDate:      z.string().datetime().optional(),
})

const updateVoucherSchema = z.object({
  type:            VoucherType.optional(),
  title:           z.string().min(1).max(200).optional(),
  estimatedSaving: z.number().positive().optional(),
  description:     z.string().max(2000).optional(),
  terms:           z.string().max(2000).optional(),
  imageUrl:        z.string().url().optional(),
  expiryDate:      z.string().datetime().optional(),
}).refine(obj => Object.keys(obj).length > 0, { message: 'At least one field required' })

export async function voucherRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/vouchers'

  app.get(prefix, async (req: any, reply) => {
    return reply.send(await listVouchers(app.prisma, req.merchant.merchantId))
  })

  app.post(prefix, async (req: any, reply) => {
    const body = createVoucherSchema.parse(req.body)
    const voucher = await createVoucher(app.prisma, req.merchant.merchantId, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(voucher)
  })

  app.get(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return reply.send(await getVoucher(app.prisma, req.merchant.merchantId, id))
  })

  app.patch(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = updateVoucherSchema.parse(req.body)
    return reply.send(await updateVoucher(app.prisma, req.merchant.merchantId, id, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  app.post(`${prefix}/:id/submit`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return reply.send(await submitVoucher(app.prisma, req.merchant.merchantId, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  app.delete(`${prefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return reply.send(await deleteVoucher(app.prisma, req.merchant.merchantId, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  // RMV routes added in Task 9
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/merchant/voucher.test.ts
```

Expected: PASS (7 tests).

- [ ] **Step 6: Commit**

```bash
git add src/api/merchant/voucher/ tests/api/merchant/voucher.test.ts
git commit -m "feat: custom voucher CRUD and lifecycle — create, edit, submit, delete"
```

---

## Task 9: RMV lifecycle — provisioning, edit, submit, category change

**Files:**
- Modify: `src/api/merchant/voucher/service.ts` (add RMV functions)
- Modify: `src/api/merchant/voucher/routes.ts` (add RMV routes)
- Modify: `src/api/merchant/profile/service.ts` (add RMV provisioning trigger)
- Create: `tests/api/merchant/voucher-rmv.test.ts`

### Context

RMV provisioning is triggered when `primaryCategoryId` is set via `PATCH /merchant/profile`. The service looks up `RmvTemplate` rows for the category, creates 2 draft `Voucher` rows with `isRmv: true`, pre-populates template values, and leaves `merchantFields` empty.

Category change rules:
- If any RMV voucher has status `PENDING_APPROVAL`, `ACTIVE`, or `NEEDS_CHANGES` → block with `CATEGORY_CHANGE_BLOCKED`
- If all RMV are `DRAFT` → require `confirm: true` in the PATCH body → soft-delete existing drafts, provision new ones

RMV code prefix: `RMV-` + nanoid(8).

Merchant-editable RMV fields come from `template.allowedFields` (a JSON array like `["terms", "expiryDate"]`). Only those fields may be set via `PATCH /vouchers/rmv/:id`.

- [ ] **Step 1: Write failing RMV tests**

Create `tests/api/merchant/voucher-rmv.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

describe('merchant RMV voucher routes', () => {
  let app: FastifyInstance
  let merchantToken: string

  const mockTemplate = {
    id: 'tmpl1', categoryId: 'cat1', voucherType: 'BOGO', title: 'Buy One Get One Free',
    description: 'Get a second item free.', allowedFields: ['terms', 'expiryDate'],
    minimumSaving: 5.00, isActive: true,
  }

  const mockRmv = {
    id: 'rmv1', merchantId: 'm1', code: 'RMV-ABC123', isRmv: true, rmvTemplateId: 'tmpl1',
    type: 'BOGO', title: 'Buy One Get One Free', description: 'Get a second item free.',
    estimatedSaving: 5.00, status: 'DRAFT', approvalStatus: 'PENDING',
    merchantFields: null, isMandatory: true,
  }

  beforeEach(async () => {
    app = await buildApp()
    app.decorate('prisma', {
      voucher: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
      rmvTemplate: { findMany: vi.fn() },
      merchant: { findUnique: vi.fn(), update: vi.fn() },
      auditLog: { create: vi.fn().mockResolvedValue({}) },
    } as any)
    app.decorate('redis', { get: vi.fn().mockResolvedValue(null) } as any)
    merchantToken = app.merchantSign({ adminId: 'ma1', merchantId: 'm1', email: 'merchant@test.com' })
  })

  afterEach(async () => { await app.close() })

  it('GET /api/v1/merchant/vouchers/rmv returns RMV vouchers', async () => {
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([mockRmv])
    const res = await app.inject({
      method: 'GET', url: '/api/v1/merchant/vouchers/rmv',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toHaveLength(1)
  })

  it('PATCH /api/v1/merchant/vouchers/rmv/:id updates allowed fields only', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockRmv, rmvTemplate: mockTemplate })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockRmv, merchantFields: { terms: 'Min spend £10' } })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { terms: 'Min spend £10' },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ merchantFields: expect.objectContaining({ terms: 'Min spend £10' }) }) })
    )
  })

  it('PATCH /api/v1/merchant/vouchers/rmv/:id rejects disallowed fields', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockRmv, rmvTemplate: mockTemplate })

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/vouchers/rmv/rmv1',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { title: 'Sneaky name change', terms: 'OK term' },
    })
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error.code).toBe('RMV_FIELD_NOT_ALLOWED')
  })

  it('POST /api/v1/merchant/vouchers/rmv/:id/submit moves DRAFT to PENDING_APPROVAL', async () => {
    app.prisma.voucher.findFirst = vi.fn().mockResolvedValue({ ...mockRmv, status: 'DRAFT' })
    app.prisma.voucher.update = vi.fn().mockResolvedValue({ ...mockRmv, status: 'PENDING_APPROVAL' })

    const res = await app.inject({
      method: 'POST', url: '/api/v1/merchant/vouchers/rmv/rmv1/submit',
      headers: { authorization: `Bearer ${merchantToken}` },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'PENDING_APPROVAL' }) })
    )
  })

  it('PATCH /api/v1/merchant/profile with new primaryCategoryId provisions RMV', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: null })
    app.prisma.merchant.update = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'cat1' })
    app.prisma.rmvTemplate.findMany = vi.fn().mockResolvedValue([mockTemplate, { ...mockTemplate, id: 'tmpl2', title: '25% Off' }])
    app.prisma.voucher.create = vi.fn().mockResolvedValue(mockRmv)

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { primaryCategoryId: 'cat1' },
    })
    expect(res.statusCode).toBe(200)
    expect(app.prisma.voucher.create).toHaveBeenCalledTimes(2)
  })

  it('PATCH /api/v1/merchant/profile blocks category change if RMV submitted', async () => {
    app.prisma.merchant.findUnique = vi.fn().mockResolvedValue({ id: 'm1', primaryCategoryId: 'cat1' })
    app.prisma.voucher.findMany = vi.fn().mockResolvedValue([{ ...mockRmv, status: 'PENDING_APPROVAL' }])

    const res = await app.inject({
      method: 'PATCH', url: '/api/v1/merchant/profile',
      headers: { authorization: `Bearer ${merchantToken}` },
      payload: { primaryCategoryId: 'cat2' },
    })
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error.code).toBe('CATEGORY_CHANGE_BLOCKED')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/api/merchant/voucher-rmv.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Add RMV functions to voucher service**

In `src/api/merchant/voucher/service.ts`, append after `deleteVoucher`:

```typescript
// ─── RMV ───────────────────────────────────────────────────────────────────

export async function listRmvVouchers(prisma: PrismaClient, merchantId: string) {
  return prisma.voucher.findMany({
    where: { merchantId, isRmv: true },
    include: { rmvTemplate: true },
    orderBy: { createdAt: 'asc' },
  })
}

export async function updateRmvVoucher(
  prisma: PrismaClient,
  merchantId: string,
  voucherId: string,
  proposedFields: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string }
) {
  const voucher = await prisma.voucher.findFirst({
    where: { id: voucherId, merchantId, isRmv: true },
    include: { rmvTemplate: true },
  })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (!EDITABLE_STATUSES.includes(voucher.status as any)) throw new AppError('VOUCHER_NOT_EDITABLE')

  const allowedFields: string[] = (voucher.rmvTemplate?.allowedFields as string[]) ?? []
  const disallowed = Object.keys(proposedFields).filter(k => !allowedFields.includes(k))
  if (disallowed.length > 0) throw new AppError('RMV_FIELD_NOT_ALLOWED')

  const currentFields = (voucher.merchantFields as Record<string, unknown>) ?? {}
  const merged = { ...currentFields, ...proposedFields }

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data:  { merchantFields: merged },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return updated
}

export async function submitRmvVoucher(
  prisma: PrismaClient,
  merchantId: string,
  voucherId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const voucher = await prisma.voucher.findFirst({ where: { id: voucherId, merchantId, isRmv: true } })
  if (!voucher) throw new AppError('RMV_NOT_FOUND')
  if (!SUBMITTABLE_STATUSES.includes(voucher.status as any)) throw new AppError('VOUCHER_NOT_SUBMITTABLE')

  const updated = await prisma.voucher.update({
    where: { id: voucherId },
    data:  { status: 'PENDING_APPROVAL', publishedAt: new Date() },
  })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_SUBMITTED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { voucherId } })
  return updated
}

export async function provisionRmvVouchers(
  prisma: PrismaClient,
  merchantId: string,
  categoryId: string,
  ctx: { ipAddress: string; userAgent: string }
) {
  const templates = await prisma.rmvTemplate.findMany({ where: { categoryId, isActive: true } })
  if (templates.length < 2) throw new AppError('NO_RMV_TEMPLATE')

  const created = await Promise.all(templates.slice(0, 2).map(t =>
    prisma.voucher.create({
      data: {
        merchantId,
        code:            `RMV-${nanoid(8).toUpperCase()}`,
        isRmv:           true,
        isMandatory:     true,
        rmvTemplateId:   t.id,
        type:            t.voucherType,
        title:           t.title,
        description:     t.description,
        estimatedSaving: t.minimumSaving,
        status:          'DRAFT',
        approvalStatus:  'PENDING',
        merchantFields:  {},
      },
    })
  ))
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'RMV_PROVISIONED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { categoryId } })
  return created
}

export async function handleCategoryChange(
  prisma: PrismaClient,
  merchantId: string,
  newCategoryId: string,
  confirm: boolean,
  ctx: { ipAddress: string; userAgent: string }
) {
  // Check if any RMV has been submitted
  const submittedRmv = await prisma.voucher.findMany({
    where: { merchantId, isRmv: true, status: { in: ['PENDING_APPROVAL', 'ACTIVE', 'NEEDS_CHANGES'] } },
  })
  if (submittedRmv.length > 0) throw new AppError('CATEGORY_CHANGE_BLOCKED')

  if (!confirm) {
    // Return a warning — client must re-send with confirm: true
    return { requiresConfirmation: true, message: 'Changing category will discard your existing RMV drafts. Re-send with confirm: true to proceed.' }
  }

  // Soft-delete existing draft RMVs
  await prisma.voucher.updateMany({
    where:  { merchantId, isRmv: true, status: 'DRAFT' },
    data:   { status: 'INACTIVE' },
  })

  // Provision new RMVs from new category
  await provisionRmvVouchers(prisma, merchantId, newCategoryId, ctx)
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'CATEGORY_CHANGED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent, metadata: { newCategoryId } })
  return { changed: true }
}
```

- [ ] **Step 4: Add RMV routes to voucher routes**

In `src/api/merchant/voucher/routes.ts`, add before the final closing brace of `voucherRoutes`:

```typescript
  // ─── RMV routes ───────────────────────────────────────────────────────────
  const rmvPrefix = `${prefix}/rmv`

  app.get(rmvPrefix, async (req: any, reply) => {
    return reply.send(await listRmvVouchers(app.prisma, req.merchant.merchantId))
  })

  app.patch(`${rmvPrefix}/:id`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    const body = z.record(z.unknown()).parse(req.body)
    return reply.send(await updateRmvVoucher(app.prisma, req.merchant.merchantId, id, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  app.post(`${rmvPrefix}/:id/submit`, async (req: any, reply) => {
    const { id } = z.object({ id: z.string().uuid() }).parse(req.params)
    return reply.send(await submitRmvVoucher(app.prisma, req.merchant.merchantId, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })
```

- [ ] **Step 5: Update profile service to handle primaryCategoryId change**

In `src/api/merchant/profile/service.ts`, update `updateMerchantProfile` to handle `primaryCategoryId`:

```typescript
// At top of file, add import:
import { handleCategoryChange, provisionRmvVouchers } from '../voucher/service'

// Replace the updateMerchantProfile function with:
export async function updateMerchantProfile(
  prisma: PrismaClient,
  merchantId: string,
  updates: Record<string, unknown>,
  ctx: { ipAddress: string; userAgent: string; adminId: string }
) {
  const safe: Record<string, unknown> = {}
  for (const key of ['websiteUrl', 'vatNumber', 'companyNumber'] as const) {
    if (key in updates) safe[key] = updates[key]
  }

  // Handle primaryCategoryId — may trigger RMV provisioning or category change
  if ('primaryCategoryId' in updates) {
    const merchant = await prisma.merchant.findUnique({
      where: { id: merchantId },
      select: { primaryCategoryId: true },
    })
    if (!merchant) throw new AppError('MERCHANT_NOT_FOUND')

    const newCategoryId = updates.primaryCategoryId as string
    const confirm = updates.confirm === true

    if (merchant.primaryCategoryId === null) {
      // First time setting category — provision RMVs
      safe.primaryCategoryId = newCategoryId
      await prisma.merchant.update({ where: { id: merchantId }, data: safe })
      await provisionRmvVouchers(prisma, merchantId, newCategoryId, ctx)
      writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
      return getMerchantProfile(prisma, merchantId)
    }

    if (merchant.primaryCategoryId !== newCategoryId) {
      // Category change — apply change rules
      const result = await handleCategoryChange(prisma, merchantId, newCategoryId, confirm, ctx)
      if ('requiresConfirmation' in result) return result
      safe.primaryCategoryId = newCategoryId
    }
  }

  if (Object.keys(safe).length === 0) return getMerchantProfile(prisma, merchantId)

  await prisma.merchant.update({ where: { id: merchantId }, data: safe })
  writeAuditLog(prisma, { entityId: merchantId, entityType: 'merchant', event: 'MERCHANT_PROFILE_UPDATED', ipAddress: ctx.ipAddress, userAgent: ctx.userAgent })
  return getMerchantProfile(prisma, merchantId)
}
```

- [ ] **Step 6: Run all tests to verify they pass**

```bash
npx vitest run tests/api/merchant/
```

Expected: PASS (all tests across all 5 test files).

- [ ] **Step 7: Commit**

```bash
git add src/api/merchant/ tests/api/merchant/voucher-rmv.test.ts
git commit -m "feat: RMV voucher lifecycle — provisioning, allowed-field editing, category change rules, submit"
```

---

## Task 10: Full test suite run and TypeScript build check

**Files:** No new files

### Context

Run the complete test suite to confirm nothing is broken across Phase 2B (auth) and Phase 2C (merchant/branch/voucher). Then do a TypeScript compile check.

- [ ] **Step 1: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass. If any fail, read the error and fix before proceeding.

- [ ] **Step 2: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors. Fix any type errors before committing.

- [ ] **Step 3: Commit fix if needed**

If any TypeScript errors were found and fixed:

```bash
git add -p
git commit -m "fix: resolve TypeScript errors from Phase 2C implementation"
```

- [ ] **Step 4: Final commit marking phase complete**

```bash
git commit --allow-empty -m "chore: Phase 2C complete — merchant profile, branch, voucher, RMV APIs"
```

---

## Self-Review Checklist

Run after all tasks are complete:

- [ ] All routes in the spec are implemented (GET/PATCH profile, edit-request CRUD, onboarding checklist/contract/submit, branch CRUD + hours + amenities + photos, voucher CRUD + submit, RMV list/patch/submit)
- [ ] Pending edit 409 logic works for both merchant and branch
- [ ] Onboarding checklist reads from real data (branch count, contractStatus, rmv count)
- [ ] `onboardingStep` enum is updated as side-effect, never used as gate condition
- [ ] RMV provisioned as DRAFT only — no admin queue entry at provisioning time
- [ ] Category change blocked if any RMV submitted; requires `confirm: true` for draft-only change
- [ ] Branch delete rules enforced (main branch, last active branch of live merchant)
- [ ] Audit log written for every mutating operation
- [ ] `npx vitest run` passes
- [ ] `npx tsc --noEmit` passes
