import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import {
  addFavouriteMerchant, removeFavouriteMerchant, listFavouriteMerchants,
  addFavouriteVoucher,  removeFavouriteVoucher,  listFavouriteVouchers,
} from './service'

const merchantIdParam = z.object({ merchantId: z.string().min(1) })
const voucherIdParam  = z.object({ voucherId: z.string().min(1) })

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
    const result = await listFavouriteMerchants(app.prisma, req.user.sub)
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
    const result = await listFavouriteVouchers(app.prisma, req.user.sub)
    return reply.send(result)
  })
}
