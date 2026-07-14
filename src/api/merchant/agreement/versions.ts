// D65 Slice 0: the merchant-agreement VERSION REGISTRY + content hashing.
//
// The agreement text is a VERSIONED ARTIFACT, not a hardcoded string. Each version
// maps a version id to (a) its canonical source content and (b) a sha256 content
// hash computed over that exact source. A signed MerchantAgreementRecord (Slice 1/2)
// pins { agreementVersion, contentHash }, so the precise text a merchant signed is
// always reconstructable and verifiable regardless of what the "current" version
// later becomes.
//
// APPEND, NEVER MUTATE. A new agreement version adds a NEW entry with a NEW id;
// published entries are frozen. Editing a published version's bytes would change its
// hash and is prohibited (a guard test recomputes each entry's hash from the embedded
// source AND asserts the embedded source still equals the on-disk artifact).
//
// Hash target (spec §5, owner fork 3): the CANONICAL SOURCE TEXT, not the rendered
// PDF bytes (PDF generation is not guaranteed byte-reproducible across renderer
// upgrades). The PDF footer stamps version + this hash so a downloaded PDF is
// self-describing.
//
// DRAFT posture (this slice): the CURRENT version is the v2 DRAFT (`2.0-draft`),
// whose source is `docs/legal/drafts/merchant-agreement-v2-draft.md` (embedded via
// agreement-v2-source.ts). It carries the LEGAL-REVIEW-REQUIRED / DRAFT header
// verbatim. FIX 3 separates two concerns: its `isDraft` flag ALONE drives the PDF
// watermark + pending-review labelling (a non-draft is never watermarked, whatever the
// env flag), while the production BINDING block is `isDraft OR the env flag` (see the
// ceremony service: isVersionWatermarked vs isVersionGated). On solicitor sign-off
// (Slice 6, out of scope here) the frozen `docs/legal/agreements/merchant-agreement-v2.md`
// is registered as a SEPARATE non-draft `2.0` entry (a new append) - the draft id is
// never mutated in place.
//
// LEGACY FALLBACK (review-round S2): the previous production contract `1.0` is ALSO
// registered as a NON-DRAFT entry (its own sha256 over the legacy text, so evidence
// stays truthful). While the current version is a draft, a PRODUCTION deploy serves +
// binds `1.0` (see getServedAgreement in the service) so self-serve onboarding keeps
// the exact pre-D65 behaviour instead of exposing the draft. Non-production serves the
// draft for QA. The selection is generic: serve current unless production-and-current-
// is-draft, else the latest non-draft - so a frozen non-draft `2.0` (Slice 6) is served
// in production with no further code change.

import crypto from 'node:crypto'
import { MERCHANT_AGREEMENT_V2_SOURCE } from './agreement-v2-source'

export interface AgreementVersion {
  /** Stable version id pinned into every signed evidence record. */
  version: string
  /** The canonical agreement source (markdown) the PDF is rendered from + hashed over. */
  content: string
  /** sha256 (hex) of `content` - the value pinned + later verifiable. */
  contentHash: string
  /**
   * True while this version is a pre-sign-off DRAFT. READ (FIX 3): isDraft is the SOLE
   * driver of the PDF DRAFT watermark + any pending-review labelling (isVersionWatermarked)
   * - a draft is ALWAYS watermarked, a non-draft NEVER is, regardless of the
   * AGREEMENT_LEGAL_REVIEW_REQUIRED env flag. Separately, the production BINDING block is
   * `isDraft OR legalReviewRequired()` (isVersionGated), so even with the env flag lifted a
   * draft is still refused for a binding write in production (defence in depth). isDraft also
   * drives production version SELECTION: while the current version is a draft, production
   * falls back to the latest non-draft (see getServedAgreement).
   */
  isDraft: boolean
}

/** sha256 (hex) over the UTF-8 bytes of `content`. Single source of the hashing rule. */
export function computeContentHash(content: string): string {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex')
}

// The current version id. `2.0-draft` (not `2.0`) is deliberate: the registered bytes
// are the DRAFT artifact (with its DRAFT header). The frozen `2.0` is a future append.
export const CURRENT_AGREEMENT_VERSION = '2.0-draft'

// Review-round S2: the previous production contract, restored as a NON-DRAFT registry
// entry so production can keep serving + binding it (with truthful evidence) while the
// current version is a draft. This is the pre-D65 `CONTRACT_TEXT` VERBATIM (byte-for-byte,
// including its em-dash). There was no historical content hash (pre-D65 signing carried
// none), so nothing downstream depends on a specific legacy hash: it is computed fresh here.
//
// Byte-verbatim fidelity note: this is a served LEGAL artifact - the exact pre-D65 text
// production merchants signed. The em-dash below is PRE-EXISTING content, not authored
// output, so it is deliberately exempt from the CLAUDE.md section 9 style lock ("no
// em-dashes"), which governs newly authored prose, not preserved historical artifacts.
// Do not "fix" it to a colon: that would change the bytes (and therefore the hash) of a
// contract merchants already signed.
export const LEGACY_CONTRACT_VERSION = '1.0'
export const LEGACY_CONTRACT_TEXT = `
Redeemo Merchant Agreement v${LEGACY_CONTRACT_VERSION}

By accepting this agreement, you agree to offer a minimum of two Redeemo Mandatory Vouchers (RMV) on the platform. These vouchers are performance-based — you are only promoted when a customer redeems. You retain full control of your custom vouchers. Redeemo reserves the right to suspend merchants who fail to honour redeemed vouchers.

Full legal terms are available at redeemo.co.uk/merchant-terms.
`.trim()

const V1_LEGACY: AgreementVersion = {
  version: LEGACY_CONTRACT_VERSION,
  content: LEGACY_CONTRACT_TEXT,
  contentHash: computeContentHash(LEGACY_CONTRACT_TEXT),
  isDraft: false,
}

const V2_DRAFT: AgreementVersion = {
  version: CURRENT_AGREEMENT_VERSION,
  content: MERCHANT_AGREEMENT_V2_SOURCE,
  contentHash: computeContentHash(MERCHANT_AGREEMENT_V2_SOURCE),
  isDraft: true,
}

// The registry. Keyed by version id. Frozen so a caller can never mutate an entry.
// Insertion order is chronological (older first) so "latest non-draft" = the last
// non-draft in iteration order.
const REGISTRY: Readonly<Record<string, AgreementVersion>> = Object.freeze({
  [V1_LEGACY.version]: V1_LEGACY,
  [V2_DRAFT.version]: V2_DRAFT,
})

/** All registered version ids (for tests / diagnostics). */
export function listAgreementVersions(): AgreementVersion[] {
  return Object.values(REGISTRY)
}

/** Resolve a version by id, or undefined if unknown (caller fails closed). */
export function getAgreementVersion(version: string): AgreementVersion | undefined {
  return Object.hasOwn(REGISTRY, version) ? REGISTRY[version] : undefined
}

/** The current agreement version (the ceremony always presents THIS one). */
export function getCurrentAgreement(): AgreementVersion {
  return REGISTRY[CURRENT_AGREEMENT_VERSION]
}

/**
 * The latest registered NON-DRAFT version (by insertion order), or undefined if none.
 * Used as the production fallback while the current version is still a draft. Today the
 * only non-draft is the legacy `1.0`; a frozen `2.0` (Slice 6) would append after it and
 * become the latest non-draft automatically.
 */
export function getLatestNonDraftAgreement(): AgreementVersion | undefined {
  const nonDrafts = Object.values(REGISTRY).filter((v) => !v.isDraft)
  return nonDrafts.length > 0 ? nonDrafts[nonDrafts.length - 1] : undefined
}
