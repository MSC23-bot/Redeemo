# Redemption System Design

> **Status:** Approved — ready for implementation planning

---

## 1. Overview

The redemption system enables subscribed customers to redeem vouchers at merchant branches. Redemption is in-store only: the customer enters a branch-specific PIN in the app, which triggers the backend to validate eligibility and create a `VoucherRedemption` record. The PIN authorises the customer's redemption — it does not constitute merchant-side validation. An optional second step allows branch staff to verify the redemption by scanning a QR code or entering the redemption code; only this step sets `isValidated = true`.

The system enforces Redeemo's core business rule: **one redemption per user per voucher per billing cycle, across all branches of the owning merchant.**

---

## 2. Architecture

### 2.1 New files

| File | Responsibility |
|---|---|
| `src/api/redemption/service.ts` | Business logic: guard checks, atomic redemption creation, cycle state update |
| `src/api/redemption/routes.ts` | Customer-facing HTTP routes |
| `src/api/redemption/plugin.ts` | Fastify plugin registration |
| `src/api/shared/encryption.ts` | AES-256-GCM encrypt/decrypt utility for branch PINs |

### 2.2 Modified files

| File | Change |
|---|---|
| `prisma/schema.prisma` | Add `Branch.redemptionPin String?` (stores AES-256-GCM ciphertext) |
| `src/api/merchant/branch/service.ts` | Add PIN get/set/send logic |
| `src/api/merchant/branch/routes.ts` | Add PIN management endpoints and branch redemption list |

### 2.3 Data flow — customer redemption

```
Customer app
  │ POST /redemption { voucherId, branchId, pin }
  ▼
Auth middleware (requires role=customer, active JWT)
  ▼
redemption/service.ts → createRedemption()
  ├─ Decrypt branch.redemptionPin; compare with submitted pin
  ├─ Guard: subscription ACTIVE or TRIALLING
  ├─ Guard: voucher isActive && merchant.status == APPROVED
  ├─ Guard: branch belongs to voucher's merchant
  ├─ Guard: UserVoucherCycleState.isRedeemedInCurrentCycle == false
  ├─ prisma.$transaction([
  │    VoucherRedemption.create (isValidated=false, validationMethod=null),
  │    userVoucherCycleState.upsert (isRedeemedInCurrentCycle = true)
  │  ])
  └─ Return VoucherRedemption with redemptionCode
```

### 2.4 Data flow — optional merchant verification

```
Branch staff app
  │ POST /redemption/verify { code, method }
  ▼
Auth middleware (requires role=branch_staff OR merchant_admin)
  ▼
redemption/service.ts → verifyRedemption()
  ├─ Find VoucherRedemption by redemptionCode
  ├─ Guard: not already validated (isValidated == false)
  ├─ Guard (branch_staff): redemption.branchId == caller's assigned branchId
  ├─ Guard (merchant_admin): voucher's merchantId == caller's merchantId
  ├─ VoucherRedemption.update (isValidated=true, validatedAt, validationMethod, validatedById)
  └─ Return updated VoucherRedemption (customer name only — no email/phone)
```

---

## 3. Schema Changes

### 3.1 Branch.redemptionPin

```prisma
model Branch {
  // existing fields...
  redemptionPin  String?   // AES-256-GCM encrypted 4-digit PIN; null until owner sets it
}
```

No other schema changes are required. `VoucherRedemption`, `UserVoucherCycleState`, `SubscriptionStatus` are already defined.

### 3.2 Existing models used as-is

- `VoucherRedemption`: `id`, `userId`, `voucherId`, `branchId`, `redemptionCode` (unique), `redeemedAt`, `isValidated`, `validatedAt`, `validationMethod`, `validatedById`
- `UserVoucherCycleState`: unique on `(userId, voucherId)` — cycle enforcement table
- `Subscription.status`: checked against `ACTIVE | TRIALLING`

---

## 4. Encryption

### 4.1 AES-256-GCM

File: `src/api/shared/encryption.ts`

- Algorithm: AES-256-GCM (authenticated encryption — provides integrity + confidentiality)
- Key: `process.env.ENCRYPTION_KEY` — 32-byte hex string (64 hex chars), required at startup
- Stored format: `iv:authTag:ciphertext` (all hex-encoded, colon-separated) stored in `Branch.redemptionPin`
- IV: 12 random bytes, generated fresh per encrypt call
- Auth tag: 16 bytes (GCM default)

```typescript
// src/api/shared/encryption.ts
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const KEY = Buffer.from(process.env.ENCRYPTION_KEY!, 'hex') // 32 bytes

export function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALGORITHM, KEY, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const authTag = cipher.getAuthTag()
  return [iv.toString('hex'), authTag.toString('hex'), ciphertext.toString('hex')].join(':')
}

export function decrypt(stored: string): string {
  const [ivHex, authTagHex, ciphertextHex] = stored.split(':')
  const iv = Buffer.from(ivHex, 'hex')
  const authTag = Buffer.from(authTagHex, 'hex')
  const ciphertext = Buffer.from(ciphertextHex, 'hex')
  const decipher = crypto.createDecipheriv(ALGORITHM, KEY, iv)
  decipher.setAuthTag(authTag)
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8')
}
```

### 4.2 PIN comparison

PINs are 4 numeric digits. Comparison is timing-safe string equality after decryption:

```typescript
import crypto from 'crypto'
const valid = crypto.timingSafeEqual(
  Buffer.from(decrypt(branch.redemptionPin!)),
  Buffer.from(submittedPin)
)
```

---

## 5. API Endpoints

### 5.1 Customer endpoints

#### `POST /api/v1/redemption`

Redeem a voucher. Requires active subscription.

**Auth:** `role=customer`

**Request body:**
```json
{ "voucherId": "string", "branchId": "string", "pin": "string" }
```

**Guards (in order):**
1. Branch exists and `branch.redemptionPin` is set (PIN configured)
2. PIN matches (timing-safe comparison after decryption)
3. Subscription status is `ACTIVE` or `TRIALLING`
4. Voucher `isActive = true` and merchant `status = APPROVED`
5. Branch belongs to the same merchant as the voucher
6. `UserVoucherCycleState.isRedeemedInCurrentCycle = false` for `(userId, voucherId)`

**On success:** Prisma transaction:
- `VoucherRedemption.create` with `redemptionCode = nanoid(10)` (alphanumeric), `isValidated = false`, `validationMethod = null`
- `UserVoucherCycleState.upsert` setting `isRedeemedInCurrentCycle = true`

**Response `201`:**
```json
{
  "id": "string",
  "redemptionCode": "string",
  "voucherId": "string",
  "branchId": "string",
  "redeemedAt": "ISO8601",
  "isValidated": false
}
```

**Error codes:**
| Code | HTTP | Condition |
|---|---|---|
| `PIN_NOT_CONFIGURED` | 400 | Branch has no PIN set |
| `INVALID_PIN` | 400 | PIN does not match (after decryption) |
| `SUBSCRIPTION_REQUIRED` | 403 | Subscription not active |
| `VOUCHER_NOT_FOUND` | 404 | Voucher not active or not found |
| `BRANCH_MERCHANT_MISMATCH` | 400 | Branch does not belong to voucher's merchant |
| `ALREADY_REDEEMED` | 409 | Already redeemed in current cycle |

---

#### `GET /api/v1/redemption/my`

List the current user's redemptions. Returns 10 most recent by default.

**Auth:** `role=customer`

**Query params:** `?limit=10&offset=0`

**Response `200`:**
```json
[
  {
    "id": "string",
    "redemptionCode": "string",
    "redeemedAt": "ISO8601",
    "isValidated": true,
    "voucher": { "id": "string", "title": "string", "merchant": { "name": "string", "logoUrl": "string" } },
    "branch": { "id": "string", "name": "string" }
  }
]
```

---

#### `GET /api/v1/redemption/my/:id`

Get detail for a single redemption (shows redemption code + QR data).

**Auth:** `role=customer`

**Guards:** Redemption must belong to the authenticated user.

**Response `200`:**
```json
{
  "id": "string",
  "redemptionCode": "string",
  "redeemedAt": "ISO8601",
  "isValidated": true,
  "validatedAt": "ISO8601 | null",
  "voucher": { "id": "string", "title": "string", "terms": "string", "merchant": { "name": "string" } },
  "branch": { "id": "string", "name": "string", "address": "string" }
}
```

---

### 5.2 Branch staff / merchant admin endpoints

#### `POST /api/v1/redemption/verify`

Mark a redemption as validated. Used by branch staff after scanning QR or reading code.

**Auth:** `role=branch_staff OR merchant_admin`

**Request body:**
```json
{ "code": "string", "method": "QR_SCAN | MANUAL_ENTRY" }
```

**Guards:**
1. `VoucherRedemption` found by `redemptionCode`
2. Not already validated (`isValidated = false`)
3. If `role=branch_staff`: `redemption.branchId` must equal the caller's assigned `branchId`
4. If `role=merchant_admin`: the voucher's `merchantId` must equal the caller's `merchantId`

**Response `200`:**
```json
{
  "id": "string",
  "isValidated": true,
  "validatedAt": "ISO8601",
  "validationMethod": "QR_SCAN | MANUAL_ENTRY",
  "customer": { "name": "string" }
}
```

**Note:** `customer` returns `name` only — no email or phone. GDPR-safe default.

**Error codes:**
| Code | HTTP | Condition |
|---|---|---|
| `REDEMPTION_NOT_FOUND` | 404 | Code not found |
| `ALREADY_VALIDATED` | 409 | Already validated |
| `MERCHANT_MISMATCH` | 403 | Code belongs to different merchant |

---

#### `GET /api/v1/branch/:branchId/redemptions`

Paginated list of redemptions for a branch. Used by branch staff and merchant admin for reconciliation.

**Auth:** `role=branch_staff (own branch only) OR merchant_admin (any branch in merchant)`

**Query params:** `?limit=20&offset=0&from=ISO8601&to=ISO8601`

**Response `200`:**
```json
{
  "total": 142,
  "items": [
    {
      "id": "string",
      "redemptionCode": "string",
      "redeemedAt": "ISO8601",
      "isValidated": true,
      "validatedAt": "ISO8601 | null",
      "validationMethod": "string | null",
      "customer": { "name": "string" },
      "voucher": { "id": "string", "title": "string" }
    }
  ]
}
```

---

### 5.3 PIN management endpoints

#### `GET /api/v1/merchant/branch/:branchId/pin`

Returns the branch's current decrypted PIN. For merchant owner/admin use only.

**Auth:** `role=merchant_admin`, branch must belong to caller's merchant.

**Response `200`:**
```json
{ "pin": "1234" }
```

Returns `{ "pin": null }` if no PIN set yet.

---

#### `PUT /api/v1/merchant/branch/:branchId/pin`

Set or update the branch PIN.

**Auth:** `role=merchant_admin`

**Request body:**
```json
{ "pin": "1234" }
```

**Validation:** exactly 4 numeric digits (`/^\d{4}$/`)

**Response `200`:**
```json
{ "message": "PIN updated" }
```

---

#### `POST /api/v1/merchant/branch/:branchId/pin/send`

Send the branch PIN to branch staff via available contact channels.

**Auth:** `role=merchant_admin`

**Behaviour:** Looks up all `BranchUser` records for the branch. For each staff member:
- If the branch has a registered email address, send PIN via email (Resend)
- If the branch has a registered phone number, send PIN via SMS (Twilio)
- If both are available, send via both channels

Fire-and-forget — does not fail the request if a delivery attempt fails (logs error instead).

**Response `200`:**
```json
{ "message": "PIN sent to branch staff" }
```

---

## 6. Rate Limiting

The `POST /api/v1/redemption` endpoint is brute-force protected:

- **Limit:** 5 failed PIN attempts per `(userId, branchId)` pair per 15 minutes
- **Key:** `pin:fail:{userId}:{branchId}` — scoped to a specific branch so failures at one branch do not block the user from redeeming at a different branch
- **Implementation:** Redis counter with TTL — increment on `INVALID_PIN`, reset on successful redemption
- **On limit exceeded:** HTTP 429 with error code `PIN_RATE_LIMIT_EXCEEDED`
- **Check order:** rate limit is checked immediately after the PIN mismatch is detected, before any other guard

Implemented inside `createRedemption()` in service.ts using `app.redis`.

---

## 7. Business Rules Summary

| Rule | Enforcement point |
|---|---|
| One redemption per user per voucher per billing cycle | `UserVoucherCycleState.isRedeemedInCurrentCycle` checked before, set in atomic transaction |
| Cycle is subscription-based, not calendar-based | Handled by existing webhook cycle reset logic (`invoice.payment_succeeded`) |
| Redemption is merchant-scoped (all branches) | `UserVoucherCycleState` keyed on `(userId, voucherId)` — not per-branch |
| Branch is attribution and context only | `VoucherRedemption.branchId` recorded; guards check branch belongs to voucher's merchant |
| Redemption requires active subscription | `ACTIVE` or `TRIALLING` status only |
| PIN is branch-level, 4 digits, static | No auto-rotation; owner can change; stored AES-256-GCM encrypted |
| PIN authorises customer redemption only | Successful PIN entry creates `VoucherRedemption` with `isValidated=false`; PIN does not constitute merchant validation |
| Merchant verification is optional | Only `POST /redemption/verify` (QR scan or manual entry by branch staff/admin) sets `isValidated=true` |
| Branch staff see customer name only | `verifyRedemption` and `GET /branch/redemptions` return `customer: { name }` only |
| Website does NOT redeem | Redemption route is mobile-only (no website integration needed in this phase) |

---

## 8. Error Codes (full list)

All errors use the project's `AppError` class and return `{ error: { code, message } }`.

| Code | HTTP | Description |
|---|---|---|
| `PIN_NOT_CONFIGURED` | 400 | Branch has not set a PIN |
| `INVALID_PIN` | 400 | Submitted PIN does not match stored PIN |
| `PIN_RATE_LIMIT_EXCEEDED` | 429 | Too many failed PIN attempts |
| `SUBSCRIPTION_REQUIRED` | 403 | Subscription not active or trialling |
| `VOUCHER_NOT_FOUND` | 404 | Voucher inactive, not found, or merchant not approved |
| `BRANCH_NOT_FOUND` | 404 | Branch does not exist |
| `BRANCH_MERCHANT_MISMATCH` | 400 | Branch does not belong to voucher's merchant |
| `ALREADY_REDEEMED` | 409 | Already redeemed this voucher in current cycle |
| `REDEMPTION_NOT_FOUND` | 404 | Redemption code not found |
| `ALREADY_VALIDATED` | 409 | Redemption already validated |
| `MERCHANT_MISMATCH` | 403 | Redemption code belongs to different merchant |
| `INVALID_PIN_FORMAT` | 400 | PIN is not exactly 4 numeric digits |
| `BRANCH_ACCESS_DENIED` | 403 | branch_staff attempting to access or verify a redemption for a branch they are not assigned to |

---

## 9. Testing Strategy

### Unit tests (`tests/api/redemption/service.test.ts`)

Cover each guard in `createRedemption`:
- Returns `PIN_NOT_CONFIGURED` when branch has no PIN
- Returns `INVALID_PIN` when PIN does not match
- Returns `SUBSCRIPTION_REQUIRED` when subscription inactive
- Returns `VOUCHER_NOT_FOUND` when voucher inactive
- Returns `BRANCH_MERCHANT_MISMATCH` when branch is from different merchant
- Returns `ALREADY_REDEEMED` when `isRedeemedInCurrentCycle = true`
- Succeeds: creates `VoucherRedemption` and updates `UserVoucherCycleState` atomically
- Increments Redis rate-limit counter keyed on `(userId, branchId)` on PIN failure
- Resets Redis counter on successful redemption
- Returns `PIN_RATE_LIMIT_EXCEEDED` at 5 failures within 15 minutes
- PIN failure at branch A does not affect rate limit for branch B

Cover `verifyRedemption`:
- Returns `REDEMPTION_NOT_FOUND` for unknown code
- Returns `ALREADY_VALIDATED` for already-verified redemption
- Returns `MERCHANT_MISMATCH` when merchant_admin's merchantId does not match voucher's merchantId
- Returns `BRANCH_ACCESS_DENIED` when branch_staff's branchId does not match redemption.branchId
- Succeeds: sets `isValidated=true`, `validatedAt`, `validationMethod`, `validatedById`
- Response contains customer name only (no email, no phone)
- Successful PIN entry creates VoucherRedemption with `isValidated=false` (PIN does not validate)

### Unit tests (`tests/api/merchant/branch/service.test.ts` — additions)

- `getPin`: returns decrypted PIN; returns null when no PIN set
- `setPin`: validates format, encrypts, persists
- `sendPin`: calls Twilio for each BranchUser; does not throw on Twilio error

### Unit tests (`src/api/shared/encryption.test.ts`)

- `encrypt` → `decrypt` round-trip produces original value
- Two `encrypt` calls on same input produce different ciphertexts (IV randomness)
- Tampered ciphertext throws on `decrypt` (GCM auth tag validation)

### Route integration tests (`tests/api/redemption/routes.test.ts`)

- `POST /redemption` returns 201 on valid input (mocked service)
- `POST /redemption` returns 401 without token
- `GET /redemption/my` returns 200 list for authenticated customer
- `GET /redemption/my/:id` returns 200 for own redemption, 403 for another user's
- `POST /redemption/verify` returns 200 for branch_staff role
- `POST /redemption/verify` returns 403 for customer role
- `GET /branch/:branchId/redemptions` returns 200 paginated list
- `GET /branch/:branchId/redemptions` returns 403 when staff accesses wrong branch

---

## 10. Out of Scope (this phase)

- Rate & review system (deferred; `VoucherRedemption.redeemedAt` is sufficient for future use)
- Structured/predefined voucher terms with icons (free-text `terms` field only)
- QR code image generation (redemption code is the payload; QR rendering is client-side)
- Push notifications on redemption or verification
- Analytics aggregation endpoints
- Website redemption (mobile only)
