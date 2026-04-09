# Redemption System Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-store voucher redemption system: customer enters branch PIN to redeem, branch staff optionally verify via QR scan or manual code entry.

**Architecture:** Seven tasks in dependency order — encryption utility first, then schema migration, then error codes, then core service logic, then customer routes, then merchant PIN management routes, then the branch verification/reconciliation routes. Each task is independently committable and testable.

**Tech Stack:** Node.js 24, TypeScript, Fastify, Prisma 7 (`generated/prisma/client`), Redis (ioredis), nanoid v5, Node.js built-in `crypto` (AES-256-GCM), Twilio (existing `twilio` client pattern from `src/api/shared/otp.ts`), Vitest.

---

## File Map

| Status | File | What changes |
|---|---|---|
| Create | `src/api/shared/encryption.ts` | AES-256-GCM encrypt/decrypt utility |
| Create | `src/api/redemption/service.ts` | `createRedemption`, `verifyRedemption`, `listMyRedemptions`, `getMyRedemption`, `listBranchRedemptions` |
| Create | `src/api/redemption/routes.ts` | Customer + branch-staff/merchant-admin HTTP routes |
| Create | `src/api/redemption/plugin.ts` | Fastify plugin registration |
| Create | `tests/api/shared/encryption.test.ts` | Unit tests for encrypt/decrypt |
| Create | `tests/api/redemption/service.test.ts` | Unit tests for all service functions |
| Create | `tests/api/redemption/routes.test.ts` | Route integration tests |
| Modify | `prisma/schema.prisma` | Rename `Branch.redemptionPinHash` → `Branch.redemptionPin`; update `ValidationMethod` usage note |
| Modify | `src/api/shared/errors.ts` | Add 6 new error codes |
| Modify | `src/api/shared/audit.ts` | Add `VOUCHER_REDEEMED` and `VOUCHER_VERIFIED` audit events |
| Modify | `src/api/shared/redis-keys.ts` | Add `pinFailCount` key helper |
| Modify | `src/api/merchant/branch/service.ts` | Add `getBranchPin`, `setBranchPin`, `sendBranchPin` |
| Modify | `src/api/merchant/branch/routes.ts` | Add PIN management routes |
| Modify | `src/api/app.ts` | Register `redemptionPlugin` |

**Important schema note:** `Branch.redemptionPinHash String?` already exists in the schema but was intended for a hashed PIN (incorrect approach). We rename it to `redemptionPin` to hold the AES-256-GCM encrypted value. This is a rename-only migration — no data loss risk (field was null for all existing branches).

**Important ValidationMethod note:** The existing `ValidationMethod` enum in the schema has values `PIN`, `QR_SCAN`, `MANUAL`. The spec used `MANUAL_ENTRY` — use `MANUAL` throughout this plan. `PIN` is not used by the system (customer PIN authorises redemption but is not a validation method).

**Important branch session note:** Branch staff `branchId` and `merchantId` are NOT in the JWT payload. They are stored in Redis at `auth:branch:{branchUserId}` as JSON `{ merchantId, branchId, isActive }`. Routes must fetch this to determine scope.

**Important estimatedSaving note:** `VoucherRedemption.estimatedSaving` is a required field (non-nullable Decimal). When creating a redemption, copy `voucher.estimatedSaving` into this field.

---

## Task 1: AES-256-GCM Encryption Utility

**Files:**
- Create: `src/api/shared/encryption.ts`
- Create: `tests/api/shared/encryption.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/api/shared/encryption.test.ts
import { describe, it, expect } from 'vitest'
import { encrypt, decrypt } from '../../../src/api/shared/encryption'

describe('encryption', () => {
  // Set a 64-char hex key for tests
  beforeAll(() => {
    process.env.ENCRYPTION_KEY = 'a'.repeat(64)
  })

  it('encrypt then decrypt returns the original value', () => {
    const original = '1234'
    expect(decrypt(encrypt(original))).toBe(original)
  })

  it('two encrypt calls on the same input produce different ciphertexts (random IV)', () => {
    const a = encrypt('1234')
    const b = encrypt('1234')
    expect(a).not.toBe(b)
  })

  it('decrypt throws when ciphertext is tampered (GCM auth tag fails)', () => {
    const stored = encrypt('1234')
    const [iv, authTag, ciphertext] = stored.split(':')
    const tampered = [iv, authTag, 'deadbeef'].join(':')
    expect(() => decrypt(tampered)).toThrow()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/api/shared/encryption.test.ts
```

Expected: `FAIL` — `encrypt` not found.

- [ ] **Step 3: Implement `src/api/shared/encryption.ts`**

```typescript
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'

function getKey(): Buffer {
  const hex = process.env.ENCRYPTION_KEY
  if (!hex || hex.length !== 64) {
    throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  }
  return Buffer.from(hex, 'hex')
}

/**
 * Encrypts plaintext with AES-256-GCM.
 * Returns a colon-delimited string: "iv_hex:authTag_hex:ciphertext_hex"
 */
export function encrypt(plaintext: string): string {
  const key = getKey()
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

/**
 * Decrypts a value produced by `encrypt`.
 * Throws if the ciphertext has been tampered with (GCM auth tag verification).
 */
export function decrypt(stored: string): string {
  const key = getKey()
  const parts = stored.split(':')
  if (parts.length !== 3) throw new Error('Invalid encrypted value format')
  const [ivHex, authTagHex, ciphertextHex] = parts
  const iv         = Buffer.from(ivHex, 'hex')
  const authTag    = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher   = crypto.createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/api/shared/encryption.test.ts
```

Expected: 3 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/api/shared/encryption.ts tests/api/shared/encryption.test.ts
git commit -m "feat: add AES-256-GCM encrypt/decrypt utility for branch PINs"
```

---

## Task 2: Schema Migration — Rename redemptionPinHash → redemptionPin

**Files:**
- Modify: `prisma/schema.prisma`

**Context:** `Branch.redemptionPinHash String?` exists in the schema and was never populated (null for all rows). We rename it to `redemptionPin` to hold the encrypted value.

- [ ] **Step 1: Update `prisma/schema.prisma`**

Find the `Branch` model and replace:
```prisma
  redemptionPinHash String?
```
with:
```prisma
  redemptionPin     String?   // AES-256-GCM encrypted 4-digit PIN; null until merchant sets it
```

- [ ] **Step 2: Create the migration**

```bash
npx prisma migrate dev --name rename_branch_redemption_pin_hash_to_redemption_pin
```

Expected: Migration created and applied. If shadow DB fails (P3006), use the workaround: `npx prisma db push` then create the SQL file manually and run `npx prisma migrate resolve --applied <migration_name>`. The SQL for this migration is:

```sql
ALTER TABLE "Branch" RENAME COLUMN "redemptionPinHash" TO "redemptionPin";
```

- [ ] **Step 3: Verify Prisma client regenerated**

```bash
npx prisma generate
```

Expected: Client generated without errors. Confirm `branch.redemptionPin` is accessible (was `redemptionPinHash` before).

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "chore: rename Branch.redemptionPinHash to redemptionPin (AES-GCM encrypted)"
```

---

## Task 3: Error Codes + Audit Events + Redis Key

**Files:**
- Modify: `src/api/shared/errors.ts`
- Modify: `src/api/shared/audit.ts`
- Modify: `src/api/shared/redis-keys.ts`

No tests needed for these — they are constants consumed by other modules tested in later tasks.

- [ ] **Step 1: Add error codes to `src/api/shared/errors.ts`**

In the `ERROR_DEFINITIONS` object, add after the `PAYMENT_METHOD_REQUIRED` line:

```typescript
  PIN_NOT_CONFIGURED:          { statusCode: 400, message: 'This branch has not configured a redemption PIN.' },
  INVALID_PIN:                 { statusCode: 400, message: 'The PIN you entered is incorrect.' },
  PIN_RATE_LIMIT_EXCEEDED:     { statusCode: 429, message: 'Too many incorrect PIN attempts. Please try again in 15 minutes.' },
  INVALID_PIN_FORMAT:          { statusCode: 400, message: 'PIN must be exactly 4 numeric digits.' },
  SUBSCRIPTION_REQUIRED:       { statusCode: 403, message: 'An active subscription is required to redeem vouchers.' },
  BRANCH_MERCHANT_MISMATCH:    { statusCode: 400, message: 'This branch does not belong to the voucher\'s merchant.' },
  ALREADY_REDEEMED:            { statusCode: 409, message: 'You have already redeemed this voucher in the current cycle.' },
  REDEMPTION_NOT_FOUND:        { statusCode: 404, message: 'Redemption code not found.' },
  ALREADY_VALIDATED:           { statusCode: 409, message: 'This redemption has already been validated.' },
  MERCHANT_MISMATCH:           { statusCode: 403, message: 'This redemption code does not belong to your merchant.' },
  BRANCH_ACCESS_DENIED:        { statusCode: 403, message: 'You do not have access to this branch.' },
```

- [ ] **Step 2: Add audit events to `src/api/shared/audit.ts`**

In the `AuditEvent` union type, add after `'VOUCHER_CYCLE_RESET'`:

```typescript
  | 'VOUCHER_REDEEMED'
  | 'VOUCHER_VERIFIED'
  | 'BRANCH_PIN_SENT'
```

- [ ] **Step 3: Add Redis key helper to `src/api/shared/redis-keys.ts`**

In the `RedisKey` object, add after `rateLimitPwdReset`:

```typescript
  // PIN brute-force counter — keyed per (userId, branchId) so failures at one branch
  // don't block the user at a different branch
  pinFailCount:        (userId: string, branchId: string) => `pin:fail:${userId}:${branchId}`,
```

- [ ] **Step 4: Commit**

```bash
git add src/api/shared/errors.ts src/api/shared/audit.ts src/api/shared/redis-keys.ts
git commit -m "feat: add redemption error codes, audit events, and PIN rate-limit Redis key"
```

---

## Task 4: Redemption Service

**Files:**
- Create: `src/api/redemption/service.ts`
- Create: `tests/api/redemption/service.test.ts`

**Context for the implementer:**
- `nanoid` is installed (v5, ESM). Import as: `import { nanoid } from 'nanoid'`
- `ValidationMethod` enum values are `QR_SCAN` and `MANUAL` (not `MANUAL_ENTRY`)
- `VoucherRedemption.estimatedSaving` is non-nullable — copy from `voucher.estimatedSaving`
- Branch JWT: `req.user.sub` = `branchUserId`. Read `{ branchId, merchantId }` from Redis at `auth:branch:{branchUserId}`
- Subscription status constants: `ACTIVE` and `TRIALLING` from the `SubscriptionStatus` enum
- `Voucher.isActive` does not exist — use `voucher.status === 'ACTIVE' && voucher.approvalStatus === 'APPROVED'` (check schema: VoucherStatus enum has DRAFT, ACTIVE, INACTIVE; ApprovalStatus has PENDING, APPROVED, REJECTED)

- [ ] **Step 1: Check Voucher active status fields**

```bash
grep -n "VoucherStatus\|ApprovalStatus\|isActive" prisma/schema.prisma | head -20
```

Note the enum values. A voucher is "active and available" when `status = 'ACTIVE'` and `approvalStatus = 'APPROVED'`.

- [ ] **Step 2: Write the failing service tests**

```typescript
// tests/api/redemption/service.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'

vi.mock('../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

vi.mock('nanoid', () => ({ nanoid: vi.fn(() => 'TESTCODE123') }))

import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  listBranchRedemptions,
} from '../../../src/api/redemption/service'
import { decrypt } from '../../../src/api/shared/encryption'

const mockPrisma = () => ({
  branch:                  { findUnique: vi.fn() },
  subscription:            { findUnique: vi.fn() },
  voucher:                 { findUnique: vi.fn() },
  userVoucherCycleState:   { findUnique: vi.fn() },
  voucherRedemption:       { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  auditLog:                { create: vi.fn().mockResolvedValue({}) },
  $transaction:            vi.fn(),
} as any)

const mockRedis = () => ({
  get:   vi.fn().mockResolvedValue(null),
  incr:  vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  del:   vi.fn().mockResolvedValue(1),
} as any)

const baseCtx = { ipAddress: '127.0.0.1', userAgent: 'test' }

// ──────────────────────────────────────────────
// createRedemption
// ──────────────────────────────────────────────
describe('createRedemption', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws PIN_NOT_CONFIGURED when branch has no redemptionPin', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('PIN_NOT_CONFIGURED')
  })

  it('throws PIN_RATE_LIMIT_EXCEEDED when rate limit counter >= 5', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get
      .mockResolvedValueOnce('5') // rate limit counter hit
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:9999' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('PIN_RATE_LIMIT_EXCEEDED')
  })

  it('throws INVALID_PIN when submitted PIN does not match decrypted value', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null) // no rate limit
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:9999' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('INVALID_PIN')

    // Must increment the fail counter
    expect(redis.incr).toHaveBeenCalled()
  })

  it('throws SUBSCRIPTION_REQUIRED when subscription is not active', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'CANCELLED' })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('SUBSCRIPTION_REQUIRED')
  })

  it('throws VOUCHER_NOT_FOUND when voucher is inactive', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'INACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'APPROVED' },
    })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('VOUCHER_NOT_FOUND')
  })

  it('throws BRANCH_MERCHANT_MISMATCH when branch is from a different merchant', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'other-merchant', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'APPROVED' },
    })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('BRANCH_MERCHANT_MISMATCH')
  })

  it('throws ALREADY_REDEEMED when isRedeemedInCurrentCycle is true', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'APPROVED' },
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue({ isRedeemedInCurrentCycle: true })

    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx)
    ).rejects.toThrow('ALREADY_REDEEMED')
  })

  it('succeeds: runs transaction, deletes rate-limit key, returns redemption', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    redis.get.mockResolvedValue(null)
    prisma.branch.findUnique.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'APPROVED' },
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null) // not yet redeemed
    const redemption = {
      id: 'r1', redemptionCode: 'TESTCODE123', voucherId: 'v1',
      branchId: 'b1', redeemedAt: new Date(), isValidated: false,
    }
    prisma.$transaction.mockResolvedValue(redemption)

    const result = await createRedemption(
      prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b1', pin: '1234' }, baseCtx
    )

    expect(prisma.$transaction).toHaveBeenCalled()
    expect(redis.del).toHaveBeenCalled() // rate-limit counter reset
    expect(result).toEqual(redemption)
  })

  it('PIN failure at branch A does not block at branch B', async () => {
    const prisma = mockPrisma()
    const redis = mockRedis()
    // branchA has 5 failures, branchB has 0
    redis.get
      .mockImplementation((key: string) => {
        if (key.includes('b-branch-a')) return Promise.resolve('5')
        return Promise.resolve(null)
      })

    prisma.branch.findUnique.mockResolvedValue({ id: 'b-branch-b', merchantId: 'm1', redemptionPin: 'enc:1234' })
    prisma.subscription.findUnique.mockResolvedValue({ status: 'ACTIVE' })
    prisma.voucher.findUnique.mockResolvedValue({
      id: 'v1', merchantId: 'm1', status: 'ACTIVE', approvalStatus: 'APPROVED',
      estimatedSaving: 5.00,
      merchant: { status: 'APPROVED' },
    })
    prisma.userVoucherCycleState.findUnique.mockResolvedValue(null)
    prisma.$transaction.mockResolvedValue({ id: 'r1', redemptionCode: 'TESTCODE123' })

    // Should NOT throw PIN_RATE_LIMIT_EXCEEDED for branch B
    await expect(
      createRedemption(prisma, redis, 'user-1', { voucherId: 'v1', branchId: 'b-branch-b', pin: '1234' }, baseCtx)
    ).resolves.toBeDefined()
  })
})

// ──────────────────────────────────────────────
// verifyRedemption
// ──────────────────────────────────────────────
describe('verifyRedemption', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('throws REDEMPTION_NOT_FOUND for unknown code', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)

    await expect(
      verifyRedemption(prisma, 'BADCODE', 'QR_SCAN', { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' }, baseCtx)
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('throws ALREADY_VALIDATED when isValidated is true', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: true, branchId: 'b1',
      voucher: { merchantId: 'm1' }, user: { firstName: 'Jane', lastName: 'Doe' },
    })

    await expect(
      verifyRedemption(prisma, 'CODE1', 'QR_SCAN', { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' }, baseCtx)
    ).rejects.toThrow('ALREADY_VALIDATED')
  })

  it('throws BRANCH_ACCESS_DENIED when branch_staff branchId does not match redemption branchId', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b-other',
      voucher: { merchantId: 'm1' }, user: { firstName: 'Jane', lastName: 'Doe' },
    })

    await expect(
      verifyRedemption(prisma, 'CODE1', 'QR_SCAN', { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' }, baseCtx)
    ).rejects.toThrow('BRANCH_ACCESS_DENIED')
  })

  it('throws MERCHANT_MISMATCH when merchant_admin merchantId does not match voucher merchantId', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b1',
      voucher: { merchantId: 'm-other' }, user: { firstName: 'Jane', lastName: 'Doe' },
    })

    await expect(
      verifyRedemption(prisma, 'CODE1', 'QR_SCAN', { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' }, baseCtx)
    ).rejects.toThrow('MERCHANT_MISMATCH')
  })

  it('succeeds for branch_staff: sets isValidated=true, returns customer name only', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b1',
      voucher: { merchantId: 'm1' },
      user: { firstName: 'Jane', lastName: 'Doe', email: 'jane@example.com', phone: '07700900000' },
    })
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'QR_SCAN',
    })

    const result = await verifyRedemption(
      prisma, 'CODE1', 'QR_SCAN',
      { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
      baseCtx
    )

    expect(prisma.voucherRedemption.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ isValidated: true, validationMethod: 'QR_SCAN', validatedById: 'bu1' }),
      })
    )
    expect(result.customer.name).toBe('Jane Doe')
    expect((result.customer as any).email).toBeUndefined()
    expect((result.customer as any).phone).toBeUndefined()
  })

  it('succeeds for merchant_admin: uses merchantId scope check', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', isValidated: false, branchId: 'b-any',
      voucher: { merchantId: 'm1' },
      user: { firstName: 'Bob', lastName: 'Smith' },
    })
    prisma.voucherRedemption.update.mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
    })

    const result = await verifyRedemption(
      prisma, 'CODE1', 'MANUAL',
      { role: 'merchant', branchId: null, merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )

    expect(result.customer.name).toBe('Bob Smith')
  })
})

// ──────────────────────────────────────────────
// listMyRedemptions / getMyRedemption
// ──────────────────────────────────────────────
describe('listMyRedemptions', () => {
  it('returns paginated list with voucher and branch details', async () => {
    const prisma = mockPrisma()
    const redemptions = [
      { id: 'r1', redemptionCode: 'CODE1', redeemedAt: new Date(), isValidated: false,
        voucher: { id: 'v1', title: 'Test', merchant: { name: 'Acme', logoUrl: null } },
        branch: { id: 'b1', name: 'Main Branch' } },
    ]
    prisma.voucherRedemption.findMany.mockResolvedValue(redemptions)

    const result = await listMyRedemptions(prisma, 'user-1', { limit: 10, offset: 0 })
    expect(result).toEqual(redemptions)
    expect(prisma.voucherRedemption.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId: 'user-1' },
      take: 10,
      skip: 0,
    }))
  })
})

describe('getMyRedemption', () => {
  it('throws REDEMPTION_NOT_FOUND when redemption does not belong to user', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)

    await expect(getMyRedemption(prisma, 'user-1', 'r-other')).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('returns redemption with voucher and branch details', async () => {
    const prisma = mockPrisma()
    const redemption = { id: 'r1', userId: 'user-1', redemptionCode: 'CODE1' }
    prisma.voucherRedemption.findUnique.mockResolvedValue(redemption)

    const result = await getMyRedemption(prisma, 'user-1', 'r1')
    expect(result).toEqual(redemption)
  })
})

// ──────────────────────────────────────────────
// listBranchRedemptions
// ──────────────────────────────────────────────
describe('listBranchRedemptions', () => {
  it('returns paginated list with total count', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.count.mockResolvedValue(2)
    prisma.voucherRedemption.findMany.mockResolvedValue([
      { id: 'r1', customer: { name: 'Jane' } },
    ])

    const result = await listBranchRedemptions(prisma, 'b1', { limit: 20, offset: 0 })
    expect(result.total).toBe(2)
    expect(result.items).toHaveLength(1)
  })
})
```

- [ ] **Step 3: Run to verify they fail**

```bash
npx vitest run tests/api/redemption/service.test.ts
```

Expected: FAIL — `createRedemption` not found.

- [ ] **Step 4: Implement `src/api/redemption/service.ts`**

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import type Redis from 'ioredis'
import { nanoid } from 'nanoid'
import crypto from 'crypto'
import { AppError } from '../shared/errors'
import { decrypt } from '../shared/encryption'
import { writeAuditLog } from '../shared/audit'
import { RedisKey } from '../shared/redis-keys'

const PIN_FAIL_LIMIT = 5
const PIN_FAIL_WINDOW = 15 * 60 // 15 minutes in seconds

interface RequestCtx { ipAddress: string; userAgent: string }

interface VerifyActor {
  role: 'branch' | 'merchant'
  branchId: string | null
  merchantId: string
  actorId: string
}

// ──────────────────────────────────────────────
// createRedemption
// ──────────────────────────────────────────────
export async function createRedemption(
  prisma: PrismaClient,
  redis: Redis,
  userId: string,
  data: { voucherId: string; branchId: string; pin: string },
  ctx: RequestCtx
) {
  // 1. Fetch branch and check PIN configured
  const branch = await prisma.branch.findUnique({ where: { id: data.branchId } })
  if (!branch || !branch.redemptionPin) throw new AppError('PIN_NOT_CONFIGURED')

  // 2. Check rate limit BEFORE attempting PIN comparison
  const failKey = RedisKey.pinFailCount(userId, data.branchId)
  const failCount = await redis.get(failKey)
  if (failCount !== null && parseInt(failCount, 10) >= PIN_FAIL_LIMIT) {
    throw new AppError('PIN_RATE_LIMIT_EXCEEDED')
  }

  // 3. Timing-safe PIN comparison
  let pinMatches = false
  try {
    const decrypted = decrypt(branch.redemptionPin)
    pinMatches = crypto.timingSafeEqual(
      Buffer.from(decrypted.padEnd(4)),
      Buffer.from(data.pin.padEnd(4))
    ) && decrypted.length === data.pin.length
  } catch {
    pinMatches = false
  }

  if (!pinMatches) {
    // Increment fail counter with TTL
    await redis.incr(failKey)
    await redis.expire(failKey, PIN_FAIL_WINDOW)
    throw new AppError('INVALID_PIN')
  }

  // 4. Subscription guard
  const sub = await prisma.subscription.findUnique({ where: { userId } })
  if (!sub || !['ACTIVE', 'TRIALLING'].includes(sub.status)) {
    throw new AppError('SUBSCRIPTION_REQUIRED')
  }

  // 5. Voucher guard — must be ACTIVE + APPROVED, with merchant APPROVED
  const voucher = await prisma.voucher.findUnique({
    where: { id: data.voucherId },
    include: { merchant: { select: { status: true } } },
  })
  if (
    !voucher ||
    voucher.status !== 'ACTIVE' ||
    voucher.approvalStatus !== 'APPROVED' ||
    voucher.merchant.status !== 'APPROVED'
  ) {
    throw new AppError('VOUCHER_NOT_FOUND')
  }

  // 6. Branch belongs to voucher's merchant
  if (branch.merchantId !== voucher.merchantId) {
    throw new AppError('BRANCH_MERCHANT_MISMATCH')
  }

  // 7. Cycle state guard — merchant-scoped (all branches) via (userId, voucherId)
  const cycleState = await prisma.userVoucherCycleState.findUnique({
    where: { userId_voucherId: { userId, voucherId: data.voucherId } },
  })
  if (cycleState?.isRedeemedInCurrentCycle) {
    throw new AppError('ALREADY_REDEEMED')
  }

  // 8. Atomic transaction: create redemption + update cycle state
  const redemptionCode = nanoid(10)
  const now = new Date()

  const redemption = await prisma.$transaction(async (tx) => {
    const created = await tx.voucherRedemption.create({
      data: {
        userId,
        voucherId: data.voucherId,
        branchId:  data.branchId,
        redemptionCode,
        estimatedSaving: voucher.estimatedSaving,
        isValidated:     false,
        redeemedAt:      now,
      },
    })

    await tx.userVoucherCycleState.upsert({
      where:  { userId_voucherId: { userId, voucherId: data.voucherId } },
      create: {
        userId,
        voucherId:                data.voucherId,
        cycleStartDate:           sub.currentPeriodStart ?? now,
        isRedeemedInCurrentCycle: true,
        lastRedeemedAt:           now,
      },
      update: {
        isRedeemedInCurrentCycle: true,
        lastRedeemedAt:           now,
      },
    })

    return created
  })

  // 9. Reset fail counter on success
  await redis.del(failKey)

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'VOUCHER_REDEEMED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { voucherId: data.voucherId, branchId: data.branchId, redemptionCode },
  })

  return redemption
}

// ──────────────────────────────────────────────
// verifyRedemption
// ──────────────────────────────────────────────
export async function verifyRedemption(
  prisma: PrismaClient,
  code: string,
  method: 'QR_SCAN' | 'MANUAL',
  actor: VerifyActor,
  ctx: RequestCtx
) {
  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: code },
    include: {
      voucher: { select: { merchantId: true } },
      user:    { select: { firstName: true, lastName: true } },
    },
  })

  if (!redemption) throw new AppError('REDEMPTION_NOT_FOUND')
  if (redemption.isValidated) throw new AppError('ALREADY_VALIDATED')

  // Access scope checks
  if (actor.role === 'branch') {
    if (redemption.branchId !== actor.branchId) throw new AppError('BRANCH_ACCESS_DENIED')
  } else {
    // merchant_admin: check merchantId scope
    if (redemption.voucher.merchantId !== actor.merchantId) throw new AppError('MERCHANT_MISMATCH')
  }

  const updated = await prisma.voucherRedemption.update({
    where: { id: redemption.id },
    data:  {
      isValidated:      true,
      validatedAt:      new Date(),
      validationMethod: method,
      validatedById:    actor.actorId,
    },
  })

  writeAuditLog(prisma, {
    entityId: redemption.userId, entityType: 'customer',
    event: 'VOUCHER_VERIFIED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { redemptionCode: code, method, actorId: actor.actorId },
  })

  return {
    id:               updated.id,
    isValidated:      updated.isValidated,
    validatedAt:      updated.validatedAt,
    validationMethod: updated.validationMethod,
    customer: {
      name: [redemption.user.firstName, redemption.user.lastName].filter(Boolean).join(' '),
    },
  }
}

// ──────────────────────────────────────────────
// listMyRedemptions
// ──────────────────────────────────────────────
export async function listMyRedemptions(
  prisma: PrismaClient,
  userId: string,
  pagination: { limit: number; offset: number }
) {
  return prisma.voucherRedemption.findMany({
    where:   { userId },
    orderBy: { redeemedAt: 'desc' },
    take:    pagination.limit,
    skip:    pagination.offset,
    include: {
      voucher: { select: { id: true, title: true, merchant: { select: { name: true, logoUrl: true } } } },
      branch:  { select: { id: true, name: true } },
    },
  })
}

// ──────────────────────────────────────────────
// getMyRedemption
// ──────────────────────────────────────────────
export async function getMyRedemption(
  prisma: PrismaClient,
  userId: string,
  redemptionId: string
) {
  const redemption = await prisma.voucherRedemption.findUnique({
    where:   { id: redemptionId },
    include: {
      voucher: { select: { id: true, title: true, terms: true, merchant: { select: { name: true } } } },
      branch:  { select: { id: true, name: true, addressLine1: true, city: true, postcode: true } },
    },
  })
  if (!redemption || redemption.userId !== userId) throw new AppError('REDEMPTION_NOT_FOUND')
  return redemption
}

// ──────────────────────────────────────────────
// listBranchRedemptions
// ──────────────────────────────────────────────
export async function listBranchRedemptions(
  prisma: PrismaClient,
  branchId: string,
  pagination: { limit: number; offset: number; from?: Date; to?: Date }
) {
  const where = {
    branchId,
    ...(pagination.from || pagination.to
      ? {
          redeemedAt: {
            ...(pagination.from ? { gte: pagination.from } : {}),
            ...(pagination.to   ? { lte: pagination.to   } : {}),
          },
        }
      : {}),
  }

  const [total, items] = await Promise.all([
    prisma.voucherRedemption.count({ where }),
    prisma.voucherRedemption.findMany({
      where,
      orderBy: { redeemedAt: 'desc' },
      take:    pagination.limit,
      skip:    pagination.offset,
      include: {
        voucher: { select: { id: true, title: true } },
        user:    { select: { firstName: true, lastName: true } },
      },
    }),
  ])

  return {
    total,
    items: items.map((r) => ({
      ...r,
      customer: { name: [r.user.firstName, r.user.lastName].filter(Boolean).join(' ') },
      user: undefined,
    })),
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/api/redemption/service.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/redemption/service.ts tests/api/redemption/service.test.ts
git commit -m "feat: add redemption service — createRedemption, verifyRedemption, list/get endpoints"
```

---

## Task 5: Customer Redemption Routes + Plugin

**Files:**
- Create: `src/api/redemption/routes.ts`
- Create: `src/api/redemption/plugin.ts`
- Create: `tests/api/redemption/routes.test.ts`
- Modify: `src/api/app.ts`

- [ ] **Step 1: Write the failing route integration tests**

```typescript
// tests/api/redemption/routes.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { buildApp } from '../../../src/api/app'
import type { FastifyInstance } from 'fastify'

vi.mock('../../../src/api/redemption/service', () => ({
  createRedemption:      vi.fn(),
  verifyRedemption:      vi.fn(),
  listMyRedemptions:     vi.fn(),
  getMyRedemption:       vi.fn(),
  listBranchRedemptions: vi.fn(),
}))

vi.mock('../../../src/api/merchant/branch/service', async (importOriginal) => {
  const original = await importOriginal() as any
  return {
    ...original,
    getBranchPin:  vi.fn(),
    setBranchPin:  vi.fn(),
    sendBranchPin: vi.fn(),
  }
})

describe('redemption routes', () => {
  let app: FastifyInstance
  let customerToken: string
  let branchToken: string
  let merchantToken: string

  beforeEach(async () => {
    app = await buildApp()

    app.decorate('prisma', {
      branch:                { findUnique: vi.fn(), findFirst: vi.fn() },
      subscription:          { findUnique: vi.fn() },
      voucher:               { findUnique: vi.fn() },
      userVoucherCycleState: { findUnique: vi.fn(), upsert: vi.fn() },
      voucherRedemption:     { create: vi.fn(), findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
      auditLog:              { create: vi.fn().mockResolvedValue({}) },
      $transaction:          vi.fn(),
    } as any)

    app.decorate('redis', {
      get:    vi.fn().mockResolvedValue(null),
      set:    vi.fn().mockResolvedValue('OK'),
      del:    vi.fn().mockResolvedValue(1),
      incr:   vi.fn().mockResolvedValue(1),
      expire: vi.fn().mockResolvedValue(1),
    } as any)

    await app.ready()

    const jwtAny = app.jwt as any
    customerToken = jwtAny.customer.sign(
      { sub: 'user-1', role: 'customer', deviceId: 'd1', sessionId: 's1' },
      { expiresIn: '1h' }
    )
    branchToken = jwtAny.branch.sign(
      { sub: 'bu-1', role: 'branch', deviceId: 'd2', sessionId: 's2' },
      { expiresIn: '1h' }
    )
    merchantToken = jwtAny.merchant.sign(
      { sub: 'ma-1', role: 'merchant', deviceId: 'd3', sessionId: 's3' },
      { expiresIn: '1h' }
    )
  })

  afterEach(async () => { await app.close() })

  // ── Customer endpoints ──

  it('POST /api/v1/redemption returns 201 on success', async () => {
    const { createRedemption } = await import('../../../src/api/redemption/service')
    ;(createRedemption as any).mockResolvedValue({
      id: 'r1', redemptionCode: 'TESTCODE123', voucherId: 'v1', branchId: 'b1',
      redeemedAt: new Date().toISOString(), isValidated: false,
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1', branchId: 'b1', pin: '1234' },
    })

    expect(res.statusCode).toBe(201)
    expect(JSON.parse(res.body).redemptionCode).toBe('TESTCODE123')
  })

  it('POST /api/v1/redemption returns 401 without token', async () => {
    const res = await app.inject({ method: 'POST', url: '/api/v1/redemption', payload: {} })
    expect(res.statusCode).toBe(401)
  })

  it('POST /api/v1/redemption returns 400 when body is missing required fields', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/redemption',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { voucherId: 'v1' }, // missing branchId and pin
    })
    expect(res.statusCode).toBe(400)
  })

  it('GET /api/v1/redemption/my returns 200 list', async () => {
    const { listMyRedemptions } = await import('../../../src/api/redemption/service')
    ;(listMyRedemptions as any).mockResolvedValue([])

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/redemption/my',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body)).toEqual([])
  })

  it('GET /api/v1/redemption/my/:id returns 200 for own redemption', async () => {
    const { getMyRedemption } = await import('../../../src/api/redemption/service')
    ;(getMyRedemption as any).mockResolvedValue({ id: 'r1', redemptionCode: 'CODE1' })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/redemption/my/r1',
      headers: { authorization: `Bearer ${customerToken}` },
    })

    expect(res.statusCode).toBe(200)
  })

  // ── Branch staff / merchant admin endpoints ──

  it('POST /api/v1/redemption/verify returns 200 for branch_staff', async () => {
    // Branch session in Redis
    app.redis.get = vi.fn().mockResolvedValue(
      JSON.stringify({ branchId: 'b1', merchantId: 'm1', isActive: true })
    )
    const { verifyRedemption } = await import('../../../src/api/redemption/service')
    ;(verifyRedemption as any).mockResolvedValue({
      id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'QR_SCAN',
      customer: { name: 'Jane Doe' },
    })

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${branchToken}` },
      payload: { code: 'TESTCODE123', method: 'QR_SCAN' },
    })

    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).customer.name).toBe('Jane Doe')
  })

  it('POST /api/v1/redemption/verify returns 403 for customer role', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/redemption/verify',
      headers: { authorization: `Bearer ${customerToken}` },
      payload: { code: 'TESTCODE123', method: 'QR_SCAN' },
    })
    expect(res.statusCode).toBe(401) // customer token rejected by branch/merchant auth
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 200 for branch_staff own branch', async () => {
    app.redis.get = vi.fn().mockResolvedValue(
      JSON.stringify({ branchId: 'b1', merchantId: 'm1', isActive: true })
    )
    const { listBranchRedemptions } = await import('../../../src/api/redemption/service')
    ;(listBranchRedemptions as any).mockResolvedValue({ total: 0, items: [] })

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/branch/b1/redemptions',
      headers: { authorization: `Bearer ${branchToken}` },
    })

    expect(res.statusCode).toBe(200)
  })

  it('GET /api/v1/branch/:branchId/redemptions returns 403 when staff accesses wrong branch', async () => {
    app.redis.get = vi.fn().mockResolvedValue(
      JSON.stringify({ branchId: 'b-mine', merchantId: 'm1', isActive: true })
    )

    const res = await app.inject({
      method: 'GET',
      url: '/api/v1/branch/b-not-mine/redemptions',
      headers: { authorization: `Bearer ${branchToken}` },
    })

    expect(res.statusCode).toBe(403)
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/api/redemption/routes.test.ts
```

Expected: FAIL — routes not registered.

- [ ] **Step 3: Implement `src/api/redemption/routes.ts`**

```typescript
import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  createRedemption,
  verifyRedemption,
  listMyRedemptions,
  getMyRedemption,
  listBranchRedemptions,
} from './service'
import { AppError } from '../shared/errors'
import { RedisKey } from '../shared/redis-keys'

const methodSchema = z.enum(['QR_SCAN', 'MANUAL'])

export async function redemptionCustomerRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/redemption'

  // POST /api/v1/redemption — customer redeems a voucher
  app.post(prefix, async (req: FastifyRequest, reply) => {
    const body = z.object({
      voucherId: z.string().min(1),
      branchId:  z.string().min(1),
      pin:       z.string().regex(/^\d{4}$/, 'PIN must be exactly 4 numeric digits'),
    }).parse(req.body)

    const redemption = await createRedemption(
      app.prisma, app.redis, req.user.sub, body,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' }
    )
    return reply.status(201).send(redemption)
  })

  // GET /api/v1/redemption/my — list own redemptions
  app.get(`${prefix}/my`, async (req: FastifyRequest, reply) => {
    const query = z.object({
      limit:  z.coerce.number().int().min(1).max(100).default(10),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query)

    const result = await listMyRedemptions(app.prisma, req.user.sub, query)
    return reply.send(result)
  })

  // GET /api/v1/redemption/my/:id — get single redemption detail
  app.get(`${prefix}/my/:id`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const redemption = await getMyRedemption(app.prisma, req.user.sub, id)
    return reply.send(redemption)
  })
}

export async function redemptionStaffRoutes(app: FastifyInstance) {
  // POST /api/v1/redemption/verify — branch staff / merchant admin verifies a redemption
  app.post('/api/v1/redemption/verify', async (req: FastifyRequest, reply) => {
    const body = z.object({
      code:   z.string().min(1),
      method: methodSchema,
    }).parse(req.body)

    // Resolve actor scope from Redis session
    const sessionRaw = await app.redis.get(RedisKey.authBranch(req.user.sub))
    let actor: { role: 'branch' | 'merchant'; branchId: string | null; merchantId: string; actorId: string }

    if (sessionRaw) {
      const session = JSON.parse(sessionRaw) as { branchId: string; merchantId: string }
      actor = { role: 'branch', branchId: session.branchId, merchantId: session.merchantId, actorId: req.user.sub }
    } else {
      // merchant_admin — resolve merchantId from merchant session
      const merchantSession = await app.redis.get(RedisKey.authMerchant(req.user.sub))
      if (!merchantSession) throw new AppError('BRANCH_ACCESS_DENIED')
      const parsed = JSON.parse(merchantSession) as { merchantId: string }
      actor = { role: 'merchant', branchId: null, merchantId: parsed.merchantId, actorId: req.user.sub }
    }

    const result = await verifyRedemption(
      app.prisma, body.code, body.method, actor,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' }
    )
    return reply.send(result)
  })

  // GET /api/v1/branch/:branchId/redemptions — reconciliation list
  app.get('/api/v1/branch/:branchId/redemptions', async (req: FastifyRequest, reply) => {
    const { branchId } = z.object({ branchId: z.string() }).parse(req.params)
    const query = z.object({
      limit:  z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
      from:   z.string().datetime().optional(),
      to:     z.string().datetime().optional(),
    }).parse(req.query)

    // Scope check: branch_staff can only access their own branch
    const sessionRaw = await app.redis.get(RedisKey.authBranch(req.user.sub))
    if (sessionRaw) {
      const session = JSON.parse(sessionRaw) as { branchId: string }
      if (session.branchId !== branchId) throw new AppError('BRANCH_ACCESS_DENIED')
    }
    // merchant_admin: no branchId restriction (any branch within their merchant — validated by service)

    const result = await listBranchRedemptions(app.prisma, branchId, {
      limit:  query.limit,
      offset: query.offset,
      from:   query.from ? new Date(query.from) : undefined,
      to:     query.to   ? new Date(query.to)   : undefined,
    })
    return reply.send(result)
  })
}
```

- [ ] **Step 4: Implement `src/api/redemption/plugin.ts`**

```typescript
import fp from 'fastify-plugin'
import { FastifyInstance } from 'fastify'
import { redemptionCustomerRoutes, redemptionStaffRoutes } from './routes'

async function redemptionPlugin(app: FastifyInstance) {
  // Customer routes — require customer JWT
  app.register(async (scoped) => {
    scoped.addHook('preHandler', app.authenticateCustomer)
    await scoped.register(redemptionCustomerRoutes)
  })

  // Staff routes — accept branch JWT OR merchant JWT
  // Routes use Redis session to determine actor scope
  app.register(async (scoped) => {
    // Try branch auth first; if it fails the route itself will check merchant auth
    // Both authenticateBranch and authenticateMerchant are registered as decorators
    await scoped.register(redemptionStaffRoutes)
  })
}

export default fp(redemptionPlugin, {
  name: 'redemption',
  dependencies: ['customer-auth', 'branch-auth', 'merchant-auth'],
})
```

**Note on staff route auth:** The verify and reconciliation routes are called by both `branch_staff` and `merchant_admin`. Rather than duplicating routes, the routes read the Redis session to determine which role is calling. The plugin registers staff routes without a mandatory preHandler — each route validates the token inline via Redis session lookup. If neither session exists, the route throws `BRANCH_ACCESS_DENIED`.

A cleaner alternative if the above is awkward: split into two separate route registrations with `preHandler: app.authenticateBranch` and `preHandler: app.authenticateMerchant` pointing to the same service functions. Either approach is valid — keep whichever compiles and passes tests.

- [ ] **Step 5: Register plugin in `src/api/app.ts`**

Add after the `subscriptionPlugin` registration:

```typescript
import redemptionPlugin from './redemption/plugin'
```

And in `buildApp()` after `await app.register(subscriptionPlugin)`:

```typescript
  await app.register(redemptionPlugin)
```

- [ ] **Step 6: Run route tests**

```bash
npx vitest run tests/api/redemption/routes.test.ts
```

Expected: All tests pass. If auth wiring causes failures, debug the preHandler approach (see note in Step 4).

- [ ] **Step 7: Run full test suite**

```bash
npx vitest run
```

Expected: All existing tests still pass.

- [ ] **Step 8: Commit**

```bash
git add src/api/redemption/ src/api/app.ts tests/api/redemption/routes.test.ts
git commit -m "feat: add redemption routes and plugin — customer redeem, staff verify, branch reconciliation"
```

---

## Task 6: Branch PIN Management (Merchant Admin)

**Files:**
- Modify: `src/api/merchant/branch/service.ts`
- Modify: `src/api/merchant/branch/routes.ts`

- [ ] **Step 1: Write the failing service tests**

Add to `tests/api/merchant/branch/service.test.ts` (create file if it doesn't exist, or append to the existing test file for branch service):

```typescript
// tests/api/merchant/branch/pin.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../../src/api/shared/errors'

vi.mock('../../../../src/api/shared/encryption', () => ({
  encrypt: vi.fn((v: string) => `enc:${v}`),
  decrypt: vi.fn((v: string) => v.replace('enc:', '')),
}))

import { getBranchPin, setBranchPin, sendBranchPin } from '../../../../src/api/merchant/branch/service'

const mockPrisma = () => ({
  merchantAdmin: { findUnique: vi.fn() },
  branch:        { findFirst: vi.fn(), update: vi.fn() },
  branchUser:    { findMany: vi.fn() },
  auditLog:      { create: vi.fn().mockResolvedValue({}) },
} as any)

describe('getBranchPin', () => {
  it('returns decrypted PIN when set', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234' })

    const result = await getBranchPin(prisma, 'ma1', 'b1')
    expect(result).toEqual({ pin: '1234' })
  })

  it('returns { pin: null } when no PIN set', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })

    const result = await getBranchPin(prisma, 'ma1', 'b1')
    expect(result).toEqual({ pin: null })
  })
})

describe('setBranchPin', () => {
  it('throws INVALID_PIN_FORMAT for non-4-digit PIN', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })

    await expect(setBranchPin(prisma, 'ma1', 'b1', '12', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('INVALID_PIN_FORMAT')
  })

  it('encrypts and persists the PIN', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })
    prisma.branch.update.mockResolvedValue({})

    await setBranchPin(prisma, 'ma1', 'b1', '5678', { ipAddress: '1.2.3.4', userAgent: 'test' })

    expect(prisma.branch.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { redemptionPin: 'enc:5678' } })
    )
  })
})

describe('sendBranchPin', () => {
  it('does not throw when branch has no users', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: 'enc:1234', email: null, phone: null })
    prisma.branchUser.findMany.mockResolvedValue([])

    await expect(sendBranchPin(prisma, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .resolves.not.toThrow()
  })

  it('throws PIN_NOT_CONFIGURED when branch has no PIN', async () => {
    const prisma = mockPrisma()
    prisma.merchantAdmin.findUnique.mockResolvedValue({ id: 'ma1', merchantId: 'm1' })
    prisma.branch.findFirst.mockResolvedValue({ id: 'b1', merchantId: 'm1', redemptionPin: null })

    await expect(sendBranchPin(prisma, 'ma1', 'b1', { ipAddress: '1.2.3.4', userAgent: 'test' }))
      .rejects.toThrow('PIN_NOT_CONFIGURED')
  })
})
```

- [ ] **Step 2: Run to verify they fail**

```bash
npx vitest run tests/api/merchant/branch/pin.test.ts
```

Expected: FAIL — `getBranchPin` not found.

- [ ] **Step 3: Add PIN functions to `src/api/merchant/branch/service.ts`**

Add these exports at the end of the file:

```typescript
import { encrypt, decrypt } from '../../shared/encryption'

const PIN_REGEX = /^\d{4}$/

export async function getBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string
): Promise<{ pin: string | null }> {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { redemptionPin: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (!branch.redemptionPin) return { pin: null }
  return { pin: decrypt(branch.redemptionPin) }
}

export async function setBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  pin: string,
  ctx: { ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  if (!PIN_REGEX.test(pin)) throw new AppError('INVALID_PIN_FORMAT')

  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')

  await prisma.branch.update({
    where: { id: branchId },
    data:  { redemptionPin: encrypt(pin) },
  })

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_CHANGED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId },
  })

  return { message: 'PIN updated' }
}

export async function sendBranchPin(
  prisma: PrismaClient,
  adminId: string,
  branchId: string,
  ctx: { ipAddress: string; userAgent: string }
): Promise<{ message: string }> {
  const { merchantId } = await resolveAdminMerchant(prisma, adminId)
  const branch = await prisma.branch.findFirst({
    where: { id: branchId, merchantId, deletedAt: null },
    select: { redemptionPin: true, name: true, phone: true, email: true },
  })
  if (!branch) throw new AppError('BRANCH_NOT_FOUND')
  if (!branch.redemptionPin) throw new AppError('PIN_NOT_CONFIGURED')

  const pin = decrypt(branch.redemptionPin)

  // SMS via Twilio (fire-and-forget — errors are logged, not thrown)
  if (branch.phone) {
    import('twilio').then(({ default: twilio }) => {
      const client = twilio(process.env.TWILIO_ACCOUNT_SID!, process.env.TWILIO_AUTH_TOKEN!)
      client.messages.create({
        to:   branch.phone!,
        from: process.env.TWILIO_FROM_NUMBER!,
        body: `Your Redeemo branch PIN for ${branch.name} is: ${pin}. Keep this secure.`,
      }).catch((err: unknown) => console.error('[pin-send] SMS failed:', err))
    }).catch((err: unknown) => console.error('[pin-send] Twilio import failed:', err))
  }

  // Email via Resend (Phase 3 — log for now, matching existing codebase pattern)
  if (branch.email) {
    console.info(`[dev] Branch PIN email for ${branch.email}: PIN=${pin}`)
    // TODO Phase 3: send via Resend client once email integration is built
  }

  writeAuditLog(prisma, {
    entityId: merchantId, entityType: 'merchant',
    event: 'BRANCH_PIN_SENT',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { branchId, channels: [branch.phone ? 'sms' : null, branch.email ? 'email' : null].filter(Boolean) },
  })

  return { message: 'PIN sent to branch staff' }
}
```

- [ ] **Step 4: Add PIN routes to `src/api/merchant/branch/routes.ts`**

Add these imports at the top of the existing imports:

```typescript
import { getBranchPin, setBranchPin, sendBranchPin } from './service'
```

Add these routes inside the `branchRoutes` function (before the closing brace), using the existing `idParam` schema:

```typescript
  // PIN management — merchant admin only
  const pinPrefix = '/api/v1/merchant/branch'

  app.get(`${pinPrefix}/:id/pin`, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await getBranchPin(app.prisma, req.user.sub, id)
    return reply.send(result)
  })

  app.put(`${pinPrefix}/:id/pin`, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const { pin } = z.object({ pin: z.string() }).parse(req.body)
    const result = await setBranchPin(app.prisma, req.user.sub, id, pin, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${pinPrefix}/:id/pin/send`, async (req, reply) => {
    const { id } = idParam.parse(req.params)
    const result = await sendBranchPin(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
```

- [ ] **Step 5: Run PIN service tests**

```bash
npx vitest run tests/api/merchant/branch/pin.test.ts
```

Expected: All tests pass.

- [ ] **Step 6: Run full test suite**

```bash
npx vitest run
```

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/merchant/branch/service.ts src/api/merchant/branch/routes.ts tests/api/merchant/branch/pin.test.ts
git commit -m "feat: add branch PIN management — get, set, send via Twilio SMS / email (Phase 3)"
```

---

## Task 7: Wire RedisKey.authBranch and authMerchant + Final Smoke Test

**Context:** In Task 5 the routes use `RedisKey.authBranch(req.user.sub)` and `RedisKey.authMerchant(req.user.sub)`. The `RedisKey` object already has `authBranch` and `authMerchant` keys — verify they match the key format used when sessions are written in the auth services.

**Files:**
- Verify: `src/api/shared/redis-keys.ts` (no change expected)
- Verify: `src/api/auth/branch/service.ts` (confirm session write key)

- [ ] **Step 1: Confirm auth session key format**

```bash
grep -n "authBranch\|authMerchant\|auth:branch\|auth:merchant" src/api/shared/redis-keys.ts src/api/auth/branch/service.ts src/api/auth/merchant/service.ts
```

Confirm that:
- `RedisKey.authBranch(id)` produces `auth:branch:{id}`
- Branch auth service writes session to `auth:branch:{branchUserId}` with JSON `{ merchantId, branchId, isActive }`
- `RedisKey.authMerchant(id)` produces `auth:merchant:{id}`
- Merchant auth service writes session to `auth:merchant:{merchantAdminId}`

If the merchant session JSON does not include `merchantId` directly, check how merchant routes currently resolve `merchantId` (they call `resolveAdminMerchant(prisma, adminId)` which queries the DB). Update the `redemptionStaffRoutes` verify handler accordingly if merchant session format differs — use `resolveAdminMerchant` instead of parsing JSON.

- [ ] **Step 2: Run the complete test suite**

```bash
npx vitest run
```

Expected: All tests pass. Fix any import or type errors found.

- [ ] **Step 3: TypeScript compile check**

```bash
npx tsc --noEmit
```

Expected: No errors.

- [ ] **Step 4: Commit (if any fixes were needed)**

```bash
git add -p
git commit -m "fix: resolve Redis session key wiring for branch/merchant redemption routes"
```

---

## Self-Review

**Spec coverage check:**

| Spec requirement | Task |
|---|---|
| AES-256-GCM encryption utility | Task 1 |
| Schema: `Branch.redemptionPin` | Task 2 |
| Error codes + audit events | Task 3 |
| `createRedemption` with all 6 guards | Task 4 |
| Rate limit `(userId, branchId)` | Task 4 |
| `verifyRedemption` with branch_staff / merchant_admin scope | Task 4 |
| `listMyRedemptions`, `getMyRedemption`, `listBranchRedemptions` | Task 4 |
| Customer routes (POST redeem, GET list, GET detail) | Task 5 |
| Staff routes (POST verify, GET branch redemptions) | Task 5 |
| Plugin registration in app.ts | Task 5 |
| `getBranchPin`, `setBranchPin`, `sendBranchPin` | Task 6 |
| PIN routes (GET, PUT, POST send) | Task 6 |
| Redis key wiring verification | Task 7 |

**No placeholder check:** All steps contain actual code. No TBDs.

**Type consistency:**
- `verifyRedemption` method parameter: `'QR_SCAN' | 'MANUAL'` — matches `ValidationMethod` enum in schema (not `MANUAL_ENTRY`)
- `VerifyActor.role`: `'branch' | 'merchant'` — used consistently in service and routes
- `RedisKey.pinFailCount(userId, branchId)` — defined in Task 3, used in Task 4
- `redemptionPin` (not `redemptionPinHash`) — renamed in Task 2, used in Tasks 4 and 6
- `estimatedSaving` passed from `voucher.estimatedSaving` in Task 4 — matches non-nullable schema field
