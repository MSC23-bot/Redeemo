---
paths:
  - "apps/merchant-web/**"
---

# Merchant portal (Next.js) rules

- Dev port 3003. Full brand layer (customer-web fonts + prototype `tokens.css`), unlike the
  deliberately neutral admin-web.
- Session model: the browser calls the backend DIRECTLY at `NEXT_PUBLIC_API_URL`
  (`lib/api/client.ts` `apiFetch`) for all data endpoints, attaching an IN-MEMORY bearer
  token (`lib/auth/tokenStore`; never localStorage). ONLY the auth lifecycle
  (login/refresh/logout/OTP) routes through Next route handlers, which hold the httpOnly
  refresh cookie and back the single 401-then-refresh-once hop; those handlers carry
  `assertSameOrigin` + `safeNext`.
- Tenant scoping is central: `resolveMerchantContext` (role/branch-scope aware) vs
  `resolveAdminMerchant` (owner-only, safe-deny). Every new backend route must go through
  the right resolver; the two app-root redemption routes have bespoke guards; IDOR checks
  join via `branch.merchantId`.
- Wire data: Prisma Decimal fields arrive as JSON STRINGS (branch lat/lng, estimatedSaving).
  Zod schemas here must use `z.coerce.number()`, never `z.number()` (PR #327 bug class:
  invisible to jest because apiFetch is mocked; only browser tests catch it).
- Privacy: customer identity in merchant surfaces is first name + last initial ONLY; never
  email/phone; `redemptionPin` and raw R2 keys are never selected or returned.
- Voucher semantics: flagship (RMV) lane is byte-identical/locked where marked; the
  nullable-clear contract (explicit null clears saved imageUrl/expiryDate, DRAFT-only PATCH)
  is pinned both directions; end-date UI is TIME_LIMITED-only.
- Browser smoke lane (`npx playwright test`): deterministic local lane with an enforced
  dead-port + route-mock safety boundary; strict zero-console-error default, count-bounded
  expected-error opt-in per spec. Its CI job is ADVISORY (promotion is an open owner decision).
- Production-resilience standing checklist (§W): every merchant slice must explicitly
  consider high-traffic flows and third-party dependencies (timeouts, retries, fail-closed
  behaviour) rather than assuming happy-path availability.
- Status language: never describe a merchant module as "complete" from merged state alone;
  completion requires the Definition of Complete in
  `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md` (incl. staging
  acceptance). Current per-module status lives in PROJECT-STATE §4.2, not here.
