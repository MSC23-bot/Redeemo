# Redeemo — R1 Key-Rotation Activation Runbook

> **STATUS: DRAFT / PREPARATION ONLY — do NOT execute.** Awaiting Codex re-review + SHA-bound owner approval. No step here has been run. R1 remains unmigrated, undeployed, and not staging-accepted.
>
> **Audience:** the owner (or an owner-supervised operator) who performs the staging R1 activation. Staging first; production is a later, separately-approved repeat.
>
> **Companion docs (anchors):** `docs/runbooks/deploy-security-runbook.md` (build/migration/two-process/Neon/rollback), `docs/runbooks/2026-06-25-staging-deploy-runbook.md` (current staging infra state + the 🛑 "do not recreate the Neon branch" warning), `docs/runbooks/railway-backend-hosting-plan.md` (Railway shape, D-3 direct endpoint), `docs/PROJECT-STATE.md` (canonical state — Karaara staging cleanup UNVERIFIED; owner-intended branch/draft-voucher/data to preserve), and the architecture docs `docs/superpowers/specs/2026-06-29-encryption-key-rotation-architecture-design.md` + `docs/superpowers/plans/2026-06-29-encryption-key-rotation-architecture.md`.
>
> **Source of truth for the code behaviour cited below:** `src/api/shared/keyring.ts`, `src/api/shared/keyringVerify.ts`, `src/worker.ts`, `src/index.ts`, `prisma/migrations/20260629000000_keyring_fingerprint/migration.sql`, `prisma.config.ts`, `package.json` (all on `main` @ the current tip — R1 code is identical to the R1 merge `b66b0f95`; the only commit since is the docs-only PR #341).

---

## Secrets / safe-handling convention (read first)

- **Never print or paste a real connection string, key, or token** into a terminal that is logged, a chat, a commit, or a screenshot.
- **`DATABASE_URL` (the staging Neon direct URL) is injected into the session environment by the secret store BEFORE any command is run.** It is never typed into a command line, never shown inline (no `DATABASE_URL=… <cmd>` form), and never displayed. Confirm the target with the **credential-safe preflight** (§3.0), which prints **only** the host + database identifier — never username, password, query parameters, or the full URL.
- Placeholders used in this doc:
  - `<STAGING_ENDPOINT_HOST>` / `<STAGING_DB_NAME>` — the staging Neon **direct** compute-endpoint hostname (it embeds the endpoint ID, e.g. `ep-xxxx-….<region>.aws.neon.tech`) and the database name, **as recorded in the fresh control-plane mapping (P1)** — the values the §3.0 preflight must exactly match. These are identifiers, not secrets; they are never substituted into a connection string in this doc.
  - `<R1_COMMIT>` / `<KNOWN_GOOD_WEB_TARGET>` — the merged R1-capable commit to deploy (`main` tip; src/ identical to `b66b0f95`) / the pre-recorded known-good Web rollback target (P8).
- The keyring fingerprint **contains no key bytes or HMAC material** (domain-separated `keyHash` digests + kid labels only — verified in `keyring.ts` `keyringFingerprint` / spec §3.9 / §3.11), so displaying a fingerprint value is safe. Key **bytes**, PINs, and connection strings are never displayed.

---

## 0. What R1 activation IS and is NOT

**R1 activation is exactly four things, in order:**
1. Apply **one additive migration** (`KeyringFingerprint` table) on the Neon **direct** endpoint (§2–§3).
2. **Deliberately deploy** the already-merged R1 code to the **Web** service while auto-deploy stays disabled (§4).
3. Obtain **Web + Worker fingerprint parity at `v2-reader-v1`** — Worker via `--verify-keyring-and-exit`, with **no BullMQ / no sweeps** (§5–§6).
4. Run **staging acceptance** within the data-safety boundary (§7).

**R1 activation does NOT (hard invariants — mirrors the R2 Gate B boot-order discipline):**
- It does **not** rotate or generate any key, flip `*_ACTIVE`, designate `*_PREVIOUS`, invalidate any challenge, remove any kid, or change `DECOMMISSIONED_KIDS`. (See §9.)
- It does **not** change **any** key / OTP env variable. R1 runs in **legacy-bridge mode** on the **existing** `ENCRYPTION_KEY` (`ENCRYPTION_KEYS` / `OTP_HMAC_KEYS` stay **unset** ⇒ pin active `legacy`, otp active `otp-legacy`, both bridged from the existing key). The fingerprint merely **describes** the existing bridged ring.
- It does **not** regenerate `ENCRYPTION_KEY` — regenerating it would make every seeded staging branch PIN undecryptable (`deploy-security-runbook` §3 / staging runbook §7).
- It does **not** delete, recreate, or reset any database / Neon branch, and it does **not** mutate or corrupt any owner-intended data (§7, §8). Staging is **not** disposable.
- It does **not** start the normal worker daemon or its sweeps (§5, §11). The worker stays **Offline**.
- It does **not** enable v2 writes. The R1 build is **structurally incapable of emitting v2** (no writer flag; spec §3.9 / RISK-2). Flag-off writes stay 3-part under the legacy key.
- It does **not** touch R2 / R3 / R4, PR #338, or any production environment.

**Why R1 at all:** it makes both services **reader-capable** for the versioned envelope and **publishes the parity fingerprint** that every later rotation step gates on. It is a ciphertext-format / key-selection **no-op** (spec R3-#2) plus the Guard-10 loud-fail hardening plus the `KeyringFingerprint` rows.

---

## 1. Preconditions (all must hold before any step)

| # | Precondition | How to confirm (owner / operator) | Stop-and-report if |
|---|---|---|---|
| P1 | **Staging target identity — SPLIT into `P1a` (runtime-recovery) + `P1b` (migration-readiness); see §13.** The Neon **control-plane identifiers have been observed and recorded** (project / branch / endpoint / database / migration-role — owner-held, **not committed here**). The **runtime binding + reachability** and the **migration binding + role/permissions** remain **separately gated**. | `P1a` (pooled runtime) is confirmed **before serving** the pre-R1 baseline (§13.1); `P1b` (direct, non-`-pooler` migration endpoint + role/grants) is confirmed **before any migration** (§13.2) — each via a separately-approved **minimum read-only preflight** (§13.3); no secret is printed. | **STOP** if the recorded identity cannot be re-verified from the control plane; `P1a`/`P1b` cannot be confirmed on their **required** endpoints (`P1a` **pooled**, `P1b` **direct**); or any **production identifier** appears. |
| P2 | **A DB-recovery posture is recorded — WITHOUT authorizing any data loss.** | Owner records the current Neon PITR retention + earliest restore point + any retained backups/branches (deploy-security §7). The additive migration needs **no** DB rollback for expected failures (§8). Recreating/resetting the Neon branch or deleting data is **NOT authorized** by this runbook (staging runbook §11 🛑; `PROJECT-STATE.md` records owner-intended branch + draft flagship `RMV-71C5B59E` + data to preserve, and Karaara's retained/deleted state as UNVERIFIED). | PITR/backup state cannot be established at all (so a genuine destructive surprise would have no owner-decision recovery basis — §8). |
| P3 | **`main` is at the R1-capable tip; CI green.** | `git rev-parse origin/main` = the recorded current tip; CI green on it. **All commits on `main` AFTER the R1 merge `b66b0f95` through the recorded tip are docs-only — re-verify `src/` equivalence to `b66b0f95`** (e.g. `git diff --stat b66b0f95 origin/main -- src/` shows NO `src/` change). | `src/` differs from `b66b0f95` in any way not attributable to docs-only changes. |
| P4 | **`ENCRYPTION_KEY` already set on staging; do NOT regenerate.** | Owner confirms it is present and unchanged (staging runbook §7 — 24 vars set, never regenerate). | The key is missing, or anyone proposes regenerating it. |
| P5 | **The `KeyringFingerprint` migration is present and is the ONLY pending migration.** | `prisma migrate status` (§3.1) shows `20260629000000_keyring_fingerprint` **pending** and **nothing else pending**. | **Any other migration is also pending** — `migrate deploy` applies the full pending set, so other-pending is OUT OF SCOPE here; STOP and report so the owner decides. |
| P6 | **Auto-deploy is (still) disabled on web + worker; worker is Offline.** | Owner confirms in Railway that GitHub auto-deploy remains disabled on both services and the worker service is stopped (set earlier this session). | Auto-deploy is enabled on either service, or the worker daemon is running. |
| P7 | **Controlled, audited access.** | The migration + verify run from a controlled operator host (or platform one-off) with the secret **injected into the environment** (never pasted/logged) — OD8. | The only available path would require pasting a real connection string into a logged context. |
| P8 | **Web rollback baseline = a PROTECTED RECOVERY BRANCH at the verified pre-R1 SHA `53bafac4…`; see §13.4–§13.5.** No serving deployment currently exists (Web Failed/non-serving; history all `FAILED`/`REMOVED`), so P8 is **established** by deploying the protected pre-R1 branch and recording the §13.5 evidence. | Deploy the protected branch (GitHub ruleset; SHA verified before every deploy/rebuild); record **BOTH** (i) a **currently-visible Railway Redeploy/Rollback action** AND (ii) the **durable protected-branch source-rebuild path** — plus `/health` liveness + a read-only `GET /api/v1/customer/categories` smoke (status/shape/count only) + deployment ID/SHA/timestamp (§13.5). | **STOP** if the baseline will not serve; the branch tip ≠ the verified SHA; **either** required evidence leg is missing; or the provider Redeploy/Rollback action later disappears — P8 then becomes **BLOCKED** and must be re-established. |
| P9 | **Acceptance fixture identity + provenance recorded (before §7) — currently BLOCKED.** `isTestData=true` is **necessary but NOT sufficient** proof that a fixture is disposable: the seed marks **every** seeded merchant/branch/voucher `isTestData=true` (blanket `updateMany`, `prisma/seed.ts:1829-1831`), and **Karaara is itself a seeded merchant** (`prisma/seed.ts:621-622`) that may carry `isTestData=true` **yet is owner-intended data that must NEVER be used** (`PROJECT-STATE.md`). A valid fixture requires **positive provenance**: a specifically identified, dedicated, **owner-approved** test merchant + branch **created or designated exclusively for R1 acceptance**. | Owner records the exact **fixture IDs** (merchant + branch), **known-PIN handling**, **ownership / provenance**, **before-state**, the **permitted A3 mutation**, and the **dependency-safe cleanup-or-retain policy**. **Repository evidence cannot prove such a fixture exists in staging**; Neon's branch / control-plane page (P1) establishes endpoint **identifiers** but **cannot prove merchant-row provenance**. **Never** select a fixture merely because `isTestData=true`; **never** use Karaara or other owner-intended data. | **BLOCKED** until EITHER (1) the owner **creates** a dedicated fixture via an approved application workflow, OR (2) a **separately-approved read-only database inspection** proves an existing fixture's identity + provenance. Until then, acceptance (§7) must not begin. |

---

## 2. Direct-endpoint migration safety

- **Direct endpoint is mandatory (operational rule):** this runbook's Prisma migration procedure **requires and supports only the verified Neon direct endpoint**; **pooled endpoints are prohibited by this runbook**. (`railway-backend-hosting-plan.md` D-3 + the migration header pin the direct endpoint for migrations.) On staging, `DATABASE_URL` is the direct URL (D-3), and `prisma.config.ts` uses `DATABASE_URL` for both app and migrations (no separate `directUrl`). Confirm the endpoint via the §3.0 preflight before running any migration command.
- **The migration is additive-only.** `prisma/migrations/20260629000000_keyring_fingerprint/migration.sql` is exactly:
  - `CREATE TABLE "KeyringFingerprint" (id, service, fingerprint, codeCapability, bootedAt DEFAULT now(), lastSeenAt, PK(id))`
  - `CREATE UNIQUE INDEX "KeyringFingerprint_service_key" ON "KeyringFingerprint"("service")`
  - **No `Branch` change, no column drops, no data backfill.** A code rollback leaves a harmless empty extra table (deploy-security §10 / spec §5).
- **`prisma migrate deploy` applies committed migrations only** — it never generates a new one (deploy-security §1.5).
- **Target confirmation is mandatory and uses the freshly-recorded P1 mapping** (never a historical branch ID): the §3.0 preflight host's **endpoint ID** + database must **exactly match** the recorded staging endpoint/database (P1), never production (deploy-security §7 — "a wrong URL is how accidents happen"). The migration **role** is confirmed from the private secret mapping (P1), never printed.

---

## 3. Apply + verify ONLY the `KeyringFingerprint` migration

> **Secret handling:** `DATABASE_URL` (the staging Neon **direct** URL) is **injected into the session environment by the secret store before any command is run** — never typed into a command line, shell history, chat, or this doc. Run the commands below **bare** (they read `DATABASE_URL` from the already-injected environment). Do **not** prefix them with `DATABASE_URL=…`.

**Step 3.0 — Credential-safe target preflight (confirm staging WITHOUT printing the secret).** Prints only host + database identifier — never username, password, query parameters, or the full URL:
```bash
node -e 'const u=new URL(process.env.DATABASE_URL); console.log("host:", u.hostname, "| db:", u.pathname.replace(/^\//,""))'
```
Expected: `host:` (which embeds the compute **endpoint ID**) **exactly matches** the staging endpoint hostname recorded in the P1 control-plane mapping, and `db:` **exactly matches** the recorded staging database. The migration **role** is confirmed from the private secret mapping (P1) — it is **never** printed by this preflight (the one-liner deliberately prints neither `u.username` nor `u.password`). **STOP** if: the host / endpoint ID or the database **differs** from the P1 record; the endpoint belongs to **another** branch; the host is pooled/`-pooler` (prohibited — §2); the role lacks migration permissions; or **any production identifier** appears.

**Step 3.1 — Pre-check the pending set (gates P5).**
```bash
npx prisma migrate status
```
Expected: `20260629000000_keyring_fingerprint` is listed as **not yet applied**, and it is the **only** pending migration; everything else "applied". **STOP** if any other migration is also pending (out of scope — P5).

**Step 3.2 — Apply.**
```bash
npx prisma migrate deploy
```
Expected: applies `20260629000000_keyring_fingerprint` and reports success.

**Step 3.3 — Verify the table exists and only this migration moved.**
```bash
npx prisma migrate status
```
Expected: "Database schema is up to date." Optionally confirm the relation exists with a **read-only** query:
```sql
-- read-only existence check (no rows yet; table is populated when a service boots)
SELECT to_regclass('"KeyringFingerprint"') AS keyring_table;
```
Expected: a non-null `keyring_table`. The table is **empty** until Web boots (§4) / the worker probe runs (§5) and publishes their rows.

---

## 4. Deliberate Web deployment (auto-deploy stays disabled)

- **Confirm auto-deploy is still disabled** on the Web service before triggering (P6). It must **remain** disabled throughout.
- **Trigger a single, deliberate deploy** of `<R1_COMMIT>` on the Railway **Web** service via the approved manual rollout (Railway dashboard → the service → deploy/redeploy the specific commit). Build = `npm run build` (`prisma generate && tsc -p tsconfig.build.json` → `dist/src/index.js`); start = `node dist/src/index.js` (deploy-security §1.5).
- **Order matters:** the `KeyringFingerprint` table must already exist (§3) so the Web boot's **best-effort** publish lands. The publish runs **after** `app.listen` and is fire-and-forget; a publish failure logs and is swallowed and does **not** crash boot (`src/index.ts` lines 17-31; `publishKeyringFingerprint` is best-effort, `keyring.ts`). If the table is missing the row simply won't appear and parity (§6) can't be confirmed.
- **Boot reads UNCHANGED env** (bridge mode — no key var was touched). `getKeyProvider()` parses `process.env` **once at boot** and caches it process-wide (`keyring.ts` lines 497-500); there is no hot-swap, so this deploy is the only way the new R1 code starts describing the ring.
- **Confirm:** the deploy reports success; the API boots with no missing-secret crash; `/health` returns `200` (deploy-security §9 / staging runbook).
- **If the deploy fails to build or boot:** roll back to the **pre-recorded known-good Web target `<KNOWN_GOOD_WEB_TARGET>` (P8)** — NOT an unspecified "previous image". If no known-good target exists (P8), STOP for an owner decision (§8).

---

## 5. Worker `--verify-keyring-and-exit` — no BullMQ, no sweeps

- **The normal worker stays OFFLINE.** Do **not** start `node dist/src/worker.js` (its normal `main()` registers the email + outbox-reconciler (60s) + claim-stale (hourly) + promote-pending-hours (60s) + moderation workers — these sweeps are the Neon compute-burn; `src/worker.ts` lines 59-96).
- **Obtain worker parity via the ephemeral verify-only run.** `--verify-keyring-and-exit` is parsed **before** any BullMQ is registered (`src/worker.ts` lines 39-57): it constructs Prisma, `$connect`s, publishes the **`worker`** `KeyringFingerprint` row, prints `published=…`, and **exits** — registering **no** Worker / queue / repeatable, with `$disconnect()` guaranteed in `finally` (`src/api/shared/keyringVerify.ts`). It exits **0** only on a successful publish, **1** on any failure (a failed publish must not read as green).
- **Run it with the WORKER service's env, against the verified Neon direct endpoint** (OD8 — controlled operator machine recommended). The worker env (incl. `ENCRYPTION_KEY` + the staging direct `DATABASE_URL`) is **injected into the session by the secret store first** (never typed inline). Build the R1 image (`npm ci && npm run build`), then:
```bash
# Worker service env injected (e.g. via `railway run --service worker -- …`); built R1 worker entrypoint:
node dist/src/worker.js --verify-keyring-and-exit
```
Expected stdout: `[worker] --verify-keyring-and-exit: fingerprint published=true; exiting without starting BullMQ.` and **exit code 0**.
- **Do NOT leave anything running, and do NOT restore the normal worker start command** (§11). This probe is the only worker action.
- If the platform path is a Railway one-off/exec rather than an operator machine: it must run the verify command (not the daemon), exit cleanly, and must **not** flip the service into a normally-running (sweeping) state.

---

## 6. R1 `v2-reader-v1` fingerprint parity

- After §4 (Web row) and §5 (Worker row), read the two rows with a **read-only** query (fingerprint is safe to display — no key bytes):
```sql
SELECT service, "codeCapability", "fingerprint", "bootedAt", "lastSeenAt"
FROM "KeyringFingerprint"
ORDER BY service;
```
- **PASS — all of:**
  - exactly two rows present: `service = 'web'` and `service = 'worker'`;
  - `codeCapability = 'v2-reader-v1'` on **both** (the R1 capability — `CODE_CAPABILITY` in `keyring.ts`);
  - the **`fingerprint` value is byte-identical** on both rows (bridge mode ⇒ both compute pin active `legacy`, otp active `otp-legacy`, same key set ⇒ same digest).
- The **Web** row should be **fresh**; the **Worker** row is a one-shot **snapshot** from the probe — staleness is expected and fine (the worker is offline by design; spec §3.9 Amendment R3-#4 asymmetric freshness).
- **STOP-and-report if:** a row is missing; `codeCapability ≠ 'v2-reader-v1'` on either; or the two `fingerprint` values **differ**. A fingerprint difference means the Web and Worker environments diverge (different `ENCRYPTION_KEY` or a stray explicit-ring var on one service) — reconcile the env so both services carry identical key config, then re-deploy Web / re-run the worker probe and re-check. **Never proceed to acceptance on a mismatch.**

---

## 7. Staging acceptance tests

Run on staging only. **Data-safety boundary (owner-locked — Blocking):**
- **Karaara and ALL owner-intended merchant / branch / voucher data are explicitly PROHIBITED as acceptance targets.** `PROJECT-STATE.md` records Karaara's retained/deleted staging state as **UNVERIFIED** and the draft flagship `RMV-71C5B59E` + branch + owner data **to preserve**. Note Karaara is a **seeded** merchant (`prisma/seed.ts:621-622`) and may carry `isTestData=true` — it is still owner-intended and must **never** be used.
- **No existing shared-staging ciphertext may be deliberately corrupted.**
- **`isTestData=true` is necessary but NOT sufficient** to treat a row as disposable: the seed marks **every** seeded merchant/branch/voucher `isTestData=true` (blanket `updateMany`, `prisma/seed.ts:1829-1831`). **Never** select a fixture merely because `isTestData=true`.
- Acceptance **cannot begin** until **P9** is satisfied — a fixture with **positive provenance** (a specifically identified, dedicated, owner-approved test merchant + branch created or designated exclusively for R1 acceptance), with its exact fixture IDs, known-PIN handling, ownership/provenance, before-state, permitted A3 mutation, and dependency-safe cleanup-or-retain policy recorded. **P9 is currently BLOCKED** (repository evidence cannot prove such a fixture exists in staging): it unblocks only when the owner **creates** a dedicated fixture via an approved application workflow, OR a **separately-approved read-only DB inspection** proves an existing fixture's identity + provenance.
- Prefer **merged automated tests** over live mutation; only A3 touches live data, and only against the provenance-proven P9 fixture.

| # | Acceptance check | How it runs (data-safety) | Expected | Source |
|---|---|---|---|---|
| A1 | **API boots clean** + `/health` `200`. | Read-only. | `200 {"status":"ok"}` | deploy-security §9; `src/index.ts` |
| A2 | **Both fingerprint rows present + matching at `v2-reader-v1`** (= §6 PASS). | Read-only. | parity holds | spec §3.9; plan R1 merge gate |
| A3 | **Legacy PIN still decrypts + validates.** | **Only** against the **provenance-proven** dedicated owner-approved fixture (P9) — `isTestData=true` alone is NOT sufficient — with its known PIN and **before/after** redemption counts recorded. Confirms an existing 3-part legacy value decrypts with the legacy key under the bridge and validates. Any redemption created is **recorded and cleaned up only through the separately-reviewed dependency-safe cleanup procedure (P9)**, OR retained + explicitly labelled test data. **NEVER run against Karaara or any owner-intended branch.** **Cannot run while P9 is BLOCKED.** | validation succeeds on the fixture | R1 is a key-selection no-op (plan R1 deliverable) |
| A4 | **Guard-10 loud-fail intact** (unreadable/unknown-kid → controlled `REDEMPTION_PIN_UNREADABLE`, not silent `INVALID_PIN`, no 500, no secret leak; silent `INVALID_PIN` only on a successful decrypt whose plaintext differs). | **Rely on the merged automated request-path tests** (`tests/api/redemption/guard10-keyring.test.ts` + the keyring / redaction suites, spec §11) — they already prove this. **Do NOT inject corrupt/unknown-kid ciphertext into shared staging.** An end-to-end staging A4, if ever deemed essential, requires a **separate owner-approved isolated fixture** with exact creation / restoration / cleanup steps — **not** part of ordinary R1 activation. | merged tests green; no live corruption | spec §3.10 / §11; `keyring.ts` typed errors |
| A5 | **No v2 writes possible** (R1 build is structurally incapable; flag-off writes are 3-part-under-legacy). | **Rely on the merged structural tests** (`tests/api/shared/keyring.test.ts` + `tests/api/shared/encryption.test.ts`, spec §11). **Do not force a live `setBranchPin`** to test this unless a dedicated test-owned fixture + restoration procedure has separately been approved (P9). | merged tests green | spec §3.9 / RISK-2 / R4-#1 |
| A6 | **Security headers / rate-limit unaffected** by the deploy. | Read-only smoke. | unchanged | deploy-security §9 |

If any acceptance check fails, treat it per §8 (do not proceed; the activation is not "accepted"), and clean up any A3 test redemption per the P9 policy.

---

## 8. Failure handling + rollback at every stage

| Stage | Failure mode | Action | Rollback | Key var / data touched? |
|---|---|---|---|---|
| §3 migration | `migrate status` shows other pending migrations | **STOP-and-report** (P5 — out of scope; owner decides) | n/a (nothing applied) | No |
| §3 migration | `migrate deploy` errors (permission / connectivity / pooled endpoint) | Confirm the §3.0 preflight host/db **exactly match the freshly-recorded P1 mapping** (and the role has migration permissions); re-run (`migrate deploy` is idempotent for already-applied entries) | None needed — no image deployed yet; table absent or not committed | No |
| §3 migration | Applied but `to_regclass` is null / table not visible | **STOP**; re-check you targeted the **freshly-recorded staging endpoint/database (P1 mapping / §3.0)**, not another branch | n/a | No |
| §4 Web deploy | Build / boot fails (e.g. the prior Failed-build state recurs) | Diagnose the build; the API is stateless | **Railway: redeploy the pre-recorded known-good Web target `<KNOWN_GOOD_WEB_TARGET>` (P8)** — NOT an unspecified "previous image" (the immediately-previous deploy may also be Failed). If no known-good target exists (P8), **STOP** for an owner decision | No |
| §4 Web deploy | Boots, but no `web` fingerprint row appears | Confirm the table exists (§3); the publish is best-effort and may have hit a transient error — **redeploy the same R1 commit `<R1_COMMIT>`** to re-publish; do not proceed to §6 until the `web` row is present. If the R1 image cannot boot at all, roll back to `<KNOWN_GOOD_WEB_TARGET>` (P8) | redeploy `<R1_COMMIT>` (re-publish) | No |
| §5 Worker probe | `--verify-keyring-and-exit` exits **1** (publish failed) | Check DB reachability + that the **worker** env (esp. `ENCRYPTION_KEY` + the verified direct `DATABASE_URL`) is injected; fix and **re-run the probe**. Do **not** infer parity from a non-zero exit | re-run probe (no daemon started) | No |
| §6 parity | Rows differ / wrong capability | Reconcile Web vs Worker env so both carry identical key config; **redeploy `<R1_COMMIT>` + re-run the worker probe**; re-check. Never proceed on mismatch | redeploy/re-probe | No (reconcile = align existing config, not rotate) |
| §7 acceptance | Any acceptance check fails | Do **not** mark accepted; clean up any A3 test redemption per the P9 policy; if it is a code/deploy fault, **roll back to `<KNOWN_GOOD_WEB_TARGET>` (P8)**; investigate before retrying | redeploy known-good Web target (P8) | No |
| any | **Unexpected destructive surprise** (NOT expected — the only DB change is additive) | **STOP IMMEDIATELY.** Do **not** recreate/reset the Neon branch and do **not** delete any data — staging is **not** disposable (staging runbook §11 🛑; `PROJECT-STATE.md`: owner-intended data + Karaara state UNVERIFIED). Recovery is a **separate owner-approved incident / data-recovery decision** based on **verified** PITR/backups + an **inventory of retained owner data** | Owner-approved incident recovery (verified PITR/backups + retained-data inventory); **never** branch recreation or data deletion | No |

- **General:** because the only DB change is **additive**, a code rollback never **depends** on a DB rollback (deploy-security §10) — every expected failure is handled by **redeploying the pre-recorded known-good Web target `<KNOWN_GOOD_WEB_TARGET>` (P8)**, never an unspecified "previous image". **There is NO authorized DB-level rollback that deletes or recreates staging** (staging is not disposable — staging runbook §11 🛑; `PROJECT-STATE.md` records owner-intended data to preserve). A genuine destructive surprise (none is expected, given the additive migration) ⇒ **STOP** and escalate to a separate owner-approved incident/data-recovery decision. **Auto-deploy stays disabled** through every rollback. **No rollback path touches any key variable, deletes data, or recreates the branch.**

---

## 9. No key rotation occurs during R1 activation (explicit confirmation)

R1 activation performs **zero** rotation actions. Specifically, it does **none** of:
- generate a fresh kid; flip `ENCRYPTION_KEY_ACTIVE` / `OTP_HMAC_KEY_ACTIVE`; designate `*_PREVIOUS`; invalidate any OTP / email-verification challenge; remove any kid from any ring; add anything to `DECOMMISSIONED_KIDS`; change `ENCRYPTION_KEY` or any ring map var.

R1 runs in **legacy-bridge mode on the existing key**. The `KeyringFingerprint` rows simply **describe** the existing bridged ring (`pin: legacy`, `otp: otp-legacy`) at capability `v2-reader-v1`. Neutralising the leaked staging key (the incident remediation) is a **separate, later, owner-gated** sequence — R2 (OTP separation) → Operation A (incident PIN rotation) → … — each with its own approval, redeploy, `--verify-keyring-and-exit` probe, and parity re-establishment (spec §3.12 / §12; plan R2 / Operation A). **R1 makes the system reader-capable and publishes the parity fingerprint; it changes no key and rotates nothing.**

---

## 10. Final state after a successful R1 activation

- **Web:** running the R1 code; serving normally; publishing its `KeyringFingerprint` row (`web`, `v2-reader-v1`).
- **Worker:** **Offline** (stopped). Its `KeyringFingerprint` row (`worker`, `v2-reader-v1`) is a one-shot **snapshot** from the `--verify-keyring-and-exit` probe. The normal worker start command is **not** restored. **Worker auto-deploy remains disabled.**
- **Database:** the additive `KeyringFingerprint` table exists with **two rows** (`web` + `worker`), both at `v2-reader-v1`, identical fingerprint. **No branch recreated, no data deleted, no owner-intended data mutated.**
- **Keys / config:** **no key variable changed; no rotation performed**; `ENCRYPTION_KEY` untouched; rings still in bridge mode.
- **Auto-deploy:** still **disabled** on both services.
- **Holds:** R2/R3/R4 not implemented; PR #338 untouched; production untouched.

---

## 11. ⚠️ Worker MUST NOT restart until the Neon compute-burn fix is done + approved

The normal worker daemon runs repeatable BullMQ sweeps — email delivery, outbox-reconciler (60s), claim-stale (hourly), promote-pending-hours (60s) (`src/worker.ts`; constants `RECONCILE_EVERY_MS=60000`, `PROMOTE_PENDING_HOURS_EVERY_MS=60000`, claim-stale hourly). **Source proves persistent 60-second / hourly worker database activity; these repeatable sweeps are the LEADING IDENTIFIED persistent-activity mechanism of the Neon compute usage — NOT a telemetry-proven sole cause** (Web serving and other activity also consume compute). **Permanent worker remediation gates the worker RESTART only — it does NOT gate the bounded Web/R1 recovery, which proceeds with the worker Offline (§13).** Until the **permanent persistent-activity reduction is separately completed AND owner-approved**, the worker MUST remain **Offline**:

- Do **not** start `node dist/src/worker.js` (the normal daemon).
- Do **not** re-enable worker auto-deploy.
- Do **not** restore a worker start command that launches the daemon.

R1 worker parity — and **every** later worker parity check (R2 Gate B, R3, R4, Operation A/B) — is obtained **only** via the ephemeral `--verify-keyring-and-exit` probe, which starts **no** Worker / queue / repeatable and exits immediately (spec Amendment #13; `keyringVerify.ts`). Worker restart is **never** a prerequisite for any flip/verify/removal.

---

## 12. Cross-check table (every step vs current source / runbook evidence)

| Step | Source / runbook evidence | Expected result | Stop condition | Rollback | Owner approval required |
|---|---|---|---|---|---|
| **P1–P9 preconditions** | staging runbook (branch mapping "inferred, not seen"; 24 vars, worker offline, 🛑 do-not-recreate); deploy-security §7; `PROJECT-STATE.md` (Karaara UNVERIFIED / data to preserve); OD8 | all preconditions hold | any precondition fails (esp. **P1 target mapping not freshly verified**, P5 other-pending, P6 auto-deploy/worker, P8 no known-good Web target, **P9 BLOCKED — no provenance-proven fixture**) | n/a | **Yes** — owner records the fresh Neon target mapping (P1) + P8/P9, confirms infra |
| **P8 Web rollback target** | staging runbook (Web Failed/non-serving); deploy-security §10 | a known-good Web artifact + commit/deployment ID is recorded; Railway can redeploy it (verified later in the **Railway** deployment list — a GitHub-metadata no-rows result does NOT prove no deployment exists) | no available known-good artifact (rollback would restore only the non-serving baseline) | n/a (verification step; no Railway action now) | **Yes** — owner verification in Railway before activation |
| **P9 acceptance fixture** | `PROJECT-STATE.md` (Karaara prohibited, owner-intended); `prisma/seed.ts:1829-1831` (blanket `isTestData`) + `:621-622` (Karaara seeded) | a **provenance-proven**, owner-approved, dedicated fixture (IDs / PIN handling / provenance / before-state / permitted mutation / cleanup policy) recorded; `isTestData=true` alone is **not** sufficient | **BLOCKED** — no provenance-proven fixture; repo evidence cannot prove one exists in staging; or only owner-intended data is available | n/a | **Yes** — owner creates a fixture via an approved app workflow OR commissions a separately-approved read-only DB inspection, before §7 |
| **P1a runtime-recovery (§13.1)** | this runbook §13; `prisma.config.ts`/`plugins/prisma.ts` (pooled runtime) | pooled runtime endpoint + db + reachability verified via read-only preflight (§13.3); enough to serve the pre-R1 baseline | pooled runtime unverifiable; compute won't stay reachable; production identifier | n/a (read-only) | **Yes** — separately-approved minimum read-only preflight |
| **P1b migration-readiness (§13.2)** | this runbook §13; runbook §2 (direct endpoint) | direct endpoint + migration db + role + grants verified via read-only catalog inspection (§13.3) **before** any migration | host/db/role mismatch; pooled; insufficient grants; production identifier | n/a (read-only) | **Yes** — separately-approved minimum read-only preflight |
| **P8 evidence + protected branch (§13.4-§13.5)** | this runbook §13; `git rev-parse 53bafac4` ✓ | protected branch (GitHub ruleset; SHA verified before EVERY deploy/rebuild) serves `/health` + read-only `GET /api/v1/customer/categories` smoke (status/shape/count only); deployment ID/SHA/timestamp; **BOTH** a currently-visible Railway redeploy/rollback action AND the durable protected-branch rebuild (D-R6) | branch tip ≠ verified SHA; baseline won't serve; no durable rebuild path; **the visible redeploy/rollback action is absent** | **P8 BLOCKED + re-established** if the provider redeploy/rollback action disappears before R1 | **Yes** — owner-approved provider branch-change + deploy (no unintended deploy) |
| **§2/§3.0 target identity** | staging runbook (branch mapping "inferred, not seen"); `railway-backend-hosting-plan.md` D-3; `prisma.config.ts` (`DATABASE_URL`) | §3.0 host endpoint-ID + db **exactly match the freshly-recorded P1 mapping**; pooled prohibited; role not printed | mapping not established; endpoint belongs to another branch; host/db differs; pooled; role lacks migration perms; any production identifier | n/a | **Yes** — owner records the fresh control-plane mapping + injects the matching direct URL |
| **§3.1 migrate status** | deploy-security §1.5; plan R1 merge gate | only `20260629000000_keyring_fingerprint` pending | any **other** migration pending | n/a | **Yes** |
| **§3.2 migrate deploy** | migration.sql (additive CREATE TABLE + unique index); spec §5 | table created; success | DDL error; pooled endpoint | none needed (additive); a destructive surprise ⇒ STOP + owner incident decision (§8) | **Yes** — owner runs/approves the apply |
| **§3.3 verify table** | migration.sql; `to_regclass` read-only | `KeyringFingerprint` exists, empty | table not visible | n/a | **Yes** |
| **§4 Web deploy** | `src/index.ts` (publish after listen, best-effort); `keyring.ts` (boot-once); deploy-security §1.5 | deploy success; clean boot; `/health` 200; `web` row published | build/boot fails; no `web` row | **Railway redeploy `<KNOWN_GOOD_WEB_TARGET>` (P8)**; if none, STOP | **Yes** — deliberate, owner-approved rollout |
| **§4 auto-deploy** | staging runbook (auto-deploy disabled this session); spec §3.9 boot-order | auto-deploy stays **disabled** | auto-deploy enabled | re-disable before proceeding | **Yes** |
| **§5 worker probe** | `src/worker.ts` (flag before BullMQ); `keyringVerify.ts` (exit 0/1, no BullMQ, `$disconnect` finally); OD8; Amendment #13 | exit 0; `published=true`; **no** sweeps started | exit 1; daemon started | re-run probe (no daemon) | **Yes** — owner runs the probe with worker env |
| **§6 parity** | `keyring.ts` `keyringFingerprint` / `CODE_CAPABILITY='v2-reader-v1'`; spec §3.9 | two rows; both `v2-reader-v1`; identical fingerprint | row missing; wrong capability; fingerprints differ | reconcile env → redeploy `<R1_COMMIT>` + re-probe | **Yes** |
| **§7 acceptance** | deploy-security §9; spec §3.10/§11 (Guard-10 + writer-format merged tests); `PROJECT-STATE.md` (data boundary) | A1–A6 pass within the P9 data boundary | any check fails; any attempt to target owner-intended data / corrupt shared ciphertext | redeploy `<KNOWN_GOOD_WEB_TARGET>` (P8); clean up A3 test data per P9 | **Yes** — owner signs off acceptance |
| **§8 rollback** | deploy-security §10 (additive ⇒ code rollback only); staging runbook §11 🛑; `PROJECT-STATE.md` | safe rollback without DB/key change or data loss | a destructive surprise | Railway redeploy `<KNOWN_GOOD_WEB_TARGET>` (P8); a destructive surprise ⇒ STOP + separate owner-approved incident recovery (verified PITR/backups + retained-data inventory); **never** recreate/delete | **Yes** |
| **§9 no rotation** | spec §3.12 / §12; plan R2 / Operation A | zero rotation actions | any rotation action proposed | n/a | **Yes** — rotation is a separate approval |
| **§10 final state** | this runbook | Web up; **Worker Offline**; 2 rows; no key change; no data loss; auto-deploy disabled | worker left running; a key var changed; any data mutated | stop the worker; revert config | **Yes** |
| **§11 worker hold** | staging runbook (Neon CU burn); Amendment #13 | worker stays Offline | worker daemon restarted | stop it immediately | **Yes** — restart needs the compute-burn fix + separate approval |

---

## 13. Pre-R1 staging recovery (provider-grounded amendment)

> **Status: DRAFT amendment — not executed.** Codifies the owner-approved recovery architecture after the P1001 diagnosis. Staging is currently archived/suspended + over the Free monthly compute allowance; the Web service is Failed/non-serving (its pre-deploy `prisma migrate deploy` failed with **Prisma P1001** — a database **connection** failure; cause not isolated; pooled-host is a confirmed migration mismatch but is **not** proven to be the P1001 cause). Mirrors spec §20 + plan "Pre-R1 staging recovery". **This §13 splits the single P1 gate into P1a/P1b — that split is itself this reviewed amendment and must merge before execution.**

### 13.1 P1a — runtime-recovery gate (serve the pre-R1 baseline; NO migration)
Verify, via a **separately-approved minimum read-only preflight** (§13.3): the **verified staging POOLED runtime endpoint**; the **runtime database identity**; **compute headroom + reachability**. **Sufficient ONLY for recovering the pre-R1 Web baseline** (serving). **No migration, no mutation.** STOP if the pooled runtime endpoint/database cannot be verified, the compute will not stay reachable within the reset Free headroom, or any production identifier appears.

### 13.2 P1b — migration-readiness gate (before applying the R1 migration)
Verify, via a **separately-approved minimum read-only preflight** (§13.3): the **verified DIRECT endpoint** (not `-pooler`); the **exact migration database**; the **exact injected migration role**; and the **required schema/migration permissions** via **read-only catalog / grant inspection** (e.g. `information_schema` / `pg_catalog` reads — never a test-DDL). **The first real migration is the *execution confirmation*, NOT the proof required to pass P1b** — P1b passes on read-only evidence (role owns / is granted the needed privileges), and the migration is then run under that gate. **No schema mutation before P1b passes.** STOP on any host/db/role mismatch, pooled endpoint, insufficient grants, or production identifier.

### 13.3 Minimum read-only preflight boundary
- **Permitted (separately approved):** a *minimum* read-only connection/preflight that verifies reachability, host/database identity, the injected role, and required permissions (read-only catalog/grant inspection).
- **Forbidden during the preflight:** **no migration, no schema write, no seed, no application mutation.** The rule is *no **mutating** database operation before the relevant gate* — read-only verification IS allowed.
- **Caveat:** a read-only connection **auto-resumes/unarchives** the Neon compute, so the preflight IS the controlled, **owner-approved** resume (not a stray query) and must stay within the reset Free headroom (no paid upgrade).

### 13.4 Protected recovery branch
- **Exact source SHA (verified):** `53bafac4716e8819b3a77ffb5a129bd6b25d59ef` (`git rev-parse 53bafac4` ✓; parent of the R1 merge `b66b0f95`; the R1 migration `20260629000000_keyring_fingerprint` is **absent** from this tree; `package-lock.json` present).
- **Mechanism:** Railway GitHub services deploy from a **configured branch, not a tag.** Create a **dedicated, protected GitHub branch fixed at that SHA** (e.g. `recovery/pre-r1-baseline`).
- **Protection + SHA verification:** the recovery branch is **NOT "literally immutable"** (GitHub provides no true immutability) — enforce a **GitHub repository ruleset** on it: **no force-push, no direct updates/commits**, restricted updaters. **Verify `git rev-parse <recovery-branch>` == `53bafac4716e8819b3a77ffb5a129bd6b25d59ef` BEFORE every deployment OR rebuild** (and re-verify after each); a tip that differs from the SHA is a STOP.
- **Railway source-branch change + restoration:** **pointing Railway's Web service at the recovery branch is a separately-approved provider operation**; after recovery, **restoring the Web service's source branch to `main` (R1 code) is a second separately-approved provider operation.** **Auto-deploy stays DISABLED** throughout.
- **Railway staged-change safety:** changing the Web service's **source branch** OR its **pre-deploy command** must be applied WITHOUT triggering an unintended deployment. With auto-deploy disabled, stage/apply the config change and **confirm no new deployment was queued** before the single deliberate deploy — a provider config change must not, by itself, deploy.
- **No R1 migration during baseline recovery:** the migration is absent from the source **and** the auto pre-deploy migrate is **temporarily disabled for the recovery deploy** (reversible; recovery-scoped; **NOT** the permanent migration policy — see §13.6).

### 13.5 P8 evidence + retention model (require ALL of)
1. successful **`/health` liveness**;
2. successful **bounded, read-only, database-backed smoke** via **`GET /api/v1/customer/categories`** — validate **response status / shape / count only; do NOT record owner-data content**;
3. **deployment ID, built SHA, timestamp** recorded;
4. a **currently-visible Railway Redeploy/Rollback action** for the successful baseline deployment;
5. the **protected-branch source-rebuild path** (§13.4).

**P8 INITIALLY requires BOTH (locked — D-R6):** (i) the **protected-branch source-rebuild path** (item 5) AND (ii) a **currently-visible Railway Redeploy/Rollback action** for the successful baseline (item 4). **The provider action is NOT merely a bonus.**

**Explicit statements:**
- **A source rebuild is NOT a byte-identical image rollback** — SHA + `package-lock.json` pin source + dependencies, but Railpack/Nixpacks, the Node/base image, and the build environment may change.
- **Railway rollback availability is retention-limited** — older deployments age out to `REMOVED`; the visible Redeploy/Rollback action can disappear.
- **If the provider Redeploy/Rollback action disappears before R1 activation, P8 becomes BLOCKED and must be RE-ESTABLISHED** (re-deploy the protected branch; re-record the §13.5 evidence — including a newly-visible provider Redeploy/Rollback action).

### 13.6 Long-term migration URL architecture (recommended; separate, owner-gated — see spec §20 / plan)
- **`MIGRATION_DATABASE_URL` — MANDATORY for controlled staging/production migration contexts; OPTIONAL only for local/test.** The migration/CLI path (`prisma.config.ts`) uses it; **runtime keeps the pooled `DATABASE_URL`** (`src/worker.ts` + `src/api/plugins/prisma.ts` unchanged).
- **Fail-closed validation (migration context):** in **controlled staging/production migration contexts**, `MIGRATION_DATABASE_URL` **MUST be present** AND **MUST validate as a direct, non-`-pooler` URL** — **missing or invalid FAILS CLOSED** (the migration does not run). **There is NO fallback to pooled `DATABASE_URL` in staging/production**; a `MIGRATION_DATABASE_URL ?? DATABASE_URL` fallback is permitted **only** in **local/test** (and tested there). In staging/production, **unsetting `MIGRATION_DATABASE_URL` disables/fails the migration path** (fail-closed) while **runtime pooled connectivity is unaffected**. **`prisma.config.ts` governs the Prisma CLI / migration configuration — this is a migration-context fail-closed, NOT an ordinary application boot failure** (the runtime app keeps booting on the pooled `DATABASE_URL`, unaffected).
- **Rollback (honest):** a **provider rollback** may remove/disable the migration path (unset the var / restore the prior pre-deploy config) **without affecting runtime pooled connectivity**; a **code rollback** of the `prisma.config.ts` change requires **deliberately restoring the prior migration policy**. **Never silently return staging/production migrations to pooled `DATABASE_URL`.**
- A **bounded** change requiring **all** of: spec/plan/runbook amendment; **code/config tests + integration tests**; **secret handling**; **provider rollout**; **rollback**; **separate owner approval**.
- **The temporary recovery disabling of auto-migrate (§13.4) is NOT the permanent policy** — permanently removing automatic migrations is a separate deployment-policy decision, not part of incident recovery.

### 13.7 Worker boundary
The repeatable sweeps are the **leading identified persistent-activity mechanism, not a telemetry-proven sole cause** of the Neon compute usage (§11). **The worker remains Offline.** **Permanent worker remediation gates the worker RESTART only** — not the bounded Web/R1 recovery. **No paid Neon upgrade; waiting for the Free allowance reset is the default.**

### 13.8 Exact release ordering
1. **A1** — compute headroom: **wait for the Free monthly allowance reset** (default; no payment).
2. **A2** — owner-approved **unarchive/resume** the staging compute (control-plane; or the §13.3 read-only preflight IS that controlled resume).
3. **P1a** (§13.1) — runtime-recovery read-only preflight (pooled). Gate for baseline serving.
4. **Short-term recovery** (auto-deploy disabled · worker Offline): create + protect the recovery branch (§13.4) → **point Railway at it** (approved provider op) → **temporarily disable auto-migrate** → deploy → record the **P8 evidence** (§13.5) ⇒ **P8 established**.
5. **Establish the P9 acceptance fixture** — **AFTER** the pre-R1 baseline is serving (step 4), **BEFORE** any R1 migration or R1 deployment: a provenance-proven, owner-approved dedicated fixture (runbook **P9** / §7). **R1 activation cannot begin while P9 is BLOCKED.**
6. **P1b** (§13.2) — migration-readiness read-only preflight (direct). Gate for the migration.
7. **Restore Railway source branch to `main`/R1** (approved provider op); **apply the R1 migration on the DIRECT endpoint** (operator-run, §3) — only **after** P8 + **P9** + P1b.
8. **R1 image deploy** (§4) → worker `--verify-keyring-and-exit` (§5) → fingerprint parity (§6) → acceptance (§7) — the P9 fixture (step 5) is already in place.
9. **(Parallel / later, separate approval):** adopt `MIGRATION_DATABASE_URL` (§13.6); the permanent worker persistent-activity reduction → **WORKER RESTART** (not required for R1).

### 13.9 Decision ledger — unresolved owner decisions
| # | Decision | Status |
|---|---|---|
| D-R1 | Compute-headroom policy | **DECIDED (owner) — wait for the Free monthly allowance reset; reconsider Launch (a paid upgrade) ONLY if the reset does not occur.** |
| D-R2 | Approve the **control-plane unarchive/resume** (A2) | OPEN |
| D-R3 | Approve the **separately-scoped minimum read-only preflight** (P1a now; P1b later) | OPEN |
| D-R4 | Create + protect the **recovery branch** at the verified SHA; approve **repointing Railway's connected branch** | OPEN |
| D-R5 | Approve **temporarily disabling auto-migrate** for the bounded recovery (reversible) | OPEN |
| D-R6 | P8 evidence model | **LOCKED — P8 INITIALLY requires BOTH the protected-branch source-rebuild path AND a currently-visible Railway Redeploy/Rollback action; the provider action is not a bonus. If it disappears before R1 activation, P8 is BLOCKED and must be re-established.** |
| D-R7 | Approve this **runbook amendment splitting P1 → P1a/P1b** before execution | OPEN (this PR) |
| D-R8 | Adopt **`MIGRATION_DATABASE_URL`** long-term (bounded, separately approved) | OPEN |
| D-R9 | Scope the **permanent worker persistent-activity reduction** (gates worker restart only) | OPEN |
| D-R10 | **P9 fixture** method (app workflow vs approved read-only DB inspection) | OPEN (see P9 / §7) |

### 13.10 Failure / rollback boundaries
- **No *mutating* DB op before the relevant gate** (P1a to serve; P1b to migrate); read-only preflight only, separately approved; **no migration/schema-write/seed/app-mutation** in it.
- **No paid upgrade**; wait for the Free reset.
- **Worker stays Offline** until the permanent reduction + approval; not required for R1.
- **R1 migration not applied before P8 exists, P9 is proven, AND P1b passes.**
- **Changing Railway's connected branch** + **disabling auto-migrate** are **separately-approved provider ops**; **auto-deploy stays disabled.**
- **Do not rely on a retention-limited image rollback** as the sole P8 basis — the durable basis is the protected-branch rebuild; **re-establish P8 if the provider action disappears.**
- **Do not permanently remove automatic migrations** in recovery without a separate policy decision (§13.6).
- **Do not** repoint runtime `DATABASE_URL`→direct.
- If **P1001 persists** after compute headroom + the direct-migration path, **STOP and re-diagnose** (no blind redeploy loop).
- Every step is **owner-approved + Codex-reviewed**.

### 13.11 Source / prototype cross-check
| Claim | Source evidence | Current behavior | Gap | Proposed slice | Decision owner |
|---|---|---|---|---|---|
| Railway deploys from a branch, not a tag | provider model | n/a | unsupported tag mechanism | **protected recovery branch** at the verified SHA | Owner + Codex |
| Recovery SHA | `git rev-parse 53bafac4` = `…716e8819…` ✓ | — | needs a durable pin | branch protection at the verified SHA | Owner |
| Image rollback ≠ source rebuild | provider retention model + build-determinism limits | Web Failed; older deploys `REMOVED` | byte-identical not guaranteed; rollback ephemeral | P8 requires **BOTH** the durable protected-branch rebuild **and** a currently-visible Railway redeploy/rollback action (D-R6); BLOCKED + re-established if the provider action disappears | Owner + Codex |
| Single P1 gate | this runbook (P1 row) | one gate conflates runtime + migration | runtime-serve vs migrate need different endpoints | **split P1 → P1a (pooled) + P1b (direct)** (this amendment) | Owner + Codex |
| "No DB op before P1" too strict | owner correction | over-gated | can't verify permissions without a read | **minimum read-only preflight allowed**; only mutations gated | Owner + Codex |
| Migrations + runtime share `DATABASE_URL` | `prisma.config.ts`; `worker.ts:48/60`; `plugins/prisma.ts:7` | migrate-on-pooled fails P1001 | migration needs direct | short-term: operator-run-on-direct + temp disable auto-migrate; long-term: **`MIGRATION_DATABASE_URL`** | Owner + Codex |
| Worker persistent activity | `worker.ts` + processors (`RECONCILE_EVERY_MS=60000`, hourly, `PROMOTE_PENDING_HOURS_EVERY_MS=60000`) | sweeps run when worker online | over-quota; offline | permanent reduction — gates worker restart only | Owner + Codex |
| Over-quota / archived | P1 dashboard | staging cold | recovery needs headroom | **wait for Free reset** (no payment) | Owner |
| P1001 cause | owner log (sanitised) | connection fails at pre-deploy | cause not isolated | fix reachability + direct path, re-attempt, re-diagnose if persists | Owner + Codex |

---

## Closing

This is a **preparation draft**. Nothing here has been executed. R1 remains unmigrated, undeployed, and not staging-accepted. Execution requires Codex re-review and explicit, SHA-bound owner approval, and is itself an owner-performed / owner-supervised operation under the standing holds (no Neon/Railway/Redis/log/variable access; no migration, deployment, restart, or provider action; no key rotation; no data deletion or branch recreation; no application-code change).
