# PLAN · D65 In-Person Signing Ceremony - Implementation

Status: DRAFT · Tier 3 · docs-only (this PR ships no code)
Spec: `docs/superpowers/specs/2026-07-10-d65-in-person-signing.md`
Agreement draft: `docs/legal/drafts/merchant-agreement-v2-draft.md`
Gate: `AGREEMENT_LEGAL_REVIEW_REQUIRED` default `true` - production signing blocked until owner flip

This plan sequences the build. It is written to be executed in a later session with review
checkpoints. Every slice states scope, files, and its Definition of Done. Nothing here is
implemented in the docs PR.

---

## Owner decisions to surface before implementation

1. Fallback (self-serve click-to-agree) also gets a PDF + evidence record now? (Spec assumes yes.)
2. Optional stylus signature-draw in v1 or deferred? (Spec keeps it optional/non-gating.)
3. Content hash over canonical source text (recommended) vs literal PDF bytes.
4. PDF renderer choice: spec recommends `pdfkit` (pure JS, no headless browser, no new provider).
5. Liability cap and term/renewal shape are blocked on the solicitor (§handoff) but do not block
   building the ceremony mechanics - the agreement text is data behind the version registry.

Do not start Slice 1 until 1-4 are confirmed. The schema slice is OWNER-GATED regardless.

---

## Slices

### Slice 0 - Agreement version registry + content hashing (no schema)
- New `src/api/merchant/agreement/versions.ts`: maps `agreementVersion` to its rendered content +
  precomputed `contentHash` (sha256 over the canonical source). Loads the frozen artifact from
  `docs/legal/agreements/merchant-agreement-v<N>.md` (promoted from the draft on sign-off).
- Supersede `CONTRACT_VERSION`/`CONTRACT_TEXT` (`src/api/merchant/onboarding/service.ts:11-18`):
  `GET /contract` (`routes.ts:47-49`) reads the current version from the registry, still returning
  `{ version, text }` (behaviour-compatible).
- Static guard test: recompute each published version's hash from its artifact and assert it equals
  the stored hash (published bytes never change).
- **DoD:** registry returns current version + hash; existing `GET /contract` unchanged externally;
  hash guard test green. No schema, no new route.

### Slice 1 - Schema migration (OWNER-GATED)
- Add `MerchantAgreementRecord` model + `AgreementSignMethod` enum (spec §4.1). Add the reverse
  relation on `Merchant`.
- Migration authored but **applied only through the deploy runbook** (backend-api rule: migrations
  are hand-applied to dev; staging/prod via `prisma migrate deploy`). Production apply is owner-gated
  and joins the pending-migration ledger in PROJECT-STATE §3/§6.
- **DoD:** migration reviewed, dev-applied, `prisma generate` clean; no code reads the table yet.
- **Checkpoint:** pause for owner approval of the migration before it rides any staging/prod deploy.

### Slice 2 - Backend ceremony route + evidence write + PDF render + R2 store
- New `src/api/merchant/agreement/service.ts`:
  - `signAgreementInPerson({ merchantId, actorAdminId, signerName, signerRoleConfirmation,
    agreementVersion, drawnSignature? }, ctx)`:
    1. Fail-closed on the gate: if `AGREEMENT_LEGAL_REVIEW_REQUIRED` and environment is production,
       refuse a binding write (return a clear `LEGAL_REVIEW_REQUIRED` error).
    2. Validate `agreementVersion` against the registry; recompute + pin `contentHash`.
    3. Enforce admin-never-signs: `actorAdminId` (witness) must be set for this method and can never
       equal the signer; `signerName` is required and non-empty.
    4. Render the PDF (§Slice 2b), write to private R2 via `putObject({ kind: 'document',
       ownerId: merchantId, contentType: 'application/pdf', body })` (`storage.ts:242`) → `pdfKey`.
       If `STORAGE_ENABLED` is off, fail closed with `STORAGE_NOT_ENABLED`.
    5. In ONE transaction: insert the immutable `MerchantAgreementRecord`; upsert `MerchantContract`
       (pointer) keeping `signatureMethod = CLICK_TO_AGREE` for now; flip
       `Merchant.contractStatus = 'SIGNED'` + `contractStartDate`; write audit (§audit) via
       `writeAuditLogTx`.
  - Retrofit the fallback: `acceptContract` (`service.ts:168`) additionally renders a PDF + inserts
    a `MerchantAgreementRecord` with `method = SELF_SERVE_CLICK`, `actorAdminId = null`,
    `signerName` from the typed-name (requires threading the typed name through
    `POST /contract/accept`; today it is UI-only - spec §1.2).
- New route under the admin/assisted namespace: `POST /api/v1/admin/merchants/:id/agreement/sign`
  (capability-gated; the operator is the witness, not the signer). Merchant-facing
  `POST /contract/accept` extended to carry `signerName`.
- **DoD:** ceremony writes one immutable record + a private PDF + flips contractStatus; gate blocks
  production binding writes; fallback also produces an evidence record; onboarding submit gate
  (`computeOnboardingChecklist`) unchanged and still passes on `contractStatus === 'SIGNED'`.

### Slice 2b - PDF renderer
- Add `pdfkit` (spec §7). New `src/api/merchant/agreement/pdf.ts`: `renderAgreementPdf({ version,
  contentHash, signer, role, business, method, witness, signedAt, ip, userAgent, drawnSignature? })`
  → `Buffer`. Footer stamps version + hash + signer + timestamp. While the gate is on, stamp a
  **"DRAFT - PENDING LEGAL REVIEW"** watermark.
- **DoD:** deterministic-enough render; watermark present while gated; unit test asserts version +
  hash + signer appear in the output text layer.

### Slice 3 - Assisted wizard step 7 (un-gate behind the legal flag)
- The assisted surface (`apps/admin-web/features/leads/assisted`, net-new per D49) currently shows
  Contract as a dashed "next build" placeholder. This slice builds step 7 only:
  hand-to-owner panel → scrollable agreement (scroll-to-end gate) → authority attestation →
  enumerated key terms (reuse the 6-term set from
  `apps/merchant-web/components/onboarding/contract/ContractAgreementForm.tsx:22-47`) → typed-name →
  optional stylus draw → timestamped confirmation with download.
- Legal banner while the gate is on ("pending legal review; not for production signing").
- Wire to `POST .../agreement/sign`.
- **DoD:** step 7 completes end-to-end on staging; the operator cannot advance as the signer; banner
  shown while gated; step 8 (Go-live) unblocks after signing.

### Slice 4 - Merchant 360 evidence block (admin)
- Extend `getMerchantDetail` (`src/api/admin/merchants/service.ts`) with a `contract` block: current
  status + `MerchantAgreementRecord[]` (newest first) with version, signer name + role, method,
  `signedAt`, IP, truncated user-agent.
- New admin route returning a short-lived `presignGet` URL for a record's `pdfKey`
  (`storage.ts:213`); capability `contract:view-evidence`; audit `AGREEMENT_EVIDENCE_VIEWED`.
- New Contract/Agreement card on `apps/admin-web/app/(app)/merchants/[id]/page.tsx`. Raw R2 keys
  never returned to the browser.
- **DoD:** admin sees status + evidence rows + can open the signed PDF via presign; access audited.

### Slice 5 - Merchant portal download
- Merchant "Your agreement" view: own current agreement version + signed date + download (presigns
  the `pdfKey`, own-merchant scoped via `resolveMerchantContext`).
- **DoD:** a merchant can download only their own signed PDF; cross-merchant read impossible.

### Slice 6 - Version-artifact promotion + gate flip runbook (docs)
- On solicitor sign-off: promote `docs/legal/drafts/merchant-agreement-v2-draft.md` →
  `docs/legal/agreements/merchant-agreement-v2.md` (frozen), register it, and document the owner
  procedure to flip `AGREEMENT_LEGAL_REVIEW_REQUIRED` to false (production). Add to the deploy
  runbook. This slice is the productionisation gate, not a code feature.

---

## Test strategy

- **Unit (CI lane, `npm run test:unit`):** version registry + hash guard (published bytes immutable);
  PDF render asserts version/hash/signer present + watermark while gated; gate logic (production +
  flag on ⇒ refuse binding write); admin-never-signs guard (witness required, witness ≠ signer);
  submit-checklist unchanged (`contract_signed` still keys off `contractStatus`).
- **Integration (disposable DB only, per backend-api rule - never the shared Neon):** ceremony writes
  exactly one immutable record + flips contractStatus; a second signing appends a new row and never
  updates/deletes a prior one; fallback path writes `SELF_SERVE_CLICK`.
- **admin-web / merchant-web jest:** evidence block renders; presign download opens; merchant sees
  only own record.
- **Storage:** exercised on staging (STORAGE_ENABLED live). Local unit tests mock storage; do not
  require R2 secrets when the flag is off (`storage.ts:95-99`).
- **Manual staging walk:** full step-7 ceremony end to end with the gate on (DRAFT watermark
  present), verifying no production binding write is possible.

## Security seams (must-hold)

- **Immutability:** grep-guard test asserts NO `merchantAgreementRecord.update` / `.delete` call
  sites; new version ⇒ new row. [SOLICITOR-linked: DB-level append-only enforcement is an open
  question in spec §4.1.]
- **Presign-only access:** signed PDFs never public; only short-lived `presignGet`; raw keys never
  leave the backend (backend-api + merchant-web rules).
- **No PII in logs:** signer name, IP, user-agent go to the record + audit table only, never to
  `console`/app logs. Review checkpoint scans for accidental logging.
- **Hash verification:** stored `contentHash` recomputable from the pinned artifact; guard test.
- **Fail-closed gate:** `AGREEMENT_LEGAL_REVIEW_REQUIRED` defaults `true`; production binding writes
  blocked until owner flip; gate independent of `STORAGE_ENABLED`.
- **Ownership:** admin route capability-gated + audited; merchant route own-merchant-scoped
  (`resolveMerchantContext`); ceremony route records rep as witness, never signer.
- **Storage dark-safe:** never construct the S3 client when `STORAGE_ENABLED` is off.

## Audit events (new)

- `MERCHANT_AGREEMENT_SIGNED_IN_PERSON` (actor = witnessing rep; subject = merchant; carries version
  + hash, no raw PII beyond what audit already holds).
- `MERCHANT_AGREEMENT_SIGNED_SELF_SERVE` (fallback path).
- `AGREEMENT_EVIDENCE_VIEWED` (admin opened a signed PDF).
All written in-transaction via `writeAuditLogTx` where they accompany a state change.

## Opus adversarial review checkpoint

Before Slice 2 merges, run an Opus adversarial review specifically probing: (1) can the rep ever be
recorded as the signer / can the "hand to owner" gate be bypassed? (2) can a signed record be
mutated or a PDF overwritten? (3) can the production gate be bypassed (env spoof, flag default)?
(4) does any code path log signer PII? (5) can one merchant read another's PDF? (6) does a
version/hash mismatch fail closed? Treat any "yes" as a blocker.

## Rollback / safety

- All new writes are additive; the fallback path keeps working if the ceremony route is disabled.
- The gate defaulting `true` means a bad deploy cannot accidentally take production signing live.
- Migration is reversible (drop table/enum) and owner-gated before any staging/prod apply.

---

## SOLICITOR HANDOFF

### What this handoff is
The ceremony mechanics (evidence capture, immutability, PDF, versioning, gate) can be built and QA'd
on staging now. **None of it may go to production signing until a solicitor reviews the agreement
draft and the execution flow, and the owner flips `AGREEMENT_LEGAL_REVIEW_REQUIRED` to false.** No
Redeemo surface may claim or imply solicitor approval before then.

### Assumptions we made (please confirm or correct)
1. Governing law is England and Wales; exclusive jurisdiction there (spec + agreement §16).
2. The counterparty is the merchant business (registered company where incorporated); we can bind
   sole traders/partnerships via a named authorised signatory (agreement §1).
3. A **simple electronic signature** (typed full name) + an evidence pack (identity, timestamp, IP,
   device/user-agent, agreement version, content hash, signed PDF, audit log) is sufficient execution
   for a 12-month B2B commercial agreement (agreement §Execution).
4. The in-person "hand the device to the owner; the Redeemo rep never signs for the owner" ceremony
   correctly captures the owner's act; the rep is recorded only as a **witness** and carries no
   signatory liability (agreement §Execution; spec §2/§1.6).
5. Application-level immutability + an audit log is adequate evidence integrity for signed records;
   DB-level append-only enforcement is optional (spec §4.1) - pending your view.
6. The 12-month term is fixed; renewal shape is undecided and we will not promise renewal past the
   final cycle (agreement §6; deferred §AH).
7. Redeemo is a marketplace: the underlying goods/services sale is between Merchant and Consumer;
   Redeemo is a separate controller for marketplace data, the Merchant a separate controller for its
   own processing (agreement §9/§10).
8. Content-hash pins the exact agreement version signed; a change of terms produces a NEW version +
   a NEW evidence record and never mutates a past signed record (spec §5; agreement §15).

### What sign-off must confirm
- The agreement wording (all clauses in the draft) is legally sound and enforceable in England and
  Wales for a B2B merchant of this profile.
- The execution method (simple e-signature + evidence pack + in-person witnessed ceremony) is
  sufficient, or specify the required upgrade (witnessed / advanced e-signature / dedicated provider
  such as Zoho Sign or DocuSign - note this intersects the open Zoho decision, PROJECT-STATE §6).
- The data-protection characterisation (§10) and whether a data-processing / data-sharing schedule
  is required.
- The liability cap figure/formula (§14) given the Platform is free to join.
- The change-of-terms mechanism for a fixed signed term (§15) - this drives the versioning model.

### Collected `[SOLICITOR: ...]` questions
The authoritative, clause-by-clause list lives inline in
`docs/legal/drafts/merchant-agreement-v2-draft.md` (20 questions across §1-§17 + Execution + two
placement notes). The spec carries 4 further legal-judgement flags: simple-vs-advanced e-signature
sufficiency (spec §3 non-goals), DB-level append-only enforcement (spec §4.1), hash target
canonical-vs-PDF (spec §5), and click-to-agree evidential weight vs a dedicated e-signature provider
(spec §9). **Total legal-judgement flags to resolve: 24.**

Until every legal-judgement flag is resolved and the owner flips the gate, the feature stays in the
staging-only, DRAFT-watermarked, `LEGAL_REVIEW_REQUIRED` state.

## As-built addendum: signing-integrity correction (PR #516, 2026-07-14)

The ceremony's PR-B UI shipped green but with signing-integrity gaps that green CI missed: the
ceremony presented only a 6-term summary and deferred the full agreement to after signing; the sign
call omitted `agreementVersion`, so the displayed text was not bound to the recorded evidence; the
pre-sign legal banner was hardcoded rather than status-driven; and the signed-state copy implied a
full evidence surface already existed. The Fable-lead-settled correction (this PR) closes them
without changing the backend sign contract:

- **Full-text review.** A new NO-PII, platform-global admin read
  `GET /api/v1/admin/agreement/current` (`src/api/admin/agreement/routes.ts`, registered in the admin
  plugin, gated on the ceremony capability `merchant:sign-agreement`) returns
  `{ version, text, contentHash, isDraft, gated }`, where `text` is the FULL current agreement whose
  sha256 equals `contentHash` (the exact bytes the evidence record pins). It returns
  `getCurrentAgreement()` (not `getServedAgreement()`) precisely because the sign service signs and
  version-checks against the current version. The ceremony fetches this and renders the complete
  agreement inline; the scroll-to-end review gate now runs over the FULL text (the enumerated key
  terms remain a summary above it).
- **Version echo.** The ceremony's sign call now always echoes the exact displayed `version`. The
  backend's existing `agreementVersion` integrity check (409 `AGREEMENT_VERSION_MISMATCH` when the
  echoed version is not current) is therefore actually exercised, binding display to evidence.
- **Stale-version handling.** On `AGREEMENT_VERSION_MISMATCH` the UI forces a reload + re-review
  (re-fetches the agreement, re-arms the scroll and key-terms gates, shows a mismatch notice) instead
  of silently signing or auto-retrying with the new version.
- **Status-driven banner.** The pre-sign pending-legal-review banner is now shown iff the read
  reports `gated`/`isDraft`; a non-draft version shows no watermark/pending banner.
- **Honest signed-state copy.** The signed confirmation refers only to the contract summary already
  on the Merchant 360 record and no longer implies the complete signing-evidence surface exists (that
  remains the separate lane-2 evidence read, `contract:view-evidence`, not built here).

No change to the sign service or route logic beyond the additive read route. The
`LEGAL_REVIEW_REQUIRED` staging-only, DRAFT-watermarked posture is unchanged.
