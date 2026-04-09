import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { CONTRACT_VERSION, CONTRACT_TEXT, getOnboardingChecklist, acceptContract, submitForApproval } from './service'

export async function onboardingRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/onboarding'

  app.get(`${prefix}/checklist`, async (req: FastifyRequest, reply) => {
    const checklist = await getOnboardingChecklist(app.prisma, req.user.sub)
    return reply.send(checklist)
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
    const result = await submitForApproval(app.prisma, req.user.sub, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(result)
  })
}
