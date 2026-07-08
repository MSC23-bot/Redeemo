# B3 · Merchant Documents MVP (Option 1): smallest safe build plan

**Status: PLAN, pre-implementation. Owner directed Option 1 (merchant self-serve upload +
view OWN documents, reusing existing storage/backend patterns) on 2026-07-08. This plan is the
"smallest safe build plan" the owner asked for before implementation; the decisions in §5 are
surfaced for confirmation with recommended defaults.**

## 1. Storage gating: CONFIRMED

- `STORAGE_ENABLED` defaults OFF; when `true` it hard-requires the five R2 secrets
  (`src/api/shared/env.ts:84-89`). `isStorageEnabled()` guards every storage call
  (`src/api/shared/storage.ts:82`); the S3 client is never constructed while dark.
- The `document` upload kind ALREADY EXISTS in the per-kind policy table: **private, 10 MB
  max, pdf/jpg/png** (`storage.ts:41-51`). Private docs are served via short-lived
  `presignGet`, never a public URL.
- The merchant upload route precedent fails closed with `STORAGE_NOT_ENABLED` BEFORE reading
  any bytes (`src/api/merchant/upload/routes.ts:25`), and merchant-web has a proven
  storage-dark degrade UI (`components/ui/file-upload.tsx:99-107`).
- Conclusion: the feature ships storage-dark-safe by construction; no flag or env change is
  part of this slice. Actually enabling storage on staging/prod remains its own gated
  operation (PROJECT-STATE §4.4).

## 2. What already exists (reuse map, repo-verified)

- Schema: `MerchantDocument` (id, merchantId, documentType, fileUrl = raw R2 key, uploadedAt)
  + fixed `DocumentType` enum (BUSINESS_VERIFICATION_1/2, PRICE_LIST, AGREEMENT)
  (`prisma/schema.prisma:736-746`, `:402-407`). **No schema change needed**; `expiryDate`
  stays deferred (§HOME-DOCS).
- Backend logic: admin-only document list/upload/delete
  (`src/api/admin/merchants/documents.ts`) with the exact conventions to copy: presign per
  view with `available:false` degrade, raw `fileUrl` never returned, server-proxied
  `putObject`, atomic row+audit, orphan-object cleanup.
- Merchant-side guards: `resolveMerchantContext` / `assertOwner`
  (`src/api/merchant/shared.ts`); JWT-resolved merchantId, never from the body.
- UI templates: admin-web `DocumentList.tsx` / `UploadDocumentDialog.tsx` /
  `useMerchantDocuments.ts` are near-drop-in; merchant-web placeholder lives in
  `ComplianceStatusCard.tsx:99-108` behind pinned tests that assert NO upload/list affordance
  (tests updated by this slice, deliberately).

## 3. The smallest safe slice (build list)

Backend (`src/api/merchant/documents/`, registered in `src/api/merchant/plugin.ts`):
1. `GET /api/v1/merchant/documents`: list OWN merchant's documents; per-row `presignGet` with
   `available:false` degrade; storage-dark returns rows with `available:false` (list still
   works dark: types + dates visible, no URLs).
2. `POST /api/v1/merchant/documents`: multipart, server-proxied `putObject(kind:'document')`,
   `documentType` restricted to the §5-D2 allow-list, fails closed on `STORAGE_NOT_ENABLED`
   before reading bytes, audited via `writeAuditLogTx` (actor = the merchant user; raw key
   excluded from audit payload), atomic row+audit with orphan-object cleanup on failure.
3. NO merchant delete endpoint in the MVP (see §5-D3).

Merchant-web:
4. Documents card replacing the placeholder block inside the Business Profile Compliance
   section (`/profile`): list (type label, uploaded date, Available badge, signed-URL "Open")
   + upload affordance with the existing storage-dark degrade copy; pinned placeholder tests
   updated to pin the NEW contract instead.
5. `lib/api/documents.ts` + hooks mirroring the admin client minus the `reason` field.

Tests: backend route/service suites mirroring the admin document suites (scope, dark-mode,
size/type rejection, wrong-merchant 404) + merchant-web jest for the card states.

## 4. Explicitly OUT of this slice

Admin "Redeemo needs a document" request mechanism (cross-surface, undesigned; stays in
§BP-DOC); `expiryDate` (§HOME-DOCS); merchant delete; onboarding-flow integration; enabling
`STORAGE_ENABLED` anywhere.

## 5. Decisions for owner confirmation (recommended defaults)

- **D1 Roles**: upload = OWNER only; view = OWNER + BRANCH_MANAGER (STAFF no). Recommended.
- **D2 Types**: merchants may upload BUSINESS_VERIFICATION_1, BUSINESS_VERIFICATION_2,
  PRICE_LIST. AGREEMENT stays admin/contract-flow-only. Recommended.
- **D3 Delete**: no self-delete in MVP (verification docs should not silently vanish from an
  approval trail; admin keeps its delete). Recommended.
- **D4 Placement**: card within Business Profile Compliance section (not a new route).
  Recommended.

With D1-D4 at defaults, this is a Tier 2 slice: one backend module + one merchant-web card,
no schema, no flags, storage-dark-safe.
