# B1 · Railway staging EU-region move: closed-scope execution plan

**Status: PLAN ONLY, owner-gated. Nothing in this document has been executed. No provider
consoles were touched to produce it; all facts are repo-verified (citations inline) or marked
as console-confirmation items.**

## 1. Goal and scope

Move the Railway `redeemo/staging` environment's compute (web + worker services and the Redis
plugin) from **US West (California, USA)** to the Railway region closest to the UK, so staging
latency to the (very likely EU-hosted) Neon database and to UK-based testers reflects
production intent.

Out of scope, explicitly: production topology, custom domains (`api-staging.redeemo.co.uk`
remains unprovisioned), Railway plan upgrades, multi-region replicas (Pro-plan only, per the
dashboard snapshot `web-settings-snapshot.md:386`), and any Neon change.

## 2. Repo-verified facts this plan stands on

- Staging region today is **US West (California, USA)**: dashboard snapshots
  `web-settings-snapshot.md:375`, `settings-after-both-edits.md:383`, `worker-snapshot.md:153`.
- Region is a **per-service** setting (`/service/<id>/settings#deploy-region-config`), so web,
  worker, and the Redis plugin are three separate moves.
- **No Railway config lives in git** (no railway.json/toml, no Dockerfile; only `Procfile`).
  The move is a dashboard operation plus conditional URL-bearing artifact updates.
- Current staging state (UPDATED 2026-07-08, supersedes the 2026-07-05 reconciliation
  `docs/runbooks/2026-07-05-security-deployment-state-reconciliation.md`): the acceptance-fix
  batch was deployed to staging Web on **2026-07-08** via `railway up` (deployment
  `07914213-f4ab-4ef2-b952-e64949b27bd9`, byte-exact `f470f659`; NOT the older `53bafac4`
  baseline the reconciliation runbook records). Auto-deploy remains DISABLED (deploys are
  manual `railway up`), **worker OFFLINE**, no pre-deploy migration hook. NOTE for E3: a
  region-change redeploy rebuilds the currently-configured source/last image; confirm (C2)
  whether it serves the 2026-07-08 `railway up` artifact (`f470f659`) or reverts to the
  configured branch, and re-`railway up` from a clean `origin/main` tree if needed so the
  region move does not silently roll staging back.
- DB: Neon staging endpoint `ep-round-wave-abpnesg3` (pooled). **CONFIRMED EU (2026-07-08):**
  the sole Neon project "Redeemo" (`lively-lab-12323797`) is `aws-eu-west-2` (London),
  proxy `eu-west-2.aws.neon.tech`, verified live via the Neon API. This satisfies C3's abort
  criterion up front: moving Railway to the EU shortens app-to-DB latency.
- Redis: **Railway plugin in the same project** (`${{Redis.REDIS_URL}}`), single region by
  design (`docs/operations/redis-namespaces.md:83-84`). Contents are ephemeral classes
  (sessions, limiters, BullMQ; worker offline so no in-flight jobs).
- The staging URL `https://web-staging-bf7c.up.railway.app` is NOT hardcoded in code or CI; it
  lives in the Railway service domain + Vercel per-app env (`NEXT_PUBLIC_API_URL` /
  `EXPO_PUBLIC_API_URL`) + docs. Resend bounce webhook points at it
  (`docs/runbooks/2026-06-25-staging-deploy-runbook.md:39`).

## 3. Console confirmations required BEFORE execution (owner or approved session)

C1. Current region of ALL THREE services (web, worker, Redis plugin): confirm the snapshot is
    still true.
C2. Whether changing a service's region **preserves the generated domain**
    (`web-staging-bf7c.up.railway.app`) and whether it is an in-place redeploy or a rebuild.
    This decides whether step E5 (URL ripple) applies.
C3. ~~Neon staging endpoint's actual region~~ **RESOLVED 2026-07-08: CONFIRMED London
    (`aws-eu-west-2`) via the Neon API** (see §2). The abort criterion is satisfied; the move
    shortens app-to-DB latency. No further console check needed for this item.
C4. Whether the Railway Redis plugin supports region change, or must be recreated in the new
    region (recreation = ephemeral-data loss; acceptable, see risks).
C5. Env-var inventory re-confirmed pre/post (`DATABASE_URL`, `REDIS_URL` reference,
    `CORS_ORIGIN`, `TRUST_PROXY`, `WEB_APP_URL`/`MERCHANT_PORTAL_URL`/`ADMIN_PANEL_URL`):
    docs' var lists are owner-asserted, never console-verified.

## 4. Target region

Railway's EU region (Amsterdam, `europe-west4` in Railway's labelling at last knowledge;
confirm exact label in the region dropdown). Railway offers no UK region; Amsterdam is the
closest to both UK testers and Neon eu-west-2 (London).

## 5. Execution steps (owner-gated; do not run without approval)

E1. **Snapshot before state**: export/screenshot each service's Settings (region, domain,
    source branch/SHA, env-var NAMES only) so rollback is mechanical.
E2. **Redis first** (per C4): move or recreate the Redis plugin in the EU region. If
    recreated: confirm `${{Redis.REDIS_URL}}` reference auto-resolves for web + worker; expect
    sessions/rate-limits to reset (staging-acceptable).
E3. **Web service region change**: apply region in Settings; let it redeploy the SAME source
    (`recovery/pre-r1-baseline` @ `53bafac4`; auto-deploy stays DISABLED). Verify
    `GET /health` 200 and that the serving domain matches C2's answer.
E4. **Worker service region change**: apply region. The worker is currently OFFLINE; leave it
    offline after the move (region setting persists for the next deliberate start). Do NOT
    start it as part of this plan.
E5. **Conditional URL ripple (only if C2 says the domain changed)**: update Vercel
    `NEXT_PUBLIC_API_URL` (customer-web, merchant-web, admin-web) + EAS preview
    `EXPO_PUBLIC_API_URL`, Railway `CORS_ORIGIN` + app-URL vars, the Resend webhook target,
    and the doc references (PROJECT-STATE §4 status line, staging runbook). One PR for the doc
    updates.
E6. **Verification**: `GET /health` 200 from a UK vantage; before/after latency comparison
    (simple `curl -w '%{time_total}'` x5 on /health and one DB-touching endpoint); confirm
    login + one authenticated read on staging admin portal; record results in
    PROJECT-STATE change log.

## 6. Rollback

Region change back to US West via the same per-service setting (plus Redis per C4). E1's
snapshot is the rollback reference. No data migration is involved at any step.

## 7. Risks

- **Redis ephemeral loss** on recreate: sessions/limiters reset. Accepted for staging.
- **Domain change ripple** (if C2 negative): bounded by the E5 checklist; staging-only blast
  radius.
- **Neon-not-EU surprise** (C3): abort criterion, no partial state (nothing moved before C3
  is answered).
- **Plan-tier limitation**: single region only; no behaviour change expected, but if the
  region dropdown is Pro-gated on this plan tier, STOP and report (that would make this an
  owner billing decision).

## 8. Effort and blast radius

Dashboard-only, ~30-60 min including verification, staging-only. No code changes unless E5
triggers (docs + Vercel env only even then).
