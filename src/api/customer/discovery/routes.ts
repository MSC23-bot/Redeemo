import { FastifyInstance } from 'fastify'
import { z } from 'zod'
import { optionalUserId } from '../plugin'
import {
  getHomeFeed,
  getCustomerMerchant,
  getMerchantBranches,
  getCustomerVoucher,
  searchMerchants,
  listCategories,
  getCampaign,
} from './service'

const locationQuery = z.object({
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
})

const searchQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  lat: z.coerce.number().optional(),
  lng: z.coerce.number().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  offset: z.coerce.number().int().min(0).default(0),
})

export async function discoveryRoutes(app: FastifyInstance) {
  // GET /api/v1/customer/home — home feed
  app.get('/api/v1/customer/home', async (req) => {
    const { lat, lng } = locationQuery.parse(req.query)
    return getHomeFeed(app.prisma, lat, lng)
  })

  // GET /api/v1/customer/merchants/:id — merchant detail (optional auth)
  app.get('/api/v1/customer/merchants/:id', async (req) => {
    const { id } = req.params as { id: string }
    const userId = optionalUserId(req)
    return getCustomerMerchant(app.prisma, id, userId)
  })

  // GET /api/v1/customer/merchants/:id/branches — branch list
  app.get('/api/v1/customer/merchants/:id/branches', async (req) => {
    const { id } = req.params as { id: string }
    return getMerchantBranches(app.prisma, id)
  })

  // GET /api/v1/customer/vouchers/:id — voucher detail (optional auth)
  app.get('/api/v1/customer/vouchers/:id', async (req) => {
    const { id } = req.params as { id: string }
    const userId = optionalUserId(req)
    return getCustomerVoucher(app.prisma, id, userId)
  })

  // GET /api/v1/customer/search — search merchants
  app.get('/api/v1/customer/search', async (req) => {
    const { q, category, lat, lng, limit, offset } = searchQuery.parse(req.query)
    return searchMerchants(app.prisma, q, category, lat, lng, limit, offset)
  })

  // GET /api/v1/customer/categories — list categories
  app.get('/api/v1/customer/categories', async () => {
    return listCategories(app.prisma)
  })

  // GET /api/v1/customer/campaigns/:id — campaign detail
  app.get('/api/v1/customer/campaigns/:id', async (req) => {
    const { id } = req.params as { id: string }
    return getCampaign(app.prisma, id)
  })
}
