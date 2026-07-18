# SPEC · D65 In-Person Assisted Contract-Signing Ceremony

Status: DRAFT · Tier 3 · docs-only (no implementation in this PR)
Owner decision: 2026-07-10 (verbatim constraints captured in §0)
Legal status: LEGAL_REVIEW_REQUIRED · never claim solicitor approval until owner flips the gate
Related: D49 assisted/rep-led onboarding (prototype-execution-log.md), PROJECT-STATE §6 Zoho row (line 147)

---

## 0. Owner decision (2026-07-10, verbatim constraints)

Build the in-person assisted-signing ceremony NOW at launch quality. Hard-gated
`LEGAL_REVIEW_REQUIRED` until solicitor sign-off; never claim solicitor approval. The existing
claim-link portal signing stays as the fallback. Realistic agreement content, not lorem ipsum.
Versioning must never mutate past signed records. Evidence pack must capture: agreement version,
signer identity, merchant identity, timestamp, IP/device/user-agent, signed PDF, hash/version
metadata, and an audit log. The signed PDF lives in PRIVATE R2. Admin sees contract status +
evidence; merchant can view/download their signed agreement. Documented solicitor handoff
(assumptions + questions). If legal wording is uncertain, draft the best operationally complete
version and FLAG the solicitor question rather than blocking.

This spec designs to those constraints. It does not decide Zoho (§9).

---

## 1. What exists today (inspected, cited)

The ceremony is a launch-quality superset of the click-to-agree path already shipped. It reuses
every existing seam and adds an immutable evidence record beside (not replacing) the current
`MerchantContract`.

### 1.1 Contract data model
- `MerchantContract` (`prisma/schema.prisma:753-763`): one row per merchant
  (`merchantId String @unique`), fields `id`, `signedAt`, `ipAddress`, `tcVersion`,
  `signatureMethod`, `zohoSignRequestId`. It is a **1:1 mutable** row: there is no history, no
  signer name, no user-agent, no PDF, no content hash. `signatureMethod` is the enum
  `SignatureMethod { CLICK_TO_AGREE, ZOHO_SIGN }` (`schema.prisma:409-412`).
- `Merchant.contractStatus` is `ContractStatus { NOT_SIGNED, SIGNED }`
  (`schema.prisma:397-400`), plus `contractStartDate` / `contractEndDate`
  (`schema.prisma:426-428`).
- `MerchantDocument` (`schema.prisma:741-751`): `documentType DocumentType`, `fileUrl`,
  `uploadedAt`. `DocumentType` includes `AGREEMENT` (`schema.prisma:402-407`). `AGREEMENT` is
  today only a manual upload category; there is **no legal-signature flow behind it**
  (`apps/admin-web/features/merchants/UploadDocumentDialog.tsx:10`), and merchant self-upload
  explicitly rejects `AGREEMENT` (`src/api/merchant/documents/service.ts:10`).

### 1.2 Signing flow today (the fallback we preserve)
- Contract text is a **hardcoded constant** `CONTRACT_TEXT` with `CONTRACT_VERSION = '1.0'`
  (`src/api/merchant/onboarding/service.ts:11-18`). It is **not versioned as an artifact and not
  content-hashed**; `tcVersion` is just a string the client echoes back.
- `acceptContract(prisma, adminId, version, ctx)` (`service.ts:168-196`): resolves the caller's
  own merchant via `resolveAdminMerchant`, blocks double-sign (`CONTRACT_ALREADY_SIGNED`), creates
  one `MerchantContract` with `signatureMethod: 'CLICK_TO_AGREE'` and `ipAddress: ctx.ipAddress`,
  flips `contractStatus: 'SIGNED'` + `contractStartDate`, and writes audit
  `MERCHANT_CONTRACT_ACCEPTED`. The **signer name is not persisted** and no PDF is produced.
- Routes (`src/api/merchant/onboarding/routes.ts:47-57`): `GET /contract` returns
  `{ version, text }`; `POST /contract/accept` takes `{ version }` and calls `acceptContract`.
- Merchant portal UI: `apps/merchant-web/app/(app)/onboarding/contract/page.tsx` +
  `components/onboarding/contract/ContractAgreementForm.tsx`. The form renders **6 plain-English
  key terms** (`ContractAgreementForm.tsx:22-47`), a "type your full name to sign" field (a
  UI/legal affordance, **not persisted** today), a checkbox, and a signed-confirmation cell with a
  "12 month term" hint. The reusable enumerated-terms list and confirmation-cell layout are the UX
  template for the ceremony's Screen 2/Screen 4.

### 1.3 Onboarding submit gate
- `computeOnboardingChecklist` (`service.ts:23-45`) gates submit on `branch_created` +
  `contract_signed` (`merchant.contractStatus === 'SIGNED'`) + `rmv_configured`. The ceremony
  satisfies `contract_signed` exactly as click-to-agree does (it flips the same
  `Merchant.contractStatus`), so **no gate logic changes**.

### 1.4 Private R2 storage
- `src/api/shared/storage.ts` is the presign + server-proxied upload library. The `document`
  kind (`storage.ts:52-58`) is **private** (`R2_BUCKET`, a physically separate bucket from public
  media per the 2026-07-09 two-bucket decision, `storage.ts:9-18`), allows `application/pdf` up to
  10 MB, and is read only via `presignGet` (short-lived, 5-min GET, `storage.ts:75,213-222`).
  `putObject` (`storage.ts:242-283`) hard-enforces content-type + size server-side and mints a
  traversal-safe key `document/<ownerId>/<random>.pdf`. `STORAGE_ENABLED` gates all of it (dark by
  default; **LIVE on staging** per PROJECT-STATE §Overview). **No new provider or bucket is
  needed** - the signed PDF is a `document`-kind object.

### 1.5 Admin visibility today
- `getMerchantDetail` (`src/api/admin/merchants/service.ts`) selects only `contractStatus`
  (`service.ts:116-118`) to feed the submit checklist (`service.ts:179-185`). There is **no
  contract-evidence surface**. `DocumentList` (`apps/admin-web/features/review/DocumentList.tsx`)
  renders `AGREEMENT` as a plain document category via a presigned GET. The Merchant 360 page
  (`apps/admin-web/app/(app)/merchants/[id]/page.tsx`) has cards for identity/submit but no
  contract block.

### 1.6 Assisted wizard (the UI integration point)
- The assisted/rep-led onboarding flow is **prototype-only** (D49, owner direction 2026-07-02;
  `docs/design/admin-panel/prototype-execution-log.md`). The 9-step rail is:
  Category, Profile, Branch(es), Vouchers, Staff(opt), Documents(opt), **Contract (step 7)**,
  Go-live, Handover. `apps/admin-web/features/leads/assisted` **does not exist in code yet** - it
  is the net-new surface this ceremony plugs into. Owner locks carried from the prototype:
  - The operator (rep) **cannot** accept for the owner: an explicit "hand to owner" panel, the
    owner personally confirms on the rep's device.
  - **admin-never-signs is a preserved legal lock**: the witnessing admin is recorded as the
    witness/rep, never as the signatory.
  - Evidence captured in the prototype: signer name + title, timestamp, IP, method, agreement
    version. Optional finger/stylus signature draw where a touchscreen exists (NOT a gate;
    name + confirm remains the acceptance).

### 1.7 No PDF capability
- `package.json` has **no** PDF / headless-browser dependency (`puppeteer`, `pdfkit`, `pdf-lib`,
  `@react-pdf/*`, `playwright` all absent). Node engine is `24.x`. A PDF renderer must be added;
  options + recommendation in §7.

---

## 2. Ceremony flow (rep device, in person)

Runs inside the assisted-onboarding full-screen presentation mode (operator's own audited session;
sidebar + admin chrome hidden so no other merchant's data is exposed). The rep drives up to the
hand-over point; the owner personally completes the acceptance.

1. **Rep pre-check (operator).** Wizard step 7 opens. The rep confirms the business identity on
   screen (legal name, trading name, company/VAT if held) and the named signatory's full name and
   role. The backend loads the current agreement version + content hash (§4). Nothing is written.
2. **Hand to owner (explicit handover).** A full-screen "Please hand the device to the business
   owner or authorised signatory" panel. The operator cannot proceed past this as themselves; the
   next screen is the owner's act.
3. **Owner reviews the agreement (scrollable).** The full agreement renders in a scrollable
   container. The "Agree" control is disabled until the owner has scrolled to the end (scroll-to-end
   gate), mirroring the enumerated key terms from `ContractAgreementForm.tsx:22-47` as a summary
   above the full text.
4. **Owner confirms authority to sign.** A required, separately-ticked statement: "I am the owner
   or an authorised signatory able to bind [business legal name] to this agreement." Captured as
   `signerRoleConfirmation` (free text role, e.g. "Owner", "Director") + the boolean attestation.
5. **Owner accepts enumerated key terms.** The owner ticks acceptance of the enumerated key terms
   (12-month term, listing free / paid featured, honour-the-voucher + accuracy, in-person
   redemption + staff validation, Redeemo review/suspension rights, data-protection + staff
   responsibility). This is the same key-terms set as the portal path.
6. **Owner types full name as signature.** The typed full name is the signature of record. The
   "Agree and sign" control enables only when: scrolled-to-end AND authority-attestation ticked AND
   key-terms accepted AND typed name is non-empty. Optional stylus/finger signature draw is offered
   where a touchscreen is present; it is stored as an image embedded in the PDF but is **NOT a
   gate** (typed name + confirm remains the legal acceptance, matching the owner lock in §1.6).
7. **Timestamped confirmation screen.** On success the screen shows: agreement version, signer
   name + role, business legal name, the signing timestamp (Europe/London), a "12-month term"
   note, and a "Download signed agreement" control (presigned GET of the PDF). The wizard advances
   to step 8 (Go-live review). The rep is recorded as the witness in the evidence record.

Fallback unchanged: a merchant who was created via claim-link and self-onboards signs through the
existing portal click-to-agree path (§1.2). Both paths write an evidence record (§4); only the
`method` and the presence/absence of `actorAdminId` differ.

---

## 3. Non-goals

- Not deciding Zoho Sign vs click-to-agree platform-wide (PROJECT-STATE §6; see §9).
- Not a qualified/advanced electronic signature (QES/AdES) under eIDAS/UK-eIDAS. This is a simple
  electronic signature with an evidence pack. [SOLICITOR: is a simple e-signature + evidence pack
  sufficient for a 12-month B2B commercial agreement of this value, or is a witnessed/AdES flow
  required? - see agreement draft §Execution.]
- Not building the rest of the assisted wizard (steps 1-6, 8-9); this spec owns step 7 only.
- Not enabling production use. The gate (§6) blocks production until the owner flips it post
  solicitor sign-off.

---

## 4. Evidence-pack data model

### 4.1 New model: `MerchantAgreementRecord` (immutable, append-only)

A new table sits **beside** `MerchantContract`, not replacing it. `MerchantContract` stays the
1:1 "is there a current signed contract?" pointer that the onboarding gate and existing code read;
`MerchantAgreementRecord` is the immutable evidence ledger (one row per signing event, never
updated or deleted). This keeps the portal/claim path working byte-for-byte while adding launch-
quality evidence.

```
model MerchantAgreementRecord {
  id                    String                 @id @default(uuid())
  merchantId            String

  // Agreement identity (what was signed)
  agreementVersion      String                 // e.g. "2.0" - matches a repo artifact (§5)
  contentHash           String                 // sha256 of the exact rendered agreement bytes

  // Signatory identity (who signed)
  signerName            String                 // typed full name = signature of record
  signerRoleConfirmation String                // e.g. "Owner", "Director" (authority attestation)

  // Witness / channel
  actorAdminId          String?                // the witnessing rep on IN_PERSON_ASSISTED; NULL on self-serve
  method                AgreementSignMethod     // IN_PERSON_ASSISTED | SELF_SERVE_CLICK

  // When + where
  signedAt              DateTime               @default(now())
  ipAddress             String
  userAgent             String

  // Signed artifact
  pdfKey                String                 // private R2 key: document/<merchantId>/<rand>.pdf
  drawnSignatureKey     String?                // optional stylus image, private R2 (if captured)

  merchant              Merchant               @relation(fields: [merchantId], references: [id])

  @@index([merchantId])
}

enum AgreementSignMethod {
  IN_PERSON_ASSISTED
  SELF_SERVE_CLICK
}
```

Immutability is a **contract, not a DB feature**: no service code ever issues `update`/`delete`
against this table; a superseding agreement version produces a **new row**, leaving prior rows
untouched. The plan (§security seams) adds a test asserting no update/delete call sites exist and a
code-review checkpoint. [SOLICITOR: do we also need append-only enforcement at the DB layer (e.g. a
revoke of UPDATE/DELETE on the role, or a trigger), or is application-level immutability + audit log
acceptable evidence integrity for a signed contract record?]

### 4.2 Relationship to `MerchantContract` (no breakage)

- `acceptContract` (click-to-agree fallback) continues to write/flip `MerchantContract` exactly as
  today, and additionally writes one `MerchantAgreementRecord` with `method = SELF_SERVE_CLICK`,
  `actorAdminId = null`, and a rendered PDF (so the fallback also gains an evidence pack - launch
  quality both ways).
- The ceremony writes one `MerchantAgreementRecord` with `method = IN_PERSON_ASSISTED` and
  `actorAdminId = <rep>`, and upserts the same `MerchantContract` pointer + flips
  `Merchant.contractStatus = 'SIGNED'` so the onboarding gate (§1.3) is satisfied with zero gate
  changes.
- `MerchantContract.signatureMethod` enum gains no new value in this slice; it keeps
  `CLICK_TO_AGREE`. The **fidelity of channel** lives in `MerchantAgreementRecord.method`. (An
  optional later migration could add `IN_PERSON_ASSISTED` to `SignatureMethod`; deferred to avoid
  touching the fallback's write path. [SOLICITOR: n/a - internal.])
- `MerchantContract` remains the single "current contract" per merchant; `MerchantAgreementRecord`
  is the history. If a merchant re-signs a new version, a new evidence row is appended and the
  pointer row is updated to point at the latest; **all prior evidence rows and their PDFs are
  retained unchanged.**

### 4.3 What the evidence pack contains (owner requirement, mapped)

| Required item | Field / artifact |
|---|---|
| Agreement version | `agreementVersion` |
| Signer identity | `signerName` + `signerRoleConfirmation` |
| Merchant identity | `merchantId` (joins businessName/legal name/company/VAT) |
| Timestamp | `signedAt` (stored UTC, displayed Europe/London) |
| IP / device / user-agent | `ipAddress`, `userAgent` |
| Signed PDF | `pdfKey` (private R2 `document` object) |
| Hash / version metadata | `contentHash` + `agreementVersion` |
| Audit log | new audit events (§8) written in the same transaction |

---

## 5. Versioning model

- The agreement text is a **versioned repo artifact**, not a hardcoded string. Each version lives
  as an immutable file under `docs/legal/agreements/merchant-agreement-v<N>.md` (the current draft
  is `docs/legal/drafts/merchant-agreement-v2-draft.md`; on solicitor sign-off it is promoted to
  the non-draft path and frozen). A small backend registry
  (`src/api/merchant/agreement/versions.ts`) maps a version string to its rendered content +
  precomputed `contentHash` (sha256 of the exact bytes the PDF is rendered from).
- **Append, never mutate.** A new agreement version adds a new artifact + registry entry. Existing
  artifacts are frozen. A signed `MerchantAgreementRecord` pins `agreementVersion` + `contentHash`,
  so the exact text a merchant signed is always reconstructable and verifiable regardless of what
  the "current" version later becomes. Editing a published version's bytes would change its hash
  and is prohibited (guarded by a static test comparing stored hash to recomputed hash).
- `CONTRACT_VERSION`/`CONTRACT_TEXT` in `service.ts:11-18` are superseded by the registry; the
  existing `GET /contract` route reads the current version from the registry (behaviour-compatible:
  it still returns `{ version, text }`).
- The content hash is computed over a canonical form (agreement markdown/HTML source, not the PDF
  bytes, since PDF generation can be non-deterministic across renderer versions). The PDF embeds
  the version + hash in its footer so a downloaded PDF is self-describing. [SOLICITOR: for evidential
  weight, should the hash be over the exact PDF delivered to the signer (byte-reproducible render
  required) or over the canonical source text? The latter is more robust to renderer upgrades; the
  former ties the hash to the literal document shown.]

---

## 6. The `LEGAL_REVIEW_REQUIRED` gate

The feature is fully built and exercisable on **staging**, but production signing is blocked until
the owner flips a flag after solicitor sign-off.

- **Config flag:** `AGREEMENT_LEGAL_REVIEW_REQUIRED` (env), **default `true`** (fail-closed). While
  `true`, the ceremony backend route refuses to write a binding `MerchantAgreementRecord` in a
  production environment and refuses to flip `contractStatus` to SIGNED via the ceremony; on
  staging it operates fully so the flow can be QA'd end to end. The exact production-vs-staging
  discriminator reuses the existing environment signal (same mechanism the storage/email dark flags
  use). Flipping to `false` is the owner's post-sign-off action.
- **UI banner semantics:** wherever the agreement or ceremony is shown while the gate is on, a
  persistent banner reads: "This agreement is pending legal review. Not for production signing."
  The confirmation screen and any generated PDF carry a **"DRAFT - PENDING LEGAL REVIEW"** watermark
  while the gate is on. **Never** render copy that states or implies solicitor approval.
- The gate is independent of `STORAGE_ENABLED`: even with storage live on staging, production
  signing stays blocked until the legal flag is flipped.
- Precedent: this mirrors the `EMAIL_ENABLED` / `STORAGE_ENABLED` dark-by-default pattern and the
  legal-version guard note in `apps/customer-web/lib/legal.ts` ("Do not treat editing this file as
  legal sign-off").

---

## 7. PDF generation (no new provider)

No PDF library exists (§1.7). Options, with tradeoffs, targeting Node 24 on Railway with **no new
third-party service** (a library dependency only):

| Option | How | Pros | Cons |
|---|---|---|---|
| **`pdfkit`** (recommended) | Programmatic PDF from a layout function | Pure JS, no headless browser, small, deterministic-ish, no system libs | Manual layout (no HTML/CSS); acceptable for a text agreement |
| `pdf-lib` | Build/modify PDFs programmatically | Pure JS, can also stamp/watermark, tiny | Even more manual layout than pdfkit for long flowing text |
| `@react-pdf/renderer` | JSX to PDF | Component model, good for structured docs | Heavier dep tree; another React renderer in the backend |
| Puppeteer / headless Chrome (HTML-to-PDF) | Render the agreement HTML, print to PDF | Best fidelity to the on-screen HTML | Ships Chromium (~heavy), fragile on Railway, cold-start/memory cost; **rejected** |

**Recommendation: `pdfkit`.** The agreement is flowing text with headings + a signature block; a
single server-side render function produces a clean, deterministic-enough document, no headless
browser, no new hosted provider. The renderer stamps version + `contentHash` + signer + timestamp
in the footer and the DRAFT watermark while the gate is on. The rendered PDF is written to private
R2 via `putObject({ kind: 'document', ownerId: merchantId, contentType: 'application/pdf', body })`
(`storage.ts:242`), returning the `pdfKey`. [SOLICITOR: n/a - implementation choice.]

---

## 8. Admin + merchant visibility

### 8.1 Admin (Merchant 360)
- `getMerchantDetail` (`src/api/admin/merchants/service.ts`) gains a `contract` block: current
  `contractStatus`, and for each `MerchantAgreementRecord` (newest first): version, signer name +
  role, method, `signedAt`, IP, truncated user-agent, and an **evidence-download** action.
- The Merchant 360 page (`apps/admin-web/app/(app)/merchants/[id]/page.tsx`) renders a new
  **Contract / Agreement** card listing the evidence rows. The signed PDF is opened via a new
  admin route that returns a short-lived `presignGet` URL (`storage.ts:213`) for the `pdfKey` -
  **raw R2 keys are never returned to the browser** (backend-api rule). Access is gated by an admin
  capability (a `contract:view-evidence` capability, mirrored in the capability matrix).
- The evidence view is itself audited (`AGREEMENT_EVIDENCE_VIEWED`) consistent with the D48 "every
  sensitive access audited" posture.

### 8.2 Merchant (portal)
- The merchant portal gains a "Your agreement" view: for the merchant's own current agreement,
  version + signed date + a **download** control that presigns the `pdfKey` (own-merchant scoped via
  `resolveMerchantContext`; a merchant can never read another merchant's record). This satisfies
  "merchant can view/download their signed agreement."

---

## 9. Relationship to the Zoho open decision (do not decide here)

PROJECT-STATE §6 (line 147) records an open owner decision: Zoho One scope, including
"contract-signing path (click-to-agree vs Zoho Sign)". This ceremony is the **click-to-agree
evidence-pack path** - it is the launch implementation of the click-to-agree branch, hardened with a
signed PDF + immutable evidence + hash/version pinning. It does **not** foreclose Zoho Sign: if the
owner later adopts Zoho Sign, `MerchantContract.signatureMethod = ZOHO_SIGN` +
`zohoSignRequestId` already exist for that path, and `MerchantAgreementRecord` could gain a
`ZOHO_SIGN` method value. This spec neither recommends nor rejects Zoho. [SOLICITOR: does a
click-to-agree + typed-name + evidence-pack flow carry sufficient evidential weight for enforcement
of a 12-month commercial agreement in England and Wales, or should we route to a dedicated
e-signature provider (e.g. Zoho Sign / DocuSign) for stronger non-repudiation?]

---

## 10. Security seams (summary; detailed in the plan)

- **Immutability:** no `update`/`delete` against `MerchantAgreementRecord`; new version = new row.
- **Presign-only access:** PDFs never served from a public URL; only short-lived `presignGet`;
  raw keys never leave the backend.
- **No PII in logs:** signer name, IP, user-agent go to the record + audit table, never to
  application logs.
- **Hash verification:** stored `contentHash` recomputable from the pinned version artifact; a
  guard test asserts published-version bytes never change.
- **Authority + admin-never-signs:** the ceremony records the owner as signer and the rep as
  witness (`actorAdminId`); the rep can never be the `signerName`. Enforced in the route.
- **Fail-closed gate:** `AGREEMENT_LEGAL_REVIEW_REQUIRED` defaults `true`; production binding
  signing blocked until owner flip.

---

## 11. Open forks for the owner

1. **Fallback evidence retrofit:** should the click-to-agree fallback also produce a PDF + evidence
   record now (recommended, launch-quality parity), or stay minimal? (Spec assumes yes.)
2. **Signature draw:** ship the optional stylus capture in v1, or defer to a follow-up? (Spec keeps
   it optional/non-gating; easy to defer.)
3. **Hash target:** canonical source text vs literal PDF bytes (§5). Recommend canonical source.

All legal-wording forks are the `[SOLICITOR: ...]` questions collected in the agreement draft and
the plan's handoff section.
