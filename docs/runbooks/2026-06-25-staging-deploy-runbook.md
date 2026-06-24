# Redeemo — Private Staging Deploy Runbook

> **Status: PLAN ONLY. Nothing executed.** No hosting, DNS, secrets, email, or deploy changes have been made. This document is the step-by-step plan to stand up a **locked-down private staging environment** so the platforms are reachable by URL without juggling local terminals.
>
> **This is NOT a public launch.** Staging is access-controlled, noindex, test-keys-only, email dark/sandboxed, seed/test data only. The legal-content sign-off, live email, and public marketplace gates remain closed and are explicitly out of scope here.
>
> Date: 2026-06-25. Companion docs: `docs/runbooks/railway-backend-hosting-plan.md` (backend-only, also plan-first), `docs/runbooks/deploy-security-runbook.md`, root `.env.example` (the canonical backend env reference).

---

## 0. Scope

**In scope (this runbook):**
- Backend API → staging host (Railway assumed) — **web process**.
- BullMQ **worker** → staging host — **separate process** (runs the Branches hours-promotion sweep + email/outbox/moderation/claim-stale).
- `customer-web`, `admin-web`, `merchant-web` → staging URLs (Vercel).
- Staging Neon database (a **branch** of the dev DB) + `prisma migrate deploy` for all pending migrations (incl. the 4 Branches migrations).
- Redis (sessions + queues), seed/test data, **Stripe test keys only**, **email dark/sandboxed**.
- Password/allowlist protection + noindex on every web URL.

**Out of scope (deliberately deferred):**
- Public production launch, custom domains (`redeemo.co.uk` etc.), live Resend email, the marketplace gate (`NEXT_PUBLIC_MARKETPLACE_LIVE`), real Stripe/Twilio live keys, the customer-app store submission, and any AWS changes (AWS stays untouched).
- The **customer app** is covered as a **separate optional Section 11** — it is a mobile app, not a URL.

---

## 1. Topology

```
                         Vercel (3 projects, access-protected, noindex)
   ┌─────────────────┐   ┌─────────────────┐   ┌─────────────────┐
   │ customer-web     │   │ admin-web        │   │ merchant-web     │
   │ *.vercel.app     │   │ *.vercel.app     │   │ *.vercel.app     │
   └────────┬─────────┘   └────────┬─────────┘   └────────┬─────────┘
            │  NEXT_PUBLIC_API_URL  │                      │
            └───────────────┬───────┴──────────────────────┘
                            ▼  (HTTPS, CORS credentialed)
                ┌───────────────────────────┐
                │ Railway project: redeemo-staging
                │  ┌────────────┐  ┌────────────┐  ┌──────────┐
                │  │ web (API)  │  │ worker     │  │ Redis    │  (noeviction)
                │  │ Fastify    │  │ BullMQ     │  │          │
                │  │ :PORT      │  │ sweeps     │  └──────────┘
                │  └─────┬──────┘  └─────┬──────┘
                └────────┼───────────────┼───────────────┐
                         ▼               ▼               │
                  ┌────────────────────────────┐         │
                  │ Neon staging BRANCH (PG16)  │◄────────┘
                  │ separate from prod/live data │
                  └────────────────────────────┘
```

- The **web** and **worker** are two processes built from the **same repo + same env**. The worker is mandatory — without it, the Branches hours-promotion sweep, email delivery, outbox reconcile, claim-stale sweep, and photo-moderation never run.
- Stripe (test mode) calls the API webhook; Twilio (test creds) sends customer SMS OTP; both are external.

---

## 2. Prerequisites (accounts / owner setup)

You (owner) need accounts; I produce the exact configs/commands.

| Service | Why | Tier note |
|---|---|---|
| **Railway** (or Render) | API web + worker + Redis | ~a few $/mo; one project, one environment for staging |
| **Vercel** | the 3 Next apps | Hobby works to deploy; **Deployment Protection (password)** needs **Pro** — see §9 for the no-Pro fallback |
| **Neon** | already live; create a **staging branch** | free tier fine |
| **Stripe** | test-mode keys + a test webhook endpoint | free; test mode only |
| **Twilio** | the 4 boot-required SMS vars (test creds) | needed to boot; SMS capped to `+44` + daily cap |
| **Cloudflare** | optional now (custom domains deferred) | not required for `*.vercel.app` / `*.up.railway.app` |
| **Resend** | optional — only if you want OTP emails to actually arrive in staging (sandbox) | otherwise email stays fully dark and OTPs are read from logs |

---

## 3. Decisions (LOCKED 2026-06-25)

All decisions confirmed by the owner. The rest of this runbook follows them.

| # | Decision | Locked choice |
|---|---|---|
| D-1 | Railway: shared environment vs separate project | **Separate Railway project `redeemo-staging`** (clean isolation, no prod bleed) |
| D-2 | Staging DB | **Neon branch** off the dev DB (zero risk to live data; throwaway) |
| D-3 | Neon endpoint for `DATABASE_URL` | **Direct (non-pooled)** endpoint (`migrate deploy`-compatible; fine at staging volume) |
| D-4 | Web-URL access control | **Vercel Deployment Protection (Password)** where available. **If Vercel Pro is NOT available, the env-gated Basic-Auth middleware is a FLAGGED code-change option that requires explicit owner approval — do NOT add it silently** (§9). Until resolved, customer-web public pages rely only on `MARKETPLACE_LIVE=false`. |
| D-5 | Staging OTP delivery (how you log in) | **Prefer email sandbox** (`EMAIL_ENABLED=true` + `EMAIL_SANDBOX=true` + a Resend test key + one owner-controlled allowlist inbox) **if safe/easy**. **Fall back to fully dark** (`EMAIL_ENABLED=false`, OTPs read from API logs) if sandbox setup is awkward (§8). |
| D-6 | Staging URLs | **Raw platform subdomains** (`*.vercel.app`, `*.up.railway.app`); custom domains deferred |
| App | Customer-app EAS preview | **Follow-up AFTER web/API staging is working** — must not block the staging URLs (§11/§12) |

---

## 4. Deploy order (high level)

1. **Neon staging branch** + grab its direct connection string.
2. **Railway project + Redis** (set `noeviction`).
3. **Backend `web` service** (env + build + `migrate deploy` as a pre-deploy step) → get the API URL.
4. **Backend `worker` service** (same env, different start command).
5. **Stripe test webhook** pointed at the API URL → capture `STRIPE_WEBHOOK_SECRET`.
6. **Vercel × 3** (env incl. `NEXT_PUBLIC_API_URL` = the API URL) → get the 3 web URLs.
7. **Backend `CORS_ORIGIN`** ← the 3 Vercel URLs (then redeploy web).
8. **Access control + noindex** on all 3 web URLs.
9. **Seed test data** into the staging DB.
10. **Verify** (§10), then hand the URLs over.

Order matters: the API URL must exist before the web apps are built (their `NEXT_PUBLIC_API_URL` is inlined at **build** time), and the web URLs must exist before `CORS_ORIGIN` can be set.

---

## 5. Step-by-step

### 5.1 Neon staging branch (D-2)
- In Neon, create a **branch** of the current dev database (e.g. `staging`). This copies schema + data instantly and isolates writes.
- Copy the branch's **direct (non-pooled)** connection string → this becomes `DATABASE_URL`. Append `?sslmode=require`.
- (Optional) reset/seed it to clean test data in §5.9.

### 5.2 Railway project + Redis
- Create project `redeemo-staging` (D-1).
- Add a **Redis** plugin/instance. **Set `maxmemory-policy` to `noeviction`** (BullMQ loses jobs under any eviction policy). Copy its `REDIS_URL`.

### 5.3 Backend `web` service (the API)
- New service from the repo, **root = repo root** (the backend is the repo root, package `redeemo`; *not* under `apps/`).
- **Build command:** `npm run build` (= `prisma generate && tsc -p tsconfig.build.json`, emits `dist/src/`).
- **Start command:** `node dist/src/index.js` (= `npm start`).
- **Pre-Deploy command:** `npx prisma migrate deploy` — applies **all** pending migrations against `DATABASE_URL`, including the 4 Branches migrations (`…130746` hours-pending, `…152859` lifecycle, `…183015` redemption-alerts, `…190418` multi-window). The `Procfile` has no `release:` line by design; use the platform's pre-deploy hook so DDL runs once per release against the **direct** Neon endpoint.
- **Health check:** `GET /health` → `{ "status": "ok" }`.
- Set the env (§6). **Boot is fail-closed:** missing/placeholder required secrets abort start with one aggregated error.
- Deploy → capture the API URL (e.g. `https://redeemo-staging-web.up.railway.app`).

### 5.4 Backend `worker` service (mandatory)
- A **second** Railway service from the same repo + **same build** + **same env** as the web service.
- **Start command:** `node dist/src/worker.js` (= `npm run start:worker`).
- **No** public port / no health HTTP route needed (it's a background worker; it can scale to 1 instance, can scale to zero only if you accept the sweeps pausing).
- It runs the email-delivery, outbox-reconciler, and photo-moderation workers, plus the repeatables: **outbox reconcile (60s), claim-stale sweep (hourly), and `promote-pending-hours` (60s — the Branches PR-4 hours-promotion sweep you asked about).**
- It runs the same `validateRequiredEnv()` — so it needs the same 13 required secrets.

### 5.5 Stripe test webhook
- In the Stripe **test-mode** dashboard, add a webhook endpoint → the staging API webhook path (the subscription webhook route). Use **test** events.
- Copy the endpoint's signing secret (`whsec_…`) → set `STRIPE_WEBHOOK_SECRET` on **both** web and worker, redeploy.

### 5.6 Vercel × 3 (the web apps)
For **each** of `customer-web`, `admin-web`, `merchant-web`:
- New Vercel project from the repo.
- **Root Directory** = the app subdir (`apps/customer-web` / `apps/admin-web` / `apps/merchant-web`).
- **Build quirk (load-bearing):** each app's `next.config.ts` sets `outputFileTracingRoot` to the repo root (`../../../`). Vercel must build with access to the **monorepo root**, not only the subdir (Vercel's monorepo support handles this when Root Directory is set correctly; do not "isolate" the subdir).
- **Framework:** Next.js (auto-detected). Build `next build`, output managed by Vercel.
- Set the env (§6) — critically `NEXT_PUBLIC_API_URL` = the §5.3 API URL. **`NEXT_PUBLIC_*` is inlined at build time**, so it must be present for the build and a change requires a rebuild.
- Deploy → capture the 3 `*.vercel.app` URLs.

### 5.7 Wire CORS (backend ← web URLs)
- Set the backend `CORS_ORIGIN` (on **web** service) to the **comma-separated** list of the 3 Vercel origins, e.g.:
  `https://customer-web-xxx.vercel.app,https://admin-web-xxx.vercel.app,https://merchant-web-xxx.vercel.app`
- It's a single comma-list env var (`credentials:true`). Each origin must match exactly (scheme+host, no trailing slash). Redeploy the web service. (The worker doesn't serve HTTP, so it doesn't need CORS.)

### 5.8 Access control + noindex (§9)
- Apply password/allowlist protection to all 3 Vercel projects.
- Ensure `X-Robots-Tag: noindex` + a `robots.txt` disallow on all 3 (Vercel preview deploys are noindex by default; for a production Vercel deploy add the header — see §9).

### 5.9 Seed test data
- Run the dev seed against the staging branch (the same `npx prisma db seed` flow, or the production-safe `prisma/seed-reference.ts` with its `ALLOW_REFERENCE_SEED` / `REFERENCE_SEED_CONFIRM` gates). **Seed/test data only — no real PII.**
- Seed credentials are the standard dev logins (admin/customer/merchant/staff). Branch PINs default `1234`.

---

## 6. Environment variables per app

> Full backend reference: root `.env.example` (documents all ~40 vars with generation commands + fail-closed notes). Below is the **staging-relevant** set.

### 6.1 Backend `web` + `worker` (identical env on both)

**Required to boot (13 — fail-closed):**

| Var | Staging value |
|---|---|
| `DATABASE_URL` | Neon **staging branch**, **direct** endpoint, `?sslmode=require` |
| `REDIS_URL` | Railway Redis (set `noeviction`) |
| `ENCRYPTION_KEY` | **fresh** 64-char hex: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |
| `JWT_SECRET_CUSTOMER` | fresh 32-byte hex, distinct |
| `JWT_SECRET_MERCHANT` | fresh, distinct |
| `JWT_SECRET_BRANCH` | fresh, distinct |
| `JWT_SECRET_ADMIN` | fresh, distinct |
| `STRIPE_SECRET_KEY` | **`sk_test_…`** |
| `STRIPE_WEBHOOK_SECRET` | `whsec_…` from the §5.5 test webhook |
| `TWILIO_ACCOUNT_SID` | test/sandbox |
| `TWILIO_AUTH_TOKEN` | test/sandbox |
| `TWILIO_VERIFY_SERVICE_SID` | per-env Verify service |
| `TWILIO_FROM_NUMBER` | a valid Twilio number |

**Non-secret config (set these):**

| Var | Staging value | Why |
|---|---|---|
| `NODE_ENV` | `production` | so `RATE_LIMIT_RELAX` can never engage |
| `CORS_ORIGIN` | the 3 Vercel origins (comma list) | else every browser call is preflight-blocked |
| `TRUST_PROXY` | `1` | correct `req.ip` behind Railway's proxy (per-client rate limits) — **must set** |
| `BULLMQ_PREFIX` | `redeemo` | queue key namespace |
| `WORKER_CONCURRENCY` | `5` | worker only |
| `SMS_ALLOWED_COUNTRY_CODES` | `+44` | toll-fraud guard (always enforced) |
| `SMS_GLOBAL_DAILY_CAP` | `500` | SMS cost circuit-breaker |
| `WEB_APP_URL` | the customer-web Vercel URL | password-reset link base |
| `MERCHANT_PORTAL_URL` | the merchant-web Vercel URL | merchant link base |
| `ADMIN_PANEL_URL` | the admin-web Vercel URL | admin link base |

**Dark feature gates (keep OFF / sandboxed):**

| Var | Staging value |
|---|---|
| `EMAIL_ENABLED` | `false` (fully dark) **or** `true` **with** `EMAIL_SANDBOX=true` + a Resend test key (D-5) |
| `EMAIL_SANDBOX` | `true` (belt-and-braces — redirects all mail to the allowlist) |
| `EMAIL_SANDBOX_ALLOWLIST` | e.g. `qa@redeemo.co.uk` (a real inbox you control) |
| `RESEND_API_KEY` | only if `EMAIL_ENABLED=true`; a **staging** Resend key |
| `STORAGE_ENABLED` | `false` (or `true` + staging R2 bucket if you want to exercise logo/photo uploads) |
| `MODERATION_ENABLED` | `false` |
| `CAPTCHA_ENABLED` | `false` for staging (merchant registration accepts the always-pass test token) |
| `PORT` | leave unset — Railway injects it |

`R2_*`, `TURNSTILE_SECRET_KEY`, `RESEND_WEBHOOK_SECRET`, `GOOGLE_MAPS_API_KEY`, `ADMIN_OPS_ALERT_EMAIL` are only needed if you enable their respective gate. Reference-seed vars (`ALLOW_REFERENCE_SEED` etc.) are for the seed script only, not runtime.

### 6.2 `customer-web` (Vercel)

| Var | Required | Secret | Staging value |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | no | the §5.3 API URL (drives CSP `connect-src`) |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | no | **`pk_test_…`** |
| `NEXT_PUBLIC_MARKETPLACE_LIVE` | no | no | **`false`** — keep marketplace pages hidden while seed data is present |
| `CSP_REPORT_ONLY` | no | no | optionally `true` for the first deploy if a flow gets CSP-blocked |
| `ENABLE_HSTS` / `HSTS_MAX_AGE` | no | no | leave unset (Vercel serves HTTPS already) |

Auth is localStorage + a non-secret `redeemo_auth` flag cookie — **no server secrets** in this app.

### 6.3 `admin-web` (Vercel)

| Var | Required | Secret | Staging value |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | no | the §5.3 API URL |
| `NODE_ENV` | platform | no | leave to Vercel (`next build` sets production → tight CSP) |

Auth is two-step email-OTP, localStorage + a non-secret `redeemo_admin_auth` flag cookie — **no server secrets**. Admin's prod origin (`admin.redeemo.co.uk`) is Phase 4; for staging the Vercel URL just needs to be in the backend `CORS_ORIGIN`.

### 6.4 `merchant-web` (Vercel)

| Var | Required | Secret | Staging value |
|---|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | no | the §5.3 API URL (used by both the BFF route handlers **and** the browser) |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no | no | keep the Cloudflare always-pass test key `1x00000000000000000000AA` |
| `NODE_ENV` | platform | no | leave to Vercel (production → `Secure` session cookie + tight CSP) |

The BFF session cookie `redeemo_merchant_session` stores the backend's opaque refresh token as plain JSON — **no signing secret** in merchant-web. Tampering breaks a session but can't forge one (backend validates the refresh token). So **no secret env vars** in this app.

---

## 7. Secrets YOU configure manually (never committed)

Generate fresh, store in each platform's secret store:

```bash
# 64-char hex (32 bytes) — ENCRYPTION_KEY and each JWT secret (run 5 times, distinct values)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- **Railway (web + worker):** `DATABASE_URL`, `REDIS_URL`, `ENCRYPTION_KEY`, `JWT_SECRET_CUSTOMER/MERCHANT/BRANCH/ADMIN`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, the 4 Twilio vars, and (if D-5 = sandbox email) `RESEND_API_KEY`.
- **Vercel:** only the non-secret `NEXT_PUBLIC_*` + (customer-web) the **test** Stripe publishable key. No real secrets live in the Next apps.
- **Never** put backend secrets (DB URL, Stripe secret, JWT secrets) into any Vercel/Next app — they belong only to the backend services.

---

## 8. Email in staging (dark vs sandbox)

Two safe options (D-5), **neither sends mail to real users**:

- **Fully dark (`EMAIL_ENABLED=false`):** zero outbound mail. Admin/merchant **OTP codes are generated but not delivered** — you read them from the API logs (the wrapper logs a placeholder). Simplest; no Resend account needed.
- **Sandboxed (`EMAIL_ENABLED=true` + `EMAIL_SANDBOX=true` + `EMAIL_SANDBOX_ALLOWLIST=<your inbox>` + a staging `RESEND_API_KEY`):** every email is **redirected to your one allowlist inbox**, so OTP/notification emails actually arrive (nicer to test), but can never reach a real customer. Requires a Resend test key.

Either way, **production live email stays OFF** and its gates (verified domain + SPF/DKIM/DMARC, monitored inboxes, bounce webhook, spend cap) are untouched. The §SEC.1 atomic send-limiter already shipped (PR #203).

---

## 9. Access control + noindex (the "private" in private staging)

**Password/allowlist — pick one:**
- **Vercel Deployment Protection → Password Protection** (or **Vercel Authentication** = only your Vercel team). Cleanest, applies to the whole app. **Requires Vercel Pro.**
- **No-Pro fallback (code):** a tiny env-gated Basic-Auth check in each app's `middleware.ts` (reads a `STAGING_BASIC_AUTH_USER`/`…_PASS`, returns 401 with `WWW-Authenticate` when unset-match). This is a small code change we'd add behind an env flag so it's inert in prod. Flag it if you want this route.
- **API:** the backend is CORS-gated + per-route auth, but its **public** discovery/health endpoints are reachable directly. For a truly private API, optionally add Railway IP-allowlisting or an edge Basic-Auth. Recommended but not strictly required (the marketplace gate + auth cover most surfaces).

**Noindex / no public discovery:**
- Vercel **preview** deployments already send `X-Robots-Tag: noindex`. If you use a Vercel **production** deployment for staging, add `X-Robots-Tag: noindex, nofollow` via each app's headers and a `robots.txt` with `Disallow: /`.
- Keep `NEXT_PUBLIC_MARKETPLACE_LIVE=false` so customer-web's marketplace pages (`/discover`, `/map`, `/merchants`, `/search`, `/categories`) stay hidden regardless.

---

## 10. Verification (after deploy)

Run top-to-bottom; each must pass before handing over URLs.

1. **API health:** `curl https://<api>/health` → `{"status":"ok"}`.
2. **Boot integrity:** API + worker logs show a clean start (no `validateRequiredEnv` aggregation error). Worker log shows the 3 workers + 3 repeatables registered.
3. **Migrations applied:** the staging DB shows all migrations incl. the 4 Branches ones (`prisma migrate status` against `DATABASE_URL` → "up to date").
4. **Access control:** opening each Vercel URL in a private window prompts for the password / is blocked without it.
5. **noindex:** `curl -I https://<web-url>` shows `x-robots-tag: noindex`.
6. **CORS:** from the customer-web URL, a discovery call to the API succeeds (no CORS error in the browser console); a call from a random origin is blocked.
7. **Auth round-trip:**
   - Customer: register/login. Phone OTP fires **real Twilio** (NODE_ENV=production disables any dev bypass) → use a number you control or Twilio test mode. Email-verify is dark/sandboxed (read OTP from logs or the sandbox inbox).
   - Admin + merchant: email-OTP login → read the code from logs (dark) or the sandbox inbox (D-5).
8. **End-to-end redemption:** subscribe (Stripe **test** card `4242…`) → redeem a voucher → validate via merchant/branch → confirms the core loop on staging data.
9. **Worker sweep (Branches):** stage an opening-hours change in merchant-web → confirm the `promote-pending-hours` sweep promotes it after the 2h window (or shorten the window via the dev-only path to verify the mechanism); confirm the worker log shows the sweep firing every 60s.
10. **Stripe webhook:** trigger a test event → API logs show it received + signature-verified.

---

## 11. Rollback / stop-and-report triggers

**Stop and report (don't push through) if any of these occur:**
- `validateRequiredEnv` aborts boot (a required secret missing/placeholder) — fix the env, don't bypass the check.
- `prisma migrate deploy` errors or reports drift on the staging branch — **stop**; do not force. The PR-8 multi-window migration is the **irreversible-once-2+-rows** constraint swap, so never `migrate resolve --rolled-back` it after data exists.
- Redis is not `noeviction` (or eviction is observed) — BullMQ jobs will be silently lost.
- CORS still blocks the web apps after `CORS_ORIGIN` is set — re-check exact origin strings (no trailing slash, correct scheme).
- An access-control gap (a URL reachable without the password, or `x-robots-tag` missing).
- Any sign that **real** email/SMS reached a non-allowlisted address, or that **live** (non-test) Stripe/Twilio keys were used.
- The customer-app preview build silently points at `localhost` (see §12) — a sign the EAS env block wasn't added.

**Rollback:**
- **App/config rollback** is cheap: Vercel keeps every deploy (instant rollback); Railway redeploys a prior image. Reverting env vars + redeploying restores the prior state.
- **DB rollback:** the staging Neon **branch** is disposable — delete/recreate the branch to reset. **Never** roll back a migration on a branch that has multi-window hours data (PR-8 constraint swap is one-way); recreate the branch instead.
- **Teardown:** delete the Railway project + the 3 Vercel projects + the Neon staging branch. Nothing in staging touches prod/live data or AWS.

---

## 12. (Optional, separate) Customer app — EAS, not a URL

**The customer app is React Native / Expo. It does not become a URL** — there's no web page to host. It's distributed as a **build installed on a device** (internal/TestFlight) or via the stores. This is a **separate track and must not block the web/API staging rollout above.**

The equivalent of "staging access" for the app:

1. **One eas.json prep edit (code, do when we actually build):** the `preview` (and `production`) profiles in `apps/customer-app/eas.json` currently set **no env**, so a build silently bakes the `http://localhost:3000` fallback (unreachable on a real device). Add to the `preview` profile:
   ```json
   "env": { "EXPO_PUBLIC_API_URL": "https://<staging-api-url>" }
   ```
   `EXPO_PUBLIC_API_URL` is read at config-eval time → frozen into the build, so it must be set at **build** time, per profile.
2. **Build (EAS):** `eas build --platform ios --profile preview` (and/or `--platform android`). Profile `preview` = `distribution: internal` (ad-hoc / TestFlight-internal, no dev client). EAS projectId is already set (`7f4d609c-…`).
3. **Distribute:** iOS → TestFlight internal testers (your Apple Developer account) or an ad-hoc install; Android → an internal-track APK/AAB or the internal testing channel. You install it on your phone; it talks to the **staging API**.
4. **Toolchain note:** the customer app pins **Node 20.19.4** (`apps/customer-app/.nvmrc`) for the Expo/jest toolchain — distinct from the backend's Node 24. EAS uses its own managed image; local pre-build steps must run on Node 20.

**Deferred for the app (not staging blockers):**
- **Universal links / deep links still reference `redeemo.com`** in `app.config.ts` (`associatedDomains` / Android intent host). Per the domain decision Redeemo owns **`redeemo.co.uk`**, not `.com`. Fixing this (the **D-D** gate) needs an `app.config.ts` change + AASA/`assetlinks.json` hosting + an app rebuild — defer until custom domains.
- App `version` mismatch (`app.config.ts` `0.1.0` vs `package.json` `1.0.0`) — cosmetic; align before a store build.
- Subscription purchase in-app is deferred (Apple IAP / Google Play), so no Stripe key in the app.

**Recommendation:** ship the **web/API staging first** (Sections 1–10), then do the app EAS preview as a follow-up once you've confirmed the staging API URL — so the app build can point at a known-good host.

---

## 13. What this does NOT change

- No public launch; no real customers; legal-content sign-off gate **unchanged**.
- No custom domains / DNS changes (raw platform URLs only).
- No live Resend production email (dark or sandbox only).
- No live Stripe/Twilio keys (test only).
- No marketplace exposure (`NEXT_PUBLIC_MARKETPLACE_LIVE=false`).
- **No AWS changes** — the old site keeps serving from AWS untouched.
- No source-code product changes (the only possible code touch is the optional §9 basic-auth middleware and the §12 eas.json env block — both flagged, both done only on your go-ahead).

---

## 14. Decision status + remaining assumptions

**All D-1…D-6 + the customer-app sequencing are LOCKED (see §3).** No strategic decisions remain open.

**Assumptions to confirm at execution time (not blockers — verify when we start):**
- **Vercel tier** — whether the account has **Pro** (so Deployment Protection / password is available). If not, D-4's Basic-Auth middleware is a flagged code change awaiting approval; until then staging customer-web's public pages rely only on `MARKETPLACE_LIVE=false` (admin/merchant already require login).
- **Email path (D-5)** resolves to sandbox vs dark at execution time, based on whether a Resend test key + an allowlist inbox is easy to set up.
- **Twilio test creds** are obtainable (required to boot; staging SMS is real, `+44`-capped).
- **Host = Railway** (per the existing backend plan); Render is the documented alternative if preferred.

The next step is a click-by-click execution checklist (separate, planning-only), pausing at every account/secret/card step.
