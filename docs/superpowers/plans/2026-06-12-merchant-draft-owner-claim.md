# Plan — Merchant Draft-Owner Claim / Set-Password (backend-only slice)

**Date:** 2026-06-12
**Tier:** 2 (backend contract, plan-first)
**Status:** Approved — **Option A** locked (§6); implemented in this PR (no new-device OTP change).
**Scope doc:** scoping report in the 2026-06-12 session; owner decisions locked below.

## Goal
Let an admin-created **draft** merchant owner claim their account and set their own
password via an emailed single-use token, **without staff ever setting or knowing
the password**. Backend/API only — no owner-facing page (Phase 4 portal).

## Owner decisions (locked)
- New **merchant-claim token** (not the raw password-reset token); **Redis only, no migration**.
- Token **TTL 7 days**.
- On successful claim: set `passwordHash`, **clear `mustChangePassword`**, **set `otpVerifiedAt`** (interim proof-of-ownership; Twilio not wired), **delete token** (single-use), audit.
- Claim token/link **never** in admin API responses, logs, or UI.
- Email dark/sandboxed → **queue durably** via `notify`/outbox; never hand staff the token.
- Owner-facing set-password page **deferred** to Phase 4 portal. This PR is API-testable only.
- Fold the **`createMerchantDraft` P2002** duplicate-email race into this slice.
- Deferred: resend-claim action, terms/contract acceptance, phone OTP/Twilio, real email enablement, portal UI.

## Design

### 1. Token + email on draft creation
- After `createMerchantDraft`'s `$transaction` commits, generate `generateSecureToken(32)`,
  store `RedisKey.merchantClaim(token) = ownerAdminId` with `EX = 7 days`, and queue the
  claim email via `notify(... claimAccountEmail(link), userId:null, type:'merchant_claim')`.
- Token + notify run **after** the tx (notify opens its own tx) and are wrapped best-effort
  (a delivery/enqueue failure must not fail the committed draft — mirrors `forgotPasswordMerchant`).
- `createMerchantDraft` gains a `redis` param (or a sibling `issueMerchantClaim(prisma, redis, …)`
  called from the same flow). **Token is never returned** (response shape unchanged).
- `buildClaimLink('merchant', token)` → `MERCHANT_PORTAL_URL` + claim path (portal page is Phase 4; link 404s until then — fine, email is dark/queued anyway).

### 2. Claim set-password service + route
- `POST /api/v1/merchant/auth/claim` (public; the token is the credential). Body `{ token, newPassword }`.
- `claimMerchantAccount(prisma, redis, { token, newPassword, ip, ua })`:
  validate policy → `RedisKey.merchantClaim(token)` → adminId (miss → `CLAIM_TOKEN_EXPIRED`) →
  `hashPassword` → update `{ passwordHash, mustChangePassword:false, otpVerifiedAt:now }` →
  `del` token (single-use) → audit `MERCHANT_CLAIM_COMPLETED`.
- Light per-IP rate-limit on the route (token entropy is the primary defence; mirror the reset limiter's IP guard).

### 3. P2002 hardening
- `createMerchantDraft`: keep the `findUnique` pre-check; wrap the create path so a Prisma
  **P2002** (unique `email`) → `EMAIL_ALREADY_EXISTS` (friendly 409) instead of an unhandled 500.

## Files touched (no schema migration)
- `src/api/admin/merchants/service.ts` — P2002 catch; token+email trigger (or call `issueMerchantClaim`).
- `src/api/auth/merchant/service.ts` — `claimMerchantAccount` (+ `issueMerchantClaim` if separated).
- `src/api/auth/merchant/routes.ts` — `POST /claim`.
- `src/api/shared/emailTemplates.ts` — `claimAccountEmail` + `buildClaimLink`.
- `src/api/shared/redis-keys.ts` — `merchantClaim`.
- `src/api/shared/errors.ts` — `CLAIM_TOKEN_EXPIRED` (if not reusing `RESET_TOKEN_EXPIRED`).
- Tests (below).

## Tests
- Draft creation **queues** a claim email (CommunicationLog QUEUED) and **never returns the token**.
- Claim: sets `passwordHash`, clears `mustChangePassword`, sets `otpVerifiedAt`, deletes token (single-use).
- Expired token → `CLAIM_TOKEN_EXPIRED`; reused token → rejected.
- `EMAIL_ALREADY_EXISTS` pre-check **and** P2002 race → both 409.
- **Login after claim** — see §6 (depends on the OTP decision).
- Token never appears in API responses / logs (security pin).

## Security
- Token only in email; never in responses/UI/logs. Single-use delete (no replay). 32-byte token + per-IP limit (no brute-force). Claim endpoint returns generic errors (no enumeration).

## Rollback / down-path
- **No schema change.** Rollback = revert the code; outstanding Redis claim tokens self-expire by TTL.

## §6 — OPEN DECISION (OTP / first login)
`otpRequired(admin, deviceId, knownDevices)` returns true when **either** `!otpVerifiedAt`
(first-ever login) **or** the device is unknown. Setting `otpVerifiedAt` at claim clears the
first; but a claimed owner's **first** login is always from an unknown device, so it still
returns `OTP_REQUIRED` — and OTP delivery is the unwired Twilio stub. Two options:

- **(a) RECOMMENDED — claim clears only the first-ever-login OTP; new-device OTP stays Twilio-gated.**
  Honest, zero login-logic change, fully inside the "no OTP/Twilio" exclusion. The "login after
  claim" test verifies login **completes for a recognised device** (proving `otpVerifiedAt`
  cleared the first-ever gate); the new-device path is documented as a pre-existing, all-merchant
  limitation. A real owner's first browser login still awaits Twilio (same as every merchant).
- **(b) Also trust the first post-claim login's device** (skip the new-device OTP for that one
  login). Delivers true end-to-end "login without OTP" now, but edits `otpRequired`/the login
  path — arguably inside the excluded OTP subsystem, and a small security-model change.

**Recommendation: (a).** It keeps the slice strictly backend-claim + honours the OTP exclusion;
full first-login is a Twilio/portal concern. Awaiting owner confirmation before implementing.
