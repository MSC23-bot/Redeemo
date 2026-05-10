# Redis Namespaces — Ownership Reference

> **Source of truth:** `src/api/shared/redis-keys.ts` defines the prefix per namespace.
> This document captures TTLs, owners, eviction posture, and recovery procedure
> per namespace. When you add or change a key shape, update this doc in the
> same PR.

## Why this doc exists

PR-1 of the pre-launch hardening track (`docs/superpowers/plans/2026-05-10-pre-launch-hardening.md`)
called this out: Redis is load-bearing for auth, OTP, password reset, refresh
tokens, single-mobile-session, PIN brute-force, and screenshot dedup — but the
operational properties of each namespace (TTL, what happens if the key
disappears, what happens if Redis restarts) lived only in the code.

This doc gives oncall + future-Phase-6 alerting a single map of what's stored,
how long it lives, and what users see if the namespace is wiped or unavailable.

## Conventions

- All TTLs are seconds unless noted otherwise.
- "Source" links to where the TTL is defined.
- "On Redis flush" describes user-facing impact if the namespace were
  cleared mid-session — assume worst-case (full namespace lost), then describe
  what the user has to redo.
- "Backup needed?" — yes only when loss would corrupt user data or violate a
  business rule. Most auth/OTP namespaces are no — users re-authenticate.

---

## Namespace table

| Prefix | Purpose | TTL | Source | Backup? | On Redis flush |
|---|---|---|---|---|---|
| `auth:customer:<userId>` | Customer permissions cache (read by every authenticated request) | 3600s (1h) | `customer/service.ts:80` | No | Next request rebuilds from DB. Transparent. |
| `auth:merchant:<adminId>` | Merchant admin permissions cache | 3600s (1h) | `merchant/service.ts:139` | No | Same as above. |
| `auth:branch:<branchUserId>` | Branch staff permissions cache | 3600s (1h) | `branch/service.ts:71` | No | Same as above. |
| `auth:admin:<adminUserId>` | Platform admin permissions cache | 3600s (1h) | `admin/service.ts:84` | No | Same as above. |
| `refresh:<role>:<entityId>:<sessionId>` | Refresh-token store. One key per active session per role. Set on login + every successful refresh; deleted on logout. | 90 days | `shared/session.ts:6` | **Yes if available** — clearing logs every user out across all four roles. | All users sign out and must re-authenticate. No data loss. |
| `sessions:mobile:<role>:<entityId>` | Active mobile session marker. Enforces the one-mobile-device rule (§AC6); a fresh login overwrites this and the prior session is rejected on next refresh. | 90 days | `shared/session.ts:6` (shares `REFRESH_TOKEN_TTL_SECONDS`) | No | One-device guarantee briefly relaxed until next login writes a new value; users stay signed in until refresh. |
| `otp:<role>:<entityId>` | OTP attempt counter for the verification step. Tracks 0–3 wrong codes per (role, entity). | 600s (10m) | `shared/otp.ts:84` | No | Counter resets to 0; user gets a fresh 3 attempts. Acceptable. |
| `otp:lock:<role>:<entityId>` | Per-(role, entity) OTP lockout — set after 3 failed attempts. While present, all OTP verifications return `locked`. | 300s (5m) | `shared/otp.ts:10` | No | Lock prematurely lifts; in practice a user retrying immediately is the only effect. |
| `otp:send:<phone>` | Per-phone OTP send rate-limit counter (3 sends per 1h). | 3600s (1h) | `shared/otp.ts:5-6` | No | Counter resets; abuse window briefly opens. Twilio's own rate limits remain a backstop. |
| `otp:action:<userId>:<action>` | Action-token TTL after successful OTP (e.g. account deletion). User must complete the action before this expires. | 300s (5m) | `customer/routes.ts:191` | No | Token disappears; user reverifies via OTP. |
| `email-verify:<token>` | Email-verification token → userId. Sent by email; clicked link reads + deletes the key. | 86400s (24h) | `customer/service.ts:20` | No | Verification link breaks; user requests a new one. |
| `email-change:<token>` | Email-change confirmation token → pending email. Same shape as `email-verify` but for email-update flow. | 86400s (24h) (defined-but-currently-no-live-writer; preserved for the Phase 5 admin flow) | `redis-keys.ts:24` | No | n/a — see "Defined-but-unused" below. |
| `phone-verify:<userId>` | Pending phone number during in-app verification flow. Stores `+44…` so the device flow can confirm against the same number it requested an OTP for. | 600s (10m) | `customer/service.ts:226` | No | Pending verification expires; user starts the flow again. |
| `pwd-reset:<role>:<token>` | Password-reset token → entityId. Token in the email; clicking lets the user set a new password. | 3600s (1h) | `customer/service.ts:21`, `merchant/service.ts:14`, `admin/service.ts:157` | No | Reset link breaks; user requests a new one. |
| `branch-temp:<token>` | Branch-user first-login temporary token (pre-PIN-set). | 1800s (30m) | `branch/service.ts:16` | No | First-login link breaks; merchant admin re-issues. |
| `otp-challenge:<role>:<token>` | Merchant + admin login OTP challenge token (intermediate step between password and OTP). | 600s (10m) | `merchant/service.ts:13`, `admin/service.ts:14` | No | Challenge expires; user logs in again from scratch. |
| `rl:otp:<phone>` | Phone-keyed OTP send rate-limit window (legacy alias of `otp:send:<phone>`; same data, different consumer call site). | 3600s (1h) | `shared/otp.ts:5-6` | No | Same as `otp:send:<phone>`. |
| `rl:otp:user:<userId>` | User-keyed OTP send rate limit (5 sends per 1h, regardless of destination — closes number-swap bypass). | 3600s (1h) | `shared/otp.ts:7-8` | No | Counter resets. |
| `rl:pwd-reset:<email>` | Defined-but-currently-unused. See "Defined-but-unused" below. | n/a | n/a | n/a | n/a |
| `pin:fail:<userId>:<branchId>` | Per-(user, branch) redemption-PIN brute-force counter. After 5 failures within 15 minutes, the user is rate-limited at that branch only. | 900s (15m) — set via `expire` after the first incr | `redemption/service.ts:32-33` | No | Counter resets; user gets a fresh 5 attempts at that branch. Abuse risk is bounded by the per-branch scoping. |
| `rl:ss:<userId>:<code>` | Show-to-Staff screenshot anti-fraud telemetry dedup. SETNX with 5s TTL — a rapid burst of screenshot events from the same (user, redemption code) writes exactly one `RedemptionScreenshotEvent` row. | 5s | `redemption/service.ts:386` | No | Dedup window collapses; possible duplicate event rows for the same screenshot burst. Acceptable noise; downstream analytics dedupe by `(userId, redemptionId, occurredAt)` if needed. |

---

## Defined-but-unused

These RedisKey helpers exist in `redis-keys.ts` but have no live writer or
reader on `main`. Treat as either dead code or pending Phase 5/6 wiring; do
not flush "to clean them up" since pending work may write to the same prefix.

| Helper | Status |
|---|---|
| `RedisKey.emailChange` | Defined for the email-change flow. Currently no live writer. Will likely surface in the Phase 5 admin flow + customer profile email edit. Leave defined; don't reuse the prefix for anything else. |
| `RedisKey.rateLimitPwdReset` | Defined for `rl:pwd-reset:<email>` rate limiting; never consumed. The password-reset flow currently relies only on the email send rate (Resend's own limit) + token TTL. Promote this to a live writer in PR-3 (HTTP timeouts + outbound rate-limit pass) or Phase 5 if a runbook surfaces password-reset abuse. |

---

## Operational notes

- **Single Redis instance.** All four roles + all rate limits + dedup share
  one Redis. There is no read replica today.
- **No persistence configured separately** — relies on the hosting platform's
  default (Railway/Render). Confirm `appendonly yes` + `appendfsync everysec`
  before we open subscription billing to real money in Phase 5; until then,
  losing Redis = full sign-out (recoverable) + a 1h max abuse window on rate
  limits (acceptable).
- **No alerting on Redis** as of 2026-05-10. Tracked under §W /
  pre-launch-hardening PR-5.
- **No multi-region.** Redis is single-region; the API is single-region.
  Cross-region failover is out of scope for v1.

## When to update this doc

- A new `RedisKey` helper is added → row in the table.
- A TTL changes → update `TTL` and `Source`.
- A new consumer is added → confirm "On Redis flush" still describes the
  worst case.
- A namespace is removed → strike it through with date + the PR that removed
  the last consumer; do **not** delete the row outright (oncall searches this
  doc when an old key turns up in a memory dump).

## Cross-references

- `docs/superpowers/plans/2026-05-10-pre-launch-hardening.md` — PR-1
  (this doc), PR-3 (HTTP timeouts), PR-5 (alerting).
- §W in `~/.claude/projects/-Users-shebinchaliyath-Developer-Redeemo/memory/project_deferred_followups_index.md`
  — production-resilience standing checklist.
- §AC6 / §AC7 in the same memory ledger — single-mobile-session contract that
  uses `sessions:mobile:<role>:<entityId>`.
