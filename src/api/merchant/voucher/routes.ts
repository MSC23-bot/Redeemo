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

// M5 Task 12 — REUSABLE cooldownSeconds Zod ingress (spec §4.4):
//
//   Three-layer validation:
//     1. Zod (this file)        — outermost; REUSABLE-only + floor 1800.
//     2. Runtime clamp          — `effectiveCooldownSeconds()` at read.
//     3. DB CHECK constraints   — Task 1 defence-in-depth at persistence.
//
//   This Zod is the outermost shell — bad input gets a clean 400 +
//   VALIDATION_ERROR without reaching the service or runtime clamp.
const baseVoucherFields = {
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
  // M5 — REUSABLE cooldown. Floor 1800s (30min) enforced at the schema
  // level; the cross-field refine() below rejects non-null values on
  // non-REUSABLE types.
  cooldownSeconds: z.number().int().min(1800).nullable().optional(),
} as const

// Cross-field refine — only REUSABLE may carry a non-null cooldownSeconds.
// `data.cooldownSeconds == null` catches both `null` AND `undefined`
// (omitted) so non-REUSABLE vouchers that don't set the field stay valid.
const cooldownTypeRefine = (data: { type: string; cooldownSeconds?: number | null }) =>
  data.type === 'REUSABLE' || data.cooldownSeconds == null

const cooldownTypeRefineMessage = {
  message: 'cooldownSeconds may only be set on REUSABLE vouchers',
  path: ['cooldownSeconds'] as PropertyKey[],
}

const createVoucherSchema = z
  .object(baseVoucherFields)
  .refine(cooldownTypeRefine, cooldownTypeRefineMessage)

// PATCH allows partial bodies but must still enforce the type/cooldown
// coherence rule against whatever fields the merchant *did* supply.
// `.partial()` is applied to the base object (NOT the refined wrapper)
// then re-refined so the same cross-field check holds on partial updates.
const updateVoucherSchema = z
  .object(baseVoucherFields)
  .partial()
  .refine(
    // On partial updates `type` may be omitted; if it's missing, we only
    // reject when cooldownSeconds is explicitly present and non-null
    // (the service-side type check will catch the residual coherence
    // case once `effectiveType` is resolved). When `type` IS present,
    // apply the same refine as create.
    (data) =>
      data.type === undefined
        ? data.cooldownSeconds == null
        : data.type === 'REUSABLE' || data.cooldownSeconds == null,
    cooldownTypeRefineMessage,
  )

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
