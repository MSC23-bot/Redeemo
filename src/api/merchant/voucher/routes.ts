import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import {
  listVouchers,
  getVoucher,
  createVoucher,
  updateVoucher,
  submitVoucher,
  deleteVoucher,
  listRmvVouchers,
  updateRmvVoucher,
  submitRmvVoucher,
} from './service'

const VoucherTypeEnum = z.enum([
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT_FIXED',
  'DISCOUNT_PERCENT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
])

const availabilityWindowSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  openTime:  z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'openTime must be HH:mm in [00:00, 23:59]'),
  closeTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$|^24:00$/, 'closeTime must be HH:mm in [00:01, 23:59] OR "24:00"'),
})

const createVoucherSchema = z.object({
  type: VoucherTypeEnum,
  title: z.string().min(1).max(200),
  estimatedSaving: z.number().positive(),
  description: z.string().max(2000).optional(),
  terms: z.string().max(2000).optional(),
  imageUrl: z.string().url().optional(),
  expiryDate: z.string().datetime().optional(),
  // M4a-7: TIME_LIMITED availability windows (validated at service layer for
  // 24:00-sentinel-openTime / closeTime<=openTime / per-day overlap /
  // type-attachment per spec §3.2).
  availabilityWindows: z.array(availabilityWindowSchema).optional(),
})

const updateVoucherSchema = createVoucherSchema.partial()

export async function voucherRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/vouchers'

  app.get(prefix, async (req: FastifyRequest, reply) => {
    return reply.send(await listVouchers(app.prisma, req.user.sub))
  })

  app.post(prefix, async (req: FastifyRequest, reply) => {
    const body = createVoucherSchema.parse(req.body)
    const voucher = await createVoucher(app.prisma, req.user.sub, body, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(voucher)
  })

  app.get(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return reply.send(await getVoucher(app.prisma, req.user.sub, id))
  })

  app.patch(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const body = updateVoucherSchema.parse(req.body)
    return reply.send(
      await updateVoucher(app.prisma, req.user.sub, id, body, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? '',
      })
    )
  })

  app.post(`${prefix}/:id/submit`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return reply.send(
      await submitVoucher(app.prisma, req.user.sub, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? '',
      })
    )
  })

  app.delete(`${prefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return reply.send(
      await deleteVoucher(app.prisma, req.user.sub, id, {
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'] ?? '',
      })
    )
  })

  // ─── RMV routes ───────────────────────────────────────────────────────────
  const rmvPrefix = `${prefix}/rmv`

  app.get(rmvPrefix, async (req: FastifyRequest, reply) => {
    return reply.send(await listRmvVouchers(app.prisma, req.user.sub))
  })

  app.patch(`${rmvPrefix}/:id`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    const body = z.record(z.string(), z.unknown()).parse(req.body)
    return reply.send(await updateRmvVoucher(app.prisma, req.user.sub, id, body, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })

  app.post(`${rmvPrefix}/:id/submit`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return reply.send(await submitRmvVoucher(app.prisma, req.user.sub, id, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    }))
  })
}
