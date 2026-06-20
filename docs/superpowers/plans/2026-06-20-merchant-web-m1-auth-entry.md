# Merchant Portal M1: Auth + Entry Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the real Merchant Portal entry foundation in `apps/merchant-web`: email-OTP sign-in, self-serve registration + email verification, claim, password recovery, an httpOnly BFF-lite session, route protection, and lifecycle-aware landing, against the largely-built backend.

**Architecture:** Seven plan-first PR slices off updated `main`. Two backend slices first (a small email-OTP wiring; a self-serve registration + verify + Turnstile + one additive `emailVerified` migration that is a STOP-AND-REPORT checkpoint), then five frontend slices (an httpOnly BFF-lite session via Next route handlers + in-memory access token + middleware gate, then the entry screens, then lifecycle routing). Email stays dark (Phase 6); flows are exercised via the dark outbox / dev token scripts.

**Tech Stack:** Backend Fastify + Prisma + Redis + zod + the existing `notify()` outbox + Cloudflare Turnstile siteverify. Frontend Next 15 (App Router, route handlers, middleware) + React 19 + React Query + zod + jest/RTL, in the M0 `apps/merchant-web` workspace (port 3003). Node 24.

**Spec:** `docs/superpowers/specs/2026-06-20-merchant-web-m1-auth-entry-design.md` (read it; this plan implements it). The `MerchantAdmin.emailVerified` migration is a gated checkpoint (Slice R, Task R-MIG): do NOT generate or run it without explicit owner approval.

---

## How to use this plan

Slices are executed and merged in order (0, R, 1, 2, 3, 4, 5), each its own PR. Backend slices (0, R) define the contracts the frontend consumes. Within a slice, follow TDD (write the failing test, run it, implement, run it green, commit). Every backend change is additive; only Slice R carries the migration, and that migration is NOT generated until the checkpoint is approved.

**Pre-flight before each slice:** `git fetch origin`, branch off `origin/main` (`git checkout -b feat/merchant-web-m1-slice-<n> origin/main`), confirm `apps/merchant-web` exists and tests are green. Backend slices run from repo root; frontend slices verify from `apps/merchant-web`.

**Standing scope guard (run before each PR):** `git diff --name-only origin/main` must touch only the files this slice names. No unrelated files, no other app, no `redeemo.com` left in changed merchant seed lines, no em-dashes in authored content.

---

## File structure (all slices)

```
Backend (Slice 0):
  src/api/auth/merchant/service.ts          # loginMerchant + verifyMerchantOtp: email-OTP (no schema)
  src/api/shared/emailTemplates.ts          # + merchantOtpEmail(code)
  prisma/_get-merchant-otp.ts (new)         # dev: read OTP/verify/claim/reset from the dark outbox
  tests/api/auth/merchant-otp.test.ts (new) # email-OTP backend unit tests

Backend (Slice R):
  src/api/auth/merchant/routes.ts           # + POST /register, /register/verify, /resend-verification
  src/api/auth/merchant/service.ts          # + registerMerchant, verifyMerchantEmail, resendMerchantVerification; claim sets emailVerified; login emailVerified gate
  src/api/shared/captcha.ts (new)           # verifyTurnstile (feature-gated)
  src/api/shared/emailTemplates.ts          # + merchantVerifyEmail(code), merchantAccountExistsEmail
  src/api/shared/errors.ts                  # + EMAIL_NOT_VERIFIED, CAPTCHA_FAILED, VERIFICATION_TOKEN_INVALID (if missing)
  src/api/plugins/rate-limit.ts             # + register tier
  src/api/shared/env.ts                     # + TURNSTILE_SECRET_KEY (feature-gated), CAPTCHA_ENABLED
  prisma/schema.prisma                      # MerchantAdmin.emailVerified  (CHECKPOINT, gated)
  prisma/migrations/<ts>_merchant_email_verified/migration.sql  (CHECKPOINT, gated)
  prisma/seed.ts                            # emailVerified:true on merchant admin; email -> merchant@redeemo.test
  prisma/issue-merchant-token.ts (new)      # dev: issue claim/reset/verify tokens to redis
  tests/api/auth/merchant-register.test.ts (new)
  tests/api/auth/merchant-claim.test.ts / merchant.test.ts (modify: emailVerified fixtures)
  CLAUDE.md                                 # dev-credential table: merchant@redeemo.test

Frontend Slice 1 (apps/merchant-web):
  app/api/merchant-auth/{login,otp-verify,register,register-verify,refresh,logout}/route.ts
  lib/auth/session.tsx                       # SessionProvider + useSession (in-memory access)
  lib/auth/cookies.ts                        # server cookie helpers (set/read/clear httpOnly session)
  lib/auth/deviceId.ts                       # getOrCreateDeviceId
  lib/api/client.ts                          # apiFetch (Bearer + single-flight refresh-via-route-handler)
  lib/api/auth.ts                            # typed clients (bimodal login, otp, forgot, reset, claim, register, verify)
  lib/api/profile.ts                         # getMerchantProfile
  app/providers.tsx                          # wrap with SessionProvider
  middleware.ts                              # gate (app)/** on session-cookie presence
  lib/securityHeaders.ts                     # CSP: add Turnstile origins
  .env.example / .env.local                  # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_TURNSTILE_SITE_KEY

Frontend Slices 2-5 (apps/merchant-web/app/(auth)/* and shell wiring):
  app/(auth)/sign-in/page.tsx, otp/page.tsx
  app/(auth)/forgot-password/page.tsx, reset-password/page.tsx, claim/page.tsx
  app/(auth)/register/page.tsx, register/verify/page.tsx
  components/shell/MerchantPortalShell.tsx (guard), Topbar.tsx (logout), Sidebar.tsx (live StatusPill)
  app/(app)/page.tsx + a pre-live home + lib/auth/lifecycle.ts (StatusPill derivation)
```

---

## MIGRATION CHECKPOINT (Slice R, Task R-MIG) - read before starting Slice R

The single M1 migration adds `MerchantAdmin.emailVerified`. It is a STOP-AND-REPORT gate. The implementer must NOT run `prisma migrate dev`, edit `schema.prisma`, or create any file under `prisma/migrations/` until the owner explicitly approves this checkpoint. The exact change is in Task R-MIG. All Slice R code that depends on the column (the login gate, claim, register/verify, seed, fixtures) is written behind this gate: implement the column + the dependent code only after approval, in one commit.

---

# SLICE 0 - Backend: merchant login email-OTP (no schema)

**Branch:** `feat/merchant-web-m1-slice0-email-otp`. **PR gate:** backend `tsc --noEmit` clean + `npm run test:unit` green (incl. the new suite).

### Task 0.1: merchantOtpEmail template

**Files:** Modify `src/api/shared/emailTemplates.ts` (next to `adminOtpEmail` at line 107).

- [ ] **Step 1: Write the failing test**

```ts
// tests/api/auth/merchant-otp.test.ts  (create)
import { describe, it, expect } from 'vitest'
import { merchantOtpEmail } from '../../../src/api/shared/emailTemplates'

describe('merchantOtpEmail', () => {
  it('renders the 6-digit code and never exposes a link', () => {
    const out = merchantOtpEmail('482913')
    expect(out.subject).toMatch(/sign in|code/i)
    expect(out.html).toContain('482913')
    expect(out.html).not.toMatch(/https?:\/\//) // OTP email has no link
  })
})
```

- [ ] **Step 2: Run it, expect FAIL** - `npx vitest run tests/api/auth/merchant-otp.test.ts` -> fails (`merchantOtpEmail` not exported).

- [ ] **Step 3: Implement** - add to `emailTemplates.ts`, mirroring `adminOtpEmail`:

```ts
export function merchantOtpEmail(code: string): RenderedEmail {
  return {
    subject: 'Your Redeemo for Business sign-in code',
    html: `<p>Your sign-in code is <strong style="font-size:20px;letter-spacing:2px">${code}</strong>.</p>
<p>It expires in 10 minutes. If you did not try to sign in, ignore this email.</p>`,
    text: `Your Redeemo for Business sign-in code is ${code}. It expires in 10 minutes.`,
  }
}
```

- [ ] **Step 4: Run it, expect PASS.**
- [ ] **Step 5: Commit** - `git add src/api/shared/emailTemplates.ts tests/api/auth/merchant-otp.test.ts && git commit -m "feat(merchant-auth): merchantOtpEmail template"`

### Task 0.2: loginMerchant sends the email-OTP code

**Files:** Modify `src/api/auth/merchant/service.ts` (the `otpRequired` branch, lines 72-82).

- [ ] **Step 1: Write the failing test** (append to `merchant-otp.test.ts`): boot the app via `buildApp`, mock prisma/redis, register a known merchant with `otpVerifiedAt=null`, POST `/api/v1/merchant/auth/login` with a fresh `deviceId`, assert the response is `{status:'OTP_REQUIRED', sessionChallenge}` AND that `notify` was called with `type:'merchant_login_otp'` and a 6-digit code in the rendered email. (Use the same `buildApp` + prisma/redis-mock harness as `tests/api/auth/merchant.test.ts`; spy on `../../shared/notify`.)

```ts
// assert shape:
expect(res.statusCode).toBe(200)
expect(res.json()).toMatchObject({ status: 'OTP_REQUIRED' })
expect(res.json().sessionChallenge).toEqual(expect.any(String))
expect(notifySpy).toHaveBeenCalledWith(expect.anything(), expect.anything(),
  expect.objectContaining({ type: 'merchant_login_otp', recipientType: 'MERCHANT_ADMIN' }))
```

- [ ] **Step 2: Run, expect FAIL** (no code sent today).

- [ ] **Step 3: Implement** - replace the `otpRequired` branch in `loginMerchant` (mirror `loginAdmin` 54-83):

```ts
  if (otpRequired(admin, data.deviceId, knownDevices)) {
    const challenge = generateSecureToken(16)
    const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
    const codeHmac = crypto
      .createHmac('sha256', process.env.ENCRYPTION_KEY as string)
      .update(challenge + ':' + code)
      .digest('hex')
    await redis.set(
      RedisKey.otpChallenge('merchant', challenge),
      JSON.stringify({ adminId: admin.id, deviceId: data.deviceId, deviceType: data.deviceType, codeHmac, attempts: 0 }),
      'EX', OTP_CHALLENGE_TTL
    )
    try {
      const { notify } = await import('../../shared/notify')
      const { merchantOtpEmail } = await import('../../shared/emailTemplates')
      await notify(prisma, redis, {
        to: admin.email, recipientType: 'MERCHANT_ADMIN', recipientId: admin.id, userId: null,
        type: 'merchant_login_otp', email: merchantOtpEmail(code), ip: data.ipAddress ?? null,
      })
    } catch { /* never reveal a delivery failure */ }
    return { status: 'OTP_REQUIRED', sessionChallenge: challenge }
  }
```

Add `import crypto from 'crypto'` if not present. Add `const MERCHANT_OTP_MAX_ATTEMPTS = 5` and the `MERCHANT_OTP_DEV_BYPASS_ENVS = new Set(['development','test'])` + `MERCHANT_DEV_OTP_BYPASS_CODE = '000000'` consts near the top (mirror admin 23-29).

- [ ] **Step 4: Run, expect PASS.**
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-auth): loginMerchant sends email-OTP code (HMAC)"`

### Task 0.3: verifyMerchantOtp verifies the HMAC (drop the Twilio path)

**Files:** Modify `src/api/auth/merchant/service.ts` `verifyMerchantOtp` (87-130).

- [ ] **Step 1: Write the failing tests** (append): (a) wrong code increments attempts and on the 5th returns `OTP_MAX_ATTEMPTS` (429-mapped); (b) the correct code (read from the challenge by recomputing the HMAC in the test, or use the `000000` dev bypass with `NODE_ENV='test'`) returns `{accessToken, refreshToken, merchant}` and sets `otpVerifiedAt` + seeds known-devices; (c) `000000` bypass works in test env only.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement** - replace the body after the challenge read with the admin pattern (verifyAdminOtp 98-141): parse `{adminId, deviceId, deviceType, codeHmac, attempts}`; do NOT delete on a wrong code (increment `attempts` with `KEEPTTL`, delete at `MERCHANT_OTP_MAX_ATTEMPTS`); the `000000` dev bypass gated to `MERCHANT_OTP_DEV_BYPASS_ENVS`; timing-safe HMAC compare of `HMAC(ENCRYPTION_KEY, sessionChallenge + ':' + code)` vs `codeHmac`; on match delete the challenge, set `otpVerifiedAt`, seed `known-devices:merchant:<id>` (keep the existing block), resolve `merchantInfo`, return `completeMerchantLogin(...)`. **Remove** the `import('../../shared/otp')` + `verifyOtp(admin.phone)` lines entirely.

- [ ] **Step 4: Run, expect PASS.** Then full `npm run test:unit` (no regressions in the existing 9 merchant-auth files).
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-auth): verifyMerchantOtp HMAC + attempt cap (drop dead Twilio path)"`

### Task 0.4: dev OTP/outbox retrieval script

**Files:** Create `prisma/_get-merchant-otp.ts` (adapt `prisma/_get-admin-otp.ts`).

- [ ] **Step 1: Implement** - read `CommunicationLog` where `type IN ('merchant_login_otp','merchant_email_verify','merchant_claim','password_reset')` for a given email arg, regex the 6-digit code (or the `?token=` link) out of `payload.html`, print it. Header comment: "Run with the local email worker NOT running, since the worker FAILs+NULLs the payload while email is dark." No test (dev tool).
- [ ] **Step 2: Commit** - `git commit -m "chore(merchant-auth): dev OTP/outbox retrieval script"`

### Slice 0 PR

- [ ] Verify: `npx tsc --noEmit` clean; `npm run test:unit` green; scope-guard diff is only the Slice-0 files; no em-dash in authored content. Open PR `feat/merchant-web-m1-slice0-email-otp` -> main. Merge after CI green.

---

# SLICE R - Backend: self-serve registration + verify + Turnstile + the emailVerified migration (GATED)

**Branch:** `feat/merchant-web-m1-sliceR-register`. **PR gate:** backend `tsc` + `test:unit` green. **Order within the slice:** build the captcha helper + templates + error codes + rate-limit tier + the register/verify routes/service FIRST (these compile without the column by reading/writing `emailVerified` only after the column exists - so gate the column-touching lines), then do Task R-MIG (the checkpoint) and wire the column-dependent code, then seed/fixtures/CLAUDE.md, then the email-hygiene change.

### Task R.1: error codes + rate-limit tier + env

**Files:** Modify `src/api/shared/errors.ts`, `src/api/plugins/rate-limit.ts`, `src/api/shared/env.ts`.

- [ ] **Step 1:** add error codes (if absent) to `errors.ts`: `EMAIL_NOT_VERIFIED` (403, "Please verify your email to continue."), `CAPTCHA_FAILED` (400, "Captcha check failed. Please try again."), `VERIFICATION_TOKEN_INVALID` (400, "This verification link or code is invalid or has expired.").
- [ ] **Step 2:** add a `register` tier to `rate-limit.ts` TIERS: `register: { prod: { max: 5, timeWindow: '1 hour' }, dev: { max: 50, timeWindow: '1 minute' } }`.
- [ ] **Step 3:** in `env.ts`, add `TURNSTILE_SECRET_KEY` to `FEATURE_GATED_SECRETS` gated behind a `CAPTCHA_ENABLED==='true'` flag (mirror how `RESEND_API_KEY` is gated behind `EMAIL_ENABLED`). Default disabled.
- [ ] **Step 4: Commit** - `git commit -m "feat(merchant-auth): register error codes + rate-limit tier + Turnstile env gate"`

### Task R.2: Turnstile verify helper (feature-gated)

**Files:** Create `src/api/shared/captcha.ts`. Test `tests/api/shared/captcha.test.ts`.

- [ ] **Step 1: Write the failing test** - when `CAPTCHA_ENABLED!=='true'`, `verifyTurnstile(anyToken, ip)` resolves `true` without a network call (mock `fetch`, assert it was NOT called); when enabled, it POSTs to the siteverify URL with `{secret, response, remoteip}` and returns the provider `success` boolean (mock `fetch`).

- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement**:

```ts
// src/api/shared/captcha.ts
const SITEVERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'
export function isCaptchaEnabled(): boolean { return process.env.CAPTCHA_ENABLED === 'true' }
export async function verifyTurnstile(token: string, ip: string | null): Promise<boolean> {
  if (!isCaptchaEnabled()) return true // dev/test/disabled: skip, no network call
  const secret = process.env.TURNSTILE_SECRET_KEY as string
  const body = new URLSearchParams({ secret, response: token ?? '' })
  if (ip) body.set('remoteip', ip)
  try {
    const res = await fetch(SITEVERIFY, { method: 'POST', body })
    const data = (await res.json()) as { success?: boolean }
    return data.success === true
  } catch { return false }
}
```

- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-auth): Cloudflare Turnstile verify helper (feature-gated)"`

### Task R.3: register/verify/account-exists email templates

**Files:** Modify `src/api/shared/emailTemplates.ts`.

- [ ] **Step 1:** add `merchantVerifyEmail(code)` (6-digit code, no link, like `merchantOtpEmail` but copy "verify your email to finish setting up"). Add `merchantAccountExistsEmail(loginUrl, resetUrl)` (the non-enumerating "you already have an account" email). Tests mirror Task 0.1.
- [ ] **Step 2: Commit** - `git commit -m "feat(merchant-auth): merchantVerifyEmail + merchantAccountExistsEmail templates"`

### Task R-MIG: the emailVerified migration - STOP-AND-REPORT CHECKPOINT (do NOT run without approval)

**Files (only after approval):** Modify `prisma/schema.prisma` (model MerchantAdmin, line 183); create the Prisma migration.

- [ ] **Step 1 (BLOCKING):** STOP. Surface this checkpoint to the owner with the exact change below and obtain explicit approval. Do NOT edit `schema.prisma` or run any migrate command before approval.

Prisma change (in `model MerchantAdmin`):
```prisma
emailVerified      Boolean    @default(false)
```
Migration SQL (the generated `migration.sql` body must equal):
```sql
ALTER TABLE "MerchantAdmin" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
UPDATE "MerchantAdmin" SET "emailVerified" = true WHERE "passwordHash" IS NOT NULL;
```
Rollback:
```sql
ALTER TABLE "MerchantAdmin" DROP COLUMN "emailVerified";
```
Backfill rationale + edge cases: spec Section 7.6 (claimed owners -> true; unclaimed drafts stay false but cannot log in; seeded merchant has a passwordHash -> true; future self-serve accounts created false). Additive, `DEFAULT false` is non-blocking; backfill is idempotent.

- [ ] **Step 2 (after approval):** add the field to `schema.prisma`, generate the migration with `npx prisma migrate dev --name merchant_email_verified --create-only`, then EDIT the generated `migration.sql` to include the backfill `UPDATE` line (Prisma will not generate the backfill), then apply with `npx prisma migrate dev`. Run `npx prisma generate`.
- [ ] **Step 3: Commit** - `git commit -m "feat(merchant-auth): add MerchantAdmin.emailVerified (migration + backfill) [APPROVED CHECKPOINT]"`

### Task R.4: registration service + routes (non-enumerating, captcha, verify)

**Files:** Modify `src/api/auth/merchant/service.ts` (add `registerMerchant`, `verifyMerchantEmail`, `resendMerchantVerification`), `src/api/auth/merchant/routes.ts` (3 routes). Test `tests/api/auth/merchant-register.test.ts`.

- [ ] **Step 1: Write the failing tests:** (a) register with a NEW email + a valid (mocked) captcha creates Merchant(REGISTERED)+MerchantAdmin(emailVerified:false,passwordHash set)+OWNER membership, queues a `merchant_email_verify` email, returns `{status:'VERIFY_EMAIL_SENT', challenge}`; (b) register with an EXISTING email creates NOTHING, returns the SAME `{status:'VERIFY_EMAIL_SENT', challenge}` shape, and queues a `merchant_account_exists` email (non-enumeration, assert no Merchant created); (c) captcha failure -> `CAPTCHA_FAILED`; (d) `register/verify` with the right code sets `emailVerified=true` + `otpVerifiedAt` + seeds the device + returns tokens (auto-login); wrong code -> `OTP_INVALID`/cap; (e) `resend-verification` re-issues a code with a generic response. Mock `verifyTurnstile`, `notify`, prisma/redis.

- [ ] **Step 2: Run, FAIL.**

- [ ] **Step 3: Implement** `registerMerchant` (mirror `createMerchantDraft` 311-392 + `registerCustomer` shape, but NON-enumerating and with captcha):

```ts
export async function registerMerchant(prisma, redis, app, data: {
  firstName: string; lastName: string; email: string; mobile?: string; mobileCountryCode?: string;
  password: string; businessName: string; turnstileToken: string;
  deviceId: string; deviceType: string; deviceName?: string; ipAddress: string; userAgent: string;
}): Promise<{ status: 'VERIFY_EMAIL_SENT'; challenge: string }> {
  const { verifyTurnstile } = await import('../../shared/captcha')
  if (!(await verifyTurnstile(data.turnstileToken, data.ipAddress))) throw new AppError('CAPTCHA_FAILED')
  if (!validatePasswordPolicy(data.password)) throw new AppError('PASSWORD_POLICY_VIOLATION')

  const existing = await prisma.merchantAdmin.findUnique({ where: { email: data.email } })
  const challenge = generateSecureToken(16)
  const code = crypto.randomInt(0, 1_000_000).toString().padStart(6, '0')
  const codeHmac = crypto.createHmac('sha256', process.env.ENCRYPTION_KEY as string).update(challenge + ':' + code).digest('hex')

  if (existing) {
    // NON-ENUMERATION: do not create, do not reveal. Send an "account exists" email, return the same shape.
    try {
      const { notify } = await import('../../shared/notify')
      const { merchantAccountExistsEmail } = await import('../../shared/emailTemplates')
      await notify(prisma, redis, { to: data.email, recipientType: 'MERCHANT_ADMIN', recipientId: existing.id, userId: null,
        type: 'merchant_account_exists', email: merchantAccountExistsEmail(), ip: data.ipAddress ?? null })
    } catch {}
    return { status: 'VERIFY_EMAIL_SENT', challenge } // dummy challenge; verify will fail-closed for a non-account
  }

  const passwordHash = await hashPassword(data.password)
  const adminId = await prisma.$transaction(async (tx) => {
    const merchant = await tx.merchant.create({ data: { businessName: data.businessName, status: 'REGISTERED' } })
    const admin = await tx.merchantAdmin.create({ data: {
      email: data.email, firstName: data.firstName, lastName: data.lastName,
      phone: data.mobile ?? null, phoneCountryCode: data.mobileCountryCode ?? null,
      passwordHash, mustChangePassword: false, emailVerified: false, status: 'ACTIVE',
    }})
    await tx.merchantMembership.create({ data: { merchantId: merchant.id, merchantAdminId: admin.id, role: 'OWNER', allBranches: true, status: 'ACTIVE' } })
    writeAuditLog(tx, { entityId: merchant.id, entityType: 'merchant', event: 'MERCHANT_SELF_REGISTERED', ipAddress: data.ipAddress, userAgent: data.userAgent })
    return admin.id
  })
  await redis.set(`merchant-email-verify:${challenge}`,
    JSON.stringify({ adminId, deviceId: data.deviceId, deviceType: data.deviceType, codeHmac, attempts: 0 }), 'EX', EMAIL_VERIFY_TTL)
  try {
    const { notify } = await import('../../shared/notify')
    const { merchantVerifyEmail } = await import('../../shared/emailTemplates')
    await notify(prisma, redis, { to: data.email, recipientType: 'MERCHANT_ADMIN', recipientId: adminId, userId: null,
      type: 'merchant_email_verify', email: merchantVerifyEmail(code), ip: data.ipAddress ?? null })
  } catch {}
  return { status: 'VERIFY_EMAIL_SENT', challenge }
}
```

`verifyMerchantEmail(challenge, code)`: read `merchant-email-verify:<challenge>`; miss -> `VERIFICATION_TOKEN_INVALID`; HMAC compare + attempt cap (same as Slice 0); on match set `emailVerified=true`+`otpVerifiedAt=now`, seed `known-devices:merchant:<id>` with `deviceId`, delete the key, `completeMerchantLogin`. `resendMerchantVerification(email)`: anti-enum (generic response), re-issue a code for an unverified account. Add `const EMAIL_VERIFY_TTL = 86400`.

Routes (`routes.ts`, mirror the claim route + add the `register` rate-limit tier):
```ts
app.post(`${prefix}/register`, { config: { rateLimit: routeRateLimit('register') } }, async (req, reply) => { /* zod body, call registerMerchant, reply.send */ })
app.post(`${prefix}/register/verify`, { config: { rateLimit: routeRateLimit('otpVerify') } }, async (req, reply) => { /* {challenge, code:len6} */ })
app.post(`${prefix}/resend-verification`, { config: { rateLimit: routeRateLimit('forgotPassword') } }, async (req, reply) => { /* {email} */ })
```
Register Zod body: `z.object({ firstName: z.string().min(1).max(100), lastName: z.string().min(1).max(100), email: emailSchema, mobile: z.string().max(20).optional(), mobileCountryCode: z.string().max(6).optional(), password: passwordSchema, businessName: z.string().min(1).max(200), termsAccepted: z.literal(true), turnstileToken: z.string(), ...deviceSchema.shape })`.

- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-auth): self-serve registration + email verify (non-enum, captcha)"`

### Task R.5: claim + login emailVerified wiring (depends on R-MIG)

**Files:** Modify `src/api/auth/merchant/service.ts` (`claimMerchantAccount` 346-368; `loginMerchant` after the status checks).

- [ ] **Step 1: Write the failing tests:** (a) login with `emailVerified=false` (+ password) -> `EMAIL_NOT_VERIFIED`; (b) login with `emailVerified=true` proceeds; (c) `claimMerchantAccount` sets `emailVerified=true`. Update the existing `merchant.test.ts`/`merchant-claim.test.ts` fixtures to set `emailVerified:true` where login is exercised (else they now hit the gate).
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** - `loginMerchant`: after the SUSPENDED/INACTIVE/ACCOUNT_SUSPENDED checks add `if (!admin.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED')`. `claimMerchantAccount`: add `emailVerified: true` to the `merchantAdmin.update` data (and optionally seed the claiming device into `known-devices` if the claim body carries a deviceId). Update fixtures.
- [ ] **Step 4: Run, PASS** + full `test:unit` green.
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-auth): emailVerified login gate + claim sets verified [needs R-MIG]"`

### Task R.6: seed + dev script + CLAUDE.md (emailVerified + email hygiene)

**Files:** Modify `prisma/seed.ts` (merchant admin block 1685-1693), `CLAUDE.md` (dev-credential table). Create `prisma/issue-merchant-token.ts`.

- [ ] **Step 1:** In `seed.ts`, change the merchant admin `email: 'merchant@redeemo.com'` to `'merchant@redeemo.test'` in BOTH the `where` and `create` (so the upsert key + the created row use the non-routable domain), and add `emailVerified: true` to the create block. (Section 11.1 + 7.5.)
- [ ] **Step 2:** Update the CLAUDE.md "Dev login credentials" table: Merchant Admin email -> `merchant@redeemo.test` (password unchanged). Add a one-line note that dev-seed merchant uses the non-routable `.test` domain because `redeemo.com` is uncontrolled; the cross-app `.com` seed addresses are a recorded follow-up.
- [ ] **Step 3:** Create `prisma/issue-merchant-token.ts` (adapt `prisma/issue-reset-token.ts` to take a kind arg `claim|reset|verify` + email, writing `merchant-claim:<token>` / `pwd-reset:merchant:<token>` / a `merchant-email-verify:<challenge>` JSON to redis and printing the link/code). Dev tool, no test.
- [ ] **Step 4:** Run `npx prisma db seed` locally to confirm the seeded `merchant@redeemo.test` logs in (`Merchant1234!`) past the new gate.
- [ ] **Step 5: Commit** - `git commit -m "chore(merchant-auth): seed emailVerified + non-routable redeemo.test merchant email + dev token issuer"`

### Slice R PR

- [ ] Verify: `tsc` + `test:unit` green; no `merchant@redeemo.com` left in changed lines (`git diff origin/main | grep 'redeemo.com'` empty for seed); scope-guard clean; no em-dash. The migration file is present ONLY if the checkpoint was approved. Open PR. Merge after CI green.

---

# SLICE 1 - Frontend: BFF-lite httpOnly session foundation

**Branch:** `feat/merchant-web-m1-slice1-session`. **Verify from** `apps/merchant-web`. **PR gate:** `tsc` + `next lint` + `next build` (dummy `NEXT_PUBLIC_API_URL`) + jest green; merchant-web CI job green.

### Task 1.1: env + CSP for Turnstile + API origin

**Files:** Create `apps/merchant-web/.env.example` (+ `.env.local`), modify `apps/merchant-web/lib/securityHeaders.ts`.

- [ ] **Step 1:** `.env.example`: `NEXT_PUBLIC_API_URL=http://localhost:3000`, `NEXT_PUBLIC_TURNSTILE_SITE_KEY=1x00000000000000000000AA` (Cloudflare always-pass test site key).
- [ ] **Step 2:** In `securityHeaders.ts`, add `https://challenges.cloudflare.com` to `script-src`, `frame-src`, and `connect-src`. (Test: extend any existing securityHeaders test, or add one asserting the Turnstile origin is present in the CSP string.)
- [ ] **Step 3: Commit** - `git commit -m "feat(merchant-web): env + Turnstile CSP allowances"`

### Task 1.2: deviceId + server cookie helpers

**Files:** Create `apps/merchant-web/lib/auth/deviceId.ts`, `apps/merchant-web/lib/auth/cookies.ts`. Tests under `__tests__`.

- [ ] **Step 1 (deviceId):** test: `getOrCreateDeviceId()` returns a stable UUID persisted in localStorage (returns the same value on a second call). Implement with `crypto.randomUUID()` + a localStorage key `redeemo_merchant_device_id`.
- [ ] **Step 2 (cookies):** server-only helpers using `next/headers` `cookies()`: `setSessionCookie({refreshToken, sessionId, entityId})` writes an httpOnly+Secure+SameSite=Lax JSON cookie `redeemo_merchant_session` (Secure only in production); `readSessionCookie()`; `clearSessionCookie()`. (These run inside route handlers; unit-test the serialize/parse with a mocked `cookies()`.)
- [ ] **Step 3: Commit** - `git commit -m "feat(merchant-web): deviceId + httpOnly session cookie helpers"`

### Task 1.3: BFF-lite route handlers

**Files:** Create `apps/merchant-web/app/api/merchant-auth/{login,otp-verify,register,register-verify,refresh,logout}/route.ts`. Tests per handler.

- [ ] **Step 1:** For each handler, write a test: it forwards to the backend (`NEXT_PUBLIC_API_URL`/api/v1/merchant/auth/...) and, on a token result, calls `setSessionCookie` with `{refreshToken, sessionId, entityId}` (where `sessionId`/`entityId` are decoded from the access JWT) and returns `{accessToken, merchant}` to the browser; on `OTP_REQUIRED`/`VERIFY_EMAIL_SENT` it returns that shape (no cookie). `refresh` reads the cookie, calls backend `/refresh` with `{refreshToken, sessionId, entityId}`, rotates the cookie, returns `{accessToken}`; `logout` calls backend `/logout` with the Bearer token then `clearSessionCookie`. Mock `fetch` + `cookies()`.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** the handlers. Shared helper `decodeMerchantJwt(accessToken)` (read `sub`+`sessionId` from the unsigned payload, mirror admin-web `decodeAdminJwt`) lives in `lib/auth/session.tsx` or a `lib/auth/jwt.ts`. Example `login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server'
import { setSessionCookie } from '@/lib/auth/cookies'
import { decodeMerchantJwt } from '@/lib/auth/jwt'

const API = process.env.NEXT_PUBLIC_API_URL!
export async function POST(req: NextRequest) {
  const body = await req.json()
  const res = await fetch(`${API}/api/v1/merchant/auth/login`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
  })
  const data = await res.json()
  if (!res.ok) return NextResponse.json(data, { status: res.status })
  if (data.status === 'OTP_REQUIRED') return NextResponse.json({ status: 'OTP_REQUIRED', sessionChallenge: data.sessionChallenge })
  const claims = decodeMerchantJwt(data.accessToken) // { sub, sessionId }
  await setSessionCookie({ refreshToken: data.refreshToken, sessionId: claims.sessionId, entityId: claims.sub })
  return NextResponse.json({ accessToken: data.accessToken, merchant: data.merchant })
}
```

- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-web): BFF-lite auth route handlers (httpOnly refresh cookie)"`

### Task 1.4: session context + api client + auth/profile clients

**Files:** Create `lib/auth/session.tsx`, `lib/api/client.ts`, `lib/api/auth.ts`, `lib/api/profile.ts`; modify `app/providers.tsx`.

- [ ] **Step 1: Tests:** `SessionProvider` exposes `{accessToken, ready, businessName, approvalStatus, refresh(), signOut()}`; on mount it calls `/api/merchant-auth/refresh` once to hydrate the access token (mock fetch). `apiFetch` attaches the in-memory Bearer, on 401 does a single-flight refresh-via-`/api/merchant-auth/refresh` then retries once, and on `SESSION_REVOKED`/`REFRESH_TOKEN_INVALID`/`MERCHANT_SUSPENDED` calls `signOut()` + redirect. `auth.ts` clients post to the BFF-lite endpoints + the direct public endpoints (forgot/reset/claim are direct browser->backend since no token); `loginResponse` is the bimodal union. `profile.ts` `getMerchantProfile()` GETs `/api/v1/merchant/profile` with the Bearer.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement.** `apiFetch` single-flight mirrors admin-web `lib/api/client.ts` but the refresh call hits the local `/api/merchant-auth/refresh` route handler (not the backend directly), and the access token is read from the in-memory session context (not localStorage). `app/providers.tsx`: wrap children with `<SessionProvider>`.
- [ ] **Step 4: Run, PASS** + `next build`.
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-web): in-memory session context + apiFetch single-flight refresh + auth/profile clients"`

### Task 1.5: middleware route gate

**Files:** Create `apps/merchant-web/middleware.ts`. Test.

- [ ] **Step 1: Test:** a request to an `(app)` path with no `redeemo_merchant_session` cookie redirects (307) to `/sign-in?next=<path>`; with the cookie present it passes; `(auth)` paths always pass.
- [ ] **Step 2: Run, FAIL.**
- [ ] **Step 3: Implement** a `middleware.ts` matching the `(app)` group (matcher excludes `/sign-in`, `/otp`, `/forgot-password`, `/reset-password`, `/claim`, `/register`, `/api`, static) that checks `req.cookies.get('redeemo_merchant_session')`; absent -> redirect to `/sign-in?next=`. The client guard (Slice 5) validates for real.
- [ ] **Step 4: Run, PASS.**
- [ ] **Step 5: Commit** - `git commit -m "feat(merchant-web): middleware session-cookie route gate"`

### Slice 1 PR

- [ ] Verify: tsc + lint + build + jest green; scope-guard clean. Open PR. Merge after CI green.

---

# SLICES 2-5 - Frontend entry screens + lifecycle routing

These wire the Slice-1 clients to the Slice-0/R backend contracts. Each screen is a focused task: a route page under `app/(auth)/` (or shell wiring), the exact client call, the documented states + error-code map (spec Section 10), and an RTL test. Use the M0 brand primitives (Button/Input/Label/Card) and the brand tokens. Follow TDD: write the RTL test (render, fill, submit, assert the call + the state), run-fail, implement, run-pass, commit. Each slice is its own PR off updated main.

### SLICE 2 - sign-in + OTP (`feat/merchant-web-m1-slice2-signin`)
- [ ] **Task 2.1: `/sign-in`** (`app/(auth)/sign-in/page.tsx`): email+password form -> `authApi.login` (BFF-lite). Branch on the bimodal response: `status==='OTP_REQUIRED'` -> route to `/otp?challenge=` ; tokens -> set session + route via lifecycle (Slice 5; for now route to `/`). Error map: `INVALID_CREDENTIALS`, `EMAIL_NOT_VERIFIED` (offer a resend link), `MERCHANT_SUSPENDED`/`MERCHANT_DEACTIVATED`/`ACCOUNT_SUSPENDED`. RTL test pins the bimodal branch + the error copy. Commit.
- [ ] **Task 2.2: `/otp`** (`app/(auth)/otp/page.tsx`): 6-digit input carrying `sessionChallenge` -> `authApi.verifyOtp`. Error map: `OTP_INVALID`, `OTP_MAX_ATTEMPTS`, `ACTION_TOKEN_INVALID`. On success set session + route. RTL test. Commit.
- [ ] **Slice 2 PR.**

### SLICE 3 - claim + forgot/reset (`feat/merchant-web-m1-slice3-recovery`)
- [ ] **Task 3.1: `/claim`** (`app/(auth)/claim/page.tsx`): reads `?token=`; new-password + confirm (mirror `passwordSchema` client-side); -> `authApi.claim` (direct). Error map: `CLAIM_TOKEN_EXPIRED` (expired/invalid-link variant), `PASSWORD_POLICY_VIOLATION` (inline). Success -> `/sign-in` with a "password set" state. RTL test (token + expired). Commit.
- [ ] **Task 3.2: `/forgot-password`** (`app/(auth)/forgot-password/page.tsx`): email -> `authApi.forgotPassword`; ALWAYS show the identical generic "if that email is registered, a link has been sent" (anti-enumeration; pinned by an RTL test asserting the message is the same regardless of the call result). Handle `429`. Commit.
- [ ] **Task 3.3: `/reset-password`** (`app/(auth)/reset-password/page.tsx`): reads `?token=`; new-password -> `authApi.resetPassword`. Error map: `RESET_TOKEN_EXPIRED`, `PASSWORD_POLICY_VIOLATION`. Success -> `/sign-in`. RTL test. Commit.
- [ ] **Slice 3 PR.**

### SLICE 4 - self-serve registration + verify (`feat/merchant-web-m1-slice4-register`)
- [ ] **Task 4.1: `/register`** (`app/(auth)/register/page.tsx`): fields firstName, lastName, work email, mobile (optional), password (4-segment strength like the customer app), business name, a **platform-terms checkbox** (links to terms; required), and the **Turnstile widget** (`NEXT_PUBLIC_TURNSTILE_SITE_KEY`; load the Cloudflare script, capture the token). Submit -> `authApi.register` (BFF-lite). On `VERIFY_EMAIL_SENT` route to `/register/verify?challenge=`. Error map: `CAPTCHA_FAILED`, `PASSWORD_POLICY_VIOLATION`, `RATE_LIMITED`. The duplicate-email case returns the SAME `VERIFY_EMAIL_SENT` shape (non-enumeration; the UI must not reveal existence). RTL test with the Turnstile script stubbed (no external call). Commit.
- [ ] **Task 4.2: `/register/verify`** (`app/(auth)/register/verify/page.tsx`): 6-digit code carrying `challenge` -> `authApi.verifyEmail`; on success the response is tokens (auto-login) -> set session + route to the pre-live home (Slice 5). A "resend code" action -> `authApi.resendVerification`. Error map: `OTP_INVALID`, `OTP_MAX_ATTEMPTS`, `VERIFICATION_TOKEN_INVALID`. RTL test. Commit.
- [ ] **Slice 4 PR.**

### SLICE 5 - route protection + lifecycle entry + logout (`feat/merchant-web-m1-slice5-entry`)
- [ ] **Task 5.1: lifecycle derivation** (`lib/auth/lifecycle.ts`): pure `deriveStatusPill(profile)` -> one of the 7 `LifecycleState` values, and `homeFor(state)` -> `'pre-live' | 'live'`, per the spec Section 10 table (collapse `live_new` into `live`). Unit test the derivation for each MerchantStatus/onboardingStep combination in the table.
- [ ] **Task 5.2: client guard** in `MerchantPortalShell` (or `app/(app)/layout.tsx`): `useSession()` ready+authenticated gate with a no-flash placeholder + `router.replace('/sign-in')` on unauthenticated; mirrors admin-web `admin-shell.tsx`. RTL test (no session -> redirect; session -> renders children).
- [ ] **Task 5.3: lifecycle routing + StatusPill**: after auth, `useMerchantProfile()` (React Query over `getMerchantProfile`), derive the StatusPill state, drive `<Sidebar status=...>` (replace the M0 static default), and render the correct placeholder home (`app/(app)/page.tsx` becomes a router that shows a pre-live "setting up / under review" placeholder or a live placeholder per `homeFor`). RTL tests for both homes keyed off a mocked profile.
- [ ] **Task 5.4: logout**: wire the Topbar account button -> a menu/logout calling `authApi.logout` (BFF-lite, clears the cookie) + `signOut()` + redirect to `/sign-in`. RTL test. Commit per task.
- [ ] **Slice 5 PR.**

---

## Test plan (summary)

- **Backend (vitest unit, mocked prisma/redis):** Slice 0 (`merchant-otp.test.ts`: HMAC match/mismatch/cap/dev-bypass/no-send-safe), Slice R (`merchant-register.test.ts`: create+verify, captcha mocked, non-enum duplicate creates nothing, auto-login, resend, rate-limit; `captcha.test.ts`; the `emailVerified` gate + claim transitions), plus updating the 9 existing merchant-auth fixtures for `emailVerified`.
- **Frontend (jest + RTL, mock the route handlers / fetch):** Slice 1 (route handlers, session context refresh-on-mount + single-flight, middleware redirect), Slices 2-5 (each screen's call + states + error map; anti-enum forgot pin; Turnstile stubbed; lifecycle derivation + both homes; guard redirect; logout).
- **No external dependency in tests:** Turnstile verify mocked; email dark; OTP/verify codes via the HMAC primitive.
- **CI:** the `merchant-web` job gates the frontend slices; the backend job (`test:unit` + `tsc`) gates the backend slices.

## Local verification commands

```bash
# backend (repo root)
npx tsc --noEmit
npm run test:unit
# frontend (apps/merchant-web)
npm run typecheck && npm run lint && NEXT_PUBLIC_API_URL=http://localhost:3000 npm test
NEXT_PUBLIC_API_URL=http://localhost:3000 npm run build
# dev exercise while email is dark (run API WITHOUT the email worker):
npx tsx prisma/_get-merchant-otp.ts merchant@redeemo.test   # read the OTP/verify code from the outbox
npx tsx prisma/issue-merchant-token.ts claim <email>        # seed a claim token for the /claim page
```

## Scope guard (per PR)

`git diff --name-only origin/main` limited to that slice's named files. Backend slices touch `src/api/**`, `prisma/**`, `tests/**`, `CLAUDE.md` (Slice R only). Frontend slices touch `apps/merchant-web/**` only. No other app, no unrelated files. `git diff origin/main | grep -P '[\x{2014}\x{2013}]'` empty (no em-dashes in authored content). For Slice R: `git diff origin/main -- prisma/seed.ts | grep 'redeemo.com'` empty.

## Risks and stop-and-report items

- **Task R-MIG migration:** STOP-AND-REPORT. Do not edit `schema.prisma` or run any migrate command without explicit owner approval. The dependent code (login gate, claim, register/verify, seed, fixtures) lands with it.
- **Turnstile production keys + register reachability:** a launch-readiness gate (real Turnstile site + `merchant.redeemo.co.uk` hosting + email live). M1 ships feature-gated (dev test keys, verify mocked in tests).
- **Email dark (Phase 6):** login OTP, registration verify, claim, reset emails queue but do not deliver. Exercise via `_get-merchant-otp.ts` (no email worker running) / `issue-merchant-token.ts`. Not externally launch-ready on email.
- **Single-flight refresh** is mandatory (single-use rotation); a naive per-call refresh kills valid sessions.
- **emailVerified login gate must not lock out existing owners** - the backfill + seed + fixture updates are load-bearing (Task R.5/R.6).
- **Non-enumerating registration** must not copy `registerCustomer`'s `EMAIL_ALREADY_EXISTS` reveal (Task R.4).
- **Seed/demo email hygiene:** no live send may reach `redeemo.com`; the seed merchant moves to `merchant@redeemo.test` (Task R.6); email stays dark.

## PR sequencing

Slice 0 -> Slice R (carries the gated migration) -> Slice 1 -> Slice 2 -> Slice 3 -> Slice 4 -> Slice 5. Each its own PR off updated `main`, tests before merge, CI green before the next slice branches. The migration is generated/applied only inside Slice R after the checkpoint approval.

## Rollback / safety notes

- Each task is its own commit; each slice its own PR (revertable independently).
- All backend changes are additive (new routes/templates/helpers/one column). Reverting a frontend slice removes screens but leaves the backend contracts intact.
- The migration rollback is `ALTER TABLE "MerchantAdmin" DROP COLUMN "emailVerified";` (Task R-MIG); reverting it also requires reverting the login gate / claim / register code that reads the column (so revert the whole Slice R if the column is dropped).
- No production data is touched (dev seed is dev/staging only; production uses `seed-reference.ts`).

## Closed-scope exclusions (M1 does NOT include)

No product surfaces (onboarding wizard content, vouchers, redemptions, branches, staff, business profile, documents, insights, bell, settings, help). No capability/role gating (role-only; defer M3). No real email/SMS delivery (Phase 6). No captcha/httpOnly changes to admin-web/customer-web, and no captcha on login/claim/forgot/reset (registration only). No platform-wide BFF/httpOnly auth migration and no admin-web/platform captcha hardening (recorded follow-ups). No `phoneVerified` column. No `live_new` backend signal. Bell/validate/quick-actions stay inert. The two homes are placeholders, not the real onboarding/dashboard.

---

## Self-review notes

- **Spec coverage:** Slice 0 -> spec 6.1; Slice R -> 6.2 + 7 (migration) + 9 (Turnstile) + 11.1 (seed hygiene); Slice 1 -> 8.1 + 11 (session/CSRF/CORS); Slices 2-5 -> 8.2 + 8.3 + 10 (StatusPill + error map). Risks/exclusions/follow-ups mirror spec 14/15/16.
- **Placeholder scan:** the only "TODO" reference is the existing `service.ts:79` comment being REMOVED (Task 0.2), not a plan placeholder. The migration is a deliberate gated step, not a placeholder.
- **Type/name consistency:** `merchantOtpEmail`/`merchantVerifyEmail`/`merchantAccountExistsEmail`; `registerMerchant`/`verifyMerchantEmail`/`resendMerchantVerification`; `verifyTurnstile`/`isCaptchaEnabled`; `deriveStatusPill`/`homeFor`; the `redeemo_merchant_session` cookie + `redeemo_merchant_device_id` keys; `decodeMerchantJwt` - used consistently across tasks. The merchant refresh body `{refreshToken, sessionId, entityId}` is sourced from the decoded JWT in the BFF-lite handlers (Task 1.3), consistent with the backend contract.
