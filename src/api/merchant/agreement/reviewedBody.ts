// D65 personalised-agreement: the SHARED render / normalize / hash module.
//
// SINGLE SOURCE OF TRUTH (decision doc 2026-07-15-d65-legal-object §3/§4/§4b). Both
// signing lanes and every surface that shows or binds the personalised agreement call
// THIS module, so they can never diverge on wording, normalization, or hash:
//   - the admin ceremony PREVIEW (POST /admin/merchants/:id/agreement/preview),
//   - the admin SIGN service (signAgreementInPerson re-derives here before any write),
//   - the self-serve ACCEPT backend (acceptContract, D65 v2+ path),
//   - the signed PDF (its body IS the reviewedBody produced here).
//
// THE LEGALLY ACCEPTED OBJECT (§3) = the merchant-personalised contractual BODY: the
// canonical template with the CONTRACTUAL-PARTY (businessLegalName / tradingName /
// companyNumber / vatNumber), the SIGNATORY (signerName / signerRoleConfirmation), and
// the KNOWN-BEFORE FACT (agreementVersion / canonical contentHash / method) placeholders
// resolved. EVENT-CREATED evidence (signedAt / ipAddress / userAgent / the witnessing
// event) is deliberately NOT here: it is appended to the final PDF as a separate
// signing-evidence block at the signing event, and shown pre-sign only as a NOTICE of
// what will be recorded. The v2.1-draft template's Execution section was trimmed of those
// event lines (decision doc §7), so after substitution the reviewed body contains no
// unresolved placeholder for any contractual field.
//
// DETERMINISM (§4, golden-testable): normalization is server-side + deterministic (trim,
// collapse internal whitespace to a single space, Unicode NFC). The SAME normalized signer
// values feed the reviewed body, the reviewedContentHash, the sign call, and the persisted
// record. reviewedContentHash = sha256(reviewedBody) over the exact UTF-8 bytes, so the
// stored reviewedBody is the self-verifying immutable pre-image of the hash (§6).

import { computeContentHash } from './versions'

export type AgreementSignMethodValue = 'IN_PERSON_ASSISTED' | 'SELF_SERVE_CLICK'

/** The display value for an unset optional identity field (matches the PDF renderer). */
export const NOT_PROVIDED = 'Not provided'

/**
 * Deterministic, server-side normalization for a signer-provided free-text value (the
 * typed name, the authority role). Unicode NFC first (so canonically-equivalent inputs
 * hash identically), then collapse ALL internal whitespace runs (spaces, tabs, newlines)
 * to a single space, then trim. Idempotent. The SAME function is applied wherever the
 * value is used, so the reviewed body, the hash, and the persisted record always agree.
 */
export function normalizeSignerText(raw: string | null | undefined): string {
  return (raw ?? '').normalize('NFC').replace(/\s+/g, ' ').trim()
}

/** The human-readable signing-method label (KNOWN-BEFORE fact, part of the reviewed body). */
export function methodLabel(method: AgreementSignMethodValue): string {
  return method === 'IN_PERSON_ASSISTED'
    ? 'In-person assisted (Redeemo representative device)'
    : 'Self-serve (merchant portal click-to-agree)'
}

/**
 * Substitute `{{placeholder}}` tokens from an OWN-property map only (no prototype-chain
 * lookup, so `{{constructor}}` and friends are left literal). An unknown placeholder is
 * left untouched. Shared by the reviewed-body render (there are no event placeholders left
 * to leak once the template is trimmed).
 */
export function substituteAgreementPlaceholders(source: string, map: Record<string, string>): string {
  return source.replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (whole, key: string) =>
    Object.hasOwn(map, key) ? map[key] : whole,
  )
}

export interface ReviewedBodyInput {
  /** Pinned agreement version id (KNOWN-BEFORE fact). */
  version: string
  /** sha256 of the UNSUBSTITUTED canonical source (KNOWN-BEFORE fact, the canonical hash). */
  canonicalContentHash: string
  /** The canonical agreement source (markdown) whose sha256 == canonicalContentHash. */
  content: string
  /** The signing channel (KNOWN-BEFORE fact). */
  method: AgreementSignMethodValue
  /** CONTRACTUAL-PARTY identity (from the merchant profile). */
  businessLegalName: string
  tradingName?: string | null
  companyNumber?: string | null
  vatNumber?: string | null
  /** SIGNATORY identity as typed (RAW: normalized here, never trusted pre-normalized). */
  signerName: string
  signerRoleConfirmation: string
}

export interface ReviewedBodyResult {
  /** The exact personalised contractual body (immutable pre-image of reviewedContentHash). */
  reviewedBody: string
  /** sha256(reviewedBody) over its exact UTF-8 bytes. Server-authoritative; client echoes. */
  reviewedContentHash: string
  /** The normalized signer values that fed the body + hash (persisted verbatim). */
  normalizedSignerName: string
  normalizedSignerRole: string
}

/**
 * Render the personalised reviewed body + its content hash from normalized inputs.
 * Deterministic and side-effect-free: the same inputs always produce the same bytes and
 * the same hash (golden-testable). Callers MUST use the returned normalizedSignerName /
 * normalizedSignerRole (not their raw inputs) wherever the signer values are persisted, so
 * the record's signer columns are exactly the values that hashed.
 */
export function renderReviewedBody(input: ReviewedBodyInput): ReviewedBodyResult {
  const normalizedSignerName = normalizeSignerText(input.signerName)
  const normalizedSignerRole = normalizeSignerText(input.signerRoleConfirmation)

  const map: Record<string, string> = {
    businessLegalName: input.businessLegalName,
    tradingName: input.tradingName || NOT_PROVIDED,
    companyNumber: input.companyNumber || NOT_PROVIDED,
    vatNumber: input.vatNumber || NOT_PROVIDED,
    signerName: normalizedSignerName,
    signerRoleConfirmation: normalizedSignerRole,
    agreementVersion: input.version,
    contentHash: input.canonicalContentHash,
    method: methodLabel(input.method),
  }

  // NFC over the whole body so equivalent inputs hash identically; idempotent on the
  // already-composed template bytes. This is the exact UTF-8 pre-image that is hashed and,
  // in the D65 v2+ path, persisted as the immutable reviewedBody column.
  const reviewedBody = substituteAgreementPlaceholders(input.content, map).normalize('NFC')
  const reviewedContentHash = computeContentHash(reviewedBody)

  return { reviewedBody, reviewedContentHash, normalizedSignerName, normalizedSignerRole }
}
