---
name: redeemo-dev-qa-toolkit
description: Use when exercising Redeemo dev/QA flows locally - granting or revoking a dev subscription, decrypting branch PINs, flipping a user's auth/verification state, issuing password-reset tokens without email, resetting a QA redemption cycle, reseeding dev data, or testing auth error UX (expired tokens, unverified email/phone, suspended accounts).
---

# Redeemo dev/QA toolkit

All scripts run from the repo root with `npx tsx`. They hit the database configured in
`.env` (`DATABASE_URL`, shared Neon dev): use them for dev/QA only, never against staging
or production URLs.

## Seed and reset

- Reset dev data: `npx prisma db seed` (runs `prisma/seed.ts`).
- Production-safe reference seed: `prisma/seed-reference.ts` (categories/reference data only).
- Recompute denormalized counts: `npx tsx prisma/recompute-counts.ts`.
- Seed logins are in root `CLAUDE.md` §5. Default seed PIN for all branches: `1234`.

## Subscriptions

- Grant a 1-year ACTIVE monthly subscription (Stripe-free, uses nullable Stripe fields):
  `npx tsx prisma/grant-dev-subscription.ts` (targets customer@redeemo.com).
- Revoke it: `npx tsx prisma/revoke-dev-subscription.ts`.

## Redemption QA

- Decrypt and print branch PINs by merchant-name search:
  `npx tsx prisma/get-branch-pin.ts "old foundry"`.
- Reset a user's redemption cycle so vouchers can be redeemed again:
  `npx tsx prisma/reset-qa-redemption-cycle.ts` (defaults: customer@redeemo.com + the
  seeded Covelum/Kovalam vouchers; override with `--email` / `--voucherId`).

## Auth state and password flows (no email/SMS needed)

- Flip verification flags/status to exercise login error UX:
  `npx tsx prisma/set-auth-state.ts <email> <mode>` with mode one of
  `verified` (restore) | `email-unverified` | `phone-unverified` | `inactive` | `suspended`.
  Always restore with `verified` afterwards.
- Issue a real password-reset token into Redis (prints web + app deep links):
  `npx tsx prisma/issue-reset-token.ts <email> [ttlSeconds=3600]`.
  For the expired/invalid path, use any bogus token (Redis miss → RESET_TOKEN_EXPIRED).

## UI-only auth cases (no script)

- EMAIL_ALREADY_EXISTS: register with a seeded email.
- PASSWORD_POLICY_VIOLATION: register with a weak password (policy requires a special char).
- RESET_TOKEN_EXPIRED: open a reset link with `?token=nope`.

## Backfills (idempotent)

- Favourite branches from legacy favourites: `npx tsx prisma/backfill-favourite-branches.ts`
  (main-branch only, P2002-safe, supports dry-run flag).
- User locality/lat/lng from postcode: `npx tsx prisma/backfill-user-locality.ts`.

## Caveats

- Several additional `prisma/*.ts` probe scripts exist UNTRACKED in working trees (e.g.
  `check-user.ts`, `test-login.ts`, `_get-admin-otp.ts`). They are pending
  refactor-or-delete decisions recorded in `docs/deferrals/open-register.md`: do not rely
  on them, commit them, or delete them without owner approval.
- `prisma/reset-user-password.ts` (untracked) hardcodes a personal email + plaintext
  password; its functionality is covered by `issue-reset-token.ts` + `set-auth-state.ts`.
  Most likely disposition is delete-with-approval; do not use it.
