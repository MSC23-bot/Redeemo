import { FastifyInstance } from 'fastify'
import { requireAdminCapability } from '../capability'
import { getCurrentAgreement } from '../../merchant/agreement/versions'
import { isVersionWatermarked } from '../../merchant/agreement/service'

// D65 signing-integrity correction: the admin ceremony AGREEMENT-TEXT READ.
//
// WHY: the in-person ceremony must prove the owner reviewed and accepted the EXACT full
// agreement version the backend records. Before this route the ceremony rendered only a
// 6-term summary and deferred the full agreement to after signing, so what the owner saw
// was never bound to the recorded evidence. This read returns the COMPLETE current
// agreement text (the exact bytes whose sha256 == contentHash) so the ceremony can present
// it, gate review over the full text, and echo the SAME version into the sign call. The
// sign service pins getCurrentAgreement() and refuses a mismatched client-echoed version
// (409 AGREEMENT_VERSION_MISMATCH), so returning getCurrentAgreement() here keeps
// display == evidence.
//
// PLATFORM-GLOBAL, not merchant-scoped: the agreement is identical for every merchant, so
// the path carries no :id and the payload carries NO merchant data and NO PII (only the
// version metadata + the public agreement text). Gated on the SAME capability as the
// ceremony (`merchant:sign-agreement`, held by FIELD / OPERATIONS / SUPER): if you may run
// the ceremony you may read what you are about to present; anyone lacking it is 403
// fail-closed by requireAdminCapability.
export async function adminAgreementRoutes(app: FastifyInstance) {
  // Read the CURRENT agreement the ceremony will sign. Deliberately getCurrentAgreement()
  // (not getServedAgreement()): the ceremony's signAgreementInPerson signs + version-checks
  // against getCurrentAgreement(), so the displayed text MUST be that same version for the
  // review to bind to the recorded evidence.
  app.get(
    '/api/v1/admin/agreement/current',
    { preHandler: [requireAdminCapability('merchant:sign-agreement')] },
    async () => {
      const agreement = getCurrentAgreement()
      return {
        version: agreement.version,
        // The full canonical source text whose sha256 == contentHash (the exact bytes the
        // ceremony PDF renders + the evidence record pins). No truncation, no summary.
        text: agreement.content,
        contentHash: agreement.contentHash,
        // The version's own draft status.
        isDraft: agreement.isDraft,
        // The pending-legal-review / watermark driver (isVersionWatermarked semantics): a
        // draft version is watermarked / pending review, a non-draft never is. Drives the
        // ceremony's pre-sign banner so it is status-driven, not hardcoded.
        gated: isVersionWatermarked(agreement),
      }
    },
  )
}
