---
paths:
  - "apps/merchant-web/**"
---

# Merchant portal (Next.js) rules

- Dev port 3003. Full brand layer (customer-web fonts + prototype `tokens.css`), unlike the
  deliberately neutral admin-web.
- Session model is BFF-lite: httpOnly cookie `redeemo_merchant_session` + Next route
  handlers as the only backend callers; `assertSameOrigin` + `safeNext` on every handler.
  Never move merchant tokens to localStorage.
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
- Status language: merchant modules are MERGED but NOT staging-accepted portfolio-wide;
  do not describe any module as "complete" (Definition of Complete lives in
  `docs/superpowers/roadmaps/merchant-portal-programme-roadmap.md`).
