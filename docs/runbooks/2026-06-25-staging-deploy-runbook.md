# Redeemo — Private Staging Runbook (audit-corrected)

> **Status: AUDIT + PLAN. No changes made.** This was first drafted (2026-06-25) as a blank-slate stand-up. A read-only infrastructure audit then established that **a `redeemo / staging` environment already exists and is live** (Railway web + worker + Redis, Neon staging branch, sandbox email), built owner-led on **2026-06-13**. This version reflects the **real current state**: most of staging already exists; the genuine remaining work is **deploying the three Next apps to Vercel + wiring CORS**, plus a short hardening/verify pass.
>
> **Not a public launch.** Staging stays access-controlled, noindex, test-keys-only, sandboxed email, seed/test data only.
>
> Companion docs: `docs/runbooks/railway-backend-hosting-plan.md`, `docs/runbooks/deploy-security-runbook.md`, root `.env.example`. Primary historical record: memory `project_dns_email_aws_migration.md`.

---

## A. Infrastructure audit (read-only, 2026-06-25)

Sources: repo docs + `.env`/config files (secrets redacted) + project memory + **live probes** (`curl` of the Railway Web URL; `gh api` deployment history). The Railway CLI is not installed here, so Railway-side config is owner-asserted (from memory + the screenshot), not independently inspected.

| Area / service | Previously planned/documented | Currently exists | Confirmed how | Missing / unknown | Recommended action | Requires |
|---|---|---|---|---|---|---|
| **Railway project/env** | (runbook draft said: *create* a separate `redeemo-staging` project) | **Project `redeemo`, env `staging`** — ONE project / ONE env (production added later). Web+worker+Redis online. | Owner screenshot + GitHub env `redeemo / staging` (30 deploys by `railway-app[bot]`) | n/a | **Reuse as-is.** Correct the runbook (D-1 was wrong — it's one-project-one-env, not a separate project). | no action (reuse) |
| **Web (API) service** | Railway service, build/start/pre-deploy/health | **LIVE**, auto-deploys from `main`; running **`fe10fb16`** (latest Branches merge), deploy state **success** | `curl /health` → 200 `{"status":"ok"}`; `gh` deployment `fe10fb16` = success | which exact env vars are set (owner-asserted: 24) | Reuse. Verify the env table (§6) against Railway. | no action / config (verify) |
| **Worker service** | second Railway service, `npm run start:worker` | **Online** (3 processors registered per memory logs) | Owner-asserted; not HTTP-probeable | whether it's actively processing jobs (no external signal) | Verify via Railway worker logs (sweep firing, no eviction warnings). | owner action (read logs) |
| **Redis** | managed Redis, `noeviction` | **Online**, `${{Redis.REDIS_URL}}`, noeviction (Railway default) | Owner-asserted | `maxmemory-policy` not externally inspectable | Confirm `noeviction` in Railway Redis settings. | owner action (verify) |
| **Neon staging DB** | *create* a Neon branch | **EXISTS** — branch off `production` (`br-ancient-water-…`, Auto-delete=Never), direct endpoint (D-3) | Memory; live API returns real seeded data | exact branch wired to staging (inferred, not seen) | Reuse. Don't recreate. | no action (reuse) |
| **Branches migrations** | *run* `migrate deploy` for the 4 Branches migrations | **Already applied** — pre-deploy `prisma migrate deploy` ran on the `fe10fb16` success deploy | `gh` deploy success + live API healthy/DB-connected | confirm `migrate status` = up-to-date (not seen) | Optional confirm; treat as done. **Prod** still needs it (prod doesn't exist). | no action / config (optional verify) |
| **Secrets / env vars** | generate 5 fresh + provide 13 | **Already set** (24 vars on web: 13 required + 11 config/gates; ENCRYPTION_KEY+4 JWT via `openssl`; Stripe test; Twilio from dev) | Memory (owner-executed, never pasted to chat) | exact values (correctly) | **Do NOT regenerate** — regenerating `ENCRYPTION_KEY` breaks the seeded-PIN invariant. | no action (reuse) |
| **Stripe** | test webhook + keys | Stripe **test** keys set; `STRIPE_WEBHOOK_SECRET` = the dev value (boot-satisfying) | Memory | a dedicated staging webhook (only needed to test staging payments) | Add a staging Stripe **test** webhook only if/when testing payments on staging. | owner action (optional) |
| **Twilio** | 4 boot vars (test) | Copied from dev `.env` (dummy/dev) — boots the API | Memory; API boots | whether they send real SMS (likely dev/dummy) | If you need customer phone-verify on staging, set working Twilio test creds (SMS is `+44`-capped). | owner action (optional) |
| **Resend / email** | set up dark or sandbox | **LIVE in sandbox** — worker `EMAIL_ENABLED=true` + staging `RESEND_API_KEY` + `EMAIL_SANDBOX=true` + allowlist `admin@redeemo.co.uk`; web stays `EMAIL_ENABLED=false`. Domain verified, DKIM/SPF green, bounce webhook wired+verified. End-to-end forgot-password test passed. | Memory (executed 2026-06-13) | n/a | **Reuse.** D-5 is already resolved (sandbox). | no action (reuse) |
| **Cloudflare / DNS** | defer custom domains | **DNS migration to Cloudflare COMPLETE** (2026-06-12); NS switched; SPF/DMARC tidied; **Zoho MX untouched**. `redeemo.co.uk` still serves the **old AWS site**. | Memory | api/web/merchant custom-domain records (not created — correctly deferred) | Leave DNS as-is. Custom domains = a later prod step. | no action |
| **`CORS_ORIGIN` (API)** | set to the 3 Vercel URLs | Currently **`https://redeemo.co.uk`** (the *future prod* web origin, which today serves the old AWS site) | Memory; live probe couldn't read allowlist | the Vercel staging origins are **not** allowlisted yet | **ADD the 3 Vercel origins** once the apps deploy (else browsers are CORS-blocked). | owner action (Railway config) |
| **Vercel — customer-web** | create project | **NOT deployed** | `gh`/memory: no Vercel deploy; only CI build-gate exists | the whole deployment | **Deploy to Vercel** (§4). The genuine gap. | owner action + config |
| **Vercel — admin-web** | create project | **NOT deployed** | same | the whole deployment | **Deploy to Vercel** (§4). | owner action + config |
| **Vercel — merchant-web** | create project | **NOT deployed** | same | the whole deployment | **Deploy to Vercel** (§4). | owner action + config |
| **Access control + noindex** | password/allowlist + noindex on web | **Not applied** (no Vercel apps yet). API has **no `X-Robots-Tag`** and its public discovery endpoints are reachable. | live `curl -I /health` (no robots header) | Vercel protection (needs Pro?) | Apply Vercel Deployment Protection + noindex when the apps deploy; decide D-4. | owner action (+ code if no Pro) |
| **Reset-link base URLs** | set `WEB_APP_URL` etc. | `WEB_APP_URL`/`MERCHANT_PORTAL_URL`/`ADMIN_PANEL_URL` **not in the 24** → default (WEB_APP_URL→`localhost:3001`) | Memory (24-var list) | so staging email reset links currently point at localhost | Once the Vercel URLs exist, set these on staging so links resolve. | owner action (config) |
| **Customer-app (EAS)** | EAS preview, follow-up | Not built. `eas.json` preview profile sets **no env** → would bake `localhost`. | repo `eas.json` | a preview build pointing at staging | Follow-up after web/API (one `eas.json` env edit + a build). | owner action + 1 code edit |
| **Production environment** | out of scope | **Does NOT exist** (no GitHub `production` env, no prod deploys) | `gh api environments`/deployments | n/a | Out of scope; build deliberately later behind the launch gate. | no action |
| **§SEC.1 atomic email limiter** | prereq for **prod** email-on | **Conflicting memory:** ledger says OPEN (2026-06-08); DNS file says done PR #203 (2026-06-13) | not re-verified | true code state | Verify against `src/api/shared/pwdResetLimiter.ts` before **prod** email-on. **Not a staging blocker** (staging email is sandbox-only). | code (verify only) |

---

## B. Bottom line — what's reusable vs the real remaining work

**Already live (reuse, do NOT rebuild):** the Railway `redeemo/staging` project, the web API (auto-deploying from `main`, currently `fe10fb16`), the worker, Redis (noeviction), the Neon staging branch (with the 4 Branches migrations already applied), all 24 backend env vars/secrets, and **sandbox email** (verified end-to-end).

**The genuine remaining work to get you URL access to the *web platforms*:**
1. **Deploy `customer-web`, `admin-web`, `merchant-web` to Vercel** (the only fully-missing piece).
2. **Point each app's `NEXT_PUBLIC_API_URL` at `https://web-staging-bf7c.up.railway.app`** (build-time inlined).
3. **Add the 3 Vercel origins to the staging API `CORS_ORIGIN`** (currently only `redeemo.co.uk`).
4. **Access control + noindex** on the 3 Vercel apps (D-4).
5. **Set `WEB_APP_URL` / `MERCHANT_PORTAL_URL` / `ADMIN_PANEL_URL`** on staging to the Vercel URLs so sandbox email links resolve.
6. (Follow-up) **Customer-app EAS preview** pointing at the staging API.

Plus a short **hardening/verify pass** on the existing staging (§5).

---

## 1. Topology (current)

```
   ┌─────────────── ALREADY LIVE (Railway project: redeemo / staging) ───────────────┐
   │  web (API)  ✅ fe10fb16   worker ✅ (3 processors)   Redis ✅ (noeviction)        │
   │  https://web-staging-bf7c.up.railway.app   ── Neon staging branch ✅ (migrated)  │
   │  sandbox email ✅ (worker EMAIL_ENABLED=true, EMAIL_SANDBOX→admin@redeemo.co.uk)  │
   └──────────────────────────────────────┬───────────────────────────────────────────┘
                                           │  CORS_ORIGIN currently = redeemo.co.uk
                                           │  → must ADD the Vercel origins
   ┌──────────────────────────── TO DEPLOY (Vercel) ──────────────────────────────────┐
   │  customer-web ⬜      admin-web ⬜      merchant-web ⬜                              │
   │  (NEXT_PUBLIC_API_URL = the Railway Web URL; access-protected; noindex)           │
   └───────────────────────────────────────────────────────────────────────────────────┘
   customer-app (Expo) — mobile, NOT a URL — EAS preview follow-up (§12)
```

---

## 3. Decisions (corrected to reality, 2026-06-25)

| # | Decision | Status |
|---|---|---|
| D-1 | Railway shape | **ALREADY = one project `redeemo`, one `staging` env** (the earlier "separate project" draft was wrong; production env added later). |
| D-2 | Staging DB | **ALREADY = Neon branch** (`br-ancient-water-…`). |
| D-3 | Neon endpoint | **ALREADY = direct (non-pooled)**. |
| D-4 | Vercel access control | **OPEN — to apply when the apps deploy.** Prefer Vercel Deployment Protection (Password) if Pro is available; if not, the Basic-Auth middleware is a **flagged code change needing explicit approval — not silent**. |
| D-5 | Staging email | **ALREADY = sandbox** (worker on, redirected to `admin@redeemo.co.uk`). |
| D-6 | Staging URLs | **Raw platform URLs** (Railway URL live; Vercel `*.vercel.app` for the apps). Custom domains deferred. |
| App | Customer-app EAS | Follow-up after web/API (§12). |

---

## 4. Remaining work — deploy the 3 web apps + wire them in

> The API is already up. These steps add the web URLs. Order: deploy each Vercel app → then update CORS.

### 4.1 Vercel × 3
For **each** of `customer-web`, `admin-web`, `merchant-web`:
- New Vercel project from `MSC23-bot/Redeemo`. **Root Directory** = `apps/<app>`.
- **Build quirk (load-bearing):** each `next.config.ts` sets `outputFileTracingRoot` to the repo root (`../../../`), so Vercel must build with monorepo-root access — set Root Directory correctly; do **not** isolate the subdir. (No `vercel.json` exists; Vercel auto-detects Next.js.)
- Set env (§6). Critically `NEXT_PUBLIC_API_URL = https://web-staging-bf7c.up.railway.app` (**build-time inlined** — a change needs a rebuild).
- Deploy → capture the 3 `*.vercel.app` URLs.

### 4.2 Wire CORS (Railway `web` env)
- Update the staging API `CORS_ORIGIN` (comma list) to include the 3 Vercel origins, e.g.
  `https://customer-web-xxx.vercel.app,https://admin-web-xxx.vercel.app,https://merchant-web-xxx.vercel.app`
  (you may keep `https://redeemo.co.uk` too — harmless). Exact match, no trailing slash. Redeploy/restart the web service so the new value is read.

### 4.3 Reset-link base URLs (Railway `web` env, optional but recommended)
- Set `WEB_APP_URL` = the customer-web Vercel URL, `MERCHANT_PORTAL_URL` = merchant-web URL, `ADMIN_PANEL_URL` = admin-web URL — so the sandbox password-reset / claim emails point at staging instead of `localhost`.

### 4.4 Access control + noindex (D-4)
- Enable Vercel **Deployment Protection (Password)** on all 3 (or, if no Pro → pause for the flagged Basic-Auth middleware approval).
- Ensure `X-Robots-Tag: noindex` + `robots.txt Disallow` (Vercel **preview** deploys are noindex by default; for a production Vercel deploy add the header). Keep `NEXT_PUBLIC_MARKETPLACE_LIVE=false` so customer-web's marketplace pages stay hidden.

---

## 5. Hardening / verify the existing staging (no rebuild)

- **Redis `noeviction`** — confirm in Railway Redis settings (owner-asserted as the default). 🛑 if it's anything else.
- **Worker is processing** — check the worker logs: the 3 processors registered + the `promote-pending-hours` / outbox-reconcile sweeps firing (every 60s) + no eviction warnings.
- **Migration state** — optional `prisma migrate status` against the staging `DATABASE_URL` → "up to date" (expected; the `fe10fb16` deploy's pre-deploy applied them).
- **API exposure** — the staging API's **public discovery endpoints are reachable** (e.g. `/api/v1/customer/categories` returns seeded data) and the API has **no `X-Robots-Tag`**. The data is low-sensitivity seed data, but for a fully-private staging consider Railway IP-allowlisting on the API (optional; weigh against the apps needing public calls).
- **§SEC.1 limiter** — verify against `pwdResetLimiter.ts` before any **prod** email-on (not a staging blocker — staging is sandbox).
- **Seeded login note** — on the staging branch the seeded customer email was changed to `staging-customer@redeemo.co.uk` (not reverted); use that to log in on staging.

---

## 6. Environment variables (per app)

> Backend vars are **already set on Railway staging** (24 vars). Below is the reference + the **deltas to apply** for the Vercel work.

### 6.1 Backend `web` + `worker` (Railway — already set; verify + the deltas)
Required-to-boot (13): `DATABASE_URL` (Neon staging, direct), `REDIS_URL`, `ENCRYPTION_KEY` (do **not** regenerate), `JWT_SECRET_CUSTOMER/MERCHANT/BRANCH/ADMIN`, `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, 4× Twilio. Config: `NODE_ENV=production`, `TRUST_PROXY=1`, `BULLMQ_PREFIX=redeemo`, `WORKER_CONCURRENCY=5`, SMS caps. Gates: `STORAGE_ENABLED=false`, `MODERATION_ENABLED=false`, `CAPTCHA_ENABLED=false`; **email split** = web `EMAIL_ENABLED=false`, worker `EMAIL_ENABLED=true` + `EMAIL_SANDBOX=true` + `EMAIL_SANDBOX_ALLOWLIST` + staging `RESEND_API_KEY`.
**Deltas to apply (§4):** `CORS_ORIGIN` += the 3 Vercel origins; `WEB_APP_URL`/`MERCHANT_PORTAL_URL`/`ADMIN_PANEL_URL` = the Vercel URLs.

### 6.2 `customer-web` (Vercel — to set)
| Var | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | `https://web-staging-bf7c.up.railway.app` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | ✅ | `pk_test_…` |
| `NEXT_PUBLIC_MARKETPLACE_LIVE` | no | `false` |
| `CSP_REPORT_ONLY` / `ENABLE_HSTS` / `HSTS_MAX_AGE` | no | leave unset (optionally `CSP_REPORT_ONLY=true` on first deploy) |

### 6.3 `admin-web` (Vercel — to set)
| Var | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | the Railway Web URL |

### 6.4 `merchant-web` (Vercel — to set)
| Var | Required | Value |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | ✅ | the Railway Web URL |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | no | keep the always-pass test key `1x00000000000000000000AA` |

No secret env vars live in any Next app (auth is localStorage + flag cookies / a BFF opaque-token cookie). Backend secrets never go into Vercel.

---

## 7. Secrets you configure manually

- **Backend secrets are already set on Railway** — nothing to regenerate. **Do not regenerate `ENCRYPTION_KEY`** (would make seeded PINs undecryptable on the staging branch).
- **Vercel:** only the non-secret `NEXT_PUBLIC_*` + (customer-web) the **test** Stripe publishable key.
- New manual items only: the 3 Vercel projects' env, the `CORS_ORIGIN` + reset-URL deltas on Railway, and (optional) a staging Stripe test webhook.

---

## 8. Email (already sandbox-live)

Staging email is **already working in sandbox**: the worker sends via Resend with `EMAIL_SANDBOX=true`, every recipient redirected to `admin@redeemo.co.uk`, so OTP/notification/reset emails arrive in one inbox and never reach a real customer. Bounce/complaint webhook is wired + signature-verified. **Production email stays OFF.** When the Vercel apps are up, set the reset-URL bases (§4.3) so the links in those sandbox emails point at staging.

---

## 9. Access control + noindex

Applies to the **Vercel apps** (the API is already hardened — HSTS, strict CSP, rate-limited). Options per D-4: Vercel Deployment Protection (Password, needs Pro) **or** a flagged Basic-Auth middleware (code change, explicit approval — not silent). Noindex via Vercel preview default or an added `X-Robots-Tag` + `robots.txt`. `NEXT_PUBLIC_MARKETPLACE_LIVE=false` keeps customer-web's marketplace pages hidden regardless.

---

## 10. Verification (after the Vercel deploy)

1. Each Vercel URL prompts for the password (access control). 2. `curl -I` shows `x-robots-tag: noindex`. 3. From a Vercel app, an API call succeeds (CORS ok); a random origin is blocked. 4. Admin/merchant email-OTP login → the code arrives in the `admin@redeemo.co.uk` sandbox inbox; customer flows work (phone-verify needs working Twilio test creds). 5. End-to-end: subscribe (Stripe test `4242…`) → redeem → validate. 6. Branches sweep: stage an opening-hours change in merchant-web → the worker's `promote-pending-hours` promotes it.

---

## 11. Rollback / stop-and-report triggers

- 🛑 **Do not recreate** the Railway project, services, Neon branch, or secrets — they exist. Recreating the Neon branch or regenerating `ENCRYPTION_KEY` would destroy staging data / break seeded PINs.
- 🛑 Redis not `noeviction`; worker crash-looping or not sweeping; `migrate status` showing drift on the staging branch (never roll back the PR-8 multi-window migration — recreate the branch instead).
- 🛑 CORS still blocking after adding the Vercel origins (re-check exact strings); a Vercel URL reachable without the password; missing noindex.
- 🛑 Any sign **real** email/SMS reached a non-allowlisted address, or a **live** (non-test) Stripe/Twilio/Resend key was used on staging.
- **Rollback is cheap:** Vercel keeps every deploy (instant revert); Railway redeploys a prior image / reverts an env var; the Neon staging branch is disposable (recreate to reset data — but only as a last resort, since it holds the migrated Branches schema). No prod/live/AWS impact (AWS stays untouched; `redeemo.co.uk` still serves the old AWS site).

---

## 12. (Optional, separate) Customer app — EAS, not a URL

Unchanged from the original plan and **non-blocking**. The app is React Native/Expo → a device build, not a URL. One `eas.json` prep edit (add `"env": { "EXPO_PUBLIC_API_URL": "https://web-staging-bf7c.up.railway.app" }` to the `preview` profile — it currently sets none, so a build bakes `localhost`), then `eas build --profile preview` → TestFlight-internal / internal Android. Toolchain pins Node 20.19.4 for the Expo side. Deferred app items: universal-link domain still references `redeemo.com` (the D-D gate), `app.config.ts` version mismatch. Do the app **after** the web/API staging is confirmed, so the build points at a known-good API URL.

---

## 13. What this does NOT change

No public launch; legal-content sign-off gate unchanged. No custom domains / DNS changes (DNS migration to Cloudflare is already done; `redeemo.co.uk` still serves the old AWS site; Zoho MX untouched). No live email/Stripe/Twilio. No marketplace exposure. **No AWS changes.** The only code touches that could arise are the optional §9 Basic-Auth middleware and the §12 `eas.json` env block — both flagged, both only on your go-ahead.
