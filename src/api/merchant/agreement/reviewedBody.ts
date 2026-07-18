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
// collapse internal whitespace to a single space, Unicode NFC, strip Unicode
// default-ignorable code points + C0/C1 control characters). The SAME normalized signer
// values feed the reviewed body, the reviewedContentHash, the sign call, and the persisted
// record. reviewedContentHash = sha256(reviewedBody) over the exact UTF-8 bytes, so the
// stored reviewedBody is the self-verifying immutable pre-image of the hash (§6).

import { AppError } from '../../shared/errors'
import { computeContentHash } from './versions'

export type AgreementSignMethodValue = 'IN_PERSON_ASSISTED' | 'SELF_SERVE_CLICK'

/** The display value for an unset optional identity field (matches the PDF renderer). */
export const NOT_PROVIDED = 'Not provided'

// Characters that render as nothing (or as a non-printing control) but are not matched by
// \s, so plain trim()/collapse leaves them in place: the Unicode Default_Ignorable_Code_Point
// property (zero-width space U+200B, zero-width non/joiner U+200C/U+200D, LRM/RLM U+200E/
// U+200F, word joiner U+2060, soft hyphen U+00AD, Mongolian vowel separator U+180E, the BOM/
// ZWNBSP U+FEFF, variation selectors, invisible math operators, and similar format
// characters) plus the C0/C1 control characters (\p{Cc}: U+0000-U+001F, U+007F-U+009F; the
// whitespace-acting ones among these -- tab/LF/CR/FF/VT -- are already collapsed by the \s+
// step above, this additionally strips the non-whitespace controls such as NUL/BEL/ESC).
const INVISIBLE_OR_CONTROL_RE = /[\p{Default_Ignorable_Code_Point}\p{Cc}]/gu

/**
 * True when a normalized signer value has at least one letter or digit (\p{L} / \p{N}).
 * Catches content that is non-empty but not legible: a lone combining mark with no base
 * character to attach to (e.g. a bare U+0301), or a value built entirely from punctuation/
 * symbols. Not a real-identity check, only a "something legible was typed" check.
 */
function hasLegibleContent(value: string): boolean {
  return /[\p{L}\p{N}]/u.test(value)
}

/**
 * Deterministic, server-side normalization for a signer-provided free-text value (the
 * typed name, the authority role). Unicode NFC first (so canonically-equivalent inputs
 * hash identically), collapse ALL internal whitespace runs (spaces, tabs, newlines) to a
 * single space, trim, then strip Unicode default-ignorable code points and C0/C1 control
 * characters (see INVISIBLE_OR_CONTROL_RE) and trim again. Idempotent. The SAME function is
 * applied wherever the value is used, so the reviewed body, the reviewedContentHash, and the
 * persisted record always agree, and the CLEANED value (not the raw input) is what is ever
 * hashed or persisted.
 */
export function normalizeSignerText(raw: string | null | undefined): string {
  return (raw ?? '')
    .normalize('NFC')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(INVISIBLE_OR_CONTROL_RE, '')
    .trim()
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

  // FIX 3 (decision doc §8; single chokepoint), hardened (D65 signer-name hardening pass). A
  // personalised reviewed body cannot be validly produced without a real signatory name +
  // authority role. normalizeSignerText already strips Unicode default-ignorable code points
  // (zero-width space, bidi marks, word joiner, soft hyphen, BOM, variation selectors: the
  // characters a browser renders as nothing) and C0/C1 controls, so this backstop requires the
  // CLEANED value to contain at least one \p{L} letter or \p{N} digit. That single check covers
  // an EMPTY string, a whitespace-only string (e.g. a non-breaking space passes a route .min(1)
  // but normalizes to ""), a string built entirely from invisible/format characters, AND a
  // value that is non-empty but not legible (a lone combining mark with no base character, or
  // punctuation/symbols only). This is a "something legible was typed" check, not a real-identity
  // check. It runs BEFORE any hash/body derivation or write. Because EVERY preview + both sign
  // paths + the self-serve accept route through this shared render, this backstop makes an
  // empty-or-invisible-signer personalised body impossible everywhere at once (the sign/accept
  // paths also pre-check the plain-empty case via the same normalizeSignerText, this catches the
  // previews, the invisible/lone-combining-mark cases, and any future caller).
  if (!hasLegibleContent(normalizedSignerName) || !hasLegibleContent(normalizedSignerRole)) {
    throw new AppError('AGREEMENT_SIGNER_INVALID')
  }

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
