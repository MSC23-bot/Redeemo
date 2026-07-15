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
 *     body   { signerName, signerRoleConfirmation, agreementVersion? }
 *     resp   { recordId, agreementVersion, contentHash, signedAt, contractStatus, gated }
 *
 * The rep (the authed admin) WITNESSES the owner's signature on the rep's device;
 * the owner's typed name is the signature of record. The rep is recorded as the
 * witness server-side (actorAdminId + server-derived witness identity), never the
 * signer, and never from a client-supplied label (admin-never-signs lock). The
 * route body is strict, so it accepts ONLY signerName, signerRoleConfirmation and
 * the optional agreementVersion.
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
   * The agreement version the owner actually reviewed (from the agreement-text
   * read). The ceremony ALWAYS supplies it now so the displayed text is bound to
   * the recorded evidence: it is an INTEGRITY CHECK: if it no longer equals the
   * backend's current version the sign is refused (AGREEMENT_VERSION_MISMATCH, 409)
   * and the owner re-reviews. Still typed optional so the strict backend route (and
   * any non-ceremony caller) can pin the server current by omitting it.
   */
  agreementVersion?: string
}

// ── Agreement-text read (ceremony) ──────────────────────────────────────────────

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
   * Witness the in-person owner signing for a merchant. Throws ApiError on the
   * documented failure codes (AGREEMENT_LEGAL_REVIEW_REQUIRED on a production
   * binding write while the gate is on, CONTRACT_ALREADY_SIGNED,
   * AGREEMENT_VERSION_MISMATCH when the echoed version is stale, etc.).
   */
  sign: async (merchantId: string, input: SignAgreementInput): Promise<SignAgreementResponse> => {
    const body: Record<string, unknown> = {
      signerName: input.signerName,
      signerRoleConfirmation: input.signerRoleConfirmation,
    }
    if (input.agreementVersion) body.agreementVersion = input.agreementVersion

    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/agreement/sign`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
    return signAgreementResponseSchema.parse(raw)
  },
}
