# Option B B4 - Admin Document Support (implementation plan)

- **Date:** 2026-06-16
- **Tier:** Option B slice (plan-first; owner decisions locked below before any code)
- **Status:** PLAN COMMITTED, PAUSED before implementation
- **Sequence:** B1..B2.5 + B3 (core #256 + web #257) all SHIPPED -> **B4 (this doc)** -> B5 / Merchant Portal (held)
- **Storage library:** `src/api/shared/storage.ts` (PR-0.5) + M4 read/redaction model (`getReviewContext`)

## 1. What B4 is

Admin upload / view / delete of merchant verification **documents** ON THE MERCHANT'S BEHALF, on `/merchants/[id]`, built on the existing R2 storage library and the M4 read/redaction model. B4 is admin-on-behalf only (NOT Merchant Portal self-upload). It preserves the M4 safety boundaries: signed URLs only for viewing, the raw `fileUrl` (R2 key) is NEVER in any API response, and no branch PIN is ever in scope.

Documents are NOT a submit/approval gate (the M4 read already reports `documentsGated: false`), and B4 keeps it that way: no document type is required. `AGREEMENT` is a document category only; contract acceptance stays click-to-agree via `MerchantContract` (B4 adds no signature flow).

## 2. Locked owner decisions

- **D1 upload architecture:** **server-proxied** upload (the API receives the bytes and HARD-enforces content-type + size server-side), NOT presigned PUT. Keep it as small as practical. The transport sub-decision (a new dependency vs a no-dep approach) is flagged as **D1a** below and must be resolved before implementation.
- **D2 storage enablement:** build **dark / forward-compatible** (testable now with storage mocked; works once `STORAGE_ENABLED=true` + R2 secrets are provisioned, same gate as `EMAIL_ENABLED`).
- **D3 capability:** new `merchant:manage-documents`, **SUPER_ADMIN-only** (NOT in `ALL_SLICE1_CAPS`), gating upload + delete.
- **D4 read endpoint:** a dedicated `GET /api/v1/admin/merchants/:id/documents` (NOT folded into `getMerchantDetail`). Read-cap sub-decision flagged as **D4a**.
- **D5 delete semantics:** delete the `MerchantDocument` row AND best-effort delete the R2 object via an additive `storage.deleteObject` helper. An object-delete failure must NOT break the row delete (logged + swallowed) unless inspection finds a strong reason otherwise (it does not).
- **D6 owner notifications:** NONE in B4 (admin-internal).
- **D7 schema:** NO schema/migration. Use the existing `MerchantDocument` model. If implementation would require `uploadedBy` / `size` / `contentType` / `deletedAt` or any other schema change, STOP and report exact schema/SQL/rollback before any implementation code.

### Flagged sub-decisions to resolve before implementation
- **D1a - upload transport (a real dependency call):** server-proxied needs a way to receive the file bytes. `@fastify/multipart` is NOT currently a dependency.
  - **Option B1 (recommended): add `@fastify/multipart`.** Conventional, streaming, supports a hard `limits.fileSize` cap + the `documentType`/`reason` form fields cleanly. **This is a NEW DEPENDENCY** (the first package change in the Option B series) and needs explicit owner sign-off.
  - **Option B2 (no new dep): base64-in-JSON body** `{ documentType, reason, contentType, dataBase64 }`. Decode -> Buffer -> hard-validate size (`buffer.length`) + content-type, then `putObject`. Cost: a route-level `bodyLimit` bump to ~14 MB (base64 inflates ~33% over the 10 MB cap) and client-side base64 encoding.
  - **Option B3 (no new dep): raw `application/octet-stream` body** via a custom Fastify content-type parser, with `documentType`/`reason`/content-type passed out-of-band (query/header). Non-trivial + less conventional.
  - **Recommendation:** B1 if the owner accepts one dependency (cleanest, safest streaming caps); otherwise B2. The size cap is hard-enforced in ALL three (the API holds the bytes) - this is the D1 win over presigned PUT, whose `presignPut` does NOT sign `ContentLength` (size is only a pre-flight check; see storage.ts).
- **D4a - read-endpoint capability:** the M4 review screen already shows documents to `approval:read` (OPERATIONS) admins, and `/merchants/[id]` is `merchant:read`-gated. **Recommend GET documents = `merchant:read`** (OPERATIONS can VIEW, consistent with M4) while **upload + delete = `merchant:manage-documents`** (SUPER_ADMIN). Alternative: gate the read on `merchant:manage-documents` too (SUPER_ADMIN-only view) if the owner wants documents hidden from OPERATIONS on the detail page.

## 3. Inspected files / routes / models / helpers

- `prisma/schema.prisma` - `DocumentType` enum (L398-403: `BUSINESS_VERIFICATION_1/2`, `PRICE_LIST`, `AGREEMENT`); `MerchantDocument` (L644-654: `id`, `merchantId`, `documentType`, `fileUrl` = the raw R2 key, `uploadedAt`; NO `uploadedBy`/size/contentType/`deletedAt`); `MerchantContract` (click-to-agree, L656-666).
- `src/api/shared/storage.ts` - `presignPut` (validates kind/content-type/size/ownerId, mints `document/<ownerId>/<random>.<ext>` keys), `presignGet` (short-lived private GET), `publicUrl`. `document` kind = private, <=10 MB, pdf/jpg/png. **STORAGE_ENABLED-gated, dark by default.** `presignPut` signs ContentType but NOT ContentLength (pre-flight size only). Imports `S3Client`, `PutObjectCommand`, `GetObjectCommand`. **No `putObject`/`deleteObject` helper yet.**
- `src/api/shared/env.ts` - `STORAGE_ENABLED` -> `R2_*` feature-gate (`FEATURE_GATED_SECRETS`, `requireSecretWhenEnabled`), same pattern as `EMAIL_ENABLED`.
- `src/api/admin/approvals/service.ts` (L706-744) - the M4 read: `merchantDocument.findMany` selects `fileUrl` only to presign; resolves each to `{ id, documentType, uploadedAt, url, available }` via `presignGet` in try/catch; **raw `fileUrl` NEVER in output**, `available:false`/`url:null` on storage-fail. The model to mirror exactly.
- `src/api/admin/merchants/routes.ts` - the B2.x admin-on-behalf route pattern (cap guard -> STRICT reason body -> `resolveTargetMerchantForAdmin` -> core -> actor audit). `idParam` / `auditCtx` helpers.
- `src/api/admin/capability.ts` - `AdminCapability` union + `ALL_SLICE1_CAPS` + `requireAdminCapability`. SUPER_ADMIN short-circuit.
- `src/api/shared/audit.ts` - `AuditEvent` union (String `event` column), `writeAuditLogTx(tx, ctx)` actor-attributed (entityType `'customer'|'merchant'|'branch'|'admin'`).
- `apps/admin-web/features/review/DocumentList.tsx` - read-only list (type + date + "Open" via signed URL + Available/Unavailable + "raw storage paths are never exposed" footer), review screen only.
- `apps/admin-web/lib/api/review.ts` - `reviewDocumentSchema` `{ id, documentType, uploadedAt, url: nullable, available }`.
- `apps/admin-web/app/(app)/merchants/[id]/page.tsx` - the merchant detail page (B2.x cards); does NOT show documents today.
- `apps/admin-web/lib/auth/session.ts` - client capability mirror.
- `apps/admin-web/features/review/NamedGateBanner.tsx` - error-code -> copy map.
- Package: `@aws-sdk/client-s3` + `s3-request-presigner` present; **`@fastify/multipart` NOT present**.
- Tests: `tests/api/admin/review-context.integration.test.ts` (pins `fileUrl` never in serialised JSON; `available:false` when dark; `available:true` + url when presign mocked); `tests/api/shared/storage.test.ts` (key validation / traversal rejection).

## 4. Cross-check table (expectation -> live reality -> B4 decision)

| # | Expectation | Live reality | B4 decision |
|---|---|---|---|
| 1 | An upload flow exists | NONE: `presignPut` uncalled; no `merchantDocument.create` anywhere; seed creates none | Build it net-new (server-proxied, D1) |
| 2 | M4 read/redaction to reuse | `getReviewContext` presigns per view, never returns `fileUrl` | Mirror exactly in the new merchant-scoped read |
| 3 | Documents on `/merchants/[id]` | Not present (review screen only) | Add a Documents card + `GET /admin/merchants/:id/documents` (D4) |
| 4 | Storage live | Dark (`STORAGE_ENABLED` off) | Build dark (D2); read shows Unavailable; upload returns a clear `STORAGE_NOT_ENABLED` |
| 5 | Hard size enforcement | `presignPut` doesn't sign ContentLength | Server-proxied `putObject` enforces size on the actual buffer (D1) |
| 6 | Doc types required? | 4 enum categories; `documentsGated:false`; contract = click-to-agree | Admin picks type freely; NONE required; AGREEMENT is not a signature flow |
| 7 | Raw key / PIN exposure | `fileUrl` never returned; documents merchant-scoped (no branch/PIN) | Preserve: return `{id,documentType,uploadedAt,url,available}` only; no key; no PIN; keep the raw key out of audit payloads too |
| 8 | Schema change | `MerchantDocument.create({merchantId,documentType,fileUrl})` works; audit via `writeAuditLogTx`; `event` is a String col | NO schema/migration (D7). uploadedBy=audit actor; size/contentType validated-not-stored; delete=hard (no soft-delete) |
| 9 | New capability | B2.x caps exist | `merchant:manage-documents` SUPER_ADMIN-only (D3); read=`merchant:read` (D4a) |
| 10 | Object delete helper | `storage.ts` has none | Additive `deleteObject` (D5, `DeleteObjectCommand` from the SAME aws-sdk package, no new dep) |
| 11 | Delete route shape | B2.4 AVOIDED DELETE-with-body (used POST `/delete`) | `POST /admin/merchants/:id/documents/:documentId/delete` (reason body), matching precedent |

## 5. Backend route / API plan

All under the existing admin-management plugin scope (`authenticateAdmin` applied), in `src/api/admin/merchants/routes.ts` (+ a small service module, e.g. `src/api/admin/merchants/documents.ts`).

### 5.1 Read - `GET /api/v1/admin/merchants/:id/documents`
- Cap: `merchant:read` (D4a). `resolveTargetMerchantForAdmin(id)` (404 `MERCHANT_NOT_FOUND`; allows SUSPENDED).
- `merchantDocument.findMany({ where: { merchantId }, select: { id, documentType, uploadedAt, fileUrl } })`; presign each `fileUrl` in try/catch (mirror `getReviewContext`).
- Returns `{ documents: [{ id, documentType, uploadedAt, url, available }] }`. The raw `fileUrl` is NEVER serialised. `available:false`/`url:null` when storage is dark or presign fails.

### 5.2 Upload - `POST /api/v1/admin/merchants/:id/documents`
- Cap: `merchant:manage-documents` (D3, SUPER_ADMIN). `resolveTargetMerchantForAdmin(id)`.
- Body (transport per D1a): `documentType` (z.enum of the 4 values), `reason` (z.string().trim().min(1)), and the file (multipart file part, or base64 field).
- Storage-dark gate: if `STORAGE_ENABLED` is off, return `STORAGE_NOT_ENABLED` (clear error) BEFORE reading bytes.
- Validate content-type in the `document` allow-list (pdf/jpg/png) + size <= 10 MB on the ACTUAL buffer (HARD).
- `putObject({ kind:'document', ownerId: merchantId, body, contentType })` -> R2 -> returns the key.
- `$transaction`: `merchantDocument.create({ merchantId, documentType, fileUrl: key })` + `writeAuditLogTx(DOCUMENT_UPLOADED, actorType:'ADMIN', actorId, reason, entityType:'merchant', entityId: merchantId, after:{ documentId, documentType })`. The raw key is NOT put in the audit payload.
- If the `$transaction` throws AFTER the R2 put committed, best-effort `deleteObject(key)` to avoid an orphan, then rethrow.
- Returns the redacted created doc `{ id, documentType, uploadedAt }` (NO key, NO url). The admin-web invalidates + refetches the list (which presigns).

### 5.3 Delete - `POST /api/v1/admin/merchants/:id/documents/:documentId/delete`
- Cap: `merchant:manage-documents` (D3). `resolveTargetMerchantForAdmin(id)`. Body: `reason` (required).
- Load the doc by `{ id: documentId, merchantId }` (scoped; 404 if not found / wrong merchant) and read its `fileUrl` (key) before deleting.
- `$transaction`: `merchantDocument.delete({ where: { id: documentId } })` + `writeAuditLogTx(DOCUMENT_DELETED, actorType:'ADMIN', actorId, reason, entityType:'merchant', entityId: merchantId, before:{ documentId, documentType })`. Raw key not in the payload.
- AFTER commit, best-effort `deleteObject(key)` (D5): a failure is logged + swallowed and does NOT fail the row delete.
- Returns `{ ok: true }`.

## 6. Storage / security model

- **Server-proxied upload (D1):** the API receives the bytes and validates content-type + size on the ACTUAL buffer (hard), closing the `presignPut` ContentLength gap. New additive helper `storage.putObject({ kind, ownerId, body: Buffer, contentType })`: `assertStorageEnabled` -> validate via `kindPolicy` (content-type allow-list + `body.length <= maxBytes`) + `OWNER_ID_RE` -> mint the `kind/ownerId/<random>.<ext>` key -> `s3().send(new PutObjectCommand({ Bucket, Key, Body: body, ContentType, ContentLength: body.length }))` -> return the key. (Reuses the same key scheme + validation as `presignPut`.)
- **R2 key handling / raw-key redaction:** `fileUrl` (the key) is stored on the row and read only to presign; it is NEVER serialised in any response (read, upload, or delete) and NOT written into audit payloads. Pinned by tests mirroring the M4 "no `fileUrl` in JSON" assertion.
- **Signed GETs:** `presignGet` per view (short-lived); the read returns `url` (signed) + `available`. No public URL (documents are private).
- **Object delete:** additive `storage.deleteObject(key)`: `assertStorageEnabled` + `assertValidKey` + `s3().send(new DeleteObjectCommand({ Bucket, Key }))`. `DeleteObjectCommand` is imported from the SAME `@aws-sdk/client-s3` package (no new dependency). Best-effort at the call site (D5).
- **STORAGE_ENABLED-dark behaviour (D2):** read -> `available:false`/`url:null` (mirrors M4, no 500). Upload -> the route detects dark up front and returns `STORAGE_NOT_ENABLED` (clean error, no partial write). Delete -> the row deletes; the best-effort object-delete no-ops/logs. The feature is fully testable with storage mocked and goes live once `STORAGE_ENABLED=true` + R2 secrets are provisioned.
- **No PIN exposure:** documents are merchant-scoped; no branch join; the branch `redemptionPin` is never in scope. Pinned by a redaction test.
- **Size cap:** 10 MB (the `document` kind policy). Content-types: pdf/jpg/png.

## 7. Capability / auth model

- New `merchant:manage-documents` in `src/api/admin/capability.ts` (union, NOT in `ALL_SLICE1_CAPS` -> SUPER_ADMIN-only via the short-circuit) + the admin-web mirror in `session.ts`.
- Upload + delete gated `merchant:manage-documents` (SUPER_ADMIN). Read gated `merchant:read` (D4a, OPERATIONS can view, consistent with M4).
- Backend `requireAdminCapability` is the real enforcement; the admin-web `can(...)` mirror is UX-only. `resolveTargetMerchantForAdmin` (allows SUSPENDED) on all three.

## 8. Audit / logging plan

- In-transaction `writeAuditLogTx`, actor-attributed (`actorType:'ADMIN'`, `actorId`, `reason`), `entityType:'merchant'`, `entityId: merchantId`.
- Proposed new `AuditEvent` union values (String `event` column -> NO migration): **`DOCUMENT_UPLOADED`** (after: `{ documentId, documentType }`) and **`DOCUMENT_DELETED`** (before: `{ documentId, documentType }`).
- The raw R2 key is deliberately NOT included in audit payloads (storage-internal detail; keeps keys out of the audit log too).
- No owner notification (D6).

## 9. Admin-web placement + UX (`/merchants/[id]`)

- A new **Documents card** (`MerchantDocumentsCard`), placed after the Category card (before Branches), rendering the read-only list (reuse the `DocumentList` view pattern: type + date + "Open" via signed URL + Available/Unavailable + the "raw paths never exposed" footer). Shareable with the review `DocumentList` or a sibling component (implementer choice; flag).
- **Upload affordance** (gated `can('merchant:manage-documents')`) -> `UploadDocumentDialog`: a `documentType` `<select>` (the 4 enum labels via the existing `docTypeLabel` map), a file `<input type="file" accept=".pdf,.jpg,.jpeg,.png">` with client-side type/size hints, a mandatory `reason` textarea, and legal-neutral copy ("uploaded on the merchant's behalf, recorded in the audit log"). Submits via the D1a transport.
- Per-document **Delete** (gated `can('merchant:manage-documents')`) -> `DeleteDocumentConfirm` (reason).
- New api client (`merchantDocumentsApi`: `list` / `upload` / `delete`) + hooks (`useMerchantDocuments(id)` query; `useUploadDocument(id)` / `useDeleteDocument(id)` invalidating the documents query key on success AND error).
- `NamedGateBanner`: add `STORAGE_NOT_ENABLED` (and any other new code) copy.
- Capability mirror: `merchant:manage-documents` (SUPER_ADMIN-only).

## 10. Test plan

### Backend (vitest)
- `storage.test.ts` (extend): `putObject` validates content-type + size HARD (rejects oversize on the actual buffer; rejects disallowed content-type; mints a valid key; sends `ContentLength = body.length`); `deleteObject` (assertValidKey, `DeleteObjectCommand`); both throw when `STORAGE_ENABLED` is off.
- New route tests (storage mocked): READ (presigned URLs; `fileUrl` NEVER in JSON - mirror the M4 pins; `available:false` when dark); UPLOAD (cap 403, missing reason 400, invalid `documentType` 400, disallowed content-type rejected, oversize rejected, happy path creates the row + `DOCUMENT_UPLOADED` audit with actorType ADMIN + reason + NO raw key, `STORAGE_NOT_ENABLED` when dark, orphan-cleanup `deleteObject` on a DB-create failure); DELETE (cap 403, doc-not-found 404, wrong-merchant 404, happy path deletes row + `DOCUMENT_DELETED` audit, best-effort object delete, object-delete failure does NOT fail the row delete).
- Redaction pin: no `fileUrl` and no `redemptionPin` anywhere in any document response.
- Blast-radius sweep: admin/merchants + storage + approvals (M4 read untouched but adjacent).
- `tsc --noEmit` clean.

### admin-web (jest + next build)
- `MerchantDocumentsCard` (list render, available/unavailable, gating both ways), `UploadDocumentDialog` (documentType + file + reason validation; submit shape), `DeleteDocumentConfirm` (reason), hooks invalidation (success + error), capability mirror (`merchant:manage-documents` SUPER_ADMIN-only truth table), `NamedGateBanner` `STORAGE_NOT_ENABLED` pin.
- `tsc --noEmit` clean; jest green; **`next build` (8/8) in the MAIN checkout**.

### CI
- backend (typecheck + unit) + admin-web (typecheck/lint/build) + customer-web green.

## 11. Closed-scope exclusions + stop conditions

- **In scope:** `src/api/admin/**`, additive `src/api/shared/storage.ts` (`putObject` + `deleteObject`), `src/api/shared/audit.ts` (2 new event union values), `apps/admin-web/**`, tests. Possibly `package.json` IF D1a = Option B1 (`@fastify/multipart`) - owner sign-off required first.
- **NO schema/migration (D7).** If implementation needs `uploadedBy`/`size`/`contentType`/`deletedAt` or any column change -> STOP and report exact schema/SQL/rollback before any implementation code.
- **NOT in B4:** B5 voucher co-build, Merchant Portal self-upload, B1 photo-apply (the `logo`/`banner`/`photo` kinds + `EDIT_PHOTO_APPLY_NOT_SUPPORTED` - separate; B4 only touches the `document` kind), PR3 `branchCount`, stash restore, §B24-TIMELINE, unrelated cleanup. No required-doc gating; `AGREEMENT` is not a signature flow.
- **Stop conditions:** (a) D1a transport/dependency must be decided before implementation; (b) any schema need triggers the D7 stop-and-report; (c) if inspection during implementation reveals a direct dependency on B5 / Merchant Portal / photo-apply, report it instead of implementing across it.

## 12. PR shape

Likely two PRs (backend then admin-web), or one if small: B4-core (capability + `putObject`/`deleteObject` storage helpers + read/upload/delete routes + audit events + backend tests) then B4-web (documents card + dialogs + hooks + capability mirror + NamedGateBanner + admin-web tests + `next build`). Each: independent review + Codex + CI green before a SHA-bound merge. Do NOT merge without owner sign-off.
