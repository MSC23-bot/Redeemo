# D65 legal-object + evidence-binding decision packet

Status: FABLE-AUTHORED · directionally APPROVED by Codex/owner 2026-07-15 · amended for the four
Codex correction-round gaps below · owner-approval-required BEFORE implementation.
Trigger: the ceremony reviews the RAW canonical template (literal `{{placeholders}}`) while the
signed PDF substitutes real values; `contentHash` hashes the unsubstituted source. Verified against
live source. Holds PR #516 (interim head 99bae9bf) until this architecture is approved + implemented
+ renewed through Codex + owner SHA-bound approval.

## 0. Owner decisions LOCKED (2026-07-15)

- Legal-object direction APPROVED: the merchant reviews + accepts the merchant-personalised
  contractual body; signing-event evidence is separate and appended to the final PDF; retain the
  canonical template hash; add reviewed-body + PDF integrity binding; preserve the merchant identity
  used at signing; assisted + self-serve share ONE evidence standard.
- `reviewedContentHash` is SERVER-AUTHORITATIVE. APPROVED.
- The client ECHOES the server-returned hash; NO browser-side recomputation. APPROVED.
- Self-serve parity + Merchant Portal handoff (merchant-web half). APPROVED.
- The sixth additive migration is APPROVED IN PRINCIPLE, but its exact columns are NOT finalized and
  PR #532 is NOT updated until exact reviewed-body preservation is adjudicated (done in §6 below;
  final column set still owner-confirmed).
- Solicitor questions APPROVED to proceed, ADDING exact-body retention/reconstruction + body-vs-
  evidence composition (§12).
- Production legal gate (`AGREEMENT_LEGAL_REVIEW_REQUIRED`) UNCHANGED.

## 0b. Codex correction round 2 (2026-07-15): five further gaps corrected

Directional model accepted; owner approval withheld pending these five (all corrected doc-only here):
storage fail-closed (§16), legacy-v1 accepted object (§12 rewritten), self-serve preview contract
(§4b), personal-data/retention truth (§6/§11/§13 corrected), pdfHash integrity lifecycle (§17).

## 1. Verified facts (live source)

- v2 template (`docs/legal/drafts/merchant-agreement-v2-draft.md`, embedded `agreement-v2-source.ts`)
  has 13 `{{placeholders}}`. `substitutePlaceholders` resolves them at PDF-render time only.
- `contentHash = computeContentHash(MERCHANT_AGREEMENT_V2_SOURCE)` hashes the UNSUBSTITUTED source.
- The template's "Execution (signature)" section (md lines 271-284) itself lists signer/role/business
  + version + contentHash + method + signedAt + witness + IP + user-agent as `{{placeholders}}`.
- `renderAgreementPdf` (`pdf.ts`) renders the WHOLE substituted template AND THEN appends its own
  13-row "Execution and evidence" table of the same values: **the evidence is composed TWICE** and
  can diverge (Codex gap 4).
- The sign service passes real merchant identity into the PDF from the MUTABLE merchant relation but
  persists NO structured identity snapshot on the record.
- Self-serve `acceptContract` (`onboarding/service.ts`) takes `signerName` OPTIONAL, falls back to
  `SELF_SERVE_SIGNER_NOT_CAPTURED`, and HARDCODES `signerRoleConfirmation: 'Self-serve (merchant
  portal)'` (Codex gap 2).
- Legacy v1 (`LEGACY_CONTRACT_TEXT`, prod self-serve fallback) has NO placeholders.
- No `MerchantAgreementRecord` rows exist (D65 migration merged but UNAPPLIED): no backfill.

## 2. Placeholder classification (CORRECTED, Codex gap 3)

Three classes, not two. The prior packet wrongly lumped known-before facts with event metadata.

| Placeholder | Class | When known | In reviewed body? |
|---|---|---|---|
| businessLegalName, tradingName, companyNumber, vatNumber | CONTRACTUAL PARTY | before (merchant profile) | YES, resolved |
| signerName, signerRoleConfirmation | SIGNATORY | during ceremony (owner types) | YES, resolved once entered |
| agreementVersion, contentHash (canonical), method | KNOWN-BEFORE FACT | before signing (deterministic) | YES, resolved in the reviewed material (they are verifiable facts, not event data) |
| signedAt (final), ipAddress, userAgent, the actual witnessing event (actorAdminName is the witness IDENTITY, known; the witnessing is the event) | EVENT-CREATED EVIDENCE | only at the signing event | NO. Shown pre-sign as a SEPARATE NOTICE of what-will-be-recorded; real values only in the final PDF evidence block |

OWNER-APPROVED: a clearly separate pre-sign notice lists which evidence will be recorded when
signing (date/time, IP, device/user-agent, and (assisted) the witnessing rep). Unknown event values
are NEVER shown as completed contractual facts.

## 3. DECISION: the legally accepted object

The legally accepted object = the **merchant-personalised contractual body**: the template with the
CONTRACTUAL PARTY + SIGNATORY + KNOWN-BEFORE FACT placeholders resolved, reviewed and accepted by the
owner. EVENT-CREATED evidence is appended at the signing event. The final PDF = the accepted body +
ONE completed evidence block. It is a DEFINED COMBINATION, not the raw template, not the PDF alone.

## 4. Preview / input lifecycle (CORRECTED, Codex gap 1)

The reviewed body contains the signer name + role, which are entered DURING the ceremony, so a
merchant-scoped GET cannot produce it, and signer PII must not enter URL/query logs.

- The personalised render is a POST: `POST /admin/merchants/:id/agreement/preview` with a body of the
  normalized `{ signerName, signerRoleConfirmation }` (server resolves merchant identity + current
  version + method server-side). PII travels in the request body, never the query string. Server-
  authoritative render.
- The reviewed body + `reviewedContentHash` are produced ONLY AFTER all contractual inputs are
  available (signer name + role entered). Before that, no reviewable body / no hash / signing blocked.
- Normalization is deterministic + server-side (trim, collapse internal whitespace, Unicode NFC). The
  SAME normalized values feed the reviewed body, the hash, the sign call, and the persisted record.
- INVALIDATION: changing signerName, signerRoleConfirmation, merchant legal identity, agreement
  version, or ANY contractual input invalidates the previous `reviewedContentHash` and RESETS the
  scroll-review + all acceptance controls; the owner must re-review the newly-rendered body.
- Signing submits exactly the normalized inputs + the server-returned `reviewedContentHash`. The
  server RE-RENDERS the body from those same normalized inputs, recomputes the hash, and 409s
  `AGREEMENT_REVIEW_HASH_MISMATCH` (and `AGREEMENT_VERSION_MISMATCH` for template drift) BEFORE any
  PDF render/upload, DB transaction, contractStatus mutation, or audit write.

## 4b. Self-serve preview contract (CORRECTED, Codex gap 3)

Both lanes share ONE renderer + normalizer + hash module (server-side, single source of truth); the
prior packet only defined the admin route. The merchant lane needs its OWN merchant-authenticated
preview route (merchant portal auth resolves the caller's OWN merchant via `req.user.sub`, never a
cross-merchant id).

| | Assisted (admin) | Self-serve (merchant) |
|---|---|---|
| Route | `POST /admin/merchants/:id/agreement/preview` | `POST /merchant/onboarding/agreement/preview` (own merchant, no id param; resolved from `req.user.sub`) |
| Auth / scope | `authenticateAdmin` + `merchant:sign-agreement` + `assertFieldPreLiveScope` | merchant-portal auth preHandler; own-merchant only |
| Request body (`.strict()`) | `{ signerName, signerRoleConfirmation }` | `{ signerName, signerRoleConfirmation }` |
| Max lengths | signerName <= 200, signerRoleConfirmation <= 200 (trimmed, NFC) | same |
| Rate limiting | existing admin limiter; assess a bounded preview limit (deterministic render is cheap but merchant-facing) | existing merchant limiter; assess a bounded per-merchant preview limit |
| Response | `{ version, personalisedText, reviewedContentHash, canonicalContentHash, isDraft, gated }` | identical shape |
| Invalidation | any input change -> new POST -> new hash -> reset review + accept gates | identical |
| Hash echo | client echoes the server-returned `reviewedContentHash`; NO browser recompute | identical |

Both preview routes and both sign paths call the SAME internal render/normalize/hash function, so the
two lanes cannot diverge on wording, normalization, or hash. Server is authoritative in both.

## 5. Hashes stored + what each proves

| Hash | Over | Proves | Change |
|---|---|---|---|
| `contentHash` (canonical) | unsubstituted template source | the TEMPLATE VERSION (append-only registry integrity) | RETAIN as-is |
| `reviewedContentHash` (NEW) | the exact personalised reviewed body (party + signatory + known-before facts resolved; NO event metadata) | the owner reviewed THIS exact personalised wording | ADD; server-authoritative; client echoes |
| `pdfHash` (NEW) | the final PDF bytes | the exact stored artifact (record<->artifact link, R2-tamper detection) | ADD |

## 6. Exact reviewed-body preservation (CORRECTED, Codex gap 4a)

A hash plus MUTABLE render code does NOT guarantee the exact reviewed text is reconstructable years
later (the template registry, the merchant profile, and the render code can all change).

ADJUDICATION: persist the EXACT reviewed body as an IMMUTABLE artifact = the pre-image of
`reviewedContentHash`. Recommended: a `reviewedBody` immutable TEXT column on the record (the exact
UTF-8 bytes that hash to `reviewedContentHash`; self-verifying `sha256(reviewedBody)==reviewedContentHash`;
zero dependence on mutable template/merchant/render). Because `reviewedBody` embeds the resolved
merchant identity + signatory, it SUBSUMES a separate frozen-identity snapshot: the four identity
columns proposed in the prior draft are DROPPED as redundant (reconstruction = `reviewedBody` +
the existing event columns signedAt/IP/UA/witness). Alternative considered: an append-only R2 object
like `pdfKey`; rejected as heavier for a few-KB-per-record text with no shared-artifact benefit (the
body is per-merchant, not a shared version).

Privacy/retention (CORRECTED, Codex gap 4): `reviewedBody` CONTAINS PERSONAL DATA: the signatory's
typed name + role, and for a SOLE TRADER the business legal name is itself the individual's personal
name. The prior "NO third-party PII" and "standard contractual necessity, retained for the life of
the contract" claims are WITHDRAWN as pre-deciding a solicitor/privacy matter. Lawful basis,
claims-period retention duration, data-subject access/export, erasure-restriction (whether/when a
signed-contract record may be erased vs retained), and legal-hold treatment are RESERVED to the
solicitor/privacy decision packet (§13). What this packet fixes technically: `reviewedBody` is the
immutable pre-image of `reviewedContentHash` (it does not add IP/UA/witnessEmail, which stay in the
event columns under the lane-2 tiering); its lawful-basis and retention are NOT decided here.

Final migration column set (owner-confirm before implementation): `reviewedContentHash` (NOT NULL),
`reviewedBody` (NOT NULL, immutable), `pdfHash` (NOT NULL). All ADD COLUMN on the empty (unapplied)
D65 table via a NEW additive migration (do NOT edit the merged one); count 5 -> 6; PR #532 updated
ONLY after this column set is confirmed.

## 7. One authoritative PDF composition (CORRECTED, Codex gap 4b)

Exactly one evidence block; no duplication between the template's Execution section and a renderer
table.

- The v2 template's "Execution (signature)" section is TRIMMED (a new draft version + regenerated
  source; bumps the hash, safe while pre-solicitor/unsigned): it KEEPS the contractual attestation +
  signatory/business/version/canonical-hash/method (known-before facts, part of the reviewed body);
  it REMOVES the event-created lines ({{signedAt}}, {{ipAddress}}, {{userAgent}}, {{actorAdminName}}).
- The final PDF = `reviewedBody` rendered (the exact reviewed text, contractual facts included) + ONE
  appended "Signing evidence" block containing ONLY the event-created values (final signedAt, IP,
  user-agent, witnessing rep, drawn-signature note). The renderer STOPS re-listing the contractual
  facts (they are in the reviewed body). No field appears twice; the two can never diverge.
- `pdfHash` is taken over these final bytes.

## 8. Self-serve evidence parity (CORRECTED, Codex gap 2)

For NEW D65 evidence records, BOTH lanes require + persist the REAL typed signer name + authority
role. `SELF_SERVE_SIGNER_NOT_CAPTURED` and the hardcoded `'Self-serve (merchant portal)'` role are
REMOVED from the new evidence path.

- `acceptContract` signature: `signerName` + `signerRoleConfirmation` become REQUIRED for the D65
  record path (the reviewed-body/hash flow). The merchant-web form must collect + SEND both (the
  Merchant Portal session owns that UI change; this packet is the contract).
- Caller inspection required before implementation: every `acceptContract` caller (onboarding
  `POST /contract/accept`; any staff/claim path), and the legacy `MerchantContract` flip (which may
  remain lenient for the OLD model but the NEW `MerchantAgreementRecord` must have real values).
  The required signer name + role apply to the D65 (v2+) evidence path. Legacy v1 stays OUTSIDE that
  path (§12): it writes the legacy `MerchantContract` (which has no D65 signer capture) as its honest
  lesser-standard fallback, so it does NOT gain, nor claim, the D65 signer-name+role requirement.
- Compatibility: no existing D65 records, so requiring the fields breaks no data; the change is a
  request-contract tightening surfaced to the merchant-web form.

## 9. Both-lanes cross-check (D65 v2+ path; legacy v1 is §12, outside this path)

| Aspect | Assisted (ceremony) | Self-serve (merchant portal) |
|---|---|---|
| Who reviews | merchant owner on the rep's device | merchant owner in the portal |
| Signer name + role | typed by owner; required | typed by owner; required (gap-2 fix) |
| Personalised body | server POST preview, normalized inputs | same server render contract (Merchant Portal UI) |
| reviewedContentHash | server-authoritative, client echoes | same |
| Event evidence | signedAt/IP/UA + witnessing rep | signedAt/IP/UA, method SELF_SERVE_CLICK, no witness |
| Immutable body | `reviewedBody` persisted | `reviewedBody` persisted |
| PDF composition | one body + one evidence block | one body + one evidence block |
| Legal gate | production ceremony refused while gated | self-serve serves legacy 1.0 in prod while v2 is draft |

## 10. Zero-write mismatch behavior

`AGREEMENT_VERSION_MISMATCH` (template drift) and `AGREEMENT_REVIEW_HASH_MISMATCH` (reviewed-body
drift: any contractual input changed, or a tampered echo) both 409 BEFORE: PDF render, R2 upload,
the DB transaction, the contractStatus flip, and the audit write. Nothing is persisted on a mismatch.
The client resets the review + acceptance gates and re-fetches the current personalised body.

## 11. Privacy / visibility (unchanged tiering)

- Personalised body + `reviewedBody` contain the merchant's OWN identity: already admin-visible in
  M360; the preview route is merchant-scoped, gated `merchant:sign-agreement` + `assertFieldPreLiveScope`.
- Hashes are non-PII.
- IP / user-agent / witnessEmail remain WITHHELD from the ordinary evidence view (lane-2 tiering),
  reserved for the separately-gated SUPER_ADMIN/legal-dispute export (solicitor/privacy-approved).

## 12. Compatibility + legacy-v1 accepted object (CORRECTED, Codex gap 2)

The prior "legacy v1 reviewedBody == canonical source" was a FALSE PARITY: v1 (`LEGACY_CONTRACT_TEXT`)
is a short flat terms text with NO signer/role/business/execution section, so a v1 "reviewedBody"
would carry none of the personalised execution attestation the D65 evidence standard requires.

ADJUDICATION: keep legacy v1 OUTSIDE the new D65 evidence path. When the served version is legacy
v1 (the production self-serve fallback while v2 remains a pre-solicitor draft), signing produces ONLY
the legacy `MerchantContract` row (status flip + signedAt + ipAddress + tcVersion) as its own,
explicitly LESSER, honestly-labelled evidence: NO `MerchantAgreementRecord`, NO `reviewedBody`, NO
`reviewedContentHash`, NO PDF. It does NOT claim D65 parity. The full D65 evidence path
(personalised reviewedBody + hashes + PDF + record) applies to v2+ ONLY. When v2 is solicitor-
approved and production-live, v1 is retired. Alternative considered (a deterministic v1 execution/
attestation addition to force v1 into the D65 path): REJECTED as effort/risk on a contract being
retired.

This also resolves the storage-fail-closed rule (§16): the "no binding sign without full evidence"
rule binds the D65 (v2+) path; the legacy-v1 path keeps its MerchantContract evidence and is not
subject to the D65 PDF/record requirement.

- No existing D65 records -> new NOT NULL columns + required fields break no data.
- Legacy `MerchantContract` rows untouched (different model); v1 continues to write them.
- Production legal gate unchanged.

## 13. Solicitor / legal questions (expanded per owner)

- Is "reviewed personalised body (immutably preserved + hashed) + a separate signing-evidence block"
  the correct legal construction of "what was agreed"?
- EXACT-BODY RETENTION/RECONSTRUCTION (added): is persisting the full personalised `reviewedBody`
  the right immutable record, and is its retention (business identity + full terms, contract-life)
  acceptable under UK-GDPR?
- BODY-VS-EVIDENCE COMPOSITION (added): confirm the one-body + one-evidence-block composition, and
  that known-before facts (version/hash/method) belong in the reviewed body while final signedAt/IP/
  UA/witnessing are evidence-only.
- Is typed-name simple e-signature + this evidence pack sufficient execution?
- Self-serve vs assisted: same evidence standard confirmed.
- PERSONAL-DATA / RETENTION (added, Codex gap 4), RESERVED here (not pre-decided): the lawful basis
  for storing `reviewedBody` (signatory personal data; sole-trader business name = personal name);
  the claims-period retention duration for a signed-contract record; data-subject access/export of a
  signed agreement; erasure-restriction (whether a signed-contract record is exempt from erasure and
  on what basis); and legal-hold treatment during a dispute.
- Legacy-v1 lesser evidence standard (§12): confirm keeping v1 outside the D65 evidence path (its
  `MerchantContract`-only record) is an acceptable honest production fallback until v2 goes live.

## 13b. Five-findings cross-check (Codex correction round 2)

| # | Finding | Correction | Section |
|---|---|---|---|
| 1 | Self-serve signs binding with no PDF/record when storage off | D65 (v2+) fail-closed in shared envs; no bind without reviewedBody+PDF+record; test stub only | §16 |
| 2 | Legacy-v1 false parity (reviewedBody==canonical gives no execution attestation) | v1 kept OUTSIDE the D65 path; MerchantContract-only, honestly lesser; no parity claim | §12 |
| 3 | Only the admin preview defined | Added merchant-authenticated own-merchant POST preview; both lanes share one renderer/normalizer/hash; strict bodies, max lengths, auth/scope, rate limit, response, invalidation, echo | §4b |
| 4 | "NO third-party PII" + pre-decided lawful-basis/retention | Withdrawn; reviewedBody IS personal data (signer + sole-trader); lawful basis/retention/access/erasure/legal-hold RESERVED to solicitor | §6, §11, §13 |
| 5 | Stored pdfHash described as tamper detection | Full lifecycle: capture-at-sign, bind on record, re-hash on retrieval, fail-closed + audit on mismatch | §17 |

## 14. Rejected alternatives

1. PDF-only hash: PDF has post-sign metadata unreviewable pre-sign; pdfkit bytes not reliably
   deterministic; the reviewed-text hash is the clean pre-sign object.
2. Status quo (raw template + canonical hash only): the legal defect.
3. Substitute ALL placeholders before review: impossible for signedAt/IP/UA/witnessing.
4. Hash + mutable render code for reconstruction: does not guarantee exact-body recovery -> persist
   `reviewedBody`.
5. Separate frozen-identity columns alongside `reviewedBody`: redundant (body embeds identity).
6. GET preview with signer name/role: cannot (entered later) + PII-in-query -> POST preview.

## 15. Exact remaining OWNER decisions

1. Confirm the final migration column set (§6): `reviewedContentHash`, `reviewedBody`, `pdfHash`
   (identity columns dropped). Then #532 updates 5 -> 6.
2. Confirm the pre-sign evidence NOTICE wording approach (§2) and that version/hash/method sit in the
   reviewed body.
3. Confirm `reviewedBody` (immutable text column) as the exact-body preservation vs an R2 artifact.
4. Confirm the one-body + one-evidence-block PDF composition + the template Execution trim (§7).
5. Confirm the self-serve required signer-name+role contract + the Merchant Portal handoff scope (§8),
   AND the merchant-authenticated preview route contract (§4b).
6. Confirm the storage fail-closed rule for D65 v2+ signatures in shared environments (§16).
7. Confirm keeping legacy v1 outside the D65 evidence path (MerchantContract-only fallback) (§12).
8. Confirm the pdfHash capture + re-hash-on-retrieval verification lifecycle (§17; lane-2 implements
   the retrieval check).
9. The §13 solicitor questions incl. the reserved personal-data/retention set (production gate stays
   until answered).

## 16. Evidence-storage fail-closed (CORRECTED, Codex gap 1)

Verified: the ceremony (`signAgreementInPerson` -> `renderAndStoreAgreementPdf`) ALREADY fails
closed with `STORAGE_NOT_ENABLED` when storage is dark. But self-serve `acceptContract` with
`STORAGE_ENABLED=false` sets `pdfKey=null`, STILL flips `contractStatus=SIGNED` + writes the
`MERCHANT_CONTRACT_ACCEPTED` audit, and creates the `MerchantAgreementRecord` only `if (pdfKey)` ->
a BINDING v2 signature can complete with NO PDF and NO evidence record. That is the gap.

APPROVED D65 RULE: no binding D65 (v2+) signature may complete in a SHARED environment without the
immutable `reviewedBody`, the PDF, and the `MerchantAgreementRecord` (all in one transaction). If
storage is unavailable when signing a D65 version, the sign FAILS CLOSED (`STORAGE_NOT_ENABLED`)
BEFORE any contractStatus flip or audit write; nothing is persisted. Test/local may inject a storage
stub so the path runs end-to-end, but MUST NOT flip a binding SIGNED state without the full evidence;
shared environments (staging/production) are never weakened. Legacy v1 (§12) is outside the D65 path
and keeps its `MerchantContract` evidence, which needs no PDF.

### Storage behavior table

| Lane / version | Storage available | Storage unavailable (shared env) | Storage stub (test/local) |
|---|---|---|---|
| Assisted ceremony (v2+) | full evidence written | FAIL-CLOSED `STORAGE_NOT_ENABLED`, no flip/audit (already so) | stub -> full evidence path runs; still requires evidence to bind |
| Self-serve (v2+) | full evidence written (FIX) | FAIL-CLOSED (FIX: today it wrongly flips SIGNED with no record) | stub -> full evidence path; no bind without evidence |
| Self-serve legacy v1 | `MerchantContract` only (no PDF needed) | `MerchantContract` only (v1 not D65; not storage-gated) | same |

## 17. PDF integrity verification lifecycle (CORRECTED, Codex gap 5)

A stored hash ALONE is not tamper detection: tampering is only detectable if retrieved bytes are
re-hashed and compared. Approved lifecycle:

- CAPTURE: at sign time, the final PDF bytes are hashed (`pdfHash = sha256(pdfBytes)`) at the moment
  they are produced and written to R2, and `pdfHash` is stored on the `MerchantAgreementRecord` IN
  THE SAME sign transaction as `pdfKey`. Bytes hashed == bytes stored (no re-render between).
- BIND: `pdfHash` + `pdfKey` are both on the immutable record; the record is the authority linking a
  specific stored object to its expected hash.
- VERIFY ON RETRIEVAL: every evidence download / presign-fetch (the lane-2 evidence-read path)
  re-hashes the retrieved bytes and compares to the stored `pdfHash` BEFORE returning them.
- FAIL-CLOSED + AUDIT ON MISMATCH: a mismatch REFUSES the download (fail-closed), writes an
  integrity-failure audit event, and surfaces an ops/legal alert. The record is never silently
  served as authentic when its bytes no longer match.
- This lifecycle spans this packet (sign-time capture) + lane-2 (retrieval-time verification); lane-2
  must implement the re-hash-on-retrieval, not just store the hash.

Nothing implemented until this amended packet is approved; #516 remains held. On approval, #516 is
reworked to this contract (POST personalised preview + normalized inputs + server-authoritative
reviewedContentHash + reviewedBody persistence + one-block PDF + template trim + new migration + docs),
adversarially re-reviewed, then renewed Codex + owner SHA-bound approval. Self-serve parity coordinates
with the Merchant Portal session.
