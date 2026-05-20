import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  getHomeFeed, getCustomerMerchant, getCustomerMerchantBranches,
  getCustomerVoucher, searchMerchants, searchBranches,
  listActiveCategories, getActiveCampaigns,
  getCampaignMerchants, getCampaignBranches,
  getCategoryMerchants, getCategoryBranches,
  getInAreaMerchants, getInAreaBranches,
} from './service'
import { getEligibleAmenitiesForSubcategory } from '../../lib/amenity'
import { optionalUserId } from '../plugin'

const idParam       = z.object({ id: z.string().min(1) })
const locationQuery = z.object({
  lat:    z.coerce.number().optional(),
  lng:    z.coerce.number().optional(),
  branch: z.string().optional(),   // optional branchId for selectedBranch resolution
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
  // Optional ?branch=<id> forwarded to selectedBranch resolution (P1.3).
  app.get('/api/v1/customer/merchants/:id', async (req: FastifyRequest, reply) => {
    const { id } = idParam.parse(req.params)
    const { lat, lng, branch } = locationQuery.parse(req.query)
    const userId = optionalUserId(req)
    const merchant = await getCustomerMerchant(app.prisma, id, userId, {
      lat: lat ?? undefined,
      lng: lng ?? undefined,
      branchId: branch,
    })
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
  //
  // Discovery Rebaseline Phase 1 Task 1.10 — attaches the new branch-themed
  // `branches` + `totalBranches` fields additively alongside the legacy
  // `merchants` + `total` response. Customer-app continues reading legacy
  // until Phase 2 surface PRs migrate consumers individually.
  //
  // Phase 1 ignored-params disclosure (mirrors searchBranches docblock at
  // service.ts ~line 2440-2470): Task 2.1.0 (Plan Rev 1.2 PR-2 entry gate)
  // closed `scope` parity, so the user-facing scope cascade now cuts branch
  // results identically to the merchant variant. The remaining seven ignored
  // params (`maxDistanceMiles`, `amenityIds`, `tagIds`, `openNow`, `featured`,
  // `topRated`, `sortBy`) stay deferred under deferred-followups §BX.1-§BX.7
  // for Phase 2/3. They pass through here so the merchant variant honours
  // them and the branch variant accepts-and-no-ops — keeps callers' query
  // strings portable as more params get honoured incrementally.
  //
  // PR-2 gate (Spec/Plan): Search customer-app migration `scope` parity is
  // now satisfied (Task 2.1.0). UI flip from `merchants` to `branches` is
  // eligible without breaking the user-facing scope filter. Other filter
  // parity is tracked explicitly in the Phase 1.5 plan amendment +
  // deferred-followups §BX index.
  app.get('/api/v1/customer/search', async (req: FastifyRequest, reply) => {
    const params = searchQuery.parse(req.query)
    const userId = optionalUserId(req)
    const [merchantResult, branchResult] = await Promise.all([
      searchMerchants(app.prisma, { ...params, userId }),
      searchBranches(app.prisma, { ...params, userId }),
    ])
    // PR-2 device-QA fix (2026-05-19) — emit `branchMeta` as a separate
    // field alongside the legacy `...merchantResult` spread so consumers
    // reading `branches[]` can also read branch-aligned counts +
    // emptyStateReason + resolvedArea WITHOUT picking up the legacy
    // merchant meta (which would mismatch — owner observed scope pills
    // claiming results while the branch list was empty).  Legacy `meta`
    // continues to ship for callers still on the merchant arm.
    return reply.send({
      ...merchantResult,
      branches:      branchResult.branches,
      totalBranches: branchResult.totalBranches,
      branchMeta:    branchResult.meta,
    })
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
    // Discovery Rebaseline Phase 1 Task 1.10 — attaches the new branch-themed
    // `branches` + `totalBranches` fields additively alongside the legacy
    // `merchants` + `total` response. Consumers continue reading legacy until
    // Phase 2 surface PRs migrate individually.
    const [merchantResult, branchResult] = await Promise.all([
      getCategoryMerchants(app.prisma, id, {
        scope:  query.scope,
        lat:    query.lat ?? null,
        lng:    query.lng ?? null,
        userId,
        limit:  query.limit,
        offset: query.offset,
      }),
      getCategoryBranches(app.prisma, {
        categoryId: id,
        lat:        query.lat ?? null,
        lng:        query.lng ?? null,
        userId,
        limit:      query.limit,
        offset:     query.offset,
      }),
    ])
    return reply.send({
      ...merchantResult,
      branches:      branchResult.branches,
      totalBranches: branchResult.totalBranches,
    })
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
    // Discovery Rebaseline Phase 1 Task 1.10 — attaches the new branch-themed
    // `branches` field additively alongside the legacy `merchants` field.
    // In-area has no `totalBranches` (no pagination — Map shows all pins in
    // the viewport up to `limit`). Consumers continue reading legacy until
    // Phase 2 surface PRs migrate individually.
    const bbox = { minLat: query.minLat, maxLat: query.maxLat, minLng: query.minLng, maxLng: query.maxLng }
    const [merchantResult, branchResult] = await Promise.all([
      getInAreaMerchants(app.prisma, {
        bbox,
        categoryId: query.categoryId,
        lat:        query.lat ?? null,
        lng:        query.lng ?? null,
        userId,
        limit:      query.limit,
      }),
      getInAreaBranches(app.prisma, {
        bbox,
        categoryId: query.categoryId,
        lat:        query.lat ?? null,
        lng:        query.lng ?? null,
        userId,
        limit:      query.limit,
      }),
    ])
    return reply.send({
      ...merchantResult,
      branches: branchResult.branches,
    })
  })

  // GET /api/v1/customer/campaigns — active campaigns with banner (no auth)
  app.get('/api/v1/customer/campaigns', async (_req: FastifyRequest, reply) => {
    const campaigns = await getActiveCampaigns(app.prisma)
    return reply.send(campaigns)
  })

  // GET /api/v1/customer/campaigns/:id/merchants — paginated merchants in a campaign (no auth)
  //
  // Discovery Rebaseline Phase 1 — attaches branch-themed `branches` +
  // `totalBranches` fields additively alongside `merchants` + `total`.
  // `getCampaignMerchants` returns `{ merchants, total }` where `total` is
  // the TRUE matching count (pre-pagination); `getCampaignBranches.total`
  // is the post-fan-out branch count which we re-key as `totalBranches` on
  // the response to avoid collision with the merchant `total` field.
  // Customer-app does NOT consume this endpoint today (verified zero
  // grep hits); customer-web's existing type at `apps/customer-web/lib/api.ts:233`
  // expects `{ merchants, total }` — that contract is honoured truthfully
  // here (`total` is now matching-count, not page-size, per PR-110 review fix).
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
    const [merchantResult, branchResult] = await Promise.all([
      getCampaignMerchants(app.prisma, id, { ...query, userId }),
      getCampaignBranches(app.prisma, id, { ...query, userId }),
    ])
    return reply.send({
      merchants:     merchantResult.merchants,
      total:         merchantResult.total,
      branches:      branchResult.branches,
      totalBranches: branchResult.total,
    })
  })
}
