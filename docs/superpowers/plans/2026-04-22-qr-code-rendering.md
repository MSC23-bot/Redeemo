# QR Code Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace QR placeholders with real, scannable QR codes in the customer app, and harden the Show to Staff flow against screenshot/cross-branch misuse.

**Architecture:** Backend changes shorten redemption codes to 6 characters (unambiguous alphabet), normalise verify input, tighten branch-level scope checks, add screenshot logging and a self-lookup-by-code endpoint. Frontend adds shared QR component, polling hook, brightness boost, screenshot guard, and auto-hide timer — composed into a rewritten `ShowToStaff` screen and a cache-refreshed `RedemptionDetailsCard`.

**Tech Stack:**
- Backend: Fastify, Prisma 7, Vitest, ioredis
- Frontend: Expo SDK 54, React Native 0.81, `react-native-qrcode-svg`, `expo-brightness`, `expo-screen-capture`, React Query, Reanimated v4, Jest-Expo

**Spec:** [docs/superpowers/specs/2026-04-22-qr-code-rendering-design.md](../specs/2026-04-22-qr-code-rendering-design.md)

**Working directory:** `/Users/shebinchaliyath/Developer/Redeemo/.worktrees/customer-app/` (git worktree on `feature/customer-app`). All paths in this plan are relative to that root unless noted.

**Test commands:**
- Backend (vitest) — run via Claude/Bash: `npx vitest run tests/api/redemption` (scope to redemption tests)
- Frontend (jest-expo) — safe to run via Claude Bash: `cd apps/customer-app && npm test`. Runs cleanly in 8–10s with Babel cache warm at `/tmp/jest-redeemo-customer-app`. First cold run ~28 min to build the cache.

---

## File structure

### Backend — new / modified

- Modify `src/api/redemption/service.ts` — shorten code generator, normalise verify input, branch-level scope check, subscription-expiry comment
- Modify `src/api/redemption/routes.ts` — verify accepts `branchId`; new screenshot-flag and self-lookup routes; rate-limit middleware
- Create `src/api/redemption/screenshot-flag.ts` — service for screenshot flag (keep route handler lean)
- Modify `src/api/shared/redis-keys.ts` — new key for staff verify rate limit
- Modify `prisma/schema.prisma` — new `RedemptionScreenshotEvent` model
- Create `prisma/migrations/YYYYMMDDHHMMSS_add_redemption_screenshot_event/migration.sql`
- Modify `tests/api/redemption/service.test.ts` — new tests for generator, normalisation, branch scope
- Modify `tests/api/redemption/routes.test.ts` — new tests for screenshot-flag, self-lookup, verify rate limit

### Frontend — new / modified

- Modify `apps/customer-app/package.json` — add `react-native-qrcode-svg`, `expo-brightness`, `expo-screen-capture`
- Modify `apps/customer-app/src/lib/api/redemption.ts` — add `postScreenshotFlag` and `getMyRedemptionByCode`
- Create `apps/customer-app/src/features/voucher/utils/formatCode.ts` — code grouping + a11y label builder
- Create `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx` — shared branded QR
- Create `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts`
- Create `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts`
- Create `apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts`
- Create `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts`
- Rewrite `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`
- Rewrite `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
- Tests mirror each new file under `apps/customer-app/tests/features/voucher/`

---

## Task 1: Prisma model + migration for `RedemptionScreenshotEvent`

**Files:**
- Modify: `prisma/schema.prisma` (append after `VoucherRedemption`)
- Create: `prisma/migrations/<timestamp>_add_redemption_screenshot_event/migration.sql`

- [ ] **Step 1: Add the Prisma model**

Append to `prisma/schema.prisma` after the `VoucherRedemption` model:

```prisma
model RedemptionScreenshotEvent {
  id           String   @id @default(uuid())
  userId       String
  redemptionId String
  platform     String   // "ios" | "android"
  occurredAt   DateTime @default(now())

  user       User              @relation(fields: [userId],       references: [id])
  redemption VoucherRedemption @relation(fields: [redemptionId], references: [id])

  @@index([redemptionId, occurredAt])
  @@index([userId])
}
```

Then add the back-relations to `User` and `VoucherRedemption` — find each model and add a line like:
- On `User`: `redemptionScreenshotEvents RedemptionScreenshotEvent[]`
- On `VoucherRedemption`: `screenshotEvents RedemptionScreenshotEvent[]`

- [ ] **Step 2: Generate the migration**

Run: `npx prisma migrate dev --name add_redemption_screenshot_event --create-only`
Expected: creates a new migration folder with `migration.sql`. Contents should roughly match:

```sql
-- CreateTable
CREATE TABLE "RedemptionScreenshotEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "redemptionId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RedemptionScreenshotEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RedemptionScreenshotEvent_redemptionId_occurredAt_idx" ON "RedemptionScreenshotEvent"("redemptionId", "occurredAt");

-- CreateIndex
CREATE INDEX "RedemptionScreenshotEvent_userId_idx" ON "RedemptionScreenshotEvent"("userId");

-- AddForeignKey
ALTER TABLE "RedemptionScreenshotEvent" ADD CONSTRAINT "RedemptionScreenshotEvent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RedemptionScreenshotEvent" ADD CONSTRAINT "RedemptionScreenshotEvent_redemptionId_fkey" FOREIGN KEY ("redemptionId") REFERENCES "VoucherRedemption"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
```

- [ ] **Step 3: Apply the migration**

Run: `npx prisma migrate dev`
Expected: output ends with "Your database is now in sync with your schema." and generates the Prisma client.

- [ ] **Step 4: Verify client types**

Run: `npx tsc --noEmit -p tsconfig.json`
Expected: no errors. `PrismaClient` should now expose `redemptionScreenshotEvent`.

- [ ] **Step 5: Commit**

```bash
git add prisma/schema.prisma prisma/migrations/
git commit -m "feat(db): add RedemptionScreenshotEvent table"
```

---

## Task 2: Update code generator — 6 chars, unambiguous alphabet, collision retry

**Files:**
- Modify: `src/api/redemption/service.ts:10-19`
- Test: `tests/api/redemption/service.test.ts`

- [ ] **Step 1: Write failing tests**

Add a new `describe` block to `tests/api/redemption/service.test.ts` (near the existing generator-related imports):

```typescript
import { generateRedemptionCode } from '../../../src/api/redemption/service'

describe('generateRedemptionCode', () => {
  it('produces a 6-character string by default', () => {
    const code = generateRedemptionCode()
    expect(code).toHaveLength(6)
  })

  it('only uses uppercase A-Z and digits, excluding 0 O 1 I L', () => {
    const codes = Array.from({ length: 200 }, () => generateRedemptionCode())
    const joined = codes.join('')
    expect(joined).toMatch(/^[A-HJ-KM-NP-Z2-9]+$/)
    expect(joined).not.toMatch(/[0O1IL]/)
  })

  it('generates different codes on repeated calls', () => {
    const a = generateRedemptionCode()
    const b = generateRedemptionCode()
    const c = generateRedemptionCode()
    expect(new Set([a, b, c]).size).toBe(3)
  })
})
```

You'll also need to export `generateRedemptionCode` from the service. Keep it named.

- [ ] **Step 2: Run the test**

Run: `npx vitest run tests/api/redemption/service.test.ts -t "generateRedemptionCode"`
Expected: FAIL. Either the import fails (not exported), or the length is 10, or output contains ambiguous chars.

- [ ] **Step 3: Update the generator**

Replace the top of `src/api/redemption/service.ts` (lines 10–19) with:

```typescript
// Uppercase letters + digits, MINUS ambiguous characters (0 / O, 1 / I / L).
// 31 chars × 6 positions = ~887M codes. Retries on DB unique-constraint collision.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'

export function generateRedemptionCode(length = 6): string {
  const bytes = crypto.randomBytes(length)
  let code = ''
  for (let i = 0; i < length; i++) {
    code += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length]
  }
  return code
}
```

- [ ] **Step 4: Run tests again**

Run: `npx vitest run tests/api/redemption/service.test.ts -t "generateRedemptionCode"`
Expected: all three tests PASS.

Run the full redemption suite to make sure existing tests still pass: `npx vitest run tests/api/redemption`
Expected: all pass.

- [ ] **Step 5: Add collision-retry in `createRedemption`**

The current `createRedemption` calls the generator once and writes. On the astronomically-rare `P2002` unique violation, the transaction will throw. Wrap the `tx.voucherRedemption.create` call in a retry loop (max 5 attempts). Replace the Step 8 block in `createRedemption` (around `src/api/redemption/service.ts:115-148`) with:

```typescript
  // 8. Atomic transaction with collision retry
  const MAX_CODE_ATTEMPTS = 5
  let redemption: Awaited<ReturnType<typeof prisma.voucherRedemption.create>> | null = null

  for (let attempt = 0; attempt < MAX_CODE_ATTEMPTS; attempt++) {
    const redemptionCode = generateRedemptionCode()
    try {
      redemption = await prisma.$transaction(async (tx) => {
        const created = await tx.voucherRedemption.create({
          data: {
            userId,
            voucherId:       data.voucherId,
            branchId:        data.branchId,
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
            cycleStartDate:           cycleStart,
            isRedeemedInCurrentCycle: true,
            lastRedeemedAt:           now,
          },
          update: {
            cycleStartDate:           cycleStart,
            isRedeemedInCurrentCycle: true,
            lastRedeemedAt:           now,
          },
        })

        return created
      })
      break
    } catch (err) {
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002' &&
        Array.isArray((err.meta as { target?: string[] } | undefined)?.target) &&
        (err.meta as { target: string[] }).target.includes('redemptionCode')
      ) {
        continue
      }
      throw err
    }
  }

  if (!redemption) throw new AppError('REDEMPTION_CODE_COLLISION')

  // 9. Reset fail counter on success
  await redis.del(failKey)

  writeAuditLog(prisma, {
    entityId: userId, entityType: 'customer',
    event: 'VOUCHER_REDEEMED',
    ipAddress: ctx.ipAddress, userAgent: ctx.userAgent,
    metadata: { voucherId: data.voucherId, branchId: data.branchId, redemptionCode: redemption.redemptionCode },
  })

  return redemption
```

Add the new error code. Open `src/api/shared/errors.ts` and add `REDEMPTION_CODE_COLLISION` to the error map (mirroring the style of existing codes, map to a 500-series internal error).

- [ ] **Step 6: Run full backend suite**

Run: `npx vitest run`
Expected: all pass. Existing `createRedemption` tests may need their transaction mock updated if they asserted on the exact call shape — update them minimally.

- [ ] **Step 7: Commit**

```bash
git add src/api/redemption/service.ts src/api/shared/errors.ts tests/api/redemption/service.test.ts
git commit -m "feat(redemption): 6-char unambiguous codes with collision retry"
```

---

## Task 3: Verify endpoint — normalise input (uppercase, strip whitespace/hyphens)

**Files:**
- Modify: `src/api/redemption/service.ts` (`verifyRedemption`)
- Test: `tests/api/redemption/service.test.ts`

- [ ] **Step 1: Write failing tests**

Add to the `describe('verifyRedemption', ...)` block in `tests/api/redemption/service.test.ts`:

```typescript
it('normalises input: uppercases, strips whitespace and hyphens before lookup', async () => {
  const prisma = mockPrisma()
  prisma.voucherRedemption.findUnique.mockResolvedValue({
    id: 'r1', isValidated: false, branchId: 'b1',
    voucher: { merchantId: 'm1' }, user: { firstName: 'Jane', lastName: 'Doe' },
  })
  prisma.voucherRedemption.update.mockResolvedValue({
    id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
  })

  await verifyRedemption(
    prisma,
    '  k3f-9P7  ',
    'MANUAL',
    { role: 'branch', branchId: 'b1', merchantId: 'm1', actorId: 'bu1' },
    baseCtx
  )

  expect(prisma.voucherRedemption.findUnique).toHaveBeenCalledWith(
    expect.objectContaining({ where: { redemptionCode: 'K3F9P7' } })
  )
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/api/redemption/service.test.ts -t "normalises input"`
Expected: FAIL — current implementation passes the raw string straight through.

- [ ] **Step 3: Implement normalisation**

In `src/api/redemption/service.ts`, inside `verifyRedemption` (around line 163), add a normalisation step at the very top of the function before the `findUnique` call:

```typescript
export async function verifyRedemption(
  prisma: PrismaClient,
  code: string,
  method: 'QR_SCAN' | 'MANUAL',
  actor: VerifyActor,
  ctx: RequestCtx
) {
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
    include: {
      voucher: { select: { merchantId: true } },
      user:    { select: { firstName: true, lastName: true } },
    },
  })

  // ... rest unchanged, but replace `code` with `normalised` in the audit log metadata
```

Also update the audit log `metadata: { redemptionCode: normalised, ... }`.

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/api/redemption/service.test.ts`
Expected: all verify tests pass, including the new one.

- [ ] **Step 5: Commit**

```bash
git add src/api/redemption/service.ts tests/api/redemption/service.test.ts
git commit -m "feat(redemption): normalise verify input (case/whitespace/hyphens)"
```

---

## Task 4: Verify endpoint — branch-level scope check + subscription-expiry comment

This is a **behaviour change** for merchant admins: today a merchant admin can validate any code belonging to their merchant regardless of which branch it was issued at. Per spec §8 #2, that's now rejected — merchant admins must pick a branch before verifying, and the code must belong to that exact branch. Error copy for "not found" vs "wrong branch" must be identical.

**Files:**
- Modify: `src/api/redemption/service.ts` (`VerifyActor` interface + `verifyRedemption`)
- Modify: `src/api/redemption/routes.ts` (verify handler — merchant branch must come from request body)
- Test: `tests/api/redemption/service.test.ts`, `tests/api/redemption/routes.test.ts`

- [ ] **Step 1: Write failing service-layer tests**

Update the existing merchant_admin success test and add a new failure test in `tests/api/redemption/service.test.ts`:

```typescript
it('merchant_admin: succeeds only when request branchId matches redemption branchId', async () => {
  const prisma = mockPrisma()
  prisma.voucherRedemption.findUnique.mockResolvedValue({
    id: 'r1', isValidated: false, branchId: 'b1',
    voucher: { merchantId: 'm1' },
    user: { firstName: 'Bob', lastName: 'Smith' },
  })
  prisma.voucherRedemption.update.mockResolvedValue({
    id: 'r1', isValidated: true, validatedAt: new Date(), validationMethod: 'MANUAL',
  })

  const result = await verifyRedemption(
    prisma, 'CODE1', 'MANUAL',
    { role: 'merchant', branchId: 'b1', merchantId: 'm1', actorId: 'ma1' },
    baseCtx
  )
  expect(result.customer.name).toBe('Bob Smith')
})

it('merchant_admin: rejects when request branchId does not match redemption branchId', async () => {
  const prisma = mockPrisma()
  prisma.voucherRedemption.findUnique.mockResolvedValue({
    id: 'r1', isValidated: false, branchId: 'b-camden',
    voucher: { merchantId: 'm1' },
    user: { firstName: 'Bob', lastName: 'Smith' },
  })

  await expect(
    verifyRedemption(
      prisma, 'CODE1', 'MANUAL',
      { role: 'merchant', branchId: 'b-shoreditch', merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )
  ).rejects.toThrow('REDEMPTION_NOT_FOUND')
})

it('merchant_admin: rejects with REDEMPTION_NOT_FOUND (not MERCHANT_MISMATCH) on cross-merchant code', async () => {
  const prisma = mockPrisma()
  prisma.voucherRedemption.findUnique.mockResolvedValue({
    id: 'r1', isValidated: false, branchId: 'b1',
    voucher: { merchantId: 'm-other' },
    user: { firstName: 'X', lastName: 'Y' },
  })

  await expect(
    verifyRedemption(
      prisma, 'CODE1', 'MANUAL',
      { role: 'merchant', branchId: 'b1', merchantId: 'm1', actorId: 'ma1' },
      baseCtx
    )
  ).rejects.toThrow('REDEMPTION_NOT_FOUND')
})
```

Also update the existing `throws BRANCH_ACCESS_DENIED when branch_staff branchId does not match redemption branchId` test — change the expected error to `REDEMPTION_NOT_FOUND` (per spec: identical error for not-exists vs wrong-branch, no information leakage).

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/api/redemption/service.test.ts -t "verifyRedemption"`
Expected: FAIL.

- [ ] **Step 3: Update `VerifyActor` interface and `verifyRedemption` logic**

In `src/api/redemption/service.ts`, change `VerifyActor`:

```typescript
export interface VerifyActor {
  role: 'branch' | 'merchant'
  branchId: string      // now REQUIRED for both roles — merchant admin must pick a branch
  merchantId: string
  actorId: string
}
```

Replace the scope-check block inside `verifyRedemption` (currently around lines 178–185) with:

```typescript
  // Validation-after-subscription-expiry rule:
  // if a VoucherRedemption exists, staff validation MUST succeed even if the
  // customer's subscription has since expired. Subscription is re-checked at
  // createRedemption time, not at validation time.
  if (!redemption) throw new AppError('REDEMPTION_NOT_FOUND')
  if (redemption.isValidated) throw new AppError('ALREADY_VALIDATED')

  // Branch-level scope check applies to BOTH branch staff and merchant admins.
  // Error is identical ("not found") for:
  //   (a) code does not exist, or
  //   (b) code exists but belongs to a different branch.
  // This prevents information leakage about which codes exist globally.
  if (redemption.branchId !== actor.branchId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }
```

Remove the merchant-level branch (the old `if (actor.role === 'merchant') { redemption.voucher.merchantId !== actor.merchantId }`).

- [ ] **Step 4: Update the route to require `branchId` from merchant admins**

In `src/api/redemption/routes.ts`, modify the verify route body schema (around line 59) to accept a required `branchId`:

```typescript
  app.post(`${prefix}/redemption/verify`, async (req: FastifyRequest, reply) => {
    const body = z.object({
      code:     z.string().min(1),
      method:   z.enum(['QR_SCAN', 'MANUAL']),
      branchId: z.string().min(1),
    }).parse(req.body)
```

Then update both token-resolution branches (branch staff + merchant admin) to use `body.branchId` when assembling the `actor`:

- Branch staff: `actor.branchId = session.branchId`. If `session.branchId !== body.branchId`, throw `AppError('BRANCH_ACCESS_DENIED')`.
- Merchant admin: verify that `body.branchId` belongs to `merchantSession.merchantId` (query `prisma.branch.findUnique`), then `actor.branchId = body.branchId`. If branch doesn't belong to merchant, throw `AppError('BRANCH_ACCESS_DENIED')`.

- [ ] **Step 5: Write failing route-level test**

Add to `tests/api/redemption/routes.test.ts`:

```typescript
it('verify route: merchant admin must supply branchId and it must belong to their merchant', async () => {
  // ... setup merchant session with merchantId=m1
  // call POST /api/v1/redemption/verify with { code, method, branchId: 'b-other-merchant' }
  // expect 400/403 with BRANCH_ACCESS_DENIED
})

it('verify route: requires branchId in body', async () => {
  // call POST /api/v1/redemption/verify without branchId
  // expect 400 (zod validation error)
})
```

Use the existing routes test harness as a template — open the file and copy an existing verify-route test's setup.

- [ ] **Step 6: Run full redemption suite**

Run: `npx vitest run tests/api/redemption`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add src/api/redemption/service.ts src/api/redemption/routes.ts tests/api/redemption/
git commit -m "feat(redemption): branch-level scope check + subscription-expiry rule"
```

---

## Task 5: Staff verify rate limit (separate from customer PIN limit)

**Files:**
- Modify: `src/api/shared/redis-keys.ts`
- Modify: `src/api/redemption/routes.ts` (verify handler)
- Test: `tests/api/redemption/routes.test.ts`

- [ ] **Step 1: Add the Redis key**

Append to `src/api/shared/redis-keys.ts` (inside the `RedisKey` object, near the existing `pinFailCount`):

```typescript
  // Staff verify fail counter — keyed per (actorId, branchId). Distinct from
  // customer-side pinFailCount so staff mistypes don't lock out the customer.
  staffVerifyFailCount: (actorId: string, branchId: string) => `verify:fail:${actorId}:${branchId}`,
```

- [ ] **Step 2: Write failing test**

Add to `tests/api/redemption/routes.test.ts`:

```typescript
it('verify route: enforces 20-failure-per-5min rate limit per (actorId, branchId)', async () => {
  // seed Redis: redis.set(`verify:fail:bu1:b1`, '20', 'EX', 300)
  // call POST /api/v1/redemption/verify with valid branch token for (bu1, b1)
  // expect 429 STAFF_VERIFY_RATE_LIMIT_EXCEEDED
})

it('verify route: increments counter on failure, does NOT increment on success', async () => {
  // first call: invalid code → counter = 1
  // second call: valid code → counter stays at 1 (or reset — implementation choice)
})
```

- [ ] **Step 3: Run test**

Run: `npx vitest run tests/api/redemption/routes.test.ts -t "rate limit"`
Expected: FAIL.

- [ ] **Step 4: Implement the rate limiter**

In `src/api/redemption/routes.ts`, add these constants at the top:

```typescript
const STAFF_VERIFY_FAIL_LIMIT = 20
const STAFF_VERIFY_FAIL_WINDOW = 5 * 60 // 5 minutes, seconds
```

In the verify handler, AFTER the actor is resolved but BEFORE calling `verifyRedemption`, add:

```typescript
    const rateKey = RedisKey.staffVerifyFailCount(actor.actorId, actor.branchId)
    const current = await app.redis.get(rateKey)
    if (current !== null && parseInt(current, 10) >= STAFF_VERIFY_FAIL_LIMIT) {
      throw new AppError('STAFF_VERIFY_RATE_LIMIT_EXCEEDED')
    }

    try {
      const result = await verifyRedemption(/* ... existing args */)
      // success — optionally reset counter; keeping it simple, leave it to expire
      return reply.send(result)
    } catch (err) {
      if (err instanceof AppError) {
        await app.redis.incr(rateKey)
        await app.redis.expire(rateKey, STAFF_VERIFY_FAIL_WINDOW)
      }
      throw err
    }
```

Add `STAFF_VERIFY_RATE_LIMIT_EXCEEDED` to `src/api/shared/errors.ts` (map to HTTP 429).

- [ ] **Step 5: Run test**

Run: `npx vitest run tests/api/redemption/routes.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/api/shared/redis-keys.ts src/api/shared/errors.ts src/api/redemption/routes.ts tests/api/redemption/routes.test.ts
git commit -m "feat(redemption): staff-side verify rate limit"
```

---

## Task 6: Screenshot flag endpoint + service

**Files:**
- Create: `src/api/redemption/screenshot-flag.ts`
- Modify: `src/api/redemption/routes.ts` (add new customer route)
- Test: `tests/api/redemption/screenshot-flag.test.ts` (new)

- [ ] **Step 1: Write failing service test**

Create `tests/api/redemption/screenshot-flag.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AppError } from '../../../src/api/shared/errors'
import { flagRedemptionScreenshot } from '../../../src/api/redemption/screenshot-flag'

const mockPrisma = () => ({
  voucherRedemption: { findUnique: vi.fn() },
  redemptionScreenshotEvent: { findFirst: vi.fn(), create: vi.fn() },
} as any)

describe('flagRedemptionScreenshot', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404-style error when redemption belongs to a different user', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'other-user', isValidated: false,
    })

    await expect(
      flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('silently no-ops when redemption is already validated', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user-1', isValidated: true,
    })

    const result = await flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    expect(result).toEqual({ logged: false })
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('silently dedupes when a recent event exists within 5 seconds', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user-1', isValidated: false,
    })
    prisma.redemptionScreenshotEvent.findFirst.mockResolvedValue({
      occurredAt: new Date(Date.now() - 2000),
    })

    const result = await flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    expect(result).toEqual({ logged: false })
    expect(prisma.redemptionScreenshotEvent.create).not.toHaveBeenCalled()
  })

  it('logs event otherwise', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      id: 'r1', userId: 'user-1', isValidated: false,
    })
    prisma.redemptionScreenshotEvent.findFirst.mockResolvedValue(null)
    prisma.redemptionScreenshotEvent.create.mockResolvedValue({ id: 'evt1' })

    const result = await flagRedemptionScreenshot(prisma, 'user-1', 'CODE1', 'ios')
    expect(result).toEqual({ logged: true })
    expect(prisma.redemptionScreenshotEvent.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        userId: 'user-1',
        redemptionId: 'r1',
        platform: 'ios',
      }),
    })
  })
})
```

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/api/redemption/screenshot-flag.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the service**

Create `src/api/redemption/screenshot-flag.ts`:

```typescript
import { PrismaClient } from '../../../generated/prisma/client'
import { AppError } from '../shared/errors'

const DEDUP_WINDOW_MS = 5000

export async function flagRedemptionScreenshot(
  prisma: PrismaClient,
  userId: string,
  code: string,
  platform: 'ios' | 'android'
): Promise<{ logged: boolean }> {
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
    select: { id: true, userId: true, isValidated: true },
  })

  // Identical error for: does not exist, belongs to another user.
  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }

  // Post-validation: silently no-op (screenshots of a validated redemption are not a fraud vector).
  if (redemption.isValidated) {
    return { logged: false }
  }

  // Deduplicate: don't log more than once per 5 seconds per redemption.
  const recent = await prisma.redemptionScreenshotEvent.findFirst({
    where: { redemptionId: redemption.id },
    orderBy: { occurredAt: 'desc' },
    select: { occurredAt: true },
  })
  if (recent && Date.now() - recent.occurredAt.getTime() < DEDUP_WINDOW_MS) {
    return { logged: false }
  }

  await prisma.redemptionScreenshotEvent.create({
    data: { userId, redemptionId: redemption.id, platform },
  })
  return { logged: true }
}
```

- [ ] **Step 4: Add the route**

In `src/api/redemption/routes.ts`, inside `customerRedemptionRoutes`, add:

```typescript
  // POST /api/v1/redemption/:code/screenshot-flag — log a screenshot event (customer)
  app.post(`${prefix}/redemption/:code/screenshot-flag`, async (req: FastifyRequest, reply) => {
    const { code } = req.params as { code: string }
    const body = z.object({ platform: z.enum(['ios', 'android']) }).parse(req.body)

    const result = await flagRedemptionScreenshot(app.prisma, req.user.sub, code, body.platform)
    return reply.send(result)
  })
```

Import `flagRedemptionScreenshot` at the top of the file.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/api/redemption`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/redemption/screenshot-flag.ts src/api/redemption/routes.ts tests/api/redemption/screenshot-flag.test.ts
git commit -m "feat(redemption): screenshot-flag endpoint with dedup + pre-validation gate"
```

---

## Task 7: Self-lookup by code endpoint (for polling)

**Files:**
- Modify: `src/api/redemption/service.ts` (new `getMyRedemptionByCode`)
- Modify: `src/api/redemption/routes.ts` (new GET route)
- Test: `tests/api/redemption/service.test.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/api/redemption/service.test.ts`:

```typescript
describe('getMyRedemptionByCode', () => {
  beforeEach(() => vi.clearAllMocks())

  it('returns 404-style error when code does not exist', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue(null)

    await expect(
      getMyRedemptionByCode(prisma, 'user-1', 'NOTFOUND')
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('returns 404-style error when code belongs to another user', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId: 'other', redemptionCode: 'CODE1',
    })

    await expect(
      getMyRedemptionByCode(prisma, 'user-1', 'CODE1')
    ).rejects.toThrow('REDEMPTION_NOT_FOUND')
  })

  it('returns shape {code, isValidated, validatedAt, validationMethod, voucherId, merchantName, branchName} for own code', async () => {
    const prisma = mockPrisma()
    prisma.voucherRedemption.findUnique.mockResolvedValue({
      userId: 'user-1',
      redemptionCode: 'CODE1',
      isValidated: true,
      validatedAt: new Date('2026-04-22T14:00:00Z'),
      validationMethod: 'QR_SCAN',
      voucherId: 'v1',
      voucher: { merchant: { businessName: 'Acme Café' } },
      branch: { name: 'Shoreditch' },
    })

    const result = await getMyRedemptionByCode(prisma, 'user-1', 'code1')

    expect(result).toEqual({
      code: 'CODE1',
      isValidated: true,
      validatedAt: expect.any(Date),
      validationMethod: 'QR_SCAN',
      voucherId: 'v1',
      merchantName: 'Acme Café',
      branchName: 'Shoreditch',
    })
  })
})
```

And update the import near the top of the file to include `getMyRedemptionByCode`.

- [ ] **Step 2: Run test**

Run: `npx vitest run tests/api/redemption/service.test.ts -t "getMyRedemptionByCode"`
Expected: FAIL.

- [ ] **Step 3: Implement**

Append to `src/api/redemption/service.ts`:

```typescript
export async function getMyRedemptionByCode(
  prisma: PrismaClient,
  userId: string,
  code: string
) {
  const normalised = code.replace(/[\s-]/g, '').toUpperCase()

  const redemption = await prisma.voucherRedemption.findUnique({
    where: { redemptionCode: normalised },
    include: {
      voucher: { select: { id: true, merchant: { select: { businessName: true } } } },
      branch:  { select: { name: true } },
    },
  })

  if (!redemption || redemption.userId !== userId) {
    throw new AppError('REDEMPTION_NOT_FOUND')
  }

  return {
    code:             redemption.redemptionCode,
    isValidated:      redemption.isValidated,
    validatedAt:      redemption.validatedAt,
    validationMethod: redemption.validationMethod,
    voucherId:        redemption.voucher.id,
    merchantName:     redemption.voucher.merchant.businessName,
    branchName:       redemption.branch.name,
  }
}
```

- [ ] **Step 4: Add the route**

In `src/api/redemption/routes.ts`, inside `customerRedemptionRoutes`, add:

```typescript
  // GET /api/v1/redemption/me/:code — self-lookup by code, for polling (customer)
  app.get(`${prefix}/redemption/me/:code`, async (req: FastifyRequest, reply) => {
    const { code } = req.params as { code: string }
    const result = await getMyRedemptionByCode(app.prisma, req.user.sub, code)
    return reply.send(result)
  })
```

Import `getMyRedemptionByCode`.

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/api/redemption`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add src/api/redemption/service.ts src/api/redemption/routes.ts tests/api/redemption/service.test.ts
git commit -m "feat(redemption): GET /redemption/me/:code self-lookup endpoint"
```

---

## Task 8: Install frontend native dependencies

**Files:**
- Modify: `apps/customer-app/package.json`

- [ ] **Step 1: Install the deps**

Run from the customer-app dir (real terminal — Claude Bash may time out during post-install hooks):

```bash
cd apps/customer-app
npx expo install react-native-qrcode-svg expo-brightness expo-screen-capture
```

Expected: `package.json` updated with the three packages at versions compatible with Expo SDK 54.

- [ ] **Step 2: Verify import graph**

Add a temporary test at `apps/customer-app/tests/features/voucher/deps-smoke.test.tsx`:

```typescript
import QRCode from 'react-native-qrcode-svg'
import * as Brightness from 'expo-brightness'
import * as ScreenCapture from 'expo-screen-capture'

describe('qr deps smoke', () => {
  it('all three deps import cleanly', () => {
    expect(QRCode).toBeDefined()
    expect(Brightness.setBrightnessAsync).toBeDefined()
    expect(ScreenCapture.addScreenshotListener).toBeDefined()
  })
})
```

- [ ] **Step 3: Run test**

In a real terminal (not Claude): `cd apps/customer-app && npm test -- deps-smoke`
Expected: PASS. If import fails, check native module config — `react-native-qrcode-svg` depends on `react-native-svg` (already installed).

- [ ] **Step 4: Delete the smoke test**

The smoke test was only to prove the deps work. Delete `apps/customer-app/tests/features/voucher/deps-smoke.test.tsx`.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/package.json apps/customer-app/package-lock.json
git commit -m "chore(customer-app): add react-native-qrcode-svg, expo-brightness, expo-screen-capture"
```

---

## Task 9: Frontend API client additions

**Files:**
- Modify: `apps/customer-app/src/lib/api/redemption.ts`

- [ ] **Step 1: Write failing test**

Create `apps/customer-app/tests/lib/api/redemption.test.ts` if it doesn't exist, else add to it:

```typescript
import { redemptionApi } from '@/lib/api/redemption'
import { api } from '@/lib/api'

jest.mock('@/lib/api', () => ({
  api: { get: jest.fn(), post: jest.fn() },
}))

describe('redemptionApi new methods', () => {
  beforeEach(() => jest.clearAllMocks())

  it('getMyRedemptionByCode calls GET /api/v1/redemption/me/:code', async () => {
    ;(api.get as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null,
      validationMethod: null, voucherId: 'v1',
      merchantName: 'Acme', branchName: 'Shoreditch',
    })
    await redemptionApi.getMyRedemptionByCode('K3F9P7')
    expect(api.get).toHaveBeenCalledWith('/api/v1/redemption/me/K3F9P7')
  })

  it('postScreenshotFlag posts to /api/v1/redemption/:code/screenshot-flag', async () => {
    ;(api.post as jest.Mock).mockResolvedValue({ logged: true })
    await redemptionApi.postScreenshotFlag('K3F9P7', 'ios')
    expect(api.post).toHaveBeenCalledWith(
      '/api/v1/redemption/K3F9P7/screenshot-flag',
      { platform: 'ios' }
    )
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- redemption`
Expected: FAIL — methods don't exist.

- [ ] **Step 3: Add the methods**

Append inside the `redemptionApi` object in `apps/customer-app/src/lib/api/redemption.ts`:

```typescript
export type RedemptionStatusByCode = {
  code: string
  isValidated: boolean
  validatedAt: string | null
  validationMethod: 'QR_SCAN' | 'MANUAL' | null
  voucherId: string
  merchantName: string
  branchName: string
}

// inside redemptionApi = { ... }
  getMyRedemptionByCode(code: string) {
    return api.get<RedemptionStatusByCode>(`/api/v1/redemption/me/${code}`)
  },

  postScreenshotFlag(code: string, platform: 'ios' | 'android') {
    return api.post<{ logged: boolean }>(
      `/api/v1/redemption/${code}/screenshot-flag`,
      { platform }
    )
  },
```

- [ ] **Step 4: Run tests**

Real terminal: `cd apps/customer-app && npm test -- redemption`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/lib/api/redemption.ts apps/customer-app/tests/lib/api/redemption.test.ts
git commit -m "feat(customer-app): redemption API — self-lookup-by-code + screenshot-flag"
```

---

## Task 10: `formatCode` + accessibility label helper

**Files:**
- Create: `apps/customer-app/src/features/voucher/utils/formatCode.ts`
- Test: `apps/customer-app/tests/features/voucher/utils/formatCode.test.ts`

- [ ] **Step 1: Write failing tests**

Create `apps/customer-app/tests/features/voucher/utils/formatCode.test.ts`:

```typescript
import { formatCode, codeAccessibilityLabel } from '@/features/voucher/utils/formatCode'

describe('formatCode', () => {
  it('groups 6-char codes as 3-3 with a space', () => {
    expect(formatCode('K3F9P7')).toBe('K3F 9P7')
  })

  it('groups legacy 10-char codes as 5-5 with a space', () => {
    expect(formatCode('AB3F9K2P7Q')).toBe('AB3F9 K2P7Q')
  })

  it('returns unknown-length codes as-is (no grouping)', () => {
    expect(formatCode('K3F9P7A8')).toBe('K3F9P7A8')
    expect(formatCode('AB')).toBe('AB')
  })

  it('tolerates already-formatted input (strips whitespace first)', () => {
    expect(formatCode('K3F 9P7')).toBe('K3F 9P7')
    expect(formatCode('AB3F9 K2P7Q')).toBe('AB3F9 K2P7Q')
  })
})

describe('codeAccessibilityLabel', () => {
  it('announces code character-by-character with "space" for the gap', () => {
    expect(codeAccessibilityLabel('K3F9P7')).toBe(
      'Redemption code. K, 3, F, 9, P, 7.'
    )
  })

  it('pronounces "O" and other common letters by their letter name only', () => {
    expect(codeAccessibilityLabel('ABC')).toBe('Redemption code. A, B, C.')
  })

  it('handles legacy 10-char codes', () => {
    expect(codeAccessibilityLabel('AB3F9K2P7Q')).toBe(
      'Redemption code. A, B, 3, F, 9, K, 2, P, 7, Q.'
    )
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- formatCode`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/utils/formatCode.ts`:

```typescript
export function formatCode(code: string): string {
  const raw = code.replace(/\s+/g, '')
  if (raw.length === 6) {
    return `${raw.slice(0, 3)} ${raw.slice(3)}`
  }
  if (raw.length === 10) {
    return `${raw.slice(0, 5)} ${raw.slice(5)}`
  }
  return raw
}

export function codeAccessibilityLabel(code: string): string {
  const raw = code.replace(/\s+/g, '')
  const spoken = raw.split('').join(', ')
  return `Redemption code. ${spoken}.`
}
```

- [ ] **Step 4: Run test**

Real terminal: `cd apps/customer-app && npm test -- formatCode`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/utils/formatCode.ts apps/customer-app/tests/features/voucher/utils/formatCode.test.ts
git commit -m "feat(voucher): formatCode + codeAccessibilityLabel helpers"
```

---

## Task 11: `QRCodeBlock` shared component

**Files:**
- Create: `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/QRCodeBlock.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/customer-app/tests/features/voucher/components/QRCodeBlock.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { QRCodeBlock } from '@/features/voucher/components/QRCodeBlock'

describe('QRCodeBlock', () => {
  it('renders with provided code as accessibilityLabel', () => {
    const { getByLabelText } = render(<QRCodeBlock value="K3F9P7" size={240} />)
    expect(getByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeTruthy()
  })

  it('clamps to minimum size of 200 when requested size is smaller than 200 AND hero=true', () => {
    const { UNSAFE_getByType } = render(<QRCodeBlock value="K3F9P7" size={180} hero />)
    // QRCode from react-native-qrcode-svg exposes the size prop via ref/props
    // We inspect the rendered element's size prop via test renderer:
    const QRCode = require('react-native-qrcode-svg').default
    const node = UNSAFE_getByType(QRCode)
    expect(node.props.size).toBe(200)
  })

  it('does not clamp non-hero usage (Redemption Details Card at 80 is allowed)', () => {
    const { UNSAFE_getByType } = render(<QRCodeBlock value="K3F9P7" size={80} />)
    const QRCode = require('react-native-qrcode-svg').default
    const node = UNSAFE_getByType(QRCode)
    expect(node.props.size).toBe(80)
  })

  it('sets accessibilityLabel to "Code hidden. Tap to show again." when blurred=true', () => {
    const { getByLabelText } = render(<QRCodeBlock value="K3F9P7" size={240} blurred />)
    expect(getByLabelText('Code hidden. Tap to show again.')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- QRCodeBlock`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx`:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import QRCode from 'react-native-qrcode-svg'
import { color, radius } from '@/design-system/tokens'
import { codeAccessibilityLabel } from '../utils/formatCode'

const MIN_HERO_SIZE = 200

type Props = {
  value: string
  size: number
  /** If true, enforces MIN_HERO_SIZE floor. Use on Show to Staff hero. */
  hero?: boolean
  /** If true, overlays a blur and swaps accessibility label. */
  blurred?: boolean
}

export function QRCodeBlock({ value, size, hero, blurred }: Props) {
  const effectiveSize = hero ? Math.max(size, MIN_HERO_SIZE) : size
  const logoSize = Math.round(effectiveSize * 0.18)

  if (blurred) {
    return (
      <View
        style={[styles.wrapper, { width: effectiveSize, height: effectiveSize }]}
        accessibilityRole="button"
        accessibilityLabel="Code hidden. Tap to show again."
      >
        <BlurView intensity={32} style={StyleSheet.absoluteFill} />
      </View>
    )
  }

  return (
    <View
      style={[styles.wrapper, { width: effectiveSize, height: effectiveSize }]}
      accessibilityRole="image"
      accessibilityLabel={codeAccessibilityLabel(value)}
    >
      <QRCode
        value={value}
        size={effectiveSize}
        color={color.brandNavy}                  // data modules in navy (#010C35)
        backgroundColor="#FFFFFF"
        ecl="H"                                  // High error correction for centre logo
        logo={require('@/assets/qr-logo.png')}   // centre R badge (create as PNG asset)
        logoSize={logoSize}
        logoBackgroundColor="#FFFFFF"
        logoMargin={2}
        logoBorderRadius={4}
        quietZone={4}
        // Note: react-native-qrcode-svg supports per-pattern recoloring via `enableLinearGradient`
        // but not per-finder-pattern colors out of the box. We accept navy finder patterns here;
        // brand red finders are a visual polish pass after the library behaviour is verified.
      />
    </View>
  )
}

const styles = StyleSheet.create({
  wrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
})
```

**Asset note:** Create a 512×512 PNG of the red "R" wordmark on a transparent background at `apps/customer-app/src/assets/qr-logo.png`. If a brand asset already exists in `../../../../Branding /` (the branding folder on disk), copy it in. Temporary placeholder is acceptable if the asset pipeline is set up — the component contract is what matters.

**Re branded finder patterns:** `react-native-qrcode-svg` does not expose per-finder-pattern colouring natively. Getting red finders + navy modules requires either a fork or rendering our own SVG. For this phase we ship with navy finder patterns + navy modules + white R badge (still brand-consistent, scans reliably). The spec's red finders are treated as a later polish pass and not required to close this plan.

- [ ] **Step 4: Add color token if missing**

Open `apps/customer-app/src/design-system/tokens.ts`. If `color.brandNavy` doesn't exist, add it alongside the existing brand tokens:

```typescript
brandNavy: '#010C35',
```

- [ ] **Step 5: Run tests**

Real terminal: `cd apps/customer-app && npm test -- QRCodeBlock`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/QRCodeBlock.tsx \
        apps/customer-app/src/assets/qr-logo.png \
        apps/customer-app/src/design-system/tokens.ts \
        apps/customer-app/tests/features/voucher/components/QRCodeBlock.test.tsx
git commit -m "feat(voucher): QRCodeBlock shared component with min-size + blur state"
```

---

## Task 12: `useRedemptionPolling` hook

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useRedemptionPolling.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/customer-app/tests/features/voucher/hooks/useRedemptionPolling.test.tsx`:

```typescript
import React from 'react'
import { renderHook, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useRedemptionPolling } from '@/features/voucher/hooks/useRedemptionPolling'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getMyRedemptionByCode: jest.fn() },
}))

const wrapper = ({ children }: { children: React.ReactNode }) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>
}

describe('useRedemptionPolling', () => {
  beforeEach(() => jest.clearAllMocks())

  it('polls getMyRedemptionByCode every 5 seconds while enabled', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null,
      validationMethod: null, voucherId: 'v1',
      merchantName: 'Acme', branchName: 'Shoreditch',
    })

    jest.useFakeTimers()
    renderHook(() => useRedemptionPolling('K3F9P7', { enabled: true }), { wrapper })

    await waitFor(() => {
      expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(1)
    })

    jest.advanceTimersByTime(5000)
    await waitFor(() => {
      expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(2)
    })

    jest.useRealTimers()
  })

  it('stops polling once isValidated=true is observed', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock)
      .mockResolvedValueOnce({ code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null, voucherId: 'v1', merchantName: '', branchName: '' })
      .mockResolvedValueOnce({ code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z', validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: '', branchName: '' })

    jest.useFakeTimers()
    renderHook(() => useRedemptionPolling('K3F9P7', { enabled: true }), { wrapper })

    await waitFor(() => expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(1))
    jest.advanceTimersByTime(5000)
    await waitFor(() => expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(2))

    // one more tick should not fire another request
    jest.advanceTimersByTime(5000)
    await waitFor(() => expect(redemptionApi.getMyRedemptionByCode).toHaveBeenCalledTimes(2))

    jest.useRealTimers()
  })

  it('stops polling after 15 minutes with no validation', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null,
      voucherId: 'v1', merchantName: '', branchName: '',
    })

    jest.useFakeTimers()
    renderHook(() => useRedemptionPolling('K3F9P7', { enabled: true }), { wrapper })

    // 15 min / 5 sec = 180 polls
    jest.advanceTimersByTime(15 * 60 * 1000 + 5000)
    await waitFor(() => {
      const count = (redemptionApi.getMyRedemptionByCode as jest.Mock).mock.calls.length
      expect(count).toBeLessThanOrEqual(181)
    })

    const countBefore = (redemptionApi.getMyRedemptionByCode as jest.Mock).mock.calls.length
    jest.advanceTimersByTime(60_000)
    expect((redemptionApi.getMyRedemptionByCode as jest.Mock).mock.calls.length).toBe(countBefore)

    jest.useRealTimers()
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- useRedemptionPolling`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts`:

```typescript
import { useEffect, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { redemptionApi, RedemptionStatusByCode } from '@/lib/api/redemption'

const POLL_INTERVAL_MS = 5_000
const MAX_POLL_DURATION_MS = 15 * 60 * 1_000

type Options = { enabled: boolean }

export type PollState =
  | { phase: 'polling'; data: RedemptionStatusByCode | null }
  | { phase: 'validated'; data: RedemptionStatusByCode }
  | { phase: 'timed-out'; data: RedemptionStatusByCode | null }

export function useRedemptionPolling(code: string, opts: Options) {
  const startedAt = useRef<number>(Date.now())
  const [timedOut, setTimedOut] = useState(false)

  useEffect(() => {
    if (!opts.enabled) return
    startedAt.current = Date.now()
    setTimedOut(false)
  }, [opts.enabled])

  const query = useQuery<RedemptionStatusByCode>({
    queryKey: ['redemption', 'by-code', code],
    queryFn: () => redemptionApi.getMyRedemptionByCode(code),
    refetchInterval: (q) => {
      if (!opts.enabled) return false
      if (q.state.data?.isValidated) return false
      if (Date.now() - startedAt.current >= MAX_POLL_DURATION_MS) {
        setTimedOut(true)
        return false
      }
      return POLL_INTERVAL_MS
    },
    enabled: opts.enabled,
  })

  const data = query.data ?? null
  const state: PollState = data?.isValidated
    ? { phase: 'validated', data }
    : timedOut
      ? { phase: 'timed-out', data }
      : { phase: 'polling', data }

  return state
}
```

- [ ] **Step 4: Run test**

Real terminal: `cd apps/customer-app && npm test -- useRedemptionPolling`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useRedemptionPolling.ts \
        apps/customer-app/tests/features/voucher/hooks/useRedemptionPolling.test.tsx
git commit -m "feat(voucher): useRedemptionPolling hook (5s interval, 15min timeout, validated-stop)"
```

---

## Task 13: `useBrightnessBoost` hook (best-effort)

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useBrightnessBoost.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/customer-app/tests/features/voucher/hooks/useBrightnessBoost.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react-native'
import * as Brightness from 'expo-brightness'
import { useBrightnessBoost } from '@/features/voucher/hooks/useBrightnessBoost'

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn(),
  setBrightnessAsync: jest.fn(),
}))

describe('useBrightnessBoost', () => {
  beforeEach(() => jest.clearAllMocks())

  it('captures current brightness then sets to 1.0 on mount', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockResolvedValue(0.42)
    ;(Brightness.setBrightnessAsync as jest.Mock).mockResolvedValue(undefined)

    renderHook(() => useBrightnessBoost(true))
    await act(async () => {})

    expect(Brightness.getBrightnessAsync).toHaveBeenCalled()
    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(1)
  })

  it('restores previous brightness on unmount', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockResolvedValue(0.42)
    ;(Brightness.setBrightnessAsync as jest.Mock).mockResolvedValue(undefined)

    const { unmount } = renderHook(() => useBrightnessBoost(true))
    await act(async () => {})
    ;(Brightness.setBrightnessAsync as jest.Mock).mockClear()

    unmount()
    await act(async () => {})

    expect(Brightness.setBrightnessAsync).toHaveBeenCalledWith(0.42)
  })

  it('swallows errors silently (best-effort)', async () => {
    ;(Brightness.getBrightnessAsync as jest.Mock).mockRejectedValue(new Error('denied'))
    expect(() => renderHook(() => useBrightnessBoost(true))).not.toThrow()
  })

  it('does nothing when active=false', async () => {
    renderHook(() => useBrightnessBoost(false))
    await act(async () => {})
    expect(Brightness.getBrightnessAsync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- useBrightnessBoost`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts`:

```typescript
import { useEffect, useRef } from 'react'
import * as Brightness from 'expo-brightness'

export function useBrightnessBoost(active: boolean) {
  const previous = useRef<number | null>(null)

  useEffect(() => {
    if (!active) return

    let cancelled = false

    ;(async () => {
      try {
        const current = await Brightness.getBrightnessAsync()
        if (cancelled) return
        previous.current = current
        await Brightness.setBrightnessAsync(1)
      } catch {
        // best-effort — brightness APIs can fail on Low Power Mode, locked
        // Guided Access, permission denial. Fail silently.
      }
    })()

    return () => {
      cancelled = true
      if (previous.current === null) return
      const restoreTo = previous.current
      previous.current = null
      Brightness.setBrightnessAsync(restoreTo).catch(() => { /* best-effort restore */ })
    }
  }, [active])
}
```

- [ ] **Step 4: Run test**

Real terminal: `cd apps/customer-app && npm test -- useBrightnessBoost`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useBrightnessBoost.ts \
        apps/customer-app/tests/features/voucher/hooks/useBrightnessBoost.test.tsx
git commit -m "feat(voucher): useBrightnessBoost hook (best-effort boost + restore)"
```

---

## Task 14: `useScreenshotGuard` hook (detect + POST + debounce + FLAG_SECURE)

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useScreenshotGuard.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/customer-app/tests/features/voucher/hooks/useScreenshotGuard.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react-native'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'
import { useScreenshotGuard } from '@/features/voucher/hooks/useScreenshotGuard'

jest.mock('expo-screen-capture', () => ({
  addScreenshotListener: jest.fn(),
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync: jest.fn(),
}))

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { postScreenshotFlag: jest.fn().mockResolvedValue({ logged: true }) },
}))

describe('useScreenshotGuard', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockReturnValue({ remove: jest.fn() })
  })

  it('iOS: registers screenshot listener, shows banner, POSTs flag on capture', async () => {
    Platform.OS = 'ios' as any
    let capturedHandler: (() => void) | null = null
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation((h) => {
      capturedHandler = h
      return { remove: jest.fn() }
    })

    const onBanner = jest.fn()
    renderHook(() => useScreenshotGuard('K3F9P7', { active: true, onBannerShown: onBanner }))

    await act(async () => { capturedHandler?.() })
    expect(onBanner).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledWith('K3F9P7', 'ios')
  })

  it('iOS: debounces banner+POST to at most once per 5 seconds', async () => {
    Platform.OS = 'ios' as any
    let capturedHandler: (() => void) | null = null
    ;(ScreenCapture.addScreenshotListener as jest.Mock).mockImplementation((h) => {
      capturedHandler = h
      return { remove: jest.fn() }
    })

    jest.useFakeTimers()
    const onBanner = jest.fn()
    renderHook(() => useScreenshotGuard('K3F9P7', { active: true, onBannerShown: onBanner }))

    await act(async () => { capturedHandler?.() })
    await act(async () => { capturedHandler?.() })
    await act(async () => { capturedHandler?.() })

    expect(onBanner).toHaveBeenCalledTimes(1)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledTimes(1)

    jest.advanceTimersByTime(5_100)
    await act(async () => { capturedHandler?.() })
    expect(onBanner).toHaveBeenCalledTimes(2)
    expect(redemptionApi.postScreenshotFlag).toHaveBeenCalledTimes(2)

    jest.useRealTimers()
  })

  it('Android: calls preventScreenCaptureAsync on mount, allowScreenCaptureAsync on unmount', () => {
    Platform.OS = 'android' as any
    const { unmount } = renderHook(() => useScreenshotGuard('K3F9P7', { active: true, onBannerShown: jest.fn() }))
    expect(ScreenCapture.preventScreenCaptureAsync).toHaveBeenCalled()
    unmount()
    expect(ScreenCapture.allowScreenCaptureAsync).toHaveBeenCalled()
  })

  it('active=false: no listener registered, no FLAG_SECURE applied', () => {
    renderHook(() => useScreenshotGuard('K3F9P7', { active: false, onBannerShown: jest.fn() }))
    expect(ScreenCapture.addScreenshotListener).not.toHaveBeenCalled()
    expect(ScreenCapture.preventScreenCaptureAsync).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- useScreenshotGuard`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts`:

```typescript
import { useEffect, useRef } from 'react'
import { Platform } from 'react-native'
import * as ScreenCapture from 'expo-screen-capture'
import { redemptionApi } from '@/lib/api/redemption'

const DEBOUNCE_MS = 5_000

type Options = {
  active: boolean
  onBannerShown: () => void
}

export function useScreenshotGuard(code: string, opts: Options) {
  const lastFireRef = useRef<number>(0)

  useEffect(() => {
    if (!opts.active) return

    // Android: block screenshots entirely on this screen only.
    if (Platform.OS === 'android') {
      ScreenCapture.preventScreenCaptureAsync().catch(() => { /* best-effort */ })
    }

    // iOS + best-effort Android: listen for screenshot events.
    const subscription = ScreenCapture.addScreenshotListener(() => {
      const now = Date.now()
      if (now - lastFireRef.current < DEBOUNCE_MS) return
      lastFireRef.current = now

      opts.onBannerShown()
      redemptionApi
        .postScreenshotFlag(code, Platform.OS === 'ios' ? 'ios' : 'android')
        .catch(() => { /* best-effort — server dedupes anyway */ })
    })

    return () => {
      subscription.remove()
      if (Platform.OS === 'android') {
        ScreenCapture.allowScreenCaptureAsync().catch(() => { /* best-effort */ })
      }
    }
  }, [opts.active, code, opts.onBannerShown])
}
```

- [ ] **Step 4: Run test**

Real terminal: `cd apps/customer-app && npm test -- useScreenshotGuard`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useScreenshotGuard.ts \
        apps/customer-app/tests/features/voucher/hooks/useScreenshotGuard.test.tsx
git commit -m "feat(voucher): useScreenshotGuard — detect+flag (iOS), FLAG_SECURE (Android), 5s debounce"
```

---

## Task 15: `useAutoHideTimer` hook (2-min with 10s warning)

**Files:**
- Create: `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts`
- Test: `apps/customer-app/tests/features/voucher/hooks/useAutoHideTimer.test.tsx`

- [ ] **Step 1: Write failing test**

Create `apps/customer-app/tests/features/voucher/hooks/useAutoHideTimer.test.tsx`:

```typescript
import { renderHook, act } from '@testing-library/react-native'
import { useAutoHideTimer } from '@/features/voucher/hooks/useAutoHideTimer'

describe('useAutoHideTimer', () => {
  beforeEach(() => jest.useFakeTimers())
  afterEach(() => jest.useRealTimers())

  it('transitions to "warning" at 1:50 and "hidden" at 2:00 when active', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(110_000) })
    expect(result.current.state).toBe('warning')

    act(() => { jest.advanceTimersByTime(10_000) })
    expect(result.current.state).toBe('hidden')
  })

  it('resetTimer returns to "visible" and restarts the 2-min clock', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: true }))

    act(() => { jest.advanceTimersByTime(115_000) })
    expect(result.current.state).toBe('warning')

    act(() => { result.current.resetTimer() })
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(115_000) })
    expect(result.current.state).toBe('warning')
  })

  it('active=false keeps state at "visible" regardless of time', () => {
    const { result } = renderHook(() => useAutoHideTimer({ active: false }))
    act(() => { jest.advanceTimersByTime(5 * 60 * 1000) })
    expect(result.current.state).toBe('visible')
  })

  it('after validation signal, state is forced to "visible" and timer stops (see Task 16 integration — hook accepts `frozen` flag)', () => {
    const { result, rerender } = renderHook(
      ({ active, frozen }: { active: boolean; frozen: boolean }) =>
        useAutoHideTimer({ active, frozen }),
      { initialProps: { active: true, frozen: false } }
    )

    act(() => { jest.advanceTimersByTime(115_000) })
    expect(result.current.state).toBe('warning')

    rerender({ active: true, frozen: true })
    expect(result.current.state).toBe('visible')

    act(() => { jest.advanceTimersByTime(30_000) })
    expect(result.current.state).toBe('visible')
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- useAutoHideTimer`
Expected: FAIL.

- [ ] **Step 3: Implement**

Create `apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts`:

```typescript
import { useCallback, useEffect, useRef, useState } from 'react'

const HIDE_AFTER_MS     = 2 * 60 * 1000
const WARNING_LEAD_MS   = 10 * 1000

export type AutoHideState = 'visible' | 'warning' | 'hidden'

type Options = {
  active: boolean
  /** When true (e.g. validated), force state to 'visible' and disable timer. */
  frozen?: boolean
}

export function useAutoHideTimer({ active, frozen }: Options) {
  const [state, setState] = useState<AutoHideState>('visible')
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hideTimer    = useRef<ReturnType<typeof setTimeout> | null>(null)

  const clear = useCallback(() => {
    if (warningTimer.current) clearTimeout(warningTimer.current)
    if (hideTimer.current)    clearTimeout(hideTimer.current)
    warningTimer.current = null
    hideTimer.current    = null
  }, [])

  const schedule = useCallback(() => {
    clear()
    warningTimer.current = setTimeout(() => setState('warning'), HIDE_AFTER_MS - WARNING_LEAD_MS)
    hideTimer.current    = setTimeout(() => setState('hidden'),  HIDE_AFTER_MS)
  }, [clear])

  const resetTimer = useCallback(() => {
    setState('visible')
    if (active && !frozen) schedule()
  }, [active, frozen, schedule])

  useEffect(() => {
    if (!active || frozen) {
      clear()
      setState('visible')
      return
    }
    schedule()
    return clear
  }, [active, frozen, schedule, clear])

  return { state, resetTimer }
}
```

- [ ] **Step 4: Run test**

Real terminal: `cd apps/customer-app && npm test -- useAutoHideTimer`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/hooks/useAutoHideTimer.ts \
        apps/customer-app/tests/features/voucher/hooks/useAutoHideTimer.test.tsx
git commit -m "feat(voucher): useAutoHideTimer (2min / 10s warning / frozen override)"
```

---

## Task 16: Rewrite `ShowToStaff.tsx` — compose hooks + QR + validated state

**Files:**
- Modify (rewrite): `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/ShowToStaff.test.tsx`

This task pulls the four hooks and the QR component together into the Show to Staff screen.

- [ ] **Step 1: Write the high-level integration test**

Create (or extend) `apps/customer-app/tests/features/voucher/components/ShowToStaff.test.tsx`:

```typescript
import React from 'react'
import { render, fireEvent, waitFor } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ShowToStaff } from '@/features/voucher/components/ShowToStaff'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: {
    getMyRedemptionByCode: jest.fn(),
    postScreenshotFlag: jest.fn().mockResolvedValue({ logged: true }),
  },
}))

jest.mock('expo-brightness', () => ({
  getBrightnessAsync: jest.fn().mockResolvedValue(0.5),
  setBrightnessAsync: jest.fn().mockResolvedValue(undefined),
}))

jest.mock('expo-screen-capture', () => ({
  addScreenshotListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
  preventScreenCaptureAsync: jest.fn(),
  allowScreenCaptureAsync: jest.fn(),
}))

const baseProps = {
  visible: true,
  redemptionCode: 'K3F9P7',
  voucherTitle: '2-for-1 Burgers',
  voucherType: 'BOGO' as const,
  merchantName: 'Acme Café',
  branchName: 'Shoreditch',
  customerName: 'Jane Doe',
  redeemedAt: '2026-04-22T13:00:00Z',
  onDone: jest.fn(),
}

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('ShowToStaff', () => {
  beforeEach(() => {
    jest.clearAllMocks()
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null,
      voucherId: 'v1', merchantName: 'Acme Café', branchName: 'Shoreditch',
    })
  })

  it('renders QR with formatted code and a11y label', async () => {
    const { getByText, getByLabelText } = wrap(<ShowToStaff {...baseProps} />)
    expect(getByText('K3F 9P7')).toBeTruthy()
    expect(getByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeTruthy()
  })

  it('shows validated state when polling returns isValidated=true', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z',
      validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: 'Acme Café', branchName: 'Shoreditch',
    })

    const { findByText } = wrap(<ShowToStaff {...baseProps} />)
    expect(await findByText(/Validated/i)).toBeTruthy()
  })

  it('auto-dismiss cancels when user taps during validated state', async () => {
    jest.useFakeTimers()
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z',
      validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: 'Acme Café', branchName: 'Shoreditch',
    })
    const onDone = jest.fn()

    const { findByTestId } = wrap(<ShowToStaff {...baseProps} onDone={onDone} />)
    const surface = await findByTestId('validated-surface')
    fireEvent.press(surface)

    jest.advanceTimersByTime(5_000)
    expect(onDone).not.toHaveBeenCalled()
    jest.useRealTimers()
  })
})
```

- [ ] **Step 2: Run tests**

Real terminal: `cd apps/customer-app && npm test -- ShowToStaff`
Expected: FAIL (most of the above behaviours don't exist yet).

- [ ] **Step 3: Rewrite the component**

Replace `apps/customer-app/src/features/voucher/components/ShowToStaff.tsx` entirely with:

```typescript
import React, { useEffect, useState, useCallback, useRef } from 'react'
import { View, Modal, Pressable, StyleSheet } from 'react-native'
import { LinearGradient } from 'expo-linear-gradient'
import { Check } from 'lucide-react-native'
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withRepeat, withTiming, Easing } from 'react-native-reanimated'
import { Text } from '@/design-system/Text'
import { color, spacing, radius } from '@/design-system/tokens'
import { successHaptic, lightHaptic } from '@/design-system/haptics'
import { useMotionScale } from '@/design-system/useMotionScale'
import { QRCodeBlock } from './QRCodeBlock'
import { formatCode } from '../utils/formatCode'
import { useRedemptionPolling } from '../hooks/useRedemptionPolling'
import { useBrightnessBoost } from '../hooks/useBrightnessBoost'
import { useScreenshotGuard } from '../hooks/useScreenshotGuard'
import { useAutoHideTimer } from '../hooks/useAutoHideTimer'
import type { VoucherType } from '@/lib/api/redemption'

type Props = {
  visible: boolean
  redemptionCode: string
  voucherTitle: string
  voucherType: VoucherType
  merchantName: string
  branchName: string
  customerName: string
  redeemedAt: string
  onDone: () => void
}

const AUTO_DISMISS_MS = 4_000

function LiveClock() {
  const [now, setNow] = useState(new Date())
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])
  const text = now.toLocaleTimeString('en-GB', { hour12: false })
    + ' · '
    + now.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Text variant="heading.md" color="primary" style={styles.clockText}>{text}</Text>
    </View>
  )
}

function LivePill() {
  const scale = useSharedValue(1)
  const opacity = useSharedValue(1)
  const motion = useMotionScale()
  useEffect(() => {
    if (motion <= 0) return
    scale.value   = withRepeat(withTiming(0.6, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
    opacity.value = withRepeat(withTiming(0.3, { duration: 700, easing: Easing.inOut(Easing.ease) }), -1, true)
  }, [scale, opacity, motion])
  const style = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }], opacity: opacity.value }))
  return (
    <View style={styles.livePill}>
      <Animated.View style={[styles.liveDot, style]} />
      <Text variant="label.eyebrow" style={styles.liveText}>LIVE</Text>
    </View>
  )
}

export function ShowToStaff(props: Props) {
  const { visible, redemptionCode, voucherTitle, merchantName, branchName, onDone } = props
  const [screenshotBanner, setScreenshotBanner] = useState(false)
  const autoDismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const pollState = useRedemptionPolling(redemptionCode, { enabled: visible })
  useBrightnessBoost(visible)
  useScreenshotGuard(redemptionCode, {
    active: visible && pollState.phase !== 'validated',
    onBannerShown: useCallback(() => {
      setScreenshotBanner(true)
      setTimeout(() => setScreenshotBanner(false), 4_000)
    }, []),
  })

  const isValidated = pollState.phase === 'validated'
  const autoHide = useAutoHideTimer({ active: visible, frozen: isValidated })

  // When validation flips true: success haptic, start auto-dismiss timer.
  useEffect(() => {
    if (!isValidated) return
    successHaptic()
    autoDismissTimer.current = setTimeout(onDone, AUTO_DISMISS_MS)
    return () => {
      if (autoDismissTimer.current) clearTimeout(autoDismissTimer.current)
      autoDismissTimer.current = null
    }
  }, [isValidated, onDone])

  // Cancel auto-dismiss on user interaction with the validated surface.
  const cancelAutoDismiss = useCallback(() => {
    if (autoDismissTimer.current) {
      clearTimeout(autoDismissTimer.current)
      autoDismissTimer.current = null
    }
  }, [])

  if (!visible) return null

  const formatted = formatCode(redemptionCode)
  const blurred  = autoHide.state === 'hidden' && !isValidated

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <Pressable style={{ flex: 1 }} onPress={autoHide.resetTimer}>
        <LinearGradient
          colors={['#E20C04', '#C50A03', '#B80902', '#E84A00']}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={styles.container}
        >
          {screenshotBanner ? (
            <Animated.View entering={FadeIn} exiting={FadeOut} style={styles.screenshotBanner}>
              <Text variant="body.sm" color="inverse" style={{ textAlign: 'center' }}>
                Screenshots of this screen are logged. Sharing a redemption code with someone else may result in account review.
              </Text>
            </Animated.View>
          ) : null}

          {isValidated ? (
            <Pressable
              testID="validated-surface"
              style={styles.validatedSurface}
              onPress={cancelAutoDismiss}
            >
              <Animated.View entering={FadeIn.duration(200)} style={styles.validatedInner}>
                <View style={styles.tick}><Check size={48} color="#fff" /></View>
                <Text variant="display.md" color="inverse" style={styles.validatedTitle}>Validated ✓</Text>
                <Text variant="body.md" style={styles.validatedMeta}>{merchantName} · {branchName}</Text>
                <Pressable
                  onPress={() => { lightHaptic(); cancelAutoDismiss(); onDone() }}
                  accessibilityRole="button"
                  style={styles.doneButton}
                >
                  <Text variant="heading.sm" color="inverse">Done</Text>
                </Pressable>
              </Animated.View>
            </Pressable>
          ) : (
            <>
              <Text variant="heading.lg" color="inverse" style={styles.voucherTitle}>{voucherTitle}</Text>
              <Text variant="body.sm" style={styles.voucherMeta}>{merchantName} · {branchName}</Text>

              <View style={styles.codeCard}>
                <LivePill />
                <Text variant="display.lg" color="primary" style={styles.code}>{formatted}</Text>

                <View style={styles.qrWrap}>
                  {blurred ? (
                    <Pressable
                      onPress={autoHide.resetTimer}
                      accessibilityRole="button"
                      accessibilityLabel="Code hidden. Tap to show again."
                      style={styles.blurFallback}
                    >
                      <Text variant="body.md" color="primary">Tap to show again</Text>
                    </Pressable>
                  ) : (
                    <QRCodeBlock value={redemptionCode} size={240} hero />
                  )}
                </View>

                <View style={styles.clockDivider} />
                <LiveClock />

                <Text
                  variant="body.sm"
                  color="secondary"
                  accessibilityLiveRegion="polite"
                  style={styles.statusLine}
                >
                  {pollState.phase === 'timed-out'
                    ? 'Still waiting for staff to validate — you can ask them to scan again'
                    : autoHide.state === 'warning'
                      ? 'Screen will dim in 10s. Tap to keep showing.'
                      : 'Waiting for staff to validate…'}
                </Text>
              </View>
            </>
          )}
        </LinearGradient>
      </Pressable>
    </Modal>
  )
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingTop: 54, paddingHorizontal: 24, paddingBottom: 32, alignItems: 'center' },
  voucherTitle: { fontWeight: '800', textAlign: 'center', marginBottom: 4 },
  voucherMeta: { color: 'rgba(255,255,255,0.75)', textAlign: 'center', fontSize: 13, marginBottom: spacing[6] },
  codeCard: { width: '100%', backgroundColor: '#FFF', borderRadius: radius.xl, paddingVertical: 24, paddingHorizontal: 20, alignItems: 'center' },
  livePill: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: spacing[3] },
  liveDot:  { width: 7, height: 7, borderRadius: 3.5, backgroundColor: color.brandRose },
  liveText: { color: color.brandRose, fontWeight: '800', fontSize: 10 },
  code:     { fontWeight: '800', fontSize: 34, letterSpacing: 6, fontVariant: ['tabular-nums'], marginBottom: spacing[5] },
  qrWrap:   { alignItems: 'center', justifyContent: 'center', minHeight: 240 },
  blurFallback: { width: 240, height: 240, backgroundColor: 'rgba(0,0,0,0.04)', alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  clockDivider: { width: '100%', borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.border.subtle, marginTop: spacing[4], marginBottom: spacing[4] },
  clockText:    { fontWeight: '800', fontVariant: ['tabular-nums'] },
  statusLine:   { marginTop: spacing[3], textAlign: 'center' },
  screenshotBanner: { position: 'absolute', top: 54, left: 24, right: 24, backgroundColor: 'rgba(0,0,0,0.72)', padding: spacing[3], borderRadius: radius.md, zIndex: 10 },
  validatedSurface: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  validatedInner:   { alignItems: 'center' },
  tick: { width: 84, height: 84, borderRadius: 42, backgroundColor: '#16A34A', alignItems: 'center', justifyContent: 'center', marginBottom: spacing[4] },
  validatedTitle: { fontWeight: '800' },
  validatedMeta:  { color: 'rgba(255,255,255,0.85)', marginTop: 4 },
  doneButton: {
    marginTop: spacing[6],
    paddingVertical: 14, paddingHorizontal: 44,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.lg,
  },
})
```

Note: the previous version rendered `voucherType` badge and customer-info card. Keep them if they pass existing tests; the focus of this rewrite is the hook composition, QR, validated/blur/banner states, and a11y. Preserve any existing visible props (`voucherType`, `customerName`, `redeemedAt`) that downstream screens rely on — add them back visually after tests pass if needed.

- [ ] **Step 4: Run tests**

Real terminal: `cd apps/customer-app && npm test -- ShowToStaff`
Expected: all ShowToStaff tests pass (including existing ones if any).

- [ ] **Step 5: Manual smoke check**

Run the app (`npx expo start --ios` from `apps/customer-app`), navigate to a voucher, redeem, open Show to Staff. Verify: QR renders, code reads `K3F 9P7`, clock ticks, pulling down brightness is respected after exit. Take a screenshot on iOS — banner should appear once. Leave screen idle 2 minutes — blur appears.

- [ ] **Step 6: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/ShowToStaff.tsx \
        apps/customer-app/tests/features/voucher/components/ShowToStaff.test.tsx
git commit -m "feat(voucher): rewrite ShowToStaff with QR + polling + guards"
```

---

## Task 17: Rewrite `RedemptionDetailsCard.tsx` — QR + validated override + no stale cache

**Files:**
- Modify (rewrite): `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx`
- Test: `apps/customer-app/tests/features/voucher/components/RedemptionDetailsCard.test.tsx`

- [ ] **Step 1: Write failing tests**

Create `apps/customer-app/tests/features/voucher/components/RedemptionDetailsCard.test.tsx`:

```typescript
import React from 'react'
import { render } from '@testing-library/react-native'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { RedemptionDetailsCard } from '@/features/voucher/components/RedemptionDetailsCard'
import { redemptionApi } from '@/lib/api/redemption'

jest.mock('@/lib/api/redemption', () => ({
  redemptionApi: { getMyRedemptionByCode: jest.fn() },
}))

const wrap = (ui: React.ReactElement) => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('RedemptionDetailsCard', () => {
  beforeEach(() => jest.clearAllMocks())

  it('pre-validation: shows QR + formatted code', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: false, validatedAt: null, validationMethod: null,
      voucherId: 'v1', merchantName: 'Acme', branchName: 'Shoreditch',
    })
    const { findByText, getByLabelText } = wrap(
      <RedemptionDetailsCard redemptionCode="K3F9P7" branchName="Shoreditch" redeemedAt="2026-04-22T13:00:00Z" />
    )
    expect(await findByText('K3F 9P7')).toBeTruthy()
    expect(getByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeTruthy()
  })

  it('post-validation: hides QR and shows "Validated on ..." (from server state, not props)', async () => {
    ;(redemptionApi.getMyRedemptionByCode as jest.Mock).mockResolvedValue({
      code: 'K3F9P7', isValidated: true, validatedAt: '2026-04-22T14:00:00Z',
      validationMethod: 'QR_SCAN', voucherId: 'v1', merchantName: 'Acme', branchName: 'Shoreditch',
    })
    const { findByText, queryByLabelText } = wrap(
      <RedemptionDetailsCard redemptionCode="K3F9P7" branchName="Shoreditch" redeemedAt="2026-04-22T13:00:00Z" />
    )
    expect(await findByText(/Validated on/i)).toBeTruthy()
    expect(queryByLabelText('Redemption code. K, 3, F, 9, P, 7.')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test**

Real terminal: `cd apps/customer-app && npm test -- RedemptionDetailsCard`
Expected: FAIL.

- [ ] **Step 3: Rewrite the component**

Replace `apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx` with:

```typescript
import React from 'react'
import { View, StyleSheet } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Check } from 'lucide-react-native'
import { Text } from '@/design-system/Text'
import { color, spacing, radius, elevation } from '@/design-system/tokens'
import { redemptionApi, RedemptionStatusByCode } from '@/lib/api/redemption'
import { QRCodeBlock } from './QRCodeBlock'
import { formatCode } from '../utils/formatCode'

type Props = {
  redemptionCode: string
  branchName: string
  redeemedAt: string
}

export function RedemptionDetailsCard({ redemptionCode, branchName, redeemedAt }: Props) {
  const queryClient = useQueryClient()

  useFocusEffect(
    React.useCallback(() => {
      queryClient.invalidateQueries({ queryKey: ['redemption', 'by-code', redemptionCode] })
    }, [queryClient, redemptionCode])
  )

  const { data } = useQuery<RedemptionStatusByCode>({
    queryKey: ['redemption', 'by-code', redemptionCode],
    queryFn: () => redemptionApi.getMyRedemptionByCode(redemptionCode),
    refetchOnWindowFocus: true,
    refetchOnMount: 'always',
    staleTime: 0,
  })

  const redeemed = new Date(redeemedAt)
  const dateStr  = redeemed.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr  = redeemed.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })

  const isValidated = data?.isValidated === true
  const formatted   = formatCode(redemptionCode)

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={[styles.headerIcon, isValidated && { backgroundColor: '#16A34A' }]}>
          <Check size={14} color="#FFF" />
        </View>
        <View>
          <Text variant="heading.sm" color="primary" style={styles.title}>Redemption Details</Text>
          <Text variant="label.md" color="tertiary" style={styles.subtitle}>{dateStr} at {timeStr}</Text>
        </View>
      </View>

      <View style={styles.infoRows}>
        <InfoRow label="Code" value={formatted} mono />
        <InfoRow label="Branch" value={branchName} />
        <InfoRow label="Date" value={dateStr} />
        <InfoRow label="Time" value={timeStr} />
      </View>

      {isValidated ? (
        <View style={styles.validatedBlock}>
          <Check size={18} color="#16A34A" />
          <Text variant="body.sm" color="primary" style={styles.validatedText}>
            Validated on {data?.validatedAt ? new Date(data.validatedAt).toLocaleString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : ''}
          </Text>
        </View>
      ) : (
        <View style={styles.qrSection}>
          <Text variant="label.eyebrow" color="tertiary" style={styles.qrLabel}>Redemption QR Code</Text>
          <QRCodeBlock value={redemptionCode} size={80} />
        </View>
      )}
    </View>
  )
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text variant="label.md" color="tertiary" style={styles.rowLabel}>{label}</Text>
      <Text variant="label.lg" color="primary" style={[styles.rowValue, mono && styles.mono]}>{value}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  card: { marginHorizontal: 14, marginTop: spacing[4], backgroundColor: '#FFF', borderRadius: radius.xl, padding: spacing[5], ...elevation.sm },
  header: { flexDirection: 'row', alignItems: 'center', gap: spacing[3], marginBottom: spacing[4] },
  headerIcon: { width: 32, height: 32, borderRadius: 16, backgroundColor: color.brandRose, justifyContent: 'center', alignItems: 'center' },
  title:    { fontWeight: '800', fontSize: 15 },
  subtitle: { fontSize: 11 },
  infoRows: { gap: 8, marginBottom: spacing[4] },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  rowLabel: { fontSize: 12 },
  rowValue: { fontWeight: '700', fontSize: 12 },
  mono:     { fontWeight: '800', fontSize: 16, letterSpacing: 3, fontVariant: ['tabular-nums'] },
  qrSection: { borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.border.subtle, paddingTop: spacing[4], alignItems: 'center' },
  qrLabel:   { marginBottom: spacing[3], fontSize: 10 },
  validatedBlock: { flexDirection: 'row', alignItems: 'center', gap: spacing[2], borderTopWidth: 2, borderStyle: 'dashed', borderColor: color.border.subtle, paddingTop: spacing[4], justifyContent: 'center' },
  validatedText: { fontWeight: '600' },
})
```

- [ ] **Step 4: Run tests**

Real terminal: `cd apps/customer-app && npm test -- RedemptionDetailsCard`
Expected: PASS.

Run the full frontend voucher suite: `npm test -- features/voucher`
Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add apps/customer-app/src/features/voucher/components/RedemptionDetailsCard.tsx \
        apps/customer-app/tests/features/voucher/components/RedemptionDetailsCard.test.tsx
git commit -m "feat(voucher): RedemptionDetailsCard — QR + validated override + refetch on focus"
```

---

## Task 18: Final sweep

- [ ] **Step 1: Run entire backend suite**

Run: `npx vitest run`
Expected: all pass. If anything fails, the cause is in one of tasks 1–7 — fix it before proceeding.

- [ ] **Step 2: Run entire frontend suite**

Real terminal: `cd apps/customer-app && npm test`
Expected: all pass. Same triage rule — failures trace back to tasks 8–17.

- [ ] **Step 3: TypeScript check (both sides)**

```bash
npx tsc --noEmit                                 # backend
cd apps/customer-app && npx tsc --noEmit         # frontend
```
Expected: no errors.

- [ ] **Step 4: ESLint**

```bash
npx eslint src/api/redemption
cd apps/customer-app && npx eslint src/features/voucher src/lib/api/redemption.ts
```
Expected: no errors.

- [ ] **Step 5: Manual QA checklist**

On a real iPhone via Expo Go or dev build (not simulator — screenshot + brightness APIs require hardware):

- Redeem a voucher → Show to Staff screen opens.
- QR scans successfully with a standard QR reader app (proves the encoded value round-trips).
- Code text reads `K3F 9P7` (6-char) or `AB3F9 K2P7Q` (legacy 10-char).
- Screen brightness jumps to 100% on open, restores on close.
- Take a screenshot on iOS → warning banner appears once. Take another within 5s → no second banner. Wait 6s, take another → banner reappears.
- Leave screen idle for 1:50 → "Screen will dim in 10s" status line appears. Wait another 10s → QR blurs, tap to restore.
- Validate the code manually (via merchant portal or direct DB update) while Show to Staff is open → within 5 seconds the screen transitions to Validated ✓ and auto-dismisses after 4s. If you tap the screen during Validated, auto-dismiss cancels and stays until you tap Done.
- Navigate to Redemption Details Card after validation → card shows "Validated on ..." with QR hidden.

- [ ] **Step 6: Commit only if anything needed fixing**

```bash
git commit -am "chore(voucher): final cleanups from QA sweep"
```

(Skip if no changes were required.)

---

## Out of plan (deferred)

These are explicitly NOT in this plan; they live in the spec's §10 "Out of scope":

- Admin review UI for screenshot flags (Phase 5)
- Multi-device exclusivity
- Scanner-compatibility fallback toggle
- Self-hosted monospace font
- Admin unvalidate flow
- i18n
- Rendering brand-red finder patterns (requires lib replacement — treat as visual polish pass)
- UI treatment of `validationMethod` (kept in backend payload for future use, not displayed this phase)
