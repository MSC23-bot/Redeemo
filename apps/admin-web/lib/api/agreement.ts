/**
 * Merchant agreement (in-person signing ceremony) admin API.
 *
 * Typed wrapper for the D65 assisted contract-signing route
 * (spec docs/superpowers/specs/2026-07-10-d65-in-person-signing.md §2; backend
 * src/api/admin/merchants/routes.ts `POST .../agreement/sign`).
 *
 *   POST /api/v1/admin/merchants/:id/agreement/sign
 *     capability merchant:sign-agreement (+ FIELD pre-live scope)
 *     body   { signerName, signerRoleConfirmation, agreementVersion?, witnessLabel? }
 *     resp   { recordId, agreementVersion, contentHash, signedAt, contractStatus, gated }
 *
 * The rep (the authed admin) WITNESSES the owner's signature on the rep's device;
 * the owner's typed name is the signature of record. The rep is recorded as the
 * witness server-side (actorAdminId), never the signer (admin-never-signs lock).
 *
 * `gated: true` means the agreement is still pending legal review (the
 * fail-closed default): staging/dev record the signing DRAFT-watermarked, while a
 * PRODUCTION binding write is refused with AGREEMENT_LEGAL_REVIEW_REQUIRED (403).
 * Never render copy that states or implies solicitor approval.
 *
 * The response is Zod-validated so contract drift surfaces as a clear error
 * rather than an undefined-field crash. Errors throw `ApiError` from `apiFetch`
 * (AGREEMENT_LEGAL_REVIEW_REQUIRED, CONTRACT_ALREADY_SIGNED, AGREEMENT_VERSION_UNKNOWN,
 * AGREEMENT_SIGNER_INVALID, MERCHANT_NOT_FOUND, STORAGE_NOT_ENABLED).
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
   * Optional explicit version. Omitted here so the backend pins its CURRENT
   * registry version (the admin surface has no agreement-text read to select a
   * version from; see the ceremony integration note).
   */
  agreementVersion?: string
  /** Optional human label for the witnessing rep (display only in the PDF). */
  witnessLabel?: string
}

// ── Response schema ─────────────────────────────────────────────────────────────

const signAgreementResponseSchema = z.object({
  recordId: z.string(),
  agreementVersion: z.string(),
  contentHash: z.string(),
  // ISO string over the wire (Prisma DateTime serialises to a string).
  signedAt: z.string(),
  contractStatus: z.string(),
  // True while the agreement is pending legal review (fail-closed default).
  gated: z.boolean(),
})
export type SignAgreementResponse = z.infer<typeof signAgreementResponseSchema>

// ── API calls ───────────────────────────────────────────────────────────────────

export const agreementApi = {
  /**
   * Witness the in-person owner signing for a merchant. Throws ApiError on the
   * documented failure codes (AGREEMENT_LEGAL_REVIEW_REQUIRED on a production
   * binding write while the gate is on, CONTRACT_ALREADY_SIGNED, etc.).
   */
  sign: async (merchantId: string, input: SignAgreementInput): Promise<SignAgreementResponse> => {
    const body: Record<string, unknown> = {
      signerName: input.signerName,
      signerRoleConfirmation: input.signerRoleConfirmation,
    }
    if (input.agreementVersion) body.agreementVersion = input.agreementVersion
    if (input.witnessLabel) body.witnessLabel = input.witnessLabel

    const raw = await apiFetch<unknown>(`/api/v1/admin/merchants/${merchantId}/agreement/sign`, {
      method: 'POST',
      auth: true,
      body: JSON.stringify(body),
    })
    return signAgreementResponseSchema.parse(raw)
  },
}
