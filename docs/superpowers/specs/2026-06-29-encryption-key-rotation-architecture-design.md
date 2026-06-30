# Encryption Key Rotation + Versioned Ciphertext Architecture — Design Spec

> **Status:** DRAFT — proposal for Codex + owner review. Not approved. No implementation, no key rotation, no Neon connection, no Railway restart authorised by this document.
> **Tier:** 3 (new security architecture + persisted-data migration; full brainstorm → spec → plan flow).
> **Date:** 2026-06-29
> **Supersedes the framing of:** the one-off `prisma/reencrypt-branch-pins.ts` tool (PR #338, unmerged) — see §13.

---

## 0. Why this exists

Two problems, one root cause.

1. **Immediate:** a staging `ENCRYPTION_KEY` (and other staging secrets) were exposed in agent transcripts and must be rotated. There is **no rotation mechanism** today — the runbook assumes a single static key per environment ("same value the seed used").
2. **Structural:** the current key model is a **single, static, dual-purpose (PIN-encryption AND OTP-HMAC), non-rotatable** key per environment. This is **not production-ready** for Redeemo's intended merchant + customer scale. Rotating it today would make every stored branch PIN undecryptable (fail-closed redemption) and would silently change every OTP HMAC.

The owner has rejected treating a staging-only ≤500-row utility as the finished rotation architecture. This spec defines a **standing, production-safe key-rotation capability** of which the staging fix is simply the **first rehearsal**.

The current encrypted-data footprint is intentionally tiny — **exactly one persisted encrypted column** (`Branch.redemptionPin`) — which keeps this architecture small while still being correct at scale.

---

## 1. Ground truth (verified read-only against current source)

### 1.1 Source cross-check table

| Fact | Source (file:line) | Implication for design |
|---|---|---|
| AES-256-GCM; stored value `ivHex:authTagHex:ciphertextHex` (3 colon parts); IV `randomBytes(12)`; authTag 16B; key 64-hex | `src/api/shared/encryption.ts` | Versioned envelope must stay parseable; legacy 3-part values must keep decrypting; fresh-random IV is load-bearing (§3.7) |
| `encryptWith(pt,keyHex)`/`decryptWith(stored,keyHex)` primitives **are NOT on `main`** — they exist only on the unmerged branch `feat/reencrypt-branch-pins` (PR #338, committed at `0871ec0e`). `main`'s `encryption.ts` has only `getKey`/`encrypt`/`decrypt`. | `src/api/shared/encryption.ts` (**unmerged branch only**) | **Net-new on main** (MF10): R1 ADDs these primitives from scratch; PR #338 is **never merged** (R4 selectively salvages its safe harness/guards). Do **not** treat as pre-existing reuse |
| **Only one** persisted encrypted column: `Branch.redemptionPin String?` (nullable) | `prisma/schema.prisma:517` | Migration scope is one column on one table; `passwordHash` fields are bcrypt (one-way, out of scope) |
| Branch PK = `uuid()`; has `updatedAt @updatedAt`, **no `version`/optimistic-lock column** | `prisma/schema.prisma:491–604` | Cursor by uuid PK; CAS optimistic token must be the ciphertext string itself |
| **LIVE encrypt (2)** — BOTH bare, non-transactional, both funnel through the shared `encrypt()` helper: (a) `setBranchPin` `branch/service.ts:1368`; (b) a second `setBranchPin` `src/api/auth/merchant/branch-user.service.ts:273` (routed `PATCH …/pin`). PIN update + `writeAuditLog` are **separate, non-atomic** calls. | `branch/service.ts:1368`, `auth/merchant/branch-user.service.ts:273` | **MF2:** writer-flip is safe ONLY because both funnel through `encrypt()`; a static guard must assert no path writes `redemptionPin` outside the shared helper. Migration cannot assume a stable snapshot; CAS required; no atomicity claimed (Codex #4) |
| **LIVE decrypt (3):** `getBranchPin` (OWNER/BRANCH_MANAGER), `sendBranchPin` (SMS/email), `createRedemption` Guard 10 (timing-safe compare) | `branch/service.ts:1346`, `:1398`, `redemption/service.ts:285` | These 3 sites need dual-key reads; Guard 10 is the live hot path |
| **Guard 10 wraps `decrypt()` in try/catch → maps every throw to `pinMatches=false`** | `src/api/redemption/service.ts:284–295` | A `KEY_NOT_AVAILABLE` becomes a **silent all-redemptions-fail** at that branch. Must harden (§3.10, RISK-1) |
| **7** `createHmac('sha256', process.env.ENCRYPTION_KEY)` OTP/email sites over `challenge:code`; output **transient in Redis** (TTL, single-use, deleted on verify, never persisted) | `admin/service.ts:56,117`; `merchant/service.ts:116,178,573,675,747` | PIN-encryption and OTP-HMAC coupled only by sharing one env var → must decouple (§3.6). **7, not 8** — the 8th candidate was `encryption.ts getKey` (the AES key reader, not an HMAC site) |
| `validateRequiredEnv()` runs at bootstrap **before** app-graph import; fail-closed; `ENCRYPTION_KEY` is REQUIRED_SECRET #2; `isPlaceholder()` rejects placeholder substrings | `src/api/shared/env.ts`; `src/api/bootstrap.ts:20` | Keyring boot validation extends this exact fail-closed path (§3.4) |
| Key re-read **per encrypt/decrypt call** (no app cache) | `src/api/shared/encryption.ts` | Boot-once keyring parse is a deliberate change (RISK-9) — removes hot-swap, gains atomic multi-key validation |
| Web (`src/index.ts`) and Worker (`src/worker.ts`) are **separate Railway services**; do **not** auto-share env; worker has its own PrismaClient + 60s/60s/hourly BullMQ sweeps | `Procfile`, `src/index.ts`, `src/worker.ts` | Per-service config + parity verification required (Codex #5, §3.9); migration runs as a **separate ephemeral process** (not on the worker daemon — the worker stays offline, §3.5 / Amendment #13) |
| Neon serverless (Free: 100 CU-hr/mo, scale-to-zero after 5 min idle; the sweeps keep it warm); pg pool ~10 | runbook + `prisma/plugins` | Migration throttled to 1–2 connections + inter-batch delay (§3.5, §6) |
| Migrations are manual `prisma migrate deploy`, additive-only; **no** key-rotation procedure or rollback documented | `docs/runbooks/deploy-security-runbook.md` | New additive checkpoint table; new runbook section (§7); PITR is **not** a valid rollback after live writes (Codex #8) |
| Existing backfills (`backfill-favourite-branches.ts`, `backfill-locality-data.ts`, `recompute-counts.ts`) use idempotent WHERE-gates + per-row loops; **none persist a resumable checkpoint** | `prisma/*.ts` | Mirror the idempotent/dry-run/preflight discipline; **add** durable checkpoint (§3.5) |
| One-off tool `prisma/reencrypt-branch-pins.ts` (PR #338, unmerged): ENCRYPTION_KEY_OLD/_NEW, read-only-default, dry-run, --confirm gates, single `$transaction`, **hard 500-row ceiling**, requires services stopped | worktree | Reuse the guards/harness; **drop** the 500 ceiling + single-tx + services-stopped (§13) |

### 1.2 Design-time prohibitions (binding while this spec is in review)

No key rotation; no Neon connection; no Railway Web/Worker restart; no provider/env/branch/staging/transcript changes; no Codex-checklist edits; no implementation. This document is a written proposal only.

---

## 2. Goals, non-goals, constraints

**Goals.** A standing, repeatable, production-safe key-rotation capability that delivers: versioned ciphertext with an explicit key id; legacy-ciphertext compatibility; active-key writes with old+new reads (dual-read window); resumable bounded-batch migration with no hard row ceiling; concurrency-safe re-encryption against the live non-atomic writer; idempotency + checkpoints + retries + progress + audit; verification that every row migrated before old-key retirement; rollback without a full-DB restore; Web/Worker consistency across rolling deploys; tightly-bounded degradation; separated branch-PIN vs OTP-HMAC keys; a provider-neutral keyring with a future KMS boundary; no plaintext/key logging.

**Non-goals (now).** Per-tenant/per-merchant keys; automated rotation scheduling; HSM; choosing a specific KMS vendor (§10); encrypting any column other than `Branch.redemptionPin`.

**Constraints.** Neon stays on Free tier. Additive-only schema. Manual `prisma migrate deploy`. The one encrypted column today. The live Guard-10 redemption path must not regress.

---

## 3. Recommended architecture

(Resolved by an independent 3-architect judge panel + synthesis; the chosen line is A1 inline envelope + B1 env keyring behind a KeyProvider interface + C1 resumable CAS migration, with purpose-namespaced kids, a DECOMMISSIONED_KIDS denylist, reader-before-writer ordering, and a telemetry-gated retirement.)

### 3.1 Versioned ciphertext envelope (A1, inline, self-describing)

- **New writes (active key):** `v2:<kid>:<ivHex>:<authTagHex>:<ciphertextHex>` — exactly **5 colon parts**. `v2` is the **envelope-format** literal (not the key version). `kid` matches `^[a-z0-9-]{1,32}$` — **no underscore** (MF/SF: underscore is a single-char wildcard in SQL `LIKE`; a kid like `pin_2026_06` would make the `NOT LIKE 'v2:<activePinKid>:%'` gate match other kids and silently skip/under-count them → silent brick). No colon either, so `split(':')` is unambiguous and an injected kid cannot shift the iv/tag/ct boundaries. IV stays `randomBytes(12)` (24 hex), authTag 16B (32 hex), AES-256-GCM verbatim.
- **Legacy values already in the DB:** `<ivHex>:<authTagHex>:<ciphertextHex>` — exactly **3 parts**, no prefix. They keep decrypting forever (until retirement) via an implicit kid = `ENCRYPTION_LEGACY_KID` (default `legacy`).
- **Exact parse rule (`decryptEnvelope`)** — with explicit charset validation (SF: `Buffer.from(x,'hex')` is lenient — it truncates at the first non-hex char and drops a trailing odd nibble, so length asserts alone are insufficient):
  ```
  const parts = stored.split(':')
  if (parts.length === 3) { kid = LEGACY_KID; [iv,tag,ct] = parts }
  else if (parts.length === 5 && parts[0] === 'v2') { kid = parts[1]; [iv,tag,ct] = parts.slice(2) }
  else throw new Error('Invalid encrypted value format')   // NEVER log `stored`
  if (!/^[a-z0-9-]{1,32}$/.test(kid)) throw new Error('Invalid encrypted value format')      // kid charset
  for (const h of [iv, tag, ct]) if (!/^[0-9a-fA-F]+$/.test(h) || h.length % 2) throw new Error('Invalid encrypted value format')  // strict even-length hex; never log h
  const keyHex = keyProvider.getKey('pin', kid)             // throws KEY_NOT_AVAILABLE if absent
  // then existing AES-256-GCM decrypt; KEEP iv.length!==12 / authTag.length!==16 asserts; ct non-empty
  ```
- **Encode rule (`encrypt`) — which KEY encrypts which FORMAT (Amendment #5 + R4-#1, load-bearing correctness lock).** A 3-part value carries **no kid**, so every reader resolves it via `ENCRYPTION_LEGACY_KID`. Therefore a 3-part value **MUST** be encrypted with the **legacy PIN key** — never with a non-legacy ACTIVE key (doing so would write a PIN the legacy-kid reader cannot decrypt → a silently-bricked PIN). The locked rule:
  - **Writer flag OFF** (`ENCRYPTION_V2_WRITES_ENABLED !== true`, incl. the foundation build where the flag does not exist): `encrypt()` emits a **3-part** value encrypted with `getKey('pin', getLegacyKid())` — **regardless of `ACTIVE`**. If the legacy key is absent from the ring it **fails closed** (never silently picks another key).
  - **Writer flag ON**: **require `activePinKid !== legacyKid`**, then emit a **v2** value `v2:<activePinKid>:…` encrypted under `getKey('pin', activePinKid)`.
  - **Never** encrypt a 3-part value with a non-legacy key; **never** emit v2 under the legacy kid.
  The flag is the load-bearing gate — `ACTIVE != legacy` alone is NOT sufficient to start writing v2 (an operator may set a non-legacy ACTIVE for read-staging without intending writes; while the flag is off those writes still go out 3-part **under the legacy key**, staying decryptable). The foundation reader build has no flag (hard-`false`) and is structurally incapable of v2. Pinned by tests: (a) explicit ring + fresh non-legacy ACTIVE + flag OFF ⇒ a 3-part value that **decrypts with the legacy key and NOT with ACTIVE**; (b) flag ON ⇒ a v2 value under ACTIVE; (c) legacy key missing while flag OFF ⇒ **fails closed**.
- **kid scheme — purpose-namespaced:** PIN keys `pin-YYYY-MM` (e.g. `pin-2026-06`), OTP keys `otp-YYYY-MM`. The resolver **rejects** a `pin-*` kid asked of the OTP ring and vice versa → PIN/OTP key confusion is **structurally impossible in code**, not operator-discipline-dependent. `legacy` is the sole exception kept in the pin ring for 3-part values.
- **kid is an index into the keyring, never key bytes** — safe to store, log, and index.

### 3.2 Envelope vs schema column — decision (Codex #2)

**Chosen: A1 inline envelope as the sole source of key identity. No `Branch.redemptionPinKeyId` mirror column. No JSON envelope.**

- **A1 pro:** zero Branch schema migration; the kid is physically bound to the bytes it describes, so a CAS update of the one opaque string atomically swaps value **and** kid together — a row can **never** carry a kid that disagrees with its ciphertext. This drift-immunity is decisive given `setBranchPin` is verified non-atomic.
- **A2 (mirror column) pro:** SQL-queryable progress. **A2 con (decisive):** the mirror is a *second* key-identity truth the retirement gate's COUNT would trust, yet the envelope is authoritative for decryption. Any write path that sets `redemptionPin` without correctly setting the mirror (a future seed, `reset-covelum-pins.ts`, a manual hotfix, a partial deploy) makes the COUNT silently under-report surviving old-kid rows → the gate passes → readable-but-uncounted old-kid values survive → become **permanently undecryptable after key removal** (silent rotate-and-brick). A2's own design concedes a full-envelope reconciliation is still needed at the gate, proving the column alone cannot be trusted — negating its observability win on Redeemo's single encrypted column.
- **Queryability recovered without the column:** progress and the retirement count derive from the **same bytes decryption uses** via `redemptionPin NOT LIKE 'v2:<activePinKid>:%'` plus durable checkpoint tallies. Forward option at very large scale: a generated/expression partial index on the key-id prefix (§6) — revisit A2 per-table only if the encrypted footprint ever grows to many tables/billions of rows.

### 3.3 Keyring + KeyProvider (B1 env-sourced; exportable-secret-manager drop-in; non-exportable KMS needs a bounded interface change — see below)

```
interface KeyProvider {
  getActiveKid(ns: 'pin' | 'otp'): string
  getKey(ns: 'pin' | 'otp', kid: string): Buffer        // AES key: HEX-DECODED 32 bytes. throws KEY_NOT_AVAILABLE
  getOtpHmacKey(kid: string): Buffer                     // OTP-HMAC keying material (see CRYPTO-1 below)
  getOtpVerifyKids(): readonly string[]                  // ORDERED OTP verify list (R2): [ACTIVE] or [ACTIVE, PREVIOUS] — never inferred from listKids
  getLegacyKid(): string
  listKids(ns: 'pin' | 'otp'): string[]                 // verify / telemetry — NOT a verify source for OTP (use getOtpVerifyKids)
}
```

- **`getOtpVerifyKids(): readonly string[]` (R2, owner-locked — explicit provider-owned previous key).** Returns the ordered OTP verification key list and **nothing else**: exactly `[ACTIVE]` when `OTP_HMAC_KEY_PREVIOUS` is unset, or exactly `[ACTIVE, PREVIOUS]` when an approved previous key is configured. `PREVIOUS` is an **explicit, operator-designated** kid (env `OTP_HMAC_KEY_PREVIOUS`, §3.4), boot-validated — **never** inferred from `listKids('otp')` (every-non-active-kid inference is explicitly forbidden, because it could silently keep an old or leaked kid valid). `getActiveKid('otp')` is `getOtpVerifyKids()[0]`. Signing uses ACTIVE only; verification iterates ONLY this list, in order. `listKids('otp')` stays a telemetry/enumeration helper and is **not** a verification source.

- **CRYPTO-1 (verified against source — load-bearing).** The 7 live OTP sites today key the HMAC with the **raw 64-hex STRING** (`createHmac('sha256', process.env.ENCRYPTION_KEY)` — the 64 ASCII hex chars are used as 64 key bytes), NOT the hex-decoded 32 bytes. AES decryption uses the decoded 32 bytes. These are different keys. Therefore `getOtpHmacKey(kid)` MUST return the **byte-identical** material the live sites use for the **bridged `otp-legacy` kid** — i.e. `Buffer.from(hexString, 'utf8')` (the ASCII hex string), so `otpHmac()` byte-equals the legacy `createHmac('sha256', ENCRYPTION_KEY)` output. (For freshly-generated OTP kids the keying form is fixed at generation and pinned by test; consistency, not the legacy quirk, is what matters going forward.) An R2 test asserts `otpHmac(c,code)` byte-equals the legacy output for the bridged kid. Without this, the "no-op bridge" is false and R2 would silently invalidate every in-flight OTP/email-verify code.
- `EnvKeyProvider` parses env **once at boot** into an immutable per-namespace `Map` (deliberate change from per-call `getKey()` — justified because a multi-entry ring must validate atomically; cost = hot-swap removed, owner-acknowledged RISK-9).
- **Swapped-ring boot guard (MF/SF):** boot validation asserts every kid in `ENCRYPTION_KEYS` matches `^(pin-|legacy)` and every kid in `OTP_HMAC_KEYS` matches `^otp-`. Without this, pasting the OTP ring JSON into `ENCRYPTION_KEYS` (and vice versa) — both valid 64-hex maps with valid ACTIVE — passes boot and matches fingerprints across services, yet silently bricks all PIN reads. The §3.1 cross-namespace resolver reject is a read-time guard; this is its boot-time twin.
- **KMS honesty (Amendment R3-#9 — narrowed claim).** `getKey(): Buffer` returns raw key bytes, which works for an env- or secret-manager-backed provider (the bytes are exportable). It is **NOT** transparently compatible with a **non-exportable** KMS (AWS KMS / GCP KMS / Vault Transit) whose whole point is that the key never leaves the HSM — you call its `Encrypt`/`Decrypt` API instead of fetching bytes. So a future non-exportable-KMS provider is **not a zero-change drop-in**: it requires a bounded **crypto-provider interface change** — replace `getKey(): Buffer` with `encryptWith(ns,kid,plaintext)` / `decryptWith(ns,kid,stored)` methods that delegate to the KMS (or use KMS-wrapped data keys), so callers never hold raw bytes. What **does** survive unchanged across that swap: the inline envelope format, the kid scheme + namespacing, the migration tool's cursor/CAS/checkpoint logic, the retirement gate, and the call-site topology (1 encrypt + 3 decrypt PIN sites + 7 OTP sites all already route through helper functions, not raw `getKey`). An exportable secret-manager (Doppler / Railway secret store) IS a drop-in via the current `getKey`. The interface-shape change is the honest cost of non-exportable KMS; it is NOT in scope now.
- **Encrypt (per the §3.1 R4-#1 lock — NOT unconditionally v2):** flag OFF ⇒ emit a 3-part value under `getKey('pin', getLegacyKid())` regardless of ACTIVE (fail closed if the legacy key is absent); flag ON (requires `activePinKid !== legacyKid`) ⇒ emit `v2:<activePinKid>:…` under `getKey('pin', activePinKid)`. Never a 3-part value under a non-legacy key. **Decrypt:** resolve by parsed kid (legacy → `getLegacyKid()`); an unknown kid → `KEY_NOT_AVAILABLE` (operational alert), never silent plaintext.

### 3.4 Environment variables + boot validation

Set **explicitly and identically on BOTH Web and Worker** (Codex #5):

| Var | Meaning |
|---|---|
| `ENCRYPTION_KEYS` | JSON map `{ "<pin-kid>": "<64-hex>", … }` (PIN ring) |
| `ENCRYPTION_KEY_ACTIVE` | active PIN kid (must exist in the map; must NOT be denylisted) |
| `ENCRYPTION_LEGACY_KID` | kid that 3-part legacy values map to (default `legacy`) |
| `OTP_HMAC_KEYS` | JSON map (OTP ring) |
| `OTP_HMAC_KEY_ACTIVE` | active OTP kid (signs new OTPs) |
| `OTP_HMAC_KEY_PREVIOUS` | **OPTIONAL** (R2, owner-locked). The single explicitly-designated verify-only previous OTP kid for a **routine** rotation overlap. Absent ⇒ `getOtpVerifyKids()` = `[ACTIVE]`. Present ⇒ `[ACTIVE, PREVIOUS]`. Boot-validated (§3.4): must be `otp-*`, present in `OTP_HMAC_KEYS`, `!= OTP_HMAC_KEY_ACTIVE`, and **not** in `DECOMMISSIONED_KIDS`. MUST be unset in legacy-bridge mode and in the compromised-key incident path (§3.6/§3.12). |
| `DECOMMISSIONED_KIDS` | comma-separated denylist of kids that can NEVER be ACTIVE or PREVIOUS (hard-blocks pasting the leaked key back as active or as a verify fallback) |
| `ENCRYPTION_V2_WRITES_ENABLED` | explicit boolean writer-format gate (Amendment #5); absent ⇒ `false`; does not exist at all in the foundation reader build |

- **Two boot modes, selected PER-NAMESPACE (Amendment #4, refined by the consistency review — resolves the `ACTIVE=legacy` contradiction AND the R2-before-R4 trap).** Each ring's mode is selected **independently** by whether *its own* map var is set — the **PIN** ring is bridged iff `ENCRYPTION_KEYS` is unset; the **OTP** ring is bridged iff `OTP_HMAC_KEYS` is unset. This is critical because R2 (OTP separation) ships BEFORE R4 (PIN keyring): in the reachable intermediate state (`OTP_HMAC_KEYS` set with a fresh active value, `ENCRYPTION_KEYS` still unset) a single global toggle would wrongly put OTP into bridge mode and synthesize the OTP ring from the **leaked** `ENCRYPTION_KEY`, ignoring the operator's fresh OTP ring and leaving the compromised key the OTP signer — defeating R2/Operation A. Per-namespace selection prevents that.
  - **(A) Legacy-bridge mode (per ring)** — that ring's map var is unset but the legacy single `ENCRYPTION_KEY` is present. The PIN ring synthesizes `{legacy: ENCRYPTION_KEY}` ACTIVE = `legacy`; the OTP ring synthesizes `{otp-legacy: ENCRYPTION_KEY}` ACTIVE = `otp-legacy`. In a bridged ring **ACTIVE == legacy/otp-legacy is VALID and expected**; the `legacy != ACTIVE` rule does **not** apply; the writer-format gate still forces 3-part PIN writes **under the legacy key** (§3.1 R4-#1). The first deploy (both rings bridged) is a **ciphertext-format / key-selection no-op** — new 3-part writes remain **format-compatible and decryptable with the legacy key** (the IV is fresh-random per write, so the bytes are NOT identical — "byte-unchanged" would be impossible — but the format + decrypting key are unchanged) and no v2 can be emitted — but **not a complete no-op** (R1 also changes Guard-10 behaviour and publishes `KeyringFingerprint` rows; fingerprint-publish failure is best-effort and does not block startup, but blocks later rotation via the migrator gate — Amendment R3-#2).
  - **(B) Explicit-keyring mode (per ring)** — that ring's map var is set. For the PIN ring, `ENCRYPTION_KEY_ACTIVE` MUST be a `pin-*` kid, present, not denylisted, and **MUST NOT equal `ENCRYPTION_LEGACY_KID`**; `ENCRYPTION_LEGACY_KID` must be present in the pin ring. For the OTP ring, `OTP_HMAC_KEY_ACTIVE` MUST be an `otp-*` kid, present, not denylisted. **If `OTP_HMAC_KEY_PREVIOUS` is set (routine-rotation overlap only), it MUST: be an `otp-*` kid (namespace containment); be present in `OTP_HMAC_KEYS`; differ from `OTP_HMAC_KEY_ACTIVE`; and NOT be in `DECOMMISSIONED_KIDS`** — any violation fails boot closed (R2, owner-locked). `getOtpVerifyKids()` is then `[ACTIVE, PREVIOUS]`; if unset, `[ACTIVE]`.
  The `legacy != ACTIVE` assertion is **explicit-mode only**, per ring. A boot test covers the **R2-live / R4-pending** state (explicit OTP ring + bridged PIN ring) asserting the fresh OTP active is honoured and the leaked `ENCRYPTION_KEY` is NOT the OTP signer.
- **Env-requirement rule (nit F10):** through the foundation + telemetry + migrator releases the new vars are **optional** and `ENCRYPTION_KEY` stays **required** (so the bridge keeps current envs working). A boot test asserts the current single-var env yields a legacy-only ring + 3-part writes. The requirement flips only at the retirement era when the bridge is no longer used.
- **Boot validation** (both modes) extends `validateRequiredEnv()` with the same fail-closed semantics: every value `^[0-9a-fA-F]{64}$`; reuse `isPlaceholder()`; reject duplicate kids; ACTIVE present in its map; ACTIVE not in `DECOMMISSIONED_KIDS`; malformed JSON crashes boot (never silent fallback); **namespace containment** — every kid in `ENCRYPTION_KEYS` matches `^(pin-|legacy)` and every kid in `OTP_HMAC_KEYS` matches `^otp-` (rejects a swapped-ring paste, §3.3); error messages name the exact missing/expected var (12 manual entries across 2 services = a typo surface). The mode-(B)-only `legacy != ACTIVE` rule above is part of this. Pinned by adversarial unit tests covering BOTH modes.
- **`OTP_HMAC_KEY_PREVIOUS` boot validation (R2, owner-locked) — fail closed.** If `OTP_HMAC_KEY_PREVIOUS` is set, boot ASSERTS all of: (i) it is an `otp-*` kid (namespace containment); (ii) it exists in `OTP_HMAC_KEYS`; (iii) it `!= OTP_HMAC_KEY_ACTIVE`; (iv) it is **not** in `DECOMMISSIONED_KIDS`. Any failure crashes boot (never silent). **In legacy-bridge mode (`OTP_HMAC_KEYS` unset) `OTP_HMAC_KEY_PREVIOUS` MUST be unset** — a previous-without-a-ring is a misconfiguration and fails boot closed (point 6). This is the ONLY source of an OTP PREVIOUS kid: `getOtpVerifyKids()` returns `[ACTIVE, PREVIOUS]` only when this validated env is present, and `[ACTIVE]` otherwise. Verification NEVER widens to other ring kids. Pinned by adversarial unit tests (set-but-not-in-ring / set==ACTIVE / set-in-denylist / set-in-bridge-mode / wrong-namespace all reject; valid PREVIOUS yields exactly the 2-element ordered list).

### 3.5 Resumable migration (C1) — no ceiling, no big tx, no full seed

- **Run host (MF F2 + Amendment #8 — corrected).** A **separate ephemeral process**, NOT an in-process BullMQ job (the worker is a long-lived daemon with no migration entrypoint; in-process would couple a migrator crash to the live worker). Two valid hosts, owner-chosen (OD8):
  - **(a) Controlled operator machine (recommended):** an authorised operator runs `npx tsx prisma/reencrypt-branch-pins.ts …` locally. **Important correction:** `railway run --service worker …` does **not** create a hosted Railway job — it injects that service's env vars into a process running **on the operator's machine**. That is acceptable IF the run is from a controlled/audited machine. The migrator then opens its own `max:2` pool (below) to the Neon **direct (non-pooled)** endpoint.
  - **(b) Actual Railway one-off deployment/job:** a temporary one-off deploy/command on Railway itself (truly hosted), inheriting the service env.
  - **Direct-DB credential path (no secret exposure):** the migrator reads `MIGRATION_DATABASE_URL` (the Neon **direct/non-pooled** endpoint string) from the chosen host's injected env / secret manager — never pasted on a command line, never committed, never logged (only `maskHost`). It is the same Neon DB as the services but the non-pooled endpoint so the `max:2` pool lands on the compute directly. The `--expect-host` exact-match gate validates it before any read/write.
- **Connection ceiling (MF F1):** the migrator builds its **own dedicated** `new PrismaPg(new Pool({ connectionString, max: 2 }))` (matching `backfill-locality-data.ts`'s explicit-Pool style) — a hard `max: 2`. The bare `PrismaPg({connectionString})` used by Web/Worker defaults node-postgres to `max: 10`, so without this the "1–2" ceiling does not exist. Because the run is a separate process, total concurrent connections against the one Neon compute = **all live service pools + the migrator's `max:2`**. In the cost-contained incident run the worker daemon is **offline** (Amendment #13), so that sum is **web pool + migrator**; a routine run with the worker live would be web + worker + migrator. §6 states this must fit the Neon compute's `max_connections` on the **direct** (non-pooled) endpoint. Explicit inter-batch delay keeps it within the Free-tier CU budget. (Drops the earlier "shares the worker's pool" framing, which was wrong for a separate process.)
- **Cursor:** Branch uuid PK ascending (deterministic; NOT `updatedAt`, which `setBranchPin` mutates). Cursor advances past skips/conflicts so the head never re-fetches forever.
- **Per batch:** `SELECT id, redemptionPin WHERE redemptionPin IS NOT NULL AND redemptionPin NOT LIKE 'v2:<activePinKid>:%' AND id > :cursor ORDER BY id ASC LIMIT :batchSize` — the NOT-LIKE gate queries the **exact bytes decryption reads** (single source of truth, no mirror to drift). `--batch-size` default 200 (range 100–1000); bounded per batch, **unbounded total** (loops until cursor exhausts the table).
- **Per row (idempotent):** parse → if `kid === activePinKid` SKIP → else decrypt under the row's kid → re-encrypt under the active kid (**fresh IV**) → CAS update (§3.7).
- **Checkpoint (durable, mandatory):** a single additive `KeyMigrationCheckpoint` row committed **after each batch** (a crash loses at most one batch). Redis rejected (volatile, shared with sessions). Optional `KeyMigrationBatch` rows for per-batch forensics.
- **Retries:** per-batch bounded exponential backoff (3 attempts) for transient Neon errors.
- **Poison rows** (decryptable under no known key): tally `decryptFailures` + id-log (never plaintext/ciphertext) + skip + **operational alert** (because Guard 10 would otherwise swallow the failure at runtime).
- **No full seed** (Codex #3): existing ciphertext migrates only via this mechanism; future seeds encrypt under the active key naturally; the full seed stays prohibited (it rewrites broad staging data).
- **Terminal success requires a final verify-zero pass + a RECONCILIATION loop (MF C3 + Amendment #11):** "cursor exhausted" is NOT success. After the cursor exhausts, the run re-runs the authoritative gate count (§8, parse-based). Crucially, a row can be re-introduced *behind* the saved cursor — e.g. a `setBranchPin` write under the old kid that landed earlier in the key-space during the run, or a CAS conflict that did not resolve to the active kid. So if the final verify-zero finds any **decryptable** non-active-kid rows, the migrator **does not stop with inaccessible residue** — it **resets to a fresh full pass** (new checkpoint generation, cursor=null) and loops until a verify-zero pass is clean. The loop ends `status='completed'` only on a clean pass. It ends `status='completed_with_residue'` (a hard retirement-gate block) **only** when the sole remaining residue is **poison** (undecryptable under any ring kid) rows in the `decryptFailures` id-log requiring out-of-band remediation (§8 item 5) — never for decryptable rows it could have re-migrated. A bounded max-pass count (e.g. 5) with escalation prevents an infinite loop under a pathological continuous old-kid writer (which would itself indicate the writer-flip was incomplete — alert). `casConflicts` are re-validated by each verify pass.
- **Single-flight (should-fix):** the runner claims the checkpoint row atomically (`updateMany WHERE jobName AND status IN (aborted, stale-by-heartbeat) SET status='running'`) or takes a Postgres advisory lock (`pg_try_advisory_lock`) for the run's lifetime, so a second concurrent process (double-launch, forward+reverse race) exits rather than rewinding the cursor / wasting CU. Single-runner-at-a-time is an invariant, tested.
- **Mid-run fingerprint re-check (should-fix + Amendments #9 / R3-#4):** because the keyring is boot-once, the runner re-reads the published `KeyringFingerprint` rows at the **top of each batch** (cheap vs a 200-row batch) and aborts cleanly (`status=aborted`) on a divergence — closing the TOCTOU where a mid-run rollback/redeploy flips ACTIVE while the migrator keeps writing a now-stale to-kid. **Asymmetric (§3.9):** the live **Web** row must be **fresh + unchanged**; the offline **Worker** is checked **value-unchanged vs the run-start snapshot** (freshness not required, so an aged offline snapshot does not abort the run). A rollback MUST stop the runner first.
- **Checkpoint tallies are best-effort (should-fix):** per-row CAS writes auto-commit individually, then the checkpoint commits separately; a crash between them double-counts the redone portion on resume (data stays safe — idempotent skip). The retirement gate therefore trusts **only** the live count + decrypt telemetry, never the checkpoint tallies; tallies are progress/forensics only.
- **Migration-apply ordering + write-guard self-check (should-fix):** the additive `KeyMigrationCheckpoint` migration is applied (`prisma migrate deploy`) and the table's existence verified BEFORE the R4 image deploys (else the first checkpoint write throws relation-does-not-exist). The migrator's startup writes+rolls-back a no-op checkpoint row to prove the write-guard allow-list matches the real Prisma model name before processing batch 1.
- **No seed/reset PIN-writes during the window (should-fix):** no `seed.ts` / `reset-covelum-pins.ts` (or any `redemptionPin` writer) may run against a served DB between migration start and retirement-gate completion — during a partial rollback they would write old-kid values behind the cursor and silently re-introduce old-kid rows. The dev scripts refuse when a `KeyMigrationCheckpoint` row with `status IN (running, observing)` exists for that DB.

### 3.6 OTP-HMAC key separation (Codex #9)

- Dedicated OTP ring (`OTP_HMAC_KEYS` + `OTP_HMAC_KEY_ACTIVE`) with `otp-*` kids; cross-namespace lookups rejected. Replace all **7** `createHmac` sites with **two** helper entrypoints over the OTP ring (byte-correct keying per CRYPTO-1, §3.3):
  - **`otpHmacSign(challenge, code)`** — used by the **4 SIGN/issue sites** (`admin:56`, `merchant:116`, `merchant:573`, `merchant:747`). Signs under **ACTIVE only** = `getOtpHmacKey(getActiveKid('otp'))`. PREVIOUS is **never** a signing key.
  - **`otpHmacVerify(challenge, code, storedHmac)`** — used by the **3 VERIFY sites** (`admin:117`, `merchant:178`, `merchant:675`). Recomputes the HMAC under **each kid in `getOtpVerifyKids()`, in order** (`[ACTIVE]` or `[ACTIVE, PREVIOUS]`), and returns true on the first `timingSafeEqual` match. It iterates ONLY that provider-owned ordered list — it **never** widens to `listKids('otp')` or any other non-active kid. (A single `otpHmac(challenge, code)` that returns ACTIVE's digest is acceptable as the sign primitive; verification MUST go through the ordered-list verifier — one unified helper that always returns only ACTIVE cannot satisfy the verify-PREVIOUS contract.)
  - Enforcement is an **allowlist** (only `keyring.ts` / the boot bridge may read `process.env.ENCRYPTION_KEY` / `ENCRYPTION_KEYS`), pinned by a CI test — stronger than a denylist grep that `const k = process.env.ENCRYPTION_KEY` trivially evades.
  - **Dev/test bypass UNCHANGED (point 9, owner-locked):** the existing admin + merchant development/test OTP bypass (`code === '000000'`, gated to the env allowlists `MERCHANT_OTP_DEV_BYPASS_ENVS` / the admin equivalent) is preserved exactly and stays **separately guarded** — it is independent of the HMAC sign/verify path and must NOT be folded into `otpHmacVerify`.
- **Cutover with a verify-only previous — ROUTINE ROTATION ONLY, explicit + provider-owned (MF4 + Amendment R3-#7 + R2-#1 owner-lock):** in a **routine** OTP rotation the operator sets `OTP_HMAC_KEY_ACTIVE` to the **fresh** kid AND `OTP_HMAC_KEY_PREVIOUS` to the **single** outgoing kid (both `otp-*`, both present in `OTP_HMAC_KEYS`, distinct, neither denylisted — §3.4). `getOtpVerifyKids()` then returns `[ACTIVE, PREVIOUS]`, so in-flight codes signed under the outgoing kid still verify. The overlap lasts **no longer than the longest HMAC-challenge TTL (24h, `EMAIL_VERIFY_TTL`; the login-OTP challenge is only 10 min)**; after the window a follow-up config change **unsets `OTP_HMAC_KEY_PREVIOUS`** (and the retired kid is moved to `DECOMMISSIONED_KIDS`), returning verification to `[ACTIVE]`-only. PREVIOUS is **exactly one** kid, **never** "every non-active ring key". **This overlap applies ONLY to routine rotation. The compromised-key INCIDENT path (this staging case) does the OPPOSITE: `OTP_HMAC_KEY_PREVIOUS` stays UNSET, the leaked `otp-legacy` key is NOT accepted as a fallback, and outstanding staging OTP/email-verification challenges are invalidated immediately (staging is offline, no legitimate in-flight codes to protect), per §3.12/§12.** PIN rotation alone does **not** fix OTP forgeability — setting a fresh OTP active value is an explicit, enforced step in both tracks.
- **Source/spec cross-check — the 7 OTP-HMAC sites under R2 (verified against `main` @ `b66b0f95`):**

  | Site | Flow | Role | New entrypoint | Keys used | Challenge TTL |
  |---|---|---|---|---|---|
  | `admin/service.ts:56` | admin login-OTP | SIGN | `otpHmacSign` | ACTIVE only | 600s (`OTP_CHALLENGE_TTL`) |
  | `admin/service.ts:117` | admin login-OTP | VERIFY | `otpHmacVerify` | `getOtpVerifyKids()` ordered | 600s |
  | `merchant/service.ts:116` | merchant login-OTP | SIGN | `otpHmacSign` | ACTIVE only | 600s |
  | `merchant/service.ts:178` | merchant login-OTP | VERIFY | `otpHmacVerify` | `getOtpVerifyKids()` ordered | 600s |
  | `merchant/service.ts:573` | merchant email-verify (register) | SIGN | `otpHmacSign` | ACTIVE only | 86400s (`EMAIL_VERIFY_TTL`) |
  | `merchant/service.ts:675` | merchant email-verify (register + resend) | VERIFY | `otpHmacVerify` | `getOtpVerifyKids()` ordered | 86400s |
  | `merchant/service.ts:747` | merchant email-verify (resend) | SIGN | `otpHmacSign` | ACTIVE only | 86400s |

  4 SIGN + 3 VERIFY across 3 challenge types; longest TTL = **24h** (bounds the routine PREVIOUS overlap). All currently `createHmac('sha256', process.env.ENCRYPTION_KEY).update(challenge + ':' + code)`; comparison is `timingSafeEqual` on hex-decoded buffers (length-checked first); the stored HMAC is a transient SHA-256 hex digest in Redis (`codeHmac`), single-use, never persisted to the DB, never the plaintext code. The bridged `otp-legacy` key byte-matches today's output (CRYPTO-1, §3.3), so the R2 swap is a behaviour no-op while `OTP_HMAC_KEYS` is unset.

### 3.7 Concurrency — compare-and-set (Codex #1)

Branch has no version column; the **original ciphertext string is the optimistic token** (unique per write because the 12-byte IV is fresh-random per encrypt — load-bearing invariant, §3.1 / RISK-4).

```
const res = await prisma.branch.updateMany({
  where: { id: row.id, redemptionPin: row.originalCiphertext },
  data:  { redemptionPin: reEncrypted },
})
if (res.count === 1) migrated++
else casConflicts++   // a concurrent setBranchPin already wrote an active-kid value; skip, don't clobber, don't block
```

`updateMany` (returns `{count}`) is used deliberately — `update()` throws on a 0-match. Safe with no version column + the live non-atomic `setBranchPin` because: once the writer-flip ships, `setBranchPin` emits `v2:<activePinKid>`; (a) if it lands between our read and CAS, our WHERE matches 0 rows and we skip (the row is already active-kid); (b) if after our update, it re-encrypts the same PIN under the active key — still active-kid, still correct. The migration only ever rewrites the **exact bytes it read**, never clobbering a fresher merchant PIN. This holds for **both** live writers (`branch/service.ts:1368` and `auth/merchant/branch-user.service.ts:273`) because both emit active-kid ciphertext via the shared `encrypt()`. **`setBranchPin` is unchanged** (Codex #4): PIN update + `writeAuditLog` stay separate, non-atomic.

**IV-as-CAS structural guard (RISK-4, should-fix).** The CAS token's uniqueness and GCM nonce-safety both rest on a fresh-random 12-byte IV per encrypt. This is enforced **structurally**, not by convention: `encryptWith` physically generates the IV via `crypto.randomBytes(12)` and exposes **no `iv` parameter**, so no current or future provider/KMS path can inject a deterministic/counter IV (which would break both the CAS token and GCM nonce-uniqueness simultaneously). Pinned by a test asserting two encrypts of the same plaintext+key never collide.

### 3.8 Rollback (4 tiers; no full-DB restore — Codex #7/#8)

Works because both keys stay in the ring **and** the envelope is self-describing, so any mix of kids stays readable.

0. **Code-rollback safety:** because the v2-capable reader lands on BOTH services first and v2 writes are forbidden until the reader is universal, a Railway redeploy-previous-image is **only** safe while no v2 row exists. After v2 writes begin, the rollback target is the reader-capable image, **never** the pre-format image.
1. **Safe-abort mid-migration:** set checkpoint `status=aborted`, stop the runner; rows are a readable mix; reads keep working; re-run resumes from the cursor.
2. **Flip-active-back — ROUTINE ROTATION ONLY (Amendment #7).** Set `ENCRYPTION_KEY_ACTIVE` to the previous kid on BOTH services + redeploy; new writes return to the old kid; already-migrated rows still decrypt; no data rewrite. **This tier is FORBIDDEN in an incident rotation:** a compromised previous kid is placed in `DECOMMISSIONED_KIDS` from the moment compromise is known, so re-activating it **fails closed at boot** by design — a compromised key must *never* become ACTIVE again. Emergency incident rollback is tier 1 (safe-abort) and/or fix-forward (generate a *new, uncompromised* kid and re-flip forward), **not** re-activation of the leaked key.
3. **Reverse-migration — ROUTINE ROTATION ONLY, fail-closed (Amendment R3-#5).** Run the same tool with `--reverse` targeting `activePinKid = previous (uncompromised) kid` (symmetric, resumable, idempotent, no full restore). `--reverse` **fails closed** — refusing to run — when ANY of: (a) the target kid is in `DECOMMISSIONED_KIDS`; (b) the run is **incident-mode**; (c) the target kid is **absent** from the ring or **not an approved routine-rotation previous key** (i.e. not the immediately-preceding non-compromised ACTIVE). A compromised/denylisted key can therefore never become a migration target or ACTIVE again. Pinned by tests for each refusal condition.

**Routine vs incident split (Amendment #7):** routine (non-compromise) rotation may flip-back / reverse-migrate to the previous key because it is trusted. Incident rotation may not — recovery is forward-only to a fresh kid. A whole-DB snapshot/PITR restore is **not** a valid rollback after live concurrent writes in either case (it discards new PINs/activity).

### 3.9 Web/Worker consistency + parity fingerprint (Codex #5)

- All key env vars set identically on BOTH services; a change takes effect on a service only on **that** service's redeploy.
- **Parity fingerprint — ONE canonical formula (MF/should-fix; it was described three inconsistent ways in the draft):**
  ```
  keyHash(ns,kid,keyBytes) = sha256('redeemo-keyring-v1:' + ns + ':' + kid + ':' + keyBytes)   // domain-separated, delimited
  fingerprint = sha256( JSON.stringify({
    codeCapability: 'v2-reader-v1',                 // proves reader-capable CODE, not just env parity
    active: { pin: activePinKid, otp: activeOtpKid },// proves WHICH kid is active (an ACTIVE divergence must mismatch)
    keys: sortedBy(kid)([ { ns, kid, keyHash } ]),
  }) )
  ```
  The domain-separated `keyHash` (not a bare `sha256(keyBytes)`) avoids turning the "non-secret" fingerprint into an offline per-key confirmation oracle. **Including the active kids is required** — otherwise two services holding the same keys but a different ACTIVE would produce an identical fingerprint and silently pass the runner gate (the very parity property it exists to guarantee). This identical formula is used in §3.11, §5, and the R1 test.
- **Fingerprint publication — a DURABLE DB TABLE, NOT an HTTP endpoint (Amendment #9).** `ops:keyring` does not exist in the codebase, and requiring the migrator to call an admin HTTP endpoint would force a reusable high-privilege credential into the migrator — both rejected. Instead each service writes its fingerprint to a small additive `KeyringFingerprint` table (`{ service, fingerprint, codeCapability, bootedAt, lastSeenAt }`, §5) — **the table is created + applied in R1** (Amendment R3-#1), since R1 both publishes and gate-checks it — at boot **and** on a periodic `lastSeenAt` refresh. The migrator already has DB access, so it reads parity **directly from the table** — no HTTP, no admin credential, no reusable secret. (A human-readable admin inspection endpoint is **optional / deferred**; if ever added it maps to an existing admin gate — the actual capability/plugin files + tests to be confirmed at implementation — and exposes only the digest + active-kid labels, never the per-kid keyHash list. The migrator does not depend on it.)
- **Worker parity WITHOUT starting the Neon-burning sweeps (Amendment #13 — cost containment).** The worker must stay **offline** (its 60s/hourly BullMQ sweeps are the Neon CU burn). A dedicated **`--verify-keyring-and-exit`** mode — a short-lived process launched with the *worker service's* env — computes and publishes the worker's `KeyringFingerprint` row and exits **without registering any BullMQ worker or repeatable**. This yields worker-env parity proof with zero sweep activity; **worker restart is NOT a prerequisite** for any flip/verify/removal. (The same `verify-keyring-and-exit` is the parity primitive Web uses too if a Web restart is undesirable.)
- **Runner precondition + per-batch recheck — Web freshness vs Worker run-bound snapshot (Amendment R3-#4).** At start the runner refuses unless its own freshly-computed fingerprint contains both the from-kid and to-kid AND matches BOTH published `KeyringFingerprint` rows, with **asymmetric freshness** (the Worker is intentionally offline, so requiring its row to be *fresh* every batch would falsely abort a long run):
  - **Web** (live): row must be **fresh** (`lastSeenAt` within the heartbeat threshold) AND match value + `codeCapability`, re-checked at the top of **every** batch.
  - **Worker** (offline): the runner **captures the Worker's published fingerprint VALUE at run-start** as a **run-bound snapshot** (recorded in the checkpoint). Each batch re-checks that the Worker row's **value is unchanged** from that snapshot — freshness/`lastSeenAt` is **NOT** required (an aged offline snapshot is fine). If the Worker fingerprint VALUE changes mid-run (someone redeployed/reconfigured the Worker), **abort**; if the Worker row is **missing at run-start**, **refuse to start** (require a `--verify-keyring-and-exit` publish first). A safe `--verify-keyring-and-exit` probe may refresh the Worker snapshot without starting BullMQ/sweeps.
  - A missing/stale **Web** row, a `codeCapability` mismatch on either, or a Worker-value change is a **hard stop** (not "retry"). Pinned by tests: aged-but-unchanged Worker snapshot ⇒ continue; Worker value changes ⇒ abort; Worker snapshot missing at start ⇒ refuse; stale Web row ⇒ abort. Web heartbeat requirements are NOT weakened.
- **Writer-flip is self-gating in code via the explicit flag (Amendment #5), not merely `ACTIVE != legacy`:** `encrypt()` emits v2 only when `ENCRYPTION_V2_WRITES_ENABLED === true` AND `activePinKid !== legacyKid`; otherwise it emits **3-part under the legacy key** (§3.1 R4-#1 — never under a non-legacy ACTIVE). The foundation reader build has no flag at all (hard-wired off), so it is structurally incapable of emitting v2 regardless of env. Combined with reader-everywhere-first, a service still on the pre-foundation image (or a half-rolled deploy, or a non-legacy ACTIVE set for read-staging) cannot emit a v2 value an old reader can't parse. Pinned by a writer-flip-release test.
- **Reader-before-writer ordering (hard invariant):** transient disagreement during a rolling deploy is safe for *kid resolution* (both kids in both rings, self-describing envelope) but **not** for the *format* change (old code cannot parse v2 at all). Order: (1) deploy both-format reader to BOTH services, ACTIVE unchanged, verify identical published fingerprint; (2) flip ACTIVE / enable `ENCRYPTION_V2_WRITES_ENABLED` on BOTH, verify; (3) run migration once as a **separate ephemeral process** (worker daemon stays offline, Amendment #13); (4) observation + telemetry; (5) remove old kid on BOTH (owner-gated operation), verify absence on both.

### 3.10 Guard-10 hardening + decrypt telemetry (RISK-1 — highest-value cross-cutting fix)

- **Decrypt telemetry — concrete definition (Amendment #2).** Designed so retirement rests on *positive proof of non-use*, fail-safe (missing telemetry blocks retirement):
  - **What is recorded:** only **non-active-kid (fallback) decrypts** — i.e. any decrypt resolving to the legacy kid or a deprecated kid — plus `KEY_NOT_AVAILABLE` events. Active-kid decrypts (the common case) are NOT per-event persisted (would be hot-path heavy); they are irrelevant to the gate. Fallback decrypts are rare by construction (≈0 after migration), so the durable write cost is negligible.
  - **Storage + schema:** an additive DB table `KeyDecryptTelemetry { id, service ('web'|'worker'|'migrator'), kid, count BigInt, firstSeenAt, lastSeenAt }` with `@@unique([service, kid])`. On a fallback decrypt the site does an atomic upsert-increment (`INSERT … ON CONFLICT (service,kid) DO UPDATE SET count = count+1, lastSeenAt = now()`). DB-backed (not in-memory) so it survives redeploys / Neon scale-to-zero. NEVER stores plaintext/ciphertext/key (kid only).
  - **Cross-service aggregation:** Web and Worker write rows tagged by `service`; the gate **sums across all services** for kid `K`. Because Web and Worker are separate processes, a per-process in-memory counter would miss one — the shared table is the aggregation point.
  - **Liveness / reset / gap detection (reconciled with worker-offline, Amendment #13):** a `KeyringTelemetryHeartbeat { service, codeCapability, lastBeatAt }` row is written at boot and every ≤5 min by each **service that is supposed to be live**. The liveness predicate is defined over **that** set, not all services. In the cost-contained incident run the **worker is intentionally offline**, so the continuously-heartbeating expected set = **the live web service only**; the worker contributes its `KeyDecryptTelemetry` + a fingerprint/heartbeat **snapshot** via `--verify-keyring-and-exit` at window-open and again at retirement — NOT a continuous beat (a missing continuous worker beat is therefore NOT treated as a gap). The gate requires a *continuous* heartbeat from the expected-live set across the **entire** window (no gap > a threshold) with the telemetry-emitting `codeCapability`. A gap in an expected-live service, a missing expected row, a `count` that went backwards (table truncated/restored), or a stale `codeCapability` ⇒ unobserved interval ⇒ **fail-safe BLOCK**. (For a routine run with the worker live, the worker IS in the expected-live set.) A test pins "worker offline by design ⇒ not a heartbeat gap."
  - **Failure behavior:** the hot-path upsert is **best-effort** — a telemetry write failure must NEVER fail a redemption (it logs+alerts and proceeds). But the **retirement gate is strict**: absent/gapped/stale telemetry blocks retirement (the authoritative leg remains the per-DB parse-based count §8 item 1; telemetry is the corroborating *non-use* proof — both are required).
  - **Retention:** telemetry + heartbeat rows are retained through the full rotation lifecycle as retirement evidence; no auto-prune while any `KeyMigrationCheckpoint` for that ring is non-terminal.
  - **Observation baseline (Amendment R3-#3 — `KeyDecryptTelemetry.count` is CUMULATIVE).** Because the counter is cumulative, "flat at zero" cannot mean *absolute* zero: fallback decrypts that legitimately occurred BEFORE the observation window (e.g. during the dual-read migration itself) leave the counter non-zero forever. The retirement condition is therefore **zero counter INCREASE from a recorded baseline**, not an absolute zero. At observation-window open the operator opens a durable `KeyRetirementObservation` record:
    ```prisma
    model KeyRetirementObservation {
      id                 String   @id
      retiringKid        String                  // the exact kid K being retired
      observationStartAt DateTime
      baseline           Json                    // per-service KeyDecryptTelemetry.count for retiringKid at start
      expectedServices   String                  // the expected-live service set (e.g. ["web"]; worker offline by design)
      codeCapability     String                  // the reader/telemetry capability that must hold throughout
      fingerprint        String                  // the KeyringFingerprint digest that must hold throughout
      status             String   @default("observing")  // observing | passed | blocked
      completedAt        DateTime?
    }
    ```
    **Pass condition (all of):** for each expected service, `current count(retiringKid) - baseline == 0`; **no reset / backwards count** (a `count` below baseline ⇒ table truncated/restored ⇒ BLOCK); **no heartbeat gap** in any expected-live service across `[observationStartAt, now]`; **no change** to `expectedServices`, `codeCapability`, or `fingerprint` during the window (any change re-baselines / restarts the window). Missing telemetry, a missing expected-service row, or a stale capability ⇒ fail-safe **BLOCK**. The offline worker contributes its `KeyDecryptTelemetry` snapshot + fingerprint via `--verify-keyring-and-exit` at window-open and at retirement (its pre-window-open count folds into the baseline; it is NOT an expected continuous heartbeater).
- Harden the Guard-10 try/catch (`redemption/service.ts:284–295`) (should-fix — the design introduces a new parse-error class). **Corrected per the Codex re-review:** the submitted PIN is compared to the decrypted plaintext AFTER decryption succeeds, so it is NEVER a decryption input — therefore a decrypt() throw is ALWAYS a server/data fault, never a user wrong-PIN. Every decrypt-failure bucket fails closed **loudly** (controlled AppError + redacted alert) and NEVER increments the wrong-PIN counter: (a) `KEY_NOT_AVAILABLE`/keyring error → alert + loud; (b) `ENVELOPE_PARSE`/format error ("Invalid encrypted value format") → alert (distinct data-integrity severity) + loud; (c) `GcmAuthError` (the STORED ciphertext failed AES-GCM authentication: wrong key bytes / tampering / corruption) → alert + loud `REDEMPTION_PIN_UNREADABLE` (silencing it would convert a branch data fault into a user lockout — the silent branch outage R1 prevents); (d) any other/unexpected error → alert + loud. The **only** silent `INVALID_PIN` (and the only path that increments the failure counter) is a SUCCESSFUL decrypt whose plaintext differs from the submitted PIN. Without (b)/(c) being loud, a malformed/unauthenticated value would silently brick that branch's redemptions with no signal. All buckets pinned in the R1 test (Guard-10 moved into R1 per Amendment #1).
- **Request-path logging redaction (should-fix).** Two of the three live decrypt sites (`getBranchPin`, `sendBranchPin`) call `decrypt()` **outside** any try/catch, and the global handler does `app.log.error(error)` (Fastify `logger:true`, no redact paths). A new `decryptEnvelope`/keyring throw must therefore carry **no** `stored`/plaintext/key bytes in its message (every new error is built from kid + branch id + counts only). `KEY_NOT_AVAILABLE` gets an `ERROR_DEFINITIONS` entry so it maps to a controlled client envelope rather than a raw 500. The redaction test exercises the **request path** (invoke `getBranchPin`/`sendBranchPin` against an unknown-kid row; assert the captured `app.log.error` payload contains no ciphertext/key/plaintext). Pino `redact` paths added as defence-in-depth.

### 3.11 No-secret-logging (the incident's root cause)

Never log plaintext PINs, key bytes, raw ciphertext, or full envelopes — anywhere in the migrator, decrypt-fallback telemetry, or counters. Only branch uuid + kid + masked host + counts. The keyring fingerprint uses the **single canonical formula defined in §3.9** (domain-separated `keyHash` = `sha256('redeemo-keyring-v1:'+ns+':'+kid+':'+keyBytes)` over a sorted set + active kids + codeCapability) — there is **exactly one** fingerprint formula in this spec, in §3.9; the earlier stale `sha256(kid + sha256(keyBytes))` wording is removed (Amendment #10). The fingerprint never contains key bytes. Enforced by a **logging-redaction test**, not prose.

### 3.12 Routine rotation vs compromised-key incident rotation (Amendment #6 — two distinct modes)

The same mechanism serves both, but the *retention/timing/rollback* policy differs sharply. The staging exposure is an **incident** rotation.

| Aspect | Routine rotation (non-compromise) | Incident rotation (key known-compromised — THIS staging case) |
|---|---|---|
| OTP previous-key carry | Set `OTP_HMAC_KEY_PREVIOUS` to the single outgoing kid → verify-only for ≥ the max TTL (24h) so in-flight codes verify (§3.6) | **`OTP_HMAC_KEY_PREVIOUS` stays UNSET.** Do NOT preserve the leaked OTP value. Staging is **offline**, so there are no legitimate in-flight challenges to protect — **invalidate outstanding challenges immediately** (`getOtpVerifyKids()` = `[ACTIVE]`; no dual-verify window; the leaked `otp-legacy` is never a fallback). |
| PIN old-key retention | Old kid stays in the ring through the full ≥14d observation window + backup-retention horizon (§8) | Retain the compromised PIN kid **only for the minimum migration interval** — just long enough to enumerate + migrate + verify every served DB — then remove **promptly**. The generic 14-day *live-key* observation does NOT apply to a known-compromised key (every extra day is extra exposure). |
| Removal trigger | The full §8 gate (incl. ≥14d soak) | Migration + verify-zero complete on every served DB ⇒ remove from live keyrings promptly. |
| Old backups/snapshots | Covered by the observation-window-≥-retention-horizon rule (§8 item 3) | Handled by a **separate offline recovery policy** (below) — NOT by keeping the live key around for the retention horizon. |
| Flip-back / reverse-migration | Allowed (previous key trusted) | **Forbidden** — the compromised kid is in `DECOMMISSIONED_KIDS` from the moment compromise is known; recovery is forward-only to a fresh kid (§3.8). |

- **Compromised-key denylist-from-the-start:** in an incident rotation the leaked kid is added to `DECOMMISSIONED_KIDS` the moment compromise is known, so it can never be set ACTIVE again (boot fail-closed) even before it is removed from the ring.
- **Offline-backup recovery policy (incident):** because a pre-flip backup/PITR snapshot still contains rows readable by the compromised key, the incident path does **not** keep the live compromised key for the retention horizon. Instead: (i) document that any restore of a pre-flip snapshot is an *offline recovery operation* that must immediately re-run the migration before the restored DB is served, and (ii) where the provider allows, **delete/expire pre-flip snapshots** after migration so no compromised-key-readable restore point persists. This bounds incident exposure to the minimum migration interval, not the (much longer) backup horizon. (Routine rotation, with a trusted previous key, can afford the longer horizon — §8 item 3.)

---

## 4. Owner decisions

| ID | Decision | Recommendation | Why |
|---|---|---|---|
| **OD1** | Envelope vs mirror column | **A1 inline envelope, no column** | Drift-immune under non-atomic `setBranchPin`; queryability recovered via NOT-LIKE + checkpoint; a mistrusted mirror can silently brick PINs at retirement (§3.2) |
| **OD2** | When to add OTP key separation | **OTP-first, its own early release (R2, depends on R1), fresh active value** | OTP HMACs are transient → cut over with no migration; fastest, lowest-risk neutralisation of the leaked key on the integrity path (§3.6) |
| **OD3** | KMS provider + timing | **Env keyring now behind KeyProvider; defer KMS vendor + funding** | Neon stays Free. An **exportable** secret-manager is a constructor swap; a **non-exportable** KMS needs a bounded crypto-provider interface change (`encryptWith`/`decryptWith` delegation, not `getKey():Buffer`) — honest cost, not in scope now (§3.3/§10) |
| **OD4** | Rotate leaked staging key before or after the build | **After the build; staging is the first rehearsal of the standing runbook, on the incident track** | The fix must be the production mechanism, not a one-off. New *writes* under the leaked key stop at the flip, but full containment is migration + prompt incident-removal (§3.12/§12); a flip alone is not containment (OC2) |
| **OD5** | Observation-window length (ROUTINE rotation) | **≥ 14 days with the legacy-fallback decrypt counter at zero increase from baseline, AND ≥ the backup/PITR retention horizon** | Captures long-idle merchants; retirement is irreversible (§8). **Does NOT apply to a compromised key** — incident rotation retains the old kid only for the minimum migration interval (§3.12) |
| **OD6** | Checkpoint storage | **`KeyMigrationCheckpoint` DB table** | Redis is volatile/shared; a worker restart or Neon scale-to-zero mid-run must resume from a committed cursor (§3.5) |
| **OD7** | Batch size + throttle | **Batch 200, dedicated `max:2` pool, explicit inter-batch delay; finalise after confirming the real Branch count** | The migrator's own pool + the live sweeps must fit the Neon compute's `max_connections`; a hard ceiling + delay protects sweeps + Free-tier CU (§6) |
| **OD8** | Migration execution host (Amendment #8) | **Controlled operator machine running the migrator against the Neon direct endpoint (recommended)** vs a Railway one-off deployment/job | `railway run` executes locally, not as a hosted job; either is valid if the host is controlled/audited and the direct-DB credential is injected, never pasted/logged (§3.5) |

---

## 5. Schema changes

- **NONE on `Branch`.** `redemptionPin` stays `String?`; version + kid live inside the value (inline envelope). No mirror column, no version column.
- **ONE additive table** (mandatory, resumable progress + audit):
  ```prisma
  model KeyMigrationCheckpoint {
    id            String   @id
    jobName       String   @unique
    namespace     String
    fromKids      String
    toKid         String
    cursor        String?
    scanned       BigInt   @default(0)
    migrated      BigInt   @default(0)
    skipped       BigInt   @default(0)
    casConflicts  BigInt   @default(0)
    decryptFailures BigInt @default(0)
    status        String   @default("running")
    lastError     String?
    startedAt     DateTime @default(now())
    updatedAt     DateTime @updatedAt
    finishedAt    DateTime?
  }
  ```
- **OPTIONAL additive table** `KeyMigrationBatch { id, jobName, batchSeq, startId, endId, attempted, migrated, casConflicts, failed, attemptCount, durationMs, completedAt, @@index([jobName, batchSeq]) }` — per-batch forensics.
- **Additive `KeyringFingerprint` — created + applied in R1 (Amendment R3-#1):** `{ id, service @unique, fingerprint, codeCapability, bootedAt, lastSeenAt }`. R1 publishes these rows and R1's deploy gate reads them, so the migration MUST land in **R1** (applied before the R1 image deploys), not R3/R4. Each service (and `--verify-keyring-and-exit`) writes its row; the migrator reads parity directly (no HTTP, no admin credential).
- **Additive `KeyDecryptTelemetry`** (Amendment #2 — created in **R3**): `{ id, service, kid, count BigInt @default(0), firstSeenAt, lastSeenAt, @@unique([service, kid]) }` — fallback-decrypt counts summed across services for the retirement gate.
- **Additive `KeyringTelemetryHeartbeat`** (Amendment #2 — created in **R3**): `{ id, service @unique, codeCapability, lastBeatAt }` — liveness so a zero-increase-from-baseline reading means "observed", not "recorder was down".
- **Additive `KeyRetirementObservation`** (Amendment R3-#3 — created in **R3**): the durable observation-baseline record (schema in §3.10) the retirement gate compares against.
- **Per-release migration application:** `KeyringFingerprint` → R1; `KeyDecryptTelemetry` + `KeyringTelemetryHeartbeat` + `KeyRetirementObservation` → R3; `KeyMigrationCheckpoint` (+ optional `KeyMigrationBatch`) → R4. Each is applied via `prisma migrate deploy` on the Neon **direct** endpoint **before** that release's image deploys.
- No change to `VoucherRedemption` / OTP storage (OTP HMACs stay transient in Redis).
- All migrations **additive-only**, manual `prisma migrate deploy` per the shared Neon DB; no Procfile release line; no destructive column ops.

---

## 6. Performance model

Assumptions: ~33-col Branch, one encrypted column, realistic production Branch count far below 1M; fresh IV per encrypt; the migrator is a **separate ephemeral process** (not in-process) with its **own dedicated `max:2` pool** (§3.5), so total concurrent connections on the one Neon compute = all live service pools + 2 — **web pool + 2** in the cost-contained incident run (worker offline, Amendment #13), or web + worker + 2 in a routine run — which must fit the compute's `max_connections` on the **direct** (non-pooled) endpoint; Neon Free scale-to-zero (kept warm by the existing sweeps); `setBranchPin` is a rare merchant action so CAS conflicts are sparse. **Caveat (F4):** the verify-zero `NOT LIKE` is a non-sargable sequential scan on an unindexed encrypted column, run ×3 across the window — negligible at realistic Branch counts, but a generated/expression partial index on the kid prefix should be added before any >100k-row run (it tensions with "no Branch schema change" — an index is additive and acceptable; revisit at that scale). The ~16 seeded `isTestData` branches (all PIN `1234`) **are in scope** for migration + verify-zero (no `isTestData` filter, unlike `recompute-counts.ts`). The `KeyMigrationCheckpoint` DDL runs on the Neon **direct** endpoint.

| Scale | Behaviour |
|---|---|
| **100 rows** | One ~200-row batch, sub-second; verify-zero NOT-LIKE scan instant; decrypt hot-path adds one `split` + a Map lookup vs today's per-call `getKey()`; CAS conflicts ≈ 0 |
| **10,000 rows** | ~50 batches; each = 1 indexed PK SELECT + ≤200 single-row CAS + a checkpoint commit; seconds-to-low-minutes, dominated by Neon round-trips not crypto; bounded memory (one batch in RAM) |
| **1,000,000 rows** | ~5,000 batches (beyond a realistic Branch count; included for proof). Fully resumable: a crash / scale-to-zero / restart resumes from the committed cursor — no restart-from-zero, no giant transaction (which would blow CU + lock the table). Throughput round-trip-bound; run with the 1–2-conn ceiling + inter-batch delay. The verify-zero NOT-LIKE scan is sequential at 1M (accepted, throttled, off the request path; a generated/expression partial index is the forward option if the encrypted footprint grows). Decrypt hot-path stays O(1) per redemption regardless of table size |

**Scale claims are ESTIMATES, not measured (Amendment #14).** The wall-clock figures above are reasoned estimates, not benchmarks. Before any run materially larger than the current (~tens of) Branch rows — and as a hard gate before a >100k-row production run — the plan requires: (1) a synthetic-row **benchmark** at 100/10k/100k on a loopback fixture measuring real batch latency + CU; (2) an `EXPLAIN (ANALYZE)` **query-plan check** on the batch SELECT + the verify-zero scan (to confirm the indexed PK cursor and to size/justify the expression index); (3) a **load test** confirming the migrator's `max:2` pool + inter-batch delay does not starve the live sweeps or breach the Neon compute's `max_connections`. No production throughput is claimed until these pass.

---

## 7. Procedures (staging / production / DR) — runbook content (telemetry+runbook release; see plan §Programme, Amendment #1 reorder)

- **Rotation:** generate fresh kid → add to ring on BOTH services (PENDING) → verify identical published fingerprint → flip ACTIVE on BOTH → run migration as a **separate ephemeral process** (worker offline) → observation + telemetry → owner-gated removal (Operation B).
- **Rollback:** the 4 tiers (§3.8). PITR is **not** a valid rollback after live writes.
- **DR:** every served DB (production, staging, every read replica, any DR/PITR copy that could be promoted) must independently pass the retirement gate. **Restoring a pre-retirement DR snapshot after key removal resurrects old-kid values needing the removed key → bricks those PINs.** The runbook states this explicitly.
- **Per-service config:** all key env vars set identically on Web + Worker; fingerprint parity verified before any flip or removal.

---

## 8. Retirement gate (Codex #7) — owner-gated provider operation (Amendment #12)

Retirement is **not** a Git "config-only PR" — removing a kid is a change to **Railway environment variables on each service**, which Git does not track. It is modelled as an **owner-gated provider operation**: the owner edits the Railway env on both services (remove kid `K` from `ENCRYPTION_KEYS`, add to `DECOMMISSIONED_KIDS`), with **reviewed evidence attached** (the gate checklist below, per served DB) and a **runbook/status commit** to the repo recording that the operation was performed, when, by whom, and against which evidence. The Git artifact is the evidence/status record; the actual removal is the provider operation.

All of, as a checklist:

1. **Zero rows OF THE SPECIFIC KID `K` BEING RETIRED on EVERY served DB (MF RG-2 — positive, kid-specific, parse-based).** Not the indirect "everything is the active kid" form (which inverts under a tier-2 rollback that makes the old kid active again). The authoritative pass condition: for the exact kid `K` being retired (legacy `K` = the 3-part no-prefix shape), the count of `Branch` rows whose **parsed** kid `== K` must be 0 on every served DB. The indexed `NOT LIKE` is a cheap **filter** only; the **gate** parses each surviving candidate via `parseEnvelope` (a prefix string match does not prove decryptability — a row with the active prefix but corrupt bytes still matches `LIKE`). Additionally assert `K != getActiveKid('pin')` and `K != getActiveKid('otp')`, and that the active kid used to compute the gate equals the active kid deployed on BOTH services (fingerprint cross-checked). Operation B fails closed if the named removal kid is the active kid or was not the kid the gate measured.
2. **Repeated verification:** passes on ≥ 3 separate runs spaced across the window (catches a long-idle merchant whose branch only decrypts on a redemption attempt).
3. **Observation window covers the BACKUP/PITR RETENTION HORIZON (MF RG-1).** The gate can only count LIVE queryable DBs; any Neon snapshot / PITR point / retained branch captured **before** the active-key flip provably contains readable old-kid rows it cannot inspect. So the old kid MUST stay in the ring until `max(observation window ≥ 14d (OD5), backup/PITR retention horizon, oldest retained snapshot/branch age)` has fully elapsed since the flip — i.e. until **no retained restore point predates the flip**. OD5's window is tied to the actual Neon retention setting, not idle-merchant logic. OC4 enumerates retained snapshots/branches (not just live replicas) and records the oldest restore point per DB; before removal, either retention is shorter than the window OR pre-flip snapshots are deleted/re-taken post-migration.
4. **No-decrypt-fallback telemetry — DURABLE, cross-service, BASELINE-RELATIVE (should-fix + Amendment R3-#3).** Against the `KeyRetirementObservation` record (§3.10): for the retiring kid `K`, **`current KeyDecryptTelemetry.count − recorded baseline == 0` for every expected-live service across the entire window** — i.e. zero *increase*, NOT an absolute zero (the cumulative counter is non-zero from legitimate dual-read-window decrypts). The counter is durable + summed across services (survives redeploy / Neon scale-to-zero). BLOCK on: any increase; a count *below* baseline (reset/restore); a heartbeat gap in an expected-live service; or a change to the recorded `expectedServices` / `codeCapability` / `fingerprint`. The **authoritative** gate leg is the per-DB parse-based count (item 1); this baseline-relative telemetry is the positive non-use proof. Any old-kid decrypt increase resets the window; alert on any `KEY_NOT_AVAILABLE`.
5. **No unremediated poison rows (should-fix).** A poison/undecryptable row correctly fails item 1 forever — which would otherwise stall the leaked-key eviction indefinitely. So any row in the migrator's `decryptFailures` id-log MUST be remediated (merchant PIN-reset → rewrite under the active kid, or the branch confirmed PIN-less / soft-deleted) — with a named owner + alert SLA — before the window can be considered clean. `decryptFailures > 0` anywhere is an explicit gate-blocker requiring remediation, never an indefinite stall.
6. **Both-services + owner-gated removal operation (Amendment #12):** the owner removes kid `K` from `ENCRYPTION_KEYS` on EACH Railway service's env + adds it to `DECOMMISSIONED_KIDS`; published `KeyringFingerprint` re-verified per service (via `--verify-keyring-and-exit` for the offline worker) to confirm absence from BOTH rings (removing from only one orphans values the other still reads); a runbook/status commit records the operation + the attached gate evidence.

**Any rollback (tiers 1–3) RESETS this gate:** the observation window restarts, the watched kid `K` is re-defined relative to the new ACTIVE, and the 3× verify runs begin again. The telemetry counter is parameterised by the explicit kid being retired, not implicitly "not the active kid."

---

## 9. Risk register

| # | Risk | Severity | Mitigation |
|---|---|---|---|
_(Risk IDs are `RISK-n` to avoid collision with the release names R1–R4.)_

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| RISK-1 | Guard 10 swallows every decrypt throw → a `KEY_NOT_AVAILABLE` becomes a **silent all-redemptions-fail** at a branch | **High** | R1 hardens the catch (alert on keyring error, still fail closed loudly); retirement gate hard-blocks on any non-active/poison row; runbook PIN-reset triage. None of the three source designs caught this; the panel did |
| RISK-2 | Format-before-reader: v2 writes enabled before the reader is live on BOTH services → old code throws on every v2 value (silent denial via Guard 10) + code-rollback strands rows | **High** | Hard release ordering: R1 reader-everywhere is a ciphertext-format/key-selection no-op (build cannot emit v2; R3-#2); R4 turns on `ENCRYPTION_V2_WRITES_ENABLED` only after both services confirm identical published fingerprint; runner refuses on mismatch; tier-0 rollback conditional on no v2 rows |
| RISK-3 | Web/Worker keyring parity is operator-configured; a forgotten worker reconfigure breaks that service | Medium | Boot fingerprint published to the `KeyringFingerprint` DB table (no HTTP, no migrator credential) + runner refuse-on-mismatch reading that table + `--verify-keyring-and-exit` for the offline worker; add-everywhere-before-flip / retire-only-after-both-clean ordering |
| RISK-4 | CAS uses the ciphertext string as the token; only safe because the IV is fresh-random. A future deterministic/counter-IV provider breaks BOTH CAS and GCM nonce-uniqueness | Medium | IV physically owned by `encryptWith` (no `iv` param); R1 test asserts encrypt never reproduces an identical ciphertext and the migrator always re-encrypts with a fresh IV |
| RISK-5 | Poison/undecryptable rows block the gate and silently break that branch's redemptions | Medium | Migrator tallies + id-logs + alerts (never plaintext); verify-zero fails the gate on any non-active row; runbook PIN-reset triage |
| RISK-6 | OTP separation alone doesn't neutralise the leaked key for OTP; forgetting a fresh active value leaves OTP forgeable | Medium | R2 + Operation A make a fresh OTP value explicit + enforced; allowlist CI guard proves all 7 sites swapped. **Routine** rotation keeps the previous verify-only for the max TTL (24h) then drops it; the **incident** track (this staging case) does NOT carry the leaked previous — challenges are invalidated immediately because staging is offline (§3.6/§3.12/§12) |
| RISK-7 | DR/PITR copies + replicas are separate served DBs; a pre-retirement snapshot restored after removal bricks PINs | Medium | Gate's "every served DB" clause enumerates staging/replicas/DR; runbook states the bricking hazard and that whole-DB restore is never a valid post-live-write rollback; incident track uses the offline-backup recovery policy (§3.12) |
| RISK-8 | Neon Free 100 CU-hr/mo + scale-to-zero + ~10-conn pool: an unthrottled run starves the sweeps / exhausts CU | Low | Run as a separate ephemeral migrator process (operator machine or Railway one-off, OD8) against the direct endpoint with a dedicated `max:2` pool; the worker daemon stays **offline** during the cost-contained run (Amendment #13); resumable from the committed cursor |
| RISK-9 | Boot-once keyring read removes hot-swap → a key fix needs a redeploy, widening any parity-gap window | Low | Owner-acknowledged trade for atomic multi-key validation; dual-read ring keeps reads safe during redeploy; fingerprint parity verified post-deploy before any flip/removal |

---

## 10. Deferrable KMS scope

**Deferrable (decide when a hosted KMS is funded):** the specific vendor; whether the KMS is **exportable** (secret-manager: Doppler / Railway secret store — a `getKey` drop-in) or **non-exportable** (AWS KMS / GCP KMS / Vault Transit — requires the bounded crypto-provider interface change in §3.3: `encryptWith`/`decryptWith` delegation instead of `getKey():Buffer`); direct-Encrypt/Decrypt vs KMS-wrapped data keys; per-tenant keys; automated rotation scheduling; HSM-backed storage.

**NOT deferrable (the seams that bound the future KMS change to the provider layer — ship now):** the `KeyProvider` interface, the purpose-namespaced kid scheme, PIN/OTP key separation, keyring boot validation + fingerprint, and the `DECOMMISSIONED_KIDS` denylist. These make a non-exportable-KMS adoption a **provider-layer interface change only** (the envelope, kid scheme, migration, gate, and call-site topology are untouched) — bounded, not a rewrite, but honestly **not** a zero-change drop-in for non-exportable KMS.

---

## 11. Test strategy (adversarial security + concurrency + rollback + scale)

- **Adversarial security (R1/R2):** legacy 3-part + v2 5-part roundtrips; unknown-kid → `KEY_NOT_AVAILABLE`; cross-namespace kid rejected; malformed/extra-colon/injected-kid envelope throws without shifting iv/tag/ct boundaries; tampered GCM tag still throws; boot fail-closed on non-64-hex / placeholder / duplicate kid / ACTIVE-absent / ACTIVE-denylisted / malformed JSON; **logging-redaction test** (no plaintext/key/ciphertext/full-envelope ever logged; fingerprint uses the §3.9 canonical formula and contains no key bytes); **allowlist CI guard** (only `keyring.ts`/the bridge read `ENCRYPTION_KEY`/`ENCRYPTION_KEYS`); OTP issue/verify under active + previous-during-overlap + byte-equality vs the legacy HMAC for the bridged kid (CRYPTO-1).
- **R2 explicit-previous-key (owner-locked) — REQUIRED tests:**
  - `getOtpVerifyKids()` returns **exactly** `[ACTIVE]` when `OTP_HMAC_KEY_PREVIOUS` is unset, and **exactly** `[ACTIVE, PREVIOUS]` (in that order) when a valid previous is configured — and **never** any other ring kid (negative pin: a third `otp-*` kid present in `OTP_HMAC_KEYS` but not designated PREVIOUS is NOT returned and does NOT verify).
  - boot fails closed when `OTP_HMAC_KEY_PREVIOUS` is: not in `OTP_HMAC_KEYS` / `== OTP_HMAC_KEY_ACTIVE` / in `DECOMMISSIONED_KIDS` / not `otp-*` / set while in legacy-bridge mode (`OTP_HMAC_KEYS` unset).
  - `otpHmacSign` keys under **ACTIVE only** (PREVIOUS is never a signing key — a code signed under ACTIVE must NOT verify under a ring where PREVIOUS≠ACTIVE-then-active-removed; and a PREVIOUS-only signature must fail once PREVIOUS is unset).
  - `otpHmacVerify` accepts a code signed under the outgoing kid **only while** PREVIOUS is configured, and **rejects it** once PREVIOUS is unset (overlap-window expiry / incident immediate-invalidation).
  - incident path: with `OTP_HMAC_KEY_PREVIOUS` unset and `otp-legacy` in `DECOMMISSIONED_KIDS`, a code signed under the leaked `otp-legacy` **fails verification** (no fallback).
  - CRYPTO-1 byte-equality preserved (bridged `otp-legacy`).
  - dev/test bypass UNCHANGED: the `code === '000000'` bypass still works **only** in the allowlisted dev/test envs and is independent of `otpHmacVerify` (a separate guarded branch).
  - request-path redaction: no test/log/error exposes the OTP code, `challenge:code`, the raw HMAC, or key bytes.
- **Concurrency (R4):** simulated concurrent `setBranchPin` between read and CAS → `updateMany` count 0 → benign skip, never clobber; idempotent re-apply; **IV-uniqueness invariant** assertion (encrypt never reproduces an identical ciphertext).
- **Rollback (R4):** safe-abort leaves a readable mix; flip-active-back keeps migrated rows decryptable; reverse-migration symmetry; code-rollback asserted safe **only** pre-v2-write; explicit no-whole-DB-restore.
- **Scale (R4):** 100 + 10k synthetic-row runs on a loopback fixture DB measuring batches/conflicts/resume; crash-mid-batch resume from the committed cursor; poison-row skip+alert+gate-block; dry-run and verify-zero correctness.
- **Guard 10 (R1):** every decrypt fault (`KEY_NOT_AVAILABLE`/keyring, `ENVELOPE_PARSE`, `GcmAuthError` stored-ciphertext-authentication failure, unexpected) alerts + fails closed loudly and NEVER increments the wrong-PIN counter; the only silent `INVALID_PIN` is a successful decrypt whose plaintext differs from the submitted PIN (Codex re-review — the submitted PIN is never a decryption input, so a decrypt failure is a server/data fault, not a wrong PIN).
- **Harness:** loopback-only integration harness + expect-host gate + zero-secret-logging discipline reused from the unmerged `reencrypt-branch-pins.ts`. No test connects to Neon, rotates a real key, or restarts a service.

---

## 12. How the leaked staging key is resolved via THIS mechanism (not a one-off)

Staging is the **first execution (rehearsal)** of the standing runbook, run on the **incident** track (§3.12), not the routine track.

**The exposed `ENCRYPTION_KEY` maps to TWO compromised logical kids — BOTH must be denylisted + retired (Amendment R4-#3):** the **PIN kid `legacy`** and the **OTP kid `otp-legacy`**. Both are added to `DECOMMISSIONED_KIDS` immediately, with these distinct rules (pinned by tests):
- **Neither** may become ACTIVE (boot fail-closed in either ring).
- **Neither** may sign new OTPs (`otp-legacy`) or encrypt new PINs (`legacy` — note flag-off PIN writes use the legacy *key*, so the PIN incident is contained only once ACTIVE flips to the fresh `pin-*` kid + the writer flag is on in R4; until then `legacy` is still the live PIN writer, which is exactly why the PIN path is build-first-through-R4, §R4-#2).
- **Neither** may be a reverse-migration target (`--reverse` fails closed on a denylisted kid, §3.8).
- **`legacy` (PIN)** may remain temporarily **readable** only for the **minimum PIN migration interval** (it must still decrypt un-migrated 3-part rows until the migration lifts them), then is removed promptly.
- **`otp-legacy` (OTP)** is **removed immediately** on the staging incident path (OTP HMACs are transient; staging offline ⇒ no in-flight codes to protect ⇒ no read-retention need).

Two fixes run together:

1. **OTP path (incident — immediate invalidation):** on the OTP-separation release set `OTP_HMAC_KEY_ACTIVE` to a **fresh** value and **leave `OTP_HMAC_KEY_PREVIOUS` UNSET** — so `getOtpVerifyKids()` = `[ACTIVE]` and the leaked `otp-legacy` is **not** accepted as a verify fallback. Because **staging is offline**, outstanding OTP/email-verification challenges are invalidated immediately (drop the leaked OTP value at once). There are no legitimate in-flight staging codes to protect, and every retained hour is extra forgeability exposure. (The 24h dual-verify window via `OTP_HMAC_KEY_PREVIOUS` is the *routine* policy, §3.6; it does not apply here.)
2. **PIN path (incident — minimum-interval retention):** generate a fresh staging PIN kid (e.g. `pin-2026-06`); add it to staging `ENCRYPTION_KEYS` alongside the leaked one (now kid `legacy`, DEPRECATED + denylisted) on BOTH staging services; verify identical published fingerprints (via `--verify-keyring-and-exit` for the offline worker, §3.9/#13 — no sweep restart); enable the writer-format flag + flip `ENCRYPTION_KEY_ACTIVE` to the fresh kid on both — from this moment **no new value is written under the leaked key**; run the resumable CAS migration (operator-host, `max:2`, direct endpoint) to lift every legacy-kid `Branch.redemptionPin` to the fresh kid; run verify-zero on every served DB until clean (reconciliation loop, §3.5). Retain the compromised PIN kid **only for this minimum migration interval**, then remove it **promptly** (the generic ≥14d live-key observation does NOT apply to a known-compromised key). Pre-flip staging snapshots are handled by the offline-backup recovery policy (§3.12), not by keeping the live key around.

After migration + verify-zero complete on every served DB, the leaked kid is removed from the live keyrings (owner-gated operation, §"retirement") and stays denylisted. The leaked staging key then opens nothing and signs nothing. The same mechanism runs on production — on the routine track for scheduled rotations, or on this incident track if a production key is ever compromised.

(Interim-urgency note — corrected (Amendment R4-#2). There is **no safe interim PIN-flip** before R4: flipping `ENCRYPTION_KEY_ACTIVE` to a fresh PIN kid is only useful if `ENCRYPTION_V2_WRITES_ENABLED` can turn on AND the migrator exists to lift existing rows — **both first exist in R4**. A flip without them would either keep writing under the legacy key (no containment) or, if mis-wired, write undecryptable PINs. So the **only supported PIN incident path is build-first through R4**, then run Operation A. **OTP rotation is the exception that CAN run interim — after R2** — because OTP HMACs are transient/Redis-only and need no persisted-data migration: once R2 is live, set `OTP_HMAC_KEY_ACTIVE` fresh and (staging being offline) invalidate outstanding challenges immediately, neutralising the leaked key on the OTP/integrity path within one TTL. If any *other* interim PIN mechanism is ever proposed, **stop and report it as a separate architecture decision** — do NOT silently reuse the unsafe one-off PR #338 tool. Owner confirms acceptance of build-first-through-R4 for PIN + interim-OTP-after-R2 — Open Concern OC2.)

---

## 13. The existing one-off tool — reuse + why it is not suitable as-is

**Precondition (MF10 — verified against source; locked route).** Neither the `encryptWith`/`decryptWith` primitives nor `prisma/reencrypt-branch-pins.ts` are on `main` — they live only on the unmerged branch `feat/reencrypt-branch-pins` (PR #338, committed at `0871ec0e`). **PR #338 is NOT a merge dependency and must never be merged.** The locked route: **R1 ADDS `encryptWith`/`decryptWith` net-new on `main`**; **R4 builds the production migrator, selectively salvaging only the safe harness/guards from #338**; **PR #338 stays unmerged** and is closed with a pointer to R4 after R4 lands. A global stop-and-report trigger fires if these are assumed present at R1 start.

With that precondition met, `prisma/reencrypt-branch-pins.ts` is **reconciled into R4** (one tool, not two divergent ones).

- **Reusable as internal components:** the `encryptWith`/`decryptWith` key-parameterised primitives; the key-validation guards (64-hex, lowercase-normalisation, placeholder rejection, OLD===NEW rejection); the `--expect-host` exact-match gate; the read-only count/dry-run/verify functions; the `maskHost` + zero-secret-logging discipline; the loopback-only integration harness.
- **Why it is NOT the architecture (its three blockers, all dropped):** (1) a **hard 500-row ceiling** — not scalable; (2) a **single `$transaction`** for the whole table — would lock the table + blow Neon Free CU at scale; (3) it requires **services stopped** (`--services-stopped-confirmed`) — not zero-downtime. It also lacks a versioned envelope, dual-read, purpose-namespaced kids, a durable resumable checkpoint, CAS concurrency, and the retirement gate. It is a valid *staging-only stopgap* but not the *standing production capability* the owner requires.

---

## 14. Codex corrections honored

1. **CAS, not last-write-wins** — `updateMany WHERE id AND redemptionPin=original`; count 0 → skip/requeue (§3.7).
2. **Column not auto-required + explicit compare** — A1 chosen over A2 with full PRO/CON; version+kid inside the envelope (§3.2).
3. **No full seed** — existing ciphertext migrates only via the mechanism; future seeds use the active key; full seed stays prohibited (§3.5).
4. **`setBranchPin` non-atomic stated correctly** — update + audit are separate, unchanged; no atomicity claimed (§3.7, §1.1).
5. **Web/Worker don't auto-share env** — explicit per-service config + boot fingerprint parity + runner refuse-on-mismatch + ordering rules (§3.9).
6. **Current key not production-ready** — explicitly described as a single static, dual-purpose, non-rotatable per-env key, and replaced (§0).
7. **Full retirement gate** — zero parsed-kid rows on every served DB ×3 + zero-increase-from-baseline durable cross-service telemetry (`KeyRetirementObservation`, R3-#3) + window = (routine) `max(≥14d, backup/PITR retention horizon)` or (incident) the minimum migration interval (§3.12) + an **owner-gated provider operation** (Railway env removal on both services + add to `DECOMMISSIONED_KIDS`) with reviewed evidence + a runbook/status commit — **not** a Git config-only PR (§8, Amendment #12).
8. **No whole-DB restore** — rollback = safe-abort / flip-active-back / reverse-migration with dual-read; PITR invalid after live writes; pre-retirement DR restore after removal bricks PINs (§3.8, §7).
9. **Preferred component set** — legacy reader, versioned/kid envelope, active-key writes, separate PIN+OTP keys (namespaced), resumable bounded batches, CAS, dual-read rollback window, delayed gated retirement, provider-neutral keyring + future KMS boundary — all present.

---

## 15. Open concerns / owner confirmations needed

- **OC1.** Guard 10's try/catch swallow is a **pre-existing latent risk** this rotation makes load-bearing; R1's hardening is essential. Confirm the desired alert channel (the design assumes the existing operational alert path).
- **OC2.** Staging-exposure urgency vs build-order (§12, Amendment R4-#2): the **only supported PIN incident path is build-first through R4** then Operation A (there is no safe interim PIN-flip — the v2 writer + migrator first exist in R4). The **OTP** leak CAN be neutralised interim, after R2 (fresh `OTP_HMAC_KEY_ACTIVE` + immediate challenge invalidation, no migration). Confirm this is acceptable; if a faster interim PIN containment is required, that is a **separate architecture decision** (do not reuse the one-off PR #338 tool).
- **OC3.** The exact production + staging Branch count is unknown during design (no Neon connection permitted); OD7 batch/throttle finalisation needs that count before the production run.
- **OC4.** Confirm the **full served-DB inventory** (read replicas? DR/PITR copies?) — the retirement gate must enumerate every one.
- **OC5.** The unmerged `reencrypt-branch-pins.ts` must be reconciled **into** R4, not shipped alongside it.
- **OC6.** Boot-once keyring read removes hot-swap; confirm no operational flow relies on changing `ENCRYPTION_KEY` without a redeploy.
- **OC7.** The retirement window must cover the Neon backup/PITR/snapshot retention horizon (§8 item 3) — confirm the actual Neon retention setting + the oldest retained restore point per served DB so the window can be sized and pre-flip snapshots handled.

---

## 16. Adversarial review — findings & dispositions

This spec was put through an 8-lens adversarial review (crypto correctness, concurrency/data-safety, rollback/retirement/DR, scale/ops/deploy-ordering, secret-handling, source-fidelity, spec↔plan consistency, missing-coverage) + an adjudicator. The review returned **10 must-fix, 19 should-fix, 19 nits**. Dispositions:

**Must-fix — ALL integrated into this spec + the plan:**

| # | Finding (verified✓) | Integrated at |
|---|---|---|
| MF1 | OTP boot bridge byte-incompatible — live sites key on the raw 64-hex string, `getKey()` returns decoded 32 bytes ✓ | §3.3 (`getOtpHmacKey` CRYPTO-1), §3.6, §12 |
| MF2 | TWO live PIN-encrypt writers, not one (`auth/merchant/branch-user.service.ts:273`) ✓ | §1.1, §3.7; plan static guard |
| MF3 | Migration terminal SUCCESS must require a final verify-zero (residue/poison ⇒ `completed_with_residue`) | §3.5 |
| MF4 | OTP cutover never carried the leaked value as verify-only `previous` for one TTL | §3.6 |
| MF5 | Retirement gate kid-relative, inverts under rollback; no assertion the removed kid is the measured one | §8 item 1 |
| MF6 | "1–2 conn ceiling" has no mechanism; pool defaults to max:10 ✓ | §3.5 (dedicated `max:2` Pool), §6 |
| MF7 | Run-host self-contradictory (in-process vs separate process) | §3.5 (separate `railway run` process), §6 |
| MF8 | Dev/seed scripts + `requireEncryptionKey.ts` break under new env vars ✓ | §3.5, plan R1 Modified |
| MF9 | Retirement can't inspect pre-flip backup/PITR snapshots ⇒ window must cover retention horizon | §8 item 3, OC7 |
| MF10 | `encryptWith`/`decryptWith` + the tool are NOT on main (unmerged PR #338) ✓ | §1.1, §13; plan precondition |

**Should-fix — integrated inline (silent-brick / security vectors):** SQL `LIKE` underscore-wildcard hazard → kid charset drops `_` (§3.1); hex-charset parse validation (§3.1); one canonical fingerprint formula + domain separation + active-kid component + code-capability marker (§3.9); IV physically owned by the primitive, no `iv` param (§3.7); Guard-10 third bucket (envelope-parse) + request-path logging redaction + `KEY_NOT_AVAILABLE` `ERROR_DEFINITIONS` entry (§3.10); `NOT LIKE` is a filter, parse is the gate (§8 item 1); single-flight / advisory-lock guard (§3.5); mid-run fingerprint re-check (§3.5, §3.9); writer-flip self-gating in code (§3.9); checkpoint tallies best-effort, gate trusts only count + telemetry (§3.5); durable cross-service fallback counter (§8 item 4); poison-row remediation step + SLA (§8 item 5); seed/reset prohibited during the window (§3.5); `KeyMigrationCheckpoint` apply-before-image + write-guard self-check (§3.5); swapped-ring boot guard (§3.3, §3.4); parity fingerprint published to the additive `KeyringFingerprint` DB table read directly by the migrator — no HTTP endpoint, no `ops:keyring` capability (which does not exist), no reusable migrator credential; a human-readable admin inspection endpoint is optional/deferred (§3.9, superseded by Amendment #9); allowlist (not denylist-grep) for `ENCRYPTION_KEY` reads (§3.6); OD4 staging-rehearsal task (plan).

**Should-fix / nits — deferred to implementation time (recorded, PR-tagged), not silently dropped:** `casConflict` classification forensics; "neither guard optimized away" code comment; per-var typo-named boot errors; `isTestData`-in-scope note (added §6); direct-endpoint DDL note (added §6); KEY_NOT_AVAILABLE client-envelope mapping (added §3.10); `otpHmac` never-log-the-code comment; legacy-kid hard-coding (flagged §3.4); tier-0 rollback detection precondition (runbook, R3); rollback-resets-window (added §8); minor line-number drift (`reencrypt` tool ~497 lines not 466; Guard-10 ~282–294; `bootstrap.ts:21`); spec path abbreviations → full `src/api/auth/...` paths; the fictional `prisma/prismaWriteGuard` → real `keyMigrationWriteGuard.ts` mirroring `recomputeWriteGuard.ts` (plan); §3.6 TTL wording ("longest HMAC-challenge TTL: 24h `EMAIL_VERIFY_TTL`; login-OTP 10 min").

**Residual verdict:** with the above integrated, the architecture is sound for owner/Codex review. The remaining judgement calls that are genuinely the owner's are surfaced as OD1–OD8 + OC1–OC7, not silently resolved.

---

## 17. Codex source-review amendments (round 2) — cross-check

Codex's source-level review approved the direction and required 15 blocking amendments. All are integrated:

| # | Amendment | Where applied |
|---|---|---|
| 1 | Reorder: Guard-10 + telemetry + runbook BEFORE any v2 flip/migration | Plan §Programme (new order: foundation+Guard-10 → OTP → telemetry+runbook → migrator+gated-writer → staging rehearsal → owner-gated retirement); spec §7/§8 release tags |
| 2 | Telemetry concretely (storage/schema/aggregation/retention/reset/failure/missing⇒block) | §3.10 (concrete), §5 (`KeyDecryptTelemetry` + `KeyringTelemetryHeartbeat`), §8 item 4 |
| 3 | R2 (OTP) depends on R1's KeyProvider, not independent | Plan §Programme + OTP-release dependency |
| 4 | Legacy boot contradiction — separate legacy-bridge vs explicit-keyring validation | §3.4 (two modes; `legacy != ACTIVE` is mode-(B)-only) |
| 5 | Explicit writer-format gate (`ENCRYPTION_V2_WRITES_ENABLED`, default off; foundation build incapable) | §3.1 encode rule, §3.4 env table, §3.9 self-gating |
| 6 | Separate routine rotation from compromised-key incident response | §3.12 (new), §12 (staging = incident: immediate OTP invalidation, min-interval PIN retention, offline-backup policy) |
| 7 | Compromised key must never become ACTIVE again; split routine vs emergency rollback | §3.8 (tiers 2/3 routine-only; incident forward-only + denylist-from-start) |
| 8 | Migration host: `railway run` is local, not a hosted job — specify host + direct-DB credential path | §3.5 run-host (operator-machine vs Railway one-off; `MIGRATION_DATABASE_URL` direct endpoint) + new OD8 |
| 9 | Fingerprint auth/placement: `ops:keyring` doesn't exist; no reusable high-priv credential in the migrator | §3.9 (DB-table `KeyringFingerprint` publication, no HTTP/credential; optional admin endpoint deferred), §5 |
| 10 | One fingerprint formula only | §3.9 canonical; stale form removed from §3.11 + §11 |
| 11 | Reconciliation pass — re-run until verify-zero is clean, never stop with inaccessible residue | §3.5 terminal-success + reconciliation loop |
| 12 | Retirement is an owner-gated provider operation, not a Git config-only PR | §8 header + item 6; plan retirement section |
| 13 | Neon cost containment — worker stays offline; `--verify-keyring-and-exit` parity without sweeps | §3.9 (verify-and-exit), §3.5, §12 |
| 14 | Qualify scale claims — benchmark/query-plan/load gates before claiming throughput | §6 (ESTIMATE + gates) |
| 15 | Resolve current-work state (preserve spec/plan + paused PR #338; don't merge; gh auth expired; supersession plan) | Plan §"Current-work state & PR #338 reconciliation" |

**New owner decision surfaced by this round — OD8:** migration execution host — (a) controlled operator machine (recommended) vs (b) a Railway one-off deployment/job (§3.5).

**Post-amendment consistency-review pass (4 lenses + adjudicator).** After applying the 15 amendments, a fresh consistency review confirmed 12/15 fully applied and flagged residual integration defects, all now fixed: the spec body's stale PR1–PR5 tags swept to the R1–R4 + Operation A/B release names (and the **Risk register renamed R1–R9 → RISK-1…RISK-9** to end the collision with release names); two leftover "admin endpoint" parity references (RISK-3 + §16) corrected to the `KeyringFingerprint` DB-table mechanism; four "run migration on the worker" phrasings corrected to "separate ephemeral process, worker offline" (Amendment #8/#13); and **two genuinely new fixes**: (i) boot mode is now selected **per-namespace** (PIN ring iff `ENCRYPTION_KEYS` set; OTP ring iff `OTP_HMAC_KEYS` set) so the R2-live/R4-pending state cannot silently keep the leaked OTP key as signer (§3.4); (ii) the heartbeat-liveness gate's "expected-live services" set excludes the deliberately-offline worker (it contributes a `--verify-keyring-and-exit` snapshot, not a continuous beat) so retirement cannot fail-safe-deadlock (§3.10), with the connection-budget restated as web-pool + migrator for the cost-contained run (§3.5/§6).

---

## 18. Codex source-review amendments (round 3) — cross-check

Codex's third source-level review approved the production-safe direction and required 9 implementation-readiness corrections. All integrated:

| # | Correction | Where |
|---|---|---|
| R3-#1 | `KeyringFingerprint` migration created + applied in **R1** (R1 both publishes and gate-checks it), not deferred to R3/R4 | §5 (per-release table placement), §3.9; plan R1 files + deploy gate, R3/R4 file lists |
| R3-#2 | R1 is a **ciphertext-format/key-selection** no-op (not a complete no-op — it changes Guard-10 + writes fingerprints); fingerprint-publish failure is best-effort (does not block startup) but blocks later rotation | §3.4; plan R1 deliverable + gate (failure-behaviour + tests + runbook) |
| R3-#3 | Telemetry observation **baseline** — `KeyRetirementObservation` record; retirement = **zero counter increase from baseline** (cumulative counter), no reset/backwards/gap/service-set change | §3.10 (record + pass condition), §5, §8 leg 4; plan R3 |
| R3-#4 | Offline-worker fingerprint freshness — **run-bound Worker snapshot** (value-unchanged each batch; freshness not required); Web stays fresh-each-batch | §3.9 runner precondition, §3.5; plan R4 |
| R3-#5 | `--reverse` **fail-closed** when target is denylisted, run is incident-mode, or target is absent / not an approved routine previous | §3.8; plan R4 |
| R3-#6 | **R2 explicitly** in R4 + Operation A prerequisites (not just diagram order) | plan R4 gate + Operation A header |
| R3-#7 | §3.6 verify-only OTP previous overlap is **routine-only**; incident path invalidates immediately, never retains the leaked OTP key | §3.6 |
| R3-#8 | "reader-capable image + keyring-configuration parity verified for both services" (Worker via `--verify-keyring-and-exit`) instead of "live on both services" | plan §Programme, R3/R4 gates, Operation A |
| R3-#9 | KMS honesty — `getKey(): Buffer` is a drop-in only for an **exportable** secret-manager; a **non-exportable** KMS needs a bounded crypto-provider interface change (`encryptWith`/`decryptWith` delegation), not a zero-change drop-in | §3.3, OD3, §10 |

---

## 19. Codex source-review amendments (round 4) — cross-check

Codex's fourth review confirmed all nine round-3 corrections present and required 5 implementation-readiness corrections. All integrated:

| # | Correction | Where |
|---|---|---|
| R4-#1 | **Which key encrypts a 3-part value** — flag OFF ⇒ encrypt 3-part **under the LEGACY key** (never a non-legacy ACTIVE, which would be undecryptable); flag ON ⇒ require `ACTIVE != legacy`, emit v2 under ACTIVE; missing legacy key while flag-off ⇒ fail closed. "byte-unchanged" (impossible with a random IV) replaced by "format-compatible and decryptable with the legacy key" | §3.1 encode rule, §3.4, §3.9; plan R1 tests + R4 capability + deliverable/gate |
| R4-#2 | **Removed the impossible interim PIN-flip** (the v2 writer + migrator first exist in R4) — the only supported PIN incident path is build-first through R4; **OTP** rotation may run interim after R2 (no migration); any other interim PIN mechanism = a separate architecture decision, never the PR #338 tool | §12, OC2; plan Operation A |
| R4-#3 | **Both compromised logical kids named** (`legacy` PIN + `otp-legacy` OTP) — both denylisted; neither ACTIVE / signs OTPs / encrypts PINs / is a reverse target; `legacy` readable only for the minimum PIN migration interval; `otp-legacy` removed immediately on the staging path; tests for each distinction | §12; plan Operation A (+ §3.8 / §3.4 denylist) |
| R4-#4 | **`KeyRetirementObservation` made operational** — explicit open-after-migration+verify-zero, atomic baseline/expected-services/capability/fingerprint capture, blocked+re-baseline triggers, passed-only-after-all-checks, evidence preserved through retirement | plan Operation B lifecycle + R3 runbook task (record/semantics already in §3.10/§5/§8) |
| R4-#5 | Consistency cleanup — plan self-review `R1+R3 → R4` → `R1+R2+R3 → R4`; §16 residual verdict `OD1–OD7` → `OD1–OD8`; "byte-unchanged" claims corrected (R4-#1) | plan self-review; spec §16 |
| R2-#1 | **Explicit, provider-owned OTP previous key (owner decision, post-R1).** Adds optional env `OTP_HMAC_KEY_PREVIOUS` + KeyProvider method `getOtpVerifyKids(): readonly string[]` returning exactly `[ACTIVE]` or `[ACTIVE, PREVIOUS]`. Signing uses ACTIVE only; verification iterates ONLY the provider-returned ordered list and **never** infers PREVIOUS from every non-active ring kid. Boot fails closed unless PREVIOUS is `otp-*` + present in `OTP_HMAC_KEYS` + `!= ACTIVE` + not in `DECOMMISSIONED_KIDS`; legacy-bridge mode requires PREVIOUS unset. Routine rotation retains exactly one PREVIOUS for ≤ longest challenge TTL (24h) then removes it; the compromised-key incident path keeps PREVIOUS unset (leaked `otp-legacy` is never a fallback; challenges invalidated immediately). Resolves the audit-flagged R1-API↔spec gap (the merged design said "verify ACTIVE then PREVIOUS" with no PREVIOUS designation). Dev/test bypass unchanged + separately guarded. | §3.3 (`getOtpVerifyKids`), §3.4 (env + boot validation), §3.6 (sign/verify + routine/incident), §3.12/§12 (incident), §15 (tests); plan §R2 |

---

*End of design spec. No implementation, key rotation, Neon connection, or service restart is authorised by this document. Companion implementation plan: `docs/superpowers/plans/2026-06-29-encryption-key-rotation-architecture.md`.*
