import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  getHomeFeed, getCustomerMerchant, getCustomerMerchantBranches,
  getCustomerVoucher, searchMerchants, listActiveCategories,
  getActiveCampaigns, getCampaignMerchants, getCategoryMerchants,
  getInAreaMerchants,
} from './service'
import { getEligibleAmenitiesForSubcategory } from '../../lib/amenity'
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

  // GET /api/v1/customer/categories — locked discovery taxonomy (no auth, no params)
  // Top-levels always returned; subcategories filtered to ≥1 active UK merchant.
  app.get('/api/v1/customer/categories', async (_req, reply) => {
    const categories = await listActiveCategories(app.prisma)
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

  // GET /api/v1/customer/categories/:id/amenities — eligible amenities for a
  // category (top-level OR subcategory). Subcategory rules ∪ parent top-level
  // rules, filtered to Amenity.isActive=true, deduped, sorted by name.
  // Used by FilterSheet (Plan A — Discovery Surface Rebaseline). No auth.
  app.get('/api/v1/customer/categories/:id/amenities', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const amenities = await getEligibleAmenitiesForSubcategory(app.prisma, id)
    return reply.send({ amenities })
  })

  // GET /api/v1/customer/discovery/in-area — merchants whose active branches
  // intersect a viewport bbox. Map-specific endpoint. Bbox filter is applied
  // at the application level (post-rank) so tier counts reflect UK-wide
  // supply, not the viewport slice (Plan 1.5 invariant). Meta envelope is a
  // SUBSET of search/category meta — `scope` and `scopeExpanded` are dropped
  // because in-area has no scope cascade. No auth; bearer token decoded (not
  // verified) to extract userId for profile-city resolution.
  app.get('/api/v1/customer/discovery/in-area', async (req: FastifyRequest, reply) => {
    const query = z.object({
      minLat:     z.coerce.number().min(-90).max(90),
      maxLat:     z.coerce.number().min(-90).max(90),
      minLng:     z.coerce.number().min(-180).max(180),
      maxLng:     z.coerce.number().min(-180).max(180),
      categoryId: z.string().optional(),
      lat:        z.coerce.number().optional(),
      lng:        z.coerce.number().optional(),
      limit:      z.coerce.number().int().min(1).max(200).default(50),
    }).parse(req.query)
    if (query.minLat > query.maxLat || query.minLng > query.maxLng) {
      return reply.status(400).send({ error: { code: 'INVALID_BBOX', message: 'minLat/minLng must be ≤ maxLat/maxLng' } })
    }
    const userId = optionalUserId(req)
    const result = await getInAreaMerchants(app.prisma, {
      bbox:       { minLat: query.minLat, maxLat: query.maxLat, minLng: query.minLng, maxLng: query.maxLng },
      categoryId: query.categoryId,
      lat:        query.lat ?? null,
      lng:        query.lng ?? null,
      userId,
      limit:      query.limit,
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
