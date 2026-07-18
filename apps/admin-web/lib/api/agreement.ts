/**
 * Merchant agreement (in-person signing ceremony) admin API.
 *
 * Typed wrappers for the D65 assisted contract-signing routes
 * (spec docs/superpowers/specs/2026-07-10-d65-in-person-signing.md §2; backend
 * src/api/admin/merchants/routes.ts `POST .../agreement/sign` and the platform-global
 * agreement-text read src/api/admin/agreement/routes.ts `GET .../agreement/current`).
 *
 *   GET  /api/v1/admin/agreement/current   (D65 signing-integrity)
 *     capability merchant:sign-agreement (the ceremony capability)
 *     resp   { version, text, contentHash, isDraft, gated }
 *     Platform-global (the agreement is identical for every merchant); NO PII, no
 *     merchant data. `text` is the FULL current agreement whose sha256 == contentHash:
 *     the exact bytes the ceremony PDF renders + the evidence record pins. The ceremony
 *     presents THIS text, gates review over the full text, and echoes THIS `version` into
 *     the sign call so the displayed agreement is bound to the recorded evidence.
 *
 *   POST /api/v1/admin/merchants/:id/agreement/sign
 *     capability merchant:sign-agreement (+ FIELD pre-live scope)
 *     body   { signerName, signerRoleConfirmation, agreementVersion, reviewedContentHash }
 *            (FIX 1: agreementVersion + reviewedContentHash are REQUIRED - the strict route
 *            rejects a body missing either; a signature is impossible without the review echo)
 *     resp   { recordId, agreementVersion, contentHash, signedAt, contractStatus, gated }
 *
 * The rep (the authed admin) WITNESSES the owner's signature on the rep's device;
 * the owner's typed name is the signature of record. The rep is recorded as the
 * witness server-side (actorAdminId + server-derived witness identity), never the
 * signer, and never from a client-supplied label (admin-never-signs lock). The
 * route body is strict, so it accepts ONLY signerName, signerRoleConfirmation,
 * agreementVersion and reviewedContentHash; agreementVersion is REQUIRED (FIX 1),
 * not optional (the strict route rejects a body missing it).
 *
 * `gated: true` (on either read or sign) means the agreement VERSION is itself a draft
 * (watermark semantics, backend `isVersionWatermarked`), decoupled from the
 * AGREEMENT_LEGAL_REVIEW_REQUIRED env flag: that flag instead drives whether a
 * PRODUCTION binding write is refused with AGREEMENT_LEGAL_REVIEW_REQUIRED (403).
 * A draft version is always watermarked regardless of the env flag; a non-draft
 * version is never watermarked even while the env flag is on. Never render copy
 * that states or implies solicitor approval.
 *
 * The responses are Zod-validated so contract drift surfaces as a clear error
 * rather than an undefined-field crash. Errors throw `ApiError` from `apiFetch`
 * (AGREEMENT_LEGAL_REVIEW_REQUIRED, AGREEMENT_VERSION_MISMATCH, CONTRACT_ALREADY_SIGNED,
 * AGREEMENT_SIGNER_INVALID, MERCHANT_NOT_PRE_LIVE_FOR_FIELD, MERCHANT_NOT_FOUND,
 * STORAGE_NOT_ENABLED). AGREEMENT_VERSION_MISMATCH (409) is the client-echo integrity
 * check: the ceremony echoes the version the read returned, so if the current version
 * changed between the read and the submit the backend refuses (409) and the ceremony
 * forces a reload + re-review rather than silently signing a version the owner never saw.
 */
import { z } from 'zod'
import { apiFetch } from './client'

// ── Request shape ───────────────────────────────────────────────────────────────

export interface SignAgreementInput {
  /** The owner's typed full name: the signature of record. */
  signerName: string
  /** The authority-attestation role, e.g. "Owner", "Director". */
  signerRoleConfirmation: string
  /**
   * REQUIRED (FIX 1, D65 review-binding). The agreement version the owner actually reviewed
   * (from the preview). The ceremony ALWAYS supplies it so the displayed text is bound to the
   * recorded evidence: the backend refuses (AGREEMENT_VERSION_MISMATCH, 409) unless it equals
   * the current version. A signature is impossible without it.
   */
  agreementVersion: string
  /**
   * REQUIRED (FIX 1). The server-authoritative reviewedContentHash the owner reviewed (from the
   * preview). The ceremony ECHOES it; the backend RE-DERIVES the personalised body from the same
   * normalized inputs and refuses (AGREEMENT_REVIEW_HASH_MISMATCH, 409) unless it matches, so the
   * owner cannot sign a body they did not review. NO browser recompute: the client only echoes.
   */
  reviewedContentHash: string
}

// ── Personalised preview (ceremony) ─────────────────────────────────────────────

export interface AgreementPreviewInput {
  /** The owner's typed full name (RAW; the server normalizes it). */
  signerName: string
  /** The authority-attestation role (RAW; the server normalizes it). */
  signerRoleConfirmation: string
}

const agreementPreviewResponseSchema = z.object({
  version: z.string(),
  /** The personalised reviewed body the owner reviews + accepts (already substituted). */
  personalisedText: z.string(),
  /** sha256(personalisedText); server-authoritative; echoed into the sign call. */
  reviewedContentHash: z.string(),
  /** sha256 of the unsubstituted canonical source (the template-version hash). */
  canonicalContentHash: z.string(),
  /** The version's own draft status. */
  isDraft: z.boolean(),
  /** Watermark / pending-legal-review driver (isVersionWatermarked semantics). */
  gated: z.boolean(),
})
export type AgreementPreviewResponse = z.infer<typeof agreementPreviewResponseSchema>

// ── Agreement-text read (platform-global; not used by the ceremony) ──────────────

const agreementTextResponseSchema = z.object({
  version: z.string(),
  /** The FULL current agreement text whose sha256 == contentHash (no summary). */
  text: z.string(),
  contentHash: z.string(),
  /** The version's own draft status. */
  isDraft: z.boolean(),
  /** Watermark / pending-legal-review driver (isVersionWatermarked semantics). */
  gated: z.boolean(),
})
export type AgreementTextResponse = z.infer<typeof agreementTextResponseSchema>

// ── Evidence read (D65 lane-2; Merchant 360 "View signing evidence") ──────────────

// The ORDINARY-tier evidence detail (decision doc §11). The WITHHELD tier (witnessEmail /
// ipAddress / userAgent) and the raw pdfKey are NEVER in this payload by construction: the
// backend curates the response, so there are no fields for them here. `witnessName` is null on a
// self-serve (no-witness) signing.
const agreementEvidenceResponseSchema = z.object({
  agreementVersion: z.string(),
  /** The version's own draft status. */
  isDraft: z.boolean(),
  /** Watermark / pending-legal-review driver (isVersionWatermarked semantics). */
  gated: z.boolean(),
  /** The canonical (unsubstituted-template) content hash pinned at signing. */
  contentHash: z.string(),
  /** sha256 of the immutable personalised reviewed body (the legally accepted object). */
  reviewedContentHash: z.string(),
  /** The signature of record (typed full name). */
  signerName: z.string(),
  /** The signatory's authority attestation. */
  signerRoleConfirmation: z.string(),
  method: z.string(),
  /** ISO over the wire (Prisma DateTime serialises to a string). */
  signedAt: z.string(),
  /** The witnessing rep's NAME (in-person); null on self-serve. Email is WITHHELD. */
  witnessName: z.string().nullable(),
})
export type AgreementEvidenceResponse = z.infer<typeof agreementEvidenceResponseSchema>

// ── Response schema ─────────────────────────────────────────────────────────────

const signAgreementResponseSchema = z.object({
  recordId: z.string(),
  agreementVersion: z.string(),
  contentHash: z.string(),
  // ISO string over the wire (Prisma DateTime serialises to a string).
  signedAt: z.string(),
  contractStatus: z.string(),
  // True when the served agreement version is itself a draft (watermark status),
  // independent of the AGREEMENT_LEGAL_REVIEW_REQUIRED env flag.
  gated: z.boolean(),
})
export type SignAgreementResponse = z.infer<typeof signAgreementResponseSchema>

// ── API calls ───────────────────────────────────────────────────────────────────

export const agreementApi = {
  /**
   * Read the CURRENT agreement the ceremony will present + sign (platform-global;
   * no merchant id, no PII). The returned `version` is echoed into `sign` so the
   * displayed text is bound to the recorded evidence. Throws ApiError on
   * ADMIN_CAPABILITY_DENIED for a session lacking merchant:sign-agreement.
   */
  getCurrent: async (): Promise<AgreementTextResponse> => {
    const raw = await apiFetch<unknown>('/api/v1/admin/agreement/current', {
      method: 'GET',
      auth: true,
    })
    return agreementTextResponseSchema.parse(raw)
  },

  /**
   * Render the merchant-PERSONALISED agreement body for the ceremony (POST, never GET: the
   * signer name + role are entered during the ceremony and must not enter a URL/query log).
   * The server resolves the merchant identity + version + method; only the signer name + role
   * are sent. The returned reviewedContentHash is echoed into the sign call. Throws ApiError
   * on ADMIN_CAPABILITY_DENIED, MERCHANT_NOT_PRE_LIVE_FOR_FIELD, AGREEMENT_PREVIEW_RATE_LIMITED.
   */
  preview: async (merchantId: string, input: AgreementPreviewInput): Promise<AgreementPreviewResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/agreement/preview`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        signerName: input.signerName,
        signerRoleConfirmation: input.signerRoleConfirmation,
      }),
    })
    return agreementPreviewResponseSchema.parse(raw)
  },

  /**
   * Witness the in-person owner signing for a merchant. Echoes the reviewed version + the
   * server-authoritative reviewedContentHash from the preview so display is bound to the
   * recorded evidence. Throws ApiError on the documented failure codes
   * (AGREEMENT_LEGAL_REVIEW_REQUIRED, CONTRACT_ALREADY_SIGNED, AGREEMENT_VERSION_MISMATCH,
   * AGREEMENT_REVIEW_HASH_MISMATCH when a contractual input changed since review, etc.).
   */
  sign: async (merchantId: string, input: SignAgreementInput): Promise<SignAgreementResponse> => {
    // FIX 1 (D65 review-binding): agreementVersion + reviewedContentHash are REQUIRED and ALWAYS
    // sent (the strict backend route now rejects a body missing either). The body carries exactly
    // the four accepted fields; the ceremony always echoes the preview's version + hash.
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/agreement/sign`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify({
        signerName: input.signerName,
        signerRoleConfirmation: input.signerRoleConfirmation,
        agreementVersion: input.agreementVersion,
        reviewedContentHash: input.reviewedContentHash,
      }),
    })
    return signAgreementResponseSchema.parse(raw)
  },

  /**
   * D65 lane-2: read the ORDINARY-tier signing evidence for a merchant (the Merchant 360 "View
   * signing evidence" action). Loaded on an EXPLICIT admin click, never auto-fetched. Gated on
   * contract:view-evidence server-side; a merchant with no record 404s EVIDENCE_NOT_FOUND
   * (non-leaking). The withheld tier + pdfKey are never in the payload. Throws ApiError on the
   * documented codes (ADMIN_CAPABILITY_DENIED, EVIDENCE_NOT_FOUND, AGREEMENT_EVIDENCE_RATE_LIMITED).
   */
  getEvidence: async (merchantId: string): Promise<AgreementEvidenceResponse> => {
    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/agreement/evidence`, {
      method: 'GET',
      auth: true,
    })
    return agreementEvidenceResponseSchema.parse(raw)
  },

  /**
   * D65 lane-2: download the signed-agreement PDF via the SERVER-PROXIED route (decision doc §17),
   * NOT a presigned URL. A normal authenticated request that returns the verified PDF bytes as a
   * Blob (the backend fetches, re-hashes, compares, and streams the same bytes only on a match).
   * Throws ApiError on a fail-closed response (AGREEMENT_EVIDENCE_INTEGRITY_FAILURE,
   * STORAGE_NOT_ENABLED, EVIDENCE_NOT_FOUND, ADMIN_CAPABILITY_DENIED, AGREEMENT_EVIDENCE_RATE_LIMITED).
   */
  downloadEvidencePdf: async (merchantId: string): Promise<Blob> => {
    return apiFetch<Blob>(`/api/v1/admin/merchants/${merchantId}/agreement/evidence/pdf`, {
      method: 'GET',
      auth: true,
      blob: true,
    })
  },
}
