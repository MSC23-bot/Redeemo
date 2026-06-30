# Redeemo — R1 Key-Rotation Activation Runbook

> **STATUS: DRAFT / PREPARATION ONLY — do NOT execute.** Awaiting Codex review + SHA-bound owner approval. No step here has been run. R1 remains unmigrated, undeployed, and not staging-accepted.
>
> **Audience:** the owner (or an owner-supervised operator) who performs the staging R1 activation. Staging first; production is a later, separately-approved repeat.
>
> **Companion docs (anchors):** `docs/runbooks/deploy-security-runbook.md` (build/migration/two-process/Neon/rollback), `docs/runbooks/2026-06-25-staging-deploy-runbook.md` (current staging infra state), `docs/runbooks/railway-backend-hosting-plan.md` (Railway shape, D-3 direct endpoint), and the architecture docs `docs/superpowers/specs/2026-06-29-encryption-key-rotation-architecture-design.md` + `docs/superpowers/plans/2026-06-29-encryption-key-rotation-architecture.md`.
>
> **Source of truth for the code behaviour cited below:** `src/api/shared/keyring.ts`, `src/api/shared/keyringVerify.ts`, `src/worker.ts`, `src/index.ts`, `prisma/migrations/20260629000000_keyring_fingerprint/migration.sql`, `prisma.config.ts`, `package.json` (all on `main` @ the current tip — R1 code is identical to the R1 merge `b66b0f95`; the only commit since is the docs-only PR #341).

---

## Secrets / placeholder convention (read first)

- **Never print or paste a real connection string, key, or token** into a terminal that is logged, a chat, a commit, or a screenshot. Every command below uses a **placeholder**:
  - `<NEON_DIRECT_URL_STAGING>` — the staging Neon **direct** (non-pooled) connection string. Injected from the environment / secret store, never typed inline.
  - `<STAGING_DB_HOST_REDACTED>` — the staging Neon host (e.g. `ep-xxxx.eu-west-2.aws.neon.tech`), used only to **confirm the target**, shown redacted.
  - `<R1_COMMIT>` — the merged R1-capable commit to deploy (`main` tip; src/ identical to `b66b0f95`).
- The keyring fingerprint **contains no key bytes or HMAC material** (domain-separated `keyHash` digests + kid labels only — verified in `keyring.ts` `keyringFingerprint` / spec §3.9 / §3.11), so displaying a fingerprint value is safe. Key **bytes**, PINs, and connection strings are never displayed.

---

## 0. What R1 activation IS and is NOT

**R1 activation is exactly four things, in order:**
1. Apply **one additive migration** (`KeyringFingerprint` table) on the Neon **direct** endpoint (§2–§3).
2. **Deliberately deploy** the already-merged R1 code to the **Web** service while auto-deploy stays disabled (§4).
3. Obtain **Web + Worker fingerprint parity at `v2-reader-v1`** — Worker via `--verify-keyring-and-exit`, with **no BullMQ / no sweeps** (§5–§6).
4. Run **staging acceptance** (§7).

**R1 activation does NOT (hard invariants — mirrors the R2 Gate B boot-order discipline):**
- It does **not** rotate or generate any key, flip `*_ACTIVE`, designate `*_PREVIOUS`, invalidate any challenge, remove any kid, or change `DECOMMISSIONED_KIDS`. (See §9.)
- It does **not** change **any** key / OTP env variable. R1 runs in **legacy-bridge mode** on the **existing** `ENCRYPTION_KEY` (`ENCRYPTION_KEYS` / `OTP_HMAC_KEYS` stay **unset** ⇒ pin active `legacy`, otp active `otp-legacy`, both bridged from the existing key). The fingerprint merely **describes** the existing bridged ring.
- It does **not** regenerate `ENCRYPTION_KEY` — regenerating it would make every seeded staging branch PIN undecryptable (`deploy-security-runbook` §3 / staging runbook §7).
- It does **not** start the normal worker daemon or its sweeps (§5, §11). The worker stays **Offline**.
- It does **not** enable v2 writes. The R1 build is **structurally incapable of emitting v2** (no writer flag; spec §3.9 / RISK-2). Flag-off writes stay 3-part under the legacy key.
- It does **not** touch R2 / R3 / R4, PR #338, or any production environment.

**Why R1 at all:** it makes both services **reader-capable** for the versioned envelope and **publishes the parity fingerprint** that every later rotation step gates on. It is a ciphertext-format / key-selection **no-op** (spec R3-#2) plus the Guard-10 loud-fail hardening plus the `KeyringFingerprint` rows.

---

## 1. Preconditions (all must hold before any step)

| # | Precondition | How to confirm (owner / operator) | Stop-and-report if |
|---|---|---|---|
| P1 | **Neon staging reachable on the DIRECT endpoint.** | Owner confirms the staging Neon branch (`br-ancient-water-…`, per staging runbook) is live; `DATABASE_URL` on staging is the **direct** (non-pooled) URL (D-3). | Endpoint unreachable, or `DATABASE_URL` is a pooled/`-pooler` URL (pgbouncer can't run DDL — §2). |
| P2 | **A last-resort recovery exists + is recorded.** | Owner records the current Neon PITR retention + earliest restore point (deploy-security §7). If PITR is **not** enabled on the staging branch, the §8 last-resort recovery is instead the **disposable staging branch** (recreate to reset data — staging runbook §11), since the only DB change here is additive. Record which applies. | **Neither** PITR is enabled **nor** the staging branch is safely recreatable — i.e. no last-resort recovery exists at all (the §8 destructive-surprise backstop would be unavailable). |
| P3 | **`main` is at the R1-capable tip; CI green.** | `git rev-parse origin/main` = the current tip; CI green on it. src/ is identical to the R1 merge `b66b0f95` (PR #341 since then is docs-only). | The tip's src/ differs from `b66b0f95` in a way not attributable to docs-only changes. |
| P4 | **`ENCRYPTION_KEY` already set on staging; do NOT regenerate.** | Owner confirms it is present and unchanged (staging runbook §7 — 24 vars set, never regenerate). | The key is missing, or anyone proposes regenerating it. |
| P5 | **The `KeyringFingerprint` migration is present and is the ONLY pending migration.** | `prisma migrate status` (§3 step 1) shows `20260629000000_keyring_fingerprint` **pending** and **nothing else pending**. | **Any other migration is also pending** — `migrate deploy` applies the full pending set, so other-pending is OUT OF SCOPE here; STOP and report so the owner decides. |
| P6 | **Auto-deploy is (still) disabled on web + worker; worker is Offline.** | Owner confirms in Railway that GitHub auto-deploy remains disabled on both services and the worker service is stopped (set earlier this session). | Auto-deploy is enabled on either service, or the worker daemon is running. |
| P7 | **Controlled, audited access.** | The migration + verify run from a controlled operator host (or platform one-off) with the secret injected, never pasted/logged (OD8). | The only available path would require pasting a real connection string into a logged context. |

---

## 2. Direct-endpoint migration safety

- **Why the direct endpoint:** Neon's pooled/pgbouncer endpoint cannot run DDL (`CREATE TABLE` / `CREATE INDEX`). `railway-backend-hosting-plan.md` D-3 + the migration header both require the **direct** endpoint. On staging, `DATABASE_URL` **is** the direct URL (D-3), and `prisma.config.ts` uses `DATABASE_URL` for both app and migrations (no separate `directUrl`).
- **The migration is additive-only.** `prisma/migrations/20260629000000_keyring_fingerprint/migration.sql` is exactly:
  - `CREATE TABLE "KeyringFingerprint" (id, service, fingerprint, codeCapability, bootedAt DEFAULT now(), lastSeenAt, PK(id))`
  - `CREATE UNIQUE INDEX "KeyringFingerprint_service_key" ON "KeyringFingerprint"("service")`
  - **No `Branch` change, no column drops, no data backfill.** A code rollback leaves a harmless empty extra table (deploy-security §10 / spec §5).
- **`prisma migrate deploy` applies committed migrations only** — it never generates a new one (deploy-security §1.5).
- **Target confirmation is mandatory:** confirm the redacted host is the **staging** host (`<STAGING_DB_HOST_REDACTED>`), never production (deploy-security §7 — "a wrong URL is how accidents happen").

---

## 3. Apply + verify ONLY the `KeyringFingerprint` migration

> Run from a controlled host with `DATABASE_URL=<NEON_DIRECT_URL_STAGING>` injected from the secret store. Do not echo the URL.

**Step 3.1 — Pre-check the pending set (gates P5).**
```bash
DATABASE_URL=<NEON_DIRECT_URL_STAGING> npx prisma migrate status
```
Expected: `20260629000000_keyring_fingerprint` is listed as **not yet applied**, and it is the **only** pending migration; everything else "applied". **STOP** if any other migration is also pending (out of scope — P5).

**Step 3.2 — Apply.**
```bash
DATABASE_URL=<NEON_DIRECT_URL_STAGING> npx prisma migrate deploy
```
Expected: applies `20260629000000_keyring_fingerprint` and reports success.

**Step 3.3 — Verify the table exists and only this migration moved.**
```bash
DATABASE_URL=<NEON_DIRECT_URL_STAGING> npx prisma migrate status
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

---

## 5. Worker `--verify-keyring-and-exit` — no BullMQ, no sweeps

- **The normal worker stays OFFLINE.** Do **not** start `node dist/src/worker.js` (its normal `main()` registers the email + outbox-reconciler (60s) + claim-stale (hourly) + promote-pending-hours (60s) + moderation workers — these sweeps are the Neon compute-burn; `src/worker.ts` lines 59-96).
- **Obtain worker parity via the ephemeral verify-only run.** `--verify-keyring-and-exit` is parsed **before** any BullMQ is registered (`src/worker.ts` lines 39-57): it constructs Prisma, `$connect`s, publishes the **`worker`** `KeyringFingerprint` row, prints `published=…`, and **exits** — registering **no** Worker / queue / repeatable, with `$disconnect()` guaranteed in `finally` (`src/api/shared/keyringVerify.ts`). It exits **0** only on a successful publish, **1** on any failure (a failed publish must not read as green).
- **Run it with the WORKER service's env, against the Neon direct endpoint** (OD8 — controlled operator machine recommended). Build the R1 image first (`npm ci && npm run build`), then:
```bash
# Controlled operator host, worker service env injected (e.g. `railway run --service worker -- …`),
# DATABASE_URL = the staging Neon DIRECT URL. Built R1 worker entrypoint:
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

Run on staging only, against a staging **test** branch (expect benign audit/throttle noise — deploy-security §2 / §9). All must pass:

| # | Acceptance check | Expected | Source |
|---|---|---|---|
| A1 | **API boots clean** (no missing-secret crash) and `/health` responds `200`. | `200 {"status":"ok"}` | deploy-security §9; `src/index.ts` |
| A2 | **Both fingerprint rows present + matching at `v2-reader-v1`** (= §6 PASS). | parity holds | spec §3.9; plan R1 merge gate |
| A3 | **Legacy PIN still decrypts + validates.** A redemption on a seeded staging branch with its known seeded PIN succeeds (the existing 3-part legacy value decrypts with the legacy key under the bridge). | validation succeeds | R1 is a key-selection no-op (plan R1 deliverable); Guard-10 path |
| A4 | **Guard-10 loud-fail intact.** A redemption attempt against a branch with an unreadable/unknown-kid PIN returns a controlled `REDEMPTION_PIN_UNREADABLE` (loud), **not** a silent `INVALID_PIN` and **not** a raw 500; a genuine wrong PIN against a readable branch returns the silent `INVALID_PIN` (counter). | controlled error, no 500, no secret in logs | spec §3.10 / §11; `keyring.ts` typed errors |
| A5 | **No v2 writes possible.** The R1 build cannot emit v2 (structural — no writer flag). If safe on staging, a fresh `setBranchPin` writes a **3-part** value decryptable with the **legacy** key (never under a non-legacy ACTIVE); otherwise rely on the R1 test-suite proof (do not force a write just to test). | only 3-part-under-legacy writes | spec §3.9 / RISK-2 / R4-#1 |
| A6 | **Security headers / rate-limit unaffected** by the deploy (per-deploy smoke). | unchanged | deploy-security §9 |

If any acceptance check fails, treat it per §8 (do not proceed; the activation is not "accepted").

---

## 8. Failure handling + rollback at every stage

| Stage | Failure mode | Action | Rollback | Key var touched? |
|---|---|---|---|---|
| §3 migration | `migrate status` shows other pending migrations | **STOP-and-report** (P5 — out of scope; owner decides) | n/a (nothing applied) | No |
| §3 migration | `migrate deploy` errors (permission / connectivity / pooled endpoint) | Confirm direct endpoint + correct staging DB; re-run (`migrate deploy` is idempotent for already-applied entries) | None needed — no image deployed yet; table absent or not committed | No |
| §3 migration | Applied but `to_regclass` is null / table not visible | **STOP**; re-check you targeted the **direct staging** DB, not a different branch | n/a | No |
| §4 Web deploy | Build / boot fails (e.g. the prior Failed-build state recurs) | Diagnose the build; the API is stateless | **Railway: redeploy the previous image** (sessions/limits live in Redis; the extra empty table is harmless) | No |
| §4 Web deploy | Boots, but no `web` fingerprint row appears | Confirm the table exists (§3); the publish is best-effort and may have hit a transient error — **redeploy Web** to re-publish; do not proceed to §6 until the `web` row is present | redeploy Web (same image) | No |
| §5 Worker probe | `--verify-keyring-and-exit` exits **1** (publish failed) | Check DB reachability + that the **worker** env (esp. `ENCRYPTION_KEY` + direct `DATABASE_URL`) is injected; fix and **re-run the probe**. Do **not** infer parity from a non-zero exit | re-run probe (no daemon started) | No |
| §6 parity | Rows differ / wrong capability | Reconcile Web vs Worker env so both carry identical key config; **redeploy Web + re-run the worker probe**; re-check. Never proceed on mismatch | redeploy/re-probe | No (reconcile = align existing config, not rotate) |
| §7 acceptance | Any acceptance check fails | Do **not** mark accepted; if it is a code/deploy fault, **redeploy the previous Web image**; investigate before retrying | Railway redeploy previous image | No |
| any | Unexpected destructive surprise (not expected — the only DB change is additive) | **STOP**; restore via Neon PITR to the point noted in P2 **if enabled**, else recreate the **disposable staging branch** (staging runbook §11 — staging data is disposable) | Neon PITR (if enabled) **or** recreate the staging branch | No |

- **General:** because the only DB change is **additive**, a code rollback never **depends** on a DB rollback (deploy-security §10) — every expected failure is handled by redeploying the previous Web image. A DB-level recovery (Neon PITR if enabled, P2; else recreating the disposable staging branch, staging runbook §11) is reserved purely as a last-resort backstop for a genuine destructive surprise (none is expected here, given the additive migration). **Auto-deploy stays disabled** through every rollback. **No rollback path requires touching any key variable.**

---

## 9. No key rotation occurs during R1 activation (explicit confirmation)

R1 activation performs **zero** rotation actions. Specifically, it does **none** of:
- generate a fresh kid; flip `ENCRYPTION_KEY_ACTIVE` / `OTP_HMAC_KEY_ACTIVE`; designate `*_PREVIOUS`; invalidate any OTP / email-verification challenge; remove any kid from any ring; add anything to `DECOMMISSIONED_KIDS`; change `ENCRYPTION_KEY` or any ring map var.

R1 runs in **legacy-bridge mode on the existing key**. The `KeyringFingerprint` rows simply **describe** the existing bridged ring (`pin: legacy`, `otp: otp-legacy`) at capability `v2-reader-v1`. Neutralising the leaked staging key (the incident remediation) is a **separate, later, owner-gated** sequence — R2 (OTP separation) → Operation A (incident PIN rotation) → … — each with its own approval, redeploy, `--verify-keyring-and-exit` probe, and parity re-establishment (spec §3.12 / §12; plan R2 / Operation A). **R1 makes the system reader-capable and publishes the parity fingerprint; it changes no key and rotates nothing.**

---

## 10. Final state after a successful R1 activation

- **Web:** running the R1 code; serving normally; publishing its `KeyringFingerprint` row (`web`, `v2-reader-v1`).
- **Worker:** **Offline** (stopped). Its `KeyringFingerprint` row (`worker`, `v2-reader-v1`) is a one-shot **snapshot** from the `--verify-keyring-and-exit` probe. The normal worker start command is **not** restored. **Worker auto-deploy remains disabled.**
- **Database:** the additive `KeyringFingerprint` table exists with **two rows** (`web` + `worker`), both at `v2-reader-v1`, identical fingerprint.
- **Keys / config:** **no key variable changed; no rotation performed**; `ENCRYPTION_KEY` untouched; rings still in bridge mode.
- **Auto-deploy:** still **disabled** on both services.
- **Holds:** R2/R3/R4 not implemented; PR #338 untouched; production untouched.

---

## 11. ⚠️ Worker MUST NOT restart until the Neon compute-burn fix is done + approved

The normal worker daemon runs four repeatable BullMQ sweeps — email delivery, outbox-reconciler (60s), claim-stale (hourly), promote-pending-hours (60s) (`src/worker.ts`). **These sweeps are the Neon compute-burn.** Until the **permanent Neon compute-burn fix is separately completed AND owner-approved**, the worker MUST remain **Offline**:

- Do **not** start `node dist/src/worker.js` (the normal daemon).
- Do **not** re-enable worker auto-deploy.
- Do **not** restore a worker start command that launches the daemon.

R1 worker parity — and **every** later worker parity check (R2 Gate B, R3, R4, Operation A/B) — is obtained **only** via the ephemeral `--verify-keyring-and-exit` probe, which starts **no** Worker / queue / repeatable and exits immediately (spec Amendment #13; `keyringVerify.ts`). Worker restart is **never** a prerequisite for any flip/verify/removal.

---

## 12. Cross-check table (every step vs current source / runbook evidence)

| Step | Source / runbook evidence | Expected result | Stop condition | Rollback | Owner approval required |
|---|---|---|---|---|---|
| **P1–P7 preconditions** | staging runbook (Neon direct branch, 24 vars, worker offline); deploy-security §7; OD8 | all preconditions hold | any precondition fails (esp. P5 other-pending, P6 auto-deploy on / worker running) | n/a | **Yes** — owner confirms infra state |
| **§2 direct-endpoint** | `railway-backend-hosting-plan.md` D-3; migration.sql header; `prisma.config.ts` (`DATABASE_URL`) | migrate target is the **direct staging** endpoint | `DATABASE_URL` pooled/`-pooler`; wrong (non-staging) host | n/a | **Yes** — owner provides/verifies the direct URL injection |
| **§3.1 migrate status** | deploy-security §1.5; plan R1 merge gate | only `20260629000000_keyring_fingerprint` pending | any **other** migration pending | n/a | **Yes** |
| **§3.2 migrate deploy** | migration.sql (additive CREATE TABLE + unique index); spec §5 | table created; success | DDL error; pooled endpoint | none needed (additive); PITR only on a destructive surprise | **Yes** — owner runs/approves the apply |
| **§3.3 verify table** | migration.sql; `to_regclass` read-only | `KeyringFingerprint` exists, empty | table not visible | n/a | **Yes** |
| **§4 Web deploy** | `src/index.ts` (publish after listen, best-effort); `keyring.ts` (boot-once); deploy-security §1.5 | deploy success; clean boot; `/health` 200; `web` row published | build/boot fails; no `web` row | **Railway redeploy previous image** | **Yes** — deliberate, owner-approved rollout |
| **§4 auto-deploy** | staging runbook (auto-deploy disabled this session); spec §3.9 boot-order | auto-deploy stays **disabled** | auto-deploy enabled | re-disable before proceeding | **Yes** |
| **§5 worker probe** | `src/worker.ts` (flag before BullMQ); `keyringVerify.ts` (exit 0/1, no BullMQ, `$disconnect` finally); OD8; Amendment #13 | exit 0; `published=true`; **no** sweeps started | exit 1; daemon started | re-run probe (no daemon) | **Yes** — owner runs the probe with worker env |
| **§6 parity** | `keyring.ts` `keyringFingerprint` / `CODE_CAPABILITY='v2-reader-v1'`; spec §3.9 | two rows; both `v2-reader-v1`; identical fingerprint | row missing; wrong capability; fingerprints differ | reconcile env → redeploy Web + re-probe | **Yes** |
| **§7 acceptance** | deploy-security §9; spec §3.10/§11 (Guard-10); R1 deliverable | A1–A6 pass | any check fails | redeploy previous Web image | **Yes** — owner signs off acceptance |
| **§8 rollback** | deploy-security §10 (additive ⇒ code rollback only); §7 (PITR); staging runbook §11 (disposable branch) | safe rollback without DB/key change | — | Railway redeploy / Neon PITR (if enabled) or recreate the disposable staging branch | **Yes** |
| **§9 no rotation** | spec §3.12 / §12; plan R2 / Operation A | zero rotation actions | any rotation action proposed | n/a | **Yes** — rotation is a separate approval |
| **§10 final state** | this runbook | Web up; **Worker Offline**; 2 rows; no key change; auto-deploy disabled | worker left running; a key var changed | stop the worker; revert config | **Yes** |
| **§11 worker hold** | staging runbook (Neon CU burn); Amendment #13 | worker stays Offline | worker daemon restarted | stop it immediately | **Yes** — restart needs the compute-burn fix + separate approval |

---

## Closing

This is a **preparation draft**. Nothing here has been executed. R1 remains unmigrated, undeployed, and not staging-accepted. Execution requires Codex review and explicit, SHA-bound owner approval, and is itself an owner-performed / owner-supervised operation under the standing holds (no Neon/Railway/Redis/variable/deploy/restart/rotation action without that approval).
