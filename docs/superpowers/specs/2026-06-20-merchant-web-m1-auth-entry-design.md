# Merchant Portal M1: Auth + Entry Foundation Design

- Date: 2026-06-20
- Status: Design spec (M1 of the Merchant Portal build). Awaiting owner review, then `writing-plans`.
- Tier: 3 (backend contract + behaviour change + one schema migration + new frontend surface).
- Phase: 4 (Merchant Portal), milestone M1. Builds on M0 (`apps/merchant-web` scaffold + brand shell, shipped PR #265).

---

## 1. Context and goal

M0 shipped `apps/merchant-web` with the branded shell, static IA, primitives, and a `merchant-web` CI gate, and deliberately no auth. M1 builds the **real entry foundation**: how a merchant gets into the portal and stays in. It covers two entry paths (admin-invite + claim, and public self-serve registration), the second factor, recovery, session, route protection, and lifecycle-aware landing, against the largely-built backend.

The backend merchant-auth surface is complete (9 endpoints at `/api/v1/merchant/auth` + `GET /api/v1/merchant/profile`). M1 is therefore mostly frontend wiring plus a small set of backend changes that the owner decisions made necessary: wiring the merchant login OTP send (it is a no-send stub today), building a public self-serve registration + email-verification flow, and one additive schema column. There is exactly one migration in M1, treated as a checkpoint (Section 7).

**Goal:** a merchant can register (self-serve) or claim (admin-invited), verify their email, sign in with an email second factor, recover a password, and land on the correct lifecycle home, with a secure session, all implemented in `apps/merchant-web` against the real backend, with email/SMS still dark (Phase 6) but exercisable in dev.

---

## 2. Source / audit references

- M1 live-code audit (8-agent workflow, this session): the verified contracts, gaps, reuse, and risks. Recorded in memory `project_merchant_portal_build_baseline.md` (M1 planning section) + the decisions below.
- Backend: `src/api/auth/merchant/{routes.ts, service.ts, plugin.ts}`, `src/api/auth/admin/service.ts` (the email-OTP template: `loginAdmin` 31-86, `verifyAdminOtp` 88-141), `src/api/auth/customer/service.ts` (`registerCustomer` 99-172, `verifyEmail` 174-189, the registration template), `src/api/admin/merchants/service.ts` (`createMerchantDraft` 311-392), `src/api/shared/{notify.ts, emailTemplates.ts, errors.ts, redis-keys.ts, schemas.ts, session.ts, password.ts}`, `src/api/plugins/rate-limit.ts`, `src/api/merchant/profile/service.ts` (`getMerchantProfile`).
- Schema: `prisma/schema.prisma` enums MerchantStatus (371), VerificationStatus (386), ContractStatus (393), OnboardingStep (962); `MerchantAdmin` (183), `Merchant` (414). Seed: `prisma/seed.ts` merchant admin block (1682-1711).
- Reuse template: `apps/admin-web/lib/api/{client,auth}.ts`, `lib/auth/{session,useSession}.ts`, `app/(auth)/login`, the providers; `apps/customer-web/middleware.ts` (cookie-gate reference). M0 `apps/merchant-web/**`.
- Owner decisions: this brainstorming session (grill-me), recorded in `project_merchant_portal_build_baseline.md`.

---

## 3. Locked decisions (owner)

1. **Login second factor = email-OTP now**, mirroring the admin HMAC pattern (`loginAdmin`/`verifyAdminOtp`). Replaces the dead Twilio-SMS merchant path. No schema.
2. **Self-serve registration is IN M1**, using an explicit email-verification step backed by a new `MerchantAdmin.emailVerified` column (the migration checkpoint, Section 7). Registration is non-enumerating, rate-limited, captcha-protected (Turnstile), owner-password-only.
3. **Token transport = httpOnly Secure refresh/session cookie + in-memory access token**, via a merchant-web Next BFF-lite (route handlers). Refresh token never reaches browser JS. Merchant-web-only; no backend change.
4. **Route protection = Next middleware** (httpOnly session-cookie presence, redirect-before-paint) + client refresh-on-mount validation.
5. **Lifecycle entry = two placeholder homes** (pre-live vs live) + a StatusPill derived from `status`/`onboardingStep`/`verificationStatus`, with `live_new` collapsed into `live`. No schema.
6. **Captcha = Cloudflare Turnstile on public self-serve registration only**, backend token-verified, feature-gated with clear dev/test/disabled behaviour, tests mock the provider. Admin-web/platform captcha is a separate recorded follow-up.

Confirmed minor decisions: registration email-verification uses a **6-digit code** (same HMAC mechanism as the login OTP; robust while `merchant.redeemo.co.uk` is unhosted), not a verify-link; registration includes a **platform-terms checkbox** distinct from the M2 merchant contract.

---

## 4. Cross-check table (anchor -> live reality -> M1 decision)

| Anchor | Live code reality | M1 decision |
|---|---|---|
| Sign-in | `POST /login`; bimodal 200 (`OTP_REQUIRED`+sessionChallenge OR tokens); password step works (service.ts:41-85) | Frontend branches on the response; add an `emailVerified` login gate (Section 6.1) |
| Login OTP | No code is ever sent (service.ts:79 stub); Twilio dead for phoneless drafts | BUILD email-OTP (Slice 0), mirror admin HMAC; drop the SMS path |
| Email-OTP template | `loginAdmin`/`verifyAdminOtp` already do exactly this (code+HMAC+notify+attempt-cap+dev-bypass) | Copy the pattern into merchant; add `merchantOtpEmail` |
| Forgot / reset | Built, anti-enum + atomic limiter; link `/reset-password?token=` | Frontend-only; preserve anti-enum |
| Claim | Built; `/claim?token=` 7-day single-use; sets `otpVerifiedAt` | Frontend-only; claim also sets `emailVerified=true` (Section 6.2) |
| Self-serve registration | No route anywhere; customer `registerCustomer` exists but REVEALS `EMAIL_ALREADY_EXISTS` (enumeration) | BUILD `POST /register` + verify; NON-enumerating (diverge from customer); + migration |
| Email-verify flag | `MerchantAdmin` has no `emailVerified`; customer `User` has it | ADD `MerchantAdmin.emailVerified` (migration checkpoint, Section 7) |
| Captcha | No captcha anywhere in repo | BUILD Turnstile verify on `/register` only; feature-gated |
| Session/refresh | refresh needs `{refreshToken, sessionId, entityId}`; single-use rotation; per-request revoke (plugin.ts:15-43) | BFF-lite holds these in an httpOnly cookie; single-flight refresh |
| Token storage | Backend transport-agnostic (token in body) | httpOnly refresh cookie + in-memory access (BFF-lite) |
| Route protection | `authenticateMerchant` exists; access token not server-readable | Next middleware on the cookie + client refresh-on-mount |
| Lifecycle source | login returns `approvalStatus` only; `GET /merchant/profile` returns status+onboardingStep+verificationStatus+contractStatus | Route off `/merchant/profile`; derive StatusPill (Section 9) |
| `live_new` signal | No backend signal exists | Collapse into `live` for M1 |
| Capability/role | merchant JWT is role-only; no per-person caps | Out of M1 (role-only session); defer to M3 |
| Schema | only `emailVerified` is missing | ONE additive migration (Section 7); nothing else |

---

## 5. Architecture overview

**Two entry paths, one session model.**
- **Admin-invite + claim:** admin creates a draft (existing) -> claim email -> `/claim?token=` set-password -> sign in. Claim proves email (sets `emailVerified=true`).
- **Public self-serve registration:** `/register` (Turnstile) -> create draft + email a 6-digit verify code -> `/register/verify` enter code -> `emailVerified=true` + auto-login -> setting-up home.

Both converge on the same session + lifecycle routing.

**Session model (BFF-lite).** The browser never holds the long-lived refresh token. A thin set of Next route handlers in `apps/merchant-web/app/api/merchant-auth/*` proxy login/otp-verify/refresh/logout to the backend and keep `{refreshToken, sessionId, entityId}` in an httpOnly+Secure+SameSite cookie. The browser keeps only a short-lived (15m) access token in memory (React context). Authed reads (`GET /merchant/profile`, logout) go browser -> backend with the in-memory Bearer token. On reload, the app refreshes-on-mount from the cookie to re-mint the access token.

**Route protection.** Next middleware gates `app/(app)/**` on the presence of the httpOnly session cookie (redirect-before-paint to `/sign-in`); the client validates for real on mount (a 401 `SESSION_REVOKED`/`REFRESH_TOKEN_INVALID` clears the cookie + redirects).

**Second factor.** One shared 6-digit email-code primitive (HMAC-bound, attempt-capped, dev-bypass in development/test), used in two contexts: login OTP (new device) and registration email-verify.

**Lifecycle entry.** After authentication the app fetches `GET /merchant/profile`, derives the StatusPill state, and routes to one of two placeholder homes (pre-live vs live).

---

## 6. Backend changes

M1 touches the backend in two slices. All are additive; only Slice R carries a migration.

### 6.1 Slice 0: merchant login email-OTP (no schema)

Mirror `loginAdmin`/`verifyAdminOtp` (src/api/auth/admin/service.ts) into the merchant path.

- **`loginMerchant`** (service.ts:72-82): in the `otpRequired` branch, generate `code = crypto.randomInt(0,1_000_000).padStart(6,'0')`, `codeHmac = HMAC-SHA256(ENCRYPTION_KEY, challenge + ':' + code)`, store `{adminId, deviceId, deviceType, codeHmac, attempts:0}` in `RedisKey.otpChallenge('merchant', challenge)` (was `{adminId,deviceId,deviceType}`), and dispatch via `notify({recipientType:'MERCHANT_ADMIN', type:'merchant_login_otp', email: merchantOtpEmail(code), ip})` best-effort (try/catch; never reveal delivery). Return `{status:'OTP_REQUIRED', sessionChallenge}` unchanged. Remove the `TODO Phase 3` Twilio comment.
- **`verifyMerchantOtp`** (service.ts:87-130): parse `codeHmac, attempts`; verify via timing-safe HMAC compare + the `000000` dev-bypass gated to `{development,test}` (fail-closed otherwise); on mismatch increment `attempts` with `KEEPTTL` and delete the challenge at `MERCHANT_OTP_MAX_ATTEMPTS` (=5, matching admin); on match delete + set `otpVerifiedAt` + seed `known-devices:merchant:<id>` (keep) + `completeMerchantLogin`. **Remove** the Twilio `verifyOtp(admin.phone)` path entirely (it is the dead branch).
- **`emailTemplates.ts`**: add `merchantOtpEmail(code)` mirroring `adminOtpEmail` (no link, the 6-digit code is the whole payload, never logged).
- **`loginMerchant` `emailVerified` gate:** after password verify and the status checks, add `if (!admin.emailVerified) throw new AppError('EMAIL_NOT_VERIFIED')` (a 403, new error code) with a frontend resend path. Because claimed/backfilled accounts are `emailVerified=true`, this only bites an unverified self-serve registration. (Depends on Slice R's migration for the column; sequence Slice R before this gate, or land the gate with Slice R.)
- **Dev tooling:** a merchant OTP/token-retrieval dev script (adapt `prisma/_get-admin-otp.ts` to read `CommunicationLog` for `type IN ('merchant_login_otp','merchant_email_verify','merchant_claim','password_reset')`, requires the local email worker NOT running; and a merchant token-issuer that writes `merchant-claim:<token>`/`pwd-reset:merchant:<token>` to Redis, adapting `prisma/issue-reset-token.ts` which is customer-only).
- **Tests:** backend unit tests mirroring the admin OTP tests (code-HMAC match issues tokens, wrong-code increments attempts then 429 at cap, dev-bypass in test env, no-send-failure never changes the response).

Note: the shared `verifyOtp`/`clearOtpAttempts` Twilio SMS primitive (`shared/otp.ts`) stays for the customer path; only the merchant path stops using it. Do not leave both wired (the dead SMS path against an empty phone yields a confusing `OTP_INVALID`).

### 6.2 Slice R: self-serve registration + email-verify + captcha (one migration)

- **New route `POST /api/v1/merchant/auth/register`** (public, new `register` rate-limit tier; see Section 8). Body (Zod): `firstName, lastName, email (emailSchema), mobile? + mobileCountryCode?, password (passwordSchema), businessName, termsAccepted (literal true), turnstileToken`. Flow:
  1. **Captcha:** verify `turnstileToken` via the Turnstile helper (Section 8). Failure -> `CAPTCHA_FAILED` (400). Skipped when captcha is disabled (dev/test).
  2. **Non-enumerating duplicate handling (diverges from `registerCustomer`):** look up the email. If it exists, do NOT create anything and do NOT throw `EMAIL_ALREADY_EXISTS`; return the SAME generic success shape as a new registration, and best-effort send an "account already exists, sign in or reset" email to that address. (This preserves the anti-enumeration guarantee the owner required; the customer flow reveals existence and must not be copied here.)
  3. If new: in one `$transaction`, mirror `createMerchantDraft`: `Merchant.create({status:'REGISTERED'})` (defaults verificationStatus NOT_SUBMITTED, onboardingStep REGISTERED, contractStatus NOT_SIGNED), `MerchantAdmin.create({email, firstName, lastName, passwordHash: hashPassword(password), phone: mobile?, phoneCountryCode?, mustChangePassword:false, emailVerified:false, status:'ACTIVE'})`, `MerchantMembership.create({role:'OWNER', allBranches:true, status:'ACTIVE'})`. Record platform-terms acceptance (audit event `MERCHANT_SELF_REGISTERED` with the terms version; no schema column for the consent in M1; captured in AuditLog, mirroring the no-source-column decision). Owner sets the password here; there is no admin-set password.
  4. **Email-verify code:** generate a 6-digit code + `codeHmac` (same primitive as Slice 0), store `{adminId, deviceId, deviceType, codeHmac, attempts:0}` at `RedisKey.emailVerify` (or a new `merchant-email-verify:<challenge>` key) with a verify TTL (recommend 24h, matching the customer `EMAIL_VERIFY_TTL`), and `notify({recipientType:'MERCHANT_ADMIN', type:'merchant_email_verify', email: merchantVerifyEmail(code), ip})`. Return `{status:'VERIFY_EMAIL_SENT', challenge}` (the same shape whether new or pre-existing, for anti-enumeration).
- **New route `POST /api/v1/merchant/auth/register/verify`** (public, rate-limited). Body: `{challenge, code (len 6)}`. Verify the HMAC + attempt cap (same as Slice 0). On match: set `MerchantAdmin.emailVerified=true` + `otpVerifiedAt=now` + seed `known-devices:merchant:<id>` with the registering deviceId (so the immediate next session on this browser skips the login OTP), then issue tokens (`completeMerchantLogin`) and return them, auto-login into the setting-up home. On miss: `OTP_INVALID`/`OTP_MAX_ATTEMPTS`; stale/expired challenge -> `VERIFICATION_TOKEN_INVALID`.
- **New route `POST /api/v1/merchant/auth/resend-verification`** (public, rate-limited, anti-enum): re-issue a verify code for an unverified account; generic response.
- **`claimMerchantAccount`** (service.ts:346-368): also set `emailVerified=true` going forward (claim proves email control). Optionally seed the claiming device into `known-devices` so the immediate post-claim login skips the OTP (consistent with registration); recommend yes.
- **`merchantVerifyEmail(code)`** template in `emailTemplates.ts`.
- **Phone:** `MerchantAdmin.phone` is nullable and NOT unique, so mobile is captured-not-verified (prototype 2AJ) with no phone-collision check. `phoneVerified` is not added in M1.
- **`businessName`:** not unique (admin review gates duplicates); no uniqueness check.
- **THE MIGRATION:** add `MerchantAdmin.emailVerified` (Section 7). This is the only schema change in M1 and is gated by the checkpoint.

Registration/verify backend tests: register creates the draft + verify code (captcha mocked), duplicate-email returns the generic non-enumerating shape and creates nothing, verify sets emailVerified + auto-logs-in, captcha-failure path, resend path, rate-limit 429.

---

## 7. Schema migration CHECKPOINT (not approved; do not create or run until explicitly signed off)

This is the single M1 migration. It is recorded here as a checkpoint per owner instruction. The implementer must stop and obtain explicit approval before generating or applying it.

### 7.1 Prisma change
In `model MerchantAdmin` (schema.prisma:183), add:
```prisma
emailVerified      Boolean    @default(false)
```

### 7.2 Forward SQL (Prisma migration body)
```sql
ALTER TABLE "MerchantAdmin" ADD COLUMN "emailVerified" BOOLEAN NOT NULL DEFAULT false;
```

### 7.3 Backfill (in the same migration, after the column add)
```sql
-- Every MerchantAdmin that already has a password is either an admin-created
-- owner who completed the claim flow (claim proves email control) or a dev/seed
-- account. Mark them verified so the new emailVerified login gate does not lock
-- out any existing owner. Unclaimed admin-drafts (passwordHash NULL) stay false:
-- they cannot log in anyway (loginMerchant throws INVALID_CREDENTIALS when there
-- is no passwordHash, before the emailVerified gate), and claimMerchantAccount
-- sets emailVerified=true when they claim.
UPDATE "MerchantAdmin" SET "emailVerified" = true WHERE "passwordHash" IS NOT NULL;
```

### 7.4 Rollback
```sql
ALTER TABLE "MerchantAdmin" DROP COLUMN "emailVerified";
```

### 7.5 Affected code paths (must change with the migration)
- `loginMerchant`: add the `emailVerified` gate (Section 6.1).
- `claimMerchantAccount`: set `emailVerified=true` (Section 6.2).
- `register`/`register/verify`: set `emailVerified=false` then `true` (Section 6.2).
- `getMerchantProfile` (and any admin merchant-detail read) Prisma `select`/return shape: `emailVerified` becomes available; surface it where useful (admin detail may show verification state).
- **`prisma/seed.ts` (1685-1693):** add `emailVerified: true` to the `merchantAdmin.upsert` create block. Without this, a fresh seed after the migration creates `merchant@redeemo.com` with the default `false`, and the new login gate would block the seeded dev login (`Merchant1234!`). The seed uses `upsert` with `update:{}`, so re-seeding an EXISTING DB will not change the value, but the migration backfill already covers the pre-existing seeded row (it has a `passwordHash`); the create-block addition covers fresh seeds. Separately, and independent of this migration, the dev-seed merchant email is changed to the non-routable `merchant@redeemo.test` (Section 11.1).
- **Dev/QA scripts** that create or reset MerchantAdmins (e.g. any `prisma/*` merchant helper, `reset-user-password.ts`-style) must set `emailVerified=true` if the account is meant to log in.
- **Backend test fixtures** (the 9 merchant-auth test files under `tests/api/auth/`) that create a MerchantAdmin and then exercise login must add `emailVerified: true` to the fixture, or the new gate yields `EMAIL_NOT_VERIFIED`. The claim/register tests will exercise the flag transitions explicitly.

### 7.6 Backfill edge-case analysis (the careful part)
- **Existing admin-created + claimed owners (passwordHash set):** backfill -> `true`. Correct: the claim link proved email control. They log in normally.
- **Existing admin-created drafts NOT yet claimed (passwordHash NULL):** stay `false`. Safe: they cannot authenticate (no password -> `INVALID_CREDENTIALS` before the gate). On claim, `claimMerchantAccount` sets `true`.
- **Seeded account `merchant@redeemo.com` (passwordHash set):** backfill -> `true` on existing DBs; `seed.ts` create-block addition -> `true` on fresh seeds. Either way the dev login is not blocked.
- **Other seeded/dev/test merchant accounts created by scripts:** post-migration default is `false`; scripts that need login must set `true` (enumerated above). No data corruption, just a login gate.
- **Future self-serve registrants:** created `false` at register, `true` at verify. The backfill does not touch them (it runs once, at migration time, before any self-serve account exists).
- **No timing/concurrency risk:** the column add + backfill are a single additive migration on a small table; `DEFAULT false` makes the add non-blocking for existing rows. There is no data loss; rollback simply drops the column.
- **Idempotency:** the backfill is idempotent (re-running sets the same rows true). The migration itself is one-shot via Prisma's migration ledger.

---

## 8. Frontend architecture (apps/merchant-web)

All new, under `apps/merchant-web`. Diverges from the admin-web localStorage reuse because of the httpOnly decision.

### 8.1 BFF-lite session layer
- `app/api/merchant-auth/login/route.ts`, `.../otp-verify/route.ts`, `.../register/route.ts`, `.../register-verify/route.ts`, `.../refresh/route.ts`, `.../logout/route.ts`: server route handlers that call the backend, and on a token result set an httpOnly+Secure+SameSite=Lax cookie `redeemo_merchant_session` holding `{refreshToken, sessionId, entityId}` (and a separate non-sensitive presence flag if needed for middleware), returning `{accessToken, merchant}` (or `{status:'OTP_REQUIRED'|'VERIFY_EMAIL_SENT', challenge}`) to the browser. `refresh` reads the cookie, calls the backend `/refresh`, rotates the cookie, returns the new access token. `logout` calls the backend with the Bearer token and clears the cookie.
- `lib/auth/session.tsx`: an in-memory access-token context (`SessionProvider` exposing `{accessToken, businessName, approvalStatus, ready, refresh(), signOut()}`); refresh-on-mount (call `/api/merchant-auth/refresh` once on load to hydrate the access token from the cookie); decode the access JWT in memory for `sub`/`sessionId` if needed for display. No `localStorage` token storage; no capability mirror (role-only).
- `lib/api/client.ts`: `apiFetch` for browser -> backend authed calls (Bearer = in-memory access token), with a single-flight 401 -> refresh-via-the-route-handler -> retry-once; on `SESSION_REVOKED`/`REFRESH_TOKEN_INVALID`/`MERCHANT_SUSPENDED` -> `signOut()` + redirect to `/sign-in`.
- `lib/api/auth.ts`: typed clients for the BFF-lite endpoints + the direct public endpoints (forgot/reset/claim/register/verify), Zod-validated against the backend contract; `loginResponse` is the bimodal union.
- `lib/api/profile.ts`: `getMerchantProfile()` for lifecycle routing.
- `providers.tsx`: wrap with `SessionProvider`.
- `middleware.ts`: gate `app/(app)/**` on the session-cookie presence (redirect-before-paint to `/sign-in?next=`); allow `(auth)/*` always.
- `lib/securityHeaders.ts`: extend CSP for Turnstile (`script-src`/`frame-src`/`connect-src` add `https://challenges.cloudflare.com`). Merchant-web-only.
- Env: `NEXT_PUBLIC_API_URL` (must match the API origin for CSP `connect-src` and CORS), `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Cookie secret/signing as needed for the route handlers.

### 8.2 (auth) screens
At the contract-bound paths where applicable: `app/(auth)/sign-in`, `app/(auth)/otp`, `app/(auth)/forgot-password`, `app/(auth)/reset-password` (reads `?token=`), `app/(auth)/claim` (reads `?token=`, + expired variant), `app/(auth)/register`, `app/(auth)/register/verify`. The sign-in screen branches on the bimodal login response; the register screen mounts the Turnstile widget. All map the backend error codes to UI copy (Section 10). Forgot-password shows the identical generic message for every outcome (anti-enumeration).

### 8.3 Lifecycle-aware entry + StatusPill
After auth, fetch `getMerchantProfile`, derive the StatusPill state (Section 9), drive the Sidebar StatusPill, and route to a pre-live placeholder home (setting-up / under review / changes) or a live placeholder home (`ACTIVE`). Wire the Topbar account menu -> logout. Bell/validate/quick-actions stay inert.

---

## 9. Captcha (Cloudflare Turnstile, registration only)

- **Backend helper** `src/api/shared/captcha.ts`: `verifyTurnstile(token, ip)` POSTs to `https://challenges.cloudflare.com/turnstile/v0/siteverify` with `{secret: TURNSTILE_SECRET_KEY, response: token, remoteip: ip}`; returns success/failure. **Feature-gated:** when `TURNSTILE_SECRET_KEY` is unset / a `CAPTCHA_ENABLED` flag is off (default in dev/test), `verifyTurnstile` returns success without a network call. Wired ONLY into `POST /register`.
- **Env:** backend `TURNSTILE_SECRET_KEY` (feature-gated, like `RESEND_API_KEY`/`R2_*` in `env.ts`); frontend `NEXT_PUBLIC_TURNSTILE_SITE_KEY`. Dev/test use Cloudflare's documented always-pass test keys; production keys are a launch-readiness gate (a real Turnstile site, owner/devops).
- **Tests:** mock `verifyTurnstile` (no external provider call), per the owner constraint. Frontend tests render the register form with the widget stubbed.
- **Scope:** registration only. No captcha on login/otp/claim/forgot/reset or any other surface, and none on admin-web/customer-web (the separate recorded follow-up).

---

## 10. StatusPill derivation + two homes

The StatusPill UI vocabulary is composed from backend fields (no 1:1 enum). For M1, derive from `merchant.status` + `merchant.onboardingStep` (and `verificationStatus` where it disambiguates):

| StatusPill state | Derived from | Home |
|---|---|---|
| `setup` | onboardingStep in {REGISTERED, BRANCH_ADDED, CONTRACT_SIGNED, RMV_CONFIGURED} (status REGISTERED) | pre-live |
| `submitted` | onboardingStep SUBMITTED | pre-live |
| `in_review` | onboardingStep UNDER_REVIEW (or status PENDING_APPROVAL) | pre-live |
| `changes` | onboardingStep in {NEEDS_CHANGES, REJECTED} | pre-live |
| `live` | status ACTIVE (onboardingStep APPROVED/LIVE) | live |
| `live_new` | (collapsed into `live` for M1; no backend signal) | live |
| `suspended` | status SUSPENDED | n/a (login already blocks SUSPENDED -> `MERCHANT_SUSPENDED`; only reachable mid-session via revoke) |

`INACTIVE` and `SUSPENDED` never reach a home in normal flow (login throws `MERCHANT_DEACTIVATED`/`MERCHANT_SUSPENDED` before token issue; mid-session suspension surfaces as `SESSION_REVOKED` -> sign-out). The two placeholder homes are deliberate stand-ins for the real onboarding (M2) and dashboard (M5).

Error-code -> UI map (the screens must handle): `INVALID_CREDENTIALS` 401, `EMAIL_NOT_VERIFIED` 403 (new; offers resend), `MERCHANT_SUSPENDED`/`MERCHANT_DEACTIVATED`/`ACCOUNT_SUSPENDED` 403, `OTP_INVALID` 400, `OTP_MAX_ATTEMPTS` 429, `ACTION_TOKEN_INVALID` 400, `VERIFICATION_TOKEN_INVALID` 400, `CLAIM_TOKEN_EXPIRED` 400, `RESET_TOKEN_EXPIRED` 400, `PASSWORD_POLICY_VIOLATION` 400, `CAPTCHA_FAILED` 400, `REFRESH_TOKEN_INVALID`/`SESSION_REVOKED` 401, `PWD_RESET_RATE_LIMITED`/`RATE_LIMITED` 429.

---

## 11. Security / rate-limit / session model

- **Anti-enumeration:** forgot-password keeps the existing identical generic response. Registration is non-enumerating (Section 6.2): duplicate email returns the same shape + an account-exists email, never `EMAIL_ALREADY_EXISTS`. (Note: this is a deliberate divergence from `registerCustomer`, which reveals existence.)
- **Rate limits:** add a `register` tier to `src/api/plugins/rate-limit.ts` (recommend per-IP `prod: 5/hour` for register, plus the existing per-IP edge limiter); register/verify/resend also inherit the `notify()` email caps (5/recipient/hour, 200/IP/day). Login/forgot/claim tiers already exist. Consider an `otpVerify`-style tier for the new verify/register-verify routes (the admin `otpVerify` tier is the template).
- **Captcha:** Turnstile on register (Section 9) as the bot gate.
- **Session:** httpOnly+Secure+SameSite=Lax cookie for the refresh material; in-memory 15m access token; single-flight refresh (mandatory because the backend rotates the refresh token single-use); per-request backend revocation means `SESSION_REVOKED`/`REFRESH_TOKEN_INVALID`/`MERCHANT_SUSPENDED` must hard-logout, never retry-loop.
- **CSRF:** the cookie is only consumed by same-origin Next route handlers; SameSite=Lax + same-origin handlers mitigate CSRF for refresh/logout. Authed product calls use the Bearer header (not cookie auth), so they are not CSRF-exposed.
- **CORS:** the deployed backend `CORS_ORIGIN` must include the merchant-web origin (for the browser -> backend Bearer reads). Deploy-config, not code.
- **Token hygiene:** the 6-digit codes and all tokens are never logged or returned; the claim/reset/verify tokens are the credential.

### 11.1 Seed / demo email hygiene (non-routable domains)

Redeemo owns `redeemo.co.uk`, NOT `redeemo.com`. The dev seed (`prisma/seed.ts`) currently uses `merchant@redeemo.com` (and `admin@/customer@/staff@redeemo.com`), an UNCONTROLLED `.com` domain. This is inert today (email is dark; `EMAIL_SANDBOX` rewrites recipients to an allowlist), but M1 begins queuing merchant login-OTP and registration-verify emails to the seeded merchant address, so it must be made safe before any live send can occur.

M1 changes:
- **Change the dev-seed merchant email to a non-routable reserved domain:** `merchant@redeemo.test` (RFC 6761/2606 reserve `.test` as guaranteed never-resolvable / never-deliverable; `.local` is mDNS-reserved and avoided here). Password unchanged (`Merchant1234!`). Update the CLAUDE.md dev-credential table to match.
- **Live-send guards stay in force through M1:** email remains DARK (`EMAIL_ENABLED=false`) in dev/staging; M1 is exercised via the dark outbox / dev token scripts, never real sends. When email goes live (Phase 6), the `EMAIL_SANDBOX` allowlist plus the `.test` seed addresses being undeliverable mean no OTP/verify mail can reach an uncontrolled domain. A seeded/demo merchant must never trigger a real send to `redeemo.com`.
- **Production safety:** the dev seed (with these accounts) is dev/staging only; the production-safe `prisma/seed-reference.ts` does not create demo merchant logins, so no `.com` (or other demo) address exists in production.

Handling existing local/staging seed accounts:
- The seed upserts by email, so changing the address changes the upsert key. On a fresh DB (`prisma migrate reset` + seed, the standard dev reset) you get the `merchant@redeemo.test` account only. On a long-lived dev/staging DB that already holds `merchant@redeemo.com`, a re-seed would create the `.test` account alongside the stale `.com` row; handle by resetting the dev DB (preferred) or a one-off rename of the email at the next reseed/migration window. There is no active leak in the interim because email is dark and sandboxed.
- This change is INDEPENDENT of the `emailVerified` migration (it is a seed-data + doc change, not schema) and does NOT require the migration checkpoint approval. It rides with the other `seed.ts` edits in Slice R but is separately applicable.

Cross-app note (recorded follow-up, NOT in M1): the same uncontrolled-`.com` issue applies to the `admin@/customer@/staff@redeemo.com` dev-seed addresses, and admin-web ALREADY queues admin login-OTP email to `admin@redeemo.com`. A small platform-wide seed-email-hygiene follow-up should move all dev-seed addresses to `.test` and confirm no live path can send to an uncontrolled domain. M1 changes only the merchant seed address.

---

## 12. Slice breakdown + PR sequencing

Each slice is a plan-first PR off updated `main`, tests before merge. Backend slices first (they define the contracts the frontend consumes); Slice R carries the migration checkpoint.

1. **Slice 0 (backend, no schema):** merchant login email-OTP (`loginMerchant`/`verifyMerchantOtp` + `merchantOtpEmail` + dev OTP retrieval). Backend unit tests.
2. **Slice R (backend + the migration checkpoint):** `POST /register` + `/register/verify` + `/resend-verification` (createMerchantDraft-mirror, non-enum, rate-limited, Turnstile) + `claimMerchantAccount` sets `emailVerified` + the `loginMerchant` `emailVerified` gate + the Turnstile helper + the `MerchantAdmin.emailVerified` migration (stop-and-report gate) + `seed.ts`/fixtures/scripts updates. Backend unit tests (captcha mocked).
3. **Slice 1 (frontend):** BFF-lite session layer (route handlers, in-memory access context, middleware, api client, profile client, envs, CSP). Tests.
4. **Slice 2 (frontend):** sign-in + OTP screens.
5. **Slice 3 (frontend):** claim + forgot/reset screens.
6. **Slice 4 (frontend):** self-serve registration + email-verify screens (Turnstile widget).
7. **Slice 5 (frontend):** route protection + two-home lifecycle entry (StatusPill derivation) + logout wiring.

The migration is generated/applied only at Slice R, after the explicit checkpoint approval (Section 7). Frontend slices can begin against Slice 0/R contracts once those merge.

---

## 13. Test plan

- **Backend (vitest unit, mocked prisma/redis):** Slice 0 email-OTP (HMAC match/mismatch/cap/dev-bypass/no-send-safe); Slice R register (create + verify-code, captcha mocked, non-enum duplicate, auto-login, resend, rate-limit, `emailVerified` transitions, claim sets verified, login gate). Update the 9 existing merchant-auth fixtures for `emailVerified`.
- **Frontend (jest + RTL, mock fetch / the route handlers):** api client (single-flight refresh, error mapping), session context (in-memory token, refresh-on-mount, sign-out on revoke), the (auth) page tests (sign-in bimodal branch, OTP, forgot generic-success, reset token+policy/expired, claim token+expired, register + Turnstile-stubbed + verify), middleware/guard redirect, lifecycle routing keyed off `approvalStatus`/profile, StatusPill derivation.
- **No external dependency in tests:** Turnstile verify mocked; email dark; OTP codes via the HMAC primitive (no network).
- CI: the existing `merchant-web` job gates the frontend; the backend slices add unit tests to the backend job. No new infra.

---

## 14. Risks and stop-and-report items

- **STOP-AND-REPORT: the `MerchantAdmin.emailVerified` migration** (Section 7). Do not generate or run it without explicit approval. The backfill, seed update, and fixture updates ride with it.
- **STOP-AND-REPORT: Turnstile production keys + the public register reachability** are a launch-readiness gate (real Turnstile site + `merchant.redeemo.co.uk` hosting + email live). M1 ships the flow feature-gated and dev/staging-exercisable, not production-public.
- **STOP-AND-REPORT: email is dark (Phase 6).** Login OTP, registration verify, claim, and reset emails queue but do not deliver until Resend. M1 is exercisable via the dev outbox/token scripts; not externally launch-ready on email.
- The httpOnly BFF-lite diverges from the admin-web reuse and adds the route-handler layer + CSRF/SameSite/CORS considerations (Section 11); it stays merchant-web-only.
- Single-flight refresh is mandatory (single-use rotation); a naive per-call refresh would kill valid sessions.
- The new `emailVerified` login gate must not lock out existing owners (the backfill + seed + fixture updates are load-bearing; Section 7.5/7.6).
- Non-enumerating registration must be implemented carefully (do not copy `registerCustomer`'s `EMAIL_ALREADY_EXISTS` reveal).
- Seed/demo email hygiene: M1 must not let a live OTP/verify send reach the uncontrolled `redeemo.com` domain. The dev-seed merchant email moves to `merchant@redeemo.test`, email stays dark/sandboxed, and production has no demo merchant logins (Section 11.1). The cross-app `.com` dev-seed addresses are a recorded follow-up.

---

## 15. Closed-scope exclusions (M1 does NOT include)

No product surfaces (onboarding wizard content, vouchers, redemptions, branches, staff, business profile, documents, insights, notification bell, settings, help). No capability/role gating (role-only; defer M3). No real email/SMS delivery (Phase 6; M1 wires the contract + dark pipeline + dev retrieval). No captcha or httpOnly changes to admin-web/customer-web, and no captcha on login/claim/forgot/reset (registration only). No platform-wide BFF/httpOnly auth migration and no admin-web/platform captcha hardening (the two recorded follow-ups). No `phoneVerified` column (deferred until phone-verification is built). No `live_new` backend signal. Bell/validate/quick-actions stay inert. The two homes are placeholders, not the real onboarding/dashboard.

---

## 16. Recorded follow-ups (cross-reference)

Both are explicitly OUT of M1 (recorded in `project_merchant_portal_build_baseline.md`):
- **Tier-3 platform-wide BFF/httpOnly auth migration** (admin-web + customer-web + merchant-web unified; inspect all auth/session flows, CORS/cookie/CSRF, refresh/logout, deploy domains, rollback first).
- **admin-web / platform captcha + abuse-protection hardening** (admin-web login/OTP/forgot-password; assess customer-web; provider + rate-limit/OTP interaction).
- **Platform-wide seed/demo email hygiene** (move all dev-seed addresses `admin@/customer@/staff@/merchant@redeemo.com` to non-routable `.test`; confirm no live send path can reach an uncontrolled domain; note admin-web already queues admin OTP to `admin@redeemo.com`). M1 changes only the merchant seed address (Section 11.1).
