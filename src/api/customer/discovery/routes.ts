import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { AppError } from '../../shared/errors'
import {
  getHomeFeed, getCustomerMerchant, getCustomerMerchantBranches,
  getCustomerVoucher, searchMerchants, listActiveCategories,
  getActiveCampaigns, getCampaignMerchants,
} from './service'
import { optionalUserId } from '../plugin'

const idParam     = z.object({ id: z.string().min(1) })
const searchQuery = z.object({
  q:          z.string().optional(),
  categoryId: z.string().optional(),
  limit:      z.coerce.number().int().min(1).max(50).default(20),
  offset:     z.coerce.number().int().min(0).default(0),
})

export async function discoveryRoutes(app: FastifyInstance) {
  // GET /api/v1/customer/home — home feed (no auth)
  // Optional bearer token decoded (not verified) to extract userId for personalisation.
  app.get('/api/v1/customer/home', async (req: FastifyRequest, reply) => {
    const query = z.object({
      lat: z.coerce.number().optional(),
      lng: z.coerce.number().optional(),
    }).parse(req.query)
    const userId = optionalUserId(req)
    const feed = await getHomeFeed(app.prisma, {
      userId,
      lat: query.lat ?? null,
      lng: query.lng ?? null,
    })
    return reply.send(feed)
  })

  // GET /api/v1/customer/merchants/:id — merchant profile (no auth)
  // Optional bearer token decoded (not verified) to derive isFavourited for authenticated users.
  app.get('/api/v1/customer/merchants/:id', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const userId = optionalUserId(req)
    const merchant = await getCustomerMerchant(app.prisma, id, userId)
    return reply.send(merchant)
  })

  // GET /api/v1/customer/merchants/:id/branches — branch list for redemption selector (no auth)
  app.get('/api/v1/customer/merchants/:id/branches', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const branches = await getCustomerMerchantBranches(app.prisma, id)
    return reply.send(branches)
  })

  // GET /api/v1/customer/vouchers/:id — voucher detail (no auth required)
  // Optional bearer token decoded (not verified) to derive isRedeemedThisCycle.
  app.get('/api/v1/customer/vouchers/:id', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const userId = optionalUserId(req)
    const voucher = await getCustomerVoucher(app.prisma, id, userId)
    return reply.send(voucher)
  })

  // GET /api/v1/customer/search — merchant search (no auth)
  // Requires q (text) or categoryId.
  app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
    const params = searchQuery.parse(req.query)
    if (!params.q && !params.categoryId) throw new AppError('SEARCH_QUERY_REQUIRED')
    const results = await searchMerchants(app.prisma, params)
    return reply.send(results)
  })

  // GET /api/v1/customer/categories — active categories with at least one active merchant (no auth)
  app.get('/api/v1/customer/categories', async (_req: FastifyRequest, reply) => {
    const categories = await listActiveCategories(app.prisma)
    return reply.send(categories)
  })

  // GET /api/v1/customer/campaigns — active campaigns with banner (no auth)
  app.get('/api/v1/customer/campaigns', async (_req: FastifyRequest, reply) => {
    const campaigns = await getActiveCampaigns(app.prisma)
    return reply.send(campaigns)
  })

  // GET /api/v1/customer/campaigns/:id/merchants — paginated merchants in a campaign (no auth)
  app.get('/api/v1/customer/campaigns/:id/merchants', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const query = z.object({
      categoryId: z.string().optional(),
      limit:  z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query)
    const result = await getCampaignMerchants(app.prisma, id, query)
    return reply.send(result)
  })
}
