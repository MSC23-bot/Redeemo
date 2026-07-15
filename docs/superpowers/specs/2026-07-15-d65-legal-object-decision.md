# D65 legal-object + evidence-binding decision packet

Status: FABLE-AUTHORED DECISION PACKET · owner-approval-required BEFORE implementation.
Trigger: Codex source cross-check found the ceremony reviews the RAW canonical template
(literal `{{placeholders}}`) while the signed PDF substitutes real values; `contentHash` hashes
the UNSUBSTITUTED source. So the current binding proves the template VERSION, not that the owner
reviewed the exact personalised wording they are bound to. Confirmed against live source.
Holds PR #516 (interim head 99bae9bf) until this architecture is approved.

## 1. Verified facts (live source)

- The v2 canonical template (`docs/legal/drafts/merchant-agreement-v2-draft.md`, embedded as
  `agreement-v2-source.ts`) contains 13 `{{placeholders}}`.
- `substitutePlaceholders(source, input)` (`pdf.ts`) resolves them at PDF-render time only.
- `contentHash = computeContentHash(MERCHANT_AGREEMENT_V2_SOURCE)` (`versions.ts`) hashes the
  UNSUBSTITUTED source. There is no reviewed/rendered-text hash and no PDF hash.
- The admin read route (`GET /admin/agreement/current`, added on #516) returns
  `getCurrentAgreement().content` = the raw template. The ceremony renders that raw text.
- The sign service passes the real `businessLegalName/tradingName/companyNumber/vatNumber`
  (from the mutable merchant relation) INTO the PDF, but does NOT persist them as structured
  columns on `MerchantAgreementRecord`. Only the PDF immortalises the identity.
- Legacy v1 (`LEGACY_CONTRACT_TEXT`, the production self-serve fallback) has NO placeholders:
  its reviewed text already equals its PDF body; `reviewedHash == canonicalHash` there.
- No `MerchantAgreementRecord` rows exist anywhere (the D65 migration is merged but UNAPPLIED),
  so there is NOTHING to backfill: new columns can be NOT NULL for all future records.
- The spec itself carries an open `[SOLICITOR: ... acceptable evidence integrity ...]` question
  and states the hash is over the source, not the PDF: the ambiguity was resolved the wrong way.

The 13 placeholders split into two legally distinct classes:
- CONTRACTUAL (must be resolved BEFORE review): businessLegalName, tradingName, companyNumber,
  vatNumber, signerName, signerRoleConfirmation.
- POST-SIGN EVENT METADATA (evidence of the signing act, unknowable pre-sign): signedAt,
  ipAddress, userAgent, actorAdminName, method, agreementVersion, contentHash.

## 2. DECISION: the legally accepted object

The legally accepted object is the **merchant-personalised rendered contractual agreement**: the
canonical template with the CONTRACTUAL placeholders resolved to this merchant's real values,
reviewed and accepted by the owner. Post-sign event metadata is SIGNING EVIDENCE appended at the
moment of signing, not part of the reviewed contractual body. The final PDF = the accepted
personalised body + the event-evidence block.

It is a DEFINED COMBINATION, not any single artifact:
- NOT the raw canonical template (the current defect: owner reviews placeholders).
- NOT the final PDF alone (contains post-sign metadata the owner cannot review before signing).
- The accepted body (reviewed + hashed) PLUS the event evidence (recorded at sign).

## 3. What the owner sees before signing (both lanes)

- ASSISTED ceremony: the backend renders the merchant-personalised contractual body (real legal
  name/trading name/company/VAT + the owner's typed signer name/role once entered); event-metadata
  fields render as explicit labelled "to be recorded at signing" markers (e.g. "Signed at: [on
  signing]", "Witnessed by: [rep, on signing]") so they are visibly NOT part of the reviewable
  terms. The scroll-to-end review gate runs over THIS personalised body.
- SELF-SERVE (merchant-web): MUST reach parity: the same personalised body + the same
  reviewed-hash echo, so the two lanes do not create different legal-evidence standards. The
  merchant-web edit is owned by the Merchant Portal session (cross-session boundary); this packet
  defines the contract, that session implements the merchant-web half.

## 4. Hashes stored + what each proves

| Hash | Over | Proves | Change |
|---|---|---|---|
| `contentHash` (canonicalContentHash) | unsubstituted template source | the TEMPLATE VERSION (append-only registry integrity) | RETAIN as-is |
| `reviewedContentHash` (NEW) | the exact personalised contractual body the owner reviewed (contractual placeholders resolved; event-metadata in a defined canonical pre-sign form) | the owner reviewed THIS personalised wording | ADD (new column) |
| `pdfHash` (NEW, recommended) | the final PDF bytes | the exact stored artifact (record<->artifact link, R2-tamper detection) | ADD (new column) |

## 5. Rendering + verification contract

- A single deterministic, merchant-scoped render function is the source of truth for: ceremony
  display, self-serve display, `reviewedContentHash` computation, and the final PDF body. Same
  inputs -> same bytes. Deterministic UTF-8, fixed newline normalisation, stable substitution order,
  no locale/timezone nondeterminism in the REVIEWED body (event metadata is excluded from it).
- `reviewedContentHash` is computed over the REVIEWED-body form (contractual placeholders resolved;
  event-metadata rendered as fixed canonical pre-sign tokens, identical client and server).
- SERVER IS AUTHORITATIVE: at sign time the server re-renders the personalised body for the
  merchant, recomputes `reviewedContentHash`, and 409s a new `AGREEMENT_REVIEW_HASH_MISMATCH` if the
  client echo differs, BEFORE any PDF render/upload, DB transaction, contractStatus mutation, or
  audit write. `agreementVersion` echo (template-version binding) is retained alongside.
- Client-side recomputation-and-echo of `reviewedContentHash` is OPTIONAL defence-in-depth (the
  server re-derives regardless). If kept, the client hash MUST use the identical deterministic
  UTF-8 canonicalisation; otherwise the client simply echoes the hash the read returned.

## 6. Immutable reconstruction context (NEW columns)

Store on `MerchantAgreementRecord`, at signing, the frozen contractual identity used in the
personalised body: `businessLegalNameAtSigning` (NOT NULL), `tradingNameAtSigning`,
`companyNumberAtSigning`, `vatNumberAtSigning` (nullable). This lets the exact agreement be
verified/reconstructed even if the merchant profile later changes, without parsing the PDF. The
PDF remains the primary artifact; these columns are structured defence-in-depth.

## 7. Migration effect (obeys the no-edit-historical rule)

Do NOT edit the merged-but-unapplied D65 migration. Add ONE new additive migration
`20260715xxxxxx_agreement_record_reviewed_evidence` adding: `reviewedContentHash` (NOT NULL),
`pdfHash` (NOT NULL), and the four identity-snapshot columns. All ADD COLUMN, no rewrite; the base
table is empty so NOT NULL-without-default is safe. This raises the unapplied packet count from
FIVE to SIX; the migration reconciliation packet (PR #532) and its runbook must be updated
accordingly (append the 6th, re-confirm additive/order: it depends on the D65 table existing first,
so it sorts after `20260714000000`).

## 8. Compatibility

- Legacy v1 (no placeholders): the personalised render is a no-op -> reviewed body == canonical
  source -> `reviewedContentHash == canonicalContentHash`. The production self-serve fallback keeps
  working uniformly. No special-casing needed.
- No existing D65 records -> no backfill; new NOT NULL columns are safe.
- Legacy `MerchantContract` (pre-D65 click-to-agree) rows: untouched (different model).
- The solicitor production gate (`AGREEMENT_LEGAL_REVIEW_REQUIRED`) is unchanged and orthogonal.

## 9. Privacy / ordinary-admin visibility

- The personalised body contains the merchant's OWN legal identity: already visible to admins
  acting on that merchant (M360); no new exposure. The read route becomes MERCHANT-SCOPED
  (it must resolve the merchant's identity), gated `merchant:sign-agreement` + `assertFieldPreLiveScope`.
- `reviewedContentHash`/`pdfHash` are non-PII.
- IP / user-agent / witnessEmail remain WITHHELD from the ordinary evidence view (the lane-2
  tiering stands): reserved for the separately-gated SUPER_ADMIN/legal-dispute export, solicitor/
  privacy-approved. This decision does not change that tiering.

## 10. API changes

- Agreement read: from global `GET /admin/agreement/current` (raw template) TO merchant-scoped
  `GET /admin/merchants/:id/agreement/preview` returning `{ version, personalisedText, reviewedContentHash,
  canonicalContentHash, isDraft, gated }` (personalised body + both hashes + status). Same capability.
- Sign body (`.strict()`): ADD `reviewedContentHash` (required for v2; for legacy-1.0 no-placeholder
  it equals canonical). Keep `agreementVersion`. New 409 `AGREEMENT_REVIEW_HASH_MISMATCH`.
- Self-serve `acceptContract`: same `reviewedContentHash` echo + server re-derive + verify (parity).

## 11. Rejected alternatives

1. PDF-only hash (no reviewed-text hash): the PDF has post-sign metadata unreviewable pre-sign, and
   pdfkit byte-output is not reliably deterministic; a reviewed-text hash is the clean pre-sign object.
2. Status quo (raw template + canonical hash only): the legal defect itself.
3. Substitute ALL placeholders before review: impossible for signedAt/IP/UA/witness (no signing
   event exists yet); those are evidence, not reviewable terms.
4. No frozen identity (rely on merchant relation + PDF): insufficient for structured reconstruction
   if the profile changes.

## 12. Legal / solicitor questions

- Is "reviewed personalised body (hashed) + separately-recorded signing evidence" the correct legal
  construction of "what was agreed", vs. requiring the final PDF-with-metadata as the sole object?
- Must event-metadata appear pre-sign as labelled "to be completed" fields, or be omitted from the
  reviewed body entirely? (Recommend: labelled, for transparency.)
- Retention of the frozen identity snapshot alongside the merchant relation: any UK-GDPR concern in
  duplicating the business's own contractual identity onto the immutable record? (Assessed: standard
  contractual necessity, retained for the life of the contract.)
- Self-serve evidence-standard parity requirement + timing.

## 13. Test strategy

- Deterministic render: same inputs -> identical bytes (golden, incl. UTF-8 + newline edge cases).
- reviewedContentHash: server re-derive == client echo for the happy path; a tampered echo ->
  `AGREEMENT_REVIEW_HASH_MISMATCH` BEFORE any PDF/DB/status/audit (assert none occurred).
- Placeholder resolution: no `{{}}` remains in the reviewed body's contractual fields; event-metadata
  fields show the labelled pre-sign markers, not raw braces.
- Version + review hash both bind: stale version -> VERSION_MISMATCH; stale review hash -> REVIEW_HASH_MISMATCH.
- Legacy v1 no-op parity: reviewed == canonical, hashes equal, signs cleanly.
- Frozen identity: the record's identity snapshot == the values rendered into the body/PDF.
- Self-serve parity: same reviewed-hash contract (contract-level test; merchant-web UI by that session).

## 14. Exact remaining OWNER decisions

1. Approve the legal-object determination (§2): personalised reviewed body + separate evidence.
2. Approve the new additive migration (§7): reviewedContentHash + pdfHash + 4 identity columns;
   packet count 5 -> 6; update PR #532.
3. Event-metadata pre-sign display: labelled-placeholder (recommended) vs omitted.
4. Client-side hash recomputation: keep client echo (deterministic) or server-only derive + client
   displays the returned hash (recommended: server-authoritative; client echo optional).
5. Self-serve parity: confirm the requirement and hand the merchant-web half to the Merchant Portal
   session with this contract.
6. The §12 solicitor questions (the production gate stays until answered).

Nothing is implemented until this packet is approved; #516 remains held. On approval, #516 is
reworked to this contract (new read shape + personalised render + reviewed-hash bind + new migration
+ frozen identity + docs), re-reviewed by Opus adversarially, then renewed Codex + owner SHA gate.
