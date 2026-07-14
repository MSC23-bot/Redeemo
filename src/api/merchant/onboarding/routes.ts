import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { getOnboardingChecklist, getOnboardingTaxonomy, getOnboardingStatus, acceptContract, submitForApproval } from './service'
import { setMerchantIdentity } from '../profile/service'
import { getServedAgreement } from '../agreement/service'

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

  // D65 Slice 2: signerName is threaded through for the evidence record but stays
  // OPTIONAL for backward compatibility (the current merchant-web form does not send
  // it yet). When absent, acceptContract records a documented placeholder.
  app.post(`${prefix}/contract/accept`, async (req: FastifyRequest, reply) => {
    const { version, signerName } = z
      .object({ version: z.string(), signerName: z.string().trim().min(1).optional() })
      .parse(req.body)
    const result = await acceptContract(
      app.prisma,
      req.user.sub,
      version,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' },
      { signerName },
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
