import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { optionalUserId } from '../plugin'
import {
  listMerchantReviews, listBranchReviews, upsertBranchReview,
  deleteBranchReview, reportReview,
} from './service'

const idParam           = z.object({ id: z.string().min(1) })
const branchIdParam     = z.object({ branchId: z.string().min(1) })
const reviewIdParam     = z.object({ reviewId: z.string().min(1) })
const branchReviewParam = z.object({ branchId: z.string().min(1), reviewId: z.string().min(1) })

const paginationQuery = z.object({
  limit:    z.coerce.number().int().min(1).max(50).default(20),
  offset:   z.coerce.number().int().min(0).default(0),
  branchId: z.string().optional(),
})

const reviewBody = z.object({
  rating:  z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
})

const reportBody = z.object({
  reason:  z.enum(['OFFENSIVE', 'SPAM', 'FAKE', 'OTHER']),
  comment: z.string().max(500).optional(),
})

export async function reviewOpenRoutes(app: FastifyInstance) {
  app.get('/api/v1/customer/merchants/:id/reviews', async (req: FastifyRequest, reply) => {
    const { id }                      = idParam.parse(req.params)
    const { limit, offset, branchId } = paginationQuery.parse(req.query)
    const requestingUserId            = optionalUserId(req)
    const result = await listMerchantReviews(app.prisma, id, { branchId, limit, offset, requestingUserId })
    return reply.send(result)
  })

  app.get('/api/v1/customer/branches/:branchId/reviews', async (req: FastifyRequest, reply) => {
    const { branchId }      = branchIdParam.parse(req.params)
    const { limit, offset } = paginationQuery.parse(req.query)
    const requestingUserId  = optionalUserId(req)
    const result = await listBranchReviews(app.prisma, branchId, { limit, offset, requestingUserId })
    return reply.send(result)
  })
}

export async function reviewAuthRoutes(app: FastifyInstance) {
  app.post('/api/v1/customer/branches/:branchId/reviews', async (req: FastifyRequest, reply) => {
    const { branchId } = branchIdParam.parse(req.params)
    const data         = reviewBody.parse(req.body)
    const userId       = req.user.sub
    const result = await upsertBranchReview(app.prisma, branchId, userId, data)
    return reply.status(201).send(result)
  })

  app.delete('/api/v1/customer/branches/:branchId/reviews/:reviewId', async (req: FastifyRequest, reply) => {
    const { reviewId } = branchReviewParam.parse(req.params)
    const userId       = req.user.sub
    const result = await deleteBranchReview(app.prisma, reviewId, userId)
    return reply.send(result)
  })

  app.post('/api/v1/customer/reviews/:reviewId/report', async (req: FastifyRequest, reply) => {
    const { reviewId } = reviewIdParam.parse(req.params)
    const data         = reportBody.parse(req.body)
    const userId       = req.user.sub
    const result = await reportReview(app.prisma, reviewId, userId, data)
    return reply.status(result.created ? 201 : 200).send({ success: result.success })
  })
}
