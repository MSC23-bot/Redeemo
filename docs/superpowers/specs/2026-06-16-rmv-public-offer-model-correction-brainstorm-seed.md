# RMV Public-Offer Model Correction - Brainstorm Seed

Status: BRAINSTORM SEED (Tier 3 product-model / likely schema-risk). NOT a spec, NOT a plan, NOT implementation approval.
Date: 2026-06-16.
Trigger: owner flagged that template-owned mandatory-RMV public offer content is not commercially feasible as the final model, during B5.1-web planning. B5.1-web is PAUSED pending this correction.
Next step: this seed feeds a `superpowers:brainstorming` session -> spec -> plan BEFORE any code. Do not implement from this doc.

Related: B5.1-core (admin RMV co-build) shipped at merge `e50ca5c` (PR #259); plan `docs/superpowers/plans/2026-06-16-option-b-b5-1-admin-rmv-cobuild.md`. This seed supersedes the "RMV co-build" framing as the long-term model and reframes the B5.2 merchant-acceptance anchor recorded there.

---

## 1. Why this exists (the headline finding)

The mandatory-RMV public offer content - `type`, `title`, `description`, `estimatedSaving` - is 100% template-owned and IDENTICAL for every merchant in a category. The only thing a merchant or admin can currently "edit" (`merchantFields`: terms / expiryDate) is NEVER shown to customers: it is write-only dead data.

So the model is worse than "merchants share fixed public content." It gives the ILLUSION of editability (via `allowedFields`) over a JSON blob that no customer-facing code reads. A bar, a Chinese restaurant, and a dessert shop under Food and Drink literally surface the SAME public RMV title / description / type / saving (from the category's 2 templates), with no merchant-specific content, no way to make it merchant-specific through the RMV path, and no merchant-consent record. This is the dispute vector: "we never agreed to this voucher."

---

## 2. Live-code findings (inspection, 2026-06-16)

### 2.1 RMV public fields are template-owned and copied to Voucher at provisioning
`provisionRmvVouchers` (`src/api/merchant/voucher/service.ts`) creates each mandatory RMV by copying the template:
- `type: t.voucherType`
- `title: t.title`
- `description: t.description`
- `estimatedSaving: t.minimumSaving`
- `status: 'DRAFT'`, `merchantFields: {}`

These land in TOP-LEVEL `Voucher` columns (`Voucher.type/title/description/estimatedSaving`, all required columns in `prisma/schema.prisma`). They are copied ONCE at provisioning and never updated thereafter. `RmvTemplate` has `@@unique([categoryId, title])`, `voucherType`, `title`, `description`, `minimumSaving`, `allowedFields Json`.

### 2.2 Merchant/admin RMV edit writes ONLY `merchantFields`
`updateRmvVoucher` / `updateRmvVoucherCore` (`src/api/merchant/voucher/service.ts`):
- validate proposed keys against `rmvTemplate.allowedFields` (else `RMV_FIELD_NOT_ALLOWED`),
- then write `data: { merchantFields: merged }` only.
Top-level columns (`title/description/type/estimatedSaving/terms/expiryDate`) are NEVER written by the RMV path. So a merchant/admin CANNOT change any RMV public field; they can only mutate the `merchantFields` blob.

Contrast - custom (RCV) vouchers DO author the real public columns. `updateVoucher` (isRmv:false) allow-list = `title, description, terms, imageUrl, estimatedSaving, expiryDate, type, cooldownSeconds` written straight to top-level columns; `createVoucher` takes them from the request body. So the infrastructure for merchant-authored public content already exists and is proven; RMVs simply do not use it.

### 2.3 CRITICAL: `merchantFields` is never displayed to customers (write-only / invisible)
A repo-wide grep shows NO customer-facing or redemption code reads `merchantFields`. The only readers are the RMV edit path itself (reading current values to merge) and the B5.1 admin read (`listAdminRmvVouchers`). Every customer voucher read selects TOP-LEVEL columns:
- `getCustomerVoucher` (`src/api/customer/discovery/service.ts`) selects `id, title, type, description, terms, imageUrl, estimatedSaving, expiryDate, code, status, approvalStatus, cooldownSeconds` + merchant - NO `merchantFields`.
- The discovery list / merchant-profile voucher selects use the same top-level columns.

Because `provisionRmvVouchers` never sets top-level `terms`/`expiryDate` (it leaves them null) and the RMV edit writes `merchantFields.terms`/`merchantFields.expiryDate`, the merchant's edited terms/expiry NEVER reach the customer. The customer sees null top-level terms/expiry and the template-derived title/description/type/saving.

The `merchantFields -> top-level column` merge happens NOWHERE - not at edit, not at submit, not at go-live (`approvals/service.ts` go-live just flips `status: ACTIVE, approvalStatus: APPROVED`). So `merchantFields` is structurally orphaned. This is a PRE-EXISTING latent inconsistency in the shipped model (it predates B5.1; B5.1 inherited it symmetrically).

### 2.4 The go-live gate is status-based, not content-based
`rmv_configured = count(isRmv, status in [PENDING_APPROVAL, ACTIVE]) >= 2` (`src/api/merchant/onboarding/service.ts`; mirrored in `getMerchantDetail`). It cares only about STATUS, not content. So any content-model change leaves the go-live gate intact - a useful property for every option below.

### 2.5 Go-live captures no merchant consent
The actioner go-live approval reviews template-derived content and flips RMV status to ACTIVE (`approvals/service.ts`). It records ADMIN approval, never merchant authorship or acceptance of the specific public offer content.

---

## 3. Cross-check table (expectation -> live reality -> implication)

| Expectation (owner mental model) | Live code reality | Implication |
|---|---|---|
| RMV title/description/saving are placeholders a merchant tailors | Template values copied to top-level columns at provision; never editable by merchant | All merchants in a category show IDENTICAL public offers |
| `allowedFields` edit customises the offer | Edit writes `merchantFields` (terms/expiry), allowedFields-gated | Only terms/expiry "editable", and... |
| Edited fields appear to customers | NO customer/redemption code reads `merchantFields`; `getCustomerVoucher` selects top-level columns only | The edit is WRITE-ONLY / invisible; top-level terms/expiry stay null for RMVs |
| Merchant consents to their public offer | Go-live = admin status flip; no merchant authorship/acceptance recorded | NO consent trail for RMV public content |
| Merchant-specific content needs new schema | Custom-voucher path already authors top-level columns; same columns exist on RMVs | Field-editing is a SERVICE-LAYER change, no schema; only an acceptance trail might need schema |
| RMV `type` is a category default | `type` = template `voucherType`, immutable | A dessert shop and a bar share the same RMV `type` |

---

## 4. Options

### Option A - keep template-owned public fields; narrow allowedFields co-build as interim
- Product/legal: NOT viable as the final model. Identical public offers across merchants; no consent; and because `merchantFields` is invisible, the "tool" does not even let a merchant tailor anything customer-visible. High dispute risk.
- Schema: none.
- Backend: none (status quo).
- Admin-web: B5.1-web would ship a card editing INVISIBLE fields - misleading.
- Merchant Portal future: inherits the broken model.
- B5.1-core: as-is.
- Verdict: REJECT as the model. Only defensible as an explicitly-labelled stopgap, and even that is undermined by the invisibility gap.

### Option B - RMV public fields become merchant-authored from template defaults + guardrails (keep DRAFT -> PENDING_APPROVAL -> admin approve)
- Product/legal: fixes "identical offers" + the invisibility gap. For MERCHANT self-authoring, authorship = implicit consent (adequate). Does NOT by itself solve admin-on-behalf consent.
- Schema: NONE required for field editing - the columns exist and the custom path already writes them. Guardrails (keep `type`, floor `estimatedSaving >= minimumSaving`) are validation, not schema.
- Backend: change the RMV edit path to write the allowed TOP-LEVEL columns (not `merchantFields`), with template-derived bounds; seed editable `title`/`description` from the template as a starting draft; retire / migrate the `merchantFields` write for RMVs.
- Admin-web: B5.1-web would then edit REAL public fields (functional) - but admin-on-behalf still needs consent (Option C).
- Merchant Portal future: correct foundation - the merchant authors their own RMV public offer.
- B5.1-core: leave shipped; FOLLOW with a correction PR (RMV edit semantics change from `merchantFields` to columns; `allowedFields` semantics change).
- Verdict: the right STRUCTURAL direction with minimal / no schema. Solves the self-serve path; not sufficient alone for admin-on-behalf consent.

### Option C - admin-authored public voucher changes require merchant acceptance / durable consent
- Product/legal: strongest, dispute-proof. Any admin-authored or admin-changed PUBLIC RMV field routes through a merchant-acceptance step (the merchant explicitly accepts before go-live) and/or a durable acceptance record. Mirrors the B2.5 propose -> review lane, but the ACCEPTOR is the MERCHANT, not an admin.
- Schema: LIKELY YES for a durable, queryable acceptance trail (e.g. `Voucher.merchantAcceptedAt` / `acceptedBy`, or a small acceptance model) - STOP-and-report per the standing rule. Merchant self-authoring needs no acceptance record (authorship = consent).
- Backend: propose -> accept flow for admin-authored public content.
- Admin-web: admin "sends to merchant for acceptance" (B2.5-style copy), not directly live.
- Merchant Portal future: the merchant accepts / authors in the portal.
- B5.1-core: admin edit semantics change (propose/accept rather than direct DRAFT edit); leave shipped + correction PR.
- Verdict: REQUIRED specifically for the admin-on-behalf consent guarantee. Heavier; likely needs schema for a durable acceptance trail.

---

## 5. Recommended synthesis: B + C (layered)

1. Canonical model: RMV public fields are MERCHANT-AUTHORED, SEEDED from template defaults. The template is GUIDANCE + GUARDRAILS (locked `type`, `minimumSaving` floor), not permanent public content.
2. Merchant self-serve path (Phase 4 portal): Option B, existing DRAFT -> PENDING_APPROVAL -> admin-approve flow - authorship = consent, sufficient.
3. Admin on-behalf path (B5.x): Option C - any admin authoring/changing a PUBLIC RMV field requires merchant acceptance (propose -> merchant-accept + acceptance audit). Admin may still freely help with non-public / internal aspects.
4. Keep the status-based go-live gate (`rmv_configured` by status) untouched throughout.

---

## 6. Disposition of already-shipped work

- B5.1-core (shipped, `e50ca5c`): LEAVE AS-IS - no urgent patch. It is SYMMETRIC with the existing merchant path (no weaker AND no stronger path): its SUBMIT half is fully functional and onboarding-critical (it drives `rmv_configured` by moving DRAFT -> PENDING_APPROVAL), and its EDIT half writes the same invisible `merchantFields` the merchant path already writes - so it introduces NO new harm and NO new weaker path. A CORRECTION PR should follow once the model is decided (it will change the RMV edit semantics on BOTH paths). Patching it in place now, before the model decision, would be premature.
- B5.1-web: STAY PAUSED. Building a card that edits invisible `merchantFields` would ship a misleading, non-functional public-offer editor. Resume only after the model is chosen (and then it edits real public fields, with the admin-on-behalf acceptance lane from Option C).

---

## 7. Open owner decisions (for the brainstorm)

1. Canonical model: confirm template = DEFAULTS / GUARDRAILS and public content = MERCHANT-AUTHORED (Option B), with merchant ACCEPTANCE required for admin-authored public changes (Option C)?
2. Which fields are MERCHANT-EDITABLE vs TEMPLATE-LOCKED? (This is arguably what `allowedFields` should BECOME: a list of TOP-LEVEL columns the merchant may edit, not `merchantFields` keys.)
3. Is `type` LOCKED to the template `voucherType`, or merchant-selectable?
4. `minimumSaving` floor: enforce `estimatedSaving >= template.minimumSaving` as a guardrail?
5. Durable acceptance-trail shape: a new `Voucher.merchantAcceptedAt` / `acceptedBy` field, a small acceptance model, or lean on existing audit + a B2.5-style lane? (Schema -> stop-and-report.)
6. Migration / backfill strategy for existing `merchantFields` (terms/expiry): migrate into top-level columns, or DISCARD (they were never displayed)?

---

## 8. Process note (Tier 3)

This is Tier-3 product-model work with likely SCHEMA risk (the acceptance trail). It MUST go through `superpowers:brainstorming` -> spec -> plan BEFORE any code, per the project's tier calibration. No schema/migration, no backend change, and no admin-web change should be made off this seed directly. B5.1-core stays shipped; B5.1-web stays paused; the RMV edit-path correction + any acceptance lane fall out of the resulting plan.
