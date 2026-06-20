import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { CONTRACT_VERSION, CONTRACT_TEXT, getOnboardingChecklist, getOnboardingTaxonomy, acceptContract, submitForApproval } from './service'
import { setMerchantIdentity } from '../profile/service'

export async function onboardingRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/onboarding'

  app.get(`${prefix}/checklist`, async (req: FastifyRequest, reply) => {
    const checklist = await getOnboardingChecklist(app.prisma, req.user.sub)
    return reply.send(checklist)
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

  app.get(`${prefix}/contract`, async (_req: FastifyRequest, reply) => {
    return reply.send({ version: CONTRACT_VERSION, text: CONTRACT_TEXT })
  })

  app.post(`${prefix}/contract/accept`, async (req: FastifyRequest, reply) => {
    const { version } = z.object({ version: z.string() }).parse(req.body)
    const result = await acceptContract(app.prisma, req.user.sub, version, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })

  app.post(`${prefix}/submit`, async (req: FastifyRequest, reply) => {
    const result = await submitForApproval(app.prisma, app.redis, req.user.sub, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
