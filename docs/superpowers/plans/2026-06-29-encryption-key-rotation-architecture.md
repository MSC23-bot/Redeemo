# Encryption Key Rotation + Versioned Ciphertext — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.
>
> **Status:** DRAFT — proposal for Codex + owner re-review (round 2). **Not approved. Do NOT begin implementation.** No key rotation, no Neon connection, no Railway restart authorised by this document.
> **Tier:** 3. **Companion spec:** `docs/superpowers/specs/2026-06-29-encryption-key-rotation-architecture-design.md` (read first — all decisions OD1–OD8, risk register RISK-1–RISK-9, Codex corrections, and the round-2/3/4 amendment cross-checks §17/§18/§19 live there).

**Goal:** Replace the single static, dual-purpose, non-rotatable `ENCRYPTION_KEY` with a standing, production-safe key-rotation capability: versioned self-describing ciphertext, a provider-neutral keyring, separated PIN/OTP keys, a resumable concurrency-safe migration, durable telemetry-gated retirement, and a documented rollback that never restores a whole DB.

**Architecture:** Inline `v2:<kid>:<iv>:<tag>:<ct>` envelope (no Branch schema change; legacy 3-part values keep decrypting). `KeyProvider`/`EnvKeyProvider` env keyring with purpose-namespaced kids (`pin-*`/`otp-*`), a `DECOMMISSIONED_KIDS` denylist, and an **explicit `ENCRYPTION_V2_WRITES_ENABLED` writer-format gate (default off)**. Resumable cursor-batch CAS migration as a **separate ephemeral process** with a durable `KeyMigrationCheckpoint`. Reader-before-writer rolling-deploy ordering across the two separate Railway services, verified by a **non-secret keyring fingerprint published to a DB table** (no admin HTTP, no reusable migrator credential).

**Tech stack:** Node 24, TypeScript, Fastify, Prisma 7 + `@prisma/adapter-pg` + `pg`, Neon Postgres (Free), Redis, BullMQ, vitest (two-project: unit + `*.integration.test.ts` loopback-only).

---

## Programme overview — release order (Codex round-2 Amendment #1 reorder)

**Guard-10 hardening, durable decrypt telemetry, and the rotation runbook must be LIVE before any v2 writer-flip or migration.** The round-1 ordering (migrator before telemetry/runbook) was too late; this is the corrected order. Releases are named (not bare numbers) to avoid confusion with the superseded round-1 numbering:

```
R1  Foundation: KeyProvider + EnvKeyProvider + dual-format READER
    + EXPLICIT writer-format gate (default off; build incapable of v2)
    + Guard-10 controlled errors (3-bucket) + KeyringFingerprint publish  ── ciphertext-format/key-selection no-op (NOT a full no-op: changes Guard-10, writes fingerprints)
R2  OTP-HMAC key separation                              ── DEPENDS ON R1 (otpHmac uses R1's KeyProvider)
R3  Durable telemetry (DB tables + heartbeat) + rotation runbook   ── live BEFORE any flip/migration
R4  Checkpoint schema + resumable CAS migrator + GATED v2 writer    ── flips ENCRYPTION_V2_WRITES_ENABLED on
─── Operation A: Staging rehearsal (incident track)                ── not a code PR
─── Operation B: Owner-gated old-key retirement                    ── provider op + evidence/status commit, not a Git config PR
```

**Hard ordering invariants:**
- R1's dual-format reader + Guard-10, and R3's telemetry, MUST be deployed and parity-verified on **BOTH Web and Worker** (reader-capable image + keyring config parity, via `--verify-keyring-and-exit` for the offline Worker) before R4 ever turns on `ENCRYPTION_V2_WRITES_ENABLED`. R1 is a **ciphertext-format/key-selection no-op** on current env (boot bridge synthesises a `legacy` ring; the build has no v2-write capability at all) — but it is NOT a complete no-op (it changes Guard-10 behaviour + publishes `KeyringFingerprint`).
- R2 **depends on R1** (Amendment #3): `otpHmac()` is built on R1's `KeyProvider`/`getOtpHmacKey`; it cannot land before or in parallel with R1.
- R4's writer-flip is gated behind "R1 + R2 + R3 reader-capable images and keyring-configuration parity verified for both services (Worker via `--verify-keyring-and-exit`) + identical published fingerprint" AND the explicit `ENCRYPTION_V2_WRITES_ENABLED` flag.
- Retirement (Operation B) is an **owner-gated provider operation** (Amendment #12), executed only after the full retirement gate (spec §8) passes on **every served DB**.

**Precondition (MF10) — locked route, PR #338 is NOT a merge dependency.** `encryptWith`/`decryptWith` and `prisma/reencrypt-branch-pins.ts` are **NOT on `main`** (only on unmerged PR #338 @ `0871ec0e`). **PR #338 must not be merged.** The route is fixed: **R1 implements `encryptWith`/`decryptWith` net-new on `main`**; **R4 builds the production migrator, selectively salvaging only the safe harness/guards from #338** (not merging it); **PR #338 stays unmerged** and is closed with a pointer to R4 after R4 lands. Stop-and-report if these are assumed already present on `main` at R1 start.

**Each release is independently deployable + testable + rollback-safe.** Each merges behind a SHA-bound `gh pr merge` gate (`REDEEMO_PR_SCOPE_VERIFIED=<head-sha>`) and a clean CI + `tsc`.

---

## File structure

**Created:**
- `src/api/shared/keyring.ts` — `KeyProvider` interface (incl. `getOtpHmacKey`), `EnvKeyProvider`, kid-namespace resolver + namespace-containment boot guard, `DECOMMISSIONED_KIDS` handling, the **canonical boot fingerprint** (spec §3.9), and a `--verify-keyring-and-exit` entrypoint (Amendment #13). (R1) **R2 extends it additively with `getOtpVerifyKids(): readonly string[]` + the `OTP_HMAC_KEY_PREVIOUS` boot validation (Amendment R2-#1), AND amends the canonical fingerprint (Amendment R2-#2): add `otpVerify: getOtpVerifyKids()` (the ordered list) to the canonical object + bump `codeCapability` to a DISTINCT `'v2-reader-otp-verify-v2'` (so a PREVIOUS-designation divergence or an R1-vs-R2 image fails parity; still no raw key bytes).**
- `src/api/shared/otpHmac.ts` — `otpHmacSign(challenge, code)` (ACTIVE-only) + `otpHmacVerify(challenge, code, storedHmac)` (iterates `getOtpVerifyKids()` in order) over the OTP ring, built on R1's KeyProvider (R2).
- Additive migrations, one per release (all on the Neon **direct** endpoint, applied **before** that release's image deploys): **R1** `KeyringFingerprint` (R1 both publishes and gate-checks it — Amendment R3-#1); **R3** `KeyDecryptTelemetry` + `KeyringTelemetryHeartbeat` + `KeyRetirementObservation`; **R4** `KeyMigrationCheckpoint` (+ optional `KeyMigrationBatch`).
- `prisma/reencrypt-branch-pins.ts` — reconciled into the resumable migrator (R4; the unmerged PR #338 version is the seed, not a second tool).
- Tests under `tests/api/shared/` (unit), `tests/api/auth/` (OTP guard), `tests/prisma/*.integration.test.ts` (loopback migrator), `tests/api/redemption/` (Guard-10).

**Modified:**
- `src/api/shared/encryption.ts` — `encryptEnvelope`/`decryptEnvelope`/`parseEnvelope`; route `encrypt`/`decrypt` through the envelope + keyring; **ADD `encryptWith`/`decryptWith` from scratch** (MF10); IV physically owned by the primitive (no `iv` param, R4); keep the `iv.length`/`authTag.length` asserts + hex-charset validation. (R1; telemetry counters added R3)
- `src/api/shared/env.ts` — `validateRequiredEnv()` extended for `ENCRYPTION_KEYS` / `ENCRYPTION_KEY_ACTIVE` / `ENCRYPTION_LEGACY_KID` / `OTP_HMAC_KEYS` / `OTP_HMAC_KEY_ACTIVE` / `DECOMMISSIONED_KIDS` / `ENCRYPTION_V2_WRITES_ENABLED`, with the **two boot modes** (legacy-bridge vs explicit-keyring, Amendment #4) + namespace containment. (R1) **R2 adds the optional `OTP_HMAC_KEY_PREVIOUS` + its fail-closed validation (otp-* / present-in-ring / != ACTIVE / not-denylisted / unset-in-bridge-mode — Amendment R2-#1).**
- `src/api/redemption/service.ts` (`:284–295`) — **Guard-10 hardening moves to R1** (Amendment #1; corrected per Codex re-review): KEY_NOT_AVAILABLE / ENVELOPE_PARSE / GCM-auth-mismatch / unexpected → alert + fail-closed-loud (a GCM-auth mismatch means the STORED ciphertext failed authentication — a server/data fault, NOT a wrong PIN, since the submitted PIN is compared to the decrypted plaintext AFTER decryption). The ONLY silent INVALID_PIN path is a successful decrypt whose plaintext != the submitted PIN (and it alone increments the wrong-PIN counter).
- `src/api/auth/admin/service.ts` (`:56` SIGN, `:117` VERIFY) + `src/api/auth/merchant/service.ts` (`:116` SIGN, `:178` VERIFY, `:573` SIGN, `:675` VERIFY, `:747` SIGN) — swap the 7 `createHmac` sites: the 4 SIGN sites to `otpHmacSign`, the 3 VERIFY sites to `otpHmacVerify`; the dev/test `000000` bypass branches are preserved verbatim (R2).
- `src/index.ts` / `src/worker.ts` — each **publishes its keyring fingerprint to the `KeyringFingerprint` table** at boot + heartbeat (Amendment #9); NO admin HTTP endpoint required by the migrator. (R1; heartbeat in R3)
- `prisma/schema.prisma` — add the keyring-ops tables (R3/R4). **No change to `Branch`.**
- `docs/runbooks/deploy-security-runbook.md` — key-rotation section (R3).
- `src/api/auth/merchant/branch-user.service.ts` (`:273`) — the **second** live PIN-encrypt writer (`PATCH …/pin`); audited for writer-flip completeness, not edited (funnels through `encrypt()`) (MF2).
- `prisma/seed.ts`, `prisma/seed-demo.ts`, `prisma/reset-covelum-pins.ts`, `prisma/get-branch-pin.ts`, `prisma/seed-data/requireEncryptionKey.ts` — hard-read `ENCRYPTION_KEY`; update to validate/encrypt via the keyring (accept the bridged single var OR `ENCRYPTION_KEYS`+ACTIVE) (R1, MF8).
- `prisma/seed-data/keyMigrationWriteGuard.ts` (new; mirrors the real `recomputeWriteGuard.ts` default-deny — **not** a fictional `prismaWriteGuard`) so the migrator writes only `Branch.redemptionPin` + the checkpoint tables, with a startup no-op-row self-check (R4).

---

## R1 — Foundation: KeyProvider + dual-format reader + writer-format gate (off) + Guard-10

**Deliverable:** a v2-capable reader + the explicit writer-format gate (hard-off) + Guard-10 controlled errors + `KeyringFingerprint` publication, deployed to both services. **NOT a complete no-op (Amendment R3-#2):** it is a **ciphertext-format / key-selection no-op** — new 3-part writes remain **format-compatible and decryptable with the legacy key** (NOT "byte-unchanged" — the random IV makes the bytes differ every write; §3.1 R4-#1 locks that flag-off writes use the legacy key, never ACTIVE) and the build cannot emit v2 — but it *does* change Guard-10 behaviour (controlled errors) and *does* write `KeyringFingerprint` records.

**Files:** Create `src/api/shared/keyring.ts` + the **additive `KeyringFingerprint` migration** (Amendment R3-#1 — R1 publishes AND gate-checks it, so the table must exist in R1); modify `src/api/shared/encryption.ts` (ADD `encryptWith`/`decryptWith`, MF10), `src/api/shared/env.ts`, `src/api/redemption/service.ts` (Guard-10), `src/index.ts`, `src/worker.ts` (fingerprint publish), `prisma/schema.prisma` (`KeyringFingerprint`), and the seed scripts (MF8). Tests: `tests/api/shared/keyring.test.ts`, `tests/api/shared/encryption.test.ts`, `tests/api/redemption/guard10-keyring.test.ts`, a seed-runs-under-both-envs CI check.

- [ ] **Write failing tests for `parseEnvelope`/`decryptEnvelope`:** legacy 3-part + v2 5-part roundtrips; unknown kid → `KEY_NOT_AVAILABLE`; cross-namespace kid rejected; malformed / extra-colon / injected-kid / non-hex-iv-or-tag → throws `Invalid encrypted value format` without shifting boundaries or logging `stored`; tampered tag still throws; kid-charset (no underscore) + even-length-hex validation.
- [ ] **Write failing tests for the TWO boot modes (Amendment #4):** (A) legacy-bridge — only `ENCRYPTION_KEY` set ⇒ pin ring `{legacy}` ACTIVE=`legacy` (ACTIVE==legacy is VALID here) + 3-part writes; (B) explicit-keyring — `ENCRYPTION_KEYS` set ⇒ ACTIVE is a `pin-*` kid, present, not denylisted, `!= legacyKid`. Plus fail-closed on non-64-hex / placeholder / duplicate kid / ACTIVE-absent / ACTIVE-denylisted / malformed JSON / swapped-ring namespace contamination.
- [ ] **Write failing tests for the writer-format gate + which-key-encrypts-which-format (Amendment #5 + R4-#1):** (a) explicit ring + **fresh non-legacy ACTIVE + flag OFF** ⇒ `encrypt()` emits a **3-part** value that **decrypts with the legacy key and NOT with ACTIVE** (proves flag-off writes use the legacy key, never ACTIVE); (b) **R1 emits 3-part EVEN WITH `ENCRYPTION_V2_WRITES_ENABLED` set** — R1 has no writer flag and is structurally incapable of emitting v2; the flag-ON ⇒ v2-under-ACTIVE behaviour (and its test) belong to **R4, not R1**; (c) **legacy key missing while flag OFF** ⇒ `encrypt()` **fails closed** (never silently picks another key); (foundation build has no flag at all ⇒ always 3-part-under-legacy).
- [ ] **Write failing test for the IV-as-CAS invariant:** `encryptWith` generates the IV internally (no `iv` param) and never reproduces an identical ciphertext for the same plaintext+key.
- [ ] **Write failing test for the canonical fingerprint (§3.9):** domain-separated `keyHash` + sorted keys + `active.{pin,otp}` + `codeCapability`; never contains raw key bytes; an ACTIVE-only divergence between two rings MUST produce different fingerprints.
- [ ] **Write failing test for fingerprint PUBLICATION (Amendment #9):** boot writes a `KeyringFingerprint` row per service; `--verify-keyring-and-exit` publishes the worker's row and exits WITHOUT registering any BullMQ worker/repeatable (Amendment #13).
- [ ] **Write failing Guard-10 tests (Amendment #1 — moved into R1; corrected per Codex re-review):** `KEY_NOT_AVAILABLE` → alert + fail closed loudly; `ENVELOPE_PARSE` → alert + fail closed loudly; `GcmAuthError` (stored ciphertext failed authentication) → alert + fail closed loudly (controlled REDEMPTION_PIN_UNREADABLE; NEVER silenced, NEVER increments the wrong-PIN counter); unexpected/runtime → alert + fail closed loudly; the ONLY silent INVALID_PIN (with counter increment) is a successful decrypt whose plaintext != the submitted PIN; request-path redaction (invoke `getBranchPin`/`sendBranchPin` against an unknown-kid row; assert no ciphertext/key/plaintext in the response or logs); `KEY_NOT_AVAILABLE` `ERROR_DEFINITIONS` entry.
- [ ] **Write failing test that the seed scripts run under BOTH envs** (single-var bridge AND explicit keyring; encrypt under the active kid; no break).
- [ ] **Run tests → all fail.**
- [ ] **Implement** `keyring.ts` (interface + `EnvKeyProvider` + namespaced resolver + denylist + canonical fingerprint + `--verify-keyring-and-exit`); the envelope in `encryption.ts` (incl. `encryptWith`/`decryptWith`, IV-owned, hex-charset, writer-format gate hard-off); `env.ts` two-mode validation; Guard-10 three-bucket hardening (confirm alert channel — OC1); fingerprint publish on Web + Worker boot; seed-script keyring updates.
- [ ] **Run tests → all pass; `tsc --noEmit` clean.**
- [ ] **Commit** (`feat(crypto): keyring + dual-format reader + writer-gate(off) + Guard-10 hardening`).

**Merge gate:** CI green; `tsc` clean; adversarial unit + Guard-10 + boot-mode suites green. **Deploy order:** apply the additive `KeyringFingerprint` migration on the Neon **direct** endpoint and verify the table exists **before** deploying the R1 image (else the boot fingerprint publish throws relation-does-not-exist). After deploy: confirm matching published `KeyringFingerprint` rows on BOTH services (worker via `--verify-keyring-and-exit`, no sweep restart). Stop-and-report if the build can emit v2, or if a flag-off 3-part write is not decryptable with the legacy key (i.e. it was encrypted under a non-legacy ACTIVE — §3.1 R4-#1).

**Fingerprint-publication-failure behaviour (Amendment R3-#2):** publication is **best-effort and does NOT block startup** — a transient `KeyringFingerprint` write failure logs + alerts and the service still serves PIN reads/writes normally (availability-preserving). It instead **blocks later rotation**: the migrator's parity gate (§3.9) refuses to start on a missing/stale row, so a failed publish can never let a rotation proceed un-verified. Pinned by tests (publish-fail ⇒ boot succeeds + serves; migrator-sees-missing-row ⇒ refuses) and stated in the runbook.

---

## R2 — OTP-HMAC key separation (DEPENDS ON R1)

**Deliverable:** PIN-encryption and OTP-HMAC fully decoupled; a fresh `OTP_HMAC_KEY_ACTIVE` neutralises the leaked key's OTP usage. **Verification uses an EXPLICIT, provider-owned previous key (Amendment R2-#1, owner-locked):** a new optional env `OTP_HMAC_KEY_PREVIOUS` + a new `KeyProvider` method `getOtpVerifyKids(): readonly string[]` returning exactly `[ACTIVE]` or `[ACTIVE, PREVIOUS]`. Signing uses ACTIVE only; verification iterates ONLY that ordered list and **never** infers PREVIOUS from every non-active ring kid.

**Dependency (Amendment #3):** the OTP helpers are built on R1's `KeyProvider`. R2 **must** land after R1 — not independent, not parallel. **`getOtpVerifyKids()` + the `OTP_HMAC_KEY_PREVIOUS` boot validation are an additive `KeyProvider`/keyring extension introduced in R2** (R1 shipped without them); they are NOT a silent reinterpretation of `listKids`.

**Files:** Create `src/api/shared/otpHmac.ts` (`otpHmacSign` + `otpHmacVerify`); extend `src/api/shared/keyring.ts` (`getOtpVerifyKids()` + `OTP_HMAC_KEY_PREVIOUS` boot validation); modify the 7 sites + `src/api/shared/env.ts`. Tests: `tests/api/auth/otp-hmac.test.ts`, keyring `getOtpVerifyKids`/boot-validation tests, + an allowlist guard test.

- [ ] **Re-enumerate the 7 sites against committed source** — verified 7 (not 8) @ `main` `b66b0f95`: **4 SIGN** (`admin:56`, `merchant:116`, `merchant:573`, `merchant:747`) + **3 VERIFY** (`admin:117`, `merchant:178`, `merchant:675`); 3 challenge types (admin login-OTP, merchant login-OTP, merchant email-verify register+resend); longest TTL = 24h (`EMAIL_VERIFY_TTL`). Stop-and-report if the live count/roles differ.
- [ ] **Write failing tests:**
  - **byte-equality (CRYPTO-1)** — `otpHmacSign(c,code)` for the bridged `otp-legacy` kid byte-equals the legacy `createHmac('sha256', process.env.ENCRYPTION_KEY).update(c+':'+code)`.
  - **`getOtpVerifyKids()` ordered list** — exactly `[ACTIVE]` when `OTP_HMAC_KEY_PREVIOUS` unset; exactly `[ACTIVE, PREVIOUS]` (in order) when a valid previous is set; a third undesignated `otp-*` ring kid is NOT returned and does NOT verify.
  - **boot fail-closed on bad PREVIOUS** — not in `OTP_HMAC_KEYS` / `== ACTIVE` / in `DECOMMISSIONED_KIDS` / not `otp-*` / set-while-in-legacy-bridge-mode all crash boot.
  - **verify overlap** — a code signed under the outgoing kid verifies WHILE `OTP_HMAC_KEY_PREVIOUS` is set and is REJECTED once it is unset (routine-window expiry / incident immediate-invalidation); **incident** — with `OTP_HMAC_KEY_PREVIOUS` unset, `getOtpVerifyKids()` = `[ACTIVE]`, so a leaked-key (`otp-legacy`) signature **fails verification even if the retired kid is still present in `OTP_HMAC_KEYS`** (the failure is tied ONLY to the missing PREVIOUS — verification never widens to the full ring; denylisting `otp-legacy` is a separate re-activation guard, NOT the verify-fail mechanism).
  - **dev/test bypass UNCHANGED** — `code === '000000'` still works only in the allowlisted dev/test envs, via a separately-guarded branch independent of `otpHmacVerify`.
  - **allowlist guard** (only `keyring.ts`/bridge read `ENCRYPTION_KEY`/`ENCRYPTION_KEYS`); **redaction** — no helper/log/error/test exposes the code / `challenge:code` / the raw HMAC / key bytes.
  - **R2 parity fingerprint (Amendment R2-#2):** identical ring+ACTIVE+PREVIOUS+R2-capability ⇒ identical fingerprints; same ring+ACTIVE but different/unset `OTP_HMAC_KEY_PREVIOUS` ⇒ different fingerprints; R1 capability vs R2 capability ⇒ different fingerprints; the fingerprint contains no raw key bytes / HMAC material.
  - **malformed stored Redis HMAC fails safe (should-fix):** a non-hex or wrong-length stored `codeHmac` makes `otpHmacVerify` return a clean FAILURE (wrong-code), never lets `timingSafeEqual` throw, never a 500 — validated before `timingSafeEqual` (length/hex-shape check first); attempt-limit + dev/test bypass behaviour unchanged.
- [ ] **Run → fail.**
- [ ] **Implement** `getOtpVerifyKids()` + `OTP_HMAC_KEY_PREVIOUS` boot validation in `keyring.ts` (fail-closed per §3.4); **amend the canonical fingerprint (Amendment R2-#2): add `otpVerify: getOtpVerifyKids()` to the canonical object + bump `codeCapability` to `'v2-reader-otp-verify-v2'`**; `otpHmacSign(challenge, code)` (ACTIVE only) + `otpHmacVerify(challenge, code, storedHmac)` (validate stored shape — hex + correct length — BEFORE `timingSafeEqual`; iterate `getOtpVerifyKids()` in order, first-match; a malformed stored value returns a clean FAILURE, never throws / 500); swap the 4 SIGN sites to `otpHmacSign` and the 3 VERIFY sites to `otpHmacVerify` (dev/test bypass branches preserved verbatim); extend `env.ts` for the OTP ring incl. `OTP_HMAC_KEY_PREVIOUS`. (Routine cutover sets `OTP_HMAC_KEY_PREVIOUS` to one outgoing kid and keeps it until **AT LEAST `T_lastsign + 24h + Δ`** — a MINIMUM overlap, never "≤24h", per the §3.6 overlap-removal rule — then unsets it promptly; the staging incident path leaves it UNSET — Operation A.)
- [ ] **Amend the canonical keyring fingerprint (Amendment R2-#2 — discrete, load-bearing; Codex blocking #2):** in `keyring.ts` add `otpVerify: getOtpVerifyKids()` (the ORDERED list) to the canonical fingerprint object AND bump `codeCapability` to the DISTINCT `'v2-reader-otp-verify-v2'`; re-publish on Web + worker. After this, parity fails on a PREVIOUS-designation divergence (value mismatch) and on R1-vs-R2 (capability mismatch); the fingerprint still contains no raw key bytes / HMAC material. (Called out as its own task — NOT just folded into the implement step — so it cannot be skipped.)
- [ ] **Run → pass; allowlist guard passes; `tsc` clean.**
- [ ] **Commit** (`feat(auth): separate OTP-HMAC key ring from ENCRYPTION_KEY`).

**Two explicit gates (Codex blocking — the merge gate must NOT require evidence that only exists after R2 is deployed; the deployed-service R2 fingerprint cannot be published until R2 code runs):**

**Gate A — R2 CODE MERGE gate (pre-merge; every item is obtainable WITHOUT R2 being deployed):**
- R1 `KeyringFingerprint` migration applied (Neon);
- R1 image **deliberately deployed**;
- R1 Web/worker fingerprint **parity verified at the R1 capability `v2-reader-v1`** (the only fingerprint that can exist before R2 deploys);
- R1 **staging acceptance** complete;
- R2 focused tests + full required suite green — incl. `getOtpVerifyKids()` ordered-list + PREVIOUS boot-validation pins, the **R2 fingerprint FORMULA pins (SYNTHETIC, IN-PROCESS — NOT a deployed service):** computed by calling `keyringFingerprint()` on synthetic providers — the canonical object contains the ordered `otpVerify`; two synthetic inputs differing ONLY in PREVIOUS-designation (`otpVerify`) ⇒ different digests; two differing ONLY in `codeCapability` (`'v2-reader-v1'` vs `'v2-reader-otp-verify-v2'`) ⇒ different digests; no raw key bytes — all in-process, requiring **NO deployed R2 image**; plus the malformed-stored-HMAC safe-fail pin, the allowlist guard, and redaction. **(The ACTUAL DEPLOYED Web+worker R2 fingerprint parity — both publishing `v2-reader-otp-verify-v2` with matching ordered `otpVerify` — is Gate B, NOT here; it cannot exist until R2 runs.)**;
- `tsc` clean; CI green; fresh adversarial auth/security review; scope review;
- **SHA-bound owner approval.**
- **R2 acceptance is performed POST-MERGE on a deliberately-deployed MERGED image (Gate B) — the workflow does NOT deploy an unmerged commit for acceptance.** (R1 staging acceptance in Gate A follows the same model: R1 is already merged + deployed.)

**Gate B — POST-R2-DEPLOY, PRE-ROTATION operational gate (after R2 merges; before ANY OTP rotation op).** BOOT-ORDER FACT (verified in `src/api/shared/keyring.ts`): the `KeyProvider` is parsed **ONCE at boot** (`getKeyProvider()` is a process-wide cache; "hot-swap removed", §3.3) and Web publishes its fingerprint **after** startup — so an env change applied to a RUNNING process can NOT update its provider or its published fingerprint; only a deliberate redeploy / fresh process can. The initial R2 staging acceptance therefore changes **NO key and NO OTP-ring variable** — it proves the R2 CODE is live on the EXISTING legacy-bridge config, via this safe sequence:
- keep the existing **legacy-bridge OTP configuration UNCHANGED** for this acceptance (`OTP_HMAC_KEYS` stays unset ⇒ bridge mode; `getOtpVerifyKids()` = `[otp-legacy]`);
- do **NOT** set a fresh `OTP_HMAC_KEY_ACTIVE` or `OTP_HMAC_KEY_PREVIOUS` during this step;
- keep Railway GitHub auto-deploy **disabled**;
- (optional safety) confirm the pre-deploy R1 baseline — both services publish `codeCapability = v2-reader-v1` — before the rollout; restore R1 if a rollback occurred since Gate A;
- **deliberately deploy the merged R2 Web image** via the separately-approved rollout procedure (boot reads the unchanged bridge env);
- run the **merged R2 worker image with `--verify-keyring-and-exit`** (do **NOT** start BullMQ sweeps);
- confirm BOTH fingerprints report: `codeCapability = v2-reader-otp-verify-v2`; **matching complete fingerprints**; ordered **`otpVerify = [otp-legacy]`** (bridge mode);
- complete **R2 staging acceptance**;
- **keep ALL OTP rotation operations blocked.**

**Explicit boot-order boundary (prevents the unexecutable deploy-then-configure ordering from re-appearing):**
- Any later OTP-ring environment change (a fresh `OTP_HMAC_KEY_ACTIVE`, an `OTP_HMAC_KEY_PREVIOUS`, etc.) is a **separate owner-approved provider operation** — NOT part of this acceptance step.
- Because the provider is **boot-cached**, every such config change requires a **deliberate Web redeploy AND a fresh worker `--verify-keyring-and-exit` probe** to take effect and to publish the new fingerprint.
- **Full R2 fingerprint parity must be RE-ESTABLISHED** (both services at `v2-reader-otp-verify-v2` with matching complete fingerprints incl. the ordered `otpVerify` for the new ring) **after** that config change and **before** any ACTIVE flip, PREVIOUS designation, challenge invalidation, key removal, or other rotation action.
- Disabling GitHub auto-deploy does **NOT** make Railway environment-variable changes inert — a provider-variable change may itself trigger a deployment; it must be handled via the approved provider runbook.
- **Operation A** remains the place where the incident-rotation configuration and fresh keys are introduced (with its own redeploy + `--verify-keyring-and-exit` + parity re-establishment).
- **HARD INVARIANT:** no OTP `OTP_HMAC_KEY_ACTIVE` flip, no `OTP_HMAC_KEY_PREVIOUS` designation, no challenge invalidation, no key removal, and no other rotation operation may occur until (a) Gate B's bridge-config acceptance has passed AND (b) full R2 fingerprint parity has been RE-ESTABLISHED at the rotation configuration after its deliberate redeploy.

---

## R3 — Durable telemetry + rotation runbook (BEFORE any flip/migration)

**Deliverable:** the durable, cross-service decrypt telemetry + liveness heartbeat that the retirement gate's non-use proof depends on, plus the executable runbook — both LIVE before any writer-flip or migration (Amendment #1).

**Files:** `prisma/schema.prisma` + migration for `KeyDecryptTelemetry` + `KeyringTelemetryHeartbeat` + `KeyRetirementObservation` (applied on the direct endpoint before the R3 image); `src/api/shared/encryption.ts` (fallback-decrypt upsert); `src/index.ts`/`src/worker.ts` (heartbeat); `docs/runbooks/deploy-security-runbook.md`. Tests: `tests/api/shared/telemetry.test.ts` (+ loopback for the upsert).

- [ ] **Write the additive migration** for `KeyDecryptTelemetry { service, kid, count, firstSeenAt, lastSeenAt, @@unique([service,kid]) }` + `KeyringTelemetryHeartbeat { service @unique, codeCapability, lastBeatAt }` + `KeyRetirementObservation { retiringKid, observationStartAt, baseline Json, expectedServices, codeCapability, fingerprint, status, completedAt }` (Amendment R3-#3, schema in spec §3.10).
- [ ] **Write failing tests (Amendment #2 + R3-#3):** a non-active-kid (fallback) decrypt does an atomic upsert-increment tagged by `service`; the hot-path upsert is best-effort (a write failure does NOT fail the operation — logs+alerts); heartbeat written at boot + ≤5min; **baseline-relative gate** — opening a `KeyRetirementObservation` records the per-service `count` baseline for the retiring kid, and the pass condition is `current − baseline == 0` per expected service (NOT absolute zero); BLOCK on any increase, a count below baseline (reset/restore), a heartbeat gap in an expected-live service, or a change to recorded `expectedServices`/`codeCapability`/`fingerprint`; the **offline worker** folds its pre-window snapshot count into the baseline and is NOT an expected continuous heartbeater (worker-offline ⇒ not a gap); survives a simulated restart; never stores plaintext/ciphertext/key.
- [ ] **Run → fail.**
- [ ] **Implement** the telemetry upsert + heartbeat + the `KeyRetirementObservation` open/evaluate logic; wire the fallback path in `decryptEnvelope`; confirm best-effort isolation on the hot path.
- [ ] **Write the runbook section:** rotation procedure; the 4-tier rollback split routine-vs-incident (§3.8/§3.12); the retirement gate; the **`KeyRetirementObservation` lifecycle (Amendment R4-#4)** — open-after-migration+verify-zero, atomic baseline/expected-services/capability/fingerprint capture, blocked+re-baseline triggers (fallback increase / rollback / service-set / capability / fingerprint change / telemetry gap), passed-only-after-all-checks, evidence preserved through retirement; per-service config + published-fingerprint parity (+ `--verify-keyring-and-exit` for the offline worker); both compromised kids (`legacy` PIN + `otp-legacy` OTP) denylisted with the read-retention distinction (R4-#3); staging/prod/DR; the "pre-retirement DR restore after removal bricks PINs" + "PITR is not a valid post-live-write rollback" statements; the incident-track offline-backup recovery policy.
- [ ] **Run → pass; `tsc` clean.**
- [ ] **Commit** (`feat(crypto): durable decrypt telemetry + heartbeat + rotation runbook`).

**Merge gate:** CI green; loopback telemetry suite green; runbook reviewed by owner + Codex; R1 reader-capable image + keyring-configuration parity verified for both services (Worker via `--verify-keyring-and-exit`, no sweep restart — Amendment R3-#8).

---

## R4 — Checkpoint schema + resumable CAS migrator + GATED v2 writer

**Deliverable:** a staged, loopback-tested resumable migrator (no 500 ceiling, no big tx, no services-stopped) + the `ENCRYPTION_V2_WRITES_ENABLED` capability (default off), gated behind R1 + R2 + R3 reader-capable images and keyring-configuration parity verified for both services (Worker via `--verify-keyring-and-exit`).

**Files:** `prisma/schema.prisma` + migration for `KeyMigrationCheckpoint` (+ optional `KeyMigrationBatch`) — `KeyringFingerprint` was already created in R1, `KeyDecryptTelemetry`/`KeyringTelemetryHeartbeat`/`KeyRetirementObservation` in R3; `prisma/seed-data/keyMigrationWriteGuard.ts`; reconcile `prisma/reencrypt-branch-pins.ts`; add the `ENCRYPTION_V2_WRITES_ENABLED` capability to `encrypt()`. Tests: `tests/prisma/reencrypt-branch-pins.integration.test.ts` (loopback).

- [ ] **Write the additive migration** for the checkpoint/forensics tables. Additive-only; applied via `prisma migrate deploy` on the Neon **direct** endpoint BEFORE the R4 image deploys (else the first checkpoint write throws relation-does-not-exist).
- [ ] **Write failing integration tests (loopback Postgres):** cursor-by-uuid; NOT-LIKE-active-kid idempotent FILTER (parse-based gate is authoritative); `updateMany` CAS skip on a simulated concurrent `setBranchPin`; crash-mid-batch resume from the committed cursor; **reconciliation loop (Amendment #11)** — a row re-introduced behind the cursor triggers a fresh full pass until verify-zero is clean; poison-row → `decryptFailures` + alert + `completed_with_residue` gate-block (NOT for decryptable residue); single-flight (advisory lock / atomic claim) rejects a second runner; mid-run published-fingerprint change aborts cleanly; reverse-migration symmetry (routine only); dry-run / `--count` / `--verify-zero` correctness; 100 + 10k synthetic-row runs; zero-secret-logging.
- [ ] **Run → fail.**
- [ ] **Implement the migrator** — a **separate ephemeral process** (Amendment #8: operator machine `npx tsx …` OR a Railway one-off; `railway run` injects env into a LOCAL process — owner picks via OD8), reading `MIGRATION_DATABASE_URL` (Neon **direct** endpoint, never logged); its **own dedicated `new PrismaPg(new Pool({ connectionString, max: 2 }))`** (MF F1); cursor (uuid asc), `--batch-size` (default 200), bounded-per-batch/unbounded-total; `updateMany` CAS; idempotent skip; 3-attempt backoff; checkpoint commit after each batch; `decryptFailures` id-log + alert; `--dry-run`/`--count`/`--verify-zero`; **`--reverse` fail-closed (Amendment R3-#5)** — refuses when the target kid is in `DECOMMISSIONED_KIDS`, when the run is incident-mode, or when the target is absent / not an approved routine-rotation previous key (a compromised key must never become a migration target or ACTIVE again); `--expect-host` exact-match + loopback gate; **single-flight**; **refuse-on-fingerprint-mismatch (Amendments #9 / R3-#4): Web row fresh + unchanged each batch; Worker checked value-unchanged vs a run-start snapshot (freshness NOT required, offline by design); Worker-value-change ⇒ abort, Worker-missing-at-start ⇒ refuse**; **terminal verify-zero + reconciliation loop** (Amendment #11); `keyMigrationWriteGuard` + startup no-op self-check.
- [ ] **Add the static guard test** that no live path writes `Branch.redemptionPin` outside the shared `encrypt()` helper (MF2). Stop-and-report if a direct `prisma.branch.update` on `redemptionPin` exists outside the helper.
- [ ] **Add the `ENCRYPTION_V2_WRITES_ENABLED` capability** to `encrypt()` (default off); v2 emitted under ACTIVE only when the flag is true AND `ACTIVE != legacy` (Amendment #5); otherwise **3-part under the legacy key** (Amendment R4-#1 — never under a non-legacy ACTIVE; fails closed if the legacy key is absent). Pin: flag-off + non-legacy ACTIVE ⇒ 3-part decryptable with legacy, not ACTIVE.
- [ ] **Run → pass; `tsc` clean.**
- [ ] **Commit** (`feat(ops): resumable CAS migrator + checkpoint + gated v2 writer`).

**Merge gate:** **R1 + R2 + R3** (Amendment R3-#6 — R2 is an explicit prerequisite, not just diagram order) confirmed via **reader-capable image and keyring-configuration parity verified for BOTH services** (Worker via `--verify-keyring-and-exit`, no sweep restart — Amendment R3-#8) with matching published fingerprints; loopback integration suite green; owner approves OD6 (checkpoint table) + OD7 (batch/throttle) + OD8 (run host). Apply the `KeyMigrationCheckpoint` migration on the direct endpoint before the R4 image. **Stop-and-report** if the production Branch count (OD7) is unknown, or the §6 benchmark/query-plan/load gates (Amendment #14) have not been run before a >100k-row run.

---

## Operation A — Staging rehearsal (incident track) [prerequisite: R1 + R2 + R3 + R4 reader-capable images and keyring-configuration parity verified for both staging services — Worker via `--verify-keyring-and-exit` (Amendments R3-#6 / R3-#8)]

Not a code PR — the first real execution of the standing runbook, on the **incident** track (spec §3.12/§12).

- [ ] **Denylist BOTH compromised logical kids (Amendment R4-#3):** add **`legacy` (PIN)** AND **`otp-legacy` (OTP)** to `DECOMMISSIONED_KIDS` immediately — neither may become ACTIVE, sign new OTPs, encrypt new PINs, or be a `--reverse` target. Tested for each distinction.
- [ ] **OTP (incident):** set `OTP_HMAC_KEY_ACTIVE` fresh and, because staging is offline, **do NOT** carry `otp-legacy` as a verify-only previous — invalidate outstanding challenges immediately; **remove `otp-legacy` from the OTP ring immediately** (no read-retention need for transient HMACs).
- [ ] **PIN (incident):** add a fresh `pin-*` kid on both services; verify matching published fingerprints (worker via `--verify-keyring-and-exit`); enable `ENCRYPTION_V2_WRITES_ENABLED` + flip ACTIVE to the fresh kid on both; run the migrator (operator host, `max:2`, direct endpoint); verify-zero + reconciliation until clean on every served DB. Retain **`legacy`** as **read-only** for only this minimum migration interval (it must still decrypt un-migrated 3-part rows), then remove it promptly; handle pre-flip snapshots via the offline-backup recovery policy.
- [ ] **Surface OC2 to the owner (Amendment R4-#2):** the **only supported PIN incident path is build-first through R4** then this Operation A — there is **no safe interim PIN-flip** (the v2 writer + migrator first exist in R4; a flip without them cannot contain and could write undecryptable PINs). The **OTP** leak CAN be neutralised interim **after R2** (set `OTP_HMAC_KEY_ACTIVE` fresh + invalidate outstanding challenges immediately — no persisted-data migration). If a faster interim PIN containment is demanded, **stop and report it as a separate architecture decision** — do NOT reuse the one-off PR #338 tool.

---

## Operation B — Owner-gated old-key retirement (Amendment #12 — provider operation, not a Git config PR)

**Deliverable:** the leaked/old key permanently unreadable + un-re-activatable; the rotation cycle closed.

Removing a kid is a **Railway environment-variable change on each service** (Git does not track it). Modelled as an owner-gated provider operation with reviewed evidence + a runbook/status commit.

- [ ] **Open the observation (Amendment R4-#4) — operational `KeyRetirementObservation` lifecycle:**
  - [ ] **Open AFTER** the migration + a clean verify-zero on every served DB (not before — pre-migration fallback decrypts must already be in the baseline).
  - [ ] **Atomically capture**, in one `KeyRetirementObservation` row: `retiringKid`, `observationStartAt`, the per-expected-service `KeyDecryptTelemetry.count` **baseline** for the retiring kid, the **expected-live service set** (web only when the worker is offline by design), the `codeCapability`, and the `KeyringFingerprint` digest.
  - [ ] **Mark `blocked` and restart / re-baseline** on ANY of: a fallback-counter increase above baseline; a counter below baseline (reset/restore); a rollback (tiers 1–3); an expected-service-set change; a `codeCapability` change; a `KeyringFingerprint` change; or a heartbeat gap in an expected-live service.
  - [ ] **Mark `passed`** ONLY after the full window elapses with zero increase AND all ≥3 verify-zero runs pass AND every §8 check holds.
  - [ ] **Preserve the completed `KeyRetirementObservation` row as evidence** through retirement (no prune while non-terminal; retained as the audit record attached to the removal operation).
- [ ] **Confirm the full retirement gate (spec §8) on EVERY served DB:** **positive kid-specific, parse-based** count of rows whose parsed kid `== K` `= 0` ×3 across the window (NOT the kid-relative `NOT LIKE` form); assert `K !=` either active kid and the gate's active kid matches both services' published fingerprint; durable cross-service fallback-decrypt counter shows **zero increase from the recorded `KeyRetirementObservation` baseline** (NOT absolute zero — the counter is cumulative; Amendment R3-#3) across the entire window with continuous heartbeats from the expected-live set (no gap; offline worker excluded); for ROUTINE rotation the window covers `max(≥14d OD5, Neon backup/PITR retention horizon, oldest retained restore point)`; for the INCIDENT track, retain only the minimum migration interval + offline-backup policy (§3.12); enumerate production + staging + replicas + retained snapshots/branches + DR copies (OC4/OC7); **all `decryptFailures` poison rows remediated** before the window is clean.
- [ ] **(Code, ships in R1) boot test:** a denylisted kid cannot be set ACTIVE (fail-closed).
- [ ] **Owner-gated provider operation:** owner removes kid `K` from `ENCRYPTION_KEYS` (and the OTP previous kid) on **both** Railway services' env + adds to `DECOMMISSIONED_KIDS`.
- [ ] **Re-verify published fingerprints** per service (worker via `--verify-keyring-and-exit`) to confirm absence from BOTH rings.
- [ ] **Runbook/status commit** to the repo recording the operation (when/who/evidence) — the Git artifact is the evidence record; the removal itself is the provider op.

**Gate:** full retirement gate passed on every served DB; separate independent review; per-service fingerprint re-verified.

---

## Cross-cutting requirements (apply to every release)

- **No-secret-logging:** never log plaintext PINs, key bytes, raw ciphertext, or full envelopes. Only branch uuid + kid + masked host + counts. Fingerprint = the single §3.9 canonical formula (no key bytes). Enforced by a redaction test (incl. the request path), not prose.
- **Loopback-only integration harness:** reuse the `--expect-host` exact-match + loopback guard + zero-secret-logging discipline. No integration test connects to Neon.
- **Additive-only schema; manual `prisma migrate deploy` on the direct endpoint;** no Procfile release line; no destructive column ops.
- **`setBranchPin` is NOT modified** (both writers stay non-atomic update + separate audit, Codex #4).
- **Worker stays offline for cost containment** (Amendment #13): use `--verify-keyring-and-exit` for parity; never restart the worker daemon (60s sweeps) as a prerequisite.

## Global stop-and-report triggers

- The `encryptWith`/`decryptWith` primitives or `reencrypt-branch-pins.ts` are assumed present on main at R1 start (net-new / unmerged PR #338, MF10).
- A direct `prisma.branch.update` on `redemptionPin` exists outside the shared `encrypt()` helper, OR the live PIN-encrypt writer count differs from 2 (MF2).
- The 7-HMAC-site count differs from committed source (R2).
- The boot bridge is not a verified no-op, OR the R1 build can emit a v2 value (Amendment #5).
- The production/staging Branch count is unknown when finalising OD7, OR the §6 benchmark/query-plan/load gates (Amendment #14) have not run before a >100k-row run.
- The Neon backup/PITR/snapshot retention horizon or oldest retained restore point is unknown when sizing a ROUTINE retirement window (OC7).
- Any served-DB inventory ambiguity (replicas / retained snapshots / DR copies) before retirement (OC4).
- Any design assumption contradicted by source during implementation → PAUSE and amend the spec (Tier-2/3 rule), do not hack around it.

## SHA-bound merge discipline

Every `gh pr merge` uses `REDEEMO_PR_SCOPE_VERIFIED=$(gh pr view N --json headRefOid --jq .headRefOid)` after a live `gh api compare` scope check. No push to `main`. Worktree CLAUDE.md symlink excluded from commits.

---

## Current-work state & PR #338 reconciliation (Amendment #15)

- **Preserve:** these two uncommitted docs (spec + plan) and the paused PR #338 work. Nothing is discarded.
- **PR #338:** the one-off tool branch `feat/reencrypt-branch-pins` (head `0871ec0e`) + its three uncommitted CodeRabbit fixes on disk. **Do NOT merge it.**
- **GitHub auth:** `gh` is currently **expired (HTTP 401)** in this environment — PR #338 cannot be queried/modified now; restore auth before any PR action.
- **Supersession plan (locked — PR #338 is NEVER merged):** PR #338 is **superseded by R4**, not merged. R1 implements the `encryptWith`/`decryptWith` primitives net-new on `main`. R4 builds `prisma/reencrypt-branch-pins.ts` as the production resumable migrator, **selectively salvaging** only the safe parts of #338 (key-validation guards, `--expect-host` gate, dry-run/count/verify, `maskHost`, loopback harness) and **dropping** its three blockers (500-row ceiling, single `$transaction`, services-stopped). The reconciliation happens INTO R4 (one tool, not two). **After R4 lands, PR #338 is closed with a pointer to R4.** There is no merge-first option.

---

## Pre-R1 staging recovery (Amendment #16 — provider-grounded; release ordering)

> Inserted after the staging P1001 diagnosis (pre-deploy `prisma migrate deploy` connection failure; cause not isolated). Design rationale in spec §20; operator detail + decision ledger + failure boundaries in runbook §13. **Docs-only; no implementation, provider action, or recovery branch is created here.** R1 activation must not begin until this recovery completes (P1a/P1b verified, P8 established, P9 fixture proven).

**Release ordering (each step owner-approved + Codex-reviewed; nothing executed by this plan):**

1. **A1 — compute headroom:** wait for the **Free monthly allowance reset** (default; **no paid Neon upgrade**).
2. **A2 — control-plane resume:** owner-approved unarchive/resume of the staging compute (or the §13.3 read-only preflight is that controlled resume).
3. **P1a — runtime-recovery preflight** (spec §20.1 / runbook §13.1): minimum **read-only** verify of the **pooled runtime** endpoint + database + reachability — enough to serve the pre-R1 baseline. No migration/mutation.
4. **Short-term recovery** (auto-deploy disabled · worker Offline): protected recovery branch (GitHub ruleset; SHA verified before every deploy/rebuild) at the **verified pre-R1 SHA `53bafac4716e8819b3a77ffb5a129bd6b25d59ef`** → point Railway at it (approved provider op; no unintended deploy) → temporarily disable auto-migrate (reversible) → deploy → record **P8 evidence** (`/health` + read-only `GET /api/v1/customer/categories` smoke + deployment ID/SHA/timestamp + **BOTH** a currently-visible Railway redeploy/rollback action AND the durable protected-branch rebuild path — D-R6; runbook §13.5). ⇒ **P8 established.**
5. **Establish the P9 acceptance fixture** — **after** the pre-R1 baseline is serving (step 4), **before** any R1 migration or R1 deployment: provenance-proven, owner-approved dedicated fixture (runbook P9 / §7). **R1 activation cannot begin while P9 is BLOCKED.**
6. **P1b — migration-readiness preflight** (spec §20.1 / runbook §13.2): minimum **read-only** verify of the **direct, non-`-pooler`** endpoint + migration database + injected role + grants (catalog inspection). Required **before** any schema mutation.
7. **Restore Railway source branch to `main`/R1** (approved provider op); **apply the R1 migration `20260629000000` on the DIRECT endpoint** (operator-run, R1 §3 / OD8) — only **after** P8 + **P9** + P1b.
8. **R1 activation** (R1 §4–§7): deploy R1 image → worker `--verify-keyring-and-exit` → fingerprint parity → acceptance (the P9 fixture from step 5 is already in place).
9. **Separate / later (own approval):** adopt **`MIGRATION_DATABASE_URL`** (below); the permanent worker persistent-activity reduction → **worker restart** (not required for R1).

**Deferred long-term migration-URL workstream (`MIGRATION_DATABASE_URL`) — NOT in this docs amendment; owner-gated, plan-first when approved:**
- `prisma.config.ts` reads `MIGRATION_DATABASE_URL ?? DATABASE_URL` (CLI/migrate only); runtime `PrismaPg` keeps the pooled `DATABASE_URL` (`src/worker.ts`, `src/api/plugins/prisma.ts` unchanged).
- **Fail-closed validation (migration context):** in controlled **staging/production migration** contexts `MIGRATION_DATABASE_URL` MUST be **present** and a **direct, non-`-pooler`** URL — missing or invalid **fails closed** (migration does not run). Fallback to `DATABASE_URL` is **explicit local/test-only** behavior, never the staging/production migration path. `prisma.config.ts` governs the Prisma CLI/migration config — a migration-context fail-closed, NOT app boot.
- Tasks (future): config/unit test (migrate prefers the migration URL; runtime unaffected); loopback integration test; secret handling (new injected direct URL, never printed); Railway provider rollout; rollback (unset → fallback); spec/plan/runbook amendment. **Separate owner approval required.** Permanent removal of the auto pre-deploy migrate is a **separate deployment-policy decision**, not bundled here.

**Worker boundary (Amendment #16):** the repeatable sweeps (`RECONCILE_EVERY_MS=60000`, claim-stale hourly, `PROMOTE_PENDING_HOURS_EVERY_MS=60000`) are the **leading identified persistent-activity mechanism, not a telemetry-proven sole cause** of the Neon compute usage; **permanent worker remediation gates the worker restart only** (the bounded Web/R1 recovery runs with the worker Offline).

**Stop-and-report (recovery):** no *mutating* DB op before the relevant gate (P1a serve / P1b migrate); read-only preflight only; no paid upgrade; worker stays Offline until the permanent reduction + approval; R1 migration not applied before P8 + P1b; Railway branch-change + auto-migrate-disable are separately-approved provider ops with auto-deploy disabled; do not rely on a retention-limited image rollback as the sole P8 basis; do not repoint runtime `DATABASE_URL`→direct; if P1001 persists after headroom + the direct path, STOP and re-diagnose.

---

## Self-review (against the spec)

- **Reorder (Amendment #1) applied:** Guard-10 + telemetry + runbook are in R1/R3, BEFORE the R4 migrator/writer-flip. Releases are named to avoid round-1 numbering collisions.
- **Spec coverage:** envelope/keyring/reader/writer-gate/Guard-10 (R1), OTP separation depends-on-R1 (R2), durable telemetry + runbook (R3), checkpoint + migrator + gated writer (R4), staging rehearsal (Op A), owner-gated retirement (Op B). Schema additions (checkpoint/fingerprint/telemetry/heartbeat) are additive; no Branch change.
- **No placeholders:** each release lists exact files, env vars, test cases, and a merge gate.
- **Type/name consistency:** `KeyProvider`/`getOtpHmacKey`/`getOtpVerifyKids`, `otpHmacSign`/`otpHmacVerify`, `encryptEnvelope`/`decryptEnvelope`/`parseEnvelope`, `ENCRYPTION_V2_WRITES_ENABLED`, `OTP_HMAC_KEY_ACTIVE`/`OTP_HMAC_KEY_PREVIOUS`, the fingerprint `codeCapability` values (R1 `'v2-reader-v1'`, R2 `'v2-reader-otp-verify-v2'`) + the `otpVerify` canonical field, `KeyMigrationCheckpoint`/`KeyringFingerprint`/`KeyDecryptTelemetry`/`KeyringTelemetryHeartbeat`, `DECOMMISSIONED_KIDS`, the `v2:<kid>:<iv>:<tag>:<ct>` shape, and `pin-*`/`otp-*` match the spec verbatim.
- **Ordering invariant** (reader+telemetry-before-writer) encoded as the R1 + R2 + R3 → R4 gate + the explicit writer-format flag.

*End of plan. Not approved. Do NOT begin implementation, rotate any key, connect to Neon, or restart any service.*
