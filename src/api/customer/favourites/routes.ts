import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  addFavouriteMerchant, removeFavouriteMerchant, listFavouriteMerchants,
  addFavouriteVoucher,  removeFavouriteVoucher,  listFavouriteVouchers,
  addFavouriteBranch,   removeFavouriteBranch,   listFavouriteBranches,
} from './service'

const merchantIdParam = z.object({ merchantId: z.string().min(1) })
const voucherIdParam  = z.object({ voucherId: z.string().min(1) })
const branchIdParam   = z.object({ branchId:  z.string().min(1) })
const paginationSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(20),
})

export async function favouritesRoutes(app: FastifyInstance) {
  const base = '/api/v1/customer/favourites'

  app.post(`${base}/merchants/:merchantId`, async (req: FastifyRequest, reply) => {
    const { merchantId } = merchantIdParam.parse(req.params)
    const result = await addFavouriteMerchant(app.prisma, req.user.sub, merchantId)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/merchants/:merchantId`, async (req: FastifyRequest, reply) => {
    const { merchantId } = merchantIdParam.parse(req.params)
    const result = await removeFavouriteMerchant(app.prisma, req.user.sub, merchantId)
    return reply.send(result)
  })

  app.get(`${base}/merchants`, async (req: FastifyRequest, reply) => {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await listFavouriteMerchants(app.prisma, req.user.sub, { page, limit })
    return reply.send(result)
  })

  app.post(`${base}/vouchers/:voucherId`, async (req: FastifyRequest, reply) => {
    const { voucherId } = voucherIdParam.parse(req.params)
    const result = await addFavouriteVoucher(app.prisma, req.user.sub, voucherId)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/vouchers/:voucherId`, async (req: FastifyRequest, reply) => {
    const { voucherId } = voucherIdParam.parse(req.params)
    const result = await removeFavouriteVoucher(app.prisma, req.user.sub, voucherId)
    return reply.send(result)
  })

  app.get(`${base}/vouchers`, async (req: FastifyRequest, reply) => {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await listFavouriteVouchers(app.prisma, req.user.sub, { page, limit })
    return reply.send(result)
  })

  // Phase 3C.1g — branch-level favourites.  Merchant-level routes above
  // remain live during the customer-app cut-over; the cleanup PR retires
  // them after v1 stabilises.

  app.post(`${base}/branches/:branchId`, async (req: FastifyRequest, reply) => {
    const { branchId } = branchIdParam.parse(req.params)
    const result = await addFavouriteBranch(app.prisma, req.user.sub, branchId)
    return reply.status(201).send(result)
  })

  app.delete(`${base}/branches/:branchId`, async (req: FastifyRequest, reply) => {
    const { branchId } = branchIdParam.parse(req.params)
    const result = await removeFavouriteBranch(app.prisma, req.user.sub, branchId)
    return reply.send(result)
  })

  app.get(`${base}/branches`, async (req: FastifyRequest, reply) => {
    const { page, limit } = paginationSchema.parse(req.query)
    const result = await listFavouriteBranches(app.prisma, req.user.sub, { page, limit })
    return reply.send(result)
  })
}
