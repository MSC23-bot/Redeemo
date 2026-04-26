import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { passwordSchema } from '../../shared/schemas'
import {
  getCustomerProfile,
  updateCustomerProfile,
  updateCustomerInterests,
  getAvailableInterests,
  changeCustomerPassword,
  markOnboardingComplete,
  markSubscriptionPromptSeen,
} from './service'

const updateProfileBody = z.object({
  firstName:         z.string().min(1).max(50).optional(),
  lastName:          z.string().min(1).max(50).optional(),
  name:              z.string().min(1).max(100).optional(), // deprecated: legacy single-name field; prefer firstName
  dateOfBirth:       z.string().datetime({ offset: true }).optional(),
  gender:            z.string().max(30).optional(),
  addressLine1:      z.string().max(100).optional(),
  addressLine2:      z.string().max(100).optional(),
  city:              z.string().max(80).optional(),
  postcode:          z.string().max(10).optional(),
  profileImageUrl:   z.union([z.string().url(), z.string().startsWith('data:image/')]).nullable().optional(),
  newsletterConsent: z.boolean().optional(),
})

const updateInterestsBody = z.object({
  interestIds: z.array(z.string()).max(20),
})

const changePasswordBody = z.object({
  currentPassword: z.string(),
  newPassword:     passwordSchema,
})

export async function profileRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/customer/profile'

  // GET /api/v1/customer/profile — get own profile
  app.get(prefix, async (req: FastifyRequest, reply) => {
    const profile = await getCustomerProfile(app.prisma, req.user.sub)
    return reply.send(profile)
  })

  // PATCH /api/v1/customer/profile — update own profile fields
  app.patch(prefix, async (req: FastifyRequest, reply) => {
    const body = updateProfileBody.parse(req.body)
    const updated = await updateCustomerProfile(app.prisma, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.send(updated)
  })

  // GET /api/v1/customer/profile/available-interests — all active interests (for the selector UI)
  app.get(`${prefix}/available-interests`, async (_req: FastifyRequest, reply) => {
    const interests = await getAvailableInterests(app.prisma)
    return reply.send({ interests })
  })

  // GET /api/v1/customer/profile/interests — get own interests
  app.get(`${prefix}/interests`, async (req: FastifyRequest, reply) => {
    const userId = req.user.sub
    const result = await getCustomerProfile(app.prisma, userId)
    return reply.send({ interests: result.interests })
  })

  // PUT /api/v1/customer/profile/interests — replace interests (full replace)
  app.put(`${prefix}/interests`, async (req: FastifyRequest, reply) => {
    const { interestIds } = updateInterestsBody.parse(req.body)
    const result = await updateCustomerInterests(app.prisma, req.user.sub, interestIds)
    return reply.send(result)
  })

  // POST /api/v1/customer/profile/onboarding-complete — one-shot, sets onboardingCompletedAt
  app.post(`${prefix}/onboarding-complete`, async (req: FastifyRequest, reply) => {
    const result = await markOnboardingComplete(app.prisma, req.user.sub)
    return reply.send(result)
  })

  // POST /api/v1/customer/profile/subscription-prompt-seen — one-shot, sets subscriptionPromptSeenAt
  app.post(`${prefix}/subscription-prompt-seen`, async (req: FastifyRequest, reply) => {
    const result = await markSubscriptionPromptSeen(app.prisma, req.user.sub)
    return reply.send(result)
  })

  // POST /api/v1/customer/profile/change-password — change password while authenticated
  app.post(`${prefix}/change-password`, async (req: FastifyRequest, reply) => {
    const body = changePasswordBody.parse(req.body)
    const result = await changeCustomerPassword(
      app.prisma,
      req.user.sub,
      body.currentPassword,
      body.newPassword,
      { ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '' }
    )
    return reply.send(result)
  })
}
