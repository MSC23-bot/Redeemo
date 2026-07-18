import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { getOnboardingChecklist, getOnboardingTaxonomy, getOnboardingStatus, acceptContract, submitForApproval, previewOwnContract } from './service'
import { setMerchantIdentity } from '../profile/service'
import { getServedAgreement } from '../agreement/service'
import { consumeMerchantAgreementPreview } from '../../shared/agreementPreviewLimiter'
import { resolveAdminMerchant } from '../shared'

export async function onboardingRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/onboarding'

  app.get(`${prefix}/checklist`, async (req: FastifyRequest, reply) => {
    const checklist = await getOnboardingChecklist(app.prisma, req.user.sub)
    return reply.send(checklist)
  })

  // M2 B4 (D8c): the merchant-facing read of their OWN onboarding approval status
  // + changes-requested reason (AdminApproval.comment). Merchant-auth (the plugin
  // preHandler); the service resolves the caller's OWN merchant via
  // resolveAdminMerchant so it can never read another merchant's approval.
  app.get(`${prefix}/status`, async (req: FastifyRequest, reply) => {
    const status = await getOnboardingStatus(app.prisma, req.user.sub)
    return reply.send(status)
  })

  // M2 B2 (D5): the non-supply-filtered taxonomy for the category + identity
  // picker. Merchant-auth (the plugin preHandler) but otherwise reference-data;
  // no per-merchant resolution needed.
  app.get(`${prefix}/taxonomy`, async (_req: FastifyRequest, reply) => {
    const taxonomy = await getOnboardingTaxonomy(app.prisma)
    return reply.send(taxonomy)
  })

  // M2 B2 (D5): the merchant category-identity write (subcategory + cuisine +
  // specialties). The service resolves the caller's OWN merchant and validates the
  // subcategory + tag eligibility before the transactional apply.
  app.post(`${prefix}/identity`, async (req: FastifyRequest, reply) => {
    const body = z.object({
      subcategoryId:          z.string(),
      primaryDescriptorTagId: z.string().nullish(),
      specialtyTagIds:        z.array(z.string()).optional(),
    }).parse(req.body)
    const result = await setMerchantIdentity(app.prisma, req.user.sub, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  // D65 Slice 0 + review-round S2: the served agreement comes from the version registry
  // (behaviour-compatible shape { version, text }). getServedAgreement returns the legacy
  // non-draft 1.0 in PRODUCTION while the current version is a draft (pre-D65 production
  // onboarding preserved), else the current version (the draft in non-production for QA).
  app.get(`${prefix}/contract`, async (_req: FastifyRequest, reply) => {
    const served = getServedAgreement()
    return reply.send({ version: served.version, text: served.content })
  })

  // D65 self-serve PERSONALISED preview (FIX 2; decision doc §4b). The merchant-authenticated
  // own-merchant counterpart of the admin ceremony preview. POST (not GET): the signer name +
  // role are entered by the owner and must not enter a URL/query log. There is NO :id param -
  // the OWN merchant is resolved from the authenticated caller (resolveAdminMerchant via
  // req.user.sub), so it can never preview a cross-merchant body. A REQUIRED bounded per-merchant
  // rate limit (consumeMerchantAgreementPreview: 30/merchant/min + 60/IP/min, env-overridable)
  // runs BEFORE the render. Returns the SAME shape as the admin preview via the SAME shared
  // reviewedBody module; the client echoes the returned reviewedContentHash into accept.
  app.post(`${prefix}/agreement/preview`, async (req: FastifyRequest, reply) => {
    const body = z
      .object({
        signerName: z.string().trim().max(200),
        signerRoleConfirmation: z.string().trim().max(200),
      })
      .strict()
      .parse(req.body)

    // Own-merchant resolution (never a cross-merchant id) gives the rate-limit key AND the render
    // target in one lookup. FIX 3 (empty-normalized signer/role) is enforced inside the shared
    // reviewedBody module (AGREEMENT_SIGNER_INVALID), so a whitespace-only name is rejected.
    const { merchantId } = await resolveAdminMerchant(app.prisma, req.user.sub)
    await consumeMerchantAgreementPreview(app.redis, { merchantId, ip: req.ip })

    const result = await previewOwnContract(app.prisma, merchantId, {
      signerName: body.signerName,
      signerRoleConfirmation: body.signerRoleConfirmation,
    })
    return reply.send(result)
  })

  // D65 personalised-agreement (decision doc §8): signerName + signerRoleConfirmation +
  // reviewedContentHash are threaded through for the evidence record + the review-binding echo.
  // They stay OPTIONAL at the route for backward compatibility (the legacy v1 self-serve path
  // requires none of them), but acceptContract REQUIRES the signer name + role AND a valid echo
  // on the D65 v2+ path (AGREEMENT_SIGNER_INVALID / AGREEMENT_REVIEW_HASH_MISMATCH otherwise), so
  // v2+ self-serve is FAIL-CLOSED without a valid echo. The merchant-web FORM must call the
  // preview route above and send all three for the v2+ path; that UI change is the Merchant
  // Portal session's, not this PR's.
  app.post(`${prefix}/contract/accept`, async (req: FastifyRequest, reply) => {
    const { version, signerName, signerRoleConfirmation, reviewedContentHash } = z
      .object({
        version: z.string(),
        signerName: z.string().trim().min(1).max(200).optional(),
        signerRoleConfirmation: z.string().trim().min(1).max(200).optional(),
        reviewedContentHash: z.string().trim().min(1).optional(),
      })
      .parse(req.body)
    const result = await acceptContract(
      app.prisma,
      req.user.sub,
      version,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      { signerName, signerRoleConfirmation, reviewedContentHash },
    )
    return reply.send(result)
  })

  app.post(`${prefix}/submit`, async (req: FastifyRequest, reply) => {
    const result = await submitForApproval(app.prisma, app.redis, req.user.sub, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
