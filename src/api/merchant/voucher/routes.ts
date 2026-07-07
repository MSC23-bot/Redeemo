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
  createFlagshipRmvVoucher,
  updateRmvVoucher,
  submitRmvVoucher,
} from './service'
import { getVoucherAnalytics } from './analytics'

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
  // Nullable-clear contract (spec 2026-07-05, owner-approved D1): explicit null
  // CLEARS the saved value on PATCH; omission preserves; a valid value replaces;
  // an invalid non-null still 400s (nullable widens the domain, never the
  // format check). On CREATE, null is defined as identical to omission. The two
  // fields are evaluated independently - never couple their checks.
  imageUrl: z.string().url().nullable().optional(),
  expiryDate: z.string().datetime().nullable().optional(),
  // M4a-7: TIME_LIMITED availability windows (validated at service layer for
  // 24:00-sentinel-openTime / closeTime<=openTime / per-day overlap /
  // type-attachment per spec §3.2).
  availabilityWindows: z.array(availabilityWindowSchema).optional(),
  // M5 — REUSABLE cooldown. Floor 1800s (30min) enforced at the schema
  // level; the cross-field refine() below rejects non-null values on
  // non-REUSABLE types.
  cooldownSeconds: z.number().int().min(1800).nullable().optional(),
  // Day-2 Vouchers A3 — an opaque merchant-authored bag (askHelp + builder
  // draft state; later the concierge adminProposed is written admin-side). Stored
  // in the existing Voucher.merchantFields Json? column. This is the ONLY way the
  // bag can be set from a merchant request; status/approvalStatus/isRmv/merchantId
  // are server-set and are NOT in this base shape, so Zod strips them.
  merchantFields: z.record(z.string(), z.unknown()).optional(),
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

// PATCH allows partial bodies. Field-level Zod validation (floor 1800s,
// integer, nullable) still applies via the base shape. The cross-field
// "non-null cooldownSeconds requires REUSABLE type" rule moved to the
// service layer (PR #72 pre-merge review fix Finding 2, 2026-05-12) —
// Zod cannot cleanly enforce that on a partial PATCH because the
// EXISTING voucher's type isn't in the Zod input. Without DB context,
// a refine that rejects "non-null cooldownSeconds when type is omitted"
// also rejected the valid case `PATCH { cooldownSeconds: 7200 }` on an
// existing REUSABLE voucher — forcing merchants to also send
// `type: 'REUSABLE'` in the payload. The service-layer check (in
// `updateVoucher`) reads the existing voucher and resolves
// effectiveType = data.type ?? existing.type, then rejects the
// incoherent combination with COOLDOWN_REUSABLE_ONLY (400).
//
// The three-layer validation contract is preserved:
//   1. Zod (this file)        — field-level (floor 1800, integer, nullable).
//                              On create the cross-field refine still
//                              runs (createVoucherSchema above).
//   2. Service layer          — cross-field check on PATCH against
//                              existing voucher type.
//   3. Runtime clamp + DB CHECK — Tasks 2 and 1 defence-in-depth.
const updateVoucherSchema = z
  .object(baseVoucherFields)
  .partial()

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

  // Slice E: per-voucher analytics (read-only). Authed under the same merchant
  // session as the rest of the module; the service verifies the voucher belongs to
  // the caller's merchant (VOUCHER_NOT_FOUND on a cross-tenant / missing id) and
  // aggregates over the eligible, cleanliness-filtered VoucherRedemption rows. Placed
  // before the generic PATCH `:id` so its static `/analytics` suffix is unambiguous.
  app.get(`${prefix}/:id/analytics`, async (req: FastifyRequest, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params)
    return reply.send(await getVoucherAnalytics(app.prisma, req.user.sub, id))
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

  // M2 B3 (D2/D3): create one flagship RMV of a merchant-chosen eligible type. The
  // body carries the full VoucherType enum so an ineligible type (TIME_LIMITED /
  // REUSABLE) reaches the service and is rejected with the clear
  // VOUCHER_TYPE_NOT_ELIGIBLE (400) rather than a generic Zod validation error.
  const createFlagshipSchema = z.object({ voucherType: VoucherTypeEnum })

  app.post(`${rmvPrefix}/create-flagship`, async (req: FastifyRequest, reply) => {
    const { voucherType } = createFlagshipSchema.parse(req.body)
    const voucher = await createFlagshipRmvVoucher(app.prisma, req.user.sub, voucherType, {
      ipAddress: req.ip, userAgent: req.headers['user-agent'] ?? '',
    })
    return reply.status(201).send(voucher)
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
