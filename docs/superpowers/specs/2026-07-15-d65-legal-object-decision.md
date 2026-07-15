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

Privacy/retention (to the solicitor packet): `reviewedBody` duplicates the business's own
contractual identity + full agreement text onto the immutable record; standard contractual necessity,
retained for the life of the contract; it holds NO third-party PII (no IP/UA/witnessEmail: those stay
in the event columns under the lane-2 tiering).

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
  Legacy v1 self-serve (no placeholders) STILL needs a real signer name + role on its evidence record.
- Compatibility: no existing D65 records, so requiring the fields breaks no data; the change is a
  request-contract tightening surfaced to the merchant-web form.

## 9. Both-lanes cross-check

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

## 12. Compatibility

- Legacy v1 (no placeholders): personalised render is a no-op -> reviewedBody == canonical source ->
  `reviewedContentHash == canonicalContentHash`; still requires a real signer name + role on its
  evidence record. Prod self-serve fallback keeps working.
- No existing D65 records -> new NOT NULL columns + required fields break no data.
- Legacy `MerchantContract` rows untouched (different model).
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
5. Confirm the self-serve required signer-name+role contract + the Merchant Portal handoff scope (§8).
6. The §13 solicitor questions (production gate stays until answered).

Nothing implemented until this amended packet is approved; #516 remains held. On approval, #516 is
reworked to this contract (POST personalised preview + normalized inputs + server-authoritative
reviewedContentHash + reviewedBody persistence + one-block PDF + template trim + new migration + docs),
adversarially re-reviewed, then renewed Codex + owner SHA-bound approval. Self-serve parity coordinates
with the Merchant Portal session.
