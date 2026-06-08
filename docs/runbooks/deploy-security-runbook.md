# Redeemo — Deploy & Security Runbook

**Status:** operational readiness after the Security Stabilisation Gate (SEC-C1/C2/C3, H1/H2/H3/H4/H5) + post-gate audit blockers (F1/F2/F4/F5/F8), all merged to `main`.
**Audience:** whoever performs the staging + production deploys.
**Golden rule:** do every step in **staging first**, confirm, then production.

> **Open dependency:** the API host (Railway vs Render) is still an owner decision. This runbook is written platform-agnostically; wherever it says "set env var X," do it in that platform's project settings (and in Vercel for customer-web). The exact `TRUST_PROXY` hop count depends on the chosen host + any edge (e.g. Cloudflare) — see §2.

> ## ⛔ ONE HARD LAUNCH GATE REMAINS (both pre-launch seed/count tasks resolved)
> 1. ✅ **RESOLVED (PR2b) — production-safe reference-data seed.** `prisma/seed-reference.ts` loads ONLY reference/config data (taxonomy / localities / markets / subscription plans / CMS placeholders), **never** demo merchants, and is safe with `NODE_ENV=production`. A default-deny write guard blocks any non-reference write. See §4 step 2 and §8.
> 2. ✅ **RESOLVED — standalone recompute-count runner.** `prisma/recompute-counts.ts` recomputes the category/tag count maps from current merchant state (**excluding test data**), behind opt-in + target-confirm gates and a Category/Tag-only default-deny write guard, safe with `NODE_ENV=production`. See §4 step 4.
>
> **HARD LAUNCH GATE (still blocks go-live):** the reference seed writes CMS keys with **placeholder** legal copy — real Terms / Privacy / legal content MUST be filled before launch (§4 step 2, §9).

---

## 1. Required environment variables

Set these **separately per environment** (staging and production each get their own values — never share secrets across environments).

> **Where each value comes from:** only **Redeemo-generated** secrets are created with `randomBytes` — that is the **4 JWT secrets** and **`ENCRYPTION_KEY`**. Everything else is a **provider** value copied from that provider's dashboard: `DATABASE_URL` (Neon), `REDIS_URL` (your Redis provider), `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` (Stripe dashboard), `TWILIO_*` (Twilio console), and later Resend / R2 (their dashboards). Do **not** invent provider secrets.

### API (Railway/Render) — secrets (boot-validated; the API refuses to start if any is missing or a placeholder)
| Variable | Source | Notes |
|---|---|---|
| `DATABASE_URL` | Neon dashboard | a **different Neon project/branch** per environment (§7) |
| `REDIS_URL` | Redis provider | one instance per environment |
| `ENCRYPTION_KEY` | **generate (`randomBytes`)** | **exactly 64 hex chars** (32 bytes); encrypts branch PINs. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET_CUSTOMER` | **generate (`randomBytes`)** | distinct random secret |
| `JWT_SECRET_MERCHANT` | **generate (`randomBytes`)** | distinct random secret |
| `JWT_SECRET_BRANCH` | **generate (`randomBytes`)** | distinct random secret |
| `JWT_SECRET_ADMIN` | **generate (`randomBytes`)** | distinct random secret |
| `STRIPE_SECRET_KEY` | Stripe dashboard | live key in prod, test key in staging |
| `STRIPE_WEBHOOK_SECRET` | Stripe dashboard | from the webhook endpoint config (re-created per environment) |
| `TWILIO_ACCOUNT_SID` | Twilio console | |
| `TWILIO_AUTH_TOKEN` | Twilio console | |
| `TWILIO_VERIFY_SERVICE_SID` | Twilio console | the Verify service used for OTP |
| `TWILIO_FROM_NUMBER` | Twilio console | E.164, e.g. `+44…` |

Generate the JWT/ENCRYPTION secrets with the `randomBytes` command above. **Avoid** any value containing `placeholder`, `replace_me`, `your-`, `changeme`, or `dev-…-secret` — the boot validator rejects those substrings.

### API — non-secret config (not boot-validated, but launch-critical)
| Variable | Production value | Notes |
|---|---|---|
| `NODE_ENV` | `production` | |
| `TRUST_PROXY` | `1` (single proxy) | **must set** — see §2. Do **not** use `true`. |
| `CORS_ORIGIN` | `https://redeemo.co.uk,https://www.redeemo.co.uk` | HTTPS prod web origin(s); must agree with the CSP `connect-src` (§5). Default if unset is `localhost:3001` (breaks the real frontend). |
| `SMS_ALLOWED_COUNTRY_CODES` | `+44` | full E.164 codes only; default UK if unset (§6) |
| `SMS_GLOBAL_DAILY_CAP` | `500` (tune to volume) | hard daily Twilio cost ceiling (§6) |
| `RATE_LIMIT_RELAX` | **must be absent** | never set in prod; the code also neutralizes it when `NODE_ENV=production`, but keep it out of the env entirely |

### customer-web (Vercel)
| Variable | Source | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | your prod API origin | **build-time** — must exist before the build, or `connect-src` falls back to `localhost:3000` and all API calls are CSP-blocked |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe dashboard | live publishable key in prod |
| `NEXT_PUBLIC_MARKETPLACE_LIVE` | set by you | **`false`** until launch (§4); build-time inlined |
| `CSP_REPORT_ONLY` | set by you | `true` for the first prod deploy, then remove/`false` to enforce (§5) |
| `ENABLE_HSTS` | set by you | off until the custom domain is confirmed HTTPS-only, then `true` (§5) |
| `HSTS_MAX_AGE` | set by you | start `604800` (1 week), raise to `63072000` after verification (§5) |

*(Resend + R2/S3 credentials come from their provider dashboards and are added in their own Phase-0 steps; Resend email isn't wired yet.)*

---

## 2. TRUST_PROXY setup + verifying `req.ip`

**Why it matters:** behind a proxy (Railway/Render/Vercel), `req.ip` defaults to the *proxy's* address unless `TRUST_PROXY` is set. If it's wrong, **every IP-based control collapses onto one shared bucket** — the edge rate limits (login/forgot-password/global), the SMS per-IP caps, and the password-reset per-IP cap all break at once (simultaneously over-throttling all real users and under-throttling attackers).

**Setup:** set `TRUST_PROXY=1` for a single proxy hop (the normal PaaS case). If there's an extra edge in front (e.g. Cloudflare → Railway), the count may be `2`. Do **not** use `true` (that trusts any `X-Forwarded-For` and lets clients spoof their IP). The default is OFF (safe for local dev, wrong for prod), and a garbage value makes the API refuse to boot.

**Verify on the deployed host (pick one):**
- **Rate-limit behaviour test (no code) — use a SAFE STAGING TEST ACCOUNT only:** from two genuinely different source IPs (e.g. office Wi-Fi and a phone on mobile data), hit the login route ~6 times each within a minute **against staging, using a dedicated test account** (never a real user's account). Each IP should independently trip the 5/min limit (a 429). If *one* IP's requests cause the *other* to be throttled too, `req.ip` is collapsing onto the proxy and `TRUST_PROXY` is wrong. **Expect audit-log and rate-limit "noise"** from this test (failed-login / throttle entries) — that's normal; do it in staging where that noise is harmless.
- **Host request logs:** compare the client IP your PaaS records for a request with what your own client IP actually is (whatismyip). They should match a real client IP, not a `10.x` / `100.64.x` / internal proxy address.
- A permanent "echo my IP" endpoint would be a code change — out of this runbook's scope; use the two methods above.

**Cross-check:** the rate-limit store is now Redis-backed (so limits are shared across instances and survive restarts) and **fails open** on a Redis outage (the global limiter won't take the API down). Both behaviours depend on `TRUST_PROXY` being correct for the per-IP keys to be meaningful.

---

## 3. Secrets checklist (sign-off before each environment goes live)

- [ ] **All 13 API secrets** set with real, environment-specific values; none contain a placeholder substring.
- [ ] **Redeemo-generated vs provider:** the 4 JWT secrets + `ENCRYPTION_KEY` were generated with `randomBytes`; `DATABASE_URL`, `REDIS_URL`, `STRIPE_*`, `TWILIO_*` were copied from their provider dashboards (not invented).
- [ ] **`ENCRYPTION_KEY`** is exactly 64 hex chars and is the **same value** the seed used for that environment (PINs are unreadable if they differ).
- [ ] **4 JWT secrets** are distinct from each other and from staging.
- [ ] **Stripe**: live `STRIPE_SECRET_KEY` + the webhook endpoint's `STRIPE_WEBHOOK_SECRET` (re-created per environment); `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` matches.
- [ ] **Twilio**: SID/auth-token/verify-SID/from-number all set; `TWILIO_FROM_NUMBER` is E.164.
- [ ] **`REDIS_URL`** + **`DATABASE_URL`** point at the *correct* environment's instances (not staging's).
- [ ] **`CORS_ORIGIN`** = prod web origin(s) over HTTPS, never `*`.
- [ ] **Boot check:** deploy to staging first — the API will refuse to start and name any missing secret. A clean boot = all secrets present.

---

## 4. Marketplace launch sequence

> ⚠️ **Do NOT run the full `prisma/seed.ts` against production.** It creates demo merchants and, after F8, refuses to run with `NODE_ENV=production`. Production gets reference data only — see the open task below.

Run **in this exact order**. Keep `NEXT_PUBLIC_MARKETPLACE_LIVE=false` until the very end.

1. **Apply DB migrations** to prod: `prisma migrate deploy` (the `isTestData` migration and all others are additive — safe, no drops).
2. **Seed reference data** (categories, tags, localities, markets, subscription plans, CMS placeholders) via the production-safe reference seed — ✅ **RESOLVED (PR2b):**
   ```bash
   ALLOW_REFERENCE_SEED=true \
   REFERENCE_SEED_CONFIRM=<unique-db-host> \
   STRIPE_PRICE_ID_MONTHLY=price_… STRIPE_PRICE_ID_ANNUAL=price_… \
   npx tsx prisma/seed-reference.ts
   ```
   Loads ONLY reference/config data (**never** demo merchants), is safe with `NODE_ENV=production`, and needs **no `ENCRYPTION_KEY`**. It validates `DATABASE_URL`, prints the redacted target DB, and refuses to run unless `ALLOW_REFERENCE_SEED=true` **and** `REFERENCE_SEED_CONFIRM` appears in the printed target (guards against the wrong DB). **Set `REFERENCE_SEED_CONFIRM` to the UNIQUE Neon host** (e.g. `ep-xxxx.eu-west-2.aws.neon.tech`), not a generic db name like `neondb` that several environments may share. A default-deny Prisma write guard throws on any non-reference write. Stripe price ids must be **REAL** — it rejects `price_monthly_dev` / placeholder / malformed values (fail closed). The catchment/markets step can be slow (one-time). 🔴 **HARD LAUNCH GATE:** CMS keys are seeded with **placeholder** content — real Terms / Privacy / legal copy MUST be filled in before launch (§9). Do **not** run the full dev/demo seed in production (§8).
3. **Scrub any seed/test supply** from prod (only if any exists): delete every `isTestData=true` Merchant/Branch/Voucher **and their dependents**, including seed **reviews** (F5 excludes them at read time, but the launch contract is to physically remove them). Do this inside a transaction, **take a backup first** (§7), and follow FK order (reviews/redemptions → vouchers/branches → merchant). Best practice: **prod should never have contained demo merchants** — if step 2 is reference-only, there is nothing to scrub.
4. **Recompute denormalized counts** after any scrub or real merchant import — ✅ **RESOLVED:**
   ```bash
   ALLOW_RECOMPUTE_COUNTS=true \
   RECOMPUTE_CONFIRM=<unique-db-host> \
   npx tsx prisma/recompute-counts.ts
   ```
   Recomputes `Category.merchantCountByCity` / `Tag.merchantCountByCity` from current merchant state so `AllCategories` counts match what customers see. It **excludes test data** (`excludeTestData: true`), so counts stay correct even if a scrub left an `isTestData` merchant behind. Same gate style as the reference seed: validates `DATABASE_URL` (postgres), prints the redacted target, and refuses unless `ALLOW_RECOMPUTE_COUNTS=true` **and** `RECOMPUTE_CONFIRM` matches the printed target (use the **unique host**). A default-deny write guard restricts writes to **Category/Tag only**; needs **no `ENCRYPTION_KEY`** and no Stripe config. It is a *full* recompute (idempotent, **safe to re-run** after an interruption); the serial per-category/per-tag scan can take a few minutes on large data.
5. **Confirm the backend excludes seed data regardless of the flag** (defense-in-depth — already shipped): even if a seed row slipped through, discovery/search/reviews exclude `isTestData=true`. This is a safety net, not a substitute for steps 3–4.
6. **Flip the flag:** set `NEXT_PUBLIC_MARKETPLACE_LIVE=true` in **Vercel build-time env**, then **trigger a fresh production build/redeploy** (it's inlined at build — a runtime change does nothing). Until this, the marketplace routes redirect to the landing page (safe default).
7. **Smoke-test** (§9) before announcing.

---

## 5. CSP / HSTS rollout

The customer-web CSP is **enforcing by default**, tuned for Stripe + self-hosted fonts + the R2/S3/`blob:` image hosts + `api.postcodes.io`. `form-action` is intentionally omitted (so Stripe's 3DS redirect can post to the bank). Roll out gently:

1. **First prod deploy: `CSP_REPORT_ONLY=true`.** Then exercise the real flows — register, login, **subscribe (including a 3DS card)**, password reset (where wired). **There is no CSP reporting endpoint configured** (no `report-uri` / `report-to`), so violations will **not** appear in a server feed — **watch the browser developer console, the deployed app logs, and direct QA observations** for blocked resources / broken behaviour. The 3DS step is the one most likely to surface a missing origin.
2. **Enforce:** once clean, remove `CSP_REPORT_ONLY` (or set `false`) and redeploy. The `Content-Security-Policy` header now blocks.
3. **HSTS ramp** (only on the **custom domain**, after confirming *every* subdomain — api/admin/merchant — is HTTPS-only):
   - Set `ENABLE_HSTS=true` with `HSTS_MAX_AGE=604800` (1 week — short, so a misconfig recovers fast).
   - After it's stable for a while, raise `HSTS_MAX_AGE=63072000` (2 years).
   - `includeSubDomains` / `preload` are intentionally **not** enabled (would require a code change) — only add them once you're certain.
4. **Residual to know:** bearer tokens live in `localStorage`, so CSP is XSS *mitigation*, not prevention. Moving tokens to httpOnly cookies is future hardening (§11), not a launch blocker.

---

## 6. Twilio / Resend spend controls + alerts

**Twilio (live now):**
- **Country allowlist** `SMS_ALLOWED_COUNTRY_CODES` — keep `+44` (full codes only; a partial like `+4` is now rejected and warned at boot). Add a country only when genuinely needed.
- **Global daily cost cap** `SMS_GLOBAL_DAILY_CAP` (default 500) — a hard block once reached. Tune to expected legitimate signup volume. **Set a Twilio billing/usage alert at ~70–80% of this number** so you act before the hard cap halts all OTP/verification.
- Per-phone / per-IP / per-user caps + the resend cooldown are already enforced (and dev-relaxed only via `RATE_LIMIT_RELAX`, which is absent in prod).
- **Twilio console:** set a usage trigger / spending alert + a low-balance alert; consider a geo-permissions restriction in Twilio itself (belt-and-braces over the app allowlist).

**Resend (NOT wired yet — Phase 6):** when it's added, **before enabling it**:
- Close **§SEC.1** (make the SMS *and* password-reset counters atomic — today they're best-effort under concurrency; a burst can slightly overshoot). This becomes a victim-inbox-bombing vector once real emails send.
- Add a per-route limiter to `resend-verification-email` (currently un-throttled because it's a no-op).
- Add a Resend send-volume / spend alert at that time.

---

## 7. Database safety (Neon)

- **Separate Neon projects/branches per environment.** Staging and production must be **different databases** — confirm `DATABASE_URL` per environment points where you think it does (a wrong URL is how seed/scrub accidents happen).
- **Backups / PITR:** confirm Neon Point-in-Time-Restore is enabled and the retention window is acceptable for prod. Note the earliest restore point.
- **Before any destructive prod step** (the seed scrub in §4, or a migration that isn't purely additive): take an explicit backup/branch snapshot first.
- **Restore drill (do once before launch):** on a *staging* branch, simulate a bad change, then restore via Neon PITR to a point just before it, and confirm the data is back. This proves the restore path works and times it, so you're not learning it during an incident.
- Migrations to date are additive (new columns/indexes, `NOT NULL DEFAULT`) — low risk — but still run `migrate deploy` against staging first.

---

## 8. Seed script rules (after F8)

> ⚠️ **Do NOT run the full dev/demo seed (`prisma/seed.ts` or `prisma/seed-demo.ts`) against production.** Production gets reference data only, via the production-safe reference seed `prisma/seed-reference.ts` (§4 step 2).

- **Reference seed (`prisma/seed-reference.ts`) is the ONLY seed allowed near production.** It writes only reference/config models (enforced by a default-deny Prisma write guard — taxonomy / localities / catchment / markets / subscription plans / RMV templates / interests / CMS), requires `ALLOW_REFERENCE_SEED=true` plus a matching `REFERENCE_SEED_CONFIRM`, requires REAL Stripe price ids (rejects dev/placeholder), needs **no** `ENCRYPTION_KEY`, and creates **no** demo data. It does **not** recompute denormalized counts (that is the standalone recompute runner, §4 step 4 / Task #2).
- **Treat the Stripe price ids as stable once configured.** The reference seed upserts subscription plans keyed by `stripePriceId`, so re-running it with *different* `STRIPE_PRICE_ID_MONTHLY` / `STRIPE_PRICE_ID_ANNUAL` values creates NEW plan rows and leaves the old ones in place (it does not retire them). Pick the real Stripe price ids once and keep them; if they ever must change, retire the superseded plans deliberately (e.g. set `isActive=false`).
- **A real `ENCRYPTION_KEY` is now required** to run any seed — the repo-public fallback is gone. The dev's `.env` must contain the real key (the same one the app uses), or the seed fails fast with a clear message.
- **Never seed production.** The seed refuses to run with `NODE_ENV=production` (defense-in-depth), and the real protection is that it requires a valid key anyway.
- **Re-seed dev safely:** with the real `ENCRYPTION_KEY` in `.env`, run `npx prisma db seed`. **One-time action recommended now:** re-seed dev so any branch PINs previously encrypted with the old `'a'×64` fallback are regenerated with the real key (they're currently undecryptable by the real-key app).
- Demo data (`seed-demo.ts`) follows the same rules — real key required, no prod.

---

## 9. Smoke-test checklist (after each deploy)

Run against staging after every deploy, and against prod right after the marketplace flip (before announcing):
- [ ] **API boots** (no missing-secret crash) and `/health` (or root) responds.
- [ ] **`req.ip` is correct** (§2 verification, **staging test account only**) — do this once per environment.
- [ ] **Security headers present:** `curl -I https://<web-domain>/` shows `Content-Security-Policy` (or `…-Report-Only` on the first deploy), `X-Frame-Options: DENY`, `Referrer-Policy`, `X-Content-Type-Options: nosniff`, and HSTS once enabled.
- [ ] **Auth — phone OTP (LIVE via Twilio):** register → **phone verification** → login works; a forged/unsigned JWT does **not** return another user's data (SEC-C1).
- [ ] **Auth — email verification & password reset (FUTURE, once Resend is enabled):** the in-app token flows exist, but **email delivery is not wired today** (Phase 6 / Resend). Test these end-to-end only **where wired**; until then they're verified via the dev token scripts, not live email.
- [ ] **Subscribe — Stripe:** **staging uses Stripe TEST MODE with test cards** (including a 3DS test card) under the enforcing CSP. **Production live-payment testing must be controlled and minimal** (a single small real charge by a known operator, refunded) — do not run broad live-payment tests.
- [ ] **Discovery has no seed leak:** search / home / a merchant page / a branch's **reviews** return only real supply (no Covelum/Karaara/demo names).
- [ ] **CMS legal content is real, not placeholder** (closes the §4 step 2 hard launch gate): Terms, Privacy, and any other legal/FAQ CMS keys show finalized copy, **not** the reference-seed placeholder text (`[… — to be filled by admin]`).
- [ ] **Rate limiting works:** repeated logins from one IP get a 429; it's Redis-backed (survives a redeploy). (Use a staging test account; expect throttle/audit noise.)
- [ ] **Marketplace gate:** with the flag `false`, marketplace routes redirect to the landing page; `/account` stays auth-gated.
- [ ] **Admin login** is appropriately gated (the `000000` OTP bypass is closed; admin OTP fails closed in prod until real Twilio admin OTP is wired — confirm this matches your intent for launch).

---

## 10. Rollback plan

- **customer-web (Vercel):** use Vercel's instant rollback to the previous deployment. To hide the marketplace fast, set `NEXT_PUBLIC_MARKETPLACE_LIVE=false` and redeploy (or roll back to the pre-flip build).
- **API (Railway/Render):** redeploy the previous image/commit. The API is stateless; sessions/rate-limits live in Redis (rolling back code doesn't lose them).
- **Database:** migrations are additive, so a code rollback doesn't require a DB rollback. If a destructive data step (scrub) went wrong, restore via Neon PITR to the snapshot taken in §7.
- **CSP too strict:** flip `CSP_REPORT_ONLY=true` and redeploy to unblock immediately while you diagnose.
- **Rate-limit / Redis issue:** the limiter already fails open on a Redis outage, so a Redis blip degrades throttling rather than taking the site down — no manual action needed, but watch for the un-throttled window.
- **Decide rollback triggers in advance:** e.g. error rate > X%, payment failures, any seed data visible publicly → roll back the flag first, investigate second.

---

## 11. Future hardening (NOT launch blockers)

Track these. **None gates public exposure as long as the related feature stays disabled** — in particular, the Resend/email items below are only relevant *once email delivery is turned on*:
- **SEC-H6 — CI dependency scanning** (`npm audit --audit-level=high` + Dependabot). Config-only; cheap; recommended to pull forward soon. Not launch-blocking.
- **§SEC.1 — atomic limiter counting.** The SMS and password-reset counters are best-effort under concurrency (a burst can slightly overshoot). **Harmless while no email is sent; MUST be made atomic before Resend/email delivery is enabled** (a victim-inbox-bombing vector once real emails send). Not a blocker for a launch with email still off.
- **SEC-M1 / M2 — immediate suspension.** A suspended merchant's staff can keep validating for up to ~1h (Redis snapshot) — re-check live status on the staff-verify + admin/refresh paths. Phase 2 (admin actioner).
- **SEC-M3 — admin RBAC.** Enforce `requireAdminCapability` over the existing `AdminRole`. Phase 2 (nil exposure until the admin surface is built/used).
- **SEC-M4 — branch contact PII.** Product decision on exposing branch `phone`/`email` (often a personal mobile) publicly.
- **SEC-M5 — per-account login lockout.** A durable per-email failed-login counter + step-up; also the proper backstop for F2's brief fail-open window during a Redis outage.

---

*This is a living document. Update it whenever an env var, control, or launch step changes. Both pre-launch seed/count tasks in §4 are resolved; the CMS legal-content launch gate must still be closed before production go-live.*
