# Phase 2A + 2B: Auth System + API Structure — Design Spec

**Date:** 2026-04-08
**Phase:** 2A (Auth) + 2B (API Structure)
**Status:** In Review (v3 — BranchUser provisioning, branch PIN, Quick Validate, merchant deactivation, PDF alignment)

---

## Goal

Build the foundational backend API for Redeemo: a single Fastify server with four isolated auth plugins (one per identity type), JWT + refresh token auth with persistent mobile sessions, Redis-backed permission caching, device/session tracking, single active customer mobile session enforcement, SMS OTP via Twilio, Google/Apple SSO for customers, and full audit logging. This is the foundation all subsequent API phases (2C Merchant/Voucher, 2D Subscriptions, 2E Redemption) will sit on.

---

## Architecture Overview

### Single Fastify Server

One Node.js 24 + TypeScript server located in `src/api/`. Deployed independently from Next.js frontends.

```
src/
  api/
    server.ts               # Fastify instance, plugin registration, start
    app.ts                  # App factory (used by server.ts and tests)
    plugins/
      prisma.ts             # Prisma client singleton plugin
      redis.ts              # Redis client plugin
      cors.ts               # CORS config
      rate-limit.ts         # Global + per-route rate limiting
    auth/
      customer/
        plugin.ts           # JWT setup, authenticateCustomer middleware
        routes.ts           # /api/v1/customer/auth/* routes
        service.ts          # Login, register, refresh, OTP, SSO, session logic
      merchant/
        plugin.ts           # JWT setup, authenticateMerchant middleware
        routes.ts           # /api/v1/merchant/auth/* routes
        service.ts
      branch/
        plugin.ts           # JWT setup, authenticateBranch middleware
        routes.ts           # /api/v1/branch/auth/* routes
        service.ts
      admin/
        plugin.ts           # JWT setup, authenticateAdmin middleware
        routes.ts           # /api/v1/admin/auth/* routes
        service.ts
    shared/
      errors.ts             # AppError class, all error codes
      otp.ts                # Twilio OTP send/verify
      password.ts           # bcrypt hash/compare, policy validation
      tokens.ts             # JWT sign/verify, refresh token helpers
      redis-keys.ts         # Centralised Redis key patterns
      schemas.ts            # Shared Zod schemas (email, password, phone)
      audit.ts              # Audit log write helper
  index.ts                  # Entry point
```

### Route Namespacing

All routes versioned and namespaced by identity:

| Namespace | Identity | Auth routes |
|---|---|---|
| `/api/v1/customer/auth` | User (customer) | register, verify-email, verify-phone, login, refresh, otp, sso/google, sso/apple, logout, forgot-password, reset-password, change-email, change-phone, delete-account |
| `/api/v1/merchant/auth` | MerchantAdmin | login, refresh, otp, logout, forgot-password, reset-password, deactivate, reactivate |
| `/api/v1/merchant/branches/:branchId/user` | BranchUser management (by MerchantAdmin) | create, reset-password, deactivate, reactivate |
| `/api/v1/merchant/branches/:branchId/pin` | Branch PIN (by MerchantAdmin) | set/change redemption PIN |
| `/api/v1/merchant/redemptions/:redemptionId/quick-validate` | Quick Validate (by MerchantAdmin) | validate a redemption without QR/code |
| `/api/v1/branch/auth` | BranchUser | login, refresh, logout, change-password, change-password-first-login |
| `/api/v1/admin/auth` | AdminUser | login, refresh, otp, logout |

---

## Auth Plugins — Isolation

Each identity type gets its own Fastify plugin:

- **Separate JWT secrets** — `JWT_SECRET_CUSTOMER`, `JWT_SECRET_MERCHANT`, `JWT_SECRET_BRANCH`, `JWT_SECRET_ADMIN`. A customer token cannot be accepted on merchant routes.
- **Separate `authenticate` decorators** — `fastify.authenticateCustomer`, `fastify.authenticateMerchant`, `fastify.authenticateBranch`, `fastify.authenticateAdmin`.
- **No identity leak in errors** — presenting the wrong token type returns `401 Unauthorized` with no hint about what was expected.

---

## Password Policy

Applies to all identity types (customer, merchant admin, branch user, admin user):

- Minimum 8 characters
- At least one uppercase letter (A–Z)
- At least one lowercase letter (a–z)
- At least one digit (0–9)
- At least one special character (`!@#$%^&*()_+-=[]{}|;':\",./<>?`)

Validated server-side on registration, password reset, and password change. The Zod schema in `shared/schemas.ts` enforces this. Client-side validation mirrors it but is not trusted.

**BranchUser passwordHash:** `passwordHash` is `String` (non-nullable) on BranchUser. BranchUser has no SSO — they are always created with a password set by the MerchantAdmin. `passwordHash` is only nullable on `MerchantAdmin` (to support Google/Apple SSO accounts).

---

## Customer Verification Model

Customer registration is a **two-step verification flow**. The account is not active until both email and phone are verified.

### Step 1 — Email Verification

1. Customer submits registration form (email, password, first name, last name)
2. Server validates email uniqueness and password policy
3. Creates `User` with `emailVerified: false`, `phoneVerified: false`, `isActive: false`
4. Sends verification email via Resend with a unique token (random 32-byte hex, stored in Redis `email-verify:{token}` → `userId`, TTL 24 hours)
5. Customer clicks link → `GET /api/v1/customer/auth/verify-email?token=...`
6. Server validates token, sets `emailVerified: true` on User, deletes token from Redis
7. Response: `{ message: 'Email verified. Please verify your phone number to complete registration.' }`

### Step 2 — Phone Verification

1. After email verified, customer submits phone number
2. `POST /api/v1/customer/auth/verify-phone/send` — server sends 6-digit OTP via Twilio Verify to phone number
3. `POST /api/v1/customer/auth/verify-phone/confirm` — customer submits code
4. On success: sets `phoneVerified: true`, `isActive: true`, `phoneNumber` on User
5. Account is now fully active — customer can log in

### Registration Constraints

- Account cannot log in until both `emailVerified: true` AND `phoneVerified: true`
- Email token expires after 24 hours — customer can request a resend (`POST /api/v1/customer/auth/resend-verification-email`)
- Phone OTP: 6-digit, 10-minute expiry, max 3 attempts, max 3 sends per phone per hour
- If a phone number is already associated with a verified account → reject with `PHONE_ALREADY_EXISTS`
- SSO registrations (Google/Apple): email is pre-verified by the provider, phone verification still required after SSO

### Newsletter / Marketing Consent

- Registration form includes `marketingConsent: boolean` field (opt-in, default false)
- Stored on `User.marketingConsent`
- Timestamp stored in `User.marketingConsentAt` when consent is given
- Consent can be updated via account settings at any time
- This is GDPR consent — timestamped, explicit, revocable

---

## Session Architecture

### JWT Access Tokens

- **Payload:** `{ sub: string (entity ID), role: 'customer' | 'merchant' | 'branch' | 'admin', deviceId: string, sessionId: string, iat, exp }`
- **Expiry:** 15 minutes
- **Signed with:** identity-specific secret

### Refresh Tokens (Persistent Sessions)

- **Format:** cryptographically random 64-byte hex string (not JWT)
- **Stored in Redis:** `refresh:{role}:{entityId}:{sessionId}` → `{ refreshTokenHash, deviceId, deviceType, deviceName, lastUsedAt, createdAt }`, TTL = 90 days
- **Rotation:** each `/auth/refresh` call validates the refresh token, deletes the old Redis key, issues a new access token + new refresh token with the same `sessionId`
- **Persistent login:** refresh tokens are long-lived (90 days). The mobile app stores the refresh token in secure storage (Keychain on iOS, Keystore on Android). As long as the refresh token is valid, the user does not need to re-enter credentials on app launch — the app silently exchanges the refresh token for a new access token.
- **Re-login required only if:** explicit logout, session revoked by security event, password reset, account suspended/deleted

### Session Tracking

Every session is recorded in the `UserSession` table in Postgres (new model — see Data Model Additions below):

```
UserSession {
  id           String   @id
  entityId     String   # userId, merchantAdminId, branchUserId, or adminUserId
  entityType   String   # 'customer' | 'merchant' | 'branch' | 'admin'
  sessionId    String   @unique
  deviceId     String
  deviceType   String   # 'ios' | 'android' | 'web'
  deviceName   String?  # e.g. "iPhone 15 Pro"
  ipAddress    String
  userAgent    String
  createdAt    DateTime
  lastActiveAt DateTime
  revokedAt    DateTime?
  revokedReason String?
}
```

On each token refresh: update `lastActiveAt` in `UserSession`.

### Single Active Customer Mobile Session

**Rule:** A customer may have only ONE active mobile session at any time (one iOS or Android device logged in). They may additionally have one active web session (website is treated separately).

**How it works:**

- When a customer logs in from a mobile device (`deviceType: 'ios' | 'android'`):
  1. Look up all existing active mobile sessions for this customer in Redis (`sessions:mobile:customer:{userId}`)
  2. If one exists → revoke it immediately (delete its refresh token from Redis, mark `UserSession.revokedAt` with reason `SUPERSEDED_BY_NEW_LOGIN`, write audit log)
  3. Issue new session, store new refresh token, write new `UserSession` record
- Web sessions (`deviceType: 'web'`) are independent — a customer can be logged in on mobile + web simultaneously
- Merchant and admin sessions have no single-session restriction (multi-device is operationally necessary for merchants with multiple staff)
- BranchUser sessions: one active session per branch user (same rule as customer mobile) — branch staff should not share credentials across devices

**Device fingerprint:** The client sends a `deviceId` (UUID generated and stored locally on first app launch) and `deviceType` in the login request body. The server does not generate the deviceId — it trusts what the client sends, but logs it for tracking.

---

## Redis Permission Cache

On successful login, cache identity state for fast middleware lookups:

| Identity | Cached fields | Redis key | TTL |
|---|---|---|---|
| Customer | `subscriptionStatus`, `subscriptionPlan`, `cycleStart`, `cycleEnd`, `isActive`, `phoneVerified` | `auth:customer:{userId}` | 1 hour |
| MerchantAdmin | `merchantId`, `approvalStatus`, `isSuspended`, `merchantName` | `auth:merchant:{merchantAdminId}` | 1 hour |
| BranchUser | `merchantId`, `branchId`, `isActive`, `isMerchantSuspended` | `auth:branch:{branchUserId}` | 1 hour |
| AdminUser | `adminRole` | `auth:admin:{adminUserId}` | 1 hour |

Cache invalidated on:
- Subscription status change (Stripe webhook)
- Merchant approval, suspension, or reactivation (admin action)
- BranchUser deactivation or reactivation
- Password reset completion
- Email or phone change
- Account deletion
- Manual logout

`authenticate` middleware: reads Redis first. On cache miss, fetches from Postgres and repopulates. DB hit only on first request post-login or post-expiry.

---

## Auth Flows

### Customer Registration

1. `POST /api/v1/customer/auth/register` — `{ email, password, firstName, lastName, marketingConsent }`
2. Validate password policy, email uniqueness
3. Hash password (bcrypt cost 12), create `User` (`emailVerified: false`, `phoneVerified: false`, `isActive: false`)
4. Send verification email (Resend), store token in Redis (24h TTL)
5. Return `{ message: 'Check your email to verify your account.' }`

### Customer Email Verification

1. `GET /api/v1/customer/auth/verify-email?token=...`
2. Validate token from Redis, set `emailVerified: true`, delete token
3. Return `{ message: 'Email verified. Please add and verify your phone number.' }`

### Customer Phone Verification

1. `POST /api/v1/customer/auth/verify-phone/send` — `{ phoneNumber }` (requires emailVerified)
2. Check phone not already used by another verified account
3. Send OTP via Twilio Verify, store rate limit counter in Redis
4. `POST /api/v1/customer/auth/verify-phone/confirm` — `{ phoneNumber, code }`
5. Verify OTP, set `phoneVerified: true`, `isActive: true`, store `phoneNumber` on User
6. Return `{ message: 'Phone verified. Your account is now active.' }`

### Customer Login (Email + Password)

1. `POST /api/v1/customer/auth/login` — `{ email, password, deviceId, deviceType, deviceName? }`
2. Lookup User, compare password hash
3. Check `isActive` — if false, return `403 ACCOUNT_NOT_ACTIVE` (not yet verified)
4. Check account not locked
5. Enforce single mobile session rule (revoke previous mobile session if exists)
6. Issue access token + refresh token, write `UserSession`, populate Redis cache
7. Write audit log: `AUTH_LOGIN_SUCCESS`
8. Return `{ accessToken, refreshToken, user: { id, email, firstName } }`

### Customer SSO (Google / Apple)

1. `POST /api/v1/customer/auth/sso/google` or `/sso/apple` — `{ idToken, deviceId, deviceType, deviceName? }`
2. Verify idToken with Google/Apple public keys
3. Lookup User by `ssoId` + `ssoProvider`
   - **Existing user:** proceed to login
   - **New user:** create User with `emailVerified: true`, `phoneVerified: false`, `isActive: false`, then require phone verification before login tokens are issued
4. For new SSO users: return `{ status: 'PHONE_VERIFICATION_REQUIRED', tempToken }` — tempToken is a short-lived Redis key allowing them to submit phone verification without a password
5. After phone verified: issue full access + refresh tokens, same as email login
6. Write audit log: `AUTH_SSO_LOGIN_SUCCESS`

### Customer OTP (for sensitive account actions)

Used for: email change, phone change, account deletion — not for login itself.

1. `POST /api/v1/customer/auth/otp/send` — sends 6-digit code to verified phone via Twilio
2. Redis key: `otp:customer:{userId}:action:{actionType}` → `{ code, attempts: 0 }`, TTL 10 minutes
3. `POST /api/v1/customer/auth/otp/verify` — `{ code, actionType }`
4. Wrong code → increment attempts. At 3 → lock for 5 minutes
5. On success → return `{ verified: true, actionToken }` — actionToken (Redis, 5-minute TTL) authorises the specific sensitive action

### Merchant Admin Login

1. `POST /api/v1/merchant/auth/login` — `{ email, password, deviceId, deviceType }`
2. Lookup MerchantAdmin, compare password
3. Check merchant not suspended (`MERCHANT_SUSPENDED` → `403`)
4. **OTP required in these cases:**
   - First login after account creation (flag: `otpVerifiedAt IS NULL`)
   - Login after a password reset
   - Login from a new device (deviceId not seen before for this account)
   - Login flagged as suspicious (IP country change, unusual hour — Phase 2 basic; full anomaly detection is future scope)
5. If OTP required: return `{ status: 'OTP_REQUIRED', sessionChallenge }` — no tokens yet
6. `POST /api/v1/merchant/auth/otp/verify` — verifies OTP, completes login, issues tokens
7. Populate Redis cache, write `UserSession`, write audit log: `AUTH_LOGIN_SUCCESS`
8. Return `{ accessToken, refreshToken, merchant: { id, businessName, approvalStatus } }`

### Branch User Login

1. `POST /api/v1/branch/auth/login` — `{ email, password, deviceId, deviceType }`
2. Lookup BranchUser, compare password (never nullable — always set by MerchantAdmin)
3. Check `isActive` — if false, return `403 BRANCH_USER_DEACTIVATED`
4. Check parent merchant not suspended — if suspended, return `403 MERCHANT_SUSPENDED`
5. Check `mustChangePassword` — if true, do **not** issue full tokens. Return `{ status: 'PASSWORD_CHANGE_REQUIRED', tempToken }` (tempToken stored in Redis, 30-min TTL). BranchUser must complete forced password change before access granted.
6. Enforce single-session rule (revoke previous session if exists)
7. Issue tokens, write `UserSession`, populate Redis cache
8. Write audit log: `AUTH_LOGIN_SUCCESS` (with `branchId`, `merchantId` in context)
9. Return `{ accessToken, refreshToken, branch: { id, name, merchantId } }`

### Admin Login

1. `POST /api/v1/admin/auth/login` — `{ email, password, deviceId, deviceType }`
2. Lookup AdminUser, compare password
3. **Always requires OTP** — send immediately on correct password
4. Return `{ status: 'OTP_REQUIRED', sessionChallenge }`
5. `POST /api/v1/admin/auth/otp/verify` — verify code, issue tokens
6. Write `UserSession`, write audit log: `AUTH_LOGIN_SUCCESS`
7. Return `{ accessToken, refreshToken, admin: { id, email, adminRole } }`

### Token Refresh (all identities)

1. `POST /api/v1/{identity}/auth/refresh` — `{ refreshToken }`
2. Look up session in Redis by `sessionId` (decoded from access token if expired, or passed explicitly)
3. Validate refresh token hash matches stored value
4. If not found or mismatch → `401 REFRESH_TOKEN_INVALID`, write audit log `AUTH_REFRESH_FAILED`
5. Delete old refresh token, issue new access token + new refresh token (rotation)
6. Update `UserSession.lastActiveAt`
7. Return `{ accessToken, refreshToken }`

### Logout

1. `POST /api/v1/{identity}/auth/logout` — `{ sessionId? }` (requires valid access token; sessionId optional to log out a specific session)
2. Delete refresh token from Redis
3. Mark `UserSession.revokedAt`, `revokedReason: 'USER_LOGOUT'`
4. Invalidate Redis permission cache
5. Write audit log: `AUTH_LOGOUT`
6. Return `{ message: 'Logged out' }`

### Password Reset (Customer, MerchantAdmin, AdminUser)

1. `POST /api/v1/{identity}/auth/forgot-password` — `{ email }`
2. If email exists: generate reset token (random 32-byte hex), store in Redis `pwd-reset:{role}:{token}` → `userId`, TTL 1 hour. Send reset email via Resend.
3. Always return `{ message: 'If that email is registered, a reset link has been sent.' }` (no enumeration)
4. `POST /api/v1/{identity}/auth/reset-password` — `{ token, newPassword }`
5. Validate token from Redis, validate password policy
6. Hash new password, update DB, delete reset token from Redis
7. **Revoke ALL active sessions** for this user across all devices (delete all `refresh:{role}:{entityId}:*` keys from Redis, mark all `UserSession` records revoked with reason `PASSWORD_RESET`)
8. Invalidate Redis permission cache
9. Write audit log: `AUTH_PASSWORD_RESET`
10. Return `{ message: 'Password updated. Please log in again.' }`

### Email Change (Customer)

Requires active session + OTP verification:

1. `POST /api/v1/customer/auth/change-email` — `{ newEmail, otpActionToken }` (action token from OTP verify)
2. Validate actionToken from Redis (must be for `action: 'EMAIL_CHANGE'`)
3. Validate new email uniqueness
4. Send verification email to new address, store pending change in Redis `email-change:{token}` → `{ userId, newEmail }`, TTL 24 hours
5. `GET /api/v1/customer/auth/confirm-email-change?token=...`
6. On confirm: update `User.email`, set `emailVerified: true`, revoke all sessions (user must re-login with new email), write audit log `AUTH_EMAIL_CHANGED`

### Phone Number Change (Customer)

Requires active session + OTP verification on OLD phone:

1. `POST /api/v1/customer/auth/change-phone` — `{ newPhoneNumber, otpActionToken }` (action token from OTP verify on current phone)
2. Validate actionToken, validate new phone not already registered
3. Send OTP to NEW phone number for confirmation
4. `POST /api/v1/customer/auth/confirm-phone-change` — `{ code }`
5. On confirm: update `User.phoneNumber`, write audit log `AUTH_PHONE_CHANGED`
6. Revoke all sessions, user must re-login

### Account Deletion (Customer)

1. `POST /api/v1/customer/auth/delete-account` — `{ otpActionToken }` (action token for `action: 'ACCOUNT_DELETION'`)
2. Validate actionToken
3. Soft-delete: set `User.deletedAt = now()`, anonymise PII fields (`email → deleted_{uuid}@deleted.redeemo.com`, `phoneNumber → null`, `firstName/lastName → '[Deleted]'`)
4. Revoke all sessions immediately
5. Cancel active Stripe subscription (handled in Phase 2D — fire event for subscription service)
6. Write audit log: `AUTH_ACCOUNT_DELETED`
7. Retain `VoucherRedemption` and aggregate analytics records (GDPR legitimate interest for fraud prevention) — no personal data in retained records

---

## Suspension and Deactivation — Auth Effects

### Merchant Suspended

- All MerchantAdmin logins for this merchant → `403 MERCHANT_SUSPENDED`
- All active MerchantAdmin sessions revoked immediately (delete refresh tokens from Redis, mark UserSession records)
- All BranchUser logins for this merchant → `403 MERCHANT_SUSPENDED`
- All active BranchUser sessions revoked immediately
- Redis permission cache for all affected identities invalidated immediately
- Vouchers inactive (handled in Phase 2C) — auth layer just blocks login
- Write audit log: `AUTH_SESSIONS_REVOKED` with reason `MERCHANT_SUSPENDED`

### Branch User Deactivated

- `BranchUser.isActive = false` (set by MerchantAdmin via merchant portal)
- Active session revoked immediately
- Login attempt → `403 BRANCH_USER_DEACTIVATED`
- Write audit log: `AUTH_SESSION_REVOKED` with reason `BRANCH_USER_DEACTIVATED`

### Customer Account

- Customers are not suspended in the same way as merchants
- Account deletion is soft-delete (covered above)
- If fraud is detected: admin can set `User.isActive = false` — login blocked with `403 ACCOUNT_SUSPENDED`, all sessions revoked
- Write audit log: `AUTH_ACCOUNT_SUSPENDED`

---

## Merchant Permissions Model

Permissions are derived from merchant state, not stored as permission flags:

| Permission | Condition |
|---|---|
| Can log in | `MerchantAdmin` exists, password valid, merchant not suspended |
| Can view own data | Logged in with valid token |
| Can edit (vouchers, branches, settings) | `Merchant.approvalStatus = APPROVED` OR `PENDING` (editing during onboarding is allowed) |
| Can publish vouchers | `Merchant.approvalStatus = APPROVED` AND voucher passes admin review |
| Can go live (visible on platform) | Admin sets `Merchant.approvalStatus = APPROVED` |
| Can validate/redeem vouchers (QR scan / code entry) | BranchUser only |
| Can Quick Validate (no QR, no code) | MerchantAdmin only |
| Can manage BranchUser accounts | MerchantAdmin only |
| Can set branch redemption PIN | MerchantAdmin only |

The `authenticate` middleware for merchant routes reads `approvalStatus` and `isSuspended` from Redis cache and attaches them to `request.merchantContext`. Route handlers check `request.merchantContext` to gate actions — they do not query Postgres for this on every request.

---

## BranchUser Provisioning (MerchantAdmin-Managed)

BranchUsers do **not** self-register. They are created, managed, and deactivated exclusively by the MerchantAdmin who owns the branch. This is enforced at the API level — there is no public registration endpoint for BranchUsers.

### How BranchUser Accounts Are Created

Each branch has exactly one assigned BranchUser (one login per branch for the merchant mobile app). The MerchantAdmin creates the account via the merchant portal under "Manage Branch → Manage User".

**`POST /api/v1/merchant/branches/:branchId/user`** (requires `authenticateMerchant`, `approvalStatus = APPROVED`)

Request body:
```json
{
  "contactName": "Jane Smith",
  "jobTitle": "Branch Manager",
  "contactNumber": "+447700900000",
  "email": "jane@example.com",
  "password": "TempPass123!"
}
```

1. Validate MerchantAdmin owns the branch (`Branch.merchantId` matches)
2. Validate email uniqueness across all `BranchUser` records
3. Validate password policy
4. Hash password (bcrypt cost 12), create `BranchUser` with `mustChangePassword: true`, `isActive: true`
5. Send welcome email to branch user via Resend: "Your Redeemo branch account has been created. Please log in and change your password."
6. Write audit log: `BRANCH_USER_CREATED` (by merchantAdminId, for branchId)
7. Return `{ branchUser: { id, email, contactName, branchId } }`

**`passwordHash` on BranchUser is always `String` (non-nullable)** — no SSO, always password-based.

### First Login — Forced Password Change

When a BranchUser logs in and `mustChangePassword: true`:

1. Login succeeds (password validated)
2. But instead of issuing full access + refresh tokens, return:
   ```json
   { "status": "PASSWORD_CHANGE_REQUIRED", "tempToken": "<short-lived token>" }
   ```
3. `tempToken` is stored in Redis: `branch-temp:{token}` → `branchUserId`, TTL 30 minutes
4. BranchUser must call `POST /api/v1/branch/auth/change-password-first-login` with `{ tempToken, newPassword }`
5. Validate new password meets policy, is different from the temporary password set by admin
6. Hash new password, update DB, set `mustChangePassword: false`
7. Issue full access + refresh tokens, write `UserSession`, write audit log: `BRANCH_USER_PASSWORD_SET`
8. Return normal login response

### BranchUser Self-Managed Password Change

While logged in, a BranchUser can change their own password:

**`POST /api/v1/branch/auth/change-password`** (requires `authenticateBranch`)

1. Receive `{ currentPassword, newPassword }`
2. Validate current password against stored hash
3. Validate new password policy, ensure it differs from current
4. Hash new password, update DB
5. Revoke all other active sessions (keep current session active)
6. Write audit log: `BRANCH_USER_PASSWORD_CHANGED`

### MerchantAdmin — Reset Branch User Password

**`POST /api/v1/merchant/branches/:branchId/user/reset-password`** (requires `authenticateMerchant`)

1. Validate MerchantAdmin owns the branch
2. Generate new temporary password (random, meets policy), hash and store
3. Set `mustChangePassword: true` on BranchUser
4. **Revoke all active BranchUser sessions immediately** (delete all `refresh:branch:{branchUserId}:*` from Redis, mark all `UserSession` records revoked with reason `ADMIN_PASSWORD_RESET`)
5. Invalidate Redis permission cache for this BranchUser
6. Send email to branch user with new temporary password
7. Write audit log: `BRANCH_USER_PASSWORD_RESET` (by merchantAdminId)
8. Return `{ message: 'Password reset. Branch user must set a new password on next login.' }`

### MerchantAdmin — Deactivate / Reactivate Branch User

**`PATCH /api/v1/merchant/branches/:branchId/user/deactivate`** (requires `authenticateMerchant`)

1. Validate MerchantAdmin owns the branch
2. Set `BranchUser.isActive = false`
3. **Revoke all active BranchUser sessions immediately** (same as password reset revocation)
4. Invalidate Redis permission cache
5. Write audit log: `BRANCH_USER_DEACTIVATED` (by merchantAdminId)
6. Return `{ message: 'Branch user deactivated.' }`

**`PATCH /api/v1/merchant/branches/:branchId/user/reactivate`** (requires `authenticateMerchant`)

1. Set `BranchUser.isActive = true`
2. Write audit log: `BRANCH_USER_REACTIVATED` (by merchantAdminId)
3. Return `{ message: 'Branch user reactivated.' }`

### Branch Redemption PIN

Each branch has a **4-digit numeric PIN** (`Branch.redemptionPin`) used as a secondary in-store validation layer. This is separate from the BranchUser login password.

- Set/changed by MerchantAdmin: **`PATCH /api/v1/merchant/branches/:branchId/pin`** with `{ pin: "1234" }`
- Validated: 4 digits, numeric only
- Stored as bcrypt hash in `Branch.redemptionPinHash`
- Used during the redemption validation flow (Phase 2E) — BranchUser may be required to enter PIN to confirm a validation action
- Write audit log: `BRANCH_PIN_CHANGED` (by merchantAdminId)

### MerchantAdmin Quick Validate

The MerchantAdmin (web portal) has a "Quick Validate" button on the Voucher Redemption page that allows them to validate a redemption without QR scan or code entry. This is a privileged action — only `MerchantAdmin` (not `BranchUser`) can do this.

- **Route:** `POST /api/v1/merchant/redemptions/:redemptionId/quick-validate` (requires `authenticateMerchant`, `approvalStatus = APPROVED`)
- **Validation:** `VoucherRedemption.isValidated` must be `false`; the redemption must belong to a branch of this merchant
- Sets `isValidated: true`, `validatedAt: now()`, `validationMethod: MERCHANT_ADMIN`
- Write audit log: `REDEMPTION_QUICK_VALIDATED` (by merchantAdminId, for redemptionId)
- Returns updated redemption record

This Quick Validate route is defined here for completeness of the permission model; full implementation detail is in Phase 2E (Redemption).

### Merchant Account Deactivation vs Suspension

Two distinct states from the PDF (page 16):

| Action | Who triggers | Effect | Reversible? |
|---|---|---|---|
| **Soft deactivation** | MerchantAdmin (self-service) | Account hidden from platform, vouchers inactive, login still works for merchant admin | Yes — reactivatable within 30 days |
| **Permanent deletion** | MerchantAdmin (self-service, with warning) | Hard delete of merchant data, all sessions revoked, requires admin confirmation | No |
| **Suspension** | Admin (platform action) | Login blocked for all merchant + branch users, sessions revoked, all vouchers inactive | Yes — admin reactivates |

**Soft deactivation flow:**
- `POST /api/v1/merchant/auth/deactivate` (requires `authenticateMerchant`)
- Sets `Merchant.deactivatedAt = now()`, `Merchant.isActive = false`
- Does NOT revoke MerchantAdmin sessions (they can still log in to reactivate)
- Vouchers immediately hidden from platform (Phase 2C handles this)
- Write audit log: `MERCHANT_DEACTIVATED` (by merchantAdminId)

**Reactivation:**
- `POST /api/v1/merchant/auth/reactivate` (requires `authenticateMerchant`, within 30-day window)
- Clears `deactivatedAt`, sets `isActive: true`
- Write audit log: `MERCHANT_REACTIVATED`

---

## Admin Roles

AdminUser has an `adminRole` field. Conceptual model for this phase (enforced in Phase 2 middleware, detail expanded in Phase 5 Admin Panel):

| Role | Access |
|---|---|
| `SUPER_ADMIN` | All operations: user management, merchant management, platform config, all reports, all admin user management |
| `OPERATIONS` | Merchant approvals, voucher review, support actions, user lookups |
| `FINANCE` | Revenue reports, subscription data — read-only on user/merchant data |
| `CONTENT` | CMS management, categories, banners, featured placements — no access to user/merchant data |

The `authenticate` admin middleware attaches `adminRole` to `request.adminContext`. Route handlers check `request.adminContext.adminRole` before executing role-restricted operations. Attempting an operation without the required role returns `403 INSUFFICIENT_PERMISSIONS`.

---

## Audit Logging

Every security-relevant event writes an audit log entry. Stored in the `AuditLog` table in Postgres (new model — see Data Model Additions).

```
AuditLog {
  id          String   @id
  entityId    String   # userId, merchantAdminId, branchUserId, adminUserId
  entityType  String   # 'customer' | 'merchant' | 'branch' | 'admin'
  event       String   # event code (see below)
  ipAddress   String
  userAgent   String
  deviceId    String?
  sessionId   String?
  metadata    Json?    # additional context (e.g. { reason: 'PASSWORD_RESET' })
  createdAt   DateTime
}
```

Audit events in this phase:

| Event code | Trigger |
|---|---|
| `AUTH_LOGIN_SUCCESS` | Successful login (any identity) |
| `AUTH_LOGIN_FAILED` | Failed login attempt (wrong password) |
| `AUTH_SSO_LOGIN_SUCCESS` | Successful SSO login |
| `AUTH_LOGOUT` | User-initiated logout |
| `AUTH_REFRESH_FAILED` | Invalid or expired refresh token used |
| `AUTH_OTP_SENT` | OTP sent to phone |
| `AUTH_OTP_VERIFIED` | OTP successfully verified |
| `AUTH_OTP_FAILED` | Wrong OTP code submitted |
| `AUTH_OTP_LOCKED` | Account locked after max OTP failures |
| `AUTH_PASSWORD_RESET` | Password reset completed |
| `AUTH_EMAIL_CHANGED` | Email address changed |
| `AUTH_PHONE_CHANGED` | Phone number changed |
| `AUTH_SESSION_REVOKED` | Single session revoked (with reason) |
| `AUTH_SESSIONS_REVOKED` | All sessions revoked (with reason) |
| `AUTH_ACCOUNT_DELETED` | Customer account soft-deleted |
| `AUTH_ACCOUNT_SUSPENDED` | Admin suspended a customer account |
| `BRANCH_USER_CREATED` | MerchantAdmin created a new BranchUser |
| `BRANCH_USER_PASSWORD_SET` | BranchUser completed forced first-login password change |
| `BRANCH_USER_PASSWORD_CHANGED` | BranchUser changed their own password |
| `BRANCH_USER_PASSWORD_RESET` | MerchantAdmin reset a BranchUser password |
| `BRANCH_USER_DEACTIVATED` | MerchantAdmin deactivated a BranchUser |
| `BRANCH_USER_REACTIVATED` | MerchantAdmin reactivated a BranchUser |
| `BRANCH_PIN_CHANGED` | MerchantAdmin changed a branch redemption PIN |
| `REDEMPTION_QUICK_VALIDATED` | MerchantAdmin used Quick Validate on a redemption |
| `MERCHANT_DEACTIVATED` | MerchantAdmin self-deactivated their merchant account |
| `MERCHANT_REACTIVATED` | MerchantAdmin reactivated their merchant account |

The `shared/audit.ts` helper writes to Postgres asynchronously (non-blocking — uses `prisma.$executeRaw` in a fire-and-forget pattern so it does not slow down auth responses). Failures in audit writing are logged to server logs but do not fail the request.

---

## Data Model Additions

Two new Prisma models required, plus additions to existing models (all in `prisma/schema.prisma`):

### Additions to Existing Models

`BranchUser` — add field:
```prisma
mustChangePassword Boolean @default(false)
```

`Branch` — add field:
```prisma
redemptionPinHash String?
```

`Merchant` — add fields:
```prisma
isActive      Boolean   @default(true)
deactivatedAt DateTime?
```

---

### UserSession

```prisma
model UserSession {
  id            String    @id @default(cuid())
  entityId      String
  entityType    String    // 'customer' | 'merchant' | 'branch' | 'admin'
  sessionId     String    @unique
  deviceId      String
  deviceType    String    // 'ios' | 'android' | 'web'
  deviceName    String?
  ipAddress     String
  userAgent     String
  createdAt     DateTime  @default(now())
  lastActiveAt  DateTime  @default(now())
  revokedAt     DateTime?
  revokedReason String?

  @@index([entityId, entityType])
  @@index([sessionId])
}
```

### AuditLog

```prisma
model AuditLog {
  id         String   @id @default(cuid())
  entityId   String
  entityType String   // 'customer' | 'merchant' | 'branch' | 'admin'
  event      String
  ipAddress  String
  userAgent  String
  deviceId   String?
  sessionId  String?
  metadata   Json?
  createdAt  DateTime @default(now())

  @@index([entityId, entityType])
  @@index([event])
  @@index([createdAt])
}
```

---

## OTP Security (Twilio Verify)

- 6-digit numeric code
- 10-minute expiry
- Max 3 attempts per code — account locked for 5 minutes on 3rd failure
- Rate limit: max 3 OTP send requests per phone number per hour (Redis counter)
- Twilio Verify service (not raw SMS) — handles delivery, retries, international formatting
- OTP for login gating (merchant, admin) uses a `sessionChallenge` pattern — the challenge token ties the OTP verification to the in-progress login attempt

---

## Rate Limiting

| Scope | Limit |
|---|---|
| Global (all routes) | 100 req / IP / minute |
| All auth routes | 10 req / IP / minute |
| Login routes | 5 req / IP / minute |
| OTP send | 3 per phone per hour (Redis counter) |
| Password reset request | 3 per email per hour (Redis counter) |

---

## Error Codes

All errors return:

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "The email or password is incorrect.",
    "statusCode": 401
  }
}
```

Full error code catalogue for this phase:

| Code | Status | Meaning |
|---|---|---|
| `INVALID_CREDENTIALS` | 401 | Wrong email or password |
| `ACCOUNT_NOT_ACTIVE` | 403 | Email or phone not yet verified |
| `ACCOUNT_LOCKED` | 423 | Temporarily locked after too many failures |
| `ACCOUNT_SUSPENDED` | 403 | Admin-suspended customer account |
| `EMAIL_NOT_VERIFIED` | 403 | Email not yet verified (during onboarding step) |
| `PHONE_NOT_VERIFIED` | 403 | Phone not yet verified (during onboarding step) |
| `EMAIL_ALREADY_EXISTS` | 409 | Email already registered |
| `PHONE_ALREADY_EXISTS` | 409 | Phone already linked to a verified account |
| `OTP_REQUIRED` | 403 | OTP step required to complete login |
| `OTP_INVALID` | 400 | Wrong OTP code |
| `OTP_EXPIRED` | 400 | OTP code has expired |
| `OTP_MAX_ATTEMPTS` | 429 | Too many wrong OTP attempts |
| `REFRESH_TOKEN_INVALID` | 401 | Refresh token not found or already rotated |
| `RESET_TOKEN_INVALID` | 400 | Password reset token not found |
| `RESET_TOKEN_EXPIRED` | 400 | Password reset token expired |
| `MERCHANT_SUSPENDED` | 403 | Merchant account is suspended |
| `MERCHANT_NOT_APPROVED` | 403 | Merchant not yet approved by admin |
| `BRANCH_USER_DEACTIVATED` | 403 | Branch user account deactivated |
| `INSUFFICIENT_PERMISSIONS` | 403 | Admin role does not have access to this operation |
| `ACTION_TOKEN_INVALID` | 400 | OTP action token missing or expired |
| `PASSWORD_POLICY_VIOLATION` | 400 | Password does not meet policy requirements |
| `PASSWORD_CHANGE_REQUIRED` | 403 | BranchUser must set a new password before access is granted |
| `BRANCH_USER_NOT_FOUND` | 404 | Branch has no assigned user |
| `BRANCH_NOT_OWNED` | 403 | MerchantAdmin does not own this branch |
| `MERCHANT_DEACTIVATED` | 403 | Merchant account is self-deactivated |
| `MERCHANT_REACTIVATION_WINDOW_EXPIRED` | 403 | 30-day reactivation window has passed |

---

## Session Rules Summary

| Identity | Persistent login | Max active mobile sessions | Web session separate? |
|---|---|---|---|
| Customer | Yes (90-day refresh token) | 1 (new login revokes previous) | Yes — web session is independent |
| MerchantAdmin | Yes (90-day refresh token) | No restriction (multi-device allowed) | N/A (web portal only) |
| BranchUser | Yes (90-day refresh token) | 1 (new login revokes previous) | N/A (mobile app only) |
| AdminUser | Yes (90-day refresh token) | No restriction | N/A (web only) |

---

## Environment Variables (new in this phase)

```env
# JWT Secrets (one per identity)
JWT_SECRET_CUSTOMER=
JWT_SECRET_MERCHANT=
JWT_SECRET_BRANCH=
JWT_SECRET_ADMIN=

# Redis
REDIS_URL=

# Twilio
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VERIFY_SERVICE_SID=

# Resend
RESEND_API_KEY=
RESEND_FROM_EMAIL=noreply@redeemo.com

# Google SSO
GOOGLE_CLIENT_ID=

# Apple SSO
APPLE_CLIENT_ID=
APPLE_TEAM_ID=
APPLE_KEY_ID=
APPLE_PRIVATE_KEY=

# API
PORT=3000
NODE_ENV=development
CORS_ORIGIN=http://localhost:3001
```

---

## Dependencies (new packages)

```
fastify
@fastify/jwt
@fastify/cors
@fastify/rate-limit
@fastify/helmet
bcryptjs
@types/bcryptjs
zod
ioredis
twilio
resend
google-auth-library
apple-signin-auth
nanoid
```

---

## Testing Strategy

- **Unit tests:** `password.ts` (hash/compare, policy validation), `tokens.ts` (sign/verify/rotation), `otp.ts` (generate/verify/lockout/rate-limit logic), `audit.ts` (fire-and-forget write)
- **Integration tests:** all auth routes via test Fastify instance with mocked Prisma, Redis, Twilio, Resend
- **Key scenarios per flow:** happy path, wrong credentials, locked account, expired token, single-session enforcement (second mobile login revokes first), suspended merchant blocks login, suspended customer blocks login, password reset revokes all sessions
- **Test framework:** Vitest (TypeScript-native, fast)

---

## What This Phase Does NOT Include

- Merchant CRUD and voucher management (Phase 2C) — including voucher states (Draft, Pending Approval, Published, Rejected), voucher creation form, branch profile fields
- Stripe subscription (Phase 2D) — including campaign sign-up, featured listings, payment method management, invoices
- Redemption flow (Phase 2E) — full QR scan / code entry validation flow for BranchUser; Quick Validate route is specified here but implemented in 2E
- Automated redemption emails to customers and merchants (Phase 2E)
- Monthly redemption reports and analytics (Phase 2C/2E)
- Dashboard analytics and graphical insights (Phase 4 Merchant Portal frontend)
- Support & Resources / live chat integration (Phase 4)
- Community forum (future scope)
- Email/SMS template design (placeholder content only)
- Push notification device token registration (Phase 3)
- Full anomaly detection / suspicious login ML (flagged for future scope)
- Any frontend — API only

## PDF Alignment Notes (Merchant Portal Feedback V2)

This spec was reviewed against the Redeemo MP Feedback V2 document. The following items from the PDF are confirmed as captured:

- BranchUser creation, password reset, deactivation by MerchantAdmin ✅ (this spec)
- Branch redemption PIN (4-digit, set by MerchantAdmin) ✅ (this spec)
- MerchantAdmin Quick Validate ✅ (this spec — implemented in Phase 2E)
- Merchant soft deactivation and permanent deletion ✅ (this spec)
- Voucher states: Draft, Pending Approval, Published, Rejected → Phase 2C
- Voucher mandatory vs custom (RMV-xxx / RCV-xxx) → already in data model (Phase 1)
- Branch profile fields (logo, banner, address, hours, amenities, gallery, price list) → Phase 2C
- Dashboard overview tiles and graphs → Phase 4
- Automated redemption notification emails → Phase 2E
- Campaign and featured listing management → Phase 2D
- Payment method and invoice management → Phase 2D
- GDPR data access request button → Phase 5 (Admin Panel) + customer account (Phase 3)
- Support & Resources page → Phase 4
