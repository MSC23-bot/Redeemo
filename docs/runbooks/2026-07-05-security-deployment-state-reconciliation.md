# Redeemo — Security & Deployment-State Reconciliation (2026-07-05)

> **Status: DOCS-ONLY RECONCILIATION. No provider, deployment, migration, worker, key or database action is authorised or implied by this document.**
>
> **Purpose.** Reconcile the security/deployment runbooks against the verified operational state after the 2026-07-03 staging Web P1001 failure + recovery, record the standing R1 decision and its reopening triggers, and provide a reusable future-deployment handoff. This document is the current authoritative snapshot; where an older runbook conflicts with it, this document wins until superseded.
>
> **Companion authoritative docs:** `docs/runbooks/r1-key-rotation-activation-runbook.md` (R1 execution record, §13 recovery), `docs/runbooks/deploy-security-runbook.md` (deploy/secret discipline), `docs/runbooks/neon-cu-burn-maintenance-rollout-runbook.md` (CU-burn + endpoint discipline). The Fable-owned security execution log at `~/Documents/Playground/redeemo-notes/security-activation-execution-log.md` is the running evidence trail.
>
> **Superseded:** `docs/runbooks/2026-06-25-staging-deploy-runbook.md` is a pre-incident snapshot and is now historical — see §5 corrections table.

Governing main at authorship: `3a097161`. Recovery baseline (Railway Web source): `53bafac4`. R1 foundation code merge: `b66b0f95`.

---

## 1. Standing decision — R1 is DEFERRED, not cancelled

The R1 encryption-key rotation is **deferred**. The existing `ENCRYPTION_KEY` remains the **approved temporary operating mode** in legacy-bridge mode — no compromise has been evidenced in the cited runbook / evidence trail (secret values were NOT inspected this session, §2), so this is a "not shown compromised" status, not an asserted verification. The application boots and serves on the single key; existing 3-part branch-PIN ciphertext reads unchanged; nothing is rotated. This was adjudicated C-DEFERRABLE (Sonnet source evidence + Opus adversarial challenge, zero blocking corrections) and is consistent with the R1 runbook's own DRAFT/preparation-only status.

**Deferred WITH R1 (advance only on a §1.1 reopening trigger):** P9 (acceptance-fixture provenance), Option 3 (SELECT-only candidate-fixture inspection), the temporary staging-only SELECT-only inspection role, and R1 activation / the rotation ceremony itself (fingerprint parity, staging acceptance, any future key flip). These are the key-rotation programme and do not proceed until a §1.1 trigger fires.

**Separately gated — NOT tied to an R1 trigger:** P1b (or the equivalent direct-endpoint migration-readiness verification: identity/permission preflight + `prisma migrate status` on the verified Neon DIRECT endpoint) remains **unexecuted and separately owner-gated**. It **may be approved for a non-R1 deployment migration** — e.g. a separately approved pre-launch current-main deploy that needs its additive migrations applied — **without reopening or executing the rotation ceremony**. Such approval authorises only the specific in-scope migration and promotes **no** P9, Option 3, inspection-role, or key-rotation step.

### 1.1 Reopen R1 only when ONE of these triggers fires
1. The owner **schedules a post-launch rotation**.
2. The current `ENCRYPTION_KEY` **may have been exposed or compromised** (any suspected leak → rotation becomes required, not optional).
3. **Explicit multi-key mode is needed** (an operational reason to run the keyring in explicit mode with more than the bridged legacy kid).
4. A **relevant encryption format or rollback contract changes** (e.g. a v2 write-path is enabled, the envelope format changes, or the rollback-compatibility guarantee is altered).

Until a trigger fires, do not reopen or advance P9 / Option 3 / the SELECT-only role / R1 rotation. (P1b migration-readiness is separately gated per §1 and may be owner-approved for a non-R1 deployment migration without any trigger — it promotes no rotation step.) R1 rotation remains a scheduled-later, owner-gated programme.

---

## 2. Verified operational state (last verified 2026-07-03/05; values NOT inspected)

| Fact | Verified state | Source |
|---|---|---|
| Railway **Web source** | Protected recovery branch `recovery/pre-r1-baseline` @ `53bafac4` (NOT `main`) | r1 runbook §13.4; security log |
| Serving Web **deployment** | `6d26b0b4-38ce-4f03-bba7-acaf620a2cd8` | r1 runbook §13.5.1 |
| **Auto-deploy** | Last verified **DISABLED** (2026-07-05, owner-executed). A 2026-07-05 read-only check had earlier observed it flipped ON; it was returned to DISABLED. Re-verify at the next session (see §10 warning). | security log; r1 runbook §11 |
| Web **pre-deploy migration command** | **ABSENT** — removed by the 2026-07-03 recovery deployment and **not restored**. The `Procfile` has NO `release:` line. | r1 runbook §13.4 / D-R5; deploy-security-runbook §"Procfile" |
| **Worker** | **Offline** (stopped) | r1 runbook §10/§11; cu-burn runbook |
| Migration path | Owner-approved + operator-run on the **verified Neon DIRECT endpoint** only. Pooled `DATABASE_URL` migrations are **prohibited** (the 2026-07-03 P1001 came from a pooled migrate attempt). | deploy-security-runbook §"migrations"; cu-burn runbook E7 |
| Runtime `DATABASE_URL` endpoint class | **POOLED** (`ep-round-wave-...`, verified at P1a). NOTE: the older staging runbook D-3 calls it "direct" — that is stale; the runtime is pooled and migrations must use the separate DIRECT endpoint. | r1 runbook §13.3.1 |
| Provider / environment **values** | **UNVERIFIED** — secrets, Variables, logs and connection strings were NOT inspected (boundary). All "which vars are set" statements are owner-asserted, not independently confirmed. | this session boundary |
| Branch protection | `recovery/pre-r1-baseline` protected by ruleset `18485943` (exact-target; deletion/non-fast-forward/update denied; zero bypass) — preserve it. | r1 runbook D-R4 |

**The exact deployment SHA is NOT pre-selected.** No historical SHA (e.g. `fe10fb16`) is automatically the next deployment target. The SHA to deploy must be **chosen and reviewed at the future deployment session** (§3).

---

## 3. Reusable future-deployment handoff (document only — DO NOT execute now)

When the owner later approves deploying a reviewed current-main SHA to staging, perform these checks **in order**. This is a checklist, not an authorisation.

1. **Freeze the exact SHA.** Record the full 40-char SHA to deploy; bind all subsequent checks to it.
2. **Compare with the serving recovery baseline.** `git diff --stat 53bafac4..<SHA>` (and on `src/api/shared/`, `src/worker.ts`, `prisma/`) so the deployer sees exactly what changes vs what is currently serving.
3. **Inventory candidate migrations from source, then prove live pending-state separately — Git alone never proves database migration state.**
   - **(a) Source candidate inventory (Git, informational only):** `git diff --name-only 53bafac4..<SHA> -- prisma/migrations/` lists the migration files added in *source* since the baseline (as of authorship: `20260629000000_keyring_fingerprint` + `20260702000000_maintenance_alert_types`, both additive; note additive-vs-destructive + whether the serving code hard-requires each at boot). This shows what the source tree contains, **not** what the database has applied.
   - **(b) Authoritative live pending-state:** proven ONLY by `prisma migrate status` (or equivalent) run during a **separately approved operator session** against the **verified Neon DIRECT endpoint**, after an identity/permission preflight. Never describe the Git diff as proof of applied/pending database state.
4. **Reconcile required env-var NAMES (no values).** Diff `REQUIRED_SECRETS` + `FEATURE_GATED_SECRETS` in `src/api/shared/env.ts` against what the target environment is asserted to have. Names only — never inspect or print values.
5. **Confirm provider TEST credentials for the chosen acceptance scope.** Only the providers the acceptance run will exercise (e.g. Stripe test, Twilio test, Resend sandbox, R2 staging bucket) — test/sandbox tier, never production keys, for staging.
6. **Confirm Railway source + auto-deploy + pre-deploy-command state.** Source branch, auto-deploy DISABLED, and NO `release:`/pre-deploy migration command — re-verify live; never restore a pooled pre-deploy migration hook.
7. **Confirm which Vercel/mobile surfaces are actually hosted and at which SHA.** customer-web, merchant-web, admin-web (Vercel) and any customer-app build — record each surface's deployed SHA to expose version-skew before acceptance.
8. **Keep the worker Offline** unless its activation is separately owner-approved (worker start is its own gate).
9. **Acceptance in two separately-gated phases — do NOT conflate them.**
   - **(a) Initial read-only checks:** `/health` + a bounded **read-only** smoke of the target journey. Truly read-only — no writes of any kind.
   - **(b) Later synthetic end-to-end acceptance (separately approved):** may create or mutate **only explicitly-scoped test data**. Voucher publication, redemption, and seeding are **writes** — a synthetic E2E run is NOT read-only; it must be separately gated and scoped as a write operation and must never be described as read-only.
10. **Record rollback + protected-recovery-branch evidence (verifiable WITHOUT rebuilding).** Capture, without performing any build/deploy: (i) the protected recovery branch still exists at the exact SHA (`53bafac4`); (ii) the ruleset (`18485943`) remains active; (iii) the lockfile / source path remains available; (iv) the provider rollback/rebuild path remains documented and visible where applicable. Do NOT claim the baseline is "deployable" — asserting deployability would require an actual build/deploy; record the preserved-rollback evidence instead.

Migrations in step 3, when applied, run via the controlled operator process on the verified Neon **DIRECT** endpoint — separately owner-approved, never a pooled Railway pre-deploy hook.

---

## 4. Admin honesty — redemption visibility

Admin-side visibility of **customer redemption events** (an admin seeing that customer X redeemed voucher Y at branch Z, or platform-wide redemption activity) is an **approved pre-launch product requirement**, but it currently exists **only as work being added to the Admin prototype**. It is **not yet a live implemented Admin feature**: on current main there is no admin route, service, or `apps/admin-web` page that lists, counts, or surfaces individual `VoucherRedemption` events (the live admin app covers merchant onboarding + voucher-approval lifecycle + notifications + timeline only; merchant-side redemption analytics live on the Merchant Portal Insights surface, tenant-scoped). This gap is recorded here for launch-planning honesty. **No Admin code, API design, or implementation work is created in this security session** — that is separate Admin-workstream, plan-first work.

---

## 5. Corrections to `2026-06-25-staging-deploy-runbook.md` (stale, superseded)

That runbook is a pre-incident (2026-06-25) snapshot; it predates the 2026-07-03 P1001 failure + recovery and never mentions R1. The following claims in it are **STALE — do not rely on them**; the verified state is in §2 above. (A superseded banner has been added to that doc pointing here.)

| Stale claim (file:line) | Stale text | Corrected state |
|---|---|---|
| `:18`, `:42`, `:68` | Web "auto-deploys from `main`" | Auto-deploy last verified DISABLED; Web serves the protected recovery branch |
| `:18`, `:42`, `:85`, `:159` | Running / target `fe10fb16` | Serving `6d26b0b4` (recovery `53bafac4`); no historical SHA is the auto-next target |
| `:22`, `:66`, `:159` | Pre-deploy `migrate deploy` hook "already applied / ran" | Pre-deploy migration command ABSENT (removed by recovery, not restored); migrations run operator-controlled on the DIRECT endpoint |
| `:19` | Worker "Online (3 processors)" | Worker Offline (stopped) |
| `:21`, `:106`, `:171` | Staging Neon endpoint "direct (non-pooled)" (D-3) | Runtime `DATABASE_URL` is POOLED (verified at P1a); migrations use the separate DIRECT endpoint |

Not stale in that doc, retained: the "test-keys-only / sandboxed / seed-data-only / not a public launch" framing remains correct for staging.

---

## 6. Cross-document consistency

| Doc | State on the 6 stale-claim patterns | Action in this PR |
|---|---|---|
| `2026-06-25-staging-deploy-runbook.md` | Contains patterns 1,2,4 (+ worker-online + D-3-direct) | **Superseded banner added** + corrections table (§5) |
| `r1-key-rotation-activation-runbook.md` | Correct (DRAFT; auto-deploy disabled; hook absent; DIRECT-only; P1b/P9 BLOCKED; D-R10 OPEN) | None |
| `deploy-security-runbook.md` | Correct on migrations (no pooled; no `release:`); frames legal as the ONE HARD *legal* gate | **Cross-reference note added** clarifying legal is not the ONLY remaining launch gate |
| `neon-cu-burn-maintenance-rollout-runbook.md` | Correct; already self-flags the D-3 pooled/direct conflict | None |
| `2026-07-05-staging-select-only-inspection-role-{design,plan}.md` | Correct (Option 3 / P9 / D-R10 OPEN) | None |
| `2026-06-29-encryption-key-rotation-architecture-{design,plan}.md` | Correct (steps 1-4 executed/passed; 5+ not started) | None |

**Launch-gate honesty:** R1 not being a security launch-blocker does NOT make legal + DNS the only remaining gates. Separately governed and still open in their own workstreams: Merchant Portal completion, Admin Panel implementation (including the §4 redemption-visibility requirement), backend deploy, worker/background processing, provider integrations, staging acceptance, domain/DNS, legal-content sign-off, and full cross-platform testing.

---

## 7. Boundaries honoured by this document

Documentation only. No Railway/Neon/Redis/MCP/Playwright/database access; no Variables/secrets/logs/credentials inspected; no deployment, migration, restart, worker start, provider change, or key action; Option 3 / P9 / P1b / R1 not executed or advanced; no Merchant/Admin application code touched; PR #338 untouched; the protected recovery branch and ruleset preserved. Gate status unchanged: **P8 ESTABLISHED · P9 BLOCKED · P1b BLOCKED · R1 NOT STARTED · D-R10 OPEN.**
