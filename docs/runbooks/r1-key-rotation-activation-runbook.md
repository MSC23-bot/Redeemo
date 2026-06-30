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
| P1 | **Staging target identity freshly verified from the Neon control plane (identifier-only).** The historical branch identifier `br-ancient-water-…` from earlier records is **NOT trusted** — the staging runbook itself records that mapping as "inferred, not seen", and the Railway/endpoint→branch/database/role mapping is UNVERIFIED, so it must be re-established from the live dashboard before any migration. | **As a future owner-performed control-plane step (no Neon access now):** from the Neon dashboard, record the **identifiers only** — (a) project name + project ID; (b) intended staging branch name + branch ID; (c) primary compute **endpoint ID / hostname**; (d) database name; (e) migration **role** name; (f) confirmation the branch is **live / reachable**. **Do NOT open, print, paste, screenshot, or record any connection string, password, token, or secret.** The securely-injected `DATABASE_URL` (P7) MUST come from **exactly** that recorded branch / endpoint / database / role; the §3.0 preflight then confirms host + database match the record (role confirmed from the private secret mapping, **never** printed). | **STOP** if: the mapping cannot be established; the §3.0 host's endpoint ID belongs to **another** branch; host or database **differs** from the record; the endpoint is **pooled**; the migration **role lacks** the required migration permissions; or **any production identifier** appears. |
| P2 | **A DB-recovery posture is recorded — WITHOUT authorizing any data loss.** | Owner records the current Neon PITR retention + earliest restore point + any retained backups/branches (deploy-security §7). The additive migration needs **no** DB rollback for expected failures (§8). Recreating/resetting the Neon branch or deleting data is **NOT authorized** by this runbook (staging runbook §11 🛑; `PROJECT-STATE.md` records owner-intended branch + draft flagship `RMV-71C5B59E` + data to preserve, and Karaara's retained/deleted state as UNVERIFIED). | PITR/backup state cannot be established at all (so a genuine destructive surprise would have no owner-decision recovery basis — §8). |
| P3 | **`main` is at the R1-capable tip; CI green.** | `git rev-parse origin/main` = the current tip; CI green on it. src/ is identical to the R1 merge `b66b0f95` (PR #341 since then is docs-only). | The tip's src/ differs from `b66b0f95` in a way not attributable to docs-only changes. |
| P4 | **`ENCRYPTION_KEY` already set on staging; do NOT regenerate.** | Owner confirms it is present and unchanged (staging runbook §7 — 24 vars set, never regenerate). | The key is missing, or anyone proposes regenerating it. |
| P5 | **The `KeyringFingerprint` migration is present and is the ONLY pending migration.** | `prisma migrate status` (§3.1) shows `20260629000000_keyring_fingerprint` **pending** and **nothing else pending**. | **Any other migration is also pending** — `migrate deploy` applies the full pending set, so other-pending is OUT OF SCOPE here; STOP and report so the owner decides. |
| P6 | **Auto-deploy is (still) disabled on web + worker; worker is Offline.** | Owner confirms in Railway that GitHub auto-deploy remains disabled on both services and the worker service is stopped (set earlier this session). | Auto-deploy is enabled on either service, or the worker daemon is running. |
| P7 | **Controlled, audited access.** | The migration + verify run from a controlled operator host (or platform one-off) with the secret **injected into the environment** (never pasted/logged) — OD8. | The only available path would require pasting a real connection string into a logged context. |
| P8 | **A known-good Web rollback target is identified + recorded (owner verification, before activation).** Web is currently **Failed / non-serving**, so "redeploy the previous image" is NOT a safe assumption — the immediately-previous deployment may also be Failed/unavailable. | As a **separate owner verification step** (this runbook performs **no** Railway action now): (a) record the current Failed/non-serving Web baseline (deployment ID); (b) identify an **available last-known-good** Web deployment artifact + its exact commit / deployment ID (`<KNOWN_GOOD_WEB_TARGET>`); (c) confirm Railway can deliberately redeploy that artifact. Every §8/§12 Web rollback references **this recorded target**, not an unspecified "previous image". | **No** available known-good Web artifact can be identified — a rollback would restore only the current non-serving baseline. STOP for an owner decision **before** activation. |
| P9 | **Acceptance test identity + cleanup policy recorded (before §7).** | Owner records: the exact **dedicated test-owned** merchant + branch for §7 (`isTestData=true`, known PIN) — explicitly **NOT** Karaara or any owner-intended merchant/branch/voucher (`PROJECT-STATE.md`: Karaara state UNVERIFIED + owner data to preserve); and the **dependency-safe cleanup-or-retain policy** for any redemption A3 creates. | No dedicated `isTestData=true` test-owned fixture + cleanup policy is recorded, or the only candidate is owner-intended data. |

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
- **Karaara and ALL owner-intended merchant / branch / voucher data are explicitly PROHIBITED as acceptance targets.** `PROJECT-STATE.md` records Karaara's retained/deleted staging state as **UNVERIFIED** and the draft flagship `RMV-71C5B59E` + branch + owner data **to preserve**.
- **No existing shared-staging ciphertext may be deliberately corrupted.**
- Acceptance **cannot begin** until **P9** (the dedicated `isTestData=true` test-owned fixture + cleanup policy) is recorded.
- Prefer **merged automated tests** over live mutation; only A3 touches live data, and only against the P9 fixture.

| # | Acceptance check | How it runs (data-safety) | Expected | Source |
|---|---|---|---|---|
| A1 | **API boots clean** + `/health` `200`. | Read-only. | `200 {"status":"ok"}` | deploy-security §9; `src/index.ts` |
| A2 | **Both fingerprint rows present + matching at `v2-reader-v1`** (= §6 PASS). | Read-only. | parity holds | spec §3.9; plan R1 merge gate |
| A3 | **Legacy PIN still decrypts + validates.** | **Only** against the separately-approved **dedicated test-owned** merchant + branch (P9): `isTestData=true`, known PIN, with **before/after** redemption counts recorded. Confirms an existing 3-part legacy value decrypts with the legacy key under the bridge and validates. Any redemption created is **recorded and cleaned up only through the separately-reviewed dependency-safe cleanup procedure (P9)**, OR retained + explicitly labelled test data. **NEVER run against Karaara or any owner-intended branch.** | validation succeeds on the test fixture | R1 is a key-selection no-op (plan R1 deliverable) |
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

The normal worker daemon runs four repeatable BullMQ sweeps — email delivery, outbox-reconciler (60s), claim-stale (hourly), promote-pending-hours (60s) (`src/worker.ts`). **These sweeps are the Neon compute-burn.** Until the **permanent Neon compute-burn fix is separately completed AND owner-approved**, the worker MUST remain **Offline**:

- Do **not** start `node dist/src/worker.js` (the normal daemon).
- Do **not** re-enable worker auto-deploy.
- Do **not** restore a worker start command that launches the daemon.

R1 worker parity — and **every** later worker parity check (R2 Gate B, R3, R4, Operation A/B) — is obtained **only** via the ephemeral `--verify-keyring-and-exit` probe, which starts **no** Worker / queue / repeatable and exits immediately (spec Amendment #13; `keyringVerify.ts`). Worker restart is **never** a prerequisite for any flip/verify/removal.

---

## 12. Cross-check table (every step vs current source / runbook evidence)

| Step | Source / runbook evidence | Expected result | Stop condition | Rollback | Owner approval required |
|---|---|---|---|---|---|
| **P1–P9 preconditions** | staging runbook (branch mapping "inferred, not seen"; 24 vars, worker offline, 🛑 do-not-recreate); deploy-security §7; `PROJECT-STATE.md` (Karaara UNVERIFIED / data to preserve); OD8 | all preconditions hold | any precondition fails (esp. **P1 target mapping not freshly verified**, P5 other-pending, P6 auto-deploy/worker, P8 no known-good Web target, P9 no test fixture) | n/a | **Yes** — owner records the fresh Neon target mapping (P1) + P8/P9, confirms infra |
| **P8 Web rollback target** | staging runbook (Web Failed/non-serving); deploy-security §10 | a known-good Web artifact + commit/deployment ID is recorded; Railway can redeploy it | no available known-good artifact (rollback would restore only the non-serving baseline) | n/a (verification step; no Railway action now) | **Yes** — owner verification before activation |
| **P9 acceptance fixture** | `PROJECT-STATE.md` (Karaara prohibited); `prisma/schema.prisma` (`isTestData`) | dedicated `isTestData=true` test-owned merchant/branch + cleanup policy recorded | no test fixture, or only owner-intended data available | n/a | **Yes** — owner records before §7 |
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

## Closing

This is a **preparation draft**. Nothing here has been executed. R1 remains unmigrated, undeployed, and not staging-accepted. Execution requires Codex re-review and explicit, SHA-bound owner approval, and is itself an owner-performed / owner-supervised operation under the standing holds (no Neon/Railway/Redis/log/variable access; no migration, deployment, restart, or provider action; no key rotation; no data deletion or branch recreation; no application-code change).
