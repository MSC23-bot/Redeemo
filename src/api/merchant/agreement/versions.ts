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
// DRAFT posture (this slice): the only registered version is the v2 DRAFT
// (`2.0-draft`), whose source is `docs/legal/drafts/merchant-agreement-v2-draft.md`
// (embedded via agreement-v2-source.ts). It carries the LEGAL-REVIEW-REQUIRED / DRAFT
// header verbatim and is gated by AGREEMENT_LEGAL_REVIEW_REQUIRED (see the ceremony
// service). On solicitor sign-off (Slice 6, out of scope here) the frozen
// `docs/legal/agreements/merchant-agreement-v2.md` is registered as a SEPARATE `2.0`
// entry (a new append) - the draft id is never mutated in place.

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
   * True while this version is a pre-sign-off DRAFT. Drives the DRAFT watermark and
   * is independent of the AGREEMENT_LEGAL_REVIEW_REQUIRED env gate (a version can be
   * a draft artifact even before the deploy-time gate is consulted).
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

const V2_DRAFT: AgreementVersion = {
  version: CURRENT_AGREEMENT_VERSION,
  content: MERCHANT_AGREEMENT_V2_SOURCE,
  contentHash: computeContentHash(MERCHANT_AGREEMENT_V2_SOURCE),
  isDraft: true,
}

// The registry. Keyed by version id. Frozen so a caller can never mutate an entry.
const REGISTRY: Readonly<Record<string, AgreementVersion>> = Object.freeze({
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

/** The current agreement version (the one GET /contract and the ceremony present). */
export function getCurrentAgreement(): AgreementVersion {
  return REGISTRY[CURRENT_AGREEMENT_VERSION]
}
