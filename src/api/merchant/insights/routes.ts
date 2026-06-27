import { FastifyInstance, FastifyRequest } from 'fastify'
import { z } from 'zod'
import '../types'
import { resolveMerchantContext } from '../shared'
import { assertInsightsAccess, assertMerchantActive } from './scope'
import { behaviouralGateOpen } from './gate'
import type { MerchantVoucherType, InsightsFilters } from './service'
import {
  getOverview,
  getTrend,
  getVouchers,
  getBranches,
  getBusyTimes,
  getValidation,
  getRepeatRate,
  getNewVsReturning,
} from './service'
import {
  toOverviewResponse,
  toTrendResponse,
  toVouchersResponse,
  toBranchesResponse,
  toBusyTimesResponse,
  toValidationResponse,
  toCustomersResponse,
  exportNotAvailableResponse,
} from './format'

// Insights PR-A Task A7: the read-only aggregation routes (plan section 2.7).
//
// Every route runs the FRESH per-request authorization chain (no caching), in
// this exact order (plan section 2.4 / 2.7):
//   1. resolveMerchantContext(prisma, req.user.sub)  -> resolves merchantId +
//      role + branch scope from the SESSION (never a client merchantId); also
//      hard-throws MERCHANT_SUSPENDED for a suspended merchant.
//   2. assertMerchantActive(prisma, ctx.merchantId)  -> throws MERCHANT_NOT_ACTIVE
//      unless Merchant.status === 'ACTIVE' (blocks REGISTERED / PENDING_APPROVAL /
//      INACTIVE / DELETED server-side, not just UI-hidden).
//   3. assertInsightsAccess(ctx)                     -> throws INSUFFICIENT_PERMISSIONS
//      for STAFF.
// The scope is then resolved inside the service (effectiveScope -> insightsScope)
// so the merchant tenant boundary (branch.merchantId = ctx.merchantId) is ALWAYS
// in the WHERE and a cross-tenant / out-of-scope branchId resolves to an empty
// result, never an existence oracle.
//
// GATING (plan section 2.5): the BEHAVIOURAL paths self-gate in the service
// (getRepeatRate / getNewVsReturning return `{ available:false }` and run NO query
// when behaviouralGateOpen() is false). The /export.csv route additionally checks
// the gate at the route boundary. Operational endpoints are NEVER gated.

/**
 * The 7 merchant-facing voucher-type filter values (plan section 2.7). DISCOUNT is
 * the merchant-facing collapse of the two DB discount enum values; the service
 * maps it to {DISCOUNT_FIXED, DISCOUNT_PERCENT}.
 */
const VOUCHER_TYPE_VALUES = [
  'BOGO',
  'SPEND_AND_SAVE',
  'DISCOUNT',
  'FREEBIE',
  'PACKAGE_DEAL',
  'TIME_LIMITED',
  'REUSABLE',
] as const

// Server-side zod validation of the query filters. `period` defaults to
// 'this_month' (the prototype's default view). `from`/`to` are YYYY-MM and are
// only consumed for period='custom'. `branchId` / `voucherType` are optional.
const filterSchema = z
  .object({
    period: z.enum(['this_month', 'last_month', 'last_3m', 'last_6m', 'all', 'custom']).default('this_month'),
    from: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    to: z.string().regex(/^\d{4}-\d{2}$/).optional(),
    branchId: z.string().optional(),
    voucherType: z.enum(VOUCHER_TYPE_VALUES).optional(),
  })
  .refine((q) => q.period !== 'custom' || (q.from !== undefined && q.to !== undefined), {
    message: 'A custom period requires both a from and a to month (YYYY-MM).',
  })

type ParsedFilters = z.infer<typeof filterSchema>

/**
 * Map the parsed query into the service InsightsFilters. `now` is the REAL request
 * time (Date.now via `new Date()`), passed explicitly so the service does no
 * internal Date.now() side-channel (deterministic + testable). `custom` is only
 * populated for period='custom'.
 */
function toFilters(q: ParsedFilters): InsightsFilters {
  return {
    period: q.period,
    custom: q.period === 'custom' && q.from && q.to ? { from: q.from, to: q.to } : undefined,
    branchId: q.branchId,
    voucherType: q.voucherType as MerchantVoucherType | undefined,
    now: new Date(),
  }
}

export async function merchantInsightsRoutes(app: FastifyInstance) {
  const prefix = '/api/v1/merchant/insights'

  /**
   * The FRESH per-request authorization chain, run at the top of EVERY route. No
   * value is cached across requests, so a membership / branch-scope / merchant-
   * status change between two requests takes effect immediately. Returns the
   * resolved context for the route to build filters from.
   */
  async function authorize(req: FastifyRequest) {
    const ctx = await resolveMerchantContext(app.prisma, req.user.sub)
    await assertMerchantActive(app.prisma, ctx.merchantId)
    assertInsightsAccess(ctx)
    return ctx
  }

  // GET /overview - operational KPIs (each with its own comparison) MERGED with
  // the behavioural, gated repeatRate. getRepeatRate self-gates: with the gate
  // closed it returns `{ available:false }` and runs no query, so the operational
  // KPIs + their comparisons return regardless of gate state.
  app.get(`${prefix}/overview`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const [operational, repeatRate] = await Promise.all([
      getOverview(app.prisma, ctx, filters),
      getRepeatRate(app.prisma, ctx, filters),
    ])
    return reply.send(toOverviewResponse(operational, repeatRate))
  })

  // GET /trend - operational monthly series (logged + confirmed bucketed by
  // redeemedAt in Europe/London).
  app.get(`${prefix}/trend`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const result = await getTrend(app.prisma, ctx, filters)
    return reply.send(toTrendResponse(result))
  })

  // GET /vouchers - operational per-voucher ranking + 7-type share.
  app.get(`${prefix}/vouchers`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const result = await getVouchers(app.prisma, ctx, filters)
    return reply.send(toVouchersResponse(result))
  })

  // GET /branches - operational per-branch ranking (SCOPED; never leaks a sibling
  // branch outside the caller's allowed set).
  app.get(`${prefix}/branches`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const result = await getBranches(app.prisma, ctx, filters)
    return reply.send(toBranchesResponse(result))
  })

  // GET /validation - operational logged/confirmed/awaiting + completionRate
  // (0..1 fraction) + adaptive methods breakdown.
  app.get(`${prefix}/validation`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const result = await getValidation(app.prisma, ctx, filters)
    return reply.send(toValidationResponse(result))
  })

  // GET /busy-times - operational, PRIVACY-MODE-AWARE. The service owns the mode:
  // the default payload is `{ mode:'intensity', grid, busiest }` with NO raw count
  // and NO raw peak; the route serialises it verbatim and never upgrades to exact.
  app.get(`${prefix}/busy-times`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const result = await getBusyTimes(app.prisma, ctx, filters)
    return reply.send(toBusyTimesResponse(result))
  })

  // GET /customers - BEHAVIOURAL + GATED. new-vs-returning + repeat-rate both
  // self-gate in the service: with the gate closed each returns `{ available:false }`
  // and runs NO query, so a closed gate never reads real customer history.
  app.get(`${prefix}/customers`, async (req: FastifyRequest, reply) => {
    const ctx = await authorize(req)
    const filters = toFilters(filterSchema.parse(req.query))
    const [newVsReturning, repeatRate] = await Promise.all([
      getNewVsReturning(app.prisma, ctx, filters),
      getRepeatRate(app.prisma, ctx, filters),
    ])
    return reply.send(toCustomersResponse(newVsReturning, repeatRate))
  })

  // GET /export.csv - EVENT-LEVEL + GATED. This task (A7) wires the gate boundary
  // + the authz chain; Task A8 implements the OPEN path (getInsightsExport +
  // insightsRowsToCsv + a text/csv response). The authz chain runs FIRST (a
  // STAFF / non-active / suspended caller is rejected before the gate check), so
  // the gate is never an authz bypass.
  //
  // GATE CLOSED (the default, and the only reachable path until A8): a typed
  // not-available JSON payload `{ available:false }` and NO behavioural / event-
  // level query runs.
  //
  // TODO(A8): replace the gate-OPEN branch below with:
  //   const filters = toFilters(filterSchema.parse(req.query))
  //   const { rows, truncated } = await getInsightsExport(app.prisma, ctx, filters)
  //   const csv = insightsRowsToCsv(rows, truncated)
  //   reply.header('Content-Type', 'text/csv; charset=utf-8')
  //   reply.header('Content-Disposition', 'attachment; filename="insights-redemptions.csv"')
  //   return reply.send(csv)
  app.get(`${prefix}/export.csv`, async (req: FastifyRequest, reply) => {
    await authorize(req)
    // Validate the filters even on the gated path so a malformed request is a 400
    // (and the open path A8 adds inherits the same validated shape).
    filterSchema.parse(req.query)
    if (!behaviouralGateOpen()) {
      return reply.send(exportNotAvailableResponse())
    }
    // A8 wires the open path. Until then, the open path is also not-available so
    // the route never returns an unguarded event-level body.
    return reply.send(exportNotAvailableResponse())
  })
}
