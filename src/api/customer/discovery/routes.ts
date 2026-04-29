import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  getHomeFeed, getCustomerMerchant, getCustomerMerchantBranches,
  getCustomerVoucher, searchMerchants, listActiveCategories,
  getActiveCampaigns, getCampaignMerchants, getCategoryMerchants,
} from './service'
import { optionalUserId } from '../plugin'

const idParam       = z.object({ id: z.string().min(1) })
const locationQuery = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
})
const searchQuery = z.object({
  q:               z.string().optional(),
  categoryId:      z.string().optional(),
  subcategoryId:   z.string().optional(),
  lat:             z.coerce.number().optional(),
  lng:             z.coerce.number().optional(),
  minLat:          z.coerce.number().optional(),
  maxLat:          z.coerce.number().optional(),
  minLng:          z.coerce.number().optional(),
  maxLng:          z.coerce.number().optional(),
  maxDistanceMiles: z.coerce.number().optional(),
  minSaving:       z.coerce.number().optional(),
  voucherTypes:    z.string().optional().transform(v => v ? v.split(',') : undefined),
  amenityIds:      z.string().optional().transform(v => v ? v.split(',') : undefined),
  tagIds:          z.string().optional().transform(v => v ? v.split(',') : undefined),
  scope:           z.enum(['nearby','city','region','platform']).optional(),
  openNow:         z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  featured:        z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  topRated:        z.enum(['true', 'false']).optional().transform(v => v === 'true' ? true : v === 'false' ? false : undefined),
  sortBy:          z.enum(['relevance', 'nearest', 'top_rated', 'highest_saving']).optional(),
  // NOTE: most_popular sort is NOT exposed — requires redemption count join; deferred to later phase
  limit:           z.coerce.number().int().min(1).max(50).default(20),
  offset:          z.coerce.number().int().min(0).default(0),
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
    const { lat, lng } = locationQuery.parse(req.query)
    const userId = optionalUserId(req)
    const merchant = await getCustomerMerchant(app.prisma, id, userId, { lat: lat ?? undefined, lng: lng ?? undefined })
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
  // Requires q (text), categoryId, subcategoryId, or bounding box (minLat/maxLat/minLng/maxLng).
  app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
    const params = searchQuery.parse(req.query)
    const userId = optionalUserId(req)
    const results = await searchMerchants(app.prisma, { ...params, userId })
    return reply.send(results)
  })

  // GET /api/v1/customer/categories — active categories with at least one active merchant (no auth)
  // Optional ?scope, ?lat, ?lng enable supply-aware filtering: when these
  // resolve to a city (per spec §4.6 fallback ladder), the response is
  // filtered to categories with supply in that city, and top-level rows
  // gain a chipsHidden boolean. Without these params, behaviour is
  // unchanged — flat list, no chipsHidden, no filter.
  app.get('/api/v1/customer/categories', async (req: FastifyRequest, reply) => {
    const query = z.object({
      scope: z.enum(['nearby','city','region','platform']).optional(),
      lat:   z.coerce.number().optional(),
      lng:   z.coerce.number().optional(),
    }).parse(req.query)
    const userId = optionalUserId(req)
    const categories = await listActiveCategories(app.prisma, {
      scope:  query.scope,
      lat:    query.lat ?? null,
      lng:    query.lng ?? null,
      userId,
    })
    return reply.send({ categories })
  })

  // GET /api/v1/customer/categories/:id/merchants — paginated merchants for a
  // single category id (top-level OR subcategory) with the same scope/meta
  // envelope used by /search. No auth; bearer token decoded (not verified) to
  // extract userId for profile-city resolution.
  app.get('/api/v1/customer/categories/:id/merchants', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const query = z.object({
      scope:  z.enum(['nearby','city','region','platform']).optional(),
      lat:    z.coerce.number().optional(),
      lng:    z.coerce.number().optional(),
      limit:  z.coerce.number().int().min(1).max(50).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query)
    const userId = optionalUserId(req)
    const result = await getCategoryMerchants(app.prisma, id, {
      scope:  query.scope,
      lat:    query.lat ?? null,
      lng:    query.lng ?? null,
      userId,
      limit:  query.limit,
      offset: query.offset,
    })
    return reply.send(result)
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
      lat:    z.coerce.number().optional(),
      lng:    z.coerce.number().optional(),
      limit:  z.coerce.number().int().min(1).max(100).default(20),
      offset: z.coerce.number().int().min(0).default(0),
    }).parse(req.query)
    const userId = optionalUserId(req)
    const result = await getCampaignMerchants(app.prisma, id, { ...query, userId })
    return reply.send(result)
  })
}
